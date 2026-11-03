// MIDLANE audio — procedural music: a 16th-note step sequencer scheduled ahead on the
// AudioContext clock, plus the track definitions.
//
// A track is data: tempo, key, channel mix, instrument presets, melodies and song
// sections (bars, chord progression, drum/bass/arp patterns per intensity tier). The
// sequencer walks `order`, looping back to `loop`, so every track cycles through
// intro/A/B/A2/breakdown style sections instead of repeating one loop.
//
// Pattern strings are 16 steps (spaces ignored). A pattern may be an array of up to 3
// strings, picked by intensity tier (0: I<.34, 1: <.67, 2: >=.67), latched per bar.
//   drums: x = hit, o = soft/open (hats), X = accent, - = soft (hats), . = rest
//   bass:  R root, O root+8va, 5 fifth, 3 third, 7 seventh, b fifth below, - tie, . rest
//   arp:   digit = index into the chord voicing (+ the same tones an octave up)
import { Voice, rng, mtof } from './dsp.js';
import * as I from './instruments.js';

// ---- helpers ---------------------------------------------------------------------------
const DEG = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
export function parseChord(sym) {
  const m = /^([b#]?)([ivIV]+)(o)?(M7|7|sus2|sus4|add9)?$/.exec(sym);
  const d = m && DEG[m[2].toUpperCase()];
  if (d === undefined) throw new Error('[audio] bad chord ' + sym);
  const root = (d + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0) + 12) % 12;
  let iv = m[2] === m[2].toLowerCase() ? [0, 3, 7] : [0, 4, 7];
  if (m[3] === 'o') iv = [0, 3, 6];
  if (m[4] === '7') iv.push(10);
  else if (m[4] === 'M7') iv.push(11);
  else if (m[4] === 'sus2') iv[1] = 2;
  else if (m[4] === 'sus4') iv[1] = 5;
  else if (m[4] === 'add9') iv.push(14);
  return { root, iv };
}
const pat = (s) => (s.replace(/\s+/g, '') + '................').slice(0, 16);
const tiers = (p) => (p == null ? null : (Array.isArray(p) ? p : [p]).map(pat));

// melody phrase: each bar is a list of [semitone|null, steps] that must fill 16 steps
function phr(...bars) {
  const out = [];
  bars.forEach((bar, bi) => {
    let st = 0;
    for (const [n, len] of bar) { if (n !== null) out.push([bi * 16 + st, n, len]); st += len; }
    if (st !== 16) console.warn('[audio] melody bar', bi, 'has', st, 'steps');
  });
  return out;
}

const brassN = (v, at, m, dur, vel, p) => I.brass(v, at, Array.isArray(m) ? m : [m], dur, vel, p);
const INST = { lead: I.lead, pluck: I.pluck, glass: I.glass, bell: I.bellN, pad: I.pad, choir: I.choir, brass: brassN };
const HATV = { x: 0.75, X: 1, '-': 0.4, o: 0.7 };
const FILL = {
  1: { s: pat('.... .... x.x. xxxx') },
  2: { s: pat('xxxx xxxx xxxx xxxx'), k: pat('x... .... .... ....') },
};
// channel: [level, reverb send, delay send]
const DEFAULT_CH = {
  kick: [0.8], snare: [0.5, 0.2], hat: [0.18], perc: [0.3, 0.2], bass: [0.45], pad: [0.2, 0.35],
  arp: [0.12, 0.15, 0.2], lead: [0.22, 0.2, 0.15], bell: [0.22, 0.4, 0.2], hype: [0.1, 0.15, 0.2],
};

// ---- sequencer -------------------------------------------------------------------------
export class Track {
  constructor(eng, id, def, opt = {}) {
    const c = eng.ctx;
    this.eng = eng; this.ctx = c; this.id = id; this.def = def;
    this.rnd = rng(opt.seed ?? 4242);
    this.sd = 60 / def.bpm / 4;
    this.bd = this.sd * 16;
    this.swing = def.swing || 0;
    this.nodes = [];
    const G = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); this.nodes.push(g); return g; };
    const LP = (to) => { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5; f.connect(to); this.nodes.push(f); return f; };
    this.out = G(0, eng._musicIn);
    this.wout = G(0, eng._musicWetIn);
    this.lp = LP(G(def.trim ?? 1, this.out));
    this.wlp = LP(G(def.trim ?? 1, this.wout));
    // tempo-synced feedback delay (dotted 8th by default), darkened in the loop
    const dl = c.createDelay(2), dlp = c.createBiquadFilter();
    dl.delayTime.value = Math.min(1.9, ((def.dly ?? 0.75) * 60) / def.bpm);
    dlp.type = 'lowpass'; dlp.frequency.value = 3200;
    this.nodes.push(dl, dlp);
    dl.connect(dlp); dlp.connect(G(def.fb ?? 0.3, dl)); dlp.connect(this.lp); dlp.connect(G(0.3, this.wlp));
    this.ch = {};
    for (const [name, [lvl, rev = 0, dly = 0]] of Object.entries({ ...DEFAULT_CH, ...def.ch })) {
      const inp = G(lvl, this.lp);
      if (rev) inp.connect(G(rev, this.wlp));
      if (dly) inp.connect(G(dly, dl));
      this.ch[name] = inp;
    }
    this.secs = {};
    for (const [k, s] of Object.entries(def.sec)) {
      this.secs[k] = { ...s, chords: s.ch.trim().split(/\s+/).map(parseChord), cb: s.cb || 1, k: tiers(s.k), s: tiers(s.s), h: tiers(s.h), c: tiers(s.c), b: tiers(s.b), a: tiers(s.a) };
    }
    this.mels = {};
    for (const [k, m] of Object.entries(def.mels || {})) {
      const src = m.src ? def.mels[m.src] : m, map = new Map();
      for (const [st, n, len] of src.n) { if (!map.has(st)) map.set(st, []); map.get(st).push([n, len]); }
      this.mels[k] = { map, bars: src.bars, root: m.root, inst: INST[m.inst || 'lead'], ch: m.ch || 'lead', vel: m.vel ?? 0.9, gate: m.gate ?? 0.92, p: m.p || {} };
    }
    this.order = def.order;
    this.loop = def.loop ?? 0;
    this.oi = Math.max(0, opt.section ? this.order.indexOf(opt.section) : 0);
    this.S = this.secs[this.order[this.oi]];
    this.sb = -1; this.n = 0; this.tier = 1; this.chord = this.S.chords[0]; this.arp = [];
    this.stopAt = null; this.done = false;
    this.setI(eng._I, c.currentTime, true);
  }

  get sec() { return this.order[this.oi]; }

  setI(x, now, imm) {
    const [lo, hi] = this.def.filt || [1100, 18000];
    const f = lo * Math.pow(hi / lo, Math.min(1, Math.max(0, x / 0.7)));
    for (const p of [this.lp.frequency, this.wlp.frequency]) {
      if (imm) p.value = f; else p.setTargetAtTime(f, now, 0.35);
    }
  }

  start(t, fade) {
    this.g = t; this.next = t;
    for (const p of [this.out.gain, this.wout.gain]) { p.setValueAtTime(0, t); p.linearRampToValueAtTime(1, t + Math.max(0.01, fade)); }
  }

  fadeOut(now, fade) {
    const f = Math.max(0.02, fade);
    for (const p of [this.out.gain, this.wout.gain]) {
      const v = p.value;
      p.cancelScheduledValues(now); p.setValueAtTime(v, now); p.linearRampToValueAtTime(0, now + f);
    }
    this.stopAt = now + f;
  }

  // if the scheduler stalled (tab throttled, long GC), skip ahead instead of bursting
  resync(now) {
    if (this.next < now - 0.02) { this.g = now + 0.03; this.next = this.g; }
  }

  pump(until) {
    while (!this.done && this.next < until) {
      if (this.stopAt != null && this.next >= this.stopAt) { this.done = true; break; }
      this.tick(this.next);
      this.n++;
      this.g += this.sd;
      this.next = this.g + ((this.n & 1) ? this.swing * this.sd : 0);
    }
  }

  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch (_) { /* gone */ } }
    this.nodes.length = 0;
  }

  // ---- helpers for track hooks ----
  play(ch, fn, t, ...a) {
    const v = new Voice(this.ctx, t, this.ch[ch] || this.ch.perc, 1, this.rnd);
    fn(v, 0, ...a);
    v.done();
  }
  voicing(lo, ch = this.chord) {
    const k = this.def.key;
    return ch.iv.map((i) => lo + ((((k + ch.root + i) % 12) - lo) % 12 + 12) % 12).sort((a, b) => a - b);
  }
  rootNote(lo) { return lo + ((((this.def.key + this.chord.root) % 12) - lo) % 12 + 12) % 12; }

  bar(t) {
    this.sb++;
    if (this.sb >= this.S.bars) {
      this.oi++;
      if (this.oi >= this.order.length) this.oi = this.loop;
      this.S = this.secs[this.order[this.oi]];
      this.sb = 0;
    }
    const S = this.S, d = this.def, x = this.eng._I;
    this.tier = x < 0.34 ? 0 : x < 0.67 ? 1 : 2;
    this.chord = S.chords[Math.floor(this.sb / S.cb) % S.chords.length];
    if (d.arp) { const v = this.voicing(d.arp.lo); this.arp = v.concat(v.map((m) => m + 12)); }
    if (S.pad && this.sb % S.cb === 0) this.play('pad', I.pad, t, this.voicing(d.pad.lo), S.cb * this.bd, 1, d.pad);
    if (this.sb === 0 && S.crash !== 0 && S.k && this.tier >= 1) this.play('perc', I.crash, t, d.crashVel ?? 0.8);
    if (S.fill === 2 && this.sb === S.bars - 1) this.play('perc', I.riser, t, this.bd, 0.8);
    if (d.bar) d.bar(this, t);
  }

  tick(t) {
    const s = this.n & 15;
    if (s === 0) this.bar(t);
    const S = this.S, d = this.def, tr = this.tier, kit = d.kit || {};
    const F = S.fill && this.sb === S.bars - 1 ? FILL[S.fill] : null;
    const at = (p) => (p ? p[Math.min(tr, p.length - 1)][s] : '.');
    // kick
    let c = F && F.k ? F.k[s] : at(S.k);
    if (c === 'x' || c === 'o') this.play('kick', I.kick, t, c === 'x' ? 1 : 0.6, kit.kick);
    // snare (fills crescendo; optional tom run at the end of a fill)
    c = F ? F.s[s] : at(S.s);
    if (c !== '.') {
      const vel = F ? 0.35 + 0.65 * (s / 15) : c === 'o' ? 0.3 : 1;
      if (F && kit.toms && S.fill === 1 && s >= 12) this.play('perc', I.tom, t, 0.9, kit.toms[s - 12]);
      else {
        const ty = kit.snareType || 'snare';
        if (ty !== 'clap') this.play('snare', I.snare, t, vel, kit.snare);
        if (ty !== 'snare') this.play('snare', I.clap, t, vel * 0.85, kit.clap);
      }
    }
    // hats
    c = at(S.h);
    if (c !== '.' && !(F && S.fill === 2)) this.play('hat', I.hat, t, HATV[c] ?? 0.7, c === 'o', kit.hat);
    // bass
    if (S.b) {
      c = at(S.b);
      if (c !== '.' && c !== '-') {
        const p = S.b[Math.min(tr, S.b.length - 1)];
        let len = 1;
        while (s + len < 16 && p[s + len] === '-') len++;
        const r = this.rootNote(d.bass.lo);
        const m = c === 'O' ? r + 12 : c === '5' ? r + 7 : c === '3' ? r + this.chord.iv[1] : c === '7' ? r + (this.chord.iv[3] ?? 10) : c === 'b' ? r - 5 : r;
        const dur = len > 1 ? len * this.sd - 0.02 : this.sd * (d.bass.gate ?? 0.75);
        this.play('bass', I.bass, t, m, dur, (s & 3) === 0 ? 1 : 0.85, d.bass);
      }
    }
    // arpeggio
    if (S.a && this.arp.length) {
      c = at(S.a);
      if (c >= '0' && c <= '9') this.play('arp', INST[d.arp.inst || 'pluck'], t, this.arp[+c % this.arp.length], this.sd * 0.9, (s & 3) === 0 ? 1 : 0.8, d.arp);
    }
    // melodies
    if (S.mel) {
      for (const id of S.mel) {
        const M = this.mels[id], ev = M && M.map.get((this.sb % M.bars) * 16 + s);
        if (ev) for (const [n, len] of ev) this.play(M.ch, M.inst, t, M.root + n, len * this.sd * M.gate, M.vel, M.p);
      }
    }
    if (d.step) d.step(this, t, s);
    if (d.hype && S.hype !== 0 && tr >= (S.hype === 2 ? 1 : 2)) d.hype(this, t, s);
  }
}

