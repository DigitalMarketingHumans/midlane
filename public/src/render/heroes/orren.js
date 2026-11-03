// Orren — the Starwright. Tall hooded astral mage: midnight robes woven with
// glowing constellations, gold trim, a face lost in darkness but for two cold
// eyes, three stars orbiting his hood and a staff crowned by a floating star.
import * as THREE from 'three';
import { part, G3 } from '../toon.js';
import { Ribbon } from '../cloth.js';

// clone without userData (Object3D.clone JSON-copies userData, which may hold meshes)
function cloneBare(o) { const ud = o.userData; o.userData = {}; const c = o.clone(); o.userData = ud; return c; }

const C = {
  robe: 0x282670, robeD: 0x17154a, robeL: 0x34328a, inner: 0x2a1f55, gold: 0xe0b85c, goldD: 0x9c7432,
  skin: 0xb8b2de, dark: 0x040309, wood: 0x2b2148, glow: 0x9fe8ff, mag: 0xff7ae0, white: 0xeaf8ff,
};
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Constellation texture (white dots + faint lines on black, used additively).
let STAR_TEX = null;
function starTexture() {
  if (STAR_TEX) return STAR_TEX;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 512);
  let s = 1234567;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const dot = (px, py, rad, a) => {
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.35, `rgba(200,240,255,${a * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  };
  for (let k = 0; k < 9; k++) {
    const cx = 20 + r() * 216, cy = 20 + r() * 472;
    const pts = [];
    for (let i = 0; i < 4 + (k % 3); i++) pts.push([cx + (r() - 0.5) * 100, cy + (r() - 0.5) * 110]);
    x.strokeStyle = 'rgba(140,210,255,0.45)'; x.lineWidth = 1.6;
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.stroke();
    for (const p of pts) dot(p[0], p[1], 7 + r() * 5, 1);
  }
  for (let i = 0; i < 110; i++) dot(r() * 256, r() * 512, 2 + r() * 3, 0.35 + r() * 0.5);
  STAR_TEX = new THREE.CanvasTexture(c);
  STAR_TEX.wrapS = STAR_TEX.wrapT = THREE.RepeatWrapping;
  STAR_TEX.colorSpace = THREE.SRGBColorSpace;
  return STAR_TEX;
}
function starOverlayMat(color, k = 1.6, rep = [2, 1]) {
  const t = starTexture().clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]);
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
}

// 4-pointed star prism
function starGeo(r, depth, inner = 0.32) {
  const pts = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 2; const rr = i % 2 ? r * inner : r; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return G3.extrude(pts, depth, 0.002);
}

// ---------------------------------------------------------------------------
// Bell robe: a skirt that is re-shaped every frame to enclose the legs.
// Control rings: waist + hip (follow the pelvis), knees and hem (follow the legs).
const SEGS = 26, ROWS_PER = [2, 4, 5];
class Robe {
  constructor(rig, mats) {
    this.rig = rig;
    const rows = ROWS_PER.reduce((a, b) => a + b, 0);
    this.rows = rows;
    const nv = (SEGS + 1) * rows;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2);
    const idx = [];
    for (let r = 0; r < rows; r++) {
      for (let s = 0; s <= SEGS; s++) {
        const i = r * (SEGS + 1) + s;
        uv[i * 2] = s / SEGS; uv[i * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && s < SEGS) { const a = i, b = i + 1, c2 = i + SEGS + 1, d = i + SEGS + 2; idx.push(a, c2, b, b, c2, d); }
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    // hem band (2 rows)
    const bg = new THREE.BufferGeometry();
    this.bpos = new Float32Array((SEGS + 1) * 2 * 3);
    const bidx = [];
    for (let s = 0; s < SEGS; s++) { const a = s, b = s + 1, c2 = s + SEGS + 1, d = s + SEGS + 2; bidx.push(a, c2, b, b, c2, d); }
    bg.setAttribute('position', new THREE.BufferAttribute(this.bpos, 3));
    bg.setIndex(bidx);
    this.bgeo = bg;
    const tg = new THREE.BufferGeometry();
    this.tpos = new Float32Array(rows * 2 * 3);
    const tidx = [];
    for (let r = 0; r < rows - 1; r++) { const a = r * 2; tidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    tg.setAttribute('position', new THREE.BufferAttribute(this.tpos, 3));
    tg.setIndex(tidx);
    this.tgeo = tg;
    this.ctrl = [new Array(SEGS + 1), new Array(SEGS + 1), new Array(SEGS + 1), new Array(SEGS + 1)];
    for (const c of this.ctrl) for (let s = 0; s <= SEGS; s++) c[s] = new THREE.Vector3();
    this.flutter = 0;
  }
  update(t, accel) {
    const rig = this.rig, j = rig.j, M = rig.hips.matrix;
    const [W, H, K, F] = this.ctrl;
    const kc = _v.addVectors(j.knL, j.knR).multiplyScalar(0.5);
    const krx = Math.max(0.23, Math.abs(j.knL.x - j.knR.x) / 2 + 0.13), krz = Math.max(0.21, Math.abs(j.knL.z - j.knR.z) / 2 + 0.14);
    const fc = _w.addVectors(j.ftL, j.ftR).multiplyScalar(0.5);
    const lowF = Math.min(j.ftL.y, j.ftR.y);
    const frx = Math.max(0.29, Math.abs(j.ftL.x - j.ftR.x) / 2 + 0.2), frz = Math.max(0.3, Math.abs(j.ftL.z - j.ftR.z) / 2 + 0.22);
    const sway = Math.max(-0.12, Math.min(0.12, accel.z * 0.012));
    const hemY = Math.min(kc.y - 0.12, lowF - 0.06);
    for (let s = 0; s <= SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      const sa = Math.sin(a), ca = Math.cos(a);
      W[s].set(sa * 0.185, 0.13, ca * 0.15).applyMatrix4(M);
      H[s].set(sa * 0.235, -0.08, ca * 0.2).applyMatrix4(M);
      K[s].set(kc.x + sa * krx, kc.y, kc.z + ca * krz);
      const fl = Math.sin(a * 3 + t * 3.1) * 0.012 + Math.sin(a * 5 - t * 4.3) * 0.008;
      F[s].set(fc.x + sa * (frx + fl), hemY + Math.sin(a * 4 + t * 2.7) * 0.012 + (ca < 0 ? -ca * 0.03 : 0), fc.z + ca * (frz + fl) + sway * (1 - ca) * 0.6);
    }
    // Catmull-Rom rows through W,H,K,F
    const P = this.pos;
    let r = 0;
    const seg = [[W, W, H, K], [W, H, K, F], [H, K, F, F]];
    for (let g = 0; g < 3; g++) {
      const n = ROWS_PER[g];
      for (let k = 0; k < n; k++) {
        const tt = g === 2 ? k / (n - 1) : k / n;
        const t2 = tt * tt, t3 = t2 * tt;
        const c0 = -0.5 * t3 + t2 - 0.5 * tt, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * tt, c3 = 0.5 * t3 - 0.5 * t2;
        const [A, B, Cc, D] = seg[g];
        for (let s = 0; s <= SEGS; s++) {
          const o = (r * (SEGS + 1) + s) * 3;
          // phantom endpoints: mirror for the first/last segment
          let a0 = A[s];
          const d0 = D[s];
          if (g === 0) { _u.copy(W[s]).multiplyScalar(2).sub(H[s]); a0 = _u; }
          const ax = a0.x, ay = a0.y, az = a0.z;
          let dx = d0.x, dy = d0.y, dz = d0.z;
          if (g === 2) { dx = 2 * F[s].x - K[s].x; dy = 2 * F[s].y - K[s].y; dz = 2 * F[s].z - K[s].z; }
          P[o] = c0 * ax + c1 * B[s].x + c2 * Cc[s].x + c3 * dx;
          P[o + 1] = c0 * ay + c1 * B[s].y + c2 * Cc[s].y + c3 * dy;
          P[o + 2] = c0 * az + c1 * B[s].z + c2 * Cc[s].z + c3 * dz;
        }
        r++;
      }
    }
    const floor = 0.008 - rig.root.position.y;
    for (let i = 1; i < P.length; i += 3) if (P[i] < floor) P[i] = floor;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    // front trim strip (gold) along the front meridian
    const T = this.tpos, N = this.geo.attributes.normal.array;
    for (let r2 = 0; r2 < this.rows; r2++) {
      const o0 = (r2 * (SEGS + 1)) * 3, o1 = (r2 * (SEGS + 1) + 1) * 3, oL = (r2 * (SEGS + 1) + SEGS - 1) * 3;
      for (let k = 0; k < 3; k++) {
        const c = P[o0 + k], off = N[o0 + k] * 0.007;
        T[r2 * 6 + k] = c + (P[oL + k] - c) * 0.28 + off;
        T[r2 * 6 + 3 + k] = c + (P[o1 + k] - c) * 0.28 + off;
      }
    }
    this.tgeo.attributes.position.needsUpdate = true;
    this.tgeo.computeVertexNormals();
    this.tgeo.computeBoundingSphere();
    // hem band: last row and a row slightly above, pushed out a touch
    const B2 = this.bpos;
    for (let s = 0; s <= SEGS; s++) {
      for (let k = 0; k < 2; k++) {
        const row = this.rows - 1 - k;
        const o = (row * (SEGS + 1) + s) * 3, ob = (k * (SEGS + 1) + s) * 3;
        const cx = k === 0 ? fc.x : (fc.x + kc.x) / 2, cz = k === 0 ? fc.z : (fc.z + kc.z) / 2;
        const dx = P[o] - cx, dz = P[o + 2] - cz, l = Math.hypot(dx, dz) || 1;
        B2[ob] = P[o] + (dx / l) * 0.012; B2[ob + 1] = P[o + 1] + (k === 0 ? -0.005 : 0.03); B2[ob + 2] = P[o + 2] + (dz / l) * 0.012;
      }
    }
    this.bgeo.attributes.position.needsUpdate = true;
    this.bgeo.computeVertexNormals();
    this.bgeo.computeBoundingSphere();
  }
}

// Phase Step timeline (forward and backward variants)
const PHASE = [[0, 'stance'], [3, { root: [0, 0.84, 0], lean: 16, twist: 20, head: [18, 0], hL: [0.12, 1.15, 0.12], hR: [0.12, 1.05, 0.25], wR: 90, glow: 1, fade: 0.8 }, 'io'],
      [6, { root: [0, 0.8, 0], lean: 18, twist: 30, head: [20, 0], hL: [0.1, 1.1, 0.15], hR: [0.1, 1.0, 0.22], wR: 90, glow: 1.5, fade: 0 }, 'in'],
      [8, { root: [0, 0.8, 0], lean: 18, twist: 30, hL: [0.1, 1.1, 0.15], hR: [0.1, 1.0, 0.22], wR: 90, fade: 0 }],
      [9, { root: [0.04, 0.9, 0], lean: -6, twist: -20, head: [-8, 0], hL: [0.42, 1.3, -0.28], hR: [0.2, 1.05, 0.32], wR: 80, glow: 1.4, fade: 0.25 }, 'out'],
      [12, { root: [0.02, 0.93, 0], lean: -2, twist: -14, hL: [0.38, 1.25, -0.2], hR: [0.18, 1.03, 0.3], wR: 82, glow: 0.6, fade: 1 }, 'out'], ['e', 'stance', 'io']];

// ---------------------------------------------------------------------------
// Supernova Lance: a cosmic beam from the staff crystal across the screen.
const LANCE = {
  autoPos: false,
  build(ctx, e) {
    const g = new THREE.Group();
    const len = 9.2;
    const beamMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, a: { value: 0 }, c1: { value: new THREE.Color(0x3a8cff).multiplyScalar(0.85) }, c2: { value: new THREE.Color(C.mag).multiplyScalar(0.7) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float t; uniform float a; uniform vec3 c1; uniform vec3 c2; varying vec2 vUv;
        void main(){ float x = vUv.y; float s = vUv.x;
          float flow = 0.5 + 0.5 * sin(x * 60.0 - t * 40.0 + s * 12.566);
          float flow2 = 0.5 + 0.5 * sin(x * 23.0 - t * 22.0 - s * 25.13);
          float edge = smoothstep(1.0, 0.86, x);
          float k = (0.3 + 0.45 * flow * flow2) * a * edge;
          vec3 col = mix(c1, c2, flow2 * 0.6);
          gl_FragColor = vec4(col * k, k); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), beamMat);
    outer.rotation.z = -Math.PI / 2;
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfefff).multiplyScalar(0.95), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), coreMat);
    core.rotation.z = -Math.PI / 2;
    // spiral of stars around the beam
    const pts = [];
    for (let i = 0; i <= 200; i++) { const u = i / 200; const a = u * Math.PI * 2 * 7; pts.push(new THREE.Vector3(u * len, Math.cos(a) * 0.42, Math.sin(a) * 0.42)); }
    const helix = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.022, 5, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.mag).multiplyScalar(0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const helix2 = helix.clone(); helix2.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(0.85), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white).multiplyScalar(1.0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.4, 40), new THREE.ShaderMaterial({
      uniforms: { a: { value: 0 }, c: { value: new THREE.Color(C.glow).multiplyScalar(0.8) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float a; uniform vec3 c; varying vec2 vP; void main(){ float r = length(vP); float ang = atan(vP.y, vP.x); float k = exp(-pow((r - 0.55) / 0.35, 2.0)) * (0.6 + 0.4 * sin(ang * 8.0)) * a; gl_FragColor = vec4(c * k, k); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    halo.rotation.y = Math.PI / 2;
    const body = new THREE.Group();
    body.add(outer, core, helix, helix2);
    g.add(body, muzzle, halo);
    g.userData = { t: 0, len, body, outer, core, helix, helix2, muzzle, halo, beamMat, coreMat, k: 0 };
    return g;
  },
  update(obj, e, ctx) {
    const u = obj.userData;
    u.t += ctx.dt;
    const F = ctx.G.fighters[e.o];
    const c = ctx.view && ctx.view.extras.crystal;
    const p = c ? c.getWorldPosition(_v) : _v.set((F.x + F.face * 9000) * ctx.S2M, (F.y + 12500) * ctx.S2M, 0);
    obj.position.set(p.x + F.face * 0.08, p.y, 0.1);
    obj.scale.x = F.face;
    u.k = Math.min(1, u.k + ctx.dt * 14);
    const k = u.k;
    const R = 0.5 * (0.92 + 0.08 * Math.sin(u.t * 40));
    const L = u.len * Math.min(1, e.age / 5 + 0.15);
    u.outer.scale.set(R * k, L, R * k); u.outer.position.x = L / 2;
    u.core.scale.set(R * 0.28 * k, L, R * 0.28 * k); u.core.position.x = L / 2;
    for (const [hh, sgn] of [[u.helix, 1], [u.helix2, -1]]) { hh.scale.set(L / u.len, k, k); hh.rotation.x = sgn * u.t * 9; }
    u.beamMat.uniforms.t.value = u.t; u.beamMat.uniforms.a.value = k;
    u.coreMat.opacity = k;
    u.muzzle.scale.setScalar(k * (0.9 + 0.25 * Math.sin(u.t * 31)));
    u.halo.material.uniforms.a.value = k; u.halo.rotation.x = u.t * 3;
    const V = ctx.vfx;
    for (let i = 0; i < 2; i++) {
      const d = Math.random() * L, a = Math.random() * Math.PI * 2;
      V.particle({ x: p.x + F.face * d, y: p.y + Math.cos(a) * R * 1.3, z: 0.25 + Math.sin(a) * R, color: Math.random() < 0.3 ? C.mag : C.glow, shape: 'star', size: [0.05, 0.1], size1: 0, life: [0.2, 0.4], speed: 0, intensity: 1.0, vx: F.face * (6 + Math.random() * 8), vy: (Math.random() - 0.5) * 1.5, drag: 0.95 });
    }
    if (Math.random() < 0.3) V.light({ x: p.x + F.face * 2, y: p.y, color: C.glow, intensity: 6, life: 0.12, distance: 7 });
  },
  end(obj, e, ctx) {
    const g = cloneBare(obj);
    // fade the beam out quickly
    ctx.vfx.custom(g, 0.22, (o, k) => {
      o.scale.y = 1 - k; o.scale.z = 1 - k;
      o.traverse((m) => { if (m.material && m.material.uniforms && m.material.uniforms.a) m.material.uniforms.a.value = 1 - k; else if (m.material) m.material.opacity = 1 - k; });
    });
  },
};

// ---------------------------------------------------------------------------
export default {
  id: 'orren',
  scale: 1.0,
  dims: { upper: 0.31, fore: 0.3, neck: 0.44 },
  outline: 0x07061a,
  glowColor: 0x9fe8ff,
  flip: false,
  wDefaults: { kd: { R: 172 }, dead: { R: 168 }, airHit: { R: 125 }, held: { R: -70 }, dispel: { R: 95 }, hitHigh: { R: 110 }, hitMid: { R: 60 }, rise: { R: 40 } },

  build(ctx) {
    const { rig, ms } = ctx;
    const d = rig.d;
    const robe = ms.toon(C.robe), robeD = ms.toon(C.robeD), robeL = ms.toon(C.robeL), gold = ms.toon(C.gold), goldD = ms.toon(C.goldD);
    const skin = ms.toon(C.skin), dark = ms.toon(C.dark), wood = ms.toon(C.wood), inner = ms.toon(C.inner);
    const glow = ms.glow(C.glow, 3.4), glowS = ms.glow(C.glow, 2.2), mag = ms.glow(C.mag, 3.0), white = ms.glow(C.white, 4.0);
    const add = (parent, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
    const overlays = [];

    // --- Pelvis / sash (the skirt itself is the deforming Robe below)
    add(rig.hips, part(G3.ellip(0.17, 0.14, 0.14), robeD, ms), 0, 0.03, 0);
    add(rig.hips, part(G3.cyl(0.19, 0.185, 0.075, 22), gold, ms), 0, 0.12, 0);
    add(rig.hips, part(G3.cyl(0.196, 0.196, 0.022, 22), goldD, ms), 0, 0.16, 0);
    // belt clasp: gold disc with a magenta gem
    add(rig.hips, part(G3.cyl(0.05, 0.05, 0.02, 16), gold, ms), 0, 0.12, 0.185, Math.PI / 2, 0, 0);
    add(rig.hips, part(G3.sphere(0.022, 10, 8), mag, null, { outline: false }), 0, 0.12, 0.2);

    // --- Torso: layered robe, gold V collar, star clasp
    add(rig.hips, part(G3.limb(0.155, 0.14, 0.18), robe, ms), 0, 0.21, 0);
    add(rig.chest, part(G3.ellip(0.205, 0.215, 0.15), robe, ms), 0, 0.05, 0);
    add(rig.chest, part(G3.ellip(0.12, 0.17, 0.05), inner, ms), 0, 0.03, 0.115);
    for (const s of [-1, 1]) {
      add(rig.chest, part(G3.box(0.035, 0.3, 0.02), gold, ms, { smoothOutline: true }), s * 0.065, 0.07, 0.14, -0.12, 0, s * 0.42);
    }
    add(rig.chest, part(starGeo(0.05, 0.015), gold, ms), 0, -0.04, 0.165);
    add(rig.chest, part(G3.sphere(0.018, 10, 8), glow, null, { outline: false }), 0, -0.04, 0.18);
    // constellation studs on the chest
    for (const [x, y] of [[-0.12, 0.1], [-0.09, 0.0], [0.13, 0.12], [0.1, -0.03], [0.15, 0.03]]) add(rig.chest, part(G3.sphere(0.008, 6, 5), glowS, null, { outline: false }), x, y, 0.13);
    // mantle over the shoulders + tall flared collar
    add(rig.chest, part(G3.ellip(0.27, 0.11, 0.2), robeD, ms), 0, 0.2, -0.01);
    add(rig.chest, part(G3.torus(0.2, 0.018, 6, 28), gold, ms), 0, 0.17, -0.01, Math.PI / 2, 0, 0);
    const collar = new THREE.CylinderGeometry(0.17, 0.12, 0.2, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76);
    add(rig.chest, part(collar, ms.toon(C.robeL, { side: THREE.DoubleSide, unique: true }), ms), 0, 0.33, -0.03, -0.12, 0, 0);
    const collarTrim = new THREE.TorusGeometry(0.17, 0.011, 5, 20, Math.PI * 0.76);
    add(rig.chest, part(collarTrim, gold, ms), 0, 0.43, -0.04, Math.PI / 2 - 0.12, 0, Math.PI * 0.12 + Math.PI);

    // --- Hood: dark face void, glowing eyes, gold rim and a star circlet
    const h = rig.head;
    add(h, part(G3.ellip(0.165, 0.19, 0.18), robe, ms), 0, 0.02, -0.03);
    add(h, part(G3.cone(0.09, 0.2, 12), robe, ms), 0, 0.07, -0.18, -2.0, 0, 0);
    add(h, part(G3.ellip(0.108, 0.135, 0.07), dark, ms), 0, -0.01, 0.105);
    add(h, part(G3.torus(0.115, 0.021, 7, 26), robeL, ms), 0, -0.005, 0.135, 0.08, 0, 0);
    add(h, part(G3.torus(0.128, 0.008, 5, 26, Math.PI * 1.15), gold, ms), 0, -0.005, 0.145, 0.08, 0, -Math.PI * 0.075 + Math.PI * 0.0);
    const eyeL = add(h, part(G3.ellip(0.024, 0.011, 0.01), white, null, { outline: false }), 0.042, 0.005, 0.168, 0, 0, -0.18);
    const eyeR = add(h, part(G3.ellip(0.024, 0.011, 0.01), white, null, { outline: false }), -0.042, 0.005, 0.168, 0, 0, 0.18);
    add(h, part(starGeo(0.034, 0.012), gold, ms), 0, 0.15, 0.13, -0.35, 0, 0);
    add(h, part(G3.sphere(0.012, 8, 6), mag, null, { outline: false }), 0, 0.15, 0.142);
    // halo of three orbiting stars
    const halo = new THREE.Group(); halo.position.set(0, 0.33, -0.03); h.add(halo);
    add(halo, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.005, 4, 40), ms.glow(C.glow, 1.6, { transparent: true, opacity: 0.55 })), 0, 0, 0, Math.PI / 2, 0, 0);
    const haloStars = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const st = add(halo, part(starGeo(0.058, 0.014, 0.3), i === 1 ? mag : white, null, { outline: false }), Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2);
      haloStars.push(st);
    }
    halo.rotation.x = 0.18;

    // --- Arms: robe upper arms, bell sleeves, pale hands
    const sleeves = [];
    const sleeveMat = ms.toon(C.robe, { side: THREE.DoubleSide, unique: true });
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      const ua = rig.seg['ua' + s], fa = rig.seg['fa' + s];
      add(ua, part(G3.limb(0.07, 0.065, d.upper - 0.06), robe, ms), 0, -d.upper / 2, 0);
      add(ua, part(G3.ellip(0.12, 0.09, 0.12), robeD, ms), sg * 0.02, -0.02, 0);
      add(ua, part(G3.torus(0.1, 0.012, 5, 18), gold, ms), sg * 0.01, -0.07, 0, Math.PI / 2 + 0.2, 0, 0);
      add(fa, part(new THREE.CylinderGeometry(0.068, 0.115, d.fore * 0.92, 18, 1, true), sleeveMat, ms), 0, -d.fore * 0.5, 0);
      add(fa, part(G3.torus(0.114, 0.011, 6, 22), gold, ms), 0, -d.fore * 0.95, 0, Math.PI / 2, 0, 0);
      add(rig.hand[s], part(G3.ellip(0.045, 0.06, 0.035), skin, ms), 0, 0.01, 0);
      add(rig.hand[s], part(G3.limb(0.012, 0.01, 0.05), skin, ms), sg * 0.02, 0.07, 0.01, 0, 0, sg * 0.25);
      add(rig.hand[s], part(G3.torus(0.018, 0.006, 4, 10), gold, ms), 0, 0.045, 0, Math.PI / 2, 0, 0);
      const drape = new Ribbon({ segs: 4, len: 0.3, width: 0.2, taper: 0.7, mat: ms.toon(C.robeD, { side: THREE.DoubleSide, unique: true }), drag: 0.86, gravity: 9.8 });
      sleeves.push({ s, r: drape });
    }
    // palm glow (left hand) driven by pose.palm
    const palm = add(rig.hand.L, new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), ms.glow(C.glow, 2.6, { transparent: true, opacity: 0, additive: true })), 0, 0.08, 0.02);

    // --- Legs (hidden by the robe) and pointed slippers
    for (const s of ['L', 'R']) {
      add(rig.seg['th' + s], part(G3.limb(0.075, 0.06, d.thigh - 0.1), robeD, ms), 0, -d.thigh / 2, 0);
      add(rig.seg['sh' + s], part(G3.limb(0.055, 0.045, d.shin - 0.06), robeD, ms), 0, -d.shin / 2, 0);
      add(rig.foot[s], part(G3.ellip(0.05, 0.04, 0.12), robeD, ms), 0, -0.03, 0.05);
      add(rig.foot[s], part(G3.cone(0.03, 0.08, 8), gold, ms), 0, -0.03, 0.19, Math.PI / 2, 0, 0);
    }

    // --- Staff: dark starwood, gold bands, crescent cradle and floating crystal
    const staff = new THREE.Group();
    add(staff, part(G3.cyl(0.021, 0.026, 1.95, 10), wood, ms), 0, 0.2, 0);
    for (const y of [-0.74, -0.05, 0.05, 0.62, 1.02]) add(staff, part(G3.cyl(0.031, 0.031, y === -0.74 ? 0.07 : 0.035, 10), gold, ms), 0, y, 0);
    add(staff, part(G3.cone(0.026, 0.08, 8), gold, ms), 0, -0.82, 0, Math.PI, 0, 0);
    add(staff, part(G3.sphere(0.04, 12, 10), gold, ms), 0, 1.14, 0);
    add(staff, part(G3.torus(0.12, 0.016, 6, 22, Math.PI * 1.25), gold, ms), 0, 1.3, 0, 0, Math.PI / 2, -Math.PI * 0.125 - Math.PI / 2 + Math.PI);
    for (const s of [-1, 1]) add(staff, part(G3.cone(0.018, 0.09, 6), gold, ms), 0, 1.36, s * 0.13, s * 0.5, 0, 0);
    const crystalG = new THREE.Group(); crystalG.position.set(0, 1.32, 0); staff.add(crystalG);
    const crystalMat = ms.glow(C.glow, 3.6);
    const crystal = add(crystalG, new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), crystalMat), 0, 0, 0);
    crystal.scale.set(1, 1.7, 1);
    const crystalCore = add(crystalG, new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), ms.glow(0xffffff, 5)), 0, 0, 0);
    crystalCore.scale.set(1, 1.6, 1);
    const aura = add(crystalG, new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), ms.glow(C.glow, 1.4, { transparent: true, opacity: 0.12, additive: true })), 0, 0, 0);
    const motes = [];
    for (let i = 0; i < 3; i++) motes.push(add(crystalG, new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), i ? glow : mag), 0, 0, 0));
    rig.hand.R.add(staff);
    const tip = new THREE.Object3D(); tip.position.set(0, 1.32, 0); staff.add(tip);
    const base = new THREE.Object3D(); base.position.set(0, 0.95, 0); staff.add(base);

    // --- Levitation glow on the floor
    const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(0.7), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = 0.012;
    rig.root.add(floorGlow);

    // --- Robe skirt (deforming) + constellation overlay + gold hem
    const robeMat = ms.toon(C.robe, { side: THREE.DoubleSide, unique: true });
    const skirt = new Robe(rig);
    const skirtMesh = part(skirt.geo, robeMat, ms);
    const skirtStars = new THREE.Mesh(skirt.geo, starOverlayMat(C.glow, 1.7, [3, 1.2]));
    skirtStars.renderOrder = 3;
    overlays.push(skirtStars.material);
    const goldDS = ms.toon(C.gold, { side: THREE.DoubleSide, unique: true });
    const hemMesh = part(skirt.bgeo, goldDS, ms);
    const trimMesh = new THREE.Mesh(skirt.tgeo, goldDS);

    // --- Cape with stars
    const capeMat = ms.toon(C.robeD, { side: THREE.DoubleSide, unique: true });
    const cape = new Ribbon({ segs: 9, len: 1.12, width: 0.5, taper: 1.35, mat: capeMat, drag: 0.9 });
    const capeStars = new THREE.Mesh(cape.geo, starOverlayMat(C.glow, 1.5, [1, 1.6]));
    capeStars.frustumCulled = false; capeStars.renderOrder = 3; cape.mesh.add(capeStars);
    overlays.push(capeStars.material);
    const capeTrim = new Ribbon({ segs: 9, len: 1.14, width: 0.54, taper: 1.35, mat: ms.toon(C.gold, { side: THREE.DoubleSide, unique: true }), drag: 0.9 });

    // --- Per-frame driver (runs after the rig is solved each frame)
    let pose = null;
    const apply0 = rig.apply.bind(rig);
    rig.apply = (P) => { pose = P; apply0(P); };
    const group = new THREE.Group();
    group.add(skirtMesh, skirtStars, hemMesh, trimMesh);
    for (const sl of sleeves) group.add(sl.r.mesh);
    let t = 0, lastFade = 1;
    const glowBase = crystalMat.color.clone();
    const driver = {
      mesh: group,
      update(anchor, accel, dt) {
        t += dt;
        const P = pose || {};
        // hover (fades out when lying down)
        const hy = rig.j.hips.y;
        const hk = Math.max(0, Math.min(1, (hy - 0.32) / 0.3));
        rig.root.position.y = hk * (0.085 + Math.sin(t * 2.1) * 0.015);
        floorGlow.position.y = 0.012 - rig.root.position.y;
        floorGlow.material.opacity = 0.12 + 0.1 * hk;
        skirt.update(t, accel);
        // sleeves
        for (const sl of sleeves) {
          const el = rig.j['el' + sl.s], ha = rig.j['ha' + sl.s];
          _v.subVectors(ha, el); const len = _v.length() || 1; _v.divideScalar(len);
          _w.copy(el).addScaledVector(_v, len * 0.9); _w.y -= 0.05;
          sl.r.update(_w, accel, dt, null, _v);
        }
        // halo + crystal
        halo.rotation.y = t * 1.4;
        for (let i = 0; i < 3; i++) { haloStars[i].rotation.y = -t * 1.4; haloStars[i].rotation.z = t * 2 + i; }
        crystalG.position.y = 1.32 + Math.sin(t * 2.3) * 0.025;
        crystal.rotation.y = t * 1.5; crystalCore.rotation.y = -t * 2.2;
        for (let i = 0; i < 3; i++) { const a = t * 3.1 + (i * Math.PI * 2) / 3; motes[i].position.set(Math.cos(a) * 0.14, Math.sin(a * 1.3) * 0.06, Math.sin(a) * 0.14); }
        const g = P.glow || 0;
        crystalMat.color.copy(glowBase).multiplyScalar(1 + g * 1.5);
        aura.scale.setScalar(1 + g * 0.35 + Math.sin(t * 5) * 0.05);
        aura.material.opacity = 0.1 + g * 0.25;
        // palm burst glow
        const pk = P.palm || 0;
        palm.material.opacity = Math.min(0.9, pk * 0.8);
        palm.scale.setScalar(0.4 + pk * 0.9);
        palm.visible = pk > 0.02;
        // eyes flare with glow
        eyeL.scale.setScalar(1 + g * 0.5); eyeR.scale.setScalar(1 + g * 0.5);
        // vanish fade (Phase Step)
        const fade = P.fade == null ? 1 : Math.max(0, Math.min(1, P.fade));
        if (Math.abs(fade - lastFade) > 0.001) {
          ms.setOpacity(fade);
          for (const m of ms.glows) { m.transparent = true; if (m.userData.op0 == null) m.userData.op0 = m.opacity; m.opacity = m.userData.op0 * fade; }
          for (const m of overlays) m.opacity = fade;
          lastFade = fade;
        }
        rig.root.visible = fade > 0.03;
      },
    };

    return {
      trails: [{ tip, base, color: 0x9fe8ff }],
      ribbons: [
        { r: driver, body: 'hips', offset: [0, 0, 0] },
        { r: capeTrim, body: 'chest', offset: [0, 0.18, -0.155], z: -0.004 },
        { r: cape, body: 'chest', offset: [0, 0.18, -0.15] },
      ],
      crystal: crystalG, palm,
      glowColor: C.glow,
    };
  },

  // --------------------------------------------------------------------------
  poses: {
    stance: { root: [0, 0.93, 0], lean: 2, twist: -10, hipTwist: -6, head: [0, 8],
      hL: [0.27, 1.22, -0.16], eL: [0, -1, -0.4], hR: [0.36, 1.04, 0.24], wR: 86,
      fL: [0.12, 0, -0.1], fR: [-0.12, 0, 0.12, 0, -15], glow: 0, palm: 0, fade: 1 },
    crouch: { root: [0, 0.6, 0], lean: 14, twist: -12, hipTwist: -6, head: [-8, 8],
      hL: [0.3, 0.94, -0.14], hR: [0.42, 0.8, 0.24], wR: 80,
      fL: [0.26, 0, -0.12], fR: [-0.24, 0, 0.14, 0, -15] },
    jumpUp: { root: [0, 1.0, 0], lean: -2, head: [-6, 0], hL: [0.25, 1.45, -0.25], hR: [0.12, 1.2, 0.3], wR: 70, fL: [0.06, 0.28, -0.08, 20], fR: [-0.08, 0.2, 0.1, 10] },
    fall: { root: [0, 0.98, 0], lean: 4, hL: [0.3, 1.38, -0.25], hR: [0.14, 1.12, 0.3], wR: 62, fL: [0.1, 0.16, -0.1], fR: [-0.08, 0.24, 0.1, 15] },
    jumpTuck: { root: [0, 0.98, 0], lean: 8, hL: [0.3, 1.3, -0.25], hR: [0.18, 1.12, 0.3], wR: 55, fL: [0.12, 0.34, -0.1, 20], fR: [0.0, 0.3, 0.1, 20] },
    walk: { stride: 0.16, lift: 0.04, bob: 0.012 },
    dash: { root: [0.05, 0.9, 0], lean: 18, head: [-6, 0], hL: [0.05, 1.05, -0.32], hR: [-0.15, 1.0, 0.32], wR: 160, fL: [0.18, 0.06, -0.1], fR: [-0.25, 0.1, 0.12, -20] },
    bdash: { root: [-0.04, 0.95, 0], lean: -8, head: [6, 0], hL: [0.35, 1.25, -0.15], hR: [0.12, 1.08, 0.32], wR: 70, fL: [0.18, 0.08, -0.1], fR: [-0.2, 0.04, 0.12] },
    intro: { root: [0, 0.82, 0], lean: 18, head: [28, 0], twist: 0, hL: [0.25, 1.12, -0.04], hR: [0.25, 1.1, 0.12], eL: [0, -1, -0.3], eR: [0, -1, 0.3], wR: 90, fL: [0.06, 0, -0.1], fR: [-0.06, 0, 0.1], glow: 1.2 },
    win: { root: [0, 0.98, 0], lean: -4, head: [-22, -8], twist: -14, hL: [0.15, 1.95, -0.2], hR: [0.22, 1.05, 0.3], wR: 90, fL: [0.1, 0, -0.1], fR: [-0.1, 0, 0.12], glow: 1.5, palm: 0.8 },
    cast: { root: [0, 0.93, 0], lean: 4, head: [-6, 0], hL: [0.5, 1.3, -0.08], hR: [0.18, 1.05, 0.3], wR: 80, fL: [0.14, 0, -0.1], fR: [-0.14, 0, 0.12], palm: 0.6 },
    blockHigh: { root: [-0.04, 0.9, 0], lean: 6, twist: -18, head: [10, 0], hL: [0.3, 1.45, -0.05], hR: [0.3, 1.3, 0.2], wR: 105, wRy: 20, eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.14, 0, -0.1], fR: [-0.16, 0, 0.12] },
    blockLow: { root: [-0.04, 0.58, 0], lean: 14, twist: -18, head: [8, 0], hL: [0.3, 0.98, -0.05], hR: [0.32, 0.9, 0.2], wR: 100, wRy: 20, eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.26, 0, -0.14], fR: [-0.26, 0, 0.14] },
  },

  moves: {
    // Palm Strike — left palm thrust at face height
    stL: [[0, 'stance'], ['s-2', { twist: -6, hL: [0.22, 1.28, -0.06], palm: 0.2 }, 'io'],
      ['s', { root: [0.07, 0.93, 0], lean: 8, twist: -40, head: [-2, 30], hL: [0.72, 1.28, 0.02], eL: [0, -0.6, -0.8], palm: 1 }, 'snap'],
      ['a+2', { root: [0.07, 0.93, 0], lean: 8, twist: -40, head: [-2, 30], hL: [0.68, 1.27, 0.02], eL: [0, -0.6, -0.8], palm: 0.6 }], ['e', 'stance', 'io']],
    // Staff Thrust — two-handed spear thrust with the crystal
    stM: [[0, 'stance'], ['s-4', { root: [-0.04, 0.92, 0], twist: -30, hR: [-0.05, 1.12, 0.22], hL: [-0.15, 1.1, 0.05], wR: 4 }, 'io'],
      ['s', { root: [0.12, 0.9, 0], lean: 14, twist: 8, head: [0, 0], hR: [0.48, 1.12, 0.12], hL: [0.3, 1.1, 0.05], wR: 0, glow: 0.6, fL: [0.34, 0, -0.1] }, 'snap'],
      ['a+2', { root: [0.12, 0.9, 0], lean: 14, twist: 8, hR: [0.46, 1.12, 0.12], hL: [0.28, 1.1, 0.05], wR: 0, glow: 0.4, fL: [0.34, 0, -0.1] }], ['e', 'stance', 'io']],
    // Starfall Arc — overhead arc from above the head to the front
    stH: [[0, 'stance'], ['s-5', { root: [-0.04, 0.96, 0], lean: -8, twist: -16, head: [-14, 0], hR: [-0.12, 1.45, 0.22], hL: [-0.08, 1.4, 0.0], wR: 150 }, 'io'],
      ['s', { root: [0.04, 0.96, 0], lean: -4, twist: 0, head: [-26, 0], hR: [0.18, 1.75, 0.16], hL: [0.12, 1.68, -0.02], wR: 92, glow: 0.8 }, 'snap'],
      ['s+2', { root: [0.12, 0.92, 0], lean: 12, twist: 10, head: [-10, 0], hR: [0.42, 1.55, 0.14], hL: [0.34, 1.5, 0.0], wR: 42, glow: 1, fL: [0.3, 0, -0.1] }, 'snap'],
      ['a+2', { root: [0.14, 0.88, 0], lean: 18, twist: 12, hR: [0.48, 1.3, 0.14], hL: [0.4, 1.28, 0.0], wR: 18, glow: 0.4, fL: [0.3, 0, -0.1] }], ['e', 'stance', 'io']],
    // Staff Tap — quick low tap of the crystal
    crL: [[0, 'crouch'], ['s-2', { hR: [0.12, 0.95, 0.26], wR: 20 }],
      ['s', { root: [0.05, 0.58, 0], lean: 18, hR: [0.0, 0.88, 0.26], wR: -42, glow: 0.4 }, 'snap'], ['a+2', { root: [0.05, 0.58, 0], lean: 18, hR: [0.0, 0.87, 0.26], wR: -41 }], ['e', 'crouch']],
    // Low Staff Poke
    crM: [[0, 'crouch'], ['s-3', { twist: -30, hR: [-0.1, 0.62, 0.3], hL: [-0.05, 0.66, 0.1], wR: -6 }, 'io'],
      ['s', { root: [0.12, 0.56, 0], lean: 24, twist: 14, hR: [0.4, 0.5, 0.18], hL: [0.24, 0.52, 0.06], wR: -14, glow: 0.4, fL: [0.4, 0, -0.12] }, 'snap'],
      ['a+3', { root: [0.12, 0.56, 0], lean: 24, twist: 14, hR: [0.38, 0.5, 0.18], hL: [0.22, 0.52, 0.06], wR: -13, fL: [0.4, 0, -0.12] }], ['e', 'crouch', 'io']],
    // Orbit Sweep — low spinning staff sweep
    crH: [[0, 'crouch'], ['s-4', { twist: -55, lean: 18, hR: [-0.1, 0.5, 0.34], hL: [0.0, 0.55, 0.14], wR: -6, wRy: 150 }, 'io'],
      ['s-2', { twist: -20, lean: 22, hR: [0.12, 0.42, 0.36], hL: [0.1, 0.48, 0.14], wR: -8, wRy: 85 }],
      ['s', { root: [0.1, 0.48, 0], lean: 26, twist: 30, hR: [0.4, 0.36, 0.22], hL: [0.22, 0.4, 0.1], wR: -6, wRy: 10, glow: 0.6, fL: [0.42, 0, -0.14] }, 'snap'],
      ['a+3', { root: [0.1, 0.48, 0], lean: 26, twist: 52, hR: [0.3, 0.38, -0.05], hL: [0.18, 0.42, -0.1], wR: 10, wRy: 40, fL: [0.42, 0, -0.14] }], ['e', 'crouch', 'io']],
    jL: [[0, 'fall'], ['s', { lean: 16, twist: -30, head: [14, 20], hL: [0.52, 0.74, 0.0], eL: [0, -0.4, -0.9], palm: 1 }, 'snap'], ['a', { lean: 16, twist: -30, head: [14, 20], hL: [0.5, 0.74, 0.0], eL: [0, -0.4, -0.9], palm: 0.6 }], ['e', 'fall']],
    jM: [[0, 'fall'], ['s-3', { hR: [-0.05, 1.3, 0.3], hL: [-0.05, 1.25, 0.1], wR: 120 }],
      ['s', { lean: 18, twist: 6, head: [10, 0], hR: [0.3, 0.86, 0.2], hL: [0.18, 0.92, 0.06], wR: -38, glow: 0.4 }, 'snap'], ['a', { lean: 20, twist: 8, head: [10, 0], hR: [0.3, 0.82, 0.2], hL: [0.18, 0.88, 0.06], wR: -46 }], ['e', 'fall']],
    // Meteor Spike — staff driven straight down
    jH: [[0, 'fall'], ['s-4', { lean: -4, hR: [0.12, 1.55, 0.24], hL: [0.06, 1.5, 0.05], wR: 95, fL: [0.18, 0.4, -0.1], fR: [0.0, 0.35, 0.1] }],
      ['s', { lean: 14, hR: [0.36, 0.95, 0.2], hL: [0.3, 1.02, 0.04], wR: -76, glow: 1, fL: [0.1, 0.3, -0.1], fR: [-0.05, 0.36, 0.1] }, 'snap'],
      ['a', { lean: 16, hR: [0.36, 0.9, 0.2], hL: [0.3, 0.98, 0.04], wR: -80, glow: 0.6, fL: [0.1, 0.3, -0.1], fR: [-0.05, 0.36, 0.1] }], ['e', 'fall']],
    // Comet Palm — stepping magic palm burst
    fH: [[0, 'stance'], ['s-8', { root: [-0.06, 0.92, 0], lean: -4, twist: 20, head: [0, -10], hL: [-0.12, 1.15, -0.25], eL: [0, -0.5, -1], palm: 0.6, glow: 0.3 }, 'io'],
      ['s', { root: [0.16, 0.88, 0], lean: 14, twist: -46, head: [0, 34], hL: [0.74, 1.12, 0.04], eL: [0, -0.5, -0.8], palm: 1.6, fL: [0.42, 0, -0.1], fR: [-0.2, 0, 0.12] }, 'snap'],
      ['a+3', { root: [0.16, 0.88, 0], lean: 14, twist: -46, head: [0, 34], hL: [0.7, 1.12, 0.04], eL: [0, -0.5, -0.8], palm: 0.8, fL: [0.42, 0, -0.1], fR: [-0.2, 0, 0.12] }], ['e', 'stance', 'io']],
    throw: [[0, 'stance'], ['s', { root: [0.1, 0.9, 0], lean: 12, twist: -30, hL: [0.6, 1.3, -0.02], palm: 0.6 }, 'snap'], ['e', 'throwWhiff']],
    // Star Bolt — fling a star with the left hand
    Q: [[0, 'stance'], ['s-6', { root: [-0.04, 0.93, 0], twist: 16, head: [0, -6], hL: [-0.1, 1.32, -0.24], eL: [0, -0.4, -1], palm: 0.7, glow: 0.5 }, 'io'],
      ['s', { root: [0.06, 0.92, 0], lean: 8, twist: -40, head: [-2, 30], hL: [0.66, 1.2, 0.02], eL: [0, -0.6, -0.8], palm: 1.2, glow: 0.8 }, 'snap'],
      ['s+8', { root: [0.05, 0.92, 0], lean: 6, twist: -34, head: [-2, 26], hL: [0.6, 1.18, 0.0], palm: 0 }], ['e', 'stance', 'io']],
    Qup: [[0, 'stance'], ['s-6', { root: [-0.04, 0.9, 0], lean: 4, twist: 16, hL: [-0.05, 1.05, -0.24], palm: 0.7, glow: 0.5 }, 'io'],
      ['s', { root: [0.04, 0.95, 0], lean: -10, twist: -36, head: [-26, 26], hL: [0.48, 1.58, 0.0], eL: [0, -0.8, -0.6], palm: 1.2, glow: 0.8 }, 'snap'],
      ['s+8', { root: [0.03, 0.95, 0], lean: -8, twist: -30, head: [-20, 22], hL: [0.44, 1.55, 0.0], palm: 0 }], ['e', 'stance', 'io']],
    Qair: [[0, 'fall'], ['s-5', { lean: -6, twist: 16, hL: [-0.05, 1.32, -0.25], palm: 0.7, glow: 0.5, fL: [0.1, 0.25, -0.1], fR: [-0.1, 0.3, 0.1] }, 'io'],
      ['s', { lean: 18, twist: -36, head: [16, 26], hL: [0.55, 0.78, 0.0], palm: 1.2, glow: 0.8, fL: [0.1, 0.25, -0.1], fR: [-0.1, 0.3, 0.1] }, 'snap'],
      ['e', { lean: 10, twist: -20, hL: [0.45, 0.95, -0.1], palm: 0 }]],
    // Gravity Well — staff levelled at the spot, left hand clenching space
    W: [[0, 'stance'], ['s-8', { root: [-0.02, 0.95, 0], lean: -6, twist: -10, head: [-12, 6], hR: [0.12, 1.5, 0.26], hL: [0.25, 1.55, -0.2], wR: 110, glow: 0.8, palm: 0.5 }, 'io'],
      ['s', { root: [0.08, 0.9, 0], lean: 12, twist: 6, head: [-4, 0], hR: [0.42, 1.25, 0.18], hL: [0.48, 1.05, -0.12], wR: 6, glow: 1.6, palm: 1.0, fL: [0.3, 0, -0.1] }, 'snap'],
      ['s+10', { root: [0.07, 0.9, 0], lean: 10, twist: 4, hR: [0.4, 1.22, 0.18], hL: [0.42, 1.08, -0.12], wR: 4, glow: 0.8, palm: 0.4, fL: [0.3, 0, -0.1] }], ['e', 'stance', 'io']],
    // Phase Step — fold into the cloak, vanish, unfold (Eb shares it)
    E: PHASE,
    Eb: PHASE,
    // Supernova Lance — staff levelled, both hands braced, crystal blazing
    R: [[0, 'stance'], [6, { root: [-0.08, 0.98, 0], lean: -10, twist: -24, head: [-24, 10], hR: [-0.05, 1.6, 0.25], hL: [0.2, 1.75, -0.2], wR: 120, glow: 2.5, palm: 1 }, 'io'],
      ['s-2', { root: [-0.08, 0.98, 0], lean: -12, twist: -26, head: [-26, 10], hR: [-0.06, 1.62, 0.25], hL: [0.18, 1.78, -0.2], wR: 125, glow: 3, palm: 1.2 }],
      ['s', { root: [0.06, 0.86, 0], lean: 16, twist: 6, head: [-2, 0], hR: [0.3, 1.24, 0.16], hL: [0.14, 1.22, 0.02], wR: 2, glow: 3.2, palm: 0.4, fL: [0.34, 0, -0.12], fR: [-0.3, 0, 0.14, 0, -20] }, 'snap'],
      ['a', { root: [0.02, 0.86, 0], lean: 14, twist: 4, head: [-2, 0], hR: [0.28, 1.24, 0.16], hL: [0.12, 1.22, 0.02], wR: 3, glow: 2.6, palm: 0.4, fL: [0.34, 0, -0.12], fR: [-0.3, 0, 0.14, 0, -20] }],
      ['e', 'stance', 'io']],
  },

  locks: {
    throw: {
      // Orren seizes the foe with a gravity grip, lifts them and casts them away.
      atk: [[0, { root: [0.1, 0.9, 0], lean: 12, twist: -30, hL: [0.6, 1.3, -0.02], palm: 1 }],
        [12, { root: [0.02, 0.95, 0], lean: -6, twist: -20, head: [-14, 20], hL: [0.5, 1.7, -0.05], palm: 1.4, glow: 1 }, 'io'],
        [26, { root: [0.12, 0.9, 0], lean: 16, twist: -44, head: [0, 30], hL: [0.75, 1.25, 0.04], palm: 2, glow: 1.4, fL: [0.35, 0, -0.1] }, 'snap'],
        [34, 'stance', 'io']],
      vic: [[0, 'held'], [14, 'held'], [26, 'airHit']],
    },
  },

  // --------------------------------------------------------------------------
  ents: {
    bolt: {
      build(ctx, e) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(starGeo(0.15, 0.03, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.white).multiplyScalar(1.7) }));
        const halo = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(0.9), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.9, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.2), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        tail.rotation.z = Math.PI / 2; tail.position.x = -0.5;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 5, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.mag).multiplyScalar(2.5) }));
        const inner = new THREE.Group(); inner.add(core, halo, tail, ring);
        g.add(inner);
        g.userData = { core, ring, inner, t: 0 };
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        u.inner.rotation.z = Math.atan2(e.vy, Math.abs(e.vx) || 1);
        u.core.rotation.z = u.t * 9; u.ring.rotation.y = u.t * 6; u.ring.rotation.x = 0.5;
        const p = obj.position, dir = Math.atan2(e.vy, e.vx);
        if (Math.random() < 0.9) ctx.vfx.particle({ x: p.x - Math.cos(dir) * 0.15, y: p.y - Math.sin(dir) * 0.15, z: p.z, color: Math.random() < 0.25 ? C.mag : C.glow, shape: Math.random() < 0.4 ? 'star' : 'soft', size: [0.05, 0.11], size1: 0, life: [0.25, 0.5], speed: [0.2, 0.9], dir: dir + Math.PI, spread: 0.5, drag: 0.9, jx: 0.05, jy: 0.05 });
      },
      end(obj, e, ctx) {
        const p = obj.position;
        ctx.vfx.burst({ x: p.x, y: p.y, z: 0.3, count: 16, color: C.glow, color2: C.mag, speed: [1, 4], shape: 'star', size: [0.05, 0.1], life: [0.2, 0.4] });
        ctx.vfx.flash({ x: p.x, y: p.y, color: C.glow, size: 1.0, life: 0.12 });
      },
    },
    well: {
      build(ctx) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshBasicMaterial({ color: 0x050010 }));
        const swirl = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.ShaderMaterial({
          uniforms: { t: { value: 0 }, a: { value: 0 }, c1: { value: new THREE.Color(C.glow).multiplyScalar(0.9) }, c2: { value: new THREE.Color(C.mag).multiplyScalar(1.0) } },
          vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: `uniform float t; uniform float a; uniform vec3 c1; uniform vec3 c2; varying vec2 vP;
            void main(){ float r = length(vP); float ang = atan(vP.y, vP.x);
              float arms = 0.5 + 0.5 * sin(ang * 3.0 + log(r + 0.05) * 7.0 + t * 5.0);
              float band = smoothstep(1.12, 0.55, r) * smoothstep(0.17, 0.3, r);
              float rim = exp(-pow((r - 0.24) / 0.05, 2.0)) * 1.1;
              float k = (pow(arms, 3.0) * band + rim) * a;
              vec3 col = mix(c2, c1, smoothstep(0.25, 0.9, r) * arms);
              if (k < 0.003) discard; gl_FragColor = vec4(col * k, k); }`,
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        const disk = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.016, 4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        disk.rotation.x = Math.PI / 2 - 0.35;
        const disk2 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 4, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.mag).multiplyScalar(1.2), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
        disk2.rotation.x = Math.PI / 2 + 0.5;
        g.add(swirl, core, disk, disk2);
        g.userData = { swirl, core, disk, disk2, t: 0 };
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        const life = e.life || 180;
        const k = Math.min(1, e.age / 8) * Math.min(1, (life - e.age) / 12);
        u.swirl.material.uniforms.t.value = u.t; u.swirl.material.uniforms.a.value = k;
        u.core.scale.setScalar(0.3 + 0.7 * k + Math.sin(u.t * 9) * 0.04);
        u.disk.rotation.z = u.t * 2.5; u.disk2.rotation.z = -u.t * 3.4;
        u.disk.scale.setScalar(0.4 + 0.6 * k); u.disk2.scale.setScalar(0.4 + 0.6 * k);
        const p = obj.position;
        for (let i = 0; i < 2; i++) {
          if (Math.random() > 0.8 * k) continue;
          const a = Math.random() * Math.PI * 2, r = 0.75 + Math.random() * 0.35;
          const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r * 0.9;
          const sp = 2.2 + Math.random();
          ctx.vfx.particle({ x, y, z: 0.15, color: Math.random() < 0.4 ? C.mag : C.glow, shape: Math.random() < 0.3 ? 'star' : 'spark', size: [0.03, 0.06], size1: 0.0, life: 0.32, speed: 0, vx: -Math.cos(a) * sp * 0.8 - Math.sin(a) * sp * 0.6, vy: -Math.sin(a) * sp * 0.8 + Math.cos(a) * sp * 0.6, drag: 0.96, stretch: 1.2 });
        }
      },
      end(obj, e, ctx) {
        const p = obj.position;
        ctx.vfx.ring({ x: p.x, y: p.y, z: 0.2, color: C.mag, r0: 0.8, r1: 0.05, life: 0.25, thick: 0.12 });
        ctx.vfx.burst({ x: p.x, y: p.y, z: 0.2, count: 22, color: C.glow, color2: C.mag, speed: [2, 5], shape: 'star', size: [0.04, 0.09], life: [0.25, 0.5] });
        ctx.vfx.flash({ x: p.x, y: p.y, color: C.glow, size: 1.6, life: 0.15 });
      },
    },
    pulse: { build(ctx) { return new THREE.Group(); } },
    lance: LANCE,
    lanceEnd: LANCE,
  },

  onEvent(e, ctx) {
    const V = ctx.vfx, S2M = ctx.S2M, F = ctx.G.fighters[e.p];
    const play = (n) => ctx.audio && ctx.audio.play(n);
    const fx = F.x * S2M, fy = F.y * S2M;
    switch (e.t) {
      case 'cast': {
        if (e.id === 'E' || e.id === 'Eb') {
          play('teleport');
          V.burst({ x: fx, y: fy + 1.0, z: 0.2, count: 34, color: C.glow, color2: C.mag, speed: [0.5, 3], shape: 'star', size: [0.05, 0.11], life: [0.3, 0.6], jx: 0.25, jy: 0.6, drag: 0.92 });
          V.ring({ x: fx, y: fy + 1.0, z: 0.2, color: C.glow, r0: 1.0, r1: 0.1, life: 0.2, thick: 0.1 });
        } else if (e.id === 'R') {
          play('arcane_cast');
          V.burst({ x: fx, y: fy + 1.4, z: 0.3, count: 70, color: C.white, color2: C.glow, speed: [1, 7], shape: 'star', size: [0.05, 0.12], life: [0.4, 0.9], drag: 0.92 });
          V.ring({ x: fx, y: fy + 1.4, z: 0.3, color: C.mag, r0: 0.3, r1: 3.2, life: 0.6, thick: 0.12 });
        } else {
          play('arcane_cast');
          V.burst({ x: fx + F.face * 0.3, y: fy + 1.3, z: 0.3, count: 12, color: C.glow, color2: C.mag, speed: [0.5, 2], shape: 'star', size: [0.04, 0.08], life: [0.2, 0.4] });
        }
        break;
      }
      case 'cine': {
        if (e.k === 'phase_in') {
          const x = e.x * S2M, y = e.y * S2M + 1.0;
          V.burst({ x, y, z: 0.2, count: 34, color: C.glow, color2: C.mag, speed: [1, 5], shape: 'star', size: [0.05, 0.1], life: [0.25, 0.55], drag: 0.9, jy: 0.5, intensity: 1.3 });
          V.ring({ x, y, z: 0.2, color: C.glow, r0: 0.1, r1: 1.4, life: 0.3, thick: 0.1 });
          V.flash({ x, y, color: C.glow, size: 1.5, life: 0.14, intensity: 1.6 });
          V.light({ x, y, color: C.glow, intensity: 7, life: 0.2 });
        }
        break;
      }
      case 'spawn': {
        const x = e.x * S2M, y = e.y * S2M;
        if (e.k === 'orren.bolt') {
          V.flash({ x, y, color: C.glow, size: 1.0, life: 0.12 });
          V.burst({ x, y, z: 0.3, count: 10, color: C.white, color2: C.glow, speed: [1, 3], shape: 'star', size: [0.04, 0.08], life: [0.15, 0.3] });
        } else if (e.k === 'orren.well') {
          play('arcane_cast');
          V.ring({ x, y, z: 0.25, color: C.mag, r0: 1.6, r1: 0.1, life: 0.35, thick: 0.18 });
          V.ring({ x, y, z: 0.25, color: C.glow, r0: 2.2, r1: 0.2, life: 0.45, thick: 0.1 });
          V.flash({ x, y, color: C.mag, size: 2.4, life: 0.2 });
          V.light({ x, y, color: C.mag, intensity: 16, life: 0.4 });
        } else if (e.k === 'orren.pulse') {
          V.ring({ x, y, z: 0.25, color: C.mag, r0: 0.9, r1: 0.15, life: 0.25, thick: 0.08, alpha: 0.7, intensity: 1.4 });
        } else if (e.k === 'orren.lance') {
          play('beam');
          const c = ctx.view && ctx.view.extras.crystal;
          const p = c ? c.getWorldPosition(_v) : _v.set(fx + F.face * 0.9, fy + 1.25, 0);
          V.flash({ x: p.x, y: p.y, z: 0.6, color: C.glow, size: 3, life: 0.25, grow: true, intensity: 1.6 });
          V.ring({ x: p.x, y: p.y, z: 0.5, color: C.glow, r0: 0.2, r1: 2.6, life: 0.4, thick: 0.2, axis: 'x' });
          V.ring({ x: p.x, y: p.y, z: 0.5, color: C.mag, r0: 0.2, r1: 3.6, life: 0.55, thick: 0.12 });
          V.shake(0.12, 0.5);
          if (ctx.renderer) { ctx.renderer.fx.flash = Math.max(ctx.renderer.fx.flash, 0.18); ctx.renderer.fx.flashCol.set(C.glow); ctx.renderer.fx.chroma = 1.0; }
        }
        break;
      }
      case 'ent_end': {
        if (e.k === 'orren.bolt' && e.why === 'ground') {
          const x = e.x * S2M;
          play('arcane_impact');
          V.ring({ x, y: 0.03, color: C.glow, r0: 0.1, r1: 0.9, life: 0.3, axis: 'y' });
          V.burst({ x, y: 0.05, z: 0.2, count: 18, color: C.glow, color2: C.mag, speed: [1.5, 4], dir: Math.PI / 2, spread: 1.1, shape: 'star', size: [0.04, 0.09], life: [0.25, 0.5], gravity: 6 });
        }
        break;
      }
      case 'hit': {
        const x = e.x * S2M, y = e.y * S2M;
        if (e.k === 'orren.bolt') {
          play('arcane_impact');
          V.burst({ x, y, z: 0.4, count: 26, color: C.white, color2: C.glow, speed: [2, 7], shape: 'star', size: [0.05, 0.11], life: [0.2, 0.45] });
          V.ring({ x, y, z: 0.4, color: C.mag, r0: 0.1, r1: 1.0, life: 0.25, thick: 0.08 });
        } else if (e.k === 'orren.lance') {
          V.burst({ x, y, z: 0.5, count: 8, color: C.glow, color2: C.mag, speed: [3, 8], shape: 'spark', size: [0.03, 0.05], life: [0.1, 0.25], intensity: 1.2 });
        } else if (e.k === 'orren.lanceEnd') {
          play('explosion');
          V.flash({ x, y, z: 0.6, color: C.glow, size: 4.5, life: 0.35, grow: true, intensity: 1.8 });
          V.ring({ x, y, z: 0.5, color: C.glow, r0: 0.3, r1: 4.0, life: 0.6, thick: 0.25 });
          V.ring({ x, y, z: 0.5, color: C.mag, r0: 0.2, r1: 2.8, life: 0.5, thick: 0.15 });
          V.burst({ x, y, z: 0.5, count: 90, color: C.glow, color2: C.mag, speed: [3, 13], shape: 'star', size: [0.05, 0.12], life: [0.4, 1.0], drag: 0.9, intensity: 1.3 });
          V.light({ x, y, color: C.glow, intensity: 18, life: 0.6, distance: 10 });
          V.shake(0.25, 0.5);
          if (ctx.renderer) { ctx.renderer.fx.flash = Math.max(ctx.renderer.fx.flash, 0.3); ctx.renderer.fx.flashCol.set(0xd8f6ff); }
        } else if (!e.k && F.mv === 'fH') {
          V.burst({ x, y, z: 0.4, count: 20, color: C.glow, color2: C.mag, speed: [2, 6], shape: 'star', size: [0.05, 0.1], life: [0.2, 0.4] });
        }
        break;
      }
      case 'swing': {
        if (e.id === 'fH') {
          play('arcane_cast');
          V.ring({ x: fx + F.face * 0.8, y: fy + 1.15, z: 0.3, color: C.glow, r0: 0.1, r1: 0.7, life: 0.3, thick: 0.1, axis: 'x' });
        }
        break;
      }
      case 'ult': {
        V.pillar({ x: fx, y: fy, color: C.glow, height: 6, radius: 0.7, life: 0.8, intensity: 2.2 });
        V.burst({ x: fx, y: fy + 2.2, z: 0.3, count: 40, color: C.white, color2: C.mag, speed: [0.5, 3], shape: 'star', size: [0.06, 0.14], life: [0.6, 1.2], drag: 0.95 });
        break;
      }
    }
  },
};

