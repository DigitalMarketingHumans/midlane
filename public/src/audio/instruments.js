// MIDLANE audio — synth instruments shared by the music sequencer and SFX recipes.
// Signature: fn(voice, at, ...args) where `at` is the start offset (recipe seconds)
// inside the voice. Output level ≈ vel at peak; mixing happens in the caller.
import { EPS, mtof, perc } from './dsp.js';

// ---- drums ---------------------------------------------------------------------
export function kick(v, at, vel = 1, p = {}) {
  const f0 = p.f0 ?? 155, f1 = p.f1 ?? 47, dec = p.dec ?? 0.34, drop = p.drop ?? 0.065;
  const out = p.drive ? v.drive(p.drive, v.out, 0.85) : v.out;
  v.tone('sine', [[at, f0], [at + drop, f1, 'x'], [at + dec, f1 * 0.85, 'x']], perc(vel * 0.95, 0.0015, dec, at), out);
  v.hiss('white', perc(vel * (p.click ?? 0.28), 0.0004, 0.009, at), [['highpass', 2800, 0.7]], out);
}

export function snare(v, at, vel = 1, p = {}) {
  const dec = p.dec ?? 0.17, tone = p.tone ?? 190;
  v.hiss('white', perc(vel * 0.75, 0.001, dec, at), [['highpass', p.hp ?? 1100, 0.7], ['peaking', 4500, 1, 5]]);
  v.tone('triangle', [[at, tone * 1.6], [at + 0.025, tone, 'x']], perc(vel * 0.6, 0.001, 0.085, at));
  if (p.metal) v.fm(tone * 4.1, 1.41, [[at, 4], [at + 0.2, 0.4, 'x']], perc(vel * 0.12 * p.metal, 0.001, 0.2, at));
}

// 808-style clap: one noise source, multi-burst envelope (cheap)
export function clap(v, at, vel = 1, p = {}) {
  const a = vel * 0.9, dec = p.dec ?? 0.16;
  const e = [[at, 0]];
  for (let i = 0; i < 3; i++) { const t = at + i * 0.011; e.push([t + 0.0006, a, 'h'], [t + 0.009, a * 0.08, 'x']); }
  e.push([at + 0.034, a * 0.8, 'h'], [at + 0.034 + dec, EPS, 'x']);
  v.hiss('white', e, [['bandpass', p.f ?? 1300, 1.1], ['highpass', 500, 0.7]]);
}

export function hat(v, at, vel = 1, open = false, p = {}) {
  const dec = open ? (p.open ?? 0.28) : (p.dec ?? 0.04);
  v.hiss('white', perc(vel * 0.6, 0.0005, dec, at), [['highpass', p.hp ?? 7200, 0.8], ['peaking', 10500, 1.2, 6]]);
  if (p.metal) v.fm(p.metalF ?? 5200, 1.47, [[at, 3], [at + dec, 0.3, 'x']], perc(vel * 0.08 * p.metal, 0.0005, dec * 0.8, at), v.out, 'square');
}

export function crash(v, at, vel = 1, p = {}) {
  const dec = p.dec ?? 1.5;
  const n = v.nsrc('white', at, at + dec + 0.02);
  v.hiss(n, perc(vel * 0.42, 0.002, dec, at), [['highpass', 3800, 0.7], ['peaking', 7500, 1, 4]]);
  v.hiss(n, perc(vel * 0.3, 0.001, 0.22, at), [['bandpass', 4600, 0.9]]);
}

export function tom(v, at, vel = 1, f = 120, p = {}) {
  v.tone('sine', [[at, f * 1.5], [at + 0.045, f, 'x'], [at + (p.dec ?? 0.35), f * 0.9, 'x']], perc(vel * 0.85, 0.001, p.dec ?? 0.35, at));
  v.hiss('white', perc(vel * 0.25, 0.0008, 0.05, at), [['lowpass', 2500, 0.7]]);
}

export function timp(v, at, vel = 1, f = 73, dec = 1.1) {
  v.tone('sine', [[at, f * 1.08], [at + 0.06, f, 'x']], perc(vel * 0.9, 0.003, dec, at));
  v.tone('sine', f * 1.51, perc(vel * 0.25, 0.003, dec * 0.5, at));
  v.hiss('white', perc(vel * 0.3, 0.001, 0.07, at), [['lowpass', 600, 0.7]]);
}

// industrial anvil / metal hit (inharmonic FM)
export function anvil(v, at, vel = 1, f = 760, dec = 0.35) {
  v.fm(f, 2.76, [[at, 5], [at + dec, 0.3, 'x']], perc(vel * 0.32, 0.0005, dec, at));
  v.tone('sine', f * 3.17, perc(vel * 0.1, 0.0005, dec * 0.4, at));
  v.hiss('white', perc(vel * 0.35, 0.0003, 0.018, at), [['bandpass', 3200, 1.2]]);
}