// ---- tracks ----------------------------------------------------------------------------
// stage_river — heroic D minor, 140 bpm
const RK = ['x... .... x... ....', 'x... .... x.x. ....', 'x... ..x. x.x. ...x'];
const RS = ['.... x... .... x...', '.... x... .... x...', '.... x... .... x..o'];
const RH = ['..x. ..x. ..x. ..x.', 'x-x- x-x- x-x- x-xo', 'X-x- X-x- X-x- X-xo'];
const RB = ['R... .... R... ....', 'R.R. O.R. R.R. O.R.', 'R.RR O.RR R.RR O.RO'];
const RA = ['0.2. 1.3. 0.2. 1.3.', '0213 0213 0213 0213'];
const rA1 = [[12, 3], [7, 3], [12, 2], [14, 2], [15, 4], [14, 2]];
const rA2 = [[12, 6], [10, 2], [8, 4], [3, 4]];
const rA3 = [[7, 3], [10, 3], [15, 4], [17, 2], [19, 4]];
const rA4 = [[17, 6], [14, 2], [10, 4], [14, 4]];
const rA8 = [[17, 4], [19, 4], [17, 2], [14, 2], [10, 4]];
const rB1 = [[15, 6], [17, 2], [15, 4], [12, 4]];

const stage_river = {
  name: 'River Clash', bpm: 140, key: 50, filt: [1100, 18000], trim: 1.19, dly: 0.75, fb: 0.3,
  ch: { kick: [0.85], snare: [0.5, 0.22], hat: [0.17], perc: [0.32, 0.22], bass: [0.5], pad: [0.17, 0.35], arp: [0.11, 0.15, 0.22], lead: [0.22, 0.2, 0.16], bell: [0.2, 0.45, 0.25], hype: [0.08, 0.15, 0.25] },
  kit: { kick: { f0: 160, f1: 48, dec: 0.32 }, snare: { tone: 195, dec: 0.17 }, toms: [196, 165, 131, 110] },
  bass: { lo: 33, cut: 220, env: 1300, q: 5, fdec: 0.12, sub: 0.25 },
  arp: { lo: 62, wave: 'square', cut: 1200, env: 2500, dec: 0.16 },
  pad: { lo: 53, cut: 1600, att: 0.4 },
  mels: {
    A: { root: 62, bars: 8, n: phr(rA1, rA2, rA3, rA4, rA1, rA2, rA3, rA8) },
    Alo: { src: 'A', root: 50, vel: 0.45, p: { cut: 1300, w2: 'sawtooth' } },
    B: { root: 62, bars: 8, n: phr(rB1, [[14, 6], [15, 2], [17, 8]], [[19, 12], [17, 2], [15, 2]], [[15, 4], [14, 4], [12, 8]],
      rB1, [[14, 6], [15, 2], [17, 4], [19, 4]], [[14, 4], [19, 4], [17, 4], [14, 4]], [[11, 6], [12, 2], [14, 8]]) },
    BR: { root: 62, inst: 'bell', ch: 'bell', bars: 8, p: { ratio: 3.5, idx: 2.5 },
      n: phr([[12, 8], [7, 8]], [[15, 16]], [[12, 8], [10, 8]], [[8, 16]], [[5, 8], [8, 8]], [[12, 16]], [[11, 8], [14, 8]], [[19, 16]]) },
  },
  sec: {
    intro: { bars: 4, ch: 'i bVI bIII bVII', k: ['x... .... .... ....', 'x... .... x... ....'], h: ['.... .... .... ....', '..x. ..x. ..x. ..x.'], a: RA, pad: 1, fill: 1, crash: 0 },
    A: { bars: 8, ch: 'i bVI bIII bVII', k: RK, s: RS, h: RH, b: RB, a: RA, pad: 1, mel: ['A'], fill: 1 },
    B: { bars: 8, ch: 'bVI bVII i i bVI bVII V V', k: RK, s: RS, h: RH, b: ['R... .... R... ....', 'R.R. R.R. R.R. R.RO', 'RRO. RRO. RRO. RROR'], a: RA, pad: 1, mel: ['B'], fill: 1 },
    A2: { bars: 8, ch: 'i bVI bIII bVII', k: RK, s: RS, h: RH, b: RB, a: ['0.2. 1.3. 0.2. 1.3.', '0213 4213 0213 4253'], pad: 1, mel: ['A', 'Alo'], fill: 1, hype: 2 },
    BR: { bars: 8, ch: 'i i bVI bVI iv iv V V', k: ['x... .... .... ....', 'x... .... .... ....', 'x... .... ..x. ....'], s: ['.... .... .... ....', '.... .... x... ....'],
      h: ['.... .... .... ....', '..x. ..x. ..x. ..x.', 'x.x. x.x. x.x. x.x.'], b: 'R--- ---- ---- ----', a: '0.2. 1.3. 4.2. 1.3.', pad: 1, mel: ['BR'], fill: 2, hype: 0 },
  },
  order: ['intro', 'A', 'B', 'A2', 'BR'], loop: 1,
  hype(T, t, s) {
    if (s & 1) return;
    T.play('hype', I.pluck, t, T.arp[[0, 2, 4, 5, 3, 4, 2, 1][(s >> 1) & 7] % T.arp.length] + 12, T.sd * 1.5, 0.9, { wave: 'sawtooth', cut: 1800, env: 3000, dec: 0.18 });
  },
};

