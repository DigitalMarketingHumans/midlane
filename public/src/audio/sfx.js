// MIDLANE audio — procedural SFX catalogue.
// Each entry: { fn(voice), len (nominal seconds, before reverb), cap (max simultaneous
// voices of this name), jit (random rate variation ±), rev (reverb send), gain }.
// Recipes write into voice.out; times are recipe seconds (scaled by play({ rate })).
import { EPS, perc, swell, mtof } from './dsp.js';
import * as I from './instruments.js';

// ---- helpers -------------------------------------------------------------------------
function whoosh(v, f0, f1, len, amp, q = 1.2, kind = 'white', at = 0, peakAt = 0.4) {
  return v.hiss(kind, [[at, 0], [at + len * peakAt, amp], [at + len, EPS, 'x']], [['bandpass', [[at, f0], [at + len, f1, 'x']], q]]);
}

// n tiny filtered noise ticks between t0..t1 (debris, rustle, pebbles) — one source,
// one filter, one gain: the envelope and filter frequency step per tick.
function scatter(v, n, t0, t1, amp, dec, fLo, fHi, q = 2, to = v.out, kind = 'white') {
  const ts = [];
  for (let i = 0; i < n; i++) ts.push(v.R(t0, t1));
  ts.sort((a, b) => a - b);
  const g = [[t0, 0]], f = [[t0, fLo]];
  let prev = t0;
  for (const t of ts) {
    const s = Math.max(t, prev + 0.003), d = dec * v.R(0.6, 1.4);
    g.push([s, 0, 'h'], [s + 0.0006, amp * v.R(0.45, 1)], [s + d, EPS, 'x']);
    f.push([s, v.R(fLo, fHi), 'h']);
    prev = s + d;
  }
  const gn = v.gain(g, to);
  v.nsrc(kind, t0, prev + 0.01, v.filt('bandpass', f, q, gn));
}

// Body impact: transient click + band-passed noise thump + sine pitch drop, the thump
// and body go through a tanh "crunch" bus; optional clean sub and a gritty smack.
// One shared noise source feeds all noise layers.
function impact(v, P) {
  const j = v.R(0.9, 1.1);
  const n = v.nsrc('white', 0, P.len);
  const d = v.drive(P.drive, v.filt('lowpass', P.lp * j, 0.6), P.post);
  v.hiss(n, perc(P.click, 0.0003, 0.009), [['highpass', 2600 * j, 0.7]]);
  v.hiss(n, perc(1, 0.0008, P.nd), [['bandpass', [[0, P.nf[0] * j], [P.nd, P.nf[1], 'x']], 0.9]], d);
  v.tone('sine', [[0, P.f[0] * j], [P.fd, P.f[1], 'x']], perc(P.ta, 0.0008, P.td), d);
  if (P.smack) v.hiss(n, perc(P.smack, 0.0004, 0.022), [['bandpass', 3400 * v.R(0.85, 1.15), 1.3]], d);
  if (P.sub) v.tone('sine', [[0, P.sub[0]], [P.sub[2], P.sub[1], 'x']], perc(P.sub[3], 0.0015, P.sub[4]));
}

