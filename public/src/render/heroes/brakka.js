// Brakka — a towering furnace-hearted colossus in riveted dark-iron plate.
// Furnace grate in the chest, twin exhaust stacks on the back, battlement
// pauldrons, chain-wrapped gauntlets, horned helm with a narrow burning visor.
import * as THREE from 'three';
import { G3, toonRamp } from '../toon.js';
import { Ribbon } from '../cloth.js';

const C = {
  gun: 0x3d4250, iron: 0x5c6270, ironL: 0x767d8c, bronze: 0xb07a3a, bronzeD: 0x7a5226,
  dark: 0x16171c, chain: 0x8e94a0, cloth: 0x6e1e19,
  fire: 0xff8a2a, hot: 0xffd27a, visor: 0xffa846, ember: 0xff7a1a,
  rock: 0x6b5d50, rockD: 0x4a3f36, dust: 0x9c8b78, lava: 0xff6a12,
};
// Nominal rig dims (FighterView multiplies by scale).
const DIMS = { hipW: 0.13, spine: 0.32, shoulderH: 0.22, shoulderW: 0.27, neck: 0.36, upper: 0.32, fore: 0.31, thigh: 0.46, shin: 0.44, ankle: 0.08 };

// ---------------------------------------------------------------------------
// Geometry batching: parts are baked per (node, material) into one mesh plus one
// inverted-hull outline, which keeps this heavily-detailed model cheap to draw.
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

function radialNormals(g) {
  g.computeBoundingBox();
  const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
  const pos = g.attributes.position, nrm = new Float32Array(pos.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).sub(c).normalize(); nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y; nrm[i * 3 + 2] = v.z; }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}
function mergeGeos(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal;
    pos.set(p.array, vo * 3); nrm.set(n.array, vo * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
    else for (let i = 0; i < p.count; i++) idx[io++] = vo + i;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
class Batcher {
  constructor(ms) { this.ms = ms; this.map = new Map(); }
  // o: { p:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz]|n, order, smooth, outline }
  add(node, geo, mat, o = {}) {
    const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0];
    const sc = o.s == null ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
    _e.set(r[0], r[1], r[2], o.order || 'XYZ');
    _m4.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e), _s.set(sc[0], sc[1], sc[2]));
    if (o.m) _m4.multiply(o.m);
    const g = geo.index ? geo : geo;
    g.deleteAttribute('uv');
    const outline = o.outline !== false && mat.isMeshToonMaterial;
    const og = outline ? (o.smooth ? radialNormals(g.clone()) : g.clone()) : null;
    g.applyMatrix4(_m4);
    if (og) og.applyMatrix4(_m4);
    const key = node.uuid + '|' + mat.uuid;
    let b = this.map.get(key);
    if (!b) { b = { node, mat, geos: [], ogeos: [] }; this.map.set(key, b); }
    b.geos.push(g);
    if (og) b.ogeos.push(og);
  }
  build() {
    const out = [];
    for (const b of this.map.values()) {
      const mesh = new THREE.Mesh(mergeGeos(b.geos), b.mat);
      mesh.castShadow = b.mat.isMeshToonMaterial;
      if (b.ogeos.length) {
        const o = new THREE.Mesh(mergeGeos(b.ogeos), this.ms.outline);
        o.castShadow = false; o.raycast = () => {};
        mesh.add(o);
      }
      b.node.add(mesh);
      out.push(mesh);
      for (const g of b.geos) g.dispose();
      for (const g of b.ogeos) g.dispose();
    }
    return out;
  }
}