// stage_frost — icy E minor, 130 bpm
const FK = ['x... .... .... ....', 'x... .... x... ....', 'x... ..x. x... ....'];
const FS = ['.... x... .... x...'];
const FH = ['..x. ..x. ..x. ..x.', 'x.x. x.x. x.x. x.x.', 'x-x- x-x- x-x- x-x-'];
const FB = ['R-.. .... R-.. ....', 'R..R ..R. R..R ..R.', 'R.RR .RR. R.RR .RO.'];
const FA = ['0.1. 2.3. 4.3. 2.1.', '0.1. 2.3. 4.3. 2.1.', '0123 4321 0123 4321'];
const fA1 = [[7, 2], [12, 2], [15, 2], [14, 2], [12, 4], [7, 4]];
const fA2 = [[8, 2], [12, 2], [15, 4], [14, 2], [12, 2], [15, 4]];
const fA3 = [[5, 2], [8, 2], [12, 2], [17, 2], [15, 4], [12, 4]];
const FLEAD = { w1: 'triangle', w2: 'sine', cut: 4500, bell: 1.5, vib: 10, det: 3 };

const stage_frost = {
  name: 'Frostpeak', bpm: 130, key: 52, filt: [1200, 18000], trim: 1.1, dly: 0.75, fb: 0.42,
  ch: { kick: [0.8], snare: [0.42, 0.4], hat: [0.15, 0.05], perc: [0.22, 0.3, 0.15], bass: [0.48], pad: [0.18, 0.45], arp: [0.14, 0.25, 0.3], lead: [0.3, 0.3, 0.28], bell: [0.24, 0.5, 0.3], hype: [0.1, 0.35, 0.3] },
  kit: { kick: { f0: 130, f1: 44, dec: 0.3, click: 0.18 }, snareType: 'both', snare: { tone: 230, dec: 0.2, hp: 1600 }, clap: { f: 1800, dec: 0.22 }, hat: { hp: 8500, metal: 1, metalF: 7400 } },
  bass: { lo: 35, wave: 'square', wave2: 'triangle', cut: 260, env: 900, q: 2, sub: 0.35, gate: 0.85 },
  arp: { lo: 64, inst: 'glass', dec: 0.45, ratio: 2, idx: 1.4 },
  pad: { lo: 55, cut: 2200, att: 0.8, shimmer: 1 },
  mels: {
    A: { root: 64, p: FLEAD, bars: 8, n: phr(fA1, fA2, fA3, [[14, 6], [12, 2], [11, 8]], fA1, fA2, fA3, [[11, 4], [14, 4], [19, 8]]) },
    B: { root: 64, p: FLEAD, bars: 8, n: phr([[15, 8], [12, 8]], [[14, 8], [17, 8]], [[19, 12], [17, 2], [14, 2]], [[15, 8], [12, 8]],
      [[15, 6], [14, 2], [12, 8]], [[14, 4], [17, 4], [22, 8]], [[19, 8], [14, 8]], [[12, 4], [15, 4], [19, 8]]) },
    BR: { root: 64, inst: 'bell', ch: 'bell', bars: 8, p: { ratio: 2.0, idx: 2 },
      n: phr([[12, 8], [19, 8]], [[15, 16]], [[8, 8], [15, 8]], [[12, 16]], [[5, 8], [12, 8]], [[17, 16]], [[11, 8], [14, 8]], [[19, 16]]) },
  },
  sec: {
    intro: { bars: 4, ch: 'i bVI iv V', h: ['.... .... .... ....', '..x. ..x. ..x. ..x.'], a: FA[0], pad: 1, fill: 1, crash: 0 },
    A: { bars: 8, ch: 'i bVI iv V', k: FK, s: FS, h: FH, b: FB, a: FA, pad: 1, mel: ['A'], fill: 1 },
    B: { bars: 8, ch: 'bVI bVII v i', k: FK, s: FS, h: FH, b: FB, a: FA, pad: 1, mel: ['B'], fill: 1 },
    A2: { bars: 8, ch: 'i bVI iv V', k: FK, s: FS, h: FH, b: FB, a: FA, pad: 1, mel: ['A'], fill: 1, hype: 2 },
    BR: { bars: 8, ch: 'i i bVI bVI iv iv V V', k: ['.... .... .... ....', 'x... .... .... ....'], h: ['.... .... .... ....', '..x. ..x. ..x. ..x.'],
      b: 'R--- ---- ---- ----', a: '0... 2... 4... 2...', pad: 1, mel: ['BR'], fill: 2, hype: 0 },
  },
  order: ['intro', 'A', 'B', 'A2', 'BR'], loop: 1,
  hype(T, t, s) {
    if ((s & 1) || T.rnd() > 0.55) return;
    T.play('hype', I.glass, t, T.arp[(T.rnd() * T.arp.length) | 0] + 24, 0.2, 0.6 + T.rnd() * 0.3, { dec: 0.35, ratio: 3, idx: 1 });
  },
};