// ---- catalogue -------------------------------------------------------------------------
export const SFX = {
  // ===== UI ===========================================================================
  ui_move: { len: 0.06, gain: 1.5, cap: 3, jit: 0.03, fn(v) {
    v.tone('sine', [[0, 1900], [0.03, 1500, 'x']], perc(0.2, 0.001, 0.04));
    v.hiss('white', perc(0.06, 0.0005, 0.012), [['bandpass', 5200, 1.5]]);
  } },
  ui_select: { len: 0.6, cap: 3, rev: 0.15, fn(v) {
    I.bell(v, 0, 1318.5, 0.35, 0.6, { ratio: 3.01, idx: 1.5 });
    I.bell(v, 0.075, 1975.5, 0.5, 0.55, { ratio: 3.01, idx: 1.5 });
    v.tone('triangle', 1318.5, perc(0.09, 0.002, 0.1));
    v.tone('triangle', 1975.5, perc(0.08, 0.002, 0.14, 0.075));
  } },
  ui_back: { len: 0.2, gain: 1.4, cap: 3, fn(v) {
    const lp = v.filt('lowpass', 3000, 0.7);
    v.tone('triangle', 880, perc(0.22, 0.002, 0.08), lp);
    v.tone('triangle', 659.3, perc(0.2, 0.002, 0.12, 0.06), lp);
  } },
  ui_error: { len: 0.2, gain: 1.3, cap: 2, fn(v) {
    const lp = v.filt('lowpass', 1100, 1);
    for (const t of [0, 0.1]) {
      v.tone('square', 196, perc(0.14, 0.003, 0.08, t), lp);
      v.tone('sawtooth', 185, perc(0.11, 0.003, 0.08, t), lp);
    }
  } },
  ui_ready: { len: 0.5, cap: 2, rev: 0.2, fn(v) {
    const lp = v.filt('lowpass', 4500, 0.8);
    v.tone('square', 1046.5, perc(0.11, 0.002, 0.12), lp);
    v.tone('square', 1568, perc(0.12, 0.002, 0.25, 0.08), lp);
    I.bell(v, 0.08, 3136, 0.4, 0.35, { ratio: 2, idx: 1 });
    v.hiss('white', [[0.06, 0], [0.12, 0.05], [0.45, EPS, 'x']], [['highpass', 7000, 0.7]]);
  } },
  buy: { len: 0.6, cap: 3, rev: 0.15, fn(v) {
    const lp = v.filt('lowpass', 5000, 0.7);
    v.tone('square', [[0, 987.8], [0.07, 1318.5, 'h']], [[0, 0], [0.002, 0.13], [0.07, 0.12], [0.42, EPS, 'x']], lp);
    I.bell(v, 0.07, 2637, 0.5, 0.45, { ratio: 3.01, idx: 2 });
    v.hiss('white', perc(0.08, 0.0005, 0.02), [['bandpass', 6000, 2]]);
  } },
  sell: { len: 0.4, cap: 3, rev: 0.12, fn(v) {
    const lp = v.filt('lowpass', 4000, 0.7);
    v.tone('square', [[0, 1318.5], [0.06, 987.8, 'h']], [[0, 0], [0.002, 0.1], [0.06, 0.09], [0.3, EPS, 'x']], lp);
    I.bell(v, 0.06, 1975.5, 0.3, 0.3, { ratio: 3.01, idx: 1.5 });
  } },
  gold: { len: 0.3, gain: 1.5, cap: 4, jit: 0.05, rev: 0.1, fn(v) {
    for (const t of [0, 0.045, 0.09]) {
      const f = v.R(3000, 4600);
      v.fm(f, 1.41, [[t, 2], [t + 0.15, 0.2, 'x']], perc(0.09, 0.0008, 0.15, t));
      v.tone('sine', f * 1.5, perc(0.035, 0.001, 0.08, t));
    }
  } },
  countdown: { len: 0.07, cap: 2, fn(v) { I.block(v, 0, 0.75, 1250); } },
  notready: { len: 0.13, cap: 2, fn(v) {
    v.tone('triangle', [[0, 250], [0.1, 190, 'x']], perc(0.32, 0.004, 0.1), v.filt('lowpass', 700, 0.7));
    v.tone('sine', [[0, 125], [0.1, 95, 'x']], perc(0.16, 0.004, 0.08));
  } },

  // ===== combat =======================================================================
  whiff_l: { len: 0.14, cap: 4, jit: 0.07, fn(v) { whoosh(v, 2600, 1300, 0.13, 1.6, 1.4); } },
  whiff_m: { len: 0.2, cap: 4, jit: 0.07, fn(v) {
    whoosh(v, 1800, 800, 0.19, 1.8, 1.2);
    whoosh(v, 3600, 2000, 0.12, 0.35, 2, 'white', 0.02);
  } },
  whiff_h: { len: 0.3, cap: 4, jit: 0.06, fn(v) {
    whoosh(v, 1300, 420, 0.29, 2.1, 1.0);
    v.tone('sine', [[0, 140], [0.25, 80, 'x']], swell(0.12, 0.08, 0.18));
  } },
  whiff_blade: { len: 0.22, gain: 1.3, cap: 4, jit: 0.06, fn(v) {
    v.hiss('white', [[0, 0], [0.05, 0.9], [0.2, EPS, 'x']], [['bandpass', [[0, 7500], [0.2, 3200, 'x']], 2.5]]);
    v.tone('sine', [[0, 4400], [0.2, 3600, 'x']], swell(0.035, 0.04, 0.16));
    v.fm(5400, 1.41, 2, swell(0.025, 0.05, 0.15));
  } },
  hit_l: { len: 0.12, cap: 6, jit: 0.05, fn(v) {
    impact(v, { len: 0.12, click: 0.38, lp: 6500, drive: 0.5, post: 0.45, nf: [2200, 700], nd: 0.045, f: [300, 110], fd: 0.04, ta: 0.8, td: 0.06, smack: 0.5 });
  } },
  hit_m: { len: 0.2, cap: 6, jit: 0.05, fn(v) {
    impact(v, { len: 0.2, click: 0.42, lp: 5500, drive: 0.6, post: 0.55, nf: [1600, 380], nd: 0.08, f: [220, 70], fd: 0.06, ta: 0.9, td: 0.1, smack: 0.6, sub: [110, 55, 0.08, 0.3, 0.12] });
  } },
  hit_h: { len: 0.3, cap: 6, jit: 0.05, rev: 0.08, fn(v) {
    impact(v, { len: 0.3, click: 0.45, lp: 4800, drive: 0.7, post: 0.6, nf: [1300, 250], nd: 0.13, f: [170, 50], fd: 0.09, ta: 1, td: 0.17, smack: 0.7, sub: [95, 38, 0.15, 0.45, 0.25] });
  } },
  hit_blade: { len: 0.3, gain: 1.4, cap: 5, jit: 0.05, rev: 0.1, fn(v) {
    v.hiss('white', perc(0.9, 0.001, 0.1), [['bandpass', [[0, 7000], [0.1, 2500, 'x']], 2]]);
    v.tone('sine', [[0, 240], [0.06, 90, 'x']], perc(0.9, 0.001, 0.06), v.drive(0.4, v.out, 0.4));
    v.fm(3100 * v.R(0.95, 1.05), 1.41, [[0, 4], [0.25, 0.3, 'x']], perc(0.07, 0.001, 0.25));
    v.tone('sine', 4650, perc(0.045, 0.001, 0.18));
    v.hiss('white', perc(0.3, 0.0003, 0.006), [['highpass', 4000, 0.7]]);
  } },
  hit_magic: { len: 0.5, cap: 5, jit: 0.04, rev: 0.25, fn(v) {
    const d = v.drive(0.5, v.filt('lowpass', 5000, 0.7), 0.4);
    v.hiss('white', perc(1, 0.001, 0.07), [['bandpass', [[0, 1300], [0.07, 400, 'x']], 0.9]], d);
    v.tone('sine', [[0, 200], [0.06, 80, 'x']], perc(0.8, 0.001, 0.09), d);
    const m = 84 + v.pick([0, 3, 5, 7, 10]);
    I.bell(v, 0, mtof(m), 0.45, 0.42, { ratio: 3.5, idx: 2 });
    I.bell(v, 0.03, mtof(m + 7), 0.35, 0.22, { ratio: 3.5, idx: 1.5 });
    v.hiss('white', perc(0.16, 0.005, 0.25), [['highpass', 6000, 0.7]]);
  } },
  hit_u: { len: 1.2, gain: 0.8, cap: 3, jit: 0.03, rev: 0.3, fn(v) {
    impact(v, { len: 0.5, click: 0.5, lp: 4200, drive: 0.8, post: 0.6, nf: [1100, 180], nd: 0.22, f: [140, 40], fd: 0.15, ta: 1, td: 0.3, smack: 0.8, sub: [80, 26, 0.4, 0.6, 0.6] });
    const tail = v.hiss('pink', [[0.01, 0], [0.04, 0.45], [1.15, EPS, 'x']], [['lowpass', [[0, 1400], [1.1, 180, 'x']], 0.7]]);
    v.send(tail, 0.5);
    v.hiss('white', perc(0.3, 0.0003, 0.03), [['highpass', 4000, 0.7]]);
  } },
  counter: { len: 0.3, gain: 2.2, cap: 3, rev: 0.1, fn(v) {
    v.tone('square', [[0, 2700], [0.07, 1900, 'x']], perc(0.1, 0.001, 0.1), v.filt('highpass', 900, 0.7));
    v.fm(3300, 1.41, [[0, 3], [0.25, 0.3, 'x']], perc(0.14, 0.001, 0.26));
    v.hiss('white', perc(0.3, 0.0004, 0.03), [['highpass', 6000, 0.7]]);
    v.tone('sine', [[0, 1650], [0.12, 2200]], perc(0.08, 0.002, 0.15));
  } },
  block: { len: 0.15, cap: 4, jit: 0.05, fn(v) {
    const j = v.R(0.92, 1.08);
    v.tone('sine', [[0, 200 * j], [0.06, 120, 'x']], perc(0.6, 0.001, 0.08), v.filt('lowpass', 1000, 0.7));
    v.hiss('white', perc(0.55, 0.001, 0.05), [['lowpass', 900 * j, 0.8]]);
    v.tone('sine', 1850 * j, perc(0.07, 0.001, 0.12));
    v.tone('sine', 2790 * j, perc(0.045, 0.001, 0.08));
    v.hiss('white', perc(0.15, 0.0003, 0.006), [['highpass', 2200, 0.7]]);
  } },
  block_heavy: { len: 0.25, gain: 0.7, cap: 4, jit: 0.05, rev: 0.06, fn(v) {
    const j = v.R(0.92, 1.08);
    const d = v.drive(0.35, v.filt('lowpass', 1400, 0.7), 0.6);
    v.tone('sine', [[0, 160 * j], [0.1, 72, 'x']], perc(0.9, 0.001, 0.15), d);
    v.hiss('white', perc(0.7, 0.001, 0.09), [['lowpass', 800 * j, 0.8]], d);
    v.fm(1350 * j, 1.5, [[0, 2.5], [0.22, 0.2, 'x']], perc(0.08, 0.001, 0.22));
    v.tone('sine', 2120 * j, perc(0.05, 0.001, 0.12));
    v.hiss('white', perc(0.14, 0.003, 0.12), [['bandpass', 3200, 2]]);
  } },
  armor: { len: 0.4, gain: 1.2, cap: 4, jit: 0.04, rev: 0.15, fn(v) {
    const j = v.R(0.94, 1.06);
    v.fm(420 * j, 1.41, [[0, 6], [0.35, 0.5, 'x']], perc(0.26, 0.001, 0.36));
    v.fm(1130 * j, 2.76, [[0, 3], [0.2, 0.2, 'x']], perc(0.12, 0.001, 0.2));
    v.hiss('white', perc(0.35, 0.0005, 0.04), [['bandpass', 2500, 1.5]]);
    v.tone('sine', [[0, 160], [0.06, 90, 'x']], perc(0.45, 0.001, 0.08));
  } },
  clash: { len: 0.55, cap: 3, jit: 0.03, rev: 0.3, fn(v) {
    const bp = v.filt('bandpass', 950, 1);
    v.tone('sawtooth', [[0, 320], [0.12, 640, 'x']], perc(0.2, 0.002, 0.3), bp);
    v.tone('sawtooth', [[0, 1150], [0.12, 645, 'x']], perc(0.2, 0.002, 0.3), bp);
    const d = v.drive(0.6, v.filt('lowpass', 5000, 0.7), 0.42);
    v.hiss('white', perc(1, 0.001, 0.12), [['bandpass', [[0, 2600], [0.12, 800, 'x']], 0.8]], d);
    v.tone('sine', [[0, 130], [0.1, 60, 'x']], perc(0.8, 0.001, 0.12), d);
    v.hiss('crackle', perc(0.5, 0.001, 0.38), [['highpass', 1500, 0.7]]);
    v.fm(1560, 1.5, [[0, 3], [0.5, 0.2, 'x']], perc(0.1, 0.001, 0.5));
  } },
  grab: { len: 0.12, gain: 1.5, cap: 3, jit: 0.05, fn(v) {
    const n = v.nsrc('white', 0, 0.12);
    v.hiss(n, perc(0.55, 0.002, 0.035), [['bandpass', 950, 1.2]]);
    v.hiss(n, perc(0.5, 0.002, 0.05, 0.045), [['bandpass', 750, 1.2]]);
    v.tone('sine', [[0, 160], [0.06, 95, 'x']], perc(0.4, 0.002, 0.07));
  } },
  throw_slam: { len: 0.45, gain: 0.8, cap: 3, jit: 0.04, rev: 0.2, fn(v) {
    v.tone('sine', [[0, 115], [0.2, 34, 'x']], perc(0.85, 0.001, 0.38));
    const d = v.drive(0.6, v.filt('lowpass', 3500, 0.7), 0.5);
    v.hiss('white', perc(1, 0.001, 0.25), [['lowpass', [[0, 1400], [0.25, 200, 'x']], 0.8]], d);
    v.hiss('white', perc(0.4, 0.0005, 0.03), [['bandpass', 2000, 1.2]], d);
    scatter(v, 6, 0.05, 0.3, 0.25, 0.02, 1500, 3500, 2);
  } },
  tech: { len: 0.25, gain: 2.0, cap: 2, rev: 0.12, fn(v) {
    I.clap(v, 0, 0.85, { f: 1500, dec: 0.12 });
    v.tone('sine', 2900, perc(0.1, 0.001, 0.15));
    v.hiss('white', perc(0.2, 0.0003, 0.01), [['highpass', 4000, 0.7]]);
  } },
  jump: { len: 0.16, cap: 3, jit: 0.06, fn(v) {
    whoosh(v, 700, 2200, 0.16, 0.9, 1.2, 'white', 0, 0.3);
    v.tone('sine', [[0, 220], [0.08, 420, 'x']], perc(0.1, 0.005, 0.08));
  } },
  land: { len: 0.1, cap: 3, jit: 0.06, fn(v) {
    v.tone('sine', [[0, 130], [0.07, 58, 'x']], perc(0.5, 0.001, 0.09));
    v.hiss('white', perc(0.45, 0.001, 0.06), [['lowpass', 700, 0.8]]);
    v.hiss('white', perc(0.08, 0.001, 0.035), [['bandpass', 2500, 1]]);
  } },
  dash: { len: 0.2, cap: 3, jit: 0.05, fn(v) {
    v.hiss('white', [[0, 0], [0.05, 1.3], [0.2, EPS, 'x']], [['bandpass', [[0, 1100], [0.06, 2800, 'x'], [0.2, 1400, 'x']], 1.3]]);
    v.hiss('white', [[0, 0], [0.04, 0.15], [0.14, EPS, 'x']], [['highpass', 4000, 0.7]]);
  } },
  rush: { len: 0.45, cap: 2, fn(v) {
    const lp = v.filt('lowpass', [[0, 400], [0.36, 3200, 'x']], 4);
    v.tone('sawtooth', [[0, 150], [0.36, 700, 'x']], [[0, 0], [0.26, 0.15], [0.4, EPS, 'x']], lp);
    v.tone('sawtooth', [[0, 151.5], [0.36, 706, 'x']], [[0, 0], [0.26, 0.11], [0.4, EPS, 'x']], lp);
    whoosh(v, 500, 3800, 0.42, 1.5, 1.1, 'white', 0, 0.75);
    v.tone('sine', [[0.3, 160], [0.38, 80, 'x']], perc(0.35, 0.002, 0.08, 0.3));
  } },
  kd: { len: 0.5, gain: 0.75, cap: 3, jit: 0.04, rev: 0.15, fn(v) {
    const d = v.drive(0.5, v.filt('lowpass', 2500, 0.7), 0.55);
    v.tone('sine', [[0, 105], [0.15, 40, 'x']], perc(0.9, 0.001, 0.24), d);
    v.hiss('white', perc(0.8, 0.001, 0.12), [['lowpass', 900, 0.8]], d);
    v.tone('sine', [[0.14, 95], [0.24, 45, 'x']], perc(0.45, 0.001, 0.12, 0.14), d);
    v.hiss('white', perc(0.35, 0.001, 0.06, 0.14), [['lowpass', 700, 0.8]], d);
    v.hiss('pink', [[0.02, 0], [0.07, 0.25], [0.5, EPS, 'x']], [['bandpass', 1800, 0.7]]);
  } },
  dispel: { len: 1.0, gain: 0.85, cap: 2, rev: 0.45, fn(v) {
    v.hiss('white', perc(0.8, 0.001, 0.6), [['highpass', [[0, 9000], [0.4, 1400, 'x']], 0.7]]);
    v.tone('sine', [[0, 600], [0.25, 2400, 'x']], perc(0.14, 0.002, 0.3));
    I.bell(v, 0, 1760, 0.9, 0.5, { ratio: 2.01, idx: 4 });
    v.tone('sine', [[0, 140], [0.3, 40, 'x']], perc(0.75, 0.001, 0.38));
    v.hiss('crackle', perc(0.35, 0.001, 0.45), [['highpass', 3000, 0.7]]);
  } },

  // ===== elements =====================================================================
  holy_cast: { len: 0.85, cap: 3, rev: 0.45, fn(v) {
    const g = v.gain([[0, 0], [0.14, 0.075], [0.85, EPS, 'x']]);
    for (const f of [880, 1108.7, 1318.5, 1760]) { v.osc('triangle', f, g, 0, 0.86, -6); v.osc('sine', f, g, 0, 0.86, 7); }
    v.hiss('white', [[0, 0], [0.15, 0.18], [0.65, EPS, 'x']], [['highpass', 6000, 0.7]]);
    I.bell(v, 0.1, 2637, 0.7, 0.4, { ratio: 3.01, idx: 2 });
    v.tone('sine', [[0, 440], [0.3, 880, 'x']], swell(0.08, 0.2, 0.5));
  } },
  holy_impact: { len: 0.9, cap: 3, jit: 0.03, rev: 0.4, fn(v) {
    I.bell(v, 0, 1046.5, 0.9, 0.8, { ratio: 3.5, idx: 5 });
    I.bell(v, 0, 1568, 0.6, 0.45, { ratio: 2, idx: 2 });
    v.tone('sine', [[0, 230], [0.08, 90, 'x']], perc(0.55, 0.001, 0.1));
    v.hiss('white', perc(0.4, 0.001, 0.22), [['highpass', 5000, 0.7]]);
    v.hiss('white', perc(0.25, 0.0003, 0.008), [['highpass', 2500, 0.7]]);
  } },
  shadow_cast: { len: 0.55, cap: 3, rev: 0.3, fn(v) {
    const lp = v.filt('lowpass', [[0, 200], [0.32, 1400, 'x'], [0.55, 150, 'x']], 6);
    const g = [[0, 0], [0.3, 0.3], [0.55, EPS, 'x']];
    v.tone('sawtooth', 55, g, lp);
    v.tone('sawtooth', 55.8, g, lp);
    v.hiss('brown', [[0, 0], [0.28, 0.9], [0.52, EPS, 'x']], [['lowpass', [[0, 300], [0.3, 1600, 'x'], [0.5, 200, 'x']], 1]]);
    v.fm(110, 0.5, 6, [[0, 0], [0.3, 0.22], [0.5, EPS, 'x']]);
  } },
  shadow_impact: { len: 0.65, gain: 0.8, cap: 3, jit: 0.04, rev: 0.35, fn(v) {
    v.tone('sine', [[0, 120], [0.25, 35, 'x']], perc(0.8, 0.001, 0.32));
    const d = v.drive(0.7, v.filt('lowpass', 2500, 0.7), 0.45);
    v.hiss('brown', perc(1, 0.001, 0.3), [['lowpass', [[0, 1500], [0.3, 200, 'x']], 0.8]], d);
    v.fm(98, 1.5, [[0, 8], [0.6, 1, 'x']], perc(0.25, 0.002, 0.6));
    v.hiss('pink', [[0, 0], [0.06, 0.35], [0.65, EPS, 'x']], [['lowpass', 600, 0.7]]);
  } },
  arcane_cast: { len: 0.45, cap: 3, rev: 0.35, fn(v) {
    const am = v.gain(0.7);
    v.lfo(14, 0.3, am.gain, 0, 0.46);
    v.fm([[0, 500], [0.38, 1000, 'x']], 2, [[0, 1], [0.38, 4]], [[0, 0], [0.08, 0.24], [0.45, EPS, 'x']], am);
    v.fm([[0, 750], [0.38, 1500, 'x']], 2, [[0, 0.5], [0.38, 3]], [[0.04, 0], [0.12, 0.12], [0.45, EPS, 'x']], am);
    v.hiss('white', [[0, 0], [0.2, 0.16], [0.45, EPS, 'x']], [['highpass', 7000, 0.7]]);
  } },
  arcane_impact: { len: 0.45, cap: 3, jit: 0.04, rev: 0.3, fn(v) {
    v.tone('square', [[0, 1400], [0.15, 180, 'x']], perc(0.18, 0.001, 0.18), v.filt('lowpass', 4000, 0.7));
    v.hiss('white', perc(0.5, 0.001, 0.08), [['bandpass', 3000, 1]]);
    v.fm(880, 1.5, [[0, 5], [0.4, 0.3, 'x']], perc(0.18, 0.001, 0.42));
    v.tone('sine', [[0, 200], [0.06, 70, 'x']], perc(0.5, 0.001, 0.08));
  } },
  frost_cast: { len: 0.55, gain: 1.4, cap: 3, rev: 0.45, fn(v) {
    const sc = [1318.5, 1568, 1760, 1975.5, 2349.3, 2637];
    for (let i = 0; i < 6; i++) {
      const t = i * 0.045 + v.R(0, 0.01), f = sc[i] * v.R(0.995, 1.005);
      v.tone('sine', f, perc(0.08, 0.001, 0.25, t));
      v.tone('sine', f * 2.76, perc(0.025, 0.001, 0.08, t));
    }
    v.hiss('white', [[0, 0], [0.15, 0.22], [0.5, EPS, 'x']], [['highpass', 5000, 0.7]]);
    v.tone('sine', [[0, 2637], [0.45, 3520, 'x']], [[0, 0], [0.2, 0.04], [0.5, EPS, 'x']]);
  } },
  frost_impact: { len: 0.6, cap: 3, rev: 0.35, fn(v) {
    v.hiss('white', perc(0.9, 0.0003, 0.03), [['highpass', 2500, 0.7]]);
    v.hiss('white', perc(0.4, 0.0005, 0.06), [['bandpass', 5000, 2]]);
    for (let i = 0; i < 8; i++) {
      const t = v.R(0.01, 0.25);
      v.tone('sine', v.R(2500, 7000), perc(v.R(0.025, 0.07), 0.0005, v.R(0.08, 0.22), t));
    }
    v.tone('sine', [[0, 170], [0.08, 70, 'x']], perc(0.5, 0.001, 0.1));
    v.hiss('white', perc(0.18, 0.01, 0.4), [['highpass', 6000, 0.7]]);
  } },
  nature_cast: { len: 0.5, gain: 1.6, cap: 3, rev: 0.25, fn(v) {
    scatter(v, 9, 0, 0.38, 0.4, 0.04, 1800, 4200, 1.2, v.out, 'pink');
    v.tone('sine', 520, perc(0.3, 0.001, 0.05));
    v.tone('sine', 780, perc(0.12, 0.001, 0.03));
    v.tone('triangle', [[0, 330], [0.3, 495, 'x']], [[0, 0], [0.25, 0.1], [0.5, EPS, 'x']]);
  } },
  nature_impact: { len: 0.5, cap: 3, rev: 0.2, fn(v) {
    const j = v.R(0.92, 1.08);
    for (const [t, f] of [[0, 380], [0.04, 520], [0.09, 300], [0.15, 450]]) {
      v.tone('sine', [[t, f * 1.3 * j], [t + 0.02, f * j, 'x']], perc(0.38, 0.001, 0.06, t));
      v.hiss('white', perc(0.18, 0.0008, 0.025, t), [['bandpass', f * 2.2, 3]]);
    }
    v.tone('sawtooth', [[0.05, 72], [0.4, 54, 'x']], [[0.05, 0], [0.1, 0.5], [0.4, EPS, 'x']], v.filt('bandpass', 800, 4));
    v.tone('sine', [[0, 140], [0.1, 60, 'x']], perc(0.5, 0.001, 0.12));
    v.hiss('pink', perc(0.2, 0.01, 0.3), [['bandpass', 3000, 0.8]]);
  } },
  fire_cast: { len: 0.65, cap: 3, rev: 0.2, fn(v) {
    v.hiss('pink', [[0, 0], [0.25, 0.9], [0.62, EPS, 'x']], [['lowpass', [[0, 400], [0.3, 3200, 'x'], [0.6, 800, 'x']], 1]]);
    v.hiss('crackle', [[0, 0], [0.12, 0.7], [0.62, EPS, 'x']], [['highpass', 2000, 0.7]]);
    v.hiss('brown', [[0, 0], [0.25, 0.7], [0.62, EPS, 'x']], [['lowpass', 300, 0.8]]);
  } },
  fire_impact: { len: 1.0, gain: 0.75, cap: 3, jit: 0.04, rev: 0.3, fn(v) {
    const d = v.drive(0.6, v.filt('lowpass', 4500, 0.7), 0.5);
    v.hiss('white', perc(1, 0.002, 0.6), [['lowpass', [[0, 4000], [0.5, 300, 'x']], 0.8]], d);
    v.tone('sine', [[0, 90], [0.3, 35, 'x']], perc(0.8, 0.002, 0.4));
    v.hiss('crackle', perc(0.7, 0.001, 0.85), [['highpass', 1500, 0.7]]);
    v.hiss('brown', [[0, 0], [0.05, 0.8], [0.95, EPS, 'x']], [['lowpass', 600, 0.8]]);
  } },
  earth_cast: { len: 0.65, cap: 3, rev: 0.2, fn(v) {
    v.hiss('brown', [[0, 0], [0.3, 1.2], [0.62, EPS, 'x']], [['lowpass', 220, 1]]);
    v.tone('sine', 48, [[0, 0], [0.2, 0.4], [0.62, EPS, 'x']]);
    scatter(v, 6, 0.05, 0.5, 0.25, 0.025, 1500, 3500, 2);
  } },
  earth_impact: { len: 1.0, gain: 0.8, cap: 3, jit: 0.04, rev: 0.25, fn(v) {
    v.tone('sine', [[0, 85], [0.35, 30, 'x']], perc(1, 0.002, 0.45));
    const d = v.drive(0.7, v.filt('lowpass', 3000, 0.7), 0.5);
    v.hiss('brown', perc(1, 0.002, 0.4), [['lowpass', 500, 0.8]], d);
    v.hiss('white', perc(0.5, 0.0005, 0.04), [['bandpass', 1500, 1]], d);
    scatter(v, 10, 0.02, 0.5, 0.35, 0.04, 800, 3000, 2);
    v.hiss('brown', [[0, 0], [0.05, 0.9], [0.95, EPS, 'x']], [['lowpass', 150, 0.8]]);
  } },
  whip_crack: { len: 0.25, cap: 3, jit: 0.05, rev: 0.15, fn(v) {
    v.hiss('white', [[0, 0], [0.12, 0.45], [0.14, EPS, 'x']], [['bandpass', [[0, 1500], [0.13, 5000, 'x']], 1]]);
    const d = v.drive(0.5, v.out, 0.6);
    v.hiss('white', perc(1, 0.0002, 0.012, 0.13), [['highpass', 1500, 0.7]], d);
    v.hiss('white', perc(0.5, 0.0005, 0.05, 0.13), [['bandpass', 3000, 1]], d);
  } },
  teleport: { len: 0.45, cap: 3, rev: 0.4, fn(v) {
    v.fm([[0, 300], [0.15, 3000, 'x']], 0.5, 3, [[0, 0], [0.02, 0.22], [0.2, EPS, 'x']]);
    v.tone('square', [[0.1, 2500], [0.22, 200, 'x']], perc(0.12, 0.001, 0.12, 0.1), v.filt('lowpass', 3000, 0.7));
    v.hiss('white', [[0, 0], [0.08, 0.25], [0.32, EPS, 'x']], [['highpass', 5000, 0.7]]);
    for (const t of [0.12, 0.16, 0.2]) v.tone('sine', v.R(3000, 5000), perc(0.05, 0.001, 0.15, t));
  } },
  beam: { len: 1.85, gain: 0.7, cap: 2, rev: 0.25, fn(v) {
    const L = 1.8;
    const wg = v.gain([[0, 0], [0.35, 0.1], [1.4, 0.085], [L, 0]]);
    const w1 = v.osc('sine', [[0, 400], [0.45, 1300, 'x'], [L, 1240, 'x']], wg, 0, L + 0.01);
    v.osc('triangle', [[0, 603], [0.45, 1960, 'x'], [L, 1870, 'x']], wg, 0, L + 0.01);
    v.lfo(7, 25, w1.detune, 0, L + 0.01);
    const d = v.drive(0.5, v.out, 0.45);
    const lp = v.filt('lowpass', [[0, 200], [0.3, 1700, 'x'], [1.4, 1200], [L, 300, 'x']], 2, d);
    const bg = v.gain([[0, 0], [0.25, 0.5], [1.4, 0.45], [L, 0]], lp);
    v.osc('sawtooth', 55, bg, 0, L + 0.01);
    v.osc('sawtooth', 55.7, bg, 0, L + 0.01);
    v.osc('sawtooth', 110.4, bg, 0, L + 0.01);
    const am = v.gain(0.75);
    v.lfo(13, 0.25, am.gain, 0, L + 0.01);
    v.hiss('pink', [[0, 0], [0.2, 0.55], [1.4, 0.5], [L, 0]], [['lowpass', 2600, 0.7]], am);
    v.hiss('white', perc(0.4, 0.0005, 0.05), [['highpass', 3000, 0.7]]);
  } },
  explosion: { len: 1.4, gain: 0.7, cap: 3, jit: 0.04, rev: 0.35, fn(v) {
    v.hiss('white', perc(0.5, 0.0003, 0.025), [['highpass', 3000, 0.7]]);
    v.tone('sine', [[0, 70], [0.5, 24, 'x']], perc(1, 0.002, 0.8));
    const d = v.drive(0.7, v.filt('lowpass', 5000, 0.7), 0.5);
    v.hiss('white', perc(1, 0.002, 0.9), [['lowpass', [[0, 3000], [0.8, 150, 'x']], 0.8]], d);
    v.hiss('crackle', perc(0.6, 0.002, 1.2), [['highpass', 1000, 0.7]]);
    v.hiss('brown', [[0, 0], [0.08, 1], [1.4, EPS, 'x']], [['lowpass', 200, 0.8]]);
  } },
  shockwave: { len: 0.7, gain: 0.75, cap: 3, rev: 0.3, fn(v) {
    v.tone('sine', [[0, 120], [0.35, 35, 'x']], [[0, 0], [0.03, 0.8], [0.45, EPS, 'x']]);
    v.hiss('white', [[0, 0], [0.02, 1], [0.65, EPS, 'x']], [['bandpass', [[0, 3000], [0.6, 200, 'x']], 1]]);
    v.hiss('white', [[0, 0], [0.05, 0.3], [0.4, EPS, 'x']], [['highpass', 4000, 0.7]]);
  } },
  buff: { len: 0.9, cap: 2, rev: 0.35, fn(v) {
    const lp = v.filt('lowpass', [[0, 300], [0.5, 5000, 'x'], [0.75, 2000, 'x']], 2);
    const g = v.gain([[0, 0], [0.45, 0.15], [0.75, EPS, 'x']], lp);
    for (const m of [60, 64, 67, 72]) {
      const f = mtof(m), fe = [[0, f], [0.5, f * 1.122, 'x']];
      v.osc('sawtooth', fe, g, 0, 0.76, -8);
      v.osc('sawtooth', fe, g, 0, 0.76, 8);
    }
    I.bell(v, 0.45, 2093, 0.5, 0.45, { ratio: 3.01, idx: 2 });
    v.hiss('white', [[0.3, 0], [0.5, 0.2], [0.9, EPS, 'x']], [['highpass', 6000, 0.7]]);
  } },
  heal: { len: 1.0, cap: 2, rev: 0.5, fn(v) {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      const t = i * 0.07;
      v.fm(f, 2, [[t, 1.5], [t + 0.6, 0.2, 'x']], perc(0.13, 0.004, 0.6, t));
    });
    const g = [[0, 0], [0.2, 0.07], [0.85, EPS, 'x']];
    v.tone('sine', 523.25, g);
    v.tone('sine', 783.99, g);
    v.hiss('white', [[0, 0], [0.2, 0.12], [0.85, EPS, 'x']], [['highpass', 5000, 0.7]]);
  } },
  root: { len: 0.5, cap: 2, rev: 0.2, fn(v) {
    const am = v.gain(0.6);
    v.lfo(28, 0.4, am.gain, 0, 0.3, 'square');
    v.tone('sawtooth', [[0, 62], [0.25, 48, 'x']], [[0, 0], [0.05, 1.2], [0.22, 0.9], [0.28, EPS, 'x']], v.filt('bandpass', 900, 5, am));
    v.tone('sine', 600, perc(0.4, 0.001, 0.04, 0.25));
    v.tone('sine', 420, perc(0.35, 0.001, 0.05, 0.29));
    v.hiss('white', perc(0.6, 0.0003, 0.015, 0.25), [['highpass', 2000, 0.7]]);
    v.hiss('pink', [[0, 0], [0.1, 0.15], [0.35, EPS, 'x']], [['bandpass', 2500, 0.8]]);
  } },
  slow: { len: 0.5, cap: 2, rev: 0.35, fn(v) {
    v.hiss('white', [[0, 0], [0.12, 0.8], [0.5, EPS, 'x']], [['bandpass', [[0, 7000], [0.45, 1800, 'x']], 2]]);
    v.tone('sine', [[0, 2200], [0.45, 900, 'x']], [[0, 0], [0.05, 0.08], [0.45, EPS, 'x']]);
    v.tone('sine', [[0, 3300], [0.45, 1350, 'x']], [[0, 0], [0.05, 0.04], [0.4, EPS, 'x']]);
  } },

  // ===== ultimate =====================================================================
  ult_cast: { len: 1.7, gain: 0.7, cap: 2, rev: 0.5, fn(v) {
    const R = 0.32;
    v.hiss('white', [[0, 0], [R - 0.02, 0.7], [R + 0.01, EPS, 'x']], [['bandpass', [[0, 400], [R, 6000, 'x']], 2]]);
    v.tone('sawtooth', [[0, 180], [R, 900, 'x']], [[0, 0], [R - 0.04, 0.14], [R + 0.01, EPS, 'x']], v.filt('lowpass', 3000, 0.7));
    I.choir(v, R, [50, 57, 62, 65, 69], 0.5, 0.9, { att: 0.02, rel: 0.9 });
    I.brass(v, R, [38, 50, 57, 62], 0.35, 0.7, { cut: 2200, rel: 0.5 });
    v.tone('sine', [[R, 90], [R + 0.4, 30, 'x']], perc(0.9, 0.002, 0.6, R));
    I.crash(v, R, 0.8, { dec: 1.2 });
  } },
  ult_impact: { len: 1.9, gain: 0.65, cap: 2, rev: 0.45, fn(v) {
    impact(v, { len: 0.6, click: 0.5, lp: 4000, drive: 0.85, post: 0.6, nf: [1000, 160], nd: 0.25, f: [130, 36], fd: 0.18, ta: 1, td: 0.35, smack: 0.8, sub: [70, 22, 0.5, 0.7, 0.9] });
    v.hiss('white', perc(0.5, 0.002, 1.0), [['lowpass', [[0, 3000], [0.9, 150, 'x']], 0.8]]);
    v.hiss('crackle', perc(0.5, 0.002, 1.2), [['highpass', 1200, 0.7]]);
    I.crash(v, 0, 0.8, { dec: 1.6 });
    I.choir(v, 0.02, [45, 52, 57, 61, 64], 0.4, 0.6, { att: 0.03, rel: 1.0 });
  } },

  // ===== MOBA / round =================================================================
  level_up: { len: 1.4, cap: 2, rev: 0.4, fn(v) {
    const lp = v.filt('lowpass', 5000, 0.7);
    [72, 76, 79, 84, 88, 91].forEach((m, i) => {
      const t = i * 0.055;
      v.tone('square', mtof(m), perc(0.07, 0.002, 0.16, t), lp);
      I.bell(v, t, mtof(m), 0.3, 0.25, { ratio: 2, idx: 1 });
    });
    for (const m of [84, 88, 91]) I.bell(v, 0.34, mtof(m), 1.0, 0.35, { ratio: 3.01, idx: 2 });
    v.hiss('white', [[0.2, 0], [0.4, 0.18], [1.2, EPS, 'x']], [['highpass', 7000, 0.7]]);
    v.tone('sine', [[0.3, 2000], [0.9, 4000, 'x']], [[0.3, 0], [0.45, 0.03], [1.0, EPS, 'x']]);
  } },
  rune_spawn: { len: 1.2, gain: 1.3, cap: 1, rev: 0.55, fn(v) {
    const pent = [81, 83, 85, 88, 90, 93, 95, 97];
    for (let i = 0; i < 10; i++) v.tone('sine', mtof(v.pick(pent)), perc(v.R(0.03, 0.06), 0.002, 0.3, v.R(0, 0.7)));
    const g = [[0, 0], [0.4, 0.06], [1.15, EPS, 'x']];
    v.tone('triangle', 880, g);
    v.tone('triangle', 1318.5, g, v.out, 4);
    v.hiss('white', [[0, 0], [0.4, 0.1], [1.1, EPS, 'x']], [['highpass', 6000, 0.7]]);
  } },
  rune_take: { len: 1.1, cap: 2, rev: 0.45, fn(v) {
    I.bell(v, 0, 1174.7, 0.9, 0.6, { ratio: 3.5, idx: 3 });
    I.bell(v, 0.04, 1760, 0.8, 0.5, { ratio: 3.5, idx: 2.5 });
    I.bell(v, 0.08, 2349.3, 0.6, 0.3, { ratio: 2, idx: 1.5 });
    whoosh(v, 800, 5000, 0.25, 0.6, 1.2, 'white', 0, 0.6);
    v.tone('sine', [[0, 200], [0.1, 100, 'x']], perc(0.3, 0.002, 0.1));
  } },
  firstblood: { len: 1.8, gain: 0.75, cap: 1, rev: 0.45, fn(v) {
    v.hiss('white', [[0, 0], [0.26, 0.25], [0.29, EPS, 'x']], [['bandpass', [[0, 800], [0.27, 5000, 'x']], 1.5]]);
    I.timp(v, 0, 0.75, 73.4, 0.6);
    I.brass(v, 0, [50, 53, 57, 62], 0.16, 0.8, { cut: 1600, rel: 0.12 });
    I.timp(v, 0.28, 1, 73.4, 1.3);
    I.brass(v, 0.28, [38, 50, 58, 62, 65], 1.1, 0.95, { cut: 2000, rel: 0.4 });
    I.crash(v, 0.28, 0.7, { dec: 1.4 });
  } },
  round: { len: 3.2, cap: 1, rev: 0.45, fn(v) {
    const f = 98;
    for (const [r, a, d] of [[1, 1, 3.0], [1.52, 0.55, 2.2], [2.0, 0.45, 2.4], [2.63, 0.3, 1.6], [3.17, 0.25, 1.2], [4.22, 0.16, 0.9], [5.43, 0.1, 0.6]]) {
      v.tone('sine', f * r, perc(a * 0.32, 0.004, d));
      if (r < 2.1) v.tone('sine', f * r * 1.004, perc(a * 0.2, 0.004, d * 0.9));
    }
    v.hiss('white', perc(0.35, 0.002, 0.08), [['lowpass', 1500, 0.7]]);
    v.tone('sine', [[0, 230], [0.05, 196, 'x']], perc(0.3, 0.002, 0.06));
    v.tone('sine', 49, [[0, 0], [0.05, 0.3], [3.0, EPS, 'x']]);
  } },
  fight: { len: 1.6, gain: 0.7, cap: 1, rev: 0.35, fn(v) {
    impact(v, { len: 0.35, click: 0.45, lp: 5000, drive: 0.7, post: 0.55, nf: [1300, 250], nd: 0.14, f: [170, 50], fd: 0.09, ta: 1, td: 0.18, smack: 0.6, sub: [90, 40, 0.15, 0.4, 0.3] });
    I.brass(v, 0.01, [38, 50, 57, 62, 66], 0.45, 0.9, { cut: 2400, rel: 0.35 });
    I.crash(v, 0, 0.75, { dec: 1.3 });
    I.timp(v, 0, 0.7, 73.4, 0.8);
  } },
  ko: { len: 2.8, gain: 0.62, cap: 1, rev: 0.75, fn(v) {
    v.hiss('white', perc(0.7, 0.0003, 0.02), [['highpass', 2500, 0.7]]);
    v.tone('sine', [[0, 75], [1.2, 20, 'x']], perc(1, 0.003, 1.6));
    const d = v.drive(0.7, v.filt('lowpass', 4000, 0.7), 0.55);
    v.hiss('white', perc(1, 0.003, 1.4), [['lowpass', [[0, 2500], [1.4, 100, 'x']], 0.8]], d);
    v.tone('sine', 40, [[0, 0], [0.02, 0.5], [2.4, EPS, 'x']]);
    v.hiss('brown', [[0, 0], [0.1, 0.8], [2.6, EPS, 'x']], [['lowpass', 180, 0.8]]);
    I.crash(v, 0, 0.6, { dec: 2.2 });
  } },
  perfect: { len: 2.2, cap: 1, rev: 0.55, fn(v) {
    [84, 88, 91, 95, 98].forEach((m, i) => I.bell(v, i * 0.03, mtof(m), 1.6, 0.4, { ratio: 3.01, idx: 2 }));
    I.brass(v, 0, [48, 60, 64, 67, 71], 0.9, 0.7, { cut: 2600, rel: 0.6 });
    [100, 98, 96, 93, 91, 88, 86, 84].forEach((m, i) => v.tone('sine', mtof(m), perc(0.05, 0.002, 0.35, 0.3 + i * 0.07)));
    v.hiss('white', [[0, 0], [0.3, 0.15], [1.8, EPS, 'x']], [['highpass', 6000, 0.7]]);
  } },
  timeup: { len: 1.6, gain: 0.8, cap: 1, rev: 0.35, fn(v) {
    I.brass(v, 0, [45, 52, 57, 64], 0.3, 0.85, { cut: 1500 });
    I.brass(v, 0.4, [41, 48, 53, 60], 0.8, 0.9, { cut: 1300, rel: 0.35 });
    I.bell(v, 0.4, 220, 1.1, 0.7, { ratio: 1.41, idx: 4 });
    I.timp(v, 0.4, 0.8, 55, 0.9);
  } },
  victory: { len: 3.0, gain: 0.68, cap: 1, rev: 0.4, fn(v) {
    for (const [t, m, d] of [[0, 67, 0.12], [0.14, 72, 0.12], [0.28, 76, 0.12], [0.42, 79, 0.45], [0.92, 76, 0.14], [1.08, 79, 1.5]]) {
      I.brass(v, t, [m], d, 0.75, { cut: 2600, rel: 0.2 });
    }
    I.brass(v, 0.42, [55, 60, 64], 0.45, 0.6, { cut: 1700 });
    I.brass(v, 1.08, [48, 55, 60, 64], 1.5, 0.75, { cut: 1900, rel: 0.5 });
    I.timp(v, 0.42, 0.8, 65.4, 0.6);
    I.timp(v, 1.08, 1, 65.4, 1.4);
    for (let i = 0; i < 6; i++) I.snare(v, 0.92 + i * 0.027, 0.15 + i * 0.05, { dec: 0.08 });
    I.crash(v, 1.08, 0.7, { dec: 1.7 });
    for (const m of [84, 88, 91, 96]) I.bell(v, 1.1, mtof(m), 1.6, 0.25, { ratio: 3.01, idx: 1.5 });
  } },
};

