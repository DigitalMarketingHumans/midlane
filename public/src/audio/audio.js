// MIDLANE audio engine — fully procedural (no audio files), Web Audio API.
//
//   const audio = new AudioEngine();
//   audio.unlock();                       // from any user gesture; safe to repeat
//   audio.play('hit_m', { pan: -0.3 });   // one-shot SFX → returns a handle { stop(fade) } or null
//   audio.music('stage_river');           // crossfade to a track; music(null) fades out
//   audio.setIntensity(0.9);              // 0..1 (default 0.5)
//   audio.duck(0.5, 0.6);                 // briefly lower the music
//   audio.announce('Round one');          // speechSynthesis announcer (if available)
//   audio.setVolume('music', 0.4);        // 'master' | 'sfx' | 'music' | 'voice'
//
// Graph:
//   sfx voices ─[gain → pan]─┬─> sfx bus ───────────────┐
//                            └─> sfx reverb send ──┐     │
//   music tracks ─> duck ─> music bus ─────────────┼─────┼─> master ─> compressor ─> soft limiter ─> out
//   music sends  ─> duck ─> music reverb send ─────┤     │
//                                    convolver <───┘ ─> reverb return
//   voice bus (reserved for voice clips; the speechSynthesis announcer can't be routed
//   through Web Audio, so it uses master × voice volume directly)
//
// Testing/offline: new AudioEngine({ context: offlineCtx }) builds the same graph on any
// BaseAudioContext; `renderAhead(seconds)` schedules music synchronously for offline renders.
// Extra options: { destination, dynamics: false, reverb: false } (measurement only).
import { Voice, impulse, limiterCurve, clamp } from './dsp.js';
import { SFX, SFX_NAMES, SFX_GROUPS } from './sfx.js';
import { Track, TRACKS, TRACK_IDS } from './music.js';

export { SFX, SFX_NAMES, SFX_GROUPS, TRACKS, TRACK_IDS };