// stage_forge — heavy industrial C minor, 150 bpm
const GK = ['x... .... x... ....', 'x..x ..x. x... x...', 'x.xx ..x. x.xx ..x.'];
const GS = ['.... x... .... x...', '.... x... .... x...', '.... x..o .... x.o.'];
const GH = ['x... x... x... x...', 'x.x. x.x. x.x. x.x.', 'xxxx xxxx xxxx xxxx'];
const GB = ['R.R. R.R. R.R. R.R.', 'RR.R RR.R RR.R R.RR', 'RRRR RRRR RRRR RRRR'];
const gB1 = [[17, 6], [15, 2], [12, 4], [15, 4]], gB2 = [[20, 8], [19, 4], [15, 4]], gB3 = [[19, 8], [23, 4], [26, 4]];

const stage_forge = {
  name: 'The Forge', bpm: 150, key: 48, filt: [1000, 16000], trim: 0.64, dly: 0.5, fb: 0.22,
  ch: { kick: [0.9], snare: [0.5, 0.2], hat: [0.15], perc: [0.3, 0.2], bass: [0.42], pad: [0.13, 0.3], lead: [0.2, 0.15, 0.1], bell: [0.2, 0.3], hype: [0.22, 0.1] },
  kit: { kick: { f0: 190, f1: 50, dec: 0.26, drive: 0.35, click: 0.45 }, snare: { tone: 175, dec: 0.15, metal: 1 }, hat: { hp: 6500, metal: 1.5, metalF: 4800, dec: 0.03 }, toms: [150, 125, 100, 80] },
  bass: { lo: 31, cut: 300, env: 1600, q: 3, fdec: 0.1, drive: 0.5, gate: 0.6 },
  pad: { lo: 51, cut: 1100, att: 0.6 },
  mels: {
    R: { root: 48, gate: 0.85, p: { drive: 0.6, w1: 'sawtooth', w2: 'sawtooth', power: 1, cut: 1800, vib: 0, det: 8 }, bars: 4,
      n: phr([[0, 2], [null, 1], [0, 1], [3, 2], [0, 2], [5, 2], [3, 2], [0, 2], [-2, 2]],
        [[0, 2], [null, 1], [0, 1], [3, 2], [0, 2], [7, 3], [6, 1], [5, 2], [3, 2]],
        [[8, 4], [7, 2], [8, 2], [12, 4], [10, 2], [8, 2]],
        [[10, 4], [12, 2], [14, 2], [15, 6], [14, 2]]) },
    B: { root: 48, p: { cut: 2600, det: 6, vib: 16, oct: 0.4 }, bars: 8,
      n: phr(gB1, gB2, gB3, [[24, 6], [23, 10]], gB1, gB2, gB3, [[26, 4], [23, 4], [19, 8]]) },
  },
  sec: {
    intro: { bars: 4, ch: 'i i bVI bVII', k: ['x... .... .... ....', 'x... .... x... ....'], h: ['x... x... x... x...'], mel: ['R'], fill: 1, crash: 0 },
    A: { bars: 8, ch: 'i i bVI bVII', k: GK, s: GS, h: GH, b: GB, pad: 1, mel: ['R'], fill: 1 },
    B: { bars: 8, ch: 'iv bVI V V', k: GK, s: GS, h: GH, b: GB, pad: 1, mel: ['B'], fill: 1 },
    A2: { bars: 8, ch: 'i i bVI bVII', k: GK, s: GS, h: GH, b: GB, pad: 1, mel: ['R'], fill: 1, hype: 2 },
    BR: { bars: 8, ch: 'i i bVI bVI iv iv V V', k: ['x... .... .... ....', 'x... .... .... ....', 'x... ..x. .... ....'], s: ['.... .... .... ....', '.... .... x... ....'],
      h: ['x... x... x... x...'], b: 'R--- ---- ---- ----', pad: 1, fill: 2, hype: 0 },
  },
  order: ['intro', 'A', 'B', 'A2', 'BR'], loop: 1,
  step(T, t, s) {
    const sec = T.sec;
    if (sec === 'intro') { if ((s & 3) === 0) T.play('perc', I.anvil, t, s === 0 ? 1 : 0.55, 760, 0.3); }
    else if (sec === 'BR') { if (s === 0 || s === 10) T.play('perc', I.anvil, t, s === 0 ? 1 : 0.6, 520, 0.7); }
    else if ((s === 6 || s === 14) && T.tier >= 1) T.play('perc', I.anvil, t, 0.7, 880, 0.25);
  },
  hype(T, t, s) {
    if (s & 1) T.play('hype', I.kick, t, 0.55, { f0: 170, f1: 55, dec: 0.12, click: 0.5 });
  },
};