// Tapered tube along a curve (horns).
function hornGeo(pts, r0, r1, seg = 12, rad = 9) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg; curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}
// Stove-door arch outline (rect with rounded top), optional hole.
function archShape(w, h, r, hole) {
  const sh = new THREE.Shape();
  sh.moveTo(-w, -h); sh.lineTo(w, -h); sh.lineTo(w, h - r);
  sh.absarc(w - r, h - r, r, 0, Math.PI / 2, false);
  sh.lineTo(-w + r, h); sh.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI, false);
  sh.lineTo(-w, -h);
  if (hole) {
    const [hw, hh, hr] = hole;
    const p = new THREE.Path();
    p.moveTo(-hw, -hh); p.lineTo(-hw, hh - hr); p.absarc(-hw + hr, hh - hr, hr, Math.PI, Math.PI / 2, true);
    p.lineTo(hw - hr, hh); p.absarc(hw - hr, hh - hr, hr, Math.PI / 2, 0, true); p.lineTo(hw, -hh); p.lineTo(-hw, -hh);
    sh.holes.push(p);
  }
  return sh;
}
function extrudeShape(sh, depth, bevel = 0.006) {
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Self-contained exhaust/ember particles (world space), driven per frame from
// the furnace mesh's onBeforeRender. Works everywhere the model is drawn.
let TEX = null;
function texes() {
  if (TEX) return TEX;
  const mk = (stops) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  TEX = {
    smoke: mk([[0, 'rgba(255,255,255,0.95)'], [0.45, 'rgba(255,255,255,0.6)'], [0.8, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]),
    soft: mk([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]),
  };
  return TEX;
}
const _w = new THREE.Vector3(), _f = new THREE.Vector3(), _c1 = new THREE.Color(), _c2 = new THREE.Color();
function makeFx(st) {
  const T = texes();
  const pg = new THREE.Group();
  pg.matrixAutoUpdate = false;
  st.pg = pg; st.smoke = []; st.embers = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.SpriteMaterial({ map: T.smoke, color: 0x34353b, transparent: true, depthWrite: false, opacity: 0 });
    const sp = new THREE.Sprite(m); sp.visible = false; sp.matrixAutoUpdate = false; sp.frustumCulled = false; sp.renderOrder = 8; pg.add(sp);
    st.smoke.push({ sp, t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.1, s1: 0.4, hot: 0 });
  }
  for (let i = 0; i < 34; i++) {
    const m = new THREE.SpriteMaterial({ map: T.soft, color: new THREE.Color(C.ember).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const sp = new THREE.Sprite(m); sp.visible = false; sp.matrixAutoUpdate = false; sp.frustumCulled = false; sp.renderOrder = 21; pg.add(sp);
    st.embers.push({ sp, t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.04, ph: Math.random() * 6 });
  }
}
function spawnFrom(pool, init) {
  let best = pool[0];
  for (const p of pool) { if (p.t >= p.life) { best = p; break; } if (p.t / p.life > best.t / best.life) best = p; }
  best.t = 0; init(best);
}
function fxTick(st, dtIn) {
  const dt = Math.min(0.05, Math.max(1 / 240, dtIn));
  st.time += dt;
  st.flare = Math.max(0, st.flare - dt * 1.4);
  st.jet = Math.max(0, st.jet - dt);
  // furnace / visor glow
  const fl = 0.1 * Math.sin(st.time * 13.1) + 0.07 * Math.sin(st.time * 7.7 + 1.3) + 0.05 * Math.sin(st.time * 23.0);
  st.fire.color.copy(st.fire.userData.base).multiplyScalar(1 + fl + st.flare * 1.3);
  st.hot.color.copy(st.hot.userData.base).multiplyScalar(1 + fl * 1.4 + st.flare * 1.1);
  st.visor.color.copy(st.visor.userData.base).multiplyScalar(1 + st.flare * 0.6 + 0.08 * Math.sin(st.time * 3.1));
  st.stackGlow.color.copy(st.stackGlow.userData.base).multiplyScalar(0.8 + fl * 2 + st.flare * 1.6 + (st.jet > 0 ? 1.5 : 0));
  // emit
  const rate = 1 + st.flare * 3.2 + (st.jet > 0 ? 6 : 0);
  st.accS += dt * 4.2 * rate; st.accE += dt * 3.0 * rate;
  st.fwdNode.getWorldDirection(_f); // chest +Z in world
  for (const em of st.emit) {
    em.getWorldPosition(_w);
    const sx = _w.x, sy = _w.y, sz = _w.z;
    const nS = Math.floor(st.accS / 2), nE = Math.floor(st.accE / 2);
    for (let i = 0; i < nS; i++) spawnFrom(st.smoke, (p) => {
      p.x = sx + (Math.random() - 0.5) * 0.04; p.y = sy; p.z = sz + (Math.random() - 0.5) * 0.04;
      const jet = st.jet > 0;
      p.vx = -_f.x * (0.18 + Math.random() * 0.2) + (Math.random() - 0.5) * 0.15;
      p.vy = jet ? -1.2 - Math.random() : 0.45 + Math.random() * 0.35;
      p.vz = (Math.random() - 0.5) * 0.15;
      p.life = 1.1 + Math.random() * 0.7; p.s0 = 0.08 + Math.random() * 0.05; p.s1 = 0.36 + Math.random() * 0.22 + st.flare * 0.2;
      p.hot = jet ? 1 : st.flare > 0.5 ? 0.6 : 0;
    });
    for (let i = 0; i < nE; i++) spawnFrom(st.embers, (p) => {
      p.x = sx + (Math.random() - 0.5) * 0.06; p.y = sy + 0.02; p.z = sz + (Math.random() - 0.5) * 0.06;
      const jet = st.jet > 0;
      p.vx = -_f.x * 0.2 + (Math.random() - 0.5) * 0.5; p.vy = jet ? -2 - Math.random() * 2 : 0.8 + Math.random() * 0.9; p.vz = (Math.random() - 0.5) * 0.4;
      p.life = 0.5 + Math.random() * 0.6; p.s = 0.025 + Math.random() * 0.03;
    });
  }
  st.accS -= Math.floor(st.accS / 2) * 2; st.accE -= Math.floor(st.accE / 2) * 2;
  // integrate
  for (const p of st.smoke) {
    const sp = p.sp;
    if (p.t >= p.life) { sp.visible = false; continue; }
    p.t += dt; const u = Math.min(1, p.t / p.life);
    p.vy += (p.hot ? 1.8 : 0.25) * dt; p.vx *= 0.985; p.vz *= 0.985;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = p.s0 + (p.s1 - p.s0) * (1 - (1 - u) * (1 - u));
    sp.visible = true; sp.position.set(p.x, p.y, p.z); sp.scale.set(s, s, s); sp.updateMatrix(); sp.matrixWorld.copy(sp.matrix);
    sp.material.opacity = Math.min(1, u * 8) * (1 - u) * 0.62;
    _c1.set(0x2c2d33); _c2.set(0x6d6e76);
    sp.material.color.copy(_c1).lerp(_c2, u);
    if (p.hot) sp.material.color.lerp(_c1.set(C.fire), p.hot * Math.max(0, 1 - u * 3));
  }
  for (const p of st.embers) {
    const sp = p.sp;
    if (p.t >= p.life) { sp.visible = false; continue; }
    p.t += dt; const u = Math.min(1, p.t / p.life);
    p.vy -= 0.4 * dt; p.vx += Math.sin(st.time * 9 + p.ph) * 0.8 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = p.s * (1 - u * 0.6);
    sp.visible = true; sp.position.set(p.x, p.y, p.z); sp.scale.set(s, s, s); sp.updateMatrix(); sp.matrixWorld.copy(sp.matrix);
    sp.material.opacity = (1 - u) * (0.7 + 0.3 * Math.sin(st.time * 30 + p.ph));
  }
}
function fxFrame(st, mesh) {
  if (!st.pg) {
    makeFx(st);
    let top = mesh; while (top.parent && !top.parent.isScene) top = top.parent;
    st.top = top; top.add(st.pg);
    // pre-warm so the stacks already smoke on the first frame
    st.top.updateMatrixWorld(true);
    for (let i = 0; i < 40; i++) fxTick(st, 1 / 30);
  }
  // keep the particle group in world space
  st.pg.matrix.copy(st.top.matrixWorld).invert();
  st.pg.matrixWorld.identity();
  const now = performance.now() / 1000;
  const dt = st.last ? now - st.last : 1 / 60;
  if (dt <= 0.0005 && st.last) return;
  st.last = now;
  fxTick(st, dt);
}

// ---------------------------------------------------------------------------
// Pose helpers. Spin must be explicit in every key once any key spins.
const V = (o) => Object.assign({ spin: 0 }, o);
const KD = { root: [-0.4, 0.14, 0], lean: -90, head: [20, 0], hL: [-0.9, 0.06, -0.4], hR: [-0.8, 0.05, 0.45], fL: [0.45, 0, -0.14], fR: [0.42, 0, 0.16] };
const OVERHEAD = { root: [0, 1.0, 0], lean: -20, head: [-30, 0], hL: [-0.1, 1.55, -0.4], hR: [-0.15, 1.5, 0.4], fL: [0.25, 0.25, -0.14], fR: [0.12, 0.12, 0.14] };
const DANGLE = { root: [0, 0.98, 0], lean: -12, head: [-30, 0], hL: [0.2, 1.52, -0.1], hR: [0.22, 1.5, 0.1], fL: [0.08, 0.0, -0.12], fR: [-0.12, 0.1, 0.12] };
const UPSIDE = { root: [0, 1.0, 0], lean: -6, head: [-10, 0], hL: [-0.15, 1.55, -0.35], hR: [-0.12, 1.5, 0.35], fL: [0.1, 0.0, -0.12], fR: [-0.06, 0.04, 0.12] };

// Ground-shake / dust helpers for events
function dust(vfx, x, n = 18, spread = 1.4, size = 0.3) {
  vfx.burst({ x, y: 0.05, z: 0.1, count: n, color: C.dust, additive: false, shape: 'smoke', size: [size * 0.6, size], size1: size * 2, speed: [0.8, 3], dir: Math.PI / 2, spread, life: [0.4, 0.9], drag: 0.9, gravity: -0.4, alpha: 0.55, intensity: 1, jx: 0.2 });
}
function rocks(vfx, x, y = 0.1, n = 12, sp = 6) {
  vfx.burst({ x, y, z: 0.15, count: n, color: C.rock, color2: C.rockD, additive: false, shape: 'shard', size: [0.05, 0.1], size1: 0.05, speed: [2, sp], dir: Math.PI / 2, spread: 1.1, life: [0.5, 0.9], gravity: 16, drag: 0.98, intensity: 1, alpha: 1, floor: true });
}
function embers(vfx, x, y, n = 20, sp = 4, z = 0.3) {
  vfx.burst({ x, y, z, count: n, color: C.ember, color2: 0xff3a10, shape: 'spark', size: [0.02, 0.04], speed: [1, sp], life: [0.3, 0.7], gravity: -1.5, drag: 0.94, stretch: 0.8, intensity: 2.4 });
}
function crackDecal(ctx, x, len = 0.5, life = 1.3, glow = true) {
  const g = new THREE.Group();
  const dk = new THREE.MeshBasicMaterial({ color: 0x15100c, transparent: true, opacity: 0.85, depthWrite: false });
  const lv = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.lava).multiplyScalar(2.6), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  let px = -len / 2, pz = (Math.random() - 0.5) * 0.2;
  for (let i = 0; i < 4; i++) {
    const nx = px + len / 4, nz = (Math.random() - 0.5) * 0.36;
    const l = Math.hypot(nx - px, nz - pz), a = Math.atan2(nz - pz, nx - px);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(l + 0.02, 0.05), dk);
    seg.rotation.set(-Math.PI / 2, 0, -a); seg.position.set((px + nx) / 2, 0.012, (pz + nz) / 2); g.add(seg);
    if (glow) { const s2 = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.018), lv); s2.rotation.copy(seg.rotation); s2.position.set(seg.position.x, 0.016, seg.position.z); g.add(s2); }
    px = nx; pz = nz;
  }
  g.position.set(x, 0, 0.1);
  ctx.vfx.custom(g, life, (o, u) => { dk.opacity = 0.85 * (1 - u * u); lv.opacity = Math.max(0, 1 - u * 2.2); });
}
function crater(ctx, x) {
  const g = new THREE.Group();
  const dk = new THREE.MeshBasicMaterial({ color: 0x120d0a, transparent: true, opacity: 0.9, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 28), dk); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.011; disc.scale.set(1, 0.55, 1); g.add(disc);
  const lv = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.lava).multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + Math.random() * 0.3, l = 0.7 + Math.random() * 0.9;
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(l, 0.035), lv);
    sp.rotation.set(-Math.PI / 2, 0, -a); sp.position.set(Math.cos(a) * l * 0.55, 0.015, Math.sin(a) * l * 0.3); g.add(sp);
  }
  const rm = new THREE.MeshToonMaterial({ color: C.rock, gradientMap: toonRamp(), transparent: true });
  const rocksArr = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, r = 0.95 + Math.random() * 0.25, s = 0.1 + Math.random() * 0.14;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rm);
    m.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r * 0.5); m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(m); rocksArr.push(m);
  }
  g.position.set(x, 0, 0);
  ctx.vfx.custom(g, 3.2, (o, u) => {
    dk.opacity = 0.9 * (1 - Math.pow(u, 3)); lv.opacity = Math.max(0, 1 - u * 1.6);
    rm.opacity = 1 - Math.max(0, (u - 0.7) / 0.3);
    for (const m of rocksArr) m.position.y = m.scale.y * 0.03 - Math.max(0, u - 0.6) * 0.3;
  });
}
const sfx = (ctx, n) => { if (ctx.audio) ctx.audio.play(n); };
const bk = (ctx) => ctx.view && ctx.view.rig.root.userData.bk;
function flare(ctx, v) { const st = bk(ctx); if (st) st.flare = Math.max(st.flare, v); }
function furnacePos(ctx, out) { const st = bk(ctx); if (st) st.furnace.getWorldPosition(out); return out; }