export const SFX_NAMES = Object.keys(SFX);

export const SFX_GROUPS = {
  UI: ['ui_move', 'ui_select', 'ui_back', 'ui_error', 'ui_ready', 'buy', 'sell', 'gold', 'countdown', 'notready'],
  Combat: ['whiff_l', 'whiff_m', 'whiff_h', 'whiff_blade', 'hit_l', 'hit_m', 'hit_h', 'hit_blade', 'hit_magic', 'hit_u', 'counter',
    'block', 'block_heavy', 'armor', 'clash', 'grab', 'throw_slam', 'tech', 'jump', 'land', 'dash', 'rush', 'kd', 'dispel'],
  Elements: ['holy_cast', 'holy_impact', 'shadow_cast', 'shadow_impact', 'arcane_cast', 'arcane_impact', 'frost_cast', 'frost_impact',
    'nature_cast', 'nature_impact', 'fire_cast', 'fire_impact', 'earth_cast', 'earth_impact', 'whip_crack', 'teleport', 'beam',
    'explosion', 'shockwave', 'buff', 'heal', 'root', 'slow'],
  Ultimate: ['ult_cast', 'ult_impact'],
  Round: ['level_up', 'rune_spawn', 'rune_take', 'firstblood', 'round', 'fight', 'ko', 'perfect', 'timeup', 'victory'],
};