// stage_astral — cosmic synthwave A minor, 126 bpm
const AK = ['x... .... x... ....', 'x... x... x... x...', 'x... x... x... x..x'];
const AS = ['.... x... .... x...'];
const AH = ['..x. ..x. ..x. ..x.', '..o. ..o. ..o. ..o.', 'x-o- x-o- x-o- x-o-'];
const AB = ['R... R... R... R...', 'R.O. R.O. R.O. R.O.', 'RORO RORO RORO RORO'];
const AA = ['0... 2... 4... 3...', '0.2. 4.3. 0.2. 4.3.', '0243 0243 0243 0243'];
const aA1 = [[7, 6], [12, 6], [10, 2], [7, 2]], aA2 = [[12, 6], [15, 6], [12, 2], [10, 2]], aA3 = [[14, 6], [17, 6], [14, 2], [12, 2]];
const ALEAD = { w1: 'sawtooth', w2: 'sawtooth', det: 9, cut: 2600, vib: 18 };

const stage_astral = {
  name: 'Astral Gate', bpm: 126, key: 45, filt: [1100, 17000], trim: 1.36, dly: 0.75, fb: 0.45,
  ch: { kick: [0.85], snare: [0.42, 0.55], hat: [0.15], perc: [0.25, 0.3], bass: [0.45], pad: [0.17, 0.4], arp: [0.1, 0.2, 0.35], lead: [0.22, 0.25, 0.3], bell: [0.18, 0.5, 0.45], hype: [0.07, 0.2, 0.35] },
  kit: { kick: { f0: 140, f1: 44, dec: 0.38 }, snareType: 'both', snare: { tone: 180, dec: 0.25 }, clap: { f: 1200, dec: 0.25 }, hat: { hp: 8000, open: 0.18 } },
  bass: { lo: 33, cut: 380, env: 1100, q: 6, fdec: 0.1, gate: 0.7 },
  arp: { lo: 57, wave: 'sawtooth', cut: 1500, env: 2200, det: 8, dec: 0.2 },
  pad: { lo: 57, cut: 2200, att: 0.9, rel: 1.2 },
  mels: {
    A: { root: 57, p: ALEAD, bars: 8, n: phr(aA1, aA2, aA3, [[10, 8], [7, 8]], aA1, aA2, aA3, [[14, 4], [12, 4], [10, 4], [7, 4]]) },
    Ahi: { src: 'A', root: 69, ch: 'hype', vel: 0.6, p: { w1: 'square', w2: 'sine', cut: 4000 } },
    B: { root: 57, p: ALEAD, bars: 8, n: phr([[12, 8], [15, 8]], [[14, 8], [17, 8]], [[19, 12], [17, 2], [15, 2]], [[12, 16]],
      [[12, 4], [15, 4], [20, 8]], [[22, 8], [19, 8]], [[19, 8], [15, 8]], [[11, 4], [14, 4], [19, 8]]) },
    BR: { root: 69, inst: 'bell', ch: 'bell', bars: 8, p: { ratio: 3.5, idx: 2 },
      n: phr([[5, 8], [12, 8]], [[8, 16]], [[7, 8], [12, 8]], [[3, 16]], [[8, 8], [15, 8]], [[12, 16]], [[11, 8], [14, 8]], [[7, 16]]) },
  },
  sec: {
    intro: { bars: 4, ch: 'i bVI bVII v', h: ['.... .... .... ....', '..x. ..x. ..x. ..x.'], a: AA, pad: 1, fill: 1, crash: 0 },
    A: { bars: 8, ch: 'i bVI bVII v', k: AK, s: AS, h: AH, b: AB, a: AA, pad: 1, mel: ['A'], fill: 1 },
    B: { bars: 8, ch: 'bVI bVII i i bVI bVII bIII V', k: AK, s: AS, h: AH, b: AB, a: AA, pad: 1, mel: ['B'], fill: 1 },
    A2: { bars: 8, ch: 'i bVI bVII v', k: AK, s: AS, h: AH, b: AB, a: AA, pad: 1, mel: ['A', 'Ahi'], fill: 1, hype: 2 },
    BR: { bars: 8, ch: 'iv iv i i bVI bVI V V', k: ['.... .... .... ....', '.... .... .... ....', 'x... .... x... ....'], h: ['.... .... .... ....', '..x. ..x. ..x. ..x.'],
      b: 'R--- ---- ---- ----', a: AA, pad: 1, mel: ['BR'], fill: 2, hype: 0 },
  },
  order: ['intro', 'A', 'B', 'A2', 'BR'], loop: 1,
  step(T, t, s) { // cosmic sparkles (A minor pentatonic)
    if (!(s & 1) && T.rnd() < 0.12) T.play('bell', I.bellN, t, 81 + [0, 3, 5, 7, 10, 12][(T.rnd() * 6) | 0], 0.3, 0.35 + T.rnd() * 0.3, { ratio: 2, idx: 1.2, dec: 0.6 });
  },
  hype(T, t, s) {
    T.play('hype', I.pluck, t, T.arp[[0, 2, 4, 3][s & 3] % T.arp.length] + 12, T.sd, 0.8, { wave: 'square', cut: 2000, env: 2500, dec: 0.12 });
  },
};