const LOOKAHEAD = 0.15;   // seconds of music scheduled ahead of the audio clock
const TICK_MS = 25;       // scheduler wake-up interval
const MAX_VOICES = 48;    // global SFX polyphony cap
const START_PAD = 0.005;  // schedule SFX a hair ahead so attack ramps are never in the past
// DynamicsCompressorNode applies automatic makeup gain (per spec); this trim cancels it so
// material below the threshold passes at unity. Measured by the offline test (makeup mode).
const MAKEUP_TRIM = 0.79;
const wallMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class AudioEngine {
  constructor(opts = {}) {
    this._opt = opts;
    this.ctx = null;
    this.output = null;
    this._vol = { master: 0.8, sfx: 0.9, music: 0.55, voice: 0.9 };
    this._I = 0.5;
    this._want = null;
    this._wantOpt = undefined;
    this._ready = false;
    this._unlocked = false;
    this._dead = false;
    this._offline = false;
    this._act = new Map();
    this._all = [];
    this._last = new Map();
    this._warned = new Set();
    this._tracks = [];
    this._cur = null;
    this._timer = null;
    this._duckEnd = 0;
    this._duckLvl = 1;
    this._speech = undefined;
    this._suspendedByUs = false;
    this._resumeAt = -1e9;
    if (opts.context) {
      this.ctx = opts.context;
      this._offline = typeof OfflineAudioContext !== 'undefined' && opts.context instanceof OfflineAudioContext;
      try { this._build(); } catch (e) { this._dead = true; console.warn('[audio] init failed', e); }
    }
  }

  static get SFX_NAMES() { return SFX_NAMES; }
  static get SFX_GROUPS() { return SFX_GROUPS; }
  static get TRACK_IDS() { return TRACK_IDS; }

  // ---- lifecycle ---------------------------------------------------------------------
  unlock() {
    if (this._dead) return;
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { this._dead = true; return; }
        try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (_) { this.ctx = new AC(); }
        this._build();
      }
      const c = this.ctx;
      if (!this._offline && c.state !== 'running' && c.state !== 'closed' && c.resume) {
        this._resumeAt = wallMs();
        const p = c.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (!this._unlocked) {
        this._unlocked = true;
        if (!this._offline) {
          // iOS/Safari: start a silent buffer inside the gesture to fully unlock output
          const s = c.createBufferSource();
          s.buffer = c.createBuffer(1, 1, c.sampleRate);
          s.connect(c.destination);
          s.onended = () => s.disconnect();
          s.start(0);
          this._listen();
        }
        if (this._want) this.music(this._want, this._wantOpt);
      }
    } catch (e) {
      console.warn('[audio] unlock failed', e);
    }
  }

  get state() { return this._dead ? 'unavailable' : this.ctx ? this.ctx.state : 'locked'; }
  get unlocked() { return this._unlocked && !this._dead; }
  get activeVoices() { let n = 0; for (const v of this._all) if (!v.dead) n++; return n; }
  get track() { return this._cur ? this._cur.id : null; }
  get section() { return this._cur ? this._cur.sec : null; }
  get intensity() { return this._I; }
  getVolume(kind) { return this._vol[kind]; }

  _build() {
    const c = this.ctx, o = this._opt;
    const G = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    this._master = G(this._vol.master);
    let tail = this._master;
    if (o.dynamics !== false) {
      const comp = c.createDynamicsCompressor();
      // gentle bus glue: only stacked sounds / huge hits reach the threshold
      comp.threshold.value = -8; comp.knee.value = 8; comp.ratio.value = 4;
      comp.attack.value = 0.002; comp.release.value = 0.15;
      // the spec'd compressor adds automatic makeup gain; trim it back so quiet material
      // passes at ~unity, then a soft limiter (scaled ×0.5 into a [-2,2] curve) catches peaks
      const trim = G(MAKEUP_TRIM), pre = G(0.5), lim = c.createWaveShaper();
      lim.curve = limiterCurve();
      lim.oversample = 'none';
      tail.connect(comp); comp.connect(trim); trim.connect(pre); pre.connect(lim);
      tail = lim;
      this._comp = comp;
    }
    tail.connect(o.destination || c.destination);
    this.output = tail;
    this._sfx = G(this._vol.sfx, this._master);
    this._voice = G(this._vol.voice, this._master);
    this._music = G(this._vol.music, this._master);
    this._duckA = G(1, this._music);
    this._musicIn = this._duckA;
    this._conv = c.createConvolver();
    this._conv.normalize = false;
    this._conv.buffer = impulse(c, 1.8);
    this._revRet = G(0.55);
    this._conv.connect(this._revRet);
    if (o.reverb !== false) this._revRet.connect(this._master);
    this._sfxRev = G(this._vol.sfx, this._conv);
    this._mWetVol = G(this._vol.music, this._conv);
    this._duckB = G(1, this._mWetVol);
    this._musicWetIn = this._duckB;
    this._ready = true;
  }

  _hidden() { return !this._offline && typeof document !== 'undefined' && document.hidden; }

  _ok() {
    if (!this._ready || !this._unlocked || this._dead) return false;
    if (this._offline) return true;
    if (this._hidden()) return false;
    // allow the gesture that unlocked audio to be heard while resume() is still pending
    return this.ctx.state === 'running' || (this.ctx.state === 'suspended' && wallMs() - this._resumeAt < 400);
  }

  _listen() {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        const c = this.ctx;
        if (!c || this._dead) return;
        if (document.hidden) {
          if (c.state === 'running' && c.suspend) { this._suspendedByUs = true; c.suspend().catch(() => {}); }
        } else if (this._suspendedByUs) {
          this._suspendedByUs = false;
          c.resume().catch(() => {});
        }
      });
    }
    const ss = globalThis.speechSynthesis;
    if (ss && ss.addEventListener) ss.addEventListener('voiceschanged', () => { this._speech = undefined; });
  }

  // ---- volumes / intensity -------------------------------------------------------------
  setVolume(kind, v) {
    if (!(kind in this._vol)) return;
    v = clamp(+v || 0, 0, 1);
    this._vol[kind] = v;
    if (kind === 'voice' && v === 0) { try { globalThis.speechSynthesis && globalThis.speechSynthesis.cancel(); } catch (_) { /* */ } }
    if (!this._ready) return;
    const t = this.ctx.currentTime;
    const set = (n) => n.gain.setTargetAtTime(v, t, 0.03);
    if (kind === 'master') set(this._master);
    else if (kind === 'sfx') { set(this._sfx); set(this._sfxRev); }
    else if (kind === 'music') { set(this._music); set(this._mWetVol); }
    else set(this._voice);
  }

  setIntensity(x) {
    this._I = clamp(+x || 0, 0, 1);
    if (!this._ready) return;
    const now = this.ctx.currentTime;
    for (const tr of this._tracks) tr.setI(this._I, now);
  }

  // ---- SFX ---------------------------------------------------------------------------
  play(name, o = {}) {
    const def = SFX[name];
    if (!def) {
      if (!this._warned.has(name)) { this._warned.add(name); console.warn(`[audio] unknown sfx "${name}"`); }
      return null;
    }
    if (!this._ok()) return null;
    const c = this.ctx, now = c.currentTime;
    let g = (o.gain ?? 1) * (def.gain ?? 1);
    if (!(g > 0)) return null;
    // the same sound fired several times in one frame: attenuate the 2nd, drop the 3rd+
    const lp = this._last.get(name);
    if (lp && now - lp.t < 0.025) { if (++lp.n >= 3) return null; g *= 0.6; }
    else this._last.set(name, { t: now, n: 0 });
    // polyphony caps: per name, then global (steal the oldest live voice)
    let list = this._act.get(name);
    if (!list) this._act.set(name, (list = []));
    let live = 0;
    for (const v of list) if (!v.dead) live++;
    if (live >= (def.cap ?? 4)) { for (const v of list) if (!v.dead) { v.stop(0.03); break; } }
    if (this.activeVoices >= MAX_VOICES) { for (const v of this._all) if (!v.dead) { v.stop(0.03); break; } }

    const out = c.createGain();
    out.gain.value = g;
    const extra = [out];
    let tail = out;
    const pan = clamp(+o.pan || 0, -1, 1);
    if (pan && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      tail = p;
      extra.push(p);
    }
    tail.connect(this._sfx);
    if (def.rev) {
      const s = c.createGain();
      s.gain.value = def.rev;
      tail.connect(s);
      s.connect(this._sfxRev);
      extra.push(s);
    }
    const jr = def.jit ? 1 + (Math.random() * 2 - 1) * def.jit : 1;
    const v = new Voice(c, now + START_PAD, out, clamp(+o.rate || 1, 0.1, 8) * jr);
    v.rev = this._sfxRev;
    v.name = name;
    v.nodes.push(...extra);
    v.onend = (vv) => {
      const i = list.indexOf(vv); if (i >= 0) list.splice(i, 1);
      const j = this._all.indexOf(vv); if (j >= 0) this._all.splice(j, 1);
    };
    list.push(v);
    this._all.push(v);
    try {
      def.fn(v, o);
    } catch (e) {
      console.warn(`[audio] sfx "${name}" failed`, e);
      v.stop(0.01);
    }
    v.done();
    return v;
  }

  // stop every SFX voice (e.g. on pause / leaving a match)
  stopAll(fade = 0.05) { for (const v of this._all.slice()) v.stop(fade); }

  // ---- music -------------------------------------------------------------------------
  music(trackId, o = {}) {
    const fade = Math.max(0, o.fade ?? 1.2);
    this._want = trackId || null;
    this._wantOpt = o;
    if (!this._ready || !this._unlocked || this._dead) return;
    if (trackId && !TRACKS[trackId]) {
      if (!this._warned.has('track:' + trackId)) { this._warned.add('track:' + trackId); console.warn(`[audio] unknown track "${trackId}"`); }
      return;
    }
    if (trackId && this._cur && this._cur.id === trackId && !o.section) return;
    const now = this.ctx.currentTime;
    if (this._cur) { this._cur.fadeOut(now, fade); this._cur = null; }
    if (trackId) {
      const tr = new Track(this, trackId, TRACKS[trackId], { section: o.section, seed: o.seed });
      tr.start(now + 0.06, fade);
      this._cur = tr;
      this._tracks.push(tr);
    }
    this._pump();
    if (!this._timer && !this._offline && this._tracks.length) this._timer = setInterval(() => this._pump(), TICK_MS);
  }

  _pump(until) {
    if (!this._ready) return;
    const c = this.ctx, now = c.currentTime;
    if (!this._offline) {
      if (this._hidden() || c.state !== 'running') return;
      for (const tr of this._tracks) tr.resync(now);
    }
    const end = until ?? now + LOOKAHEAD;
    for (const tr of this._tracks) tr.pump(end);
    for (let i = this._tracks.length - 1; i >= 0; i--) {
      const tr = this._tracks[i];
      if (tr.done && now > tr.stopAt + 3) { tr.dispose(); this._tracks.splice(i, 1); }
    }
    if (!this._tracks.length && this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // Offline rendering / tests: schedule all music up to `seconds` from now synchronously.
  renderAhead(seconds) { if (this._ready) this._pump(this.ctx.currentTime + seconds); }

  duck(amount = 0.5, seconds = 0.6) {
    if (!this._ready || this._dead) return;
    const now = this.ctx.currentTime;
    const lvl = clamp(1 - amount, 0, 1), hold = now + 0.05 + Math.max(0, seconds);
    if (now < this._duckEnd) { this._duckLvl = Math.min(this._duckLvl, lvl); this._duckEnd = Math.max(this._duckEnd, hold); }
    else { this._duckLvl = lvl; this._duckEnd = hold; }
    for (const n of [this._duckA, this._duckB]) {
      const p = n.gain, cur = p.value;
      p.cancelScheduledValues(now);
      p.setValueAtTime(cur, now);
      p.linearRampToValueAtTime(this._duckLvl, now + 0.05);
      p.setValueAtTime(this._duckLvl, this._duckEnd);
      p.linearRampToValueAtTime(1, this._duckEnd + 0.5);
    }
  }

  // ---- announcer -----------------------------------------------------------------------
  announce(text) {
    if (!text || !this._unlocked || this._dead) return;
    const ss = globalThis.speechSynthesis, U = globalThis.SpeechSynthesisUtterance;
    if (!ss || !U) return;
    const vol = this._vol.voice * this._vol.master;
    if (vol <= 0.001) return;
    try {
      ss.cancel();
      const u = new U(String(text));
      u.volume = Math.min(1, vol * 1.15);
      u.rate = 0.82;
      u.pitch = 0.5;
      u.lang = 'en-US';
      const voice = this._pickVoice(ss);
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.onstart = () => this.duck(0.35, Math.min(2.5, 0.3 + String(text).length * 0.06));
      ss.speak(u);
    } catch (_) { /* speech is optional */ }
  }

  _pickVoice(ss) {
    if (this._speech !== undefined) return this._speech;
    let list = [];
    try { list = ss.getVoices() || []; } catch (_) { /* */ }
    if (!list.length) return null; // voices load async; try again next time
    const en = list.filter((v) => /^en/i.test(v.lang));
    let pool = en.length ? en : list;
    const local = pool.filter((v) => v.localService); // LAN/offline: avoid network voices
    if (local.length) pool = local;
    const male = /\b(male|daniel|david|alex|fred|george|arthur|james|mark|guy|ryan|thomas|bruce|ralph|oliver|aaron|gordon)\b/i;
    this._speech = pool.find((v) => male.test(v.name) && !/female/i.test(v.name)) || pool[0] || null;
    return this._speech;
  }
}

export default AudioEngine;
