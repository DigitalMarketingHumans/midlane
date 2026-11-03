// Wren — the Thornwarden. Human druid-ranger in bark-brown leathers under a
// layered cloak of jagged leaves; a carved wooden half-mask crowned with twigs,
// moss and tiny glowing flowers, and a living thorned vine-whip.
import * as THREE from 'three';
import { part, G3, toonRamp } from '../toon.js';
import { Ribbon } from '../cloth.js';

// clone without userData (Object3D.clone JSON-copies userData, which may hold meshes)
function cloneBare(o) { const ud = o.userData; o.userData = {}; const c = o.clone(); o.userData = ud; return c; }

const C = {
  leather: 0x7d5030, leatherD: 0x553420, bark: 0x5c3e27, barkD: 0x36231a, barkL: 0x8a6440,
  leafD: 0x1f4a26, leaf: 0x3a7a34, leafL: 0x76b947, moss: 0x5d8f2c, mask: 0xd6b07a, maskD: 0x8c6440,
  hair: 0x8e3b22, skin: 0xd9a27c, vine: 0x3e6b2b, vineD: 0x274a1c, thorn: 0x8a4a2e,
  glow: 0x8dff7a, pink: 0xff8fc8, yellow: 0xffe36a,
};
const D2R = Math.PI / 180;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Jagged leaf texture for the cloak ribbons (alpha-cut).
const LEAF_TEX = {};
function leafTexture(seed) {
  if (LEAF_TEX[seed]) return LEAF_TEX[seed];
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 256);
  let s = seed * 7919 + 13;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const leaf = (cx, cy, w, h, rot, shade) => {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.beginPath(); x.moveTo(0, -h * 0.5);
    x.quadraticCurveTo(w, -h * 0.1, 0, h * 0.55);
    x.quadraticCurveTo(-w, -h * 0.1, 0, -h * 0.5);
    const g = shade | 0; x.fillStyle = `rgb(${g},${g},${g})`; x.fill();
    x.strokeStyle = `rgba(90,90,90,0.9)`; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(0, -h * 0.45); x.lineTo(0, h * 0.5); x.stroke();
    for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(0, k * h * 0.15); x.lineTo(w * 0.55, k * h * 0.15 + h * 0.12); x.moveTo(0, k * h * 0.15); x.lineTo(-w * 0.55, k * h * 0.15 + h * 0.12); x.stroke(); }
    x.restore();
  };
  // solid upper body of the strip, leaves overlapping toward the jagged hem
  x.fillStyle = 'rgb(205,205,205)'; x.fillRect(14, 0, 100, 150);
  for (let row = 0; row < 9; row++) {
    const y = 10 + row * 27;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const cx = 14 + (k + (row % 2) * 0.5) * (100 / (n - 0.5)) + (r() - 0.5) * 8;
      leaf(cx, y + 14 + r() * 8, 15 + r() * 6, 44 + r() * 14, (r() - 0.5) * 0.7, 175 + r() * 70);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  LEAF_TEX[seed] = t;
  return t;
}
function leafMat(ms, color, seed) {
  const m = ms.toon(color, { side: THREE.DoubleSide, unique: true });
  m.map = leafTexture(seed); m.alphaTest = 0.5; m.needsUpdate = true;
  return m;
}
function leafDepth(seed) {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTexture(seed), alphaTest: 0.5 });
}
function leafGeo(len, w) {
  // small flat leaf (pointed ellipse) in XY plane
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push([Math.sin(a) * w * (1 - 0.3 * Math.cos(a)), -Math.cos(a) * len / 2]); }
  for (let i = 9; i >= 1; i--) { const a = (i / 10) * Math.PI; pts.push([-Math.sin(a) * w * (1 - 0.3 * Math.cos(a)), -Math.cos(a) * len / 2]); }
  return G3.extrude(pts, 0.004, 0.001);
}

// ---------------------------------------------------------------------------
// Living vine whip: verlet chain + target shape from the pose's `whip` key
// [length m, angle deg (side plane, 0 = forward, 90 = up), bend deg].
const N = 22, RS = 6;
class Whip {
  constructor(ms, vineMat) {
    this.P = []; this.Q = []; this.T = [];
    for (let i = 0; i < N; i++) { this.P.push(new THREE.Vector3()); this.Q.push(new THREE.Vector3()); this.T.push(new THREE.Vector3()); }
    this.rad = []; for (let i = 0; i < N; i++) this.rad.push(0.032 - 0.021 * (i / (N - 1)));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * RS * 3);
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < RS; k++) {
      const a = i * RS + k, b = i * RS + (k + 1) % RS, c2 = a + RS, d = b + RS;
      idx.push(a, c2, b, b, c2, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = part(geo, vineMat, ms);
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    const thornMat = ms.toon(C.thorn);
    this.thorns = [];
    for (let k = 0; k < 9; k++) {
      const th = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 5), thornMat);
      th.geometry.translate(0, 0.02, 0);
      this.group.add(th); this.thorns.push(th);
    }
    this.leaves = [];
    const lm = ms.toon(C.leafL, { side: THREE.DoubleSide, unique: true });
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(leafGeo(0.07, 0.025), lm); this.group.add(l); this.leaves.push(l); }
    this.bud = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), ms.glow(C.pink, 2.6));
    this.group.add(this.bud);
    this.nrm = []; this.bin = []; this.tan = [];
    for (let i = 0; i < N; i++) { this.nrm.push(new THREE.Vector3()); this.bin.push(new THREE.Vector3()); this.tan.push(new THREE.Vector3()); }
    this.init = false;
    this.w = 0;
    this.anchorW = null;
  }
  update(dt, t, S, wp, anchorM, accel) {
    const P = this.P, Q = this.Q, T = this.T;
    if (!this.init) { for (let i = 0; i < N; i++) { P[i].set(S.x, S.y - i * 0.032, S.z + 0.02 * i); Q[i].copy(P[i]); } this.init = true; }
    dt = Math.min(dt, 1 / 30);
    let len = wp ? wp[0] : 0;
    let wT = Math.max(0, Math.min(1, (len - 0.25) / 0.35));
    if (anchorM) { len = anchorM.distanceTo(S); wT = 1; }
    // smooth the weight a little so cracks don't pop
    this.w += (wT - this.w) * Math.min(1, dt * 40);
    const w = this.w;
    const segRest = 0.034, seg = segRest + ((len / (N - 1)) - segRest) * w;
    // target
    if (w > 0.001 && (anchorM || wp)) {
      T[0].copy(S);
      if (anchorM) {
        for (let i = 1; i < N; i++) T[i].lerpVectors(S, anchorM, i / (N - 1));
      } else {
        const ang = (wp[1] || 0) * D2R, bend = (wp[2] || 0) * D2R, side = wp[3] || 0;
        const L = len / (N - 1);
        for (let i = 1; i < N; i++) {
          const u = i / (N - 1);
          const th = ang + bend * u * u;
          const wav = Math.sin(u * 9 - t * 18) * 0.035 * u * (1 - u) * 4;
          T[i].set(T[i - 1].x - side * L, T[i - 1].y + Math.sin(th) * L, T[i - 1].z + Math.cos(th) * L);
          T[i].y += wav * 0.25;
        }
      }
    }
    // verlet
    const g = 9.8 * dt * dt;
    P[0].copy(S); Q[0].copy(S);
    for (let i = 1; i < N; i++) {
      const p = P[i], q = Q[i];
      const vx = (p.x - q.x) * 0.9, vy = (p.y - q.y) * 0.9, vz = (p.z - q.z) * 0.9;
      q.copy(p);
      p.x += vx + accel.x * dt * dt * 0.3; p.y += vy - g; p.z += vz + accel.z * dt * dt * 0.3;
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < N; i++) {
        _a.subVectors(P[i], P[i - 1]);
        const dd = _a.length() || 1e-5;
        const diff = (dd - seg) / dd;
        if (i === 1) P[i].addScaledVector(_a, -diff);
        else { P[i - 1].addScaledVector(_a, diff * 0.5); P[i].addScaledVector(_a, -diff * 0.5); }
      }
      P[0].copy(S);
    }
    if (w > 0.001) for (let i = 1; i < N; i++) P[i].lerp(T[i], w);
    for (let i = 1; i < N; i++) if (P[i].y < 0.012) P[i].y = 0.012;
    // frames + tube
    for (let i = 0; i < N; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(N - 1, i + 1)];
      this.tan[i].subVectors(b, a).normalize();
    }
    const n0 = this.nrm[0];
    n0.set(1, 0, 0).addScaledVector(this.tan[0], -this.tan[0].x);
    if (n0.lengthSq() < 1e-6) n0.set(0, 0, 1);
    n0.normalize();
    for (let i = 0; i < N; i++) {
      if (i > 0) { this.nrm[i].copy(this.nrm[i - 1]).addScaledVector(this.tan[i], -this.nrm[i - 1].dot(this.tan[i])).normalize(); }
      this.bin[i].crossVectors(this.tan[i], this.nrm[i]);
      const r = this.rad[i] * (1 + 0.15 * w);
      for (let k = 0; k < RS; k++) {
        const ph = (k / RS) * Math.PI * 2;
        const cs = Math.cos(ph) * r, sn = Math.sin(ph) * r;
        const o = (i * RS + k) * 3;
        this.pos[o] = P[i].x + this.nrm[i].x * cs + this.bin[i].x * sn;
        this.pos[o + 1] = P[i].y + this.nrm[i].y * cs + this.bin[i].y * sn;
        this.pos[o + 2] = P[i].z + this.nrm[i].z * cs + this.bin[i].z * sn;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    for (let k = 0; k < this.thorns.length; k++) {
      const i = 3 + k * 2;
      const ph = k * 2.2;
      _b.copy(this.nrm[i]).multiplyScalar(Math.cos(ph)).addScaledVector(this.bin[i], Math.sin(ph)).addScaledVector(this.tan[i], 0.5).normalize();
      const th = this.thorns[k];
      th.position.copy(P[i]).addScaledVector(_b, this.rad[i] * 0.8);
      th.quaternion.setFromUnitVectors(UPV, _b);
    }
    for (let k = 0; k < this.leaves.length; k++) {
      const i = 2 + k * 4;
      const ph = k * 2.6 + 1;
      _b.copy(this.nrm[i]).multiplyScalar(Math.cos(ph)).addScaledVector(this.bin[i], Math.sin(ph)).normalize();
      const l = this.leaves[k];
      l.position.copy(P[i]).addScaledVector(_b, 0.035);
      l.quaternion.setFromUnitVectors(UPV, _b);
    }
    this.bud.position.copy(P[N - 1]);
    this.bud.scale.setScalar(0.6 + w * 0.8);
  }
}