// select — driving G minor, 120 bpm, ticking clock
const SK = ['x... .... x... ....', 'x... x... x... x...', 'x... x... x... x.x.'];
const SS = ['.... x... .... x...'];
const SH = ['..x. ..x. ..x. ..x.', 'x-x- x-x- x-x- x-x-', 'X-x- X-x- X-x- X-xo'];
const SB = ['R.R. R.R. R.R. R.R.', 'RRRR RRRR RRRR RRRR', 'RRRO RRRO RRRO RROR'];
const HOOK = { wave: 'sawtooth', det: 7, cut: 1600, env: 3500, dec: 0.3 };

const select = {
  name: 'Choose Your Hero', bpm: 120, key: 43, filt: [1400, 18000], trim: 1.13, dly: 0.75, fb: 0.3,
  ch: { kick: [0.8], snare: [0.42, 0.25], hat: [0.16], perc: [0.25, 0.15], bass: [0.42], pad: [0.15, 0.35], arp: [0.1, 0.15, 0.2], lead: [0.2, 0.2, 0.25], hype: [0.08, 0.1, 0.2] },
  kit: { kick: { f0: 150, f1: 46, dec: 0.3 }, snareType: 'clap', clap: { f: 1400, dec: 0.18 }, hat: { hp: 8000 } },
  bass: { lo: 31, cut: 260, env: 900, q: 4, fdec: 0.08, gate: 0.6 },
  arp: { lo: 62, wave: 'square', cut: 1300, env: 2000, dec: 0.12 },
  pad: { lo: 55, cut: 1500, att: 0.6 },
  mels: {
    H: { root: 67, inst: 'pluck', p: HOOK, bars: 4,
      n: phr([[7, 2], [null, 1], [10, 1], [12, 2], [10, 2], [7, 2], [null, 1], [5, 1], [3, 2], [5, 2]],
        [[7, 2], [null, 1], [10, 1], [12, 2], [15, 2], [14, 2], [12, 2], [10, 4]],
        [[8, 2], [null, 1], [10, 1], [15, 2], [10, 2], [8, 2], [null, 1], [7, 1], [3, 2], [7, 2]],
        [[10, 2], [null, 1], [12, 1], [14, 2], [12, 2], [10, 4], [12, 4]]) },
    HB: { root: 67, inst: 'pluck', p: { ...HOOK, dec: 0.45 }, bars: 4,
      n: phr([[5, 4], [8, 4], [12, 4], [15, 4]], [[15, 6], [12, 2], [8, 8]], [[11, 4], [14, 4], [19, 8]], [[17, 4], [14, 4], [11, 8]]) },
  },
  sec: {
    intro: { bars: 2, ch: 'i i', k: SK, h: SH, b: SB, fill: 1, crash: 0 },
    A: { bars: 8, ch: 'i i bVI bVII', k: SK, s: SS, h: SH, b: SB, pad: 1, mel: ['H'], fill: 1 },
    B: { bars: 8, ch: 'iv bVI V V', k: SK, s: SS, h: SH, b: SB, a: ['0.2. 1.3. 0.2. 1.3.', '0213 0213 0213 0213'], pad: 1, mel: ['HB'], fill: 1 },
    A2: { bars: 8, ch: 'i i bVI bVII', k: SK, s: SS, h: SH, b: SB, a: '0.2. 1.3. 0.2. 1.3.', pad: 1, mel: ['H'], fill: 2, hype: 2 },
  },
  order: ['intro', 'A', 'B', 'A2'], loop: 1,
  step(T, t, s) { if ((s & 3) === 0) T.play('perc', I.block, t, s === 0 ? 0.9 : 0.55, s === 0 ? 1250 : 1000); },
  hype(T, t, s) {
    if (s & 1) return;
    T.play('hype', I.pluck, t, T.arp[[0, 1, 2, 3, 4, 3, 2, 1][(s >> 1) & 7] % T.arp.length] + 12, T.sd * 1.5, 0.8, { wave: 'square', cut: 2500, dec: 0.1 });
  },
};

