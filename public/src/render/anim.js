// Pose math + generic animation library. Hero render modules supply stance poses
// and per-move keyframe timelines; this module evaluates them from sim state.

export function clonePose(p) {
  const o = {};
  for (const k in p) o[k] = Array.isArray(p[k]) ? p[k].slice() : p[k];
  return o;
}

// Merge partial pose b over a (shallow; arrays replaced).
export function merge(a, b) {
  const o = clonePose(a);
  if (!b) return o;
  for (const k in b) o[k] = Array.isArray(b[k]) ? b[k].slice() : b[k];
  return o;
}

export function lerpPose(a, b, t, out = {}) {
  for (const k in a) {
    const va = a[k], vb = b[k];
    if (vb === undefined || vb === null) {
      if (k === 'spin' && typeof va === 'number') { out[k] = va * (1 - t); continue; }
      out[k] = Array.isArray(va) ? va.slice() : va; continue;
    }
    if (va === null || va === undefined) { out[k] = Array.isArray(vb) ? vb.slice() : vb; continue; }
    if (Array.isArray(va)) {
      const n = Math.max(va.length, vb.length);
      const arr = new Array(n);
      for (let i = 0; i < n; i++) arr[i] = (va[i] || 0) + ((vb[i] || 0) - (va[i] || 0)) * t;
      out[k] = arr;
    } else if (typeof va === 'number') out[k] = va + (vb - va) * t;
    else out[k] = t < 0.5 ? va : vb;
  }
  for (const k in b) if (!(k in a)) out[k] = Array.isArray(b[k]) ? b[k].slice() : b[k];
  return out;
}

// Scale positional fields by s (for bigger/smaller heroes).
const POS_KEYS = ['root', 'hL', 'hR', 'fL', 'fR'];
export function scalePose(p, s) {
  if (s === 1) return p;
  const o = clonePose(p);
  for (const k of POS_KEYS) {
    if (!o[k]) continue;
    const a = o[k];
    a[0] *= s; a[1] *= s; if (a.length > 2) a[2] *= s;
  }
  return o;
}

export const ease = {
  lin: (t) => t,
  out: (t) => 1 - (1 - t) * (1 - t),
  in: (t) => t * t,
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  snap: (t) => 1 - Math.pow(1 - t, 3),
};

// Parse symbolic time tokens against a move's frame data.
export function timeOf(tok, m) {
  if (typeof tok === 'number') return tok;
  const mm = /^([sae0])([+-]\d+)?$/.exec(tok);
  if (!mm) return 0;
  const base = mm[1] === 's' ? m.startup : mm[1] === 'a' ? m.lastActive : mm[1] === 'e' ? m.total : 0;
  return base + (mm[2] ? parseInt(mm[2], 10) : 0);
}

// Compile a timeline [[t, poseRef, easing?], ...] for a move into numeric keys.
export function compileTimeline(keys, m, resolve) {
  return keys.map((k) => ({ t: m ? timeOf(k[0], m) : k[0], p: resolve(k[1]), e: ease[k[2] || 'out'] }))
    .sort((a, b) => a.t - b.t);
}

export function sampleTimeline(tl, t) {
  if (t <= tl[0].t) return tl[0].p;
  for (let i = 1; i < tl.length; i++) {
    const k1 = tl[i];
    if (t <= k1.t) {
      const k0 = tl[i - 1];
      const u = k1.t === k0.t ? 1 : (t - k0.t) / (k1.t - k0.t);
      return lerpPose(k0.p, k1.p, k1.e(Math.max(0, Math.min(1, u))));
    }
  }
  return tl[tl.length - 1].p;
}

