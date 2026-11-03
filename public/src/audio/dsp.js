// MIDLANE audio — DSP primitives shared by SFX recipes and the music sequencer.
//
// Everything here works on any BaseAudioContext (realtime or Offline), so the same
// synthesis code can be rendered offline for tests.
//
// The `Voice` builder is the heart of it: a recipe creates oscillators / noise / filters
// through it, and the builder takes care of start/stop scheduling, time + pitch scaling
// (play(name, { rate })), voice stealing and disconnecting every node once the last
// source has ended.

export const EPS = 1e-4;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Small fast seeded PRNG (mulberry32). Music uses it so renders are repeatable.
export function rng(seed = 1) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Envelope shorthands. An envelope is a number (constant) or a list of points
// [time, value, curve?] in recipe seconds; curve: undefined = linear ramp,
// 'x' = exponential ramp, 'h' = hold/jump.
export const perc = (p, a, d, t = 0) => [[t, 0], [t + a, p], [t + a + d, EPS, 'x']];
export const ar = (p, a, h, r, t = 0) => [[t, 0], [t + a, p], [t + a + h, p], [t + a + h + r, 0]];
// attack then exponential tail (good for swells / whooshes)
export const swell = (p, a, d, t = 0) => [[t, 0], [t + a, p], [t + a + d, EPS, 'x']];
export const sweep = (f0, f1, d, t = 0) => [[t, f0], [t + d, f1, 'x']];
const envStart = (e) => (Array.isArray(e) ? e[0][0] : 0);
const envEnd = (e) => (Array.isArray(e) ? e[e.length - 1][0] : 0);
const envMul = (e, k) => (Array.isArray(e) ? e.map((p) => [p[0], p[1] * k, p[2]]) : e * k);

// ---------------------------------------------------------------------------
// Cached buffers. Keyed by sample rate (AudioBuffers can be shared between contexts
// of the same rate), so offline test renders reuse them too.
const BUF = new Map();

function loopable(n, F, gen) {
  // generate n+F samples and crossfade the tail into the head so the loop is seamless
  const x = new Float32Array(n + F);
  for (let i = 0; i < n + F; i++) x[i] = gen(i);
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = x[i];
  for (let i = 0; i < F; i++) { const w = i / F; d[i] = x[i] * w + x[n + i] * (1 - w); }
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
  const s = pk > 0 ? 0.95 / pk : 1;
  for (let i = 0; i < n; i++) d[i] *= s;
  return d;
}

export function noiseBuf(ctx, kind = 'white') {
  const sr = ctx.sampleRate, key = sr + ':' + kind;
  let b = BUF.get(key);
  if (b) return b;
  const n = Math.floor(sr * 2), F = Math.floor(sr * 0.05);
  const r = rng(kind.length * 7919 + 17);
  let gen;
  if (kind === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    gen = () => {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      return o;
    };
  } else if (kind === 'brown') {
    let l = 0;
    gen = () => { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; return l; };
  } else if (kind === 'crackle') {
    // sparse decaying impulses: fire crackle / debris / static
    let v = 0;
    gen = () => {
      if (r() < 0.0018) v += (r() * 2 - 1) * (0.3 + 0.7 * r());
      v *= 0.55;
      return v;
    };
  } else {
    gen = () => r() * 2 - 1;
  }
  b = ctx.createBuffer(1, n, sr);
  b.getChannelData(0).set(loopable(n, F, gen));
  BUF.set(key, b);
  return b;
}