// ---------------------------------------------------------------------------
// Giant wooden fist (ultimate) and other entity props

const OUT = 0x120a06;
function toonM(color) {
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: toonRamp() });
}
function outlined(geo, m, w = 0.03) {
  const mesh = new THREE.Mesh(geo, m);
  const o = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: OUT, side: THREE.BackSide }));
  o.scale.setScalar(1 + w);
  mesh.add(o);
  return mesh;
}
function woodFist() {
  const g = new THREE.Group();
  const bark = toonM(C.bark), barkD = toonM(C.barkD), moss = toonM(C.moss), thorn = toonM(C.thorn);
  // trunk-forearm rising from the ground
  const arm = outlined(new THREE.CylinderGeometry(0.42, 0.62, 2.0, 12), bark, 0.04); arm.position.y = 1.0; g.add(arm);
  for (let i = 0; i < 6; i++) { // bark ridges
    const a = (i / 6) * Math.PI * 2;
    const rid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.1), barkD); rid.position.set(Math.cos(a) * 0.5, 0.95, Math.sin(a) * 0.5); rid.rotation.y = -a; rid.rotation.z = 0.06; g.add(rid);
  }
  // fist
  const fist = new THREE.Group(); fist.position.y = 2.25; g.add(fist);
  fist.add(outlined(new THREE.SphereGeometry(0.62, 16, 12).scale(1.05, 0.8, 0.85), bark, 0.04));
  for (let i = 0; i < 4; i++) { // knuckles (fingers curled, facing up)
    const k = outlined(new THREE.CapsuleGeometry(0.17, 0.32, 4, 10), bark, 0.05);
    k.rotation.z = Math.PI / 2; k.position.set(-0.36 + i * 0.24, 0.44, 0.18); fist.add(k);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), barkD); nub.position.set(-0.36 + i * 0.24, 0.6, 0.18); fist.add(nub);
  }
  const thumb = outlined(new THREE.CapsuleGeometry(0.14, 0.4, 4, 10), bark, 0.05); thumb.rotation.set(0.3, 0, 0.9); thumb.position.set(0.55, 0.15, 0.38); fist.add(thumb);
  // moss cap, thorns, glowing flowers
  const mc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1.1, 0.5, 0.9), moss); mc.position.y = 0.32; fist.add(mc);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 6), thorn);
    sp.position.set(Math.cos(a) * 0.62, -0.1 + (i % 3) * 0.12, Math.sin(a) * 0.55);
    sp.lookAt(sp.position.clone().multiplyScalar(3).add(new THREE.Vector3(0, 0.5, 0)));
    sp.rotateX(Math.PI / 2);
    fist.add(sp);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? C.pink : C.yellow).multiplyScalar(2.2) }));
    fl.position.set(Math.cos(a) * 0.45, 0.42 + Math.sin(i) * 0.05, Math.sin(a) * 0.4); fist.add(fl);
  }
  // roots splaying at the base
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const rt = outlined(new THREE.ConeGeometry(0.16, 1.2, 7), barkD, 0.05);
    rt.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.65); rt.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
    g.add(rt);
  }
  return g;
}
function thornSpear(len) {
  const g = new THREE.Group();
  const m = toonM(C.barkD), t = toonM(C.thorn);
  const s = outlined(new THREE.ConeGeometry(0.12, len, 7), m, 0.06); s.position.y = len / 2; g.add(s);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), t); b.position.set(Math.cos(i * 2) * 0.08, len * (0.25 + i * 0.15), Math.sin(i * 2) * 0.08); b.rotation.z = (i % 2 ? 1 : -1) * 0.9; g.add(b); }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(2.4) })); tip.position.y = len; g.add(tip);
  return g;
}
function vineCurl(h, r, turns, rad, color) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const u = i / 24; const a = u * Math.PI * 2 * turns; pts.push(new THREE.Vector3(Math.cos(a) * r * (1 - 0.4 * u), u * h, Math.sin(a) * r * (1 - 0.4 * u))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, rad, 6, false), toonM(color));
  m.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, rad + 0.011, 6, false), new THREE.MeshBasicMaterial({ color: OUT, side: THREE.BackSide })));
  // a few thorns along the vine
  const tm = toonM(C.thorn);
  for (let i = 2; i < 22; i += 4) {
    const t = curve.getPointAt(i / 24), tg = curve.getTangentAt(i / 24);
    const th = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.5, rad * 2.4, 5), tm);
    const out = new THREE.Vector3(t.x, 0, t.z).normalize();
    th.position.copy(t).addScaledVector(out, rad);
    th.quaternion.setFromUnitVectors(UPV, out.addScaledVector(tg, 0.3).normalize());
    m.add(th);
  }
  return m;
}