// ---------------------------------------------------------------------------
// Generic reaction / movement poses (nominal scale ~1.9m humanoid). Heroes
// override via their own library entries of the same name.
export const GENERIC = {
  hitHigh: { root: [-0.08, 0.9, 0], lean: -24, twist: -30, head: [-25, 10], hL: [0.05, 1.25, -0.25], hR: [-0.15, 1.15, 0.3], fL: [0.2, 0, -0.12], fR: [-0.25, 0, 0.14] },
  hitMid: { root: [-0.05, 0.84, 0], lean: 22, twist: -10, head: [20, 0], hL: [0.2, 1.0, -0.2], hR: [0.1, 0.95, 0.25], fL: [0.18, 0, -0.12], fR: [-0.25, 0, 0.14] },
  hitLow: { root: [0, 0.6, 0], lean: 18, twist: -15, head: [10, 0], hL: [0.2, 0.7, -0.25], hR: [0.05, 0.75, 0.25], fL: [0.25, 0, -0.14], fR: [-0.28, 0, 0.16] },
  blockHigh: { root: [-0.04, 0.88, 0], lean: 8, twist: -20, head: [12, 0], hL: [0.3, 1.5, -0.08], hR: [0.25, 1.45, 0.12], eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.22, 0, -0.12], fR: [-0.24, 0, 0.14] },
  blockLow: { root: [-0.04, 0.58, 0], lean: 14, twist: -20, head: [10, 0], hL: [0.3, 1.02, -0.08], hR: [0.25, 0.98, 0.12], eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.28, 0, -0.16], fR: [-0.28, 0, 0.16] },
  jsq: { root: [0, 0.74, 0], lean: 14, hL: [0.25, 1.05, -0.2], hR: [0.1, 1.0, 0.25], fL: [0.12, 0, -0.12], fR: [-0.12, 0, 0.12] },
  jumpUp: { root: [0, 1.0, 0], lean: 4, hL: [0.25, 1.55, -0.2], hR: [0.05, 1.5, 0.25], fL: [0.12, 0.35, -0.1, 30], fR: [-0.12, 0.2, 0.1, 20] },
  jumpTuck: { root: [0, 0.95, 0], lean: 20, hL: [0.3, 1.3, -0.2], hR: [0.2, 1.25, 0.25], fL: [0.22, 0.55, -0.1, 20], fR: [0.05, 0.5, 0.1, 20] },
  fall: { root: [0, 0.98, 0], lean: 2, hL: [0.3, 1.45, -0.25], hR: [0.0, 1.35, 0.3], fL: [0.15, 0.18, -0.12], fR: [-0.12, 0.3, 0.12, 20] },
  land: { root: [0, 0.72, 0], lean: 12, hL: [0.3, 1.1, -0.22], hR: [0.1, 1.0, 0.28], fL: [0.2, 0, -0.14], fR: [-0.2, 0, 0.14] },
  dash: { root: [0.06, 0.8, 0], lean: 30, hL: [0.1, 1.1, -0.3], hR: [-0.25, 1.0, 0.3], fL: [0.3, 0.05, -0.12], fR: [-0.35, 0.15, 0.12, -30] },
  bdash: { root: [-0.06, 0.86, 0], lean: -12, head: [8, 0], hL: [0.3, 1.25, -0.25], hR: [0.1, 1.15, 0.3], fL: [0.25, 0.1, -0.12], fR: [-0.25, 0, 0.12] },
  airHit: { root: [0, 1.0, 0], lean: -30, head: [-30, 0], hL: [-0.1, 1.5, -0.35], hR: [-0.15, 1.45, 0.35], fL: [0.3, 0.3, -0.12], fR: [0.15, 0.15, 0.12] },
  kd: { root: [-0.4, 0.14, 0], lean: -90, head: [20, 0], hL: [-0.9, 0.06, -0.4], hR: [-0.8, 0.05, 0.45], fL: [0.45, 0, -0.14], fR: [0.42, 0, 0.16] },
  rise: { root: [-0.05, 0.6, 0], lean: 30, hL: [0.15, 0.25, -0.25], hR: [0.0, 0.35, 0.25], fL: [0.2, 0, -0.14], fR: [-0.25, 0, 0.14] },
  held: { root: [0, 0.95, 0], lean: -10, head: [-15, 0], hL: [0.25, 1.35, -0.2], hR: [0.25, 1.3, 0.2], fL: [0.12, 0.05, -0.1], fR: [-0.12, 0.1, 0.1] },
  tech: { root: [-0.08, 0.84, 0], lean: -6, hL: [0.38, 1.3, -0.15], hR: [0.3, 1.25, 0.2], fL: [0.2, 0, -0.12], fR: [-0.28, 0, 0.14] },
  dispel: { root: [0, 0.92, 0], lean: -8, head: [-15, 0], hL: [0.05, 1.7, -0.45], hR: [0.05, 1.7, 0.45], fL: [0.2, 0, -0.18], fR: [-0.2, 0, 0.18] },
  dead: { root: [-0.4, 0.13, 0], lean: -92, head: [30, 30], hL: [-0.6, 0.05, -0.6], hR: [-0.95, 0.04, 0.35], fL: [0.5, 0, -0.2], fR: [0.42, 0, 0.12] },
  throwWhiff: { root: [0.1, 0.86, 0], lean: 20, hL: [0.5, 1.2, -0.12], hR: [0.48, 1.15, 0.15], fL: [0.3, 0, -0.12], fR: [-0.2, 0, 0.14] },
  throwReach: { root: [0.1, 0.86, 0], lean: 16, hL: [0.6, 1.25, -0.1], hR: [0.58, 1.2, 0.15], fL: [0.32, 0, -0.12], fR: [-0.2, 0, 0.14] },
  cast: { root: [0, 0.9, 0], lean: 4, head: [-6, 0], hL: [0.42, 1.35, -0.1], hR: [0.4, 1.32, 0.15], fL: [0.22, 0, -0.14], fR: [-0.22, 0, 0.14] },
};