// Stereo reverb impulse: decaying noise whose high end dies faster (one-pole lowpass
// with a coefficient that grows over time), a short pre-delay, energy-normalised.
export function impulse(ctx, secs = 1.8) {
  const sr = ctx.sampleRate, key = sr + ':ir' + secs;
  let b = BUF.get(key);
  if (b) return b;
  const n = Math.floor(sr * secs), pre = Math.floor(sr * 0.012), fade = Math.floor(sr * 0.006);
  b = ctx.createBuffer(2, n, sr);
  const r = rng(99);
  let e = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const k = 0.2 + 0.72 * t;
      lp = lp * k + (r() * 2 - 1) * (1 - k);
      let env = Math.exp(-6.9 * t);
      if (i < pre) env = 0; else if (i < pre + fade) env *= (i - pre) / fade;
      // a few discrete early reflections for definition
      d[i] = lp * env;
      e += d[i] * d[i];
    }
    for (const [ms, g] of [[17, 0.5], [23, -0.35], [31, 0.3], [41, -0.22], [53, 0.16]]) {
      const i = Math.floor((ms + ch * 3) * sr / 1000);
      if (i < n) { d[i] += g * 0.25; e += 0.0001; }
    }
  }
  const s = 1 / Math.sqrt(e / 2);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] *= s; }
  BUF.set(key, b);
  return b;
}

// ---------------------------------------------------------------------------
// WaveShaper curves (cached)
const CURVES = new Map();
export function driveCurve(k) {
  const key = Math.round(clamp(k, 0, 1) * 100);
  let c = CURVES.get(key);
  if (c) return c;
  const g = 1 + (key / 100) * 24, n = 1024, tg = Math.tanh(g);
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(g * x) / tg; }
  CURVES.set(key, c);
  return c;
}

// Safety limiter: identity up to |0.8|, then soft knee to an asymptote of 0.98.
// The input is pre-scaled by 0.5, so the curve's domain [-1,1] covers [-2,2].
export function limiterCurve() {
  let c = CURVES.get('lim');
  if (c) return c;
  const n = 4097;
  c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(u);
    c[i] = a <= 0.8 ? u : Math.sign(u) * (0.8 + 0.18 * Math.tanh((a - 0.8) / 0.18));
  }
  CURVES.set('lim', c);
  return c;
}

// ---------------------------------------------------------------------------
// Voice builder. Times passed to its methods are "recipe seconds" relative to the
// voice start; they are divided by `rate`, and frequencies multiplied by it.
export class Voice {
  constructor(ctx, t0, out, rate = 1, rnd = Math.random) {
    this.ctx = ctx;
    this.t = t0;
    this.out = out;
    this.r = rate > 0 ? rate : 1;
    this.rnd = rnd;
    this.rev = null; // reverb send bus (set by the engine for SFX)
    this.srcs = [];
    this.nodes = [];
    this.endT = 0;
    this.last = null;
    this.dead = false;
    this.onend = null;
  }

  T(x) { return this.t + x / this.r; }
  R(a, b) { return a + (b - a) * this.rnd(); }
  pick(arr) { return arr[Math.floor(this.rnd() * arr.length) % arr.length]; }

  env(param, e, k = 1) {
    if (typeof e === 'number') { param.value = e * k; return; }
    param.value = e[0][1] * k;
    for (let i = 0; i < e.length; i++) {
      const p = e[i], t = this.T(p[0]), v = p[1] * k;
      if (i === 0 || p[2] === 'h') param.setValueAtTime(v, t);
      else if (p[2] === 'x') param.exponentialRampToValueAtTime(v > EPS ? v : v < -EPS ? v : EPS, t);
      else param.linearRampToValueAtTime(v, t);
    }
  }

  _src(s, t0, t1, off) {
    const a = this.T(t0), b = this.T(t1);
    if (off !== undefined) s.start(a, off); else s.start(a);
    s.stop(b);
    this.srcs.push(s);
    this.nodes.push(s);
    if (b >= this.endT) { this.endT = b; this.last = s; }
    return s;
  }

  // to = null: leave unconnected (e.g. a modulation depth you connect yourself)
  gain(e, to = this.out) {
    const g = this.ctx.createGain();
    this.env(g.gain, e);
    if (to) g.connect(to);
    this.nodes.push(g);
    return g;
  }