// ---------------------------------------------------------------------------
export default {
  id: 'wren',
  scale: 0.94,
  dims: { shoulderW: 0.185, hipW: 0.1, upper: 0.29, fore: 0.28 },
  outline: 0x140c06,
  glowColor: 0x8dff7a,
  flip: true,
  wDefaults: { kd: { R: -150 }, dead: { R: -150 }, airHit: { R: -120 }, held: { R: -80 }, dispel: { R: -60 }, hitHigh: { R: -100 } },

  build(ctx) {
    const { rig, ms } = ctx;
    const d = rig.d;
    const leather = ms.toon(C.leather), leatherD = ms.toon(C.leatherD), bark = ms.toon(C.bark), barkD = ms.toon(C.barkD), barkL = ms.toon(C.barkL);
    const leafD = ms.toon(C.leafD), leaf = ms.toon(C.leaf), leafL = ms.toon(C.leafL), moss = ms.toon(C.moss), mask = ms.toon(C.mask), maskD = ms.toon(C.maskD);
    const hair = ms.toon(C.hair), skin = ms.toon(C.skin), vine = ms.toon(C.vine);
    const glow = ms.glow(C.glow, 3.4), pinkG = ms.glow(C.pink, 2.6), yelG = ms.glow(C.yellow, 2.4);
    const add = (parent, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
    const flower = (parent, x, y, z, col, sz = 1) => {
      const f = new THREE.Group(); f.position.set(x, y, z); parent.add(f);
      for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(G3.sphere(0.012 * sz, 6, 5), col); const a = (i / 5) * Math.PI * 2; p.position.set(Math.cos(a) * 0.014 * sz, 0, Math.sin(a) * 0.014 * sz); f.add(p); }
      f.add(new THREE.Mesh(G3.sphere(0.008 * sz, 6, 5), yelG));
      return f;
    };
    const mossTuft = (parent, x, y, z, sx = 1) => {
      add(parent, part(G3.ellip(0.07 * sx, 0.03, 0.06 * sx, 10, 6), moss, ms), x, y, z);
      add(parent, part(G3.ellip(0.04 * sx, 0.025, 0.045 * sx, 8, 6), leafL, ms), x + 0.03 * sx, y + 0.012, z - 0.01);
    };

    // --- Hips: belt with flowers, leather tassets, leaf skirt layers
    add(rig.hips, part(G3.ellip(0.145, 0.12, 0.11), leatherD, ms), 0, 0.02, 0);
    add(rig.hips, part(G3.cyl(0.15, 0.145, 0.055, 18), leather, ms), 0, 0.09, 0);
    add(rig.hips, part(G3.box(0.06, 0.05, 0.03), barkL, ms, { smoothOutline: true }), 0, 0.09, 0.16);
    mossTuft(rig.hips, -0.13, 0.12, 0.06, 0.8);
    flower(rig.hips, -0.14, 0.14, 0.09, pinkG, 1.1);
    flower(rig.hips, 0.12, 0.13, 0.1, yelG, 0.9);
    add(rig.hips, part(G3.box(0.07, 0.09, 0.05), leatherD, ms, { smoothOutline: true }), 0.15, 0.03, -0.06, 0, 0.6, 0); // pouch
    for (const s of [-1, 1]) {
      add(rig.hips, part(leafGeo(0.24, 0.07), leafD, ms), s * 0.1, -0.08, 0.1, 0.25, s * 0.35, Math.PI);
      add(rig.hips, part(leafGeo(0.22, 0.06), leaf, ms), s * 0.15, -0.07, -0.02, -0.1, s * 1.4, Math.PI);
    }
    add(rig.hips, part(leafGeo(0.26, 0.08), leaf, ms), 0, -0.1, 0.12, 0.2, 0, Math.PI);

    // --- Torso: leather jerkin, bark breastplate, cross strap
    add(rig.hips, part(G3.limb(0.125, 0.11, 0.17), leather, ms), 0, 0.2, 0);
    add(rig.chest, part(G3.ellip(0.17, 0.19, 0.125), leather, ms), 0, 0.06, 0);
    add(rig.chest, part(G3.ellip(0.135, 0.12, 0.055), bark, ms), 0, 0.09, 0.09, -0.15, 0, 0);
    for (const y of [0.05, 0.1, 0.15]) add(rig.chest, part(G3.box(0.17, 0.008, 0.02), barkD, ms), 0, y, 0.14, -0.15 + (y - 0.1) * 0.8, 0, 0);
    add(rig.chest, part(G3.torus(0.2, 0.018, 5, 26, Math.PI * 1.1), leatherD, ms), 0, 0.02, 0.0, 0.2, Math.PI / 2, 0.9);
    add(rig.chest, part(G3.cyl(0.07, 0.085, 0.1, 12), skin, ms), 0, 0.26, 0.0); // neck
    // leaf collar / mantle
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + (i / 8) * Math.PI * 1.9;
      add(rig.chest, part(leafGeo(0.17, 0.05), i % 2 ? leaf : leafD, ms), Math.sin(a) * 0.16, 0.2, Math.cos(a) * 0.13 - 0.02, -0.5 * Math.cos(a), a, Math.PI + Math.sin(a) * 0.6);
    }
    // shoulder bark pauldrons with moss and flowers
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.2, 0.2, 0); rig.chest.add(sh);
      add(sh, part(G3.ellip(0.085, 0.06, 0.085), bark, ms), s * 0.02, 0, 0, 0, 0, s * -0.4);
      mossTuft(sh, s * 0.02, 0.05, 0.0, 1);
      flower(sh, s * 0.05, 0.08, 0.04, s > 0 ? pinkG : yelG, 1.1);
      flower(sh, s * -0.03, 0.075, -0.05, s > 0 ? yelG : pinkG, 0.8);
    }

    // --- Head: auburn hair, carved wooden half-mask, glowing eyes, twig crown
    const h = rig.head;
    add(h, part(G3.ellip(0.11, 0.13, 0.115), skin, ms), 0, -0.01, 0.01);               // face/jaw
    add(h, part(G3.ellip(0.125, 0.125, 0.13), hair, ms), 0, 0.03, -0.035);               // hair mass
    add(h, part(G3.ellip(0.07, 0.15, 0.06), hair, ms), 0, -0.08, -0.11, 0.25, 0, 0);    // hair down the back
    for (const s of [-1, 1]) add(h, part(G3.ellip(0.03, 0.09, 0.05), hair, ms), s * 0.1, -0.04, 0.02, 0, 0, s * 0.15); // side locks
    add(h, part(G3.ellip(0.118, 0.085, 0.07), mask, ms), 0, 0.025, 0.075);              // mask
    add(h, part(G3.box(0.026, 0.06, 0.02), mask, ms, { smoothOutline: true }), 0, 0.0, 0.14, -0.2, 0, 0); // flat nose bridge
    add(h, part(G3.ellip(0.03, 0.012, 0.012), ms.toon(0xb8665a), null, { outline: false }), 0, -0.075, 0.105); // lips
    for (const s of [-1, 1]) {
      add(h, part(G3.ellip(0.03, 0.016, 0.02), ms.toon(0x0b0604), null, { outline: false }), s * 0.045, 0.03, 0.135, 0, s * 0.3, s * 0.15);
      add(h, part(G3.ellip(0.016, 0.009, 0.01), glow, null, { outline: false }), s * 0.045, 0.03, 0.148, 0, s * 0.3, s * 0.15);
      add(h, part(G3.box(0.07, 0.008, 0.01), maskD, ms), s * 0.055, 0.075, 0.12, -0.4, s * 0.35, s * -0.25); // carved brows
      add(h, part(G3.box(0.008, 0.05, 0.01), maskD, ms), s * 0.075, -0.01, 0.125, 0, s * 0.5, s * 0.2);    // cheek grooves
    }
    // twig crown with thorns, leaves and a flower
    add(h, part(G3.torus(0.122, 0.012, 5, 24), barkD, ms), 0, 0.09, -0.005, Math.PI / 2 + 0.22, 0, 0);
    // a low circlet of twigs and thorns across the brow (front arc only, short)
    for (let i = 0; i < 9; i++) {
      const a = -1.15 + (i / 8) * 2.3;
      const hgt = i === 4 ? 0.085 : i % 2 ? 0.045 : 0.065;
      const tw = add(h, part(G3.cone(0.009, hgt, 5), i % 2 ? ms.toon(C.thorn) : barkD, ms), Math.sin(a) * 0.122, 0.1 + hgt / 2 - 0.01 - Math.abs(a) * 0.02, Math.cos(a) * 0.122 - 0.01);
      tw.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
    }
    // braid down the back
    for (let i = 0; i < 5; i++) add(h, part(G3.ellip(0.03 - i * 0.003, 0.04, 0.03 - i * 0.003), hair, ms), 0, -0.13 - i * 0.06, -0.14 - i * 0.012, 0.2, 0, i % 2 ? 0.3 : -0.3);
    add(h, part(G3.torus(0.02, 0.006, 4, 10), leafL, ms), 0, -0.4, -0.2, Math.PI / 2, 0, 0);
    for (const [a, c] of [[0.6, leafL], [-0.7, leaf], [2.4, leafL]]) add(h, part(leafGeo(0.07, 0.022), c, ms), Math.sin(a) * 0.13, 0.12, Math.cos(a) * 0.12, -0.3, a, 0.5);
    flower(h, -0.09, 0.12, 0.07, pinkG, 1.3);

    // --- Arms: bare upper arms with leather straps, bark bracers with vine wraps
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      const ua = rig.seg['ua' + s], fa = rig.seg['fa' + s];
      add(ua, part(G3.limb(0.046, 0.04, d.upper - 0.06), skin, ms), 0, -d.upper / 2, 0);
      add(ua, part(G3.ellip(0.062, 0.06, 0.062), leather, ms), sg * 0.01, -0.01, 0);
      add(ua, part(G3.torus(0.046, 0.009, 5, 14), leatherD, ms), 0, -d.upper * 0.55, 0, Math.PI / 2, 0, 0);
      add(fa, part(G3.limb(0.042, 0.036, d.fore - 0.06), skin, ms), 0, -d.fore / 2, 0);
      add(fa, part(G3.limb(0.052, 0.044, d.fore * 0.6), bark, ms), 0, -d.fore * 0.6, 0);
      add(fa, part(G3.torus(0.05, 0.008, 5, 14), vine, ms), 0, -d.fore * 0.45, 0, Math.PI / 2 + 0.3, 0, 0);
      add(fa, part(G3.torus(0.047, 0.008, 5, 14), vine, ms), 0, -d.fore * 0.72, 0, Math.PI / 2 - 0.3, 0, 0);
      add(rig.hand[s], part(G3.ellip(0.034, 0.045, 0.028), skin, ms), 0, 0.01, 0);
      add(rig.hand[s], part(G3.cyl(0.036, 0.034, 0.03, 10), leatherD, ms), 0, -0.02, 0);
    }
    // left palm sigil glow (seed toss / casting) driven by pose.palm
    const palm = add(rig.hand.L, new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), ms.glow(C.glow, 2.2, { transparent: true, opacity: 0, additive: true })), 0, 0.07, 0.02);

    // --- Legs: leather leggings, knee wraps, bark-brown boots with leaf trim
    for (const s of ['L', 'R']) {
      const th = rig.seg['th' + s], sh = rig.seg['sh' + s];
      add(th, part(G3.limb(0.066, 0.052, d.thigh - 0.1), leatherD, ms), 0, -d.thigh / 2, 0);
      add(th, part(G3.torus(0.062, 0.01, 5, 14), leather, ms), 0, -d.thigh * 0.35, 0, Math.PI / 2, 0, 0);
      add(sh, part(G3.limb(0.052, 0.042, d.shin - 0.06), bark, ms), 0, -d.shin / 2, 0);
      add(sh, part(G3.ellip(0.05, 0.045, 0.05), barkL, ms), 0, 0.0, 0.03);
      add(sh, part(G3.torus(0.053, 0.009, 5, 14), vine, ms), 0, -d.shin * 0.3, 0, Math.PI / 2 + 0.25, 0, 0);
      for (let i = 0; i < 3; i++) add(sh, part(leafGeo(0.09, 0.028), leafD, ms), (i - 1) * 0.035, -d.shin * 0.18, 0.05, 0.4, 0, Math.PI + (i - 1) * 0.4);
      add(rig.foot[s], part(G3.ellip(0.05, 0.044, 0.115), barkD, ms), 0, -0.03, 0.05);
    }

    // --- Whip: handle in the right hand, coil, living vine
    const handle = new THREE.Group(); rig.hand.R.add(handle);
    add(handle, part(G3.cyl(0.017, 0.02, 0.2, 8), barkL, ms), 0, 0.04, 0);
    add(handle, part(G3.sphere(0.026, 8, 6), barkD, ms), 0, -0.07, 0);
    add(handle, part(G3.torus(0.022, 0.006, 4, 10), vine, ms), 0, 0.1, 0, Math.PI / 2, 0, 0);
    const handleTip = new THREE.Object3D(); handleTip.position.set(0, 0.14, 0); handle.add(handleTip);
    const coil = new THREE.Group(); coil.position.set(0, -0.02, 0.0); rig.hand.R.add(coil);
    const vineMat = ms.toon(C.vine, { unique: true });
    for (let i = 0; i < 2; i++) {
      const tor = add(coil, part(G3.torus(0.085 - i * 0.012, 0.015, 6, 20), vineMat, ms), 0, -0.07 - i * 0.03, 0.02 * i, 0.2 + i * 0.4, 0, 0.3);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; const tn = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 4), ms.toon(C.thorn)); tn.position.set(Math.cos(a) * (0.085 - i * 0.012), Math.sin(a) * (0.085 - i * 0.012), 0.015); tn.rotation.z = a - Math.PI / 2; tor.add(tn); }
    }
    const whip = new Whip(ms, vineMat);
    const tip = new THREE.Object3D(), tipBase = new THREE.Object3D();

    // --- Leaf cloak (three layered ribbons) + hip leaf tails
    const mkLeafRibbon = (color, seed, len, width, segs = 9) => {
      const r = new Ribbon({ segs, len, width, taper: 0.85, mat: leafMat(ms, color, seed), drag: 0.9 });
      r.mesh.customDepthMaterial = leafDepth(seed);
      return r;
    };
    const cloakBack = mkLeafRibbon(C.leafD, 1, 1.0, 0.5);
    const cloakMid = mkLeafRibbon(C.leaf, 2, 0.85, 0.46);
    const cloakTop = mkLeafRibbon(C.leafL, 3, 0.5, 0.44, 6);
    const tailL = mkLeafRibbon(C.leaf, 4, 0.45, 0.14, 5);
    const tailR = mkLeafRibbon(C.leafD, 5, 0.5, 0.14, 5);

    // --- Per-frame driver
    let pose = null;
    const apply0 = rig.apply.bind(rig);
    rig.apply = (P) => { pose = P; apply0(P); };
    const group = new THREE.Group();
    group.add(whip.group, tip, tipBase);
    let t = 0;
    let anchorW = null;
    const S = new THREE.Vector3(), AM = new THREE.Vector3();
    const driver = {
      mesh: group,
      update(anchor, accel, dt) {
        t += dt;
        const P = pose || {};
        handleTip.getWorldPosition(S); rig.root.worldToLocal(S);
        // vault vine latch (world-space anchor)
        let am = null;
        if (P.vine) {
          if (!anchorW) { anchorW = new THREE.Vector3(0, 5.0, 1.7); rig.root.localToWorld(anchorW); anchorW.z = 0; }
          AM.copy(anchorW); rig.root.worldToLocal(AM); am = AM;
        } else anchorW = null;
        whip.update(dt, t, S, P.whip, am, accel);
        const wv = whip.w;
        coil.scale.setScalar(Math.max(0.001, 1 - wv));
        coil.visible = wv < 0.98;
        tip.position.copy(whip.P[N - 1]); tipBase.position.copy(whip.P[N - 6]);
        const pk = P.palm || 0;
        palm.material.opacity = Math.min(0.85, pk * 0.8); palm.scale.setScalar(0.4 + pk); palm.visible = pk > 0.02;
      },
    };
    return {
      trails: [{ tip, base: tipBase, color: 0x9dff6a }],
      ribbons: [
        { r: driver, body: 'hips', offset: [0, 0, 0] },
        { r: cloakBack, body: 'chest', offset: [0, 0.2, -0.15], z: -0.006 },
        { r: cloakMid, body: 'chest', offset: [0, 0.21, -0.145], z: -0.003 },
        { r: cloakTop, body: 'chest', offset: [0, 0.23, -0.14] },
        { r: tailL, body: 'hips', offset: [0.12, 0.05, -0.1] },
        { r: tailR, body: 'hips', offset: [-0.12, 0.05, -0.1] },
      ],
      whip, palm,
      glowColor: C.glow,
    };
  },

  // --------------------------------------------------------------------------
  poses: {
    stance: { root: [0, 0.86, 0], lean: 10, twist: -22, hipTwist: -16, head: [-2, 20],
      hL: [0.34, 1.2, -0.1], eL: [0, -1, -0.3], hR: [0.12, 0.96, 0.27], wR: -55,
      fL: [0.24, 0, -0.1], fR: [-0.2, 0.02, 0.14, 12, -20], kL: [0.2, 0, 1], whip: [0, 0, 0], palm: 0 },
    crouch: { root: [0, 0.55, 0], lean: 20, twist: -22, hipTwist: -12, head: [-12, 18],
      hL: [0.36, 0.86, -0.1], hR: [0.18, 0.66, 0.27], wR: -40,
      fL: [0.28, 0, -0.14], fR: [-0.24, 0, 0.17, 10, -20] },
    jumpUp: { root: [0, 1.0, 0], lean: 2, head: [-8, 0], hL: [0.25, 1.55, -0.2], hR: [0.05, 1.35, 0.27], wR: -30, fL: [0.12, 0.38, -0.1, 30], fR: [-0.12, 0.2, 0.1, 20] },
    fall: { root: [0, 0.98, 0], lean: 8, hL: [0.3, 1.4, -0.22], hR: [0.12, 1.15, 0.28], wR: -40, fL: [0.18, 0.24, -0.12], fR: [-0.1, 0.32, 0.12, 20] },
    jumpTuck: { root: [0, 0.95, 0], lean: 24, hL: [0.3, 1.2, -0.18], hR: [0.22, 1.12, 0.24], wR: -20, fL: [0.24, 0.55, -0.1, 20], fR: [0.08, 0.5, 0.1, 20] },
    walk: { stride: 0.28, lift: 0.11, bob: 0.035 },
    dash: { root: [0.08, 0.76, 0], lean: 34, head: [-14, 10], hL: [0.25, 1.0, -0.3], hR: [-0.3, 0.95, 0.3], wR: -150, fL: [0.34, 0.05, -0.12], fR: [-0.38, 0.18, 0.12, -30] },
    bdash: { root: [-0.06, 0.88, 0], lean: -14, head: [10, 0], hL: [0.35, 1.3, -0.25], hR: [0.1, 1.1, 0.3], wR: -40, fL: [0.26, 0.14, -0.12], fR: [-0.24, 0, 0.12] },
    intro: { root: [0, 0.5, 0], lean: 30, head: [30, 0], twist: -10, hL: [0.42, 0.06, -0.12], hR: [0.12, 0.7, 0.28], wR: -80, fL: [0.3, 0, -0.14], fR: [-0.3, 0, 0.16], kR: [0, -1, 0.3], palm: 1 },
    win: { root: [0, 0.9, 0], lean: -4, head: [-18, -10], twist: -30, hL: [0.2, 1.05, -0.3], hR: [0.25, 1.9, 0.2], wR: 90, fL: [0.18, 0, -0.12], fR: [-0.16, 0, 0.14], whip: [1.6, 100, -260] },
    cast: { root: [0, 0.86, 0], lean: 8, head: [-4, 10], hL: [0.48, 1.28, -0.06], hR: [0.12, 0.96, 0.27], wR: -55, fL: [0.24, 0, -0.1], fR: [-0.2, 0, 0.14], palm: 0.8 },
  },

  moves: {
    // Snap Kick — quick front-leg kick at belt height
    stL: [[0, 'stance'], ['s-2', { root: [0, 0.88, 0], lean: 0, fL: [0.2, 0.32, -0.1, 30] }, 'io'],
      ['s', { root: [-0.02, 0.88, 0], lean: -8, twist: -10, hL: [0.15, 1.2, -0.2], fL: [0.72, 0.8, -0.08, -40], kL: [0, 1, 0.3] }, 'snap'],
      ['a+2', { root: [-0.02, 0.88, 0], lean: -8, twist: -10, hL: [0.15, 1.2, -0.2], fL: [0.68, 0.78, -0.08, -40], kL: [0, 1, 0.3] }], ['e', 'stance', 'io']],
    // Vine Lash — horizontal whip strike
    stM: [[0, 'stance'], ['s-4', { twist: -40, hR: [-0.18, 1.25, 0.3], wR: 150, whip: [0.9, 160, 40] }, 'io'],
      ['s', { root: [0.06, 0.86, 0], lean: 14, twist: 12, hR: [0.42, 1.22, 0.2], wR: 0, whip: [1.5, -2, 4] }, 'snap'],
      ['a+1', { root: [0.06, 0.86, 0], lean: 14, twist: 16, hR: [0.4, 1.16, 0.18], wR: -6, whip: [1.5, -4, -6] }],
      ['a+6', { twist: 4, hR: [0.3, 1.0, 0.22], wR: -30, whip: [1.0, -40, -40] }], ['e', 'stance', 'io']],
    // Thorn Crack — overhead crack, arcing from above to forward
    stH: [[0, 'stance'], ['s-5', { root: [-0.04, 0.9, 0], lean: -10, twist: -30, head: [-14, 10], hR: [-0.15, 1.75, 0.22], wR: 150, whip: [1.0, 170, 30] }, 'io'],
      ['s', { root: [0.02, 0.9, 0], lean: -2, twist: 0, head: [-24, 6], hR: [0.18, 1.82, 0.18], wR: 80, whip: [1.45, 62, -20] }, 'snap'],
      ['s+2', { root: [0.1, 0.86, 0], lean: 14, twist: 14, head: [-8, 0], hR: [0.44, 1.5, 0.16], wR: 30, whip: [1.75, 18, -24] }, 'snap'],
      ['a+2', { root: [0.12, 0.84, 0], lean: 18, twist: 18, hR: [0.42, 1.3, 0.16], wR: 0, whip: [1.6, -6, -30] }],
      ['a+8', { hR: [0.3, 1.05, 0.22], wR: -30, whip: [0.9, -50, -40] }], ['e', 'stance', 'io']],
    // Low Heel
    crL: [[0, 'crouch'], ['s-1', { fL: [0.4, 0.1, -0.1] }], ['s', { lean: 10, fL: [0.74, 0.08, -0.08, -10] }, 'snap'], ['a+2', { lean: 10, fL: [0.7, 0.08, -0.08] }], ['e', 'crouch']],
    // Root Lash — low whip along the floor
    crM: [[0, 'crouch'], ['s-4', { twist: -40, hR: [-0.15, 0.7, 0.3], wR: 170, whip: [0.8, 175, 20] }, 'io'],
      ['s', { root: [0.08, 0.5, 0], lean: 26, twist: 14, hR: [0.4, 0.42, 0.2], wR: -10, whip: [1.4, -14, 18] }, 'snap'],
      ['a+2', { root: [0.08, 0.5, 0], lean: 26, twist: 18, hR: [0.38, 0.4, 0.2], wR: -12, whip: [1.4, -14, 14] }],
      ['a+6', { hR: [0.3, 0.5, 0.22], wR: -30, whip: [0.9, -30, 10] }], ['e', 'crouch', 'io']],
    // Briar Trip — sweeping low whip
    crH: [[0, 'crouch'], ['s-4', { twist: -60, lean: 20, hR: [-0.3, 0.55, 0.35], wR: -170, whip: [1.0, -175, 10] }, 'io'],
      ['s', { root: [0.1, 0.45, 0], lean: 30, twist: 30, hR: [0.4, 0.3, 0.2], wR: -12, whip: [1.6, -8, 6], fL: [0.42, 0, -0.16] }, 'snap'],
      ['a+2', { root: [0.1, 0.45, 0], lean: 30, twist: 46, hR: [0.32, 0.3, -0.05], wR: 10, wRy: 30, whip: [1.6, -6, 4], fL: [0.42, 0, -0.16] }],
      ['a+8', { twist: 30, hR: [0.25, 0.4, 0.1], wR: -20, whip: [1.0, -10, 10] }], ['e', 'crouch', 'io']],
    // Air Knee
    jL: [[0, 'fall'], ['s', { lean: 14, fL: [0.42, 0.62, -0.1, 30], fR: [-0.1, 0.25, 0.1], kL: [0, 0.4, 1] }, 'snap'], ['a', { lean: 14, fL: [0.4, 0.6, -0.1, 30], fR: [-0.1, 0.25, 0.1] }], ['e', 'fall']],
    // Air Lash
    jM: [[0, 'fall'], ['s-3', { hR: [-0.1, 1.45, 0.25], wR: 140, whip: [0.8, 150, 20] }],
      ['s', { lean: 18, twist: 10, hR: [0.4, 0.95, 0.2], wR: -10, whip: [1.2, -22, -4] }, 'snap'], ['a', { lean: 18, twist: 12, hR: [0.38, 0.9, 0.2], wR: -20, whip: [1.2, -26, -8] }], ['e', 'fall']],
    // Falling Thorns — long diagonal downward lash
    jH: [[0, 'fall'], ['s-4', { lean: -8, hR: [-0.05, 1.7, 0.22], wR: 120, whip: [1.0, 130, 30], fL: [0.2, 0.42, -0.1], fR: [0.0, 0.38, 0.1] }],
      ['s', { lean: 18, hR: [0.4, 1.05, 0.2], wR: -30, whip: [1.6, -36, -6], fL: [0.12, 0.3, -0.1], fR: [-0.05, 0.36, 0.1] }, 'snap'],
      ['s+2', { lean: 22, hR: [0.42, 0.9, 0.2], wR: -45, whip: [1.9, -46, -4], fL: [0.12, 0.3, -0.1], fR: [-0.05, 0.36, 0.1] }, 'snap'],
      ['a', { lean: 22, hR: [0.4, 0.85, 0.2], wR: -55, whip: [1.8, -52, -10] }], ['e', 'fall']],
    // Thorn Kick — hopping overhead axe kick
    fM: [[0, 'stance'], ['s-8', { root: [0.02, 0.95, 0], lean: -10, head: [-10, 10], hL: [0.1, 1.45, -0.25], fL: [0.35, 0.95, -0.08, 30], fR: [-0.15, 0.12, 0.12, 30], kL: [0, 1, 0.3] }, 'io'],
      ['s-3', { root: [0.06, 1.08, 0], lean: -14, hL: [0.05, 1.5, -0.25], fL: [0.5, 1.45, -0.08, 40], fR: [-0.12, 0.3, 0.12, 30], kL: [0, 1, 0.3] }, 'io'],
      ['s', { root: [0.14, 0.98, 0], lean: 18, head: [10, 0], hL: [0.0, 1.3, -0.3], fL: [0.75, 1.0, -0.08, -40], fR: [-0.2, 0.25, 0.12, 30], kL: [0, 1, 0.3] }, 'snap'],
      ['a+2', { root: [0.14, 0.86, 0], lean: 22, fL: [0.72, 0.5, -0.08, -40], fR: [-0.25, 0.04, 0.12, 10] }], ['e', 'stance', 'io']],
    throw: [[0, 'stance'], ['s', { root: [0.1, 0.86, 0], lean: 18, twist: 0, hL: [0.6, 1.2, -0.1], hR: [0.5, 1.15, 0.12], wR: 0, whip: [0.6, 10, 60] }, 'snap'], ['e', 'throwWhiff']],
    // Briar Lash — the full-length crack
    Q: [[0, 'stance'], ['s-6', { root: [-0.06, 0.88, 0], lean: -6, twist: -50, head: [-6, 30], hR: [-0.3, 1.45, 0.3], wR: 160, whip: [1.2, 175, 40], hL: [0.3, 1.2, -0.2] }, 'io'],
      ['s', { root: [0.1, 0.86, 0], lean: 16, twist: 20, head: [-2, 0], hR: [0.5, 1.12, 0.16], wR: 0, whip: [3.05, -2, 2], hL: [-0.05, 1.0, -0.3], fL: [0.38, 0, -0.1] }, 'snap'],
      ['a', { root: [0.1, 0.86, 0], lean: 16, twist: 22, hR: [0.48, 1.1, 0.16], wR: -2, whip: [3.05, -3, -2], hL: [-0.05, 1.0, -0.3], fL: [0.38, 0, -0.1] }],
      ['a+6', { twist: 10, hR: [0.35, 1.0, 0.2], wR: -20, whip: [1.8, -24, -60] }], ['e', 'stance', 'io']],
    // Snare Seed — underhand toss with the left hand
    W: [[0, 'stance'], ['s-6', { root: [-0.04, 0.82, 0], lean: 14, twist: 10, hL: [-0.1, 0.8, -0.25], eL: [0, -1, -0.5], palm: 0.8 }, 'io'],
      ['s', { root: [0.06, 0.88, 0], lean: -2, twist: -30, head: [-14, 20], hL: [0.42, 1.3, -0.05], palm: 1.2, fL: [0.32, 0, -0.1] }, 'snap'],
      ['s+6', { root: [0.05, 0.88, 0], lean: 0, twist: -26, hL: [0.4, 1.38, -0.05], palm: 0.2 }], ['e', 'stance', 'io']],
    // Canopy Vault — vine to the canopy, swing in a high arc
    E: [[0, 'stance'], [2, { root: [0, 0.8, 0], lean: 10, twist: -10, head: [-30, 0], hR: [0.3, 1.6, 0.2], wR: 70, vine: 1 }, 'snap'],
      [5, { root: [0, 0.74, 0], lean: 14, head: [-30, 0], hR: [0.25, 1.75, 0.15], hL: [0.2, 1.7, -0.1], wR: 70, vine: 1, fL: [0.15, 0, -0.1], fR: [-0.15, 0, 0.12] }],
      [8, { root: [0, 0.92, 0], lean: -10, head: [-20, 0], hR: [0.12, 1.85, 0.12], hL: [0.08, 1.8, -0.1], wR: 80, vine: 1, fL: [0.25, 0.3, -0.1, 30], fR: [0.0, 0.2, 0.1, 30] }, 'io'],
      [16, { root: [0, 0.95, 0], lean: 10, head: [-10, 0], hR: [0.08, 1.9, 0.1], hL: [0.02, 1.85, -0.1], wR: 80, vine: 1, fL: [0.35, 0.45, -0.1, 40], fR: [0.15, 0.4, 0.1, 40] }, 'io'],
      [23, { root: [0, 0.95, 0], lean: 18, head: [0, 0], hR: [-0.05, 1.85, 0.1], hL: [-0.1, 1.8, -0.1], wR: 80, vine: 1, fL: [0.3, 0.4, -0.1, 20], fR: [0.05, 0.35, 0.1, 20] }, 'io'],
      ['e', 'fall']],
    // Heartwood Colossus — palms slammed into the earth, then raised to summon
    R: [[0, 'stance'], [6, { root: [0, 0.98, 0], lean: -14, head: [-24, 0], hL: [0.2, 1.85, -0.2], hR: [0.2, 1.85, 0.2], wR: 60, palm: 1, fL: [0.2, 0.15, -0.1], fR: [-0.15, 0.05, 0.12] }, 'io'],
      [10, { root: [0.1, 0.42, 0], lean: 48, head: [-30, 0], hL: [0.55, 0.04, -0.15], hR: [0.5, 0.04, 0.2], wR: -80, palm: 1.6, fL: [0.35, 0, -0.16], fR: [-0.35, 0, 0.18, 20] }, 'snap'],
      [24, { root: [0.1, 0.44, 0], lean: 46, head: [-34, 0], hL: [0.55, 0.05, -0.15], hR: [0.5, 0.05, 0.2], wR: -80, palm: 1.2, fL: [0.35, 0, -0.16], fR: [-0.35, 0, 0.18, 20] }],
      [30, { root: [0.02, 0.9, 0], lean: -8, head: [-24, 0], hL: [0.35, 1.7, -0.25], hR: [0.3, 1.75, 0.25], wR: 80, palm: 1.4, fL: [0.25, 0, -0.14], fR: [-0.25, 0, 0.16] }, 'snap'],
      [50, { root: [0.0, 0.88, 0], lean: 0, head: [-14, 0], hL: [0.3, 1.4, -0.25], hR: [0.25, 1.4, 0.25], wR: 40, palm: 0.4, fL: [0.25, 0, -0.14], fR: [-0.25, 0, 0.16] }, 'io'],
      ['e', 'stance', 'io']],
    // channelling the colossus: arms raised, then a hammer-down gesture for the slam
    Rhold: [[0, { root: [0.02, 0.9, 0], lean: -8, head: [-24, 0], hL: [0.35, 1.7, -0.25], hR: [0.3, 1.75, 0.25], wR: 80, palm: 1.4, fL: [0.25, 0, -0.14], fR: [-0.25, 0, 0.16] }],
      [20, { root: [0.0, 0.92, 0], lean: -10, head: [-28, 0], hL: [0.3, 1.8, -0.25], hR: [0.28, 1.85, 0.25], wR: 85, palm: 1.0, fL: [0.25, 0, -0.14], fR: [-0.25, 0, 0.16] }, 'io'],
      [44, { root: [-0.02, 0.96, 0], lean: -14, head: [-30, 0], hL: [0.15, 1.95, -0.15], hR: [0.12, 1.98, 0.15], wR: 100, palm: 1.6, fL: [0.25, 0.05, -0.14], fR: [-0.25, 0, 0.16] }, 'io'],
      [50, { root: [0.12, 0.66, 0], lean: 34, head: [-4, 0], hL: [0.55, 0.75, -0.15], hR: [0.5, 0.72, 0.15], wR: -50, palm: 1.8, fL: [0.4, 0, -0.14], fR: [-0.3, 0, 0.16] }, 'snap'],
      ['e', 'stance', 'io']],
  },

  locks: {
    throw: {
      // Vine snares the foe, Wren hauls them overhead and slams them away
      atk: [[0, { root: [0.1, 0.86, 0], lean: 18, hL: [0.6, 1.2, -0.1], hR: [0.5, 1.15, 0.12], wR: 0, whip: [0.7, 10, 120] }],
        [12, { root: [0.0, 0.88, 0], lean: -14, twist: -30, head: [-20, 10], hL: [0.2, 1.6, -0.15], hR: [0.1, 1.75, 0.2], wR: 110, whip: [0.9, 70, 80] }, 'io'],
        [26, { root: [0.12, 0.8, 0], lean: 30, twist: 30, hL: [0.5, 0.9, -0.15], hR: [0.55, 0.85, 0.15], wR: -20, whip: [1.2, -30, 40] }, 'snap'],
        [34, 'stance', 'io']],
      vic: [[0, 'held'], [14, 'held'], [26, 'airHit']],
    },
  },

  // --------------------------------------------------------------------------
  ents: {
    seed: {
      build(ctx) {
        const g = new THREE.Group();
        const seed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), toonM(C.barkL));
        seed.scale.set(1, 1.3, 1);
        const glowS = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
        const lf = new THREE.Mesh(leafGeo(0.09, 0.03), new THREE.MeshToonMaterial({ color: new THREE.Color(C.leafL), side: THREE.DoubleSide, gradientMap: toonRamp() }));
        lf.position.y = 0.08;
        g.add(seed, glowS, lf);
        g.userData = { t: 0, seed, lf };
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        obj.rotation.z = u.t * 12;
        if (Math.random() < 0.6) ctx.vfx.particle({ x: obj.position.x, y: obj.position.y, z: 0.1, color: Math.random() < 0.5 ? C.glow : C.yellow, shape: 'soft', size: 0.05, size1: 0, life: 0.35, speed: 0.3, gravity: -0.5 });
      },
    },
    sprout: {
      build(ctx) {
        const g = new THREE.Group();
        const mound = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), toonM(0x3b2a1c));
        mound.scale.set(1, 0.25, 0.6);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 6), toonM(C.vine));
        stem.position.y = 0.06;
        const l1 = new THREE.Mesh(leafGeo(0.09, 0.03), new THREE.MeshToonMaterial({ color: new THREE.Color(C.leafL), side: THREE.DoubleSide, gradientMap: toonRamp() }));
        l1.position.set(0.03, 0.1, 0); l1.rotation.z = -0.9;
        const l2 = l1.clone(); l2.position.x = -0.03; l2.rotation.z = 0.9;
        const bud = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.pink).multiplyScalar(1.6) }));
        bud.position.y = 0.13;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.2), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
        const sprout = new THREE.Group(); sprout.add(stem, l1, l2, bud);
        g.add(mound, sprout, ring);
        g.userData = { t: 0, sprout, bud, ring };
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        const armed = e.age >= 20;
        const grow = Math.min(1, e.age / 10);
        u.sprout.scale.setScalar(0.2 + 0.8 * grow);
        u.sprout.rotation.z = Math.sin(u.t * 2.2) * 0.12;
        // armed traps stay subtle: a faint breathing ring
        u.ring.material.opacity = armed ? 0.12 + 0.1 * Math.sin(u.t * 3) : 0.35 * (1 - e.age / 20);
        u.bud.scale.setScalar(armed ? 1 + 0.25 * Math.sin(u.t * 4) : 0.6);
      },
    },
    snare: {
      build(ctx) {
        const g = new THREE.Group();
        const parts = [];
        for (let i = 0; i < 5; i++) {
          const v = vineCurl(1.0 + (i % 2) * 0.4, 0.24 + (i % 3) * 0.04, 1.1 + i * 0.15, 0.026, i % 2 ? C.vine : C.vineD);
          v.rotation.y = (i / 5) * Math.PI * 2; v.scale.y = 0.01;
          g.add(v); parts.push(v);
        }
        g.userData = { parts };
        return g;
      },
      update(obj, e) {
        const k = Math.min(1, (e.age + 1) / 5);
        for (const p of obj.userData.parts) p.scale.y = k;
      },
      end(obj, e, ctx) {
        // the vines linger around the rooted foe
        const g = cloneBare(obj);
        g.position.copy(obj.position);
        ctx.vfx.custom(g, 1.25, (o, u) => {
          const k = u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
          o.traverse((m) => { if (m.isMesh && m.material) { m.material.transparent = true; m.material.opacity = k; } });
          o.scale.y = 0.6 + 0.4 * k;
          o.rotation.y = u * 0.6;
        });
      },
    },
    mark: {
      build(ctx) {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.9, 40), new THREE.ShaderMaterial({
          uniforms: { t: { value: 0 }, a: { value: 0 }, c: { value: new THREE.Color(C.glow).multiplyScalar(1.4) }, c2: { value: new THREE.Color(C.pink).multiplyScalar(1.4) } },
          vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform float t; uniform float a; uniform vec3 c; uniform vec3 c2; varying vec2 vP; void main(){ float r = length(vP); float ang = atan(vP.y, vP.x); float k = (0.5 + 0.5 * sin(ang * 7.0 - t * 6.0 + r * 9.0)) * smoothstep(0.55, 0.7, r) * smoothstep(0.92, 0.78, r) * a; gl_FragColor = vec4(mix(c, c2, 0.5 + 0.5 * sin(t * 10.0)) * k, k); }',
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 3, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(0.6), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        col.position.y = 1.5;
        g.add(ring, col);
        g.userData = { t: 0, ring, col };
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        const k = Math.min(1, (e.age + 1) / 4);
        u.ring.material.uniforms.t.value = u.t; u.ring.material.uniforms.a.value = k;
        u.col.material.opacity = 0.05 * k * (0.7 + 0.3 * Math.sin(u.t * 30));
        if (Math.random() < 0.8) {
          const a = Math.random() * Math.PI * 2;
          ctx.vfx.particle({ x: obj.position.x + Math.cos(a) * 0.7, y: 0.05, z: Math.sin(a) * 0.5, color: Math.random() < 0.5 ? C.glow : C.yellow, shape: 'soft', size: 0.07, size1: 0, life: 0.4, speed: [1, 2.5], dir: Math.PI / 2, spread: 0.2 });
        }
        if (Math.random() < 0.35) ctx.vfx.burst({ x: obj.position.x + (Math.random() - 0.5) * 1.2, y: 0.03, z: 0.1, count: 2, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.03, 0.06], speed: [1, 3], dir: Math.PI / 2, spread: 0.5, gravity: 9, life: 0.4, intensity: 1 });
      },
    },
    fist: {
      build(ctx) {
        const g = new THREE.Group();
        const f = woodFist();
        g.add(f);
        g.userData = { f, t: 0 };
        g.scale.setScalar(1.0);
        return g;
      },
      update(obj, e, ctx) {
        const u = obj.userData; u.t += ctx.dt;
        const life = e.life || 70;
        const rise = Math.min(1, (e.age + 1) / 5);
        const sink = e.age > life - 14 ? (e.age - (life - 14)) / 14 : 0;
        u.f.position.y = -3.0 * (1 - rise) * (1 - rise) - 3.2 * sink * sink;
        u.f.rotation.y = Math.sin(u.t * 1.5) * 0.08;
        u.f.rotation.z = (1 - rise) * 0.25;
        obj.position.z = -0.25;
      },
      end(obj, e, ctx) {
        ctx.vfx.burst({ x: obj.position.x, y: 0.1, z: 0.1, count: 30, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.04, 0.09], speed: [2, 5], dir: Math.PI / 2, spread: 0.9, gravity: 10, life: [0.4, 0.8], intensity: 1 });
      },
    },
    thorn: {
      build(ctx, e) {
        const g = new THREE.Group();
        const sp = [];
        for (let i = 0; i < 4; i++) {
          const s = thornSpear(1.6 + (i % 2) * 0.5);
          const a = -0.9 + i * 0.6;
          s.rotation.z = a; s.position.set(Math.sin(-a) * -1.0, -1.2, (i - 1.5) * 0.12);
          g.add(s); sp.push(s);
        }
        g.userData = { sp, t: 0 };
        return g;
      },
      update(obj, e) { const k = Math.min(1, (e.age + 1) / 3); for (const s of obj.userData.sp) s.scale.setScalar(0.3 + 0.7 * k); },
      end(obj, e, ctx) {
        const g = cloneBare(obj); g.position.copy(obj.position);
        ctx.vfx.custom(g, 0.35, (o, u) => { o.scale.setScalar(1 - u * u); });
      },
    },
    // final slam: a second wooden fist hammers in diagonally from Wren's side
    slam: {
      build(ctx) {
        const g = new THREE.Group();
        const pivot = new THREE.Group(); g.add(pivot);
        const f = woodFist();
        f.scale.setScalar(0.62);
        f.position.y = -2.3 * 0.62; // fist (top of the model) at the pivot
        pivot.add(f);
        pivot.rotation.z = Math.PI * 0.78; // knuckles pointing down-forward
        g.userData = { pivot };
        return g;
      },
      update(obj, e) {
        const k = Math.min(1, (e.age + 1) / 4);
        const p = obj.userData.pivot;
        p.position.set(-1.9 + 1.9 * k, 1.9 - 2.1 * k, -0.2);
      },
      end(obj, e, ctx) {
        const g = cloneBare(obj); g.position.copy(obj.position);
        ctx.vfx.custom(g, 0.35, (o, u) => {
          const p = o.children[0];
          p.position.set(0.25 * u, -0.2 - 1.6 * u, -0.2);
          p.scale.setScalar(1 - u * u);
        });
      },
    },
  },

  onEvent(e, ctx) {
    const V = ctx.vfx, S2M = ctx.S2M, G = ctx.G, F = G.fighters[e.p];
    const play = (n) => ctx.audio && ctx.audio.play(n);
    const fx = F.x * S2M, fy = F.y * S2M;
    const leaves = (x, y, n, sp = [1, 4], z = 0.2) => {
      V.burst({ x, y, z, count: n, color: C.leafL, color2: C.leafD, additive: false, shape: 'shard', size: [0.04, 0.08], speed: sp, gravity: 2.5, drag: 0.92, life: [0.5, 1.0], intensity: 1.1 });
      V.burst({ x, y, z, count: Math.ceil(n / 3), color: C.pink, color2: C.yellow, shape: 'soft', size: [0.04, 0.07], speed: sp, gravity: 1, life: [0.4, 0.8] });
    };
    switch (e.t) {
      case 'cast': {
        if (e.id === 'Q') play('whip_crack');
        else if (e.id === 'W') play('nature_cast');
        else if (e.id === 'E') {
          play('whip_crack');
          leaves(fx, fy + 1.4, 14);
        } else if (e.id === 'R') {
          play('nature_cast');
          leaves(fx, fy + 1.0, 40, [2, 6]);
          V.ring({ x: fx, y: 0.04, color: C.glow, r0: 0.3, r1: 3.0, life: 0.6, axis: 'y', thick: 0.2 });
        }
        break;
      }
      case 'swing': {
        if (['stM', 'stH', 'crM', 'crH', 'jM', 'jH'].includes(e.id)) play('whip_crack');
        break;
      }
      case 'hit': case 'block': {
        const x = e.x * S2M, y = e.y * S2M;
        if (!e.k && F.mv === 'Q' && e.t === 'hit') {
          play('nature_impact');
          leaves(x, y, 16, [2, 6], 0.4);
          if (G.fighters[e.v].buffs.some((b) => b.k === 'slow')) { play('slow'); V.ring({ x, y, z: 0.4, color: C.pink, r0: 0.1, r1: 1.2, life: 0.35, thick: 0.08 }); }
        } else if (e.k === 'wren.snare') {
          play('root');
          V.burst({ x, y: 0.2, z: 0.2, count: 26, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.03, 0.07], speed: [2, 5], dir: Math.PI / 2, spread: 0.7, gravity: 10, life: [0.4, 0.7], intensity: 1 });
          leaves(x, 0.6, 18, [1.5, 4]);
          V.ring({ x, y: 0.03, color: C.glow, r0: 0.1, r1: 1.2, life: 0.4, axis: 'y' });
        } else if (e.k === 'wren.fist') {
          play('ult_impact');
          V.shake(0.3, 0.5);
          V.flash({ x, y, color: C.glow, size: 3.2, life: 0.25, intensity: 1.6 });
          V.burst({ x, y: 0.3, z: 0.3, count: 60, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.05, 0.12], speed: [3, 9], dir: Math.PI / 2, spread: 1.0, gravity: 12, life: [0.5, 1.0], intensity: 1 });
          leaves(x, y, 40, [3, 8]);
          V.ring({ x, y: 0.04, color: C.glow, r0: 0.3, r1: 3.5, life: 0.5, axis: 'y', thick: 0.25 });
        } else if (e.k === 'wren.thorn') {
          play('nature_impact');
          V.burst({ x, y, z: 0.4, count: 18, color: C.glow, color2: C.pink, speed: [2, 6], shape: 'spark', size: [0.03, 0.06], life: [0.2, 0.4], intensity: 1.3 });
        } else if (e.k === 'wren.slam') {
          play('explosion');
          V.shake(0.35, 0.5);
          V.ring({ x, y, z: 0.4, color: C.pink, r0: 0.2, r1: 2.6, life: 0.45, thick: 0.18 });
          leaves(x, y, 36, [3, 9]);
        }
        break;
      }
      case 'spawn': {
        const x = e.x * S2M, y = e.y * S2M;
        if (e.k === 'wren.seed') { V.burst({ x, y, z: 0.2, count: 8, color: C.glow, color2: C.yellow, shape: 'soft', size: [0.04, 0.08], speed: [0.5, 2], life: [0.2, 0.4] }); }
        else if (e.k === 'wren.sprout') {
          play('nature_cast');
          V.burst({ x, y: 0.05, z: 0.1, count: 10, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.02, 0.05], speed: [1, 2.5], dir: Math.PI / 2, spread: 0.6, gravity: 8, life: 0.4, intensity: 1 });
          V.ring({ x, y: 0.03, color: C.glow, r0: 0.05, r1: 0.5, life: 0.35, axis: 'y', thick: 0.08 });
        } else if (e.k === 'wren.mark') {
          play('root');
          V.ring({ x, y: 0.04, color: C.pink, r0: 1.4, r1: 0.4, life: 0.3, axis: 'y', thick: 0.12 });
        } else if (e.k === 'wren.fist') {
          play('shockwave');
          V.shake(0.22, 0.4);
          V.burst({ x, y: 0.1, z: 0.2, count: 50, color: 0x6b4a2a, additive: false, shape: 'shard', size: [0.05, 0.12], speed: [3, 8], dir: Math.PI / 2, spread: 1.1, gravity: 12, life: [0.5, 0.9], intensity: 1 });
          V.burst({ x, y: 0.1, z: 0.2, count: 26, color: 0x8a7a66, additive: false, shape: 'smoke', size: [0.3, 0.5], size1: 0.9, speed: [1, 3], dir: Math.PI / 2, spread: 1.3, life: [0.6, 1.0], alpha: 0.6, intensity: 1 });
          V.light({ x, y: 1.5, color: C.glow, intensity: 14, life: 0.5, distance: 7 });
        } else if (e.k === 'wren.thorn') {
          V.burst({ x, y: y - 0.6, z: 0.3, count: 10, color: C.leafL, color2: C.leafD, additive: false, shape: 'shard', size: [0.03, 0.06], speed: [2, 4], gravity: 4, life: 0.5, intensity: 1.1 });
        }
        break;
      }
      case 'ent_end': {
        if (e.k === 'wren.seed' && e.why === 'replace') V.burst({ x: e.x * S2M, y: e.y * S2M + 0.05, z: 0.1, count: 8, color: C.leafD, additive: false, shape: 'shard', size: 0.04, speed: [1, 2], life: 0.4, intensity: 1 });
        if (e.k === 'wren.sprout' && e.why === 'replace') V.burst({ x: e.x * S2M, y: 0.05, z: 0.1, count: 8, color: C.leafD, additive: false, shape: 'shard', size: 0.04, speed: [1, 2], life: 0.4, intensity: 1 });
        break;
      }
      case 'cine': {
        if (e.k === 'vault_release') leaves(e.x * S2M, e.y * S2M + 1.6, 12, [1, 3]);
        break;
      }
      case 'ult': {
        V.burst({ x: fx, y: fy + 1.0, z: 0.3, count: 50, color: C.glow, color2: C.pink, speed: [1, 5], shape: 'soft', size: [0.05, 0.1], life: [0.5, 1.0] });
        break;
      }
    }
  },
};