// menu — atmospheric D minor, 84 bpm: pads, soft pulse, distant bells, choir
const MB = ['R... .... R... ....', 'R.R. R.R. R.R. R.R.'];
const menu = {
  name: 'Midlane', bpm: 84, key: 50, filt: [2400, 14000], trim: 1.2, dly: 0.75, fb: 0.45,
  ch: { kick: [0.55], perc: [0.35, 0.45], hat: [0.08, 0.2], bass: [0.3, 0.15], pad: [0.3, 0.5], bell: [0.3, 0.6, 0.4], lead: [0.18, 0.6], hype: [0.25, 0.35] },
  pad: { lo: 53, cut: 1300, att: 1.6, rel: 2.0 },
  bass: { lo: 38, cut: 200, env: 500, q: 2, fdec: 0.25, gate: 0.5 },
  mels: {
    MA: { root: 74, inst: 'bell', ch: 'bell', bars: 8, p: { ratio: 3.5, idx: 2.2, dec: 2.6 },
      n: phr([[0, 6], [7, 6], [5, 4]], [[3, 12], [2, 4]], [[-4, 6], [3, 6], [0, 4]], [[null, 16]], [[7, 6], [10, 6], [12, 4]], [[7, 16]], [[2, 6], [5, 6], [10, 4]], [[2, 16]]) },
    MB: { root: 74, inst: 'bell', ch: 'bell', bars: 8, p: { ratio: 3.5, idx: 2.2, dec: 2.6 },
      n: phr([[5, 12], [3, 4]], [[0, 16]], [[3, 6], [8, 6], [10, 4]], [[12, 16]], [[7, 6], [3, 6], [0, 4]], [[3, 16]], [[-1, 6], [2, 6], [7, 4]], [[2, 16]]) },
  },
  sec: {
    A: { bars: 8, cb: 2, ch: 'i bVI bIII bVII', pad: 1, b: MB, mel: ['MA'], crash: 0 },
    B: { bars: 8, cb: 2, ch: 'iv bVI i V', pad: 1, b: MB, mel: ['MB'], crash: 0 },
    A2: { bars: 8, cb: 2, ch: 'i bVI bIII bVII', pad: 1, choir: 1, b: MB, mel: ['MA'], crash: 0 },
    B2: { bars: 8, cb: 2, ch: 'iv bVI i V', pad: 1, choir: 1, b: MB, mel: ['MB'], crash: 0 },
  },
  order: ['A', 'B', 'A2', 'B2'], loop: 0,
  bar(T, t) {
    if (T.sb % 2) return;
    T.play('bass', I.drone, t, T.rootNote(33), T.bd * 2, 0.8);
    if (T.S.choir) T.play('lead', I.choir, t, T.voicing(57), T.bd * 2, 0.8, { att: 1.2, rel: 1.5 });
    if (T.sec[0] === 'B' && T.tier >= 1) T.play('perc', I.timp, t, 0.6, mtof(T.rootNote(33)), 1.8);
  },
  step(T, t, s) {
    if (T.tier >= 1 && (s === 0 || s === 3)) T.play('kick', I.kick, t, s === 0 ? 0.7 : 0.45, { f0: 90, f1: 40, dec: 0.4, click: 0 });
    if (T.tier >= 2 && (s === 6 || s === 8 || s === 14)) T.play('hype', I.tom, t, s === 8 ? 0.8 : 0.5, 82, { dec: 0.5 });
  },
};

