// GGPO-style rollback session for two players.
//
// Each client simulates every frame immediately using its own input (after a
// small input delay) and a *prediction* of the remote input (their last known
// input held). When the real remote input arrives and differs from the
// prediction, we restore the saved state from that frame and re-simulate up
// to the present. The simulation is deterministic, so both sides converge.
import { step, hashState } from '../sim/game.js';

const clone = typeof structuredClone === 'function' ? structuredClone : (o) => JSON.parse(JSON.stringify(o));

export class RollbackSession {
  // opts: { G, local (0|1), delay, send(msg), maxRollback }
  constructor(opts) {
    this.G = opts.G;
    this.local = opts.local;
    this.delay = Math.max(0, opts.delay | 0);
    this.send = opts.send;
    this.maxRB = opts.maxRollback || 14;
    this.frame = 0;
    this.localIn = new Map();
    this.remoteIn = new Map();
    this.predicted = new Map();
    this.states = new Map();
    this.hashes = new Map();
    this.remoteHashes = new Map();
    for (let f = 0; f < this.delay; f++) { this.localIn.set(f, 0); this.remoteIn.set(f, 0); }
    this.lastRemote = this.delay - 1;
    this.lastRemoteBits = 0;
    this.rollbackFrom = Infinity;
    this.remoteFrame = 0;     // remote's reported current frame
    this.remoteAdv = 0;       // remote's reported advantage
    this.rttMs = 0;
    this.skip = 0;
    this.dedupe = new Map();
    this.desync = -1;
    this.stats = { rollbacks: 0, rbFrames: 0, maxDepth: 0, stalls: 0, skips: 0 };
    this.lastPing = 0;
    this.sendBuf = [];
  }

  // Remote message handler — call for 'in', 'cs', 'ping', 'pong' messages.
  onMessage(m) {
    switch (m.t) {
      case 'in': {
        for (const [f, b] of m.i) this.addRemote(f, b);
        this.remoteFrame = Math.max(this.remoteFrame, m.cf);
        this.remoteAdv = m.adv;
        break;
      }
      case 'cs':
        this.remoteHashes.set(m.f, m.h);
        this.checkHash(m.f);
        break;
      case 'ping': this.send({ t: 'pong', ts: m.ts }); break;
      case 'pong': {
        const rtt = performance.now() - m.ts;
        this.rttMs = this.rttMs ? this.rttMs * 0.8 + rtt * 0.2 : rtt;
        break;
      }
    }
  }

  addRemote(f, b) {
    if (this.remoteIn.has(f)) return;
    this.remoteIn.set(f, b);
    while (this.remoteIn.has(this.lastRemote + 1)) {
      this.lastRemote++;
      this.lastRemoteBits = this.remoteIn.get(this.lastRemote);
    }
    if (f < this.frame) {
      const p = this.predicted.get(f);
      if (p !== b) this.rollbackFrom = Math.min(this.rollbackFrom, f);
      this.predicted.delete(f);
    }
  }

  localAdvantage() {
    const rttFrames = (this.rttMs / 1000) * 60;
    return this.frame - (this.remoteFrame + rttFrames / 2);
  }

  // Advance by (at most) one frame. Returns true if a frame was simulated.
  tick(localBits, events) {
    const tf = this.frame + this.delay;
    if (!this.localIn.has(tf)) {
      this.localIn.set(tf, localBits);
      this.sendBuf.push([tf, localBits]);
    }
    // Send recent inputs (redundant window protects against any gaps).
    const adv = Math.round(this.localAdvantage() * 10) / 10;
    this.send({ t: 'in', i: this.sendBuf.slice(-4), cf: this.frame, adv });
    if (this.sendBuf.length > 8) this.sendBuf.splice(0, this.sendBuf.length - 8);
    const now = performance.now();
    if (now - this.lastPing > 1000) { this.lastPing = now; this.send({ t: 'ping', ts: now }); }

    if (this.rollbackFrom < this.frame) this.rollback(events);

    // Too far ahead of confirmed remote input: wait.
    if (this.frame - this.lastRemote > this.maxRB) { this.stats.stalls++; return false; }
    // Time sync: if we're consistently ahead of the peer, give them a frame.
    if (this.frame % 30 === 0 && this.frame > 60) {
      const d = (this.localAdvantage() - this.remoteAdv) / 2;
      if (d >= 1) this.skip = Math.min(4, Math.floor(d));
    }
    if (this.skip > 0 && this.frame % 3 === 0) { this.skip--; this.stats.skips++; return false; }

    this.simFrame(this.frame, events);
    this.checkpoint();
    return true;
  }

  simFrame(f, events) {
    this.states.set(f, clone(this.G));
    const lb = this.localIn.has(f) ? this.localIn.get(f) : 0;
    let rb;
    if (this.remoteIn.has(f)) rb = this.remoteIn.get(f);
    else { rb = this.lastRemoteBits; this.predicted.set(f, rb); }
    const out = [];
    step(this.G, this.local === 0 ? [lb, rb] : [rb, lb], out);
    this.frame = f + 1;
    if (events) {
      for (const e of out) {
        const key = `${e.f}|${e.t}|${e.p}|${e.v ?? ''}|${e.id ?? ''}|${e.k ?? ''}|${e.s ?? ''}`;
        if (this.dedupe.has(key)) continue;
        this.dedupe.set(key, e.f);
        events.push(e);
      }
    }
    const old = f - this.maxRB - 8;
    this.states.delete(old);
    this.localIn.delete(old - this.delay - 2);
    this.remoteIn.delete(old - 2);
    if ((f & 63) === 0) for (const [k, fr] of this.dedupe) if (fr < f - 120) this.dedupe.delete(k);
  }

  rollback(events) {
    const from = this.rollbackFrom;
    this.rollbackFrom = Infinity;
    const to = this.frame;
    const snap = this.states.get(from);
    if (!snap) { console.warn('[rollback] missing snapshot for frame', from); return; }
    this.G = clone(snap);
    for (let f = from; f < to; f++) this.simFrame(f, events);
    const depth = to - from;
    this.stats.rollbacks++;
    this.stats.rbFrames += depth;
    if (depth > this.stats.maxDepth) this.stats.maxDepth = depth;
  }

  // Exchange state hashes on fully-confirmed frames to detect desyncs.
  checkpoint() {
    const f = Math.floor((this.lastRemote + 1) / 120) * 120;
    if (f <= 0 || this.hashes.has(f) || f >= this.frame) return;
    const s = this.states.get(f);
    if (!s) return;
    const h = hashState(s);
    this.hashes.set(f, h);
    this.send({ t: 'cs', f, h });
    this.checkHash(f);
  }
  checkHash(f) {
    if (!this.hashes.has(f) || !this.remoteHashes.has(f)) return;
    if (this.hashes.get(f) !== this.remoteHashes.get(f) && this.desync < 0) {
      this.desync = f;
      console.error('[rollback] DESYNC detected at frame', f);
    }
    this.hashes.delete(f - 1200); this.remoteHashes.delete(f - 1200);
  }

  info() {
    return {
      frame: this.frame, ping: Math.round(this.rttMs), ahead: this.frame - this.lastRemote - 1,
      rollbacks: this.stats.rollbacks, avgRb: this.stats.rollbacks ? (this.stats.rbFrames / this.stats.rollbacks).toFixed(1) : '0',
      maxRb: this.stats.maxDepth, stalls: this.stats.stalls, desync: this.desync,
    };
  }
}