  filt(type, f, q = 0.7, to = this.out, gdb) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    this.env(n.frequency, f, this.r);
    if (q != null) this.env(n.Q, q);
    if (gdb != null) n.gain.value = gdb;
    n.connect(to);
    this.nodes.push(n);
    return n;
  }

  // distortion bus: returns the shaper input; output = tanh-ish * post → to
  drive(k, to = this.out, post = 0.5) {
    const ws = this.ctx.createWaveShaper();
    ws.curve = driveCurve(k);
    const g = this.ctx.createGain();
    g.gain.value = post;
    ws.connect(g);
    g.connect(to);
    this.nodes.push(ws, g);
    return ws;
  }

  // send a node into the reverb bus
  send(node, amt) {
    if (!this.rev || !(amt > 0)) return;
    const g = this.ctx.createGain();
    g.gain.value = amt;
    node.connect(g);
    g.connect(this.rev);
    this.nodes.push(g);
  }

  osc(type, f, to = this.out, t0 = 0, t1 = 1, det = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    this.env(o.frequency, f, this.r);
    if (det) this.env(o.detune, det);
    o.connect(to);
    return this._src(o, t0, t1);
  }

  // looping noise buffer source with a random offset
  nsrc(kind = 'white', t0 = 0, t1 = 1, to = null, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuf(this.ctx, kind);
    s.loop = true;
    s.playbackRate.value = rate;
    if (to) s.connect(to);
    return this._src(s, t0, t1, this.rnd() * 1.9);
  }

  // LFO: osc(rate Hz) * depth → param
  lfo(rate, depth, param, t0 = 0, t1 = 1, type = 'sine') {
    const g = this.ctx.createGain();
    this.env(g.gain, depth);
    g.connect(param);
    this.nodes.push(g);
    this.osc(type, rate, g, t0, t1);
    return g;
  }

  // ---- layers: source + optional filter chain + gain envelope -------------------
  tone(type, f, g, to = this.out, det = 0) {
    const gn = this.gain(g, to);
    this.osc(type, f, gn, envStart(g), envEnd(g) + 0.01, det);
    return gn;
  }

  // src: noise kind ('white'|'pink'|'brown'|'crackle') or an existing source node to reuse
  hiss(src, g, chain = null, to = this.out) {
    const gn = this.gain(g, to);
    let head = gn;
    if (chain) for (let i = chain.length - 1; i >= 0; i--) { const c = chain[i]; head = this.filt(c[0], c[1], c[2], head, c[3]); }
    if (typeof src === 'string') this.nsrc(src, envStart(g), envEnd(g) + 0.01, head);
    else src.connect(head);
    return gn;
  }

  // 2-operator FM: idx is modulation index (deviation = idx * modulator freq)
  fm(f, ratio, idx, g, to = this.out, ctype = 'sine') {
    const gn = this.gain(g, to);
    const s = envStart(g), e = envEnd(g) + 0.01;
    const car = this.osc(ctype, f, gn, s, e);
    const f0 = typeof f === 'number' ? f : f[0][1];
    const mg = this.ctx.createGain();
    this.env(mg.gain, idx, f0 * ratio * this.r);
    mg.connect(car.frequency);
    this.nodes.push(mg);
    this.osc('sine', envMul(f, ratio), mg, s, e);
    return gn;
  }

  // ---- lifecycle ---------------------------------------------------------------
  done() {
    if (this.last) this.last.onended = () => this.free();
    else this.free();
    return this;
  }

  free() {
    for (const n of this.nodes) { try { n.disconnect(); } catch (_) { /* already gone */ } }
    this.nodes.length = 0;
    this.srcs.length = 0;
    this.last = null;
    this.dead = true;
    if (this.onend) { const f = this.onend; this.onend = null; f(this); }
  }

  // fade out quickly and stop every source (voice stealing / handle.stop())
  stop(fade = 0.04) {
    if (this.dead || !this.srcs.length) return;
    const t = this.ctx.currentTime, g = this.out.gain;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fade);
    } catch (_) { /* ignore */ }
    for (const s of this.srcs) { try { s.stop(t + fade + 0.01); } catch (_) { /* not started / ended */ } }
    this.dead = true;
  }
}