// ---------------------------------------------------------------------------
export default {
  id: 'brakka',
  scale: 1.15,
  dims: DIMS,
  outline: 0x0b0907,
  flip: false,
  glowColor: 0xff8a2a,
  // Fists follow the forearm (no weapon), so no resting weapon angles are needed.
  wDefaults: {},
  noTrail: ['stL', 'crL', 'crM', 'crH', 'jL', 'throw', 'E', 'R', 'Q', 'W'],

  build(ctx) {
    const { rig, ms, s } = ctx;
    const B = new Batcher(ms);
    const T = (c) => ms.toon(c);
    const gun = T(C.gun), iron = T(C.iron), ironL = T(C.ironL), bronze = T(C.bronze), bronzeD = T(C.bronzeD), dark = T(C.dark), chainM = T(C.chain);
    const fire = ms.glow(C.fire, 2.3), hot = ms.glow(C.hot, 3.0), visor = ms.glow(C.visor, 3.4), stackGlow = ms.glow(C.ember, 2.2);
    const N = (node) => { const g = new THREE.Group(); g.scale.setScalar(s); node.add(g); return g; };
    const rivetsAt = (node, pts, r = 0.016, mat = bronze) => { for (const p of pts) B.add(node, G3.sphere(r, 7, 5), mat, { p }); };
    const ellipPts = (rx, ry, rz, cx, cy, cz, list) => list.map(([u, v]) => [cx + rx * Math.cos(v) * Math.sin(u), cy + ry * Math.sin(v), cz + rz * Math.cos(v) * Math.cos(u)]);

    // ---- Hips ---------------------------------------------------------------
    const H = N(rig.hips);
    B.add(H, G3.ellip(0.2, 0.15, 0.17), gun, { p: [0, 0.0, 0] });
    B.add(H, G3.limb(0.19, 0.205, 0.12), gun, { p: [0, 0.2, 0] });
    B.add(H, G3.cyl(0.228, 0.218, 0.11, 22), iron, { p: [0, 0.08, 0] });
    B.add(H, G3.torus(0.226, 0.013, 6, 28), bronze, { p: [0, 0.137, 0], r: [Math.PI / 2, 0, 0] });
    B.add(H, G3.torus(0.219, 0.013, 6, 28), bronze, { p: [0, 0.025, 0], r: [Math.PI / 2, 0, 0] });
    B.add(H, G3.box(0.15, 0.12, 0.045), bronze, { p: [0, 0.08, 0.222], smooth: true });
    B.add(H, G3.box(0.085, 0.06, 0.02), dark, { p: [0, 0.08, 0.247], outline: false });
    rivetsAt(H, [[-0.055, 0.115, 0.248], [0.055, 0.115, 0.248], [-0.055, 0.045, 0.248], [0.055, 0.045, 0.248]], 0.012, ironL);
    rivetsAt(H, Array.from({ length: 12 }, (_, i) => { const a = Math.PI * 0.32 + (i / 11) * Math.PI * 1.36; return [Math.sin(a) * 0.23, 0.08, Math.cos(a) * 0.23]; }), 0.015);
    // front fauld plates
    B.add(H, G3.box(0.24, 0.11, 0.035), iron, { p: [0, -0.035, 0.175], r: [0.2, 0, 0], smooth: true });
    B.add(H, G3.box(0.22, 0.1, 0.035), gun, { p: [0, -0.12, 0.192], r: [0.28, 0, 0], smooth: true });
    B.add(H, G3.box(0.225, 0.022, 0.04), bronze, { p: [0, -0.168, 0.205], r: [0.28, 0, 0] });
    // side tassets
    for (const sg of [-1, 1]) {
      B.add(H, G3.box(0.05, 0.27, 0.22), iron, { p: [sg * 0.215, -0.08, 0.0], r: [0, 0, sg * 0.2], smooth: true });
      B.add(H, G3.box(0.056, 0.03, 0.226), bronze, { p: [sg * 0.243, -0.21, 0.0], r: [0, 0, sg * 0.2] });
      rivetsAt(H, [[sg * 0.24, 0.02, 0.07], [sg * 0.24, 0.02, -0.07]], 0.014);
    }
    B.add(H, G3.box(0.32, 0.17, 0.04), iron, { p: [0, -0.05, -0.175], r: [-0.22, 0, 0], smooth: true });

    // ---- Chest ----------------------------------------------------------------
    const Ch = N(rig.chest);
    B.add(Ch, G3.ellip(0.315, 0.275, 0.245), iron, { p: [0, 0.075, 0.0] });
    B.add(Ch, G3.ellip(0.275, 0.14, 0.215), gun, { p: [0, -0.115, 0.01] });
    B.add(Ch, G3.cyl(0.25, 0.232, 0.07, 20), gun, { p: [0, -0.215, 0.0] });
    B.add(Ch, G3.torus(0.247, 0.012, 6, 26), bronze, { p: [0, -0.18, 0], r: [Math.PI / 2, 0, 0] });
    // layered pectoral plates
    for (const sg of [-1, 1]) {
      B.add(Ch, G3.ellip(0.17, 0.11, 0.08), gun, { p: [sg * 0.13, 0.19, 0.15], r: [-0.25, sg * 0.3, sg * 0.12] });
      B.add(Ch, G3.box(0.2, 0.02, 0.03), bronze, { p: [sg * 0.13, 0.115, 0.205], r: [-0.25, sg * 0.32, sg * 0.12] });
    }
    // furnace grate (stove-door arch)
    const FZ = 0.236, FY = 0.0;
    B.add(Ch, G3.cyl(0.15, 0.15, 0.08, 24), dark, { p: [0, FY, FZ - 0.052], r: [Math.PI / 2, 0, 0] });
    B.add(Ch, extrudeShape(archShape(0.165, 0.15, 0.09, [0.125, 0.112, 0.065]), 0.034, 0.007), bronze, { p: [0, FY, FZ + 0.014] });
    B.add(Ch, extrudeShape(archShape(0.126, 0.113, 0.066), 0.006, 0), fire, { p: [0, FY, FZ + 0.004] });
    B.add(Ch, G3.ellip(0.08, 0.062, 0.01), hot, { p: [0, FY - 0.03, FZ + 0.01] });
    for (const [y, w] of [[-0.07, 0.25], [-0.022, 0.25], [0.026, 0.25], [0.072, 0.21]]) B.add(Ch, G3.box(w, 0.017, 0.02), dark, { p: [0, FY + y, FZ + 0.022], outline: false });
    B.add(Ch, G3.box(0.019, 0.22, 0.02), dark, { p: [0, FY, FZ + 0.023], outline: false });
    rivetsAt(Ch, [[-0.145, FY - 0.13, FZ + 0.034], [0.145, FY - 0.13, FZ + 0.034], [-0.145, FY + 0.03, FZ + 0.034], [0.145, FY + 0.03, FZ + 0.034], [-0.09, FY + 0.13, FZ + 0.034], [0.09, FY + 0.13, FZ + 0.034], [0, FY + 0.152, FZ + 0.034]], 0.014, ironL);
    const furnace = new THREE.Object3D(); furnace.position.set(0, FY, FZ + 0.06); Ch.add(furnace);
    // cuirass rivet rows
    rivetsAt(Ch, ellipPts(0.322, 0.28, 0.242, 0, 0.075, 0, Array.from({ length: 11 }, (_, i) => [-1.15 + i * 0.23, 0.62])));
    rivetsAt(Ch, ellipPts(0.322, 0.28, 0.242, 0, 0.075, 0, Array.from({ length: 6 }, (_, i) => [0.8, -0.45 + i * 0.2])));
    rivetsAt(Ch, ellipPts(0.322, 0.28, 0.242, 0, 0.075, 0, Array.from({ length: 6 }, (_, i) => [-0.8, -0.45 + i * 0.2])));
    // collar
    B.add(Ch, G3.cyl(0.16, 0.21, 0.13, 20), gun, { p: [0, 0.285, -0.01] });
    B.add(Ch, G3.box(0.3, 0.13, 0.05), iron, { p: [0, 0.32, 0.14], r: [-0.35, 0, 0], smooth: true });
    B.add(Ch, G3.box(0.31, 0.02, 0.055), bronze, { p: [0, 0.385, 0.165], r: [-0.35, 0, 0] });
    // back boiler + exhaust stacks
    B.add(Ch, G3.cyl(0.14, 0.14, 0.34, 18), iron, { p: [0, 0.07, -0.26] });
    B.add(Ch, G3.ellip(0.14, 0.07, 0.14), gun, { p: [0, 0.24, -0.26] });
    B.add(Ch, G3.ellip(0.14, 0.06, 0.14), gun, { p: [0, -0.1, -0.26] });
    for (const y of [-0.04, 0.17]) B.add(Ch, G3.torus(0.142, 0.014, 6, 24), bronze, { p: [0, y, -0.26], r: [Math.PI / 2, 0, 0] });
    rivetsAt(Ch, Array.from({ length: 5 }, (_, i) => [0.1, -0.02 + i * 0.045, -0.36]).concat(Array.from({ length: 5 }, (_, i) => [-0.1, -0.02 + i * 0.045, -0.36])), 0.013);
    const emit = [];
    for (const sg of [-1, 1]) {
      const st = new THREE.Group(); st.position.set(sg * 0.13, 0.12, -0.33); st.rotation.set(-0.5, 0, -sg * 0.3); Ch.add(st);
      B.add(st, G3.cyl(0.05, 0.062, 0.34, 14), gun, { p: [0, 0.17, 0] });
      B.add(st, G3.torus(0.06, 0.013, 6, 18), bronze, { p: [0, 0.1, 0], r: [Math.PI / 2, 0, 0] });
      B.add(st, G3.cyl(0.082, 0.058, 0.08, 14), iron, { p: [0, 0.37, 0] });
      B.add(st, G3.torus(0.079, 0.013, 6, 18), bronze, { p: [0, 0.41, 0], r: [Math.PI / 2, 0, 0] });
      B.add(st, G3.cyl(0.064, 0.064, 0.012, 14), dark, { p: [0, 0.406, 0], outline: false });
      B.add(st, G3.cyl(0.046, 0.046, 0.014, 12), stackGlow, { p: [0, 0.408, 0] });
      const e = new THREE.Object3D(); e.position.set(0, 0.44, 0); st.add(e); emit.push(e);
    }
    // battlement pauldrons (fixed to the torso — the Bastion's ramparts)
    for (const sg of [-1, 1]) {
      const x = sg * 0.3;
      B.add(Ch, G3.ellip(0.2, 0.15, 0.21), iron, { p: [x, 0.25, -0.01], r: [0, 0, -sg * 0.28] });
      B.add(Ch, G3.ellip(0.19, 0.08, 0.2), gun, { p: [x + sg * 0.035, 0.16, -0.01], r: [0, 0, -sg * 0.42] });
      B.add(Ch, G3.torus(0.19, 0.016, 6, 26), bronze, { p: [x + sg * 0.012, 0.215, -0.01], r: [Math.PI / 2, 0, -sg * 0.28], s: [1, 1.08, 1], order: 'ZYX' });
      for (const z of [-0.12, 0.0, 0.12]) B.add(Ch, G3.box(0.08, 0.075, 0.075), iron, { p: [x + sg * 0.035, 0.405, z], r: [0, 0, -sg * 0.28], smooth: true });
      B.add(Ch, G3.box(0.16, 0.03, 0.34), bronze, { p: [x + sg * 0.01, 0.37, -0.01], r: [0, 0, -sg * 0.28], smooth: true });
      rivetsAt(Ch, ellipPts(0.205, 0.155, 0.215, x, 0.25, -0.01, [[sg * 1.2, 0.1], [sg * 1.45, 0.1], [sg * 1.7, 0.1], [sg * 1.95, 0.1], [sg * 0.95, 0.1]]));
    }

    // ---- Helm -------------------------------------------------------------------
    const Hd = N(rig.head); Hd.scale.setScalar(s * 1.14); Hd.position.y = -0.02 * s;
    B.add(Hd, G3.lathe([[0, -0.13], [0.148, -0.13], [0.155, -0.05], [0.152, 0.04], [0.14, 0.11], [0.11, 0.16], [0.06, 0.188], [0, 0.195]], 18), iron, { p: [0, 0.02, -0.01] });
    B.add(Hd, extrudeShape(new THREE.Shape([[-0.13, 0.1], [0.13, 0.1], [0.135, -0.06], [0.0, -0.15], [-0.135, -0.06]].map(([x, y]) => new THREE.Vector2(x, y))), 0.05, 0.008), gun, { p: [0, 0.0, 0.125] });
    B.add(Hd, G3.box(0.27, 0.048, 0.03), dark, { p: [0, 0.045, 0.16], outline: false });
    B.add(Hd, G3.box(0.23, 0.016, 0.01), visor, { p: [0, 0.045, 0.176] });
    for (const x of [-0.05, 0, 0.05]) B.add(Hd, G3.box(0.016, 0.06, 0.02), dark, { p: [x, -0.055, 0.162], outline: false });
    B.add(Hd, G3.torus(0.172, 0.02, 6, 20, Math.PI), bronze, { p: [0, 0.02, -0.01], r: [0, Math.PI / 2, 0] });
    for (const sg of [-1, 1]) {
      B.add(Hd, G3.box(0.05, 0.16, 0.13), gun, { p: [sg * 0.15, -0.04, 0.05], r: [0, sg * 0.25, 0], smooth: true });
      const h = hornGeo([[sg * 0.11, 0.06, -0.01], [sg * 0.2, 0.08, 0.01], [sg * 0.27, 0.13, 0.05], [sg * 0.29, 0.21, 0.1]], 0.042, 0.006);
      B.add(Hd, h, bronzeD, {});
      B.add(Hd, G3.torus(0.04, 0.012, 6, 14), bronze, { p: [sg * 0.15, 0.065, -0.005], r: [0, Math.PI / 2, 0] });
    }
    rivetsAt(Hd, [[-0.1, 0.085, 0.155], [0.1, 0.085, 0.155], [-0.11, -0.03, 0.16], [0.11, -0.03, 0.16]], 0.012, bronze);

    // ---- Arms ---------------------------------------------------------------------
    const trailPts = {};
    for (const S of ['L', 'R']) {
      const sg = S === 'L' ? 1 : -1;
      const ua = N(rig.seg['ua' + S]), fa = N(rig.seg['fa' + S]), hd = N(rig.hand[S]);
      B.add(ua, G3.limb(0.088, 0.08, 0.22), gun, { p: [0, -0.16, 0] });
      B.add(ua, G3.ellip(0.16, 0.07, 0.16), iron, { p: [sg * 0.03, -0.1, 0], r: [0, 0, -sg * 0.15] });
      B.add(ua, G3.ellip(0.135, 0.06, 0.14), gun, { p: [sg * 0.025, -0.16, 0], r: [0, 0, -sg * 0.1] });
      B.add(ua, G3.ellip(0.1, 0.09, 0.1), iron, { p: [0, -0.31, -0.01] });
      B.add(ua, G3.sphere(0.032, 10, 8), bronze, { p: [0, -0.32, -0.095] });
      // gauntlet bracer + chains
      B.add(fa, G3.limb(0.1, 0.128, 0.22), iron, { p: [0, -0.165, 0] });
      B.add(fa, G3.cyl(0.125, 0.152, 0.065, 18), gun, { p: [0, -0.292, 0] });
      B.add(fa, G3.torus(0.104, 0.015, 6, 20), bronze, { p: [0, -0.06, 0], r: [Math.PI / 2, 0, 0] });
      B.add(fa, G3.torus(0.15, 0.012, 6, 20), bronze, { p: [0, -0.262, 0], r: [Math.PI / 2, 0, 0] });
      for (const [y, R, tilt, n] of [[-0.12, 0.124, 0.22, 13], [-0.2, 0.134, -0.18, 14]]) {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          const m = new THREE.Matrix4().makeRotationX(tilt).multiply(new THREE.Matrix4().makeTranslation(Math.sin(a) * R, 0, Math.cos(a) * R))
            .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(k % 2 ? Math.PI / 2 : 0, a, 0, 'YXZ')));
          B.add(fa, G3.torus(0.026, 0.0075, 5, 10), chainM, { p: [0, y, 0], s: 1, m: m.multiply(new THREE.Matrix4().makeScale(1.35, 1, 1)) });
        }
      }
      // dangling chain end
      for (let k = 0; k < 4; k++) {
        B.add(fa, G3.torus(0.024, 0.0075, 5, 10), chainM, { p: [sg * 0.135, -0.235 - k * 0.042, -0.03], r: [0, k % 2 ? Math.PI / 2 : 0, Math.PI / 2], s: [1.35, 1, 1] });
      }
      // enormous fist (+Y = knuckles)
      B.add(hd, G3.ellip(0.12, 0.115, 0.105), gun, { p: [0, 0.105, 0] });
      B.add(hd, G3.box(0.22, 0.065, 0.16), iron, { p: [0, 0.19, -0.005], smooth: true });
      B.add(hd, G3.box(0.2, 0.15, 0.04), iron, { p: [0, 0.1, -0.09], smooth: true });
      B.add(hd, G3.box(0.205, 0.022, 0.045), bronze, { p: [0, 0.04, -0.092] });
      for (const x of [-0.075, -0.025, 0.025, 0.075]) {
        B.add(hd, G3.sphere(0.023, 8, 6), bronze, { p: [x, 0.228, -0.035] });
        B.add(hd, G3.ellip(0.026, 0.035, 0.04), gun, { p: [x, 0.17, 0.075] });
      }
      B.add(hd, G3.ellip(0.045, 0.07, 0.05), gun, { p: [-sg * 0.11, 0.085, 0.045], r: [0, 0, sg * 0.3] });
      const tip = new THREE.Object3D(); tip.position.set(0, 0.26, 0); hd.add(tip);
      const base = new THREE.Object3D(); base.position.set(0, 0.06, 0); hd.add(base);
      trailPts[S] = { tip, base };
    }
    // ---- Legs ---------------------------------------------------------------------
    for (const S of ['L', 'R']) {
      const th = N(rig.seg['th' + S]), sh = N(rig.seg['sh' + S]), ft = N(rig.foot[S]);
      B.add(th, G3.limb(0.122, 0.102, 0.32), gun, { p: [0, -0.22, 0] });
      B.add(th, G3.ellip(0.112, 0.18, 0.075), iron, { p: [0, -0.2, 0.075] });
      B.add(th, G3.box(0.16, 0.02, 0.05), bronze, { p: [0, -0.355, 0.11], r: [0.3, 0, 0] });
      B.add(th, G3.ellip(0.095, 0.09, 0.09), iron, { p: [0, -0.45, 0.06] });
      B.add(th, G3.sphere(0.034, 10, 8), bronze, { p: [0, -0.45, 0.145] });
      B.add(sh, G3.limb(0.102, 0.088, 0.32), iron, { p: [0, -0.21, 0] });
      B.add(sh, G3.ellip(0.108, 0.14, 0.1), gun, { p: [0, -0.15, -0.04] });
      B.add(sh, G3.box(0.032, 0.3, 0.035), bronze, { p: [0, -0.21, 0.098], smooth: true });
      B.add(sh, G3.cyl(0.11, 0.1, 0.05, 16), gun, { p: [0, -0.04, 0] });
      B.add(ft, G3.cyl(0.108, 0.12, 0.1, 16), gun, { p: [0, 0.02, 0] });
      B.add(ft, G3.ellip(0.115, 0.078, 0.175), iron, { p: [0, -0.03, 0.07] });
      B.add(ft, G3.ellip(0.1, 0.06, 0.085), bronze, { p: [0, -0.035, 0.2] });
      B.add(ft, G3.ellip(0.1, 0.035, 0.08), gun, { p: [0, 0.012, 0.13] });
      B.add(ft, G3.box(0.21, 0.032, 0.35), dark, { p: [0, -0.072, 0.065], smooth: true });
    }
    const meshes = B.build();

    // ---- living furnace / exhaust FX state ---------------------------------------------
    const fireMesh = meshes.find((m) => m.material === fire);
    const st = { flare: 0, jet: 0, time: Math.random() * 10, last: 0, accS: 0, accE: 0, emit, furnace, fwdNode: Ch, fire, hot, visor, stackGlow, pg: null, armorV: 0 };
    rig.root.userData.bk = st;
    if (fireMesh) fireMesh.onBeforeRender = () => fxFrame(st, fireMesh);

    // Back cloth (oxblood war-banner hanging from the belt)
    const cloth = new Ribbon({ segs: 7, len: 0.62 * s, width: 0.34 * s, taper: 0.85, mat: ms.toon(C.cloth, { side: THREE.DoubleSide, unique: true }), drag: 0.88 });
    return {
      trails: [
        { tip: trailPts.R.tip, base: trailPts.R.base, color: 0xff9a3c, moves: ['stM', 'stH', 'fH', 'jH'] },
        { tip: trailPts.L.tip, base: trailPts.L.base, color: 0xff9a3c, moves: ['stH', 'fH', 'jH'] },
      ],
      ribbons: [{ r: cloth, body: 'hips', offset: [0, -0.06 * s, -0.2 * s] }],
      glowColor: C.fire,
    };
  },

  // --------------------------------------------------------------------------
  poses: {
    stance: { root: [0, 0.77, 0], lean: 16, twist: -32, hipTwist: -20, head: [2, 24],
      hL: [0.62, 1.2, -0.16], hR: [0.56, 0.74, 0.36], eL: [-0.3, -0.5, -0.8], eR: [-0.25, -1, 0.45],
      fL: [0.32, 0, -0.27, 0, 10], fR: [-0.3, 0, 0.3, 0, -26] },
    crouch: { root: [0.02, 0.48, 0], lean: 30, twist: -28, hipTwist: -16, head: [-16, 20],
      hL: [0.64, 0.86, -0.14], hR: [0.56, 0.5, 0.36], eL: [-0.3, -0.5, -0.8], eR: [-0.25, -1, 0.45],
      fL: [0.35, 0, -0.3, 0, 10], fR: [-0.33, 0, 0.32, 0, -24] },
    jumpUp: { root: [0, 1.0, 0], lean: 6, head: [-8, 0], hL: [0.42, 1.5, -0.24], hR: [0.3, 1.42, 0.3], fL: [0.16, 0.42, -0.16, 30], fR: [-0.14, 0.28, 0.18, 20] },
    fall: { root: [0, 0.96, 0], lean: 12, hL: [0.48, 1.32, -0.22], hR: [0.36, 1.22, 0.3], fL: [0.22, 0.2, -0.18], fR: [-0.14, 0.32, 0.18, 20] },
    land: { root: [0, 0.6, 0], lean: 24, hL: [0.55, 0.95, -0.22], hR: [0.4, 0.85, 0.3], fL: [0.32, 0, -0.3], fR: [-0.3, 0, 0.32] },
    jsq: { root: [0, 0.62, 0], lean: 22, hL: [0.5, 0.98, -0.2], hR: [0.36, 0.88, 0.28], fL: [0.3, 0, -0.28], fR: [-0.28, 0, 0.3] },
    dash: { root: [0.08, 0.74, 0], lean: 28, twist: -34, head: [-6, 30], hL: [0.58, 1.12, -0.06], hR: [0.26, 0.92, 0.34], fL: [0.38, 0.08, -0.22], fR: [-0.4, 0.12, 0.28, -30] },
    bdash: { root: [-0.08, 0.8, 0], lean: -6, head: [8, 0], hL: [0.46, 1.25, -0.16], hR: [0.32, 1.12, 0.3], fL: [0.3, 0.12, -0.24], fR: [-0.3, 0, 0.28] },
    blockHigh: { root: [-0.04, 0.78, 0], lean: 14, twist: -16, head: [16, 0], hL: [0.42, 1.48, -0.12], hR: [0.44, 1.38, 0.16], eL: [0.1, -1, -0.3], eR: [0.1, -1, 0.3], fL: [0.3, 0, -0.27], fR: [-0.3, 0, 0.3, 0, -20] },
    blockLow: { root: [-0.04, 0.5, 0], lean: 26, twist: -16, head: [10, 0], hL: [0.5, 1.02, -0.12], hR: [0.5, 0.94, 0.16], eL: [0.1, -1, -0.3], eR: [0.1, -1, 0.3], fL: [0.35, 0, -0.3], fR: [-0.33, 0, 0.32] },
    tech: { root: [-0.08, 0.8, 0], lean: -4, hL: [0.5, 1.3, -0.18], hR: [0.4, 1.22, 0.24], fL: [0.26, 0, -0.27], fR: [-0.32, 0, 0.3] },
    throwWhiff: { root: [0.12, 0.8, 0], lean: 24, hL: [0.62, 1.15, -0.16], hR: [0.6, 1.1, 0.2], fL: [0.36, 0, -0.27], fR: [-0.26, 0, 0.3] },
    throwReach: { root: [0.12, 0.8, 0], lean: 20, hL: [0.72, 1.2, -0.14], hR: [0.7, 1.15, 0.2], fL: [0.38, 0, -0.27], fR: [-0.26, 0, 0.3] },
    walk: { stride: 0.21, lift: 0.08, bob: 0.035 },
    kd: { root: [-0.42, 0.3, 0], lean: -84, head: [24, 0], hL: [-0.7, 0.22, -0.5], hR: [-0.6, 0.2, 0.52], fL: [0.45, 0, -0.18], fR: [0.4, 0, 0.2] },
    dead: { root: [-0.42, 0.29, 0], lean: -86, head: [34, 30], hL: [-0.5, 0.2, -0.7], hR: [-0.85, 0.18, 0.4], fL: [0.5, 0, -0.24], fR: [0.42, 0, 0.16] },
    rise: { root: [-0.05, 0.56, 0], lean: 34, hL: [0.2, 0.25, -0.3], hR: [0.05, 0.32, 0.32], fL: [0.24, 0, -0.27], fR: [-0.28, 0, 0.3] },
    intro: { root: [0, 0.82, 0], lean: 10, twist: -8, head: [18, 6], hL: [0.46, 1.22, 0.07], hR: [0.46, 1.2, -0.05], eL: [-0.1, -0.2, -1], eR: [-0.1, -0.2, 1],
      fL: [0.28, 0, -0.3], fR: [-0.26, 0, 0.32, 0, -20] },
    win: { root: [0, 0.86, 0], lean: -10, head: [-24, 0], hL: [0.12, 2.0, -0.4], hR: [0.12, 1.98, 0.42], eL: [0, -0.3, -1], eR: [0, -0.3, 1], fL: [0.26, 0, -0.32], fR: [-0.26, 0, 0.34] },
  },

  moves: {
    stL: [[0, 'stance'], ['s-2', { twist: -14, hL: [0.46, 1.18, -0.08] }, 'io'],
      ['s', { root: [0.08, 0.8, 0], lean: 20, twist: -40, head: [0, 34], hL: [0.82, 1.2, -0.04] }, 'snap'],
      ['a+2', { root: [0.08, 0.8, 0], lean: 20, twist: -40, head: [0, 34], hL: [0.78, 1.2, -0.04] }], ['e', 'stance', 'io']],
    stM: [[0, 'stance'], ['s-3', { twist: -48, lean: 12, hR: [0.02, 1.12, 0.42], hL: [0.5, 1.2, -0.1] }, 'io'],
      ['s', { root: [0.14, 0.78, 0], twist: 26, lean: 20, head: [0, 0], hR: [0.86, 1.12, 0.06], hL: [0.36, 1.1, -0.2], fL: [0.42, 0, -0.27] }, 'snap'],
      ['a+3', { root: [0.14, 0.78, 0], twist: 40, lean: 20, hR: [0.74, 1.12, -0.18], hL: [0.34, 1.08, -0.22], fL: [0.42, 0, -0.27] }], ['e', 'stance', 'io']],
    stH: [[0, 'stance'], ['s-6', { root: [-0.08, 0.78, 0], lean: -2, twist: -12, head: [8, 8], hL: [0.18, 1.12, -0.22], hR: [0.1, 1.02, 0.3] }, 'io'],
      ['s', { root: [0.24, 0.7, 0], lean: 34, twist: -6, head: [-12, 6], hL: [1.0, 1.02, -0.07], hR: [1.02, 0.94, 0.09], fL: [0.62, 0, -0.27], fR: [-0.3, 0, 0.3, 0, -20] }, 'snap'],
      ['a+3', { root: [0.24, 0.7, 0], lean: 36, twist: -4, head: [-12, 6], hL: [0.98, 0.98, -0.07], hR: [1.0, 0.9, 0.09], fL: [0.62, 0, -0.27], fR: [-0.3, 0, 0.3, 0, -20] }], ['e', 'stance', 'io']],
    crL: [[0, 'crouch'], ['s-2', { lean: 36, hL: [0.55, 0.62, -0.1] }],
      ['s', { root: [0.12, 0.46, 0], lean: 50, twist: -30, hL: [0.84, 0.3, -0.06] }, 'snap'],
      ['a+2', { root: [0.12, 0.46, 0], lean: 50, twist: -30, hL: [0.8, 0.3, -0.06] }], ['e', 'crouch']],
    crM: [[0, 'crouch'], ['s-3', { lean: 18, fL: [0.42, 0.3, -0.24, 20] }],
      ['s', { root: [0.16, 0.52, 0], lean: 8, twist: -10, hL: [0.5, 0.95, -0.2], fL: [0.98, 0.1, -0.24, 25], kL: [1, 0.3, 0] }, 'snap'],
      ['a+3', { root: [0.16, 0.52, 0], lean: 8, twist: -10, hL: [0.5, 0.95, -0.2], fL: [0.94, 0.1, -0.24, 25], kL: [1, 0.3, 0] }], ['e', 'crouch']],
    crH: [[0, 'crouch'], ['s-5', { root: [0.04, 0.6, 0], lean: 10, hL: [0.4, 1.0, -0.4], hR: [0.2, 0.9, 0.42], fL: [0.42, 0.62, -0.26, 10], kL: [1, 0.6, 0] }, 'io'],
      ['s', { root: [0.28, 0.46, 0], lean: 28, hL: [0.6, 0.72, -0.36], hR: [0.36, 0.66, 0.4], fL: [1.04, 0.0, -0.26, 0], fR: [-0.32, 0, 0.3] }, 'snap'],
      ['a+4', { root: [0.28, 0.44, 0], lean: 30, hL: [0.6, 0.7, -0.36], hR: [0.36, 0.64, 0.4], fL: [1.04, 0.0, -0.26, 0], fR: [-0.32, 0, 0.3] }], ['e', 'crouch', 'io']],
    jL: [[0, 'fall'], ['s', { lean: 14, fL: [0.18, 0.1, -0.16, -20], kL: [1, 0.2, 0], hL: [0.3, 1.25, -0.3], hR: [0.2, 1.15, 0.32] }, 'snap'],
      ['a', { lean: 14, fL: [0.18, 0.1, -0.16, -20], kL: [1, 0.2, 0], hL: [0.3, 1.25, -0.3], hR: [0.2, 1.15, 0.32] }], ['e', 'fall']],
    jM: [[0, 'fall'], ['s-3', { lean: 2, fL: [0.28, 0.62, -0.2, 10], kL: [1, 0.6, 0], hL: [0.3, 1.45, -0.42], hR: [0.12, 1.35, 0.44] }, 'io'],
      ['s', { root: [0, 0.94, 0], lean: -8, head: [-14, 0], fL: [0.6, 0.08, -0.2, 25], kL: [1, 0.3, 0], hL: [0.22, 1.5, -0.46], hR: [0.02, 1.42, 0.46] }, 'snap'],
      ['a', { root: [0, 0.94, 0], lean: -10, head: [-14, 0], fL: [0.58, 0.06, -0.2, 25], kL: [1, 0.3, 0], hL: [0.22, 1.5, -0.46], hR: [0.02, 1.42, 0.46] }], ['e', 'fall']],
    jH: [[0, 'fall'], ['s-4', { lean: -10, head: [-16, 0], hL: [0.12, 1.75, -0.48], hR: [0.12, 1.75, 0.48], fL: [0.2, 0.42, -0.2], fR: [0.02, 0.36, 0.2] }, 'io'],
      ['s', { root: [0.06, 0.86, 0], lean: 56, head: [-28, 0], hL: [0.78, 0.66, -0.2], hR: [0.78, 0.6, 0.24], fL: [-0.2, 0.45, -0.2], fR: [-0.32, 0.5, 0.2] }, 'snap'],
      ['a', { root: [0.06, 0.86, 0], lean: 60, head: [-30, 0], hL: [0.76, 0.6, -0.2], hR: [0.76, 0.54, 0.24], fL: [-0.2, 0.45, -0.2], fR: [-0.32, 0.5, 0.2] }], ['e', 'fall']],
    fH: [[0, 'stance'], ['s-9', { root: [-0.04, 0.86, 0], lean: -14, head: [-10, 0], hL: [0.0, 2.02, -0.07], hR: [0.02, 1.98, 0.1], fR: [-0.28, 0.04, 0.3, -20] }, 'io'],
      ['s', { root: [0.22, 0.66, 0], lean: 38, head: [-12, 0], hL: [0.96, 0.78, -0.06], hR: [0.96, 0.74, 0.08], fL: [0.58, 0, -0.27] }, 'snap'],
      ['a+3', { root: [0.22, 0.64, 0], lean: 40, head: [-12, 0], hL: [0.94, 0.58, -0.06], hR: [0.94, 0.54, 0.08], fL: [0.58, 0, -0.27] }], ['e', 'stance', 'io']],
    throw: [[0, 'stance'], ['s', 'throwReach', 'snap'], ['e', 'throwWhiff']],
    Q: [[0, 'stance'], ['s-6', { root: [0, 0.9, 0], lean: -2, twist: -10, head: [-6, 10], hL: [0.3, 1.18, -0.5], hR: [0.12, 1.05, 0.5], fL: [0.26, 0.62, -0.24, 10], kL: [1, 0.6, 0] }, 'io'],
      ['s', { root: [0.04, 0.66, 0], lean: 28, head: [-14, 10], hL: [0.5, 0.9, -0.36], hR: [0.32, 0.82, 0.42], fL: [0.46, 0, -0.27], fR: [-0.32, 0, 0.3] }, 'snap'],
      ['s+8', { root: [0.04, 0.64, 0], lean: 30, head: [-14, 10], hL: [0.5, 0.86, -0.36], hR: [0.32, 0.8, 0.42], fL: [0.46, 0, -0.27], fR: [-0.32, 0, 0.3] }], ['e', 'stance', 'io']],
    W: [[0, 'stance'], ['s-3', { root: [0, 0.74, 0], lean: 24, head: [14, 0], hL: [0.42, 0.95, 0.04], hR: [0.42, 0.93, -0.02] }, 'io'],
      ['s', { root: [0, 0.84, 0], lean: -14, head: [-24, 0], hL: [0.18, 1.16, -0.64], hR: [0.18, 1.12, 0.66], eL: [0, -0.4, -1], eR: [0, -0.4, 1], fL: [0.3, 0, -0.32], fR: [-0.3, 0, 0.34] }, 'snap'],
      ['s+7', { root: [0, 0.84, 0], lean: -14, head: [-24, 0], hL: [0.18, 1.14, -0.64], hR: [0.18, 1.1, 0.66], eL: [0, -0.4, -1], eR: [0, -0.4, 1], fL: [0.3, 0, -0.32], fR: [-0.3, 0, 0.34] }], ['e', 'stance', 'io']],
    E: [[0, 'stance'], ['s-4', { root: [0.08, 0.78, 0], lean: 26, twist: 6, hR: [0.5, 1.36, 0.22], hL: [0.24, 1.0, -0.3] }, 'io'],
      ['s', { root: [0.18, 0.78, 0], lean: 30, twist: 24, head: [-8, -10], hR: [0.92, 1.42, 0.02], hL: [0.24, 1.0, -0.32], fL: [0.56, 0, -0.27], fR: [-0.36, 0.05, 0.3, -20] }, 'snap'],
      ['a', { root: [0.18, 0.78, 0], lean: 30, twist: 24, head: [-8, -10], hR: [0.92, 1.42, 0.02], hL: [0.24, 1.0, -0.32], fL: [0.56, 0, -0.27], fR: [-0.36, 0.05, 0.3, -20] }],
      ['a+10', { root: [0.2, 0.74, 0], lean: 38, twist: 30, hR: [0.86, 1.18, 0.02], hL: [0.24, 0.96, -0.32], fL: [0.56, 0, -0.27], fR: [-0.36, 0.05, 0.3, -20] }], ['e', 'stance', 'io']],
    R: [[0, 'stance'], ['s-5', { root: [-0.04, 0.66, 0], lean: 18, head: [-10, 0], hL: [0.28, 1.02, -0.56], hR: [0.26, 0.98, 0.58], fL: [0.34, 0, -0.32], fR: [-0.34, 0, 0.34] }, 'io'],
      ['s', { root: [0.22, 0.74, 0], lean: 30, head: [-12, 0], hL: [0.98, 1.2, -0.24], hR: [0.98, 1.14, 0.3], fL: [0.62, 0, -0.27], fR: [-0.36, 0.06, 0.3, -24] }, 'snap'],
      ['a', { root: [0.22, 0.74, 0], lean: 30, head: [-12, 0], hL: [0.98, 1.2, -0.24], hR: [0.98, 1.14, 0.3], fL: [0.62, 0, -0.27], fR: [-0.36, 0.06, 0.3, -24] }], ['e', 'stance', 'io']],
  },

  locks: {
    throw: {
      atk: [[0, { root: [0.1, 0.8, 0], lean: 18, hL: [0.62, 1.2, -0.14], hR: [0.6, 1.14, 0.2] }],
        [10, { root: [0.02, 0.72, 0], lean: 6, head: [-10, 0], hL: [0.44, 1.55, -0.16], hR: [0.42, 1.5, 0.2] }, 'io'],
        [18, { root: [0, 0.78, 0], lean: -12, head: [-30, 0], hL: [0.12, 1.98, -0.2], hR: [0.12, 1.96, 0.22], fL: [0.3, 0, -0.3], fR: [-0.28, 0, 0.32] }, 'io'],
        [26, { root: [0, 0.8, 0], lean: -14, head: [-32, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.3, 0, -0.3], fR: [-0.28, 0, 0.32] }],
        [30, { root: [0.06, 0.82, 0], lean: -6, head: [-20, 0], hL: [0.4, 1.95, -0.2], hR: [0.4, 1.92, 0.22], fL: [0.3, 0, -0.3], fR: [-0.28, 0, 0.32] }, 'in'],
        [34, { root: [0.22, 0.58, 0], lean: 42, head: [-10, 0], hL: [0.92, 0.55, -0.18], hR: [0.92, 0.5, 0.2], fL: [0.58, 0, -0.27], fR: [-0.3, 0, 0.3] }, 'snap'],
        [42, 'stance', 'io']],
      vic: [[0, V({ root: [-0.06, 0.9, 0], lean: -20, twist: -20, head: [-20, 10], hL: [0.1, 1.3, -0.25], hR: [-0.1, 1.2, 0.3], fL: [0.2, 0, -0.12], fR: [-0.22, 0, 0.14] })],
        [10, V({ root: [0, 0.98, 0], lean: -10, head: [-20, 0], hL: [0.25, 1.35, -0.2], hR: [0.25, 1.3, 0.2], fL: [0.1, 0.1, -0.1], fR: [-0.12, 0.18, 0.1] })],
        [18, Object.assign({}, OVERHEAD, { spin: -90 }), 'io'], [26, Object.assign({}, OVERHEAD, { spin: -92 })],
        [30, Object.assign({}, OVERHEAD, { spin: -110 })], [34, V(KD), 'snap'], [42, V(KD)]],
    },
    siege: {
      atk: [[0, { root: [0.12, 0.8, 0], lean: 24, twist: 20, hR: [0.72, 1.38, 0.06], hL: [0.25, 1.0, -0.3] }],
        [6, { root: [0.06, 0.8, 0], lean: 10, twist: 16, head: [-8, 0], hR: [0.6, 1.58, 0.06], hL: [0.2, 1.0, -0.32] }, 'io'],
        [16, { root: [0.02, 0.82, 0], lean: -6, twist: 10, head: [-16, 0], hR: [0.56, 1.74, 0.04], hL: [0.12, 0.95, -0.36] }, 'io'],
        [24, { root: [0, 0.84, 0], lean: -16, twist: 6, head: [-26, 0], hR: [0.58, 1.76, 0.04], hL: [-0.02, 0.92, -0.42] }, 'io'],
        [30, { root: [0, 0.84, 0], lean: -14, twist: 6, head: [-24, 0], hR: [0.58, 1.76, 0.04], hL: [0.0, 0.92, -0.42] }],
        [36, { root: [0, 0.88, 0], lean: -14, twist: 0, head: [-26, 0], hR: [0.5, 1.92, 0.06], hL: [0.42, 1.78, -0.18] }, 'io'],
        [40, { root: [0.22, 0.56, 0], lean: 46, twist: 0, head: [-12, 0], hR: [0.94, 0.5, 0.06], hL: [0.9, 0.55, -0.16], fL: [0.58, 0, -0.27], fR: [-0.3, 0, 0.3] }, 'snap'],
        [52, { root: [0.18, 0.6, 0], lean: 40, twist: 0, head: [-8, 0], hR: [0.86, 0.6, 0.06], hL: [0.84, 0.64, -0.16], fL: [0.58, 0, -0.27], fR: [-0.3, 0, 0.3] }],
        [58, 'stance', 'io']],
      vic: [[0, V({ root: [-0.06, 0.9, 0], lean: -22, head: [-24, 0], hL: [0.12, 1.3, -0.25], hR: [-0.05, 1.2, 0.3], fL: [0.2, 0, -0.12], fR: [-0.22, 0, 0.14] })],
        [6, V(Object.assign({}, DANGLE, { hL: [0.2, 1.5, -0.08], hR: [0.22, 1.48, 0.08] }))],
        [16, V(DANGLE)],
        [21, V(Object.assign({}, DANGLE, { fL: [0.2, 0.2, -0.12], fR: [-0.18, 0.02, 0.12] }))],
        [26, V(Object.assign({}, DANGLE, { lean: 8, head: [10, 0], hL: [0.3, 1.2, -0.3], hR: [0.3, 1.15, 0.3], fL: [0.1, 0.25, -0.12], fR: [0.05, 0.2, 0.12] }))],
        [30, V(Object.assign({}, DANGLE, { lean: 4, head: [4, 0] }))],
        [36, V(Object.assign({}, DANGLE, { spin: -16, lean: -24 }))],
        [40, V(KD), 'snap'], [58, V(KD)]],
    },
    colossus: {
      camZ: 11, orbit: 0.3,
      atk: [[0, { spin: 0, root: [0.22, 0.74, 0], lean: 30, head: [-12, 0], hL: [0.98, 1.2, -0.24], hR: [0.98, 1.14, 0.3], fL: [0.62, 0, -0.27], fR: [-0.36, 0.06, 0.3, -24] }],
        [12, { spin: 0, root: [0, 0.56, 0], lean: 12, twist: 0, hipTwist: 0, head: [-24, 0], hL: [0.08, 1.72, -0.2], hR: [0.08, 1.7, 0.24], fL: [0.28, 0, -0.32], fR: [-0.28, 0, 0.34] }, 'io'],
        [18, { spin: 0, root: [0, 0.98, 0], lean: -6, twist: 0, hipTwist: 0, head: [-30, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.1, 0.04, -0.2, -30], fR: [-0.08, 0.0, 0.22, -30] }, 'snap'],
        [46, { spin: 0, root: [0, 0.98, 0], lean: 2, twist: 0, hipTwist: 0, head: [-26, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.2, 0.36, -0.2, 20], fR: [0.0, 0.3, 0.22, 20] }, 'io'],
        [56, { spin: 0, root: [0, 0.98, 0], lean: 6, twist: 0, hipTwist: 0, head: [-20, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.26, 0.45, -0.2, 20], fR: [0.08, 0.4, 0.22, 20] }],
        [68, { spin: 180, root: [0, 0.98, 0], lean: 10, twist: 0, hipTwist: 0, head: [-20, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.28, 0.5, -0.2, 20], fR: [0.1, 0.45, 0.22, 20] }, 'lin'],
        [80, { spin: 360, root: [0, 0.98, 0], lean: 6, twist: 0, hipTwist: 0, head: [-20, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.26, 0.45, -0.2, 20], fR: [0.08, 0.4, 0.22, 20] }, 'lin'],
        [80, { spin: 0, root: [0, 0.98, 0], lean: 6, twist: 0, hipTwist: 0, head: [-20, 0], hL: [0.1, 2.0, -0.2], hR: [0.1, 1.98, 0.22], fL: [0.26, 0.45, -0.2, 20], fR: [0.08, 0.4, 0.22, 20] }],
        [88, { spin: 0, root: [0, 0.98, 0], lean: 32, twist: 0, hipTwist: 0, head: [10, 0], hL: [0.46, 0.56, -0.16], hR: [0.46, 0.52, 0.2], fL: [0.2, 0.36, -0.26], fR: [-0.18, 0.3, 0.28] }, 'io'],
        [105, { spin: 0, root: [0.02, 0.9, 0], lean: 34, twist: 0, hipTwist: 0, head: [14, 0], hL: [0.5, 0.62, -0.16], hR: [0.5, 0.58, 0.2], fL: [0.22, 0.2, -0.28], fR: [-0.2, 0.16, 0.3] }],
        [106, { spin: 0, root: [0.06, 0.6, 0], lean: 36, twist: 0, hipTwist: 0, head: [6, 0], hL: [0.52, 0.98, -0.16], hR: [0.52, 0.94, 0.2], fL: [0.3, 0, -0.32], fR: [-0.32, 0, 0.34] }, 'snap'],
        [122, { spin: 0, root: [0.06, 0.64, 0], lean: 34, twist: 0, hipTwist: 0, head: [4, 0], hL: [0.52, 1.0, -0.16], hR: [0.52, 0.96, 0.2], fL: [0.3, 0, -0.32], fR: [-0.32, 0, 0.34] }],
        [134, { spin: 0, root: [-0.04, 0.84, 0], lean: -8, twist: -10, hipTwist: -6, head: [-14, 0], hL: [0.3, 1.18, -0.36], hR: [0.28, 1.14, 0.38], fL: [0.3, 0, -0.32], fR: [-0.32, 0, 0.34] }, 'io'],
        [146, { spin: 0, root: [0, 0.77, 0], lean: 16, twist: -32, hipTwist: -20, head: [2, 24], hL: [0.62, 1.2, -0.16], hR: [0.56, 0.74, 0.36] }, 'io']],
      vic: [[0, V({ root: [-0.06, 0.9, 0], lean: -20, head: [-24, 0], hL: [0.1, 1.3, -0.25], hR: [-0.05, 1.2, 0.3], fL: [0.2, 0, -0.12], fR: [-0.22, 0, 0.14] })],
        [12, Object.assign({}, OVERHEAD, { spin: -90 }), 'io'], [56, Object.assign({}, OVERHEAD, { spin: -90 })],
        [68, Object.assign({}, OVERHEAD, { spin: -270 }), 'lin'], [80, Object.assign({}, OVERHEAD, { spin: -450 }), 'lin'],
        [80, Object.assign({}, OVERHEAD, { spin: -90 })],
        [88, Object.assign({}, UPSIDE, { spin: -180 }), 'io'], [105, Object.assign({}, UPSIDE, { spin: -180 })],
        [106, Object.assign({}, UPSIDE, { root: [0, 1.22, 0], lean: 10, head: [20, 0], spin: -180 }), 'snap'],
        [128, Object.assign({}, UPSIDE, { root: [0, 1.22, 0], lean: 14, head: [24, 0], spin: -180 })],
        [140, V(Object.assign({}, OVERHEAD, { spin: -110 })), 'io'], [146, V(Object.assign({}, OVERHEAD, { spin: -90 }))]],
    },
  },

  // --------------------------------------------------------------------------
  ents: {
    shockwave: {
      build(ctx, e) {
        const g = new THREE.Group();
        const rm = new THREE.MeshToonMaterial({ color: C.rock, gradientMap: toonRamp() });
        const rd = new THREE.MeshToonMaterial({ color: C.rockD, gradientMap: toonRamp() });
        const ol = new THREE.MeshBasicMaterial({ color: 0x0b0907, side: THREE.BackSide });
        const lava = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.lava).multiplyScalar(2.8) });
        const rocksArr = [];
        const spec = [[-0.3, 0.1, 0.12], [-0.15, 0.16, -0.1], [0.0, 0.2, 0.14], [0.14, 0.26, -0.04], [0.3, 0.2, 0.1], [0.38, 0.13, -0.14]];
        spec.forEach(([x, sz, z], i) => {
          const geo = new THREE.DodecahedronGeometry(sz, 0);
          geo.scale(0.8, 1.4, 0.8);
          const m = new THREE.Mesh(geo, i % 2 ? rd : rm);
          const o = new THREE.Mesh(geo, ol); o.scale.setScalar(1.12); m.add(o);
          m.position.set(x, sz * 0.5, z); m.rotation.set(Math.random(), Math.random() * 3, (Math.random() - 0.5) * 0.6);
          m.userData = { by: sz * 0.5, ph: Math.random() * 6, sz };
          g.add(m); rocksArr.push(m);
        });
        const crack = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.06), lava);
        crack.rotation.x = -Math.PI / 2; crack.position.set(0, 0.012, 0); g.add(crack);
        g.userData = { rocks: rocksArr, lastX: e.x, t: 0, crack };
        return g;
      },
      update(obj, e, ctx) {
        const U = obj.userData, V = ctx.vfx;
        U.t += ctx.dt || 1 / 60;
        const x = e.x * ctx.S2M, back = -e.face;
        for (const r of U.rocks) {
          const k = Math.abs(Math.sin(U.t * 16 + r.userData.ph));
          r.position.y = r.userData.by * (0.6 + 0.5 * k);
          r.rotation.y += 0.05; r.rotation.z = Math.sin(U.t * 9 + r.userData.ph) * 0.25;
        }
        U.crack.scale.x = 0.8 + Math.random() * 0.5;
        if (Math.random() < 0.8) V.burst({ x: x + back * 0.3, y: 0.08, z: 0.1, count: 2, color: C.dust, additive: false, shape: 'smoke', size: [0.15, 0.28], size1: 0.55, speed: [0.3, 1.2], dir: Math.PI / 2, spread: 1.2, life: [0.4, 0.8], gravity: -0.3, alpha: 0.5, intensity: 1, jz: 0.25 });
        if (Math.random() < 0.6) V.burst({ x: x + (Math.random() - 0.5) * 0.4, y: 0.15, z: 0.12, count: 1, color: C.rock, color2: C.rockD, additive: false, shape: 'shard', size: [0.04, 0.08], size1: 0.04, speed: [2, 4.5], dir: Math.PI / 2, spread: 0.6, life: [0.4, 0.7], gravity: 14, intensity: 1, floor: true });
        if (Math.random() < 0.3) V.burst({ x, y: 0.1, z: 0.2, count: 1, color: C.ember, shape: 'spark', size: 0.03, speed: [1, 3], dir: Math.PI / 2, spread: 0.7, life: 0.4, gravity: 3, intensity: 2.2 });
        if (Math.abs(e.x - U.lastX) * ctx.S2M > 0.26) { U.lastX = e.x; crackDecal(ctx, x + back * 0.2, 0.42, 1.2); }
      },
      end(obj, e, ctx) {
        const x = e.x * ctx.S2M;
        dust(ctx.vfx, x, 10, 1.2, 0.3);
        rocks(ctx.vfx, x, 0.15, 10, 4.5);
      },
    },
  },

  // --------------------------------------------------------------------------
  onEvent(e, ctx) {
    const V = ctx.vfx, S2M = ctx.S2M;
    const F = ctx.G.fighters[e.p];
    const fx = F.x * S2M, face = F.face;
    switch (e.t) {
      case 'cast': {
        if (e.s === 'Q') flare(ctx, 0.5);
        if (e.s === 'W') { flare(ctx, 0.8); sfx(ctx, 'fire_cast'); }
        if (e.s === 'E') { dust(V, fx - face * 0.2, 8, 1.0, 0.25); flare(ctx, 0.4); }
        break;
      }
      case 'ult': {
        flare(ctx, 1.6);
        const st = bk(ctx); if (st) st.jet = 0.3;
        const p = furnacePos(ctx, new THREE.Vector3());
        V.flash({ x: p.x, y: p.y, z: p.z + 0.3, color: 0xff9a3c, size: 3.2, life: 0.5, grow: true });
        V.burst({ x: p.x, y: p.y, z: p.z + 0.2, count: 60, color: 0xffb050, color2: 0xff3a10, shape: 'spark', speed: [2, 8], life: [0.4, 0.9], size: [0.03, 0.06], drag: 0.9, gravity: -2, intensity: 2.6 });
        V.ring({ x: p.x, y: p.y, z: p.z + 0.2, color: 0xff8a2a, r0: 0.2, r1: 2.6, life: 0.55, thick: 0.2, intensity: 3 });
        sfx(ctx, 'fire_cast');
        break;
      }
      case 'spawn': {
        if (e.k === 'brakka.shockwave') {
          const x = e.x * S2M;
          dust(V, x - face * 0.2, 22, 1.5, 0.35);
          rocks(V, x - face * 0.15, 0.1, 14, 6);
          V.ring({ x: x - face * 0.25, y: 0.03, z: 0.1, color: 0xffa060, r0: 0.1, r1: 1.4, life: 0.35, thick: 0.12, axis: 'y', intensity: 2 });
          V.flash({ x: x - face * 0.2, y: 0.2, color: 0xffa050, size: 1.4, life: 0.12 });
          crackDecal(ctx, x - face * 0.3, 0.6, 1.4);
          V.shake(0.07, 0.22);
          sfx(ctx, 'earth_cast'); sfx(ctx, 'shockwave');
        }
        break;
      }
      case 'ent_end': break;
      case 'cine': {
        if (e.k === 'bastion') {
          flare(ctx, 1.5);
          const p = furnacePos(ctx, new THREE.Vector3());
          V.flash({ x: p.x, y: p.y, z: p.z + 0.3, color: 0xffa040, size: 1.8, life: 0.22, intensity: 2.2 });
          V.ring({ x: fx, y: 1.15, z: 0.3, color: 0xff8a2a, r0: 0.3, r1: 1.8, life: 0.45, thick: 0.18, intensity: 3 });
          V.ring({ x: fx, y: 0.04, z: 0, color: 0xffb060, r0: 0.3, r1: 1.6, life: 0.5, thick: 0.12, axis: 'y', intensity: 2 });
          embers(V, p.x, p.y, 40, 5, p.z + 0.2);
          V.light({ x: p.x, y: p.y, z: 1.2, color: 0xff8a2a, intensity: 12, life: 0.45, distance: 6 });
          sfx(ctx, 'buff'); sfx(ctx, 'armor');
        } else if (e.k === 'siege_vent') {
          flare(ctx, 1.6);
          const st = bk(ctx); if (st) st.jet = 0.25;
          const p = furnacePos(ctx, new THREE.Vector3());
          V.burst({ x: p.x + face * 0.1, y: p.y + 0.1, z: p.z + 0.1, count: 18, color: 0xff9a40, color2: 0xff3010, shape: 'soft', size: [0.07, 0.14], size1: 0.03, speed: [2, 5], dir: face > 0 ? 0.35 : Math.PI - 0.35, spread: 0.4, life: [0.2, 0.4], drag: 0.88, intensity: 1.4 });
          embers(V, p.x, p.y, 16, 5, p.z + 0.1);
          sfx(ctx, 'fire_cast');
        } else if (e.k === 'throw_lift') {
          flare(ctx, 0.6);
        } else if (e.k === 'colossus_leap') {
          const x = e.x * S2M;
          const st = bk(ctx); if (st) st.jet = 0.55;
          flare(ctx, 1.6);
          dust(V, x, 34, 1.6, 0.45);
          rocks(V, x, 0.1, 22, 8);
          V.ring({ x, y: 0.04, z: 0, color: 0xffb070, r0: 0.2, r1: 2.6, life: 0.5, thick: 0.18, axis: 'y', intensity: 2.4 });
          crackDecal(ctx, x, 1.0, 2.0);
          V.shake(0.16, 0.35);
          sfx(ctx, 'earth_cast');
        } else if (e.k === 'colossus_impact') {
          const x = e.x * S2M;
          crater(ctx, x);
          dust(V, x, 60, 1.7, 0.6);
          rocks(V, x, 0.2, 46, 11);
          V.burst({ x, y: 0.3, z: 0.4, count: 60, color: 0xffb060, color2: 0xff3a10, shape: 'spark', speed: [4, 13], dir: Math.PI / 2, spread: 1.3, life: [0.3, 0.8], size: [0.025, 0.05], gravity: 9, drag: 0.92, stretch: 1.4, intensity: 2 });
          V.ring({ x, y: 0.05, z: 0, color: 0xffa050, r0: 0.3, r1: 4.2, life: 0.7, thick: 0.3, axis: 'y', intensity: 3 });
          V.ring({ x, y: 0.05, z: 0, color: 0xffe0b0, r0: 0.2, r1: 2.6, life: 0.4, thick: 0.1, axis: 'y', intensity: 2 });
          V.ring({ x, y: 0.9, z: 0.4, color: 0xff8a2a, r0: 0.3, r1: 2.4, life: 0.45, thick: 0.16, intensity: 2.2 });
          V.burst({ x, y: 0.4, z: 0.3, count: 26, color: 0x2c2624, additive: false, shape: 'smoke', size: [0.4, 0.7], size1: 1.3, speed: [1.5, 4.5], dir: Math.PI / 2, spread: 1.0, life: [0.9, 1.6], drag: 0.9, gravity: -0.6, alpha: 0.6, intensity: 1 });
          V.flash({ x, y: 0.5, z: 0.6, color: 0xffa050, size: 3.4, life: 0.22, intensity: 2.2 });
          V.light({ x, y: 0.8, z: 1.5, color: 0xff8a2a, intensity: 30, life: 0.8, distance: 10 });
          V.shake(0.42, 0.7);
          flare(ctx, 1.6);
          if (ctx.renderer && ctx.renderer.fx) { ctx.renderer.fx.flash = Math.max(ctx.renderer.fx.flash, 0.18); ctx.renderer.fx.flashCol.set(0xffb070); ctx.renderer.fx.chroma = 1.4; }
          sfx(ctx, 'ult_impact'); sfx(ctx, 'explosion'); sfx(ctx, 'earth_impact');
        }
        break;
      }
      case 'lock': {
        sfx(ctx, 'grab');
        const V2 = ctx.G.fighters[e.v];
        const x = (F.x + V2.x) / 2 * S2M;
        V.burst({ x, y: 1.3, z: 0.3, count: 14, color: 0xffc070, shape: 'spark', speed: [1.5, 4], life: [0.15, 0.3], size: [0.02, 0.04], intensity: 2 });
        if (e.id === 'colossus') flare(ctx, 1.2);
        break;
      }
      case 'hit': {
        const x = e.x * S2M, y = e.y * S2M;
        if (e.k === 'brakka.shockwave') {
          dust(V, x, 16, 1.4, 0.32); rocks(V, x, 0.2, 16, 7);
          V.ring({ x, y: 0.05, color: 0xffa050, r0: 0.1, r1: 1.2, life: 0.3, axis: 'y' });
          sfx(ctx, 'earth_impact');
          break;
        }
        if (e.lock) {
          if (e.fx === 'slam') {
            const vx = ctx.G.fighters[e.v].x * S2M;
            dust(V, vx, 30, 1.6, 0.42); rocks(V, vx, 0.1, 18, 7);
            V.ring({ x: vx, y: 0.04, color: 0xffb070, r0: 0.2, r1: 2.0, life: 0.4, thick: 0.15, axis: 'y', intensity: 2.4 });
            crackDecal(ctx, vx, 0.9, 1.6);
            V.shake(0.2, 0.32);
            sfx(ctx, 'throw_slam'); sfx(ctx, 'earth_impact');
          } else if (e.fx === 'furnace') {
            const vv = ctx.G.fighters[e.v];
            const vx = vv.x * S2M, vy = vv.y * S2M + 1.3;
            V.burst({ x: vx, y: vy, z: 0.4, count: 20, color: 0xff9a30, color2: 0xff2a00, shape: 'soft', size: [0.08, 0.16], size1: 0.03, speed: [1, 3.5], life: [0.25, 0.5], drag: 0.9, gravity: -3, intensity: 1.3 });
            V.burst({ x: vx, y: vy, z: 0.4, count: 14, color: 0x3a3436, additive: false, shape: 'smoke', size: [0.18, 0.3], size1: 0.5, speed: [0.5, 1.5], dir: Math.PI / 2, spread: 0.8, life: [0.5, 0.9], gravity: -0.8, alpha: 0.5, intensity: 1 });
            embers(V, vx, vy, 22, 5, 0.4);
            V.flash({ x: vx, y: vy, color: 0xff8a2a, size: 1.3, life: 0.14, intensity: 2 });
            V.light({ x: vx, y: vy, z: 1.2, color: 0xff7a1a, intensity: 10, life: 0.3 });
            sfx(ctx, 'fire_impact');
          } else if (e.fx === 'spin') {
            V.ring({ x, y, z: 0.4, color: 0xffa050, r0: 0.2, r1: 1.6, life: 0.3, thick: 0.1, intensity: 1.8 });
            embers(V, x, y, 24, 6, 0.4);
            sfx(ctx, 'throw_slam');
          }
          break;
        }
        if (e.str === 'H' || e.str === 'S') {
          embers(V, x, y, 14, 4, 0.45);
          flare(ctx, 0.35);
        }
        if (F.mv === 'crH' || F.mv === 'fH') {
          const gx = fx + face * 1.0;
          dust(V, gx, 14, 1.3, 0.3); rocks(V, gx, 0.1, 8, 5);
          if (F.mv === 'crH') crackDecal(ctx, gx, 0.6, 1.0);
          sfx(ctx, 'earth_impact');
        }
        break;
      }
      case 'swing': {
        if (e.str === 'H') { flare(ctx, 0.3); }
        if (e.id === 'crH' || e.id === 'fH') { const st = bk(ctx); if (st) st.jet = 0.08; }
        break;
      }
      case 'jump': dust(V, fx, 10, 1.2, 0.3); break;
      case 'land': dust(V, fx, 16, 1.5, 0.34); V.shake(0.035, 0.12); break;
      case 'dash': case 'rushdash': { const st = bk(ctx); if (st) st.jet = 0.12; flare(ctx, 0.5); dust(V, fx - face * 0.3, 8, 1.0, 0.28); break; }
      case 'release': {
        if (e.id === 'colossus') { const vv = ctx.G.fighters[e.v]; dust(V, vv.x * S2M, 18, 1.4, 0.36); rocks(V, vv.x * S2M, 0.2, 12, 6); }
        break;
      }
    }
  },

  buffFx: {
    bastion(F, b, ctx) {
      const st = bk(ctx);
      if (st) st.flare = Math.max(st.flare, 0.9);
      const V = ctx.vfx, x = F.x * ctx.S2M, y = F.y * ctx.S2M;
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        V.particle({ x: x + Math.cos(a) * 0.55, y: y + 0.2 + Math.random() * 1.9, z: Math.sin(a) * 0.3, color: C.ember, shape: 'spark', size: 0.035, size1: 0, life: 0.6, speed: 1.2, dir: Math.PI / 2, spread: 0.4, stretch: 0.6, intensity: 2.4 });
      }
      if (Math.random() < 0.35) V.particle({ x: x + (Math.random() - 0.5) * 0.9, y: y + 0.1, z: 0.15, color: 0xff7a2a, shape: 'soft', size: 0.22, size1: 0.05, life: 0.7, speed: 0.9, dir: Math.PI / 2, spread: 0.2, alpha: 0.35, intensity: 1.4 });
      if (b.t % 24 === 0) V.ring({ x, y: y + 0.04, z: 0, color: 0xff9a40, r0: 0.4, r1: 1.0, life: 0.4, thick: 0.08, axis: 'y', intensity: 1.6 });
    },
    armor(F, b, ctx) {
      const st = bk(ctx);
      if (!st) return;
      if (b.v < st.armorV) {
        const V = ctx.vfx, x = F.x * ctx.S2M, y = F.y * ctx.S2M + 1.3;
        V.burst({ x, y, z: 0.4, count: 26, color: 0xffc070, color2: 0xff6020, shape: 'shard', speed: [2, 6], life: [0.2, 0.4], size: [0.03, 0.06], drag: 0.88, intensity: 2.2 });
        V.ring({ x, y, z: 0.4, color: 0xffa040, r0: 0.4, r1: 1.4, life: 0.25, thick: 0.1, intensity: 2.6 });
        st.flare = Math.max(st.flare, 1.2);
        sfx(ctx, 'armor');
      }
      st.armorV = b.v;
      if (b.v > 0 && Math.random() < 0.25) {
        const V = ctx.vfx, x = F.x * ctx.S2M + (Math.random() - 0.5) * 0.8, y = F.y * ctx.S2M + 0.4 + Math.random() * 1.6;
        V.particle({ x, y, z: 0.35, color: 0xffd090, shape: 'star', size: 0.07, size1: 0, life: 0.25, speed: 0.1, intensity: 2 });
      }
    },
  },
};