// woodblock / clock tick
export function block(v, at, vel = 1, f = 1250) {
  v.tone('sine', [[at, f * 1.05], [at + 0.02, f, 'x']], perc(vel * 0.5, 0.0008, 0.045, at));
  v.hiss('white', perc(vel * 0.3, 0.0005, 0.012, at), [['bandpass', f * 2.1, 3]]);
}

// noise riser over `len` seconds
export function riser(v, at, len = 1.7, vel = 1) {
  v.hiss('white', [[at, 0], [at + len * 0.95, vel * 0.5], [at + len, EPS, 'x']], [['bandpass', [[at, 400], [at + len, 7000, 'x']], 1.4]]);
}

// shaker (16th groove filler)
export function shaker(v, at, vel = 1) {
  v.hiss('white', [[at, 0], [at + 0.012, vel * 0.3], [at + 0.06, EPS, 'x']], [['bandpass', 6500, 1.5]]);
}

// ---- pitched -------------------------------------------------------------------
export function bass(v, at, m, dur, vel = 1, p = {}) {
  const f = mtof(m), rel = p.rel ?? 0.05, end = at + dur + rel, cut = p.cut ?? 300, env = p.env ?? 1500;
  let to = v.out;
  if (p.drive) to = v.drive(p.drive, to, 0.6);
  const lp = v.filt('lowpass', [[at, cut + env * vel], [at + (p.fdec ?? 0.16), cut, 'x']], p.q ?? 4, to);
  const a = vel * 0.5;
  const g = v.gain([[at, 0], [at + 0.004, a], [at + Math.max(dur, 0.01), a * 0.8], [end, 0]], lp);
  v.osc(p.wave ?? 'sawtooth', f, g, at, end + 0.01, -6);
  v.osc(p.wave2 ?? 'sawtooth', f, g, at, end + 0.01, 6);
  if (p.sub) v.tone('sine', f / 2, [[at, 0], [at + 0.005, vel * p.sub], [at + Math.max(dur, 0.01), vel * p.sub * 0.9], [end, 0]], to);
}

export function pad(v, at, notes, dur, vel = 1, p = {}) {
  const att = Math.min(p.att ?? 0.5, dur * 0.8), rel = p.rel ?? 0.9, end = at + dur + rel, cut = p.cut ?? 1800;
  const lp = v.filt('lowpass', [[at, cut * 0.35], [at + att, cut], [end, cut * 0.5]], p.q ?? 0.8);
  const a = (vel * 0.3) / Math.sqrt(notes.length);
  const g = v.gain([[at, 0], [at + att, a], [at + dur, a * 0.85], [end, 0]], lp);
  const w = p.wave ?? 'sawtooth', dt = p.det ?? 9;
  for (const m of notes) {
    const f = mtof(m);
    v.osc(w, f, g, at, end + 0.01, -dt + v.R(-2, 2));
    v.osc(w, f, g, at, end + 0.01, dt + v.R(-2, 2));
  }
  if (p.shimmer) { // airy octave-up sine layer
    const sg = v.gain([[at, 0], [at + att * 1.5, a * 0.5 * p.shimmer], [end, 0]]);
    for (const m of notes) v.osc('sine', mtof(m + 12), sg, at, end + 0.01, v.R(-4, 4));
  }
}

export function pluck(v, at, m, dur, vel = 1, p = {}) {
  const f = mtof(m), dec = p.dec ?? Math.max(0.12, dur * 1.3), cut = p.cut ?? 900;
  const lp = v.filt('lowpass', [[at, cut + (p.env ?? 3000) * vel], [at + (p.fdec ?? 0.12), cut, 'x']], p.q ?? 1.5);
  const g = v.gain(perc(vel * 0.5, 0.002, dec, at), lp);
  v.osc(p.wave ?? 'square', f, g, at, at + dec + 0.01);
  if (p.det) v.osc(p.wave2 ?? 'sawtooth', f, g, at, at + dec + 0.01, p.det);
}

// glassy FM pluck
export function glass(v, at, m, dur, vel = 1, p = {}) {
  const f = mtof(m), dec = p.dec ?? 0.5;
  v.fm(f, p.ratio ?? 2.0, [[at, p.idx ?? 1.6], [at + dec, 0.1, 'x']], perc(vel * 0.4, 0.0015, dec, at));
  v.tone('sine', f * 4.0, perc(vel * 0.05, 0.001, dec * 0.25, at));
}