// results — triumphant but relaxed D major, 100 bpm, light swing
const QK = ['x... .... x... ....', 'x... .... x.x. ....', 'x... ..x. x.x. ....'];
const QS = ['.... x... .... x...'];
const QH = ['x.x. x.x. x.x. x.x.', 'x.x. x.x. x.x. x.xo', 'x-x- x-x- x-x- x-xo'];
const QB = ['R... .... 5... ....', 'R... ..R. 5... ..5.', 'R..R ..R. 5..5 ..O.'];
const QA = ['0.1. 2.1. 0.1. 2.1.'];
const qA1 = [[4, 4], [7, 4], [12, 8]], qA2 = [[11, 6], [9, 2], [7, 8]], qA3 = [[9, 4], [12, 4], [16, 6], [14, 2]];
const QLEAD = { w1: 'triangle', w2: 'sine', cut: 3200, vib: 10, det: 2, bell: 0.8 };

const results = {
  name: 'Glory', bpm: 100, key: 50, swing: 0.12, filt: [2500, 17000], trim: 1.3, dly: 0.75, fb: 0.3,
  ch: { kick: [0.7], snare: [0.32, 0.3], hat: [0.12], perc: [0.18, 0.2], bass: [0.45], pad: [0.17, 0.4], arp: [0.1, 0.2, 0.2], lead: [0.24, 0.3, 0.2], bell: [0.16, 0.4, 0.25], hype: [0.12, 0.2] },
  kit: { kick: { f0: 120, f1: 50, dec: 0.3, click: 0.12 }, snareType: 'both', snare: { tone: 210, dec: 0.12, hp: 1800 }, clap: { f: 1600, dec: 0.12 }, hat: { hp: 7500 } },
  bass: { lo: 33, wave: 'triangle', wave2: 'sawtooth', cut: 600, env: 700, q: 1, sub: 0.3, gate: 0.8 },
  arp: { lo: 62, wave: 'triangle', cut: 2500, env: 1500, dec: 0.25 },
  pad: { lo: 54, cut: 2000, att: 0.5 },
  mels: {
    A: { root: 62, p: QLEAD, bars: 8, n: phr(qA1, qA2, qA3, [[12, 8], [9, 4], [7, 4]], qA1, qA2, qA3, [[9, 4], [12, 4], [17, 8]]) },
    B: { root: 62, p: QLEAD, bars: 8, n: phr([[9, 8], [12, 8]], [[11, 8], [14, 8]], [[11, 8], [7, 8]], [[12, 8], [16, 8]],
      [[14, 8], [9, 8]], [[11, 4], [14, 4], [17, 8]], [[16, 8], [14, 4], [12, 4]], [[12, 16]]) },
  },
  sec: {
    intro: { bars: 2, ch: 'I V', k: QK, h: QH, b: QB, a: QA, pad: 1, fill: 1, crash: 0 },
    A: { bars: 8, ch: 'I V vi IV', k: QK, s: QS, h: QH, b: QB, a: QA, pad: 1, mel: ['A'], fill: 1 },
    B: { bars: 8, ch: 'IV V iii vi ii V I I', k: QK, s: QS, h: QH, b: QB, a: QA, pad: 1, mel: ['B'], fill: 1 },
  },
  order: ['intro', 'A', 'B'], loop: 1,
  hype(T, t, s) { T.play('hype', I.shaker, t, (s & 3) === 2 ? 1 : 0.5); },
};

export const TRACKS = { menu, select, stage_river, stage_frost, stage_forge, stage_astral, results };
export const TRACK_IDS = Object.keys(TRACKS);
