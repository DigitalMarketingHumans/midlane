// Visual representation of one fighter: builds the hero model on an IK rig and
// derives a pose from simulation state each frame.
import * as THREE from 'three';
import { HEROES } from '../sim/heroes/index.js';
import { HERO_RENDER } from './heroes/index.js';
import { Rig, DEFAULT_DIMS } from './rig.js';
import { MatSet } from './toon.js';
import { GENERIC, merge, scalePose, lerpPose, compileTimeline, sampleTimeline, ease, clonePose } from './anim.js';
import { KD_FRAMES } from '../sim/const.js';
import { optimizeView } from './merge.js';

const D2R = Math.PI / 180;
export const YAW = Math.PI / 2 - 0.36;
export const S2M = 1 / 10000; // sim sub-pixels → metres

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class FighterView {
  constructor(heroId, slot = 0, opts = {}) {
    this.id = heroId;
    this.H = HEROES[heroId];
    this.R = HERO_RENDER[heroId];
    const s = this.s = this.R.scale || 1;
    this.group = new THREE.Group();
    this.mirror = new THREE.Group();
    this.yaw = new THREE.Group();
    this.pivot = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.mirror); this.mirror.add(this.yaw); this.yaw.add(this.pivot); this.pivot.add(this.body);
    this.yaw.rotation.y = YAW;
    this.pivot.position.y = 1.0 * s;
    this.body.position.y = -1.0 * s;
    const dims = Object.assign({}, DEFAULT_DIMS, this.R.dims || {});
    for (const k in dims) dims[k] *= s;
    this.rig = new Rig(dims);
    this.body.add(this.rig.root);
    this.ms = new MatSet(this.R.outline ?? 0x08070c, 0.011 * Math.sqrt(s));
    this.extras = this.R.build({ rig: this.rig, ms: this.ms, THREE, slot, s }) || {};
    this.ribbons = this.extras.ribbons || [];
    for (const rb of this.ribbons) this.rig.root.add(rb.r.mesh);
    this.trails = this.extras.trails || [];
    // Pose library (scaled)
    this.lib = {};
    const st0 = (this.R.poses || {}).stance || {};
    const wd = this.R.wDefaults || {};
    for (const [k, p] of Object.entries(GENERIC)) {
      const pp = Object.assign({}, p);
      // Generic poses inherit the hero's resting weapon angles unless overridden.
      if (pp.wR === undefined && st0.wR != null) pp.wR = wd[k] && wd[k].R != null ? wd[k].R : st0.wR;
      if (pp.wL === undefined && st0.wL != null) pp.wL = wd[k] && wd[k].L != null ? wd[k].L : st0.wL;
      this.lib[k] = scalePose(pp, s);
    }
    for (const [k, p] of Object.entries(this.R.poses || {})) if (p.root) this.lib[k] = scalePose(p, s);
    if (!this.lib.crouch) this.lib.crouch = this.lib.blockLow;
    if (!this.lib.fall) this.lib.fall = this.lib.jumpUp;
    this.walk = Object.assign({ stride: 0.25, lift: 0.09, bob: 0.025 }, (this.R.poses || {}).walk || {});
    this.tl = new Map();
    this.cur = clonePose(this.lib.stance);
    this.lastKey = '';
    this.blendFrom = null;
    this.walkPhase = 0;
    this.lastX = 0;
    this.flashT = 0;
    this.flashColor = 0xffffff;
    this.time = 0;
    this.shake = 0;
    this.alpha = 1;
    this.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    if (opts.optimize !== false) {
      try { this.optStats = optimizeView(this, this.exerciseStates()); } catch (e) { console.warn('optimizeView failed', e); }
      this.lastKey = ''; this.blendFrom = null; this.cur = clonePose(this.lib.stance); this.walkPhase = 0; this.lastX = 0; this.flashT = 0;
      for (const rb of this.ribbons) rb.r.init = false;
      this.ms.flash(0);
    }
  }

  // Fake fighter states covering every animation, used by the mesh optimiser.
  exerciseStates() {
    const base = { act: 'idle', af: 1, mv: null, x: 0, y: 0, vx: 0, vy: 0, face: 1, hs: 0, stun: 12, combo: 1, in: 0, jv: 0, d: {}, buffs: [], items: [] };
    const out = [];
    const mk = (o) => out.push(Object.assign({}, base, o));
    for (const [act, extra] of [['idle', {}], ['walk', { vx: 400 }], ['crouch', { af: 8 }], ['guard', {}], ['block', {}], ['block', { crouch: true }], ['hit', { af: 3 }],
      ['hit', { crouch: true, af: 3 }], ['jsq', {}], ['air', { af: 6, vy: 1200, y: 9000 }], ['air', { af: 14, jv: 1, vy: 100, y: 15000 }], ['air', { af: 30, vy: -1200, y: 6000 }],
      ['land', { stun: 3 }], ['dash', { af: 5 }], ['bdash', { af: 5 }], ['ahit', { af: 8, kdOnLand: true, vy: 400, y: 9000 }], ['ahit', { af: 6, reset: true, y: 9000 }],
      ['kd', { af: 20, stun: 44 }], ['kd', { af: 38, stun: 44 }], ['tech', {}], ['dispel', { af: 3 }], ['intro', { af: 10 }], ['intro', { af: 100 }], ['win', { af: 60 }], ['kd', { af: 20, dead: true }]]) mk(Object.assign({ act }, extra));
    for (const [id, m] of Object.entries(this.H.moves)) {
      for (const af of [Math.max(1, m.startup - 3), m.startup, m.lastActive, Math.max(1, m.total - 2)]) mk({ act: 'move', mv: id, af, y: m.air ? 9000 : 0 });
    }
    mk({ act: 'idle' });
    return out;
  }

  // Resolve a pose reference relative to a base pose.
  resolve(ref, base) {
    if (typeof ref === 'string') return this.lib[ref] || this.lib.stance;
    return merge(base, scalePose(ref, this.s));
  }

  timeline(key, keys, m, base) {
    let tl = this.tl.get(key);
    if (!tl) {
      tl = compileTimeline(keys, m, (r) => this.resolve(r, base));
      this.tl.set(key, tl);
    }
    return tl;
  }

  baseFor(m) {
    if (!m) return this.lib.stance;
    if (m.stance === 'cr') return this.lib.crouch;
    if (m.air || m.stance === 'air') return this.lib.fall;
    return this.lib.stance;
  }

  movePose(f) {
    const m = this.H.moves[f.mv];
    const keys = this.R.moves && this.R.moves[f.mv];
    const base = this.baseFor(m);
    if (!keys) {
      // Fallback: generic cast for abilities, stance otherwise
      const t = Math.min(1, f.af / Math.max(1, m.startup));
      return lerpPose(base, this.lib.cast, ease.out(t) * (f.af < m.total - 6 ? 1 : Math.max(0, (m.total - f.af) / 6)));
    }
    const tl = this.timeline('m:' + f.mv, keys, m, base);
    return sampleTimeline(tl, f.af);
  }

  lockPose(G, f, role) {
    const K = G.lock;
    if (!K) return this.lib.held;
    const R = HERO_RENDER[K.h];
    const L = R.locks && R.locks[K.id];
    if (!L) return role === 'atk' ? this.lib.stance : this.lib.held;
    const keys = role === 'atk' ? L.atk : L.vic;
    const tl = this.timeline(`l:${K.h}.${K.id}.${role}`, keys, null, role === 'atk' ? this.lib.stance : this.lib.held);
    return sampleTimeline(tl, K.af);
  }

  computePose(f, G) {
    const L = this.lib;
    const t = this.time;
    switch (f.act) {
      case 'intro': {
        const k = Math.max(0, Math.min(1, (f.af - 50) / 40));
        return lerpPose(L.intro || L.stance, L.stance, ease.io(k));
      }
      case 'idle': case 'rec': {
        const p = clonePose(L.stance);
        const br = Math.sin(t * 2.4 + this.id.length);
        p.root[1] += br * 0.008 * this.s;
        p.hL[1] += br * 0.012 * this.s; p.hR[1] += br * 0.01 * this.s;
        p.lean = (p.lean || 0) + br * 1.2;
        return p;
      }
      case 'walk': return this.walkPose(f);
      case 'crouch': return f.af < 4 ? lerpPose(L.stance, L.crouch, ease.out(f.af / 4)) : L.crouch;
      case 'guard': return (f.in & 2) ? L.blockLow : L.blockHigh;
      case 'jsq': return L.jsq;
      case 'air': return this.airPose(f);
      case 'land': return lerpPose(L.land, L.stance, ease.io(Math.min(1, f.af / Math.max(1, f.stun + 3))));
      case 'dash': return f.d && f.d.blink ? L.dash : lerpPose(L.dash, L.stance, Math.max(0, (f.af - 12) / 8));
      case 'bdash': return L.bdash;
      case 'move': return this.movePose(f);
      case 'hit': {
        const hp = f.crouch ? L.hitLow : (f.combo % 2 ? L.hitHigh : L.hitMid);
        const u = f.af / Math.max(1, f.stun);
        return lerpPose(hp, f.crouch ? L.crouch : L.stance, ease.in(Math.max(0, (u - 0.55) / 0.45)));
      }
      case 'block': return f.crouch ? L.blockLow : L.blockHigh;
      case 'ahit': {
        const p = clonePose(L.airHit);
        if (f.kdOnLand || f.dead) {
          const fallK = Math.min(1, f.af / 26);
          p.lean = -30 - 55 * fallK;
          p.spin = f.vy > 0 ? -Math.min(40, f.af * 3) : -40 + 40 * fallK;
        } else if (f.reset) {
          p.spin = -Math.min(360, f.af * 22);
          return lerpPose(p, L.jumpTuck, 0.6);
        }
        return p;
      }
      case 'kd': {
        if (f.dead) return L.dead;
        const total = f.stun || KD_FRAMES;
        const riseStart = total - 14;
        if (f.af < 6) return lerpPose(L.airHit, L.kd, ease.out(f.af / 6));
        if (f.af < riseStart) return L.kd;
        const u = (f.af - riseStart) / 14;
        return u < 0.5 ? lerpPose(L.kd, L.rise, ease.io(u * 2)) : lerpPose(L.rise, L.stance, ease.io((u - 0.5) * 2));
      }
      case 'tech': return L.tech;
      case 'dispel': return L.dispel;
      case 'lock': return this.lockPose(G, f, 'atk');
      case 'held': return this.lockPose(G, f, 'vic');
      case 'win': {
        const keys = this.R.winAnim;
        if (keys) return sampleTimeline(this.timeline('win', keys, null, L.stance), f.af);
        return lerpPose(L.stance, L.win || L.stance, ease.io(Math.min(1, f.af / 25)));
      }
      default: return L.stance;
    }
  }

  walkPose(f) {
    const p = clonePose(this.lib.stance);
    const W = this.walk, s = this.s;
    const ph = this.walkPhase;
    const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
    p.fL[0] += sL * W.stride * s; p.fL[1] = (p.fL[1] || 0) + Math.max(0, Math.cos(ph)) * W.lift * s;
    p.fR[0] += sR * W.stride * s; p.fR[1] = (p.fR[1] || 0) + Math.max(0, Math.cos(ph + Math.PI)) * W.lift * s;
    p.root[1] += (Math.abs(Math.cos(ph)) - 0.5) * W.bob * s;
    p.hL[0] -= sL * 0.04 * s; p.hR[0] -= sR * 0.04 * s;
    const fwd = f.vx * f.face > 0;
    p.lean = (p.lean || 0) + (fwd ? 4 : -3);
    return p;
  }

  airPose(f) {
    const L = this.lib;
    if (f.jv !== 0 && this.R.flip !== false) {
      const u = Math.max(0, Math.min(1, (f.af - 3) / 28));
      const p = lerpPose(L.jumpUp, L.jumpTuck, Math.sin(u * Math.PI));
      p.spin = 360 * ease.io(u) * (f.jv > 0 ? 1 : -1);
      if (u >= 1) return lerpPose(p, L.fall, Math.min(1, (f.af - 31) / 6));
      return p;
    }
    const k = Math.max(0, Math.min(1, (6 - f.vy / 100) / 12));
    return lerpPose(L.jumpUp, L.fall, ease.io(k));
  }

  update(f, G, dt, time) {
    this.time = time;
    let pose = this.computePose(f, G);
    const key = f.act + '|' + (f.mv || '') + '|' + (G.lock ? G.lock.id : '');
    if (key !== this.lastKey) {
      this.blendFrom = this.cur;
      this.blendStart = time;
      this.blendDur = f.act === 'move' ? 0.04 : (f.act === 'hit' || f.act === 'block') ? 0.025 : f.act === 'lock' || f.act === 'held' ? 0.03 : 0.085;
      this.lastKey = key;
    }
    if (this.blendFrom) {
      const u = (time - this.blendStart) / this.blendDur;
      if (u < 1) pose = lerpPose(this.blendFrom, pose, ease.out(Math.max(0, u)));
      else this.blendFrom = null;
    }
    this.cur = pose;
    this.rig.apply(pose);
    // placement
    const x = f.x * S2M, y = f.y * S2M;
    if (Math.abs(x - this.lastX) < 0.5) this.walkPhase += (Math.abs(x - this.lastX) / (this.walk.stride * this.s * 2)) * Math.PI;
    this.lastX = x;
    let sx = 0;
    if (f.hs > 0 && (f.act === 'hit' || f.act === 'block' || f.act === 'ahit' || f.act === 'held')) sx = Math.sin(time * 95) * 0.022;
    this.group.position.set(x + sx, y, 0);
    this.mirror.scale.x = f.face;
    this.pivot.rotation.x = (pose.spin || 0) * D2R;
    // flash
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.ms.flash(Math.min(1.4, this.flashT * 14), this.flashColor);
      if (this.flashT === 0) this.ms.flash(0);
    }
    this.group.updateMatrixWorld(true);
    this.updateRibbons(f, dt);
  }

  updateRibbons(f, dt) {
    if (!this.ribbons.length) return;
    const root = this.rig.root;
    const fwdSpeed = (f.vx * f.face) / 100 * 0.6; // px/frame → rough m/s
    const accel = new THREE.Vector3(Math.sin(this.time * 1.7) * 0.6, 0, -fwdSpeed * 9 - 0.8);
    if (f.y > 0) accel.y += f.vy / 100 * -3;
    for (const rb of this.ribbons) {
      const node = rb.body === 'hips' ? this.rig.hips : rb.body === 'head' ? this.rig.head : this.rig.chest;
      _v.set(rb.offset[0], rb.offset[1], rb.offset[2]);
      node.localToWorld(_v);
      root.worldToLocal(_v);
      const anchor = _v.clone();
      node.getWorldQuaternion(_q);
      const rq = new THREE.Quaternion(); root.getWorldQuaternion(rq);
      _q.premultiply(rq.invert());
      _n.set(0, 0, 1).applyQuaternion(_q);
      const nrm = _n.clone();
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
      const push = rb.z || 0;
      rb.r.update(anchor, accel, dt, (p, i) => {
        const d = (p.x - anchor.x) * nrm.x + (p.y - anchor.y) * nrm.y + (p.z - anchor.z) * nrm.z;
        const lim = -0.025 - i * 0.006 + push;
        if (d > lim) p.addScaledVector(nrm, lim - d);
      }, side);
    }
  }

  hitFlash(color = 0xffffff, t = 0.09) { this.flashT = t; this.flashColor = color; }

  // Sword-trail sampling helper: returns world positions of trail tips
  trailPoints(i, outTip, outBase) {
    const tr = this.trails[i];
    tr.tip.getWorldPosition(outTip);
    tr.base.getWorldPosition(outBase);
  }
}