export function lead(v, at, m, dur, vel = 1, p = {}) {
  const f = mtof(m), rel = p.rel ?? 0.09, end = at + dur + rel, cut = p.cut ?? 2400;
  let to = v.out;
  if (p.drive) to = v.drive(p.drive, to, 0.5);
  const lp = v.filt('lowpass', [[at, cut * 0.5], [at + 0.03, cut * 1.6], [at + 0.3, cut, 'x']], p.q ?? 1, to);
  const a = vel * 0.32;
  const g = v.gain([[at, 0], [at + (p.att ?? 0.012), a], [at + Math.max(dur, 0.03), a * 0.8], [end, 0]], lp);
  const o1 = v.osc(p.w1 ?? 'sawtooth', f, g, at, end + 0.01, -(p.det ?? 5));
  const o2 = v.osc(p.w2 ?? 'square', f, g, at, end + 0.01, p.det ?? 5);
  if (p.power) { const o3 = v.osc(p.w1 ?? 'sawtooth', f * 1.4983, g, at, end + 0.01); o3.detune.value = 3; }
  if (p.oct) v.osc('sawtooth', f * 0.5, v.gain(p.oct, g), at, end + 0.01);
  if (dur > 0.22 && p.vib !== 0) {
    const vd = p.vib ?? 14;
    const lg = v.gain([[at, 0], [at + 0.18, 0], [at + 0.45, vd]], o1.detune);
    lg.connect(o2.detune);
    v.osc('sine', p.vr ?? 5.5, lg, at, end + 0.01);
  }
  if (p.bell) v.fm(f * 2, 3.5, [[at, 2], [at + 0.4, 0.1, 'x']], perc(vel * 0.12 * p.bell, 0.001, 0.4, at));
}

export function bell(v, at, f, dec = 1.2, vel = 1, p = {}) {
  const r = p.ratio ?? 3.5, i0 = p.idx ?? 3;
  v.fm(f, r, [[at, i0], [at + dec, i0 * 0.06, 'x']], perc(vel * 0.35, 0.0015, dec, at), p.to);
  v.tone('sine', f * (p.p2 ?? 2.0), perc(vel * 0.09, 0.001, dec * 0.35, at), p.to);
}
// bell by MIDI note (music convenience)
export const bellN = (v, at, m, dur, vel = 1, p = {}) => bell(v, at, mtof(m), p.dec ?? Math.min(2.8, Math.max(0.8, dur * 1.5)), vel, p);

// brass section: saws through an opening lowpass ("blat"), slight vibrato
export function brass(v, at, notes, dur, vel = 1, p = {}) {
  const rel = p.rel ?? 0.18, end = at + dur + rel, cut = p.cut ?? 1900;
  const lp = v.filt('lowpass', [[at, 280], [at + 0.06, cut * 1.6], [at + 0.32, cut, 'x'], [end, cut * 0.5]], p.q ?? 1.4);
  const a = (vel * 0.42) / Math.sqrt(notes.length);
  const g = v.gain([[at, 0], [at + (p.att ?? 0.035), a], [at + 0.25, a * 0.82], [at + Math.max(dur, 0.26), a * 0.75], [end, 0]], lp);
  const vib = dur > 0.4 ? v.gain([[at, 0], [at + 0.3, 0], [at + 0.6, 9]], null) : null;
  for (const m of notes) {
    const f = mtof(m);
    const a1 = v.osc('sawtooth', f, g, at, end + 0.01, -7), a2 = v.osc('sawtooth', f, g, at, end + 0.01, 7);
    if (vib) { vib.connect(a1.detune); vib.connect(a2.detune); }
  }
  if (vib) v.osc('sine', 5.2, vib, at, end + 0.01);
}

// choir "aah": detuned saws through three vowel formants
export function choir(v, at, notes, dur, vel = 1, p = {}) {
  const att = p.att ?? 0.08, rel = p.rel ?? 0.6, end = at + dur + rel;
  const a = (vel * 1.6) / Math.sqrt(notes.length);
  const outG = v.gain([[at, 0], [at + att, a], [at + Math.max(dur, att + 0.01), a * 0.8], [end, 0]]);
  const mix = v.ctx.createGain(); mix.gain.value = 1; v.nodes.push(mix);
  for (const [f, q, g] of [[730, 7, 1], [1090, 8, 0.5], [2440, 9, 0.28]]) {
    const fg = v.ctx.createGain(); fg.gain.value = g; fg.connect(outG); v.nodes.push(fg);
    mix.connect(v.filt('bandpass', f, q, fg));
  }
  for (const m of notes) {
    const f = mtof(m);
    v.osc('sawtooth', f, mix, at, end + 0.01, -11 + v.R(-3, 3));
    v.osc('sawtooth', f, mix, at, end + 0.01, 11 + v.R(-3, 3));
  }
}

// sub drone
export function drone(v, at, m, dur, vel = 1) {
  v.tone('sine', mtof(m), [[at, 0], [at + 0.8, vel * 0.6], [at + dur, vel * 0.5], [at + dur + 1.2, 0]]);
}
