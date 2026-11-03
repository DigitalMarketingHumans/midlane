// Ysolde — hooded dusk assassin in layered black and crimson leathers. Half-mask,
// burning crimson eyes in the hood's shadow, a long trailing scarf, split coat-tail,
// wrapped forearms and twin sickles whose inner edges glow. Her shadow doubles are
// pooled, fully rigged copies of the same model in shadow materials.
import * as THREE from 'three';
import { part, G3, MatSet } from '../toon.js';
import { Ribbon } from '../cloth.js';
import { Rig, DEFAULT_DIMS } from '../rig.js';
import { merge, scalePose, lerpPose, ease } from '../anim.js';
import { HEROES } from '../../sim/heroes/index.js';

const S = 0.92;
const DIMS = { hipW: 0.09, shoulderW: 0.178, upper: 0.29, fore: 0.28, thigh: 0.48, shin: 0.47, neck: 0.42 };
const ND = Object.assign({}, DEFAULT_DIMS, DIMS);
const S2M = 1 / 10000;
const YAW = Math.PI / 2 - 0.36;

const C = {
  black: 0x1d1823, leather: 0x302838, leather2: 0x45384d, hood: 0x3a2d45, hoodIn: 0x120c16, crimson: 0xa3162f, crimsonD: 0x6e0f22,
  crimsonL: 0xd8264a, wrap: 0x968a9a, wrapD: 0x625868, face: 0x0a070c, steel: 0x3a3c46, steelL: 0x868c9c,
  buckle: 0xb08c5c, glow: 0xff2a4a, eye: 0xff3355, smoke: 0x2a1a2c,
};

// ---------------------------------------------------------------------------
// Model
function buildModel({ rig, ms, s }) {
  const M = {
    black: ms.toon(C.black), lea: ms.toon(C.leather), lea2: ms.toon(C.leather2), crim: ms.toon(C.crimson),
    crimD: ms.toon(C.crimsonD), crimL: ms.toon(C.crimsonL), wrap: ms.toon(C.wrap), wrapD: ms.toon(C.wrapD),
    face: ms.toon(C.face), steel: ms.toon(C.steel), steelL: ms.toon(C.steelL), buckle: ms.toon(C.buckle),
    hood: ms.toon(C.hood, { side: THREE.DoubleSide, unique: true }), hood2: ms.toon(C.hood),
    mask: ms.toon(C.crimsonD, { side: THREE.DoubleSide, unique: true }),
  };
  const eyeGlow = ms.glow(C.eye, 3.0);
  const edgeGlow = ms.glow(C.glow, 2.4);
  const add = (parent, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    m.position.set(x * s, y * s, z * s); m.rotation.set(rx, ry, rz); m.scale.multiplyScalar(s); parent.add(m); return m;
  };
  const so = { smoothOutline: true };

  // --- Pelvis, belt, sash, front flap
  const H = rig.hips;
  add(H, part(G3.ellip(0.145, 0.12, 0.115), M.lea, ms), 0, 0, 0);
  add(H, part(G3.cyl(0.152, 0.144, 0.055, 18), M.lea2, ms), 0, 0.075, 0);
  add(H, part(G3.torus(0.15, 0.017, 6, 24), M.crim, ms), 0, 0.045, 0, Math.PI / 2 + 0.14, 0, 0);
  add(H, part(G3.ellip(0.036, 0.03, 0.03), M.crim, ms), 0.11, 0.035, 0.1);
  add(H, part(G3.box(0.032, 0.17, 0.012), M.crimD, ms, so), 0.12, -0.06, 0.105, 0.12, 0, 0.18);
  add(H, part(G3.box(0.05, 0.036, 0.02), M.buckle, ms, so), 0, 0.078, 0.152);
  add(H, part(G3.box(0.12, 0.18, 0.014), M.crimD, ms, so), 0, -0.11, 0.118, 0.14, 0, 0);
  add(H, part(G3.box(0.1, 0.012, 0.016), M.crimL, ms, so), 0, -0.19, 0.13, 0.14, 0, 0);
  add(H, part(G3.box(0.06, 0.07, 0.045), M.lea2, ms, so), -0.145, 0.02, 0.03, 0, 0, 0.12);
  add(H, part(G3.box(0.06, 0.06, 0.04), M.lea2, ms, so), -0.1, 0.02, -0.12, 0, 0.6, 0.1);

  // --- Torso: slim waist, layered leather, crimson cross-straps, collar & scarf wrap
  add(H, part(G3.limb(0.112, 0.108, 0.16), M.lea, ms), 0, 0.2, 0);
  const Ch = rig.chest;
  add(Ch, part(G3.ellip(0.158, 0.165, 0.112), M.lea, ms), 0, 0.07, 0);
  add(Ch, part(G3.ellip(0.148, 0.105, 0.118), M.lea2, ms), 0, 0.115, 0.012);
  add(Ch, part(G3.ellip(0.128, 0.065, 0.112), M.lea2, ms), 0, -0.035, 0.01);
  for (const sg of [-1, 1]) add(Ch, part(G3.box(0.026, 0.33, 0.012), M.crim, ms, so), 0, 0.06, 0.122, -0.06, 0, sg * 0.55);
  add(Ch, part(G3.cyl(0.024, 0.024, 0.014, 12), M.buckle, ms), 0, 0.06, 0.13, Math.PI / 2, 0, 0);
  for (const sg of [-1, 1]) add(Ch, part(G3.box(0.026, 0.3, 0.012), M.crimD, ms, so), 0, 0.06, -0.112, 0.06, 0, sg * 0.55);
  add(Ch, part(G3.cyl(0.085, 0.112, 0.08, 16), M.lea, ms), 0, 0.245, 0);
  add(Ch, part(G3.torus(0.092, 0.04, 8, 20), M.crim, ms), 0, 0.272, 0.006, Math.PI / 2 - 0.16, 0, 0);
  add(Ch, part(G3.torus(0.074, 0.03, 8, 20), M.crimL, ms), 0, 0.318, 0.0, Math.PI / 2 + 0.12, 0, 0.18);
  add(Ch, part(G3.ellip(0.055, 0.048, 0.042), M.crim, ms), -0.025, 0.262, -0.105);

  // --- Head: shadowed face, burning eyes, half-mask, deep pointed hood + capelet
  const Hd = rig.head;
  add(Hd, part(G3.ellip(0.088, 0.106, 0.096), M.face, ms), 0, -0.004, 0.004);
  for (const sg of [-1, 1]) add(Hd, part(G3.ellip(0.03, 0.011, 0.012), eyeGlow, null, { outline: false }), sg * 0.037, 0.026, 0.088, 0, sg * 0.32, sg * -0.24);
  const maskGeo = new THREE.SphereGeometry(1, 18, 10, Math.PI / 2 - 1.3, 2.6, Math.PI * 0.52, Math.PI * 0.42);
  maskGeo.scale(0.1, 0.116, 0.108);
  add(Hd, part(maskGeo, M.mask, ms), 0, -0.004, 0.006);
  add(Hd, part(G3.box(0.006, 0.07, 0.014), M.crimL, ms), 0, -0.052, 0.106, -0.22, 0, 0);
  const hoodGeo = new THREE.SphereGeometry(1, 26, 16, Math.PI / 2 + 0.66, Math.PI * 2 - 1.32, 0, Math.PI * 0.8);
  hoodGeo.scale(0.152, 0.17, 0.158);
  add(Hd, part(hoodGeo, M.hood, ms), 0, 0.034, -0.012);
  add(Hd, part(G3.cone(0.1, 0.2, 14), M.hood2, ms), 0, 0.13, -0.075, -1.05, 0, 0);
  add(Hd, part(G3.cone(0.075, 0.24, 12), M.hood2, ms), 0, -0.04, -0.15, -2.15, 0, 0);
  const rim = part(G3.torus(0.104, 0.011, 6, 26, Math.PI * 1.46), M.crim, ms);
  rim.scale.set(1, 1.3, 1);
  add(Hd, rim, 0, 0.03, 0.098, -0.18, 0, -Math.PI * 0.23);
  add(Hd, part(G3.ellip(0.12, 0.03, 0.06), M.hood2, ms), 0, 0.135, 0.07, 0.35, 0, 0);
  // capelet over the shoulders
  const cape = part(G3.lathe([[0.06, 0.08], [0.11, 0.05], [0.2, -0.04], [0.26, -0.13], [0.262, -0.15]], 22), M.hood, ms);
  cape.scale.set(1, 1, 0.82);
  add(rig.chest, cape, 0, 0.27, -0.01);

  // --- Arms: leather sleeves, small shoulder caps, wrapped forearms
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? 1 : -1;
    const ua = rig.seg['ua' + sd], fa = rig.seg['fa' + sd];
    add(ua, part(G3.limb(0.048, 0.042, ND.upper - 0.06), M.lea, ms), 0, -ND.upper / 2, 0);
    add(ua, part(G3.ellip(0.066, 0.056, 0.068), M.lea2, ms), sg * 0.01, -0.012, 0);
    add(ua, part(G3.torus(0.05, 0.01, 6, 16), M.crim, ms), 0, -0.065, 0, Math.PI / 2, 0, 0);
    add(fa, part(G3.limb(0.046, 0.037, ND.fore - 0.05), M.wrap, ms), 0, -ND.fore / 2, 0);
    for (let i = 0; i < 4; i++) add(fa, part(G3.torus(0.045 - i * 0.0025, 0.0085, 5, 14), M.wrapD, ms), 0, -0.045 - i * 0.055, 0, Math.PI / 2 + 0.28, 0, 0);
    add(rig.hand[sd], part(G3.ellip(0.04, 0.047, 0.044), M.wrapD, ms), 0, 0, 0);
  }
  add(rig.seg.uaL, part(G3.ellip(0.085, 0.04, 0.085), M.lea2, ms), 0.025, 0.012, 0, 0, 0, 0.35);
  add(rig.seg.uaL, part(G3.torus(0.07, 0.009, 5, 16, Math.PI), M.crimL, ms), 0.03, 0.0, 0, 0, Math.PI / 2, 0.35);

  // --- Legs: leggings, crimson garter, soft wrapped boots
  for (const sd of ['L', 'R']) {
    const th = rig.seg['th' + sd], sh = rig.seg['sh' + sd];
    add(th, part(G3.limb(0.073, 0.057, ND.thigh - 0.08), M.lea, ms), 0, -ND.thigh / 2, 0);
    add(th, part(G3.torus(0.066, 0.012, 6, 16), M.crim, ms), 0, -ND.thigh * 0.42, 0, Math.PI / 2, 0, 0);
    add(sh, part(G3.limb(0.058, 0.046, ND.shin - 0.05), M.black, ms), 0, -ND.shin / 2, 0);
    add(sh, part(G3.cyl(0.066, 0.058, 0.06, 14), M.lea2, ms), 0, -0.04, 0);
    for (let i = 0; i < 3; i++) add(sh, part(G3.torus(0.054, 0.008, 5, 14), M.wrap, ms), 0, -0.15 - i * 0.075, 0, Math.PI / 2 - 0.22, 0, 0);
    add(rig.foot[sd], part(G3.ellip(0.047, 0.045, 0.125), M.black, ms), 0, -0.03, 0.05);
    add(rig.foot[sd], part(G3.cone(0.03, 0.08, 8), M.black, ms), 0, -0.04, 0.17, Math.PI / 2, 0, 0);
  }
  add(rig.seg.thR, part(G3.box(0.034, 0.17, 0.022), M.lea2, ms, so), -0.072, -0.17, 0.03, 0, 0, 0.08);
  add(rig.seg.thR, part(G3.cyl(0.012, 0.012, 0.06, 6), M.steel, ms), -0.072, -0.05, 0.03);

  // --- Twin sickles. Hand local +Y = haft, +Z = blade/leading edge.
  const kamas = {};
  for (const sd of ['L', 'R']) {
    const k = kama(ms, M, edgeGlow);
    k.g.scale.setScalar(s);
    rig.hand[sd].add(k.g);
    kamas[sd] = k;
  }

  // --- Cloth: long two-tailed scarf + split coat-tail
  const scarfMat = ms.toon(C.crimson, { side: THREE.DoubleSide, unique: true });
  const scarf2Mat = ms.toon(C.crimsonD, { side: THREE.DoubleSide, unique: true });
  const tailMat = ms.toon(C.crimsonD, { side: THREE.DoubleSide, unique: true });
  const scarf = new Ribbon({ segs: 12, len: 1.32 * s, width: 0.2 * s, taper: 0.5, mat: scarfMat, drag: 0.91, gravity: 5.5 });
  const scarf2 = new Ribbon({ segs: 9, len: 0.95 * s, width: 0.15 * s, taper: 0.45, mat: scarf2Mat, drag: 0.89, gravity: 6.5 });
  const tailL = new Ribbon({ segs: 6, len: 0.6 * s, width: 0.14 * s, taper: 0.7, mat: tailMat, drag: 0.9, gravity: 8 });
  const tailR = new Ribbon({ segs: 6, len: 0.6 * s, width: 0.14 * s, taper: 0.7, mat: tailMat, drag: 0.9, gravity: 8 });
  for (const r of [scarf, scarf2, tailL, tailR]) r.mesh.userData.ribbon = true;
  return {
    trails: [
      { tip: kamas.R.tip, base: kamas.R.base, color: 0xff3a55, n: 12 },
      { tip: kamas.L.tip, base: kamas.L.base, color: 0xff2a4a, n: 12 },
    ],
    ribbons: [
      { r: scarf, body: 'chest', offset: [0.02 * s, 0.27 * s, -0.115 * s] },
      { r: scarf2, body: 'chest', offset: [-0.045 * s, 0.255 * s, -0.112 * s], z: -0.012 },
      { r: tailL, body: 'hips', offset: [0.07 * s, 0.03 * s, -0.118 * s] },
      { r: tailR, body: 'hips', offset: [-0.07 * s, 0.03 * s, -0.118 * s] },
    ],
    glowColor: C.glow,
    mats: { eye: eyeGlow, edge: edgeGlow },
    kamas,
  };
}

function kama(ms, M, edgeGlow) {
  const g = new THREE.Group();
  const a = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  a(part(G3.cyl(0.016, 0.019, 0.34, 8), M.black, ms), 0, 0.1, 0);
  for (let i = 0; i < 4; i++) a(part(G3.torus(0.019, 0.005, 4, 10), M.wrapD, ms), 0, -0.03 + i * 0.07, 0, Math.PI / 2, 0, 0);
  a(part(G3.sphere(0.024, 10, 8), M.steel, ms), 0, -0.085, 0);
  a(part(G3.cone(0.017, 0.1, 6), M.crim, ms), 0, -0.145, 0, Math.PI, 0, 0);
  a(part(G3.box(0.03, 0.055, 0.05), M.steel, ms, { smoothOutline: true }), 0, 0.28, 0.0);
  const blade = [[0, 0.255], [0, 0.312], [0.08, 0.334], [0.16, 0.322], [0.235, 0.282], [0.3, 0.188], [0.255, 0.226], [0.18, 0.257], [0.1, 0.266], [0.03, 0.259]];
  a(part(G3.extrude(blade, 0.008, 0.002), M.steelL, ms), 0, 0, 0, 0, -Math.PI / 2, 0);
  const edge = [[0.02, 0.238], [0.1, 0.246], [0.18, 0.236], [0.25, 0.206], [0.305, 0.184], [0.255, 0.228], [0.18, 0.259], [0.1, 0.268], [0.03, 0.261]];
  a(part(G3.extrude(edge, 0.016, 0), edgeGlow, null, { outline: false }), 0, 0, 0, 0, -Math.PI / 2, 0);
  a(part(G3.cone(0.012, 0.075, 5), M.steel, ms), 0, 0.29, -0.045, -Math.PI / 2, 0, 0);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.19, 0.3); g.add(tip);
  const base = new THREE.Object3D(); base.position.set(0, 0.3, 0.03); g.add(base);
  return { g, tip, base };
}

const _wp = new THREE.Vector3();
// Per-frame material animation, piggy-backed on rig.apply (called once per frame).
function installHook(rig, ex) {
  const apply0 = rig.apply.bind(rig);
  let t = Math.random() * 10, k = 0;
  rig.apply = (P) => {
    apply0(P);
    t += 1 / 60;
    const on = rig._sd > 0 ? 1 : 0;
    if (rig._sd > 0) rig._sd--;
    k += (on - k) * 0.18;
    const e = ex.mats.edge, y = ex.mats.eye;
    e.color.copy(e.userData.base).multiplyScalar(1 + 0.12 * Math.sin(t * 2.7) + k * (1.1 + 0.5 * Math.sin(t * 17)));
    y.color.copy(y.userData.base).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.3) + k * 0.6);
    // ambient shadow wisps curling off her heels and hood (vfx handle stashed by onEvent)
    const V = rig._vfx;
    if (V && Math.random() < 0.22) {
      const n = Math.random() < 0.7 ? (Math.random() < 0.5 ? rig.foot.L : rig.foot.R) : rig.head;
      n.getWorldPosition(_wp);
      V.particle({ x: _wp.x + (Math.random() - 0.5) * 0.15, y: _wp.y + 0.05, z: _wp.z, color: C.smoke, additive: false, shape: 'smoke', size: 0.12, size1: 0.3, life: 0.7, speed: 0.35, dir: Math.PI / 2, spread: 0.6, gravity: -0.4, alpha: 0.35, intensity: 1 });
    }
  };
}

// ---------------------------------------------------------------------------
// Pose library (nominal 1.9 m scale; FighterView scales by S)
const POSES = {
  stance: { root: [0, 0.8, 0], lean: 20, twist: -28, hipTwist: -16, head: [-12, 22],
    hL: [0.48, 1.13, -0.12], wL: 62, hR: [0.06, 0.92, 0.27], wR: -112,
    fL: [0.36, 0, -0.1], fR: [-0.32, 0, 0.15, 0, -30], kR: [0.1, 0, 1] },
  crouch: { root: [0.02, 0.52, 0], lean: 30, twist: -22, hipTwist: -12, head: [-26, 18],
    hL: [0.52, 0.8, -0.1], wL: 40, hR: [0.16, 0.6, 0.26], wR: -150,
    fL: [0.4, 0, -0.15], fR: [-0.33, 0, 0.18, 0, -25] },
  jumpUp: { root: [0, 1.0, 0], lean: 10, head: [-10, 0], hL: [0.3, 1.34, -0.22], wL: 120, hR: [0.0, 1.2, 0.28], wR: -60,
    fL: [0.14, 0.42, -0.1, 30], fR: [-0.16, 0.26, 0.12, 20] },
  jumpTuck: { root: [0, 0.95, 0], lean: 26, hL: [0.32, 1.12, -0.2], wL: 160, hR: [0.24, 1.08, 0.24], wR: 170, fL: [0.25, 0.58, -0.1, 20], fR: [0.08, 0.52, 0.1, 20] },
  fall: { root: [0, 0.98, 0], lean: 8, head: [-6, 0], hL: [0.36, 1.25, -0.2], wL: 70, hR: [0.04, 1.12, 0.3], wR: -90,
    fL: [0.2, 0.24, -0.12], fR: [-0.12, 0.36, 0.12, 20] },
  walk: { stride: 0.3, lift: 0.1, bob: 0.03 },
  dash: { root: [0.12, 0.64, 0], lean: 44, twist: -6, head: [-34, 0], hL: [-0.12, 0.98, -0.28], wL: 205, hR: [-0.22, 0.92, 0.3], wR: 200,
    fL: [0.36, 0.06, -0.12], fR: [-0.42, 0.22, 0.12, -40] },
  bdash: { root: [-0.08, 0.62, 0], lean: 18, head: [-10, 0], hL: [0.42, 0.96, -0.15], wL: 40, hR: [0.15, 0.8, 0.28], wR: -120,
    fL: [0.42, 0.06, -0.14], fR: [-0.2, 0, 0.16] },
  blockHigh: { root: [-0.04, 0.8, 0], lean: 10, twist: -14, head: [8, 0], hL: [0.3, 1.44, -0.06], wL: 105, hR: [0.26, 1.38, 0.14], wR: 78,
    eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.3, 0, -0.12], fR: [-0.3, 0, 0.15] },
  blockLow: { root: [-0.04, 0.52, 0], lean: 16, twist: -14, head: [6, 0], hL: [0.32, 1.0, -0.06], wL: 100, hR: [0.28, 0.94, 0.14], wR: 80,
    eL: [0, -1, 0.2], eR: [0, -1, 0.2], fL: [0.34, 0, -0.16], fR: [-0.3, 0, 0.17] },
  intro: { root: [0, 0.42, 0], lean: 34, head: [34, 0], hL: [0.18, 0.5, -0.3], wL: -160, hR: [0.3, 0.46, 0.26], wR: -150,
    fL: [0.3, 0, -0.14], fR: [-0.3, 0, 0.17, 0, 0], kR: [0, -1, 0.25] },
  win: { root: [0, 0.9, 0], lean: -4, twist: 24, hipTwist: 10, head: [-8, -14, 8], hL: [0.1, 0.98, -0.3], wL: -105,
    hR: [0.32, 1.78, 0.18], wR: 96, fL: [0.14, 0, -0.12], fR: [-0.14, 0, 0.15, 0, -20] },
  throwReach: { root: [0.1, 0.8, 0], lean: 18, hL: [0.6, 1.3, -0.12], wL: 110, hR: [0.58, 1.26, 0.14], wR: 70, fL: [0.34, 0, -0.12], fR: [-0.24, 0, 0.14] },
  throwWhiff: { root: [0.1, 0.8, 0], lean: 22, hL: [0.5, 1.15, -0.14], wL: 40, hR: [0.48, 1.1, 0.16], wR: 30, fL: [0.32, 0, -0.12], fR: [-0.22, 0, 0.14] },
};

// --- Move timelines ---------------------------------------------------------
const ST = POSES.stance;
const MOVES = {
  stL: [[0, 'stance'],
    ['s-2', { twist: -18, hL: [0.36, 1.2, -0.1], wL: 100 }, 'io'],
    ['s', { root: [0.08, 0.8, 0], lean: 24, twist: -46, head: [-10, 40], hL: [0.66, 1.15, -0.04], wL: 64 }, 'snap'],
    ['a+2', { root: [0.08, 0.8, 0], lean: 24, twist: -46, head: [-10, 40], hL: [0.63, 1.13, -0.04], wL: 54 }],
    ['e', 'stance', 'io']],
  stM: [[0, 'stance'],
    ['s-3', { twist: -52, lean: 14, hR: [-0.2, 1.2, 0.3], wR: 150, hL: [0.3, 1.0, -0.22], wL: 20 }, 'io'],
    ['s', { root: [0.1, 0.8, 0], twist: 28, lean: 24, head: [-10, -10], hR: [0.62, 1.2, 0.1], wR: 58, hL: [0.12, 0.98, -0.26], wL: -60 }, 'snap'],
    ['a+2', { root: [0.1, 0.8, 0], twist: 38, lean: 26, head: [-10, -14], hR: [0.56, 1.0, -0.06], wR: 4, hL: [0.1, 0.96, -0.26], wL: -60 }],
    ['e', 'stance', 'io']],
  stH: [[0, 'stance'],
    ['s-4', { root: [-0.04, 0.84, 0], lean: -6, twist: -8, head: [-18, 10], hL: [0.04, 1.74, -0.12], wL: 145, hR: [-0.02, 1.7, 0.2], wR: 155, fL: [0.3, 0, -0.1] }, 'io'],
    ['s', { root: [0.2, 0.74, 0], lean: 30, twist: 6, head: [-10, 6], hL: [0.74, 1.18, 0.0], wL: 24, hR: [0.7, 1.24, 0.04], wR: 38, fL: [0.54, 0, -0.1], fR: [-0.3, 0, 0.16, 0, -30] }, 'snap'],
    ['a+3', { root: [0.2, 0.72, 0], lean: 36, twist: 12, head: [-6, 6], hL: [0.56, 0.74, 0.16], wL: -55, hR: [0.52, 0.7, -0.14], wR: -45, fL: [0.54, 0, -0.1], fR: [-0.3, 0, 0.16, 0, -30] }],
    ['e', 'stance', 'io']],
  crL: [[0, 'crouch'],
    ['s-2', { hL: [0.4, 0.52, -0.08], wL: 60 }],
    ['s', { root: [0.1, 0.48, 0], lean: 44, twist: -36, head: [-34, 30], hL: [0.64, 0.32, -0.04], wL: -8, fL: [0.48, 0, -0.14] }, 'snap'],
    ['a+2', { root: [0.1, 0.48, 0], lean: 44, twist: -36, head: [-34, 30], hL: [0.62, 0.3, -0.04], wL: -14, fL: [0.48, 0, -0.14] }],
    ['e', 'crouch']],
  crM: [[0, 'crouch'],
    ['s-3', { twist: -40, hR: [-0.14, 0.52, 0.32], wR: 190 }],
    ['s', { root: [0.16, 0.46, 0], lean: 46, twist: 26, head: [-36, -6], hR: [0.82, 0.32, 0.06], wR: 2, hL: [0.1, 0.62, -0.28], wL: 150, fL: [0.6, 0, -0.14], fR: [-0.34, 0, 0.18, 0, -25] }, 'snap'],
    ['a+3', { root: [0.16, 0.46, 0], lean: 46, twist: 30, head: [-36, -6], hR: [0.8, 0.3, 0.0], wR: -6, hL: [0.1, 0.62, -0.28], wL: 150, fL: [0.6, 0, -0.14], fR: [-0.34, 0, 0.18, 0, -25] }],
    ['e', 'crouch', 'io']],
  crH: [[0, 'crouch'],
    ['s-3', { root: [0, 0.44, 0], twist: -60, lean: 24, hL: [-0.1, 0.5, -0.3], wL: 200, hR: [-0.2, 0.48, 0.32], wR: 200 }, 'io'],
    ['s', { root: [0.2, 0.34, 0], lean: 44, twist: 34, head: [-36, -10], hL: [0.92, 0.2, -0.1], wL: -2, hR: [0.5, 0.24, 0.3], wR: -16, fL: [0.98, 0.04, -0.04, -10], fR: [-0.32, 0, 0.2, 0, -20], kL: [0.3, 0.4, 1] }, 'snap'],
    ['a+4', { root: [0.2, 0.34, 0], lean: 44, twist: 52, head: [-36, -16], hL: [0.76, 0.2, -0.34], wL: -40, hR: [0.56, 0.22, 0.22], wR: -10, fL: [0.88, 0.04, -0.26, -10], fR: [-0.32, 0, 0.2, 0, -20] }],
    ['e', 'crouch', 'io']],
  jL: [[0, 'fall'],
    ['s', { lean: 20, twist: -30, hL: [0.6, 0.86, -0.06], wL: 10, fL: [0.24, 0.42, -0.1] }, 'snap'],
    ['a', { lean: 20, twist: -30, hL: [0.58, 0.82, -0.06], wL: 0, fL: [0.24, 0.42, -0.1] }], ['e', 'fall']],
  jM: [[0, 'fall'],
    ['s-2', { twist: -40, hR: [-0.1, 1.4, 0.28], wR: 140 }],
    ['s', { lean: 24, twist: 24, hR: [0.66, 0.84, 0.08], wR: 6, hL: [0.1, 1.2, -0.25], wL: 130 }, 'snap'],
    ['a', { lean: 24, twist: 30, hR: [0.6, 0.62, 0.0], wR: -40, hL: [0.1, 1.2, -0.25], wL: 130 }], ['e', 'fall']],
  jH: [[0, 'fall'],
    ['s-4', { lean: -10, head: [-20, 0], hL: [0.1, 1.72, -0.14], wL: 150, hR: [0.02, 1.7, 0.2], wR: 160, fL: [0.24, 0.5, -0.1], fR: [0.0, 0.44, 0.1] }],
    ['s', { lean: 30, head: [10, 0], hL: [0.42, 0.62, 0.06], wL: -70, hR: [0.12, 0.6, -0.04], wR: -110, fL: [0.24, 0.42, -0.1], fR: [-0.06, 0.32, 0.1] }, 'snap'],
    ['a', { lean: 32, head: [12, 0], hL: [0.4, 0.5, 0.08], wL: -90, hR: [0.06, 0.52, -0.06], wR: -125, fL: [0.24, 0.42, -0.1], fR: [-0.06, 0.32, 0.1] }], ['e', 'fall']],
  fM: [[0, 'stance'],
    [3, { root: [0.0, 0.62, 0], lean: 30, hL: [0.3, 0.8, -0.2], wL: 160, hR: [0.1, 0.78, 0.26], wR: 170 }, 'io'],
    [9, { root: [0.04, 0.96, 0], lean: -14, head: [-22, 0], hL: [0.0, 1.85, -0.14], wL: 140, hR: [-0.06, 1.8, 0.18], wR: 150, fL: [0.24, 0.36, -0.1, 20], fR: [-0.14, 0.3, 0.12, 10] }, 'io'],
    ['s', { root: [0.14, 0.8, 0], lean: 34, head: [-8, 0], hL: [0.74, 1.12, -0.02], wL: 30, hR: [0.68, 1.06, 0.12], wR: 20, fL: [0.4, 0.04, -0.1], fR: [-0.22, 0.04, 0.14] }, 'snap'],
    ['a+2', { root: [0.14, 0.66, 0], lean: 40, head: [-4, 0], hL: [0.62, 0.72, -0.02], wL: -40, hR: [0.58, 0.66, 0.12], wR: -50, fL: [0.42, 0, -0.12], fR: [-0.26, 0, 0.15] }],
    ['e', 'stance', 'io']],
  throw: [[0, 'stance'], ['s', { root: [0.12, 0.8, 0], lean: 18, hL: [0.6, 1.3, -0.12], wL: 110, hR: [0.58, 1.26, 0.14], wR: 70 }, 'snap'], ['e', 'throwWhiff']],
  Q: [[0, 'stance'],
    [6, { root: [-0.04, 0.6, 0], lean: 26, twist: -40, head: [-20, 30], hR: [-0.25, 0.6, 0.3], wR: 200, hL: [0.3, 0.9, -0.2], wL: 60 }, 'io'],
    ['s', { root: [0.24, 0.5, 0], lean: 50, twist: 22, head: [-40, 0], hR: [0.72, 0.24, 0.12], wR: 0, hL: [-0.2, 0.86, -0.3], wL: 205, fL: [0.62, 0.02, -0.12], fR: [-0.5, 0.14, 0.14, -50] }, 'snap'],
    ['a', { root: [0.24, 0.48, 0], lean: 50, twist: 30, head: [-40, 0], hR: [0.66, 0.2, -0.06], wR: -20, hL: [-0.2, 0.86, -0.3], wL: 205, fL: [0.62, 0.02, -0.12], fR: [-0.5, 0.14, 0.14, -50] }],
    ['a+6', { root: [0.1, 0.56, 0], lean: 34, twist: 30, hR: [0.5, 0.42, -0.1], wR: -60, hL: [0.1, 0.9, -0.3], wL: 120, fL: [0.42, 0, -0.14], fR: [-0.34, 0, 0.16] }, 'io'],
    ['e', 'stance', 'io']],
  W: [[0, 'stance'],
    [4, { root: [0, 0.52, 0], lean: 30, head: [-24, 0], hL: [0.36, 0.62, -0.14], wL: 30, hR: [0.12, 0.5, 0.28], wR: -150, fL: [0.34, 0, -0.14], fR: [-0.28, 0, 0.16] }, 'io'],
    ['s', { root: [0.04, 0.98, 0], lean: -10, head: [-34, 0], hL: [0.42, 1.92, -0.1], wL: 84, hR: [0.0, 1.0, 0.3], wR: -80, fL: [0.16, 0.34, -0.1, 30], fR: [-0.1, 0.06, 0.12, 10] }, 'snap'],
    [11, { root: [0.04, 1.0, 0], lean: -14, head: [-36, 0], hL: [0.3, 2.0, -0.1], wL: 100, hR: [0.0, 1.1, 0.3], wR: -80, fL: [0.16, 0.4, -0.1, 30], fR: [-0.1, 0.2, 0.12, 10] }],
    [14, { root: [0, 0.98, 0], lean: 20, spin: 0, hL: [0.3, 1.22, -0.2], wL: 170, hR: [0.24, 1.18, 0.24], wR: 175, fL: [0.25, 0.6, -0.1, 20], fR: [0.08, 0.54, 0.1, 20] }, 'io'],
    [20, { root: [0, 0.98, 0], lean: 20, spin: 330, hL: [0.3, 1.22, -0.2], wL: 170, hR: [0.24, 1.18, 0.24], wR: 175, fL: [0.25, 0.6, -0.1, 20], fR: [0.08, 0.54, 0.1, 20] }, 'io'],
    [22, { root: [0.06, 0.98, 0], lean: 30, spin: 360, head: [8, 0], hL: [0.52, 0.66, 0.04], wL: -62, hR: [0.3, 0.6, -0.04], wR: -95, fL: [0.24, 0.42, -0.1], fR: [-0.06, 0.32, 0.1] }, 'snap'],
    [31, { root: [0.06, 0.98, 0], lean: 34, spin: 360, head: [10, 0], hL: [0.5, 0.56, 0.06], wL: -80, hR: [0.26, 0.54, -0.06], wR: -110, fL: [0.24, 0.4, -0.1], fR: [-0.06, 0.3, 0.1] }],
    ['e', 'fall']],
  E: [[0, 'stance'],
    [2, { root: [-0.04, 0.66, 0], lean: 14, head: [-20, 0], hL: [0.3, 1.1, -0.2], wL: 120, hR: [0.1, 1.0, 0.26], wR: 140, fL: [0.3, 0, -0.12], fR: [-0.28, 0, 0.15] }, 'snap'],
    [6, { root: [0, 0.98, 0], lean: 20, spin: -120, hL: [0.3, 1.12, -0.2], wL: 160, hR: [0.24, 1.08, 0.24], wR: 170, fL: [0.25, 0.58, -0.1, 20], fR: [0.08, 0.52, 0.1, 20] }, 'lin'],
    [14, { root: [0, 0.98, 0], lean: 20, spin: -330, hL: [0.3, 1.12, -0.2], wL: 160, hR: [0.24, 1.08, 0.24], wR: 170, fL: [0.25, 0.58, -0.1, 20], fR: [0.08, 0.52, 0.1, 20] }, 'lin'],
    [17, { root: [0, 0.96, 0], lean: 10, spin: -360, hL: [0.38, 1.2, -0.2], wL: 70, hR: [0.04, 1.1, 0.3], wR: -90, fL: [0.2, 0.2, -0.12], fR: [-0.12, 0.3, 0.12, 20] }, 'out'],
    ['e', 'stance', 'io']],
  R: [[0, 'stance'],
    ['s-3', { root: [-0.06, 0.6, 0], lean: 30, twist: -20, head: [-28, 0], hL: [0.2, 0.8, -0.24], wL: 190, hR: [0.0, 0.7, 0.28], wR: 195, fL: [0.36, 0, -0.14], fR: [-0.36, 0, 0.17] }, 'io'],
    ['s', { root: [0.22, 0.62, 0], lean: 46, twist: 0, head: [-40, 0], hL: [0.76, 0.98, -0.1], wL: 18, hR: [-0.3, 0.84, 0.3], wR: 205, fL: [0.6, 0.04, -0.12], fR: [-0.54, 0.22, 0.12, -50] }, 'snap'],
    ['a', { root: [0.22, 0.62, 0], lean: 46, twist: 0, head: [-40, 0], hL: [0.76, 0.98, -0.1], wL: 18, hR: [-0.3, 0.84, 0.3], wR: 205, fL: [0.6, 0.04, -0.12], fR: [-0.54, 0.22, 0.12, -50] }],
    ['e', 'stance', 'io']],
};

// --- Locks -------------------------------------------------------------------
function shadowsTimelines() {
  const L = HEROES.ysolde.locks.shadows;
  const SH = { first: 16, every: 7, n: 12, vanish: 100, fin: 110, dur: L.dur };
  const dashP = MOVES.R[2][1];
  const kneel = { root: [0.02, 0.42, 0], lean: 28, twist: -10, head: [22, -6], hL: [0.6, 0.66, -0.36], wL: -8, hR: [-0.18, 0.6, 0.44], wR: 196,
    fL: [0.34, 0, -0.16], fR: [-0.3, 0, 0.18, 0, 0], kR: [0, -1, 0.3] };
  const coil = { root: [0, 0.5, 0], lean: 34, twist: -20, head: [-30, 10], hL: [0.2, 0.52, -0.2], wL: -150, hR: [0.1, 0.46, 0.26], wR: -155,
    fL: [0.38, 0, -0.15], fR: [-0.32, 0, 0.18, 0, -20] };
  const rise = { root: [0.08, 1.0, 0], lean: -12, head: [-36, 0], hL: [0.42, 1.95, -0.1], wL: 96, hR: [0.34, 1.98, 0.16], wR: 84,
    fL: [0.12, 0.4, -0.1, 30], fR: [-0.12, 0.2, 0.12, 20] };
  const cross = { root: [0.06, 1.0, 0], lean: -6, head: [-26, 0], hL: [0.24, 2.0, 0.12], wL: 128, hR: [0.3, 1.98, -0.1], wR: 60,
    fL: [0.14, 0.36, -0.1, 30], fR: [-0.1, 0.26, 0.12, 20] };
  const atk = [[0, dashP], [5, Object.assign({}, dashP, { root: [0.3, 0.58, 0] })], [8, kneel, 'snap'],
    [SH.vanish - 10, Object.assign({}, kneel, { head: [26, -10], root: [0.02, 0.4, 0] }), 'io'],
    [SH.vanish, kneel], [SH.vanish + 1, coil, 'snap'], [SH.fin - 3, Object.assign({}, coil, { root: [-0.02, 0.44, 0], lean: 40 }), 'io'],
    [SH.fin, rise, 'snap'], [SH.fin + 8, cross, 'out'], [SH.dur, Object.assign({}, cross, { lean: 4 }), 'io']];
  const vic = [[0, 'hitHigh'], [6, 'hitMid']];
  for (let k = 0; k < SH.n; k++) vic.push([SH.first + SH.every * k, k % 2 ? 'hitHigh' : 'hitMid', 'snap']);
  vic.push([SH.fin - 1, 'hitMid'], [SH.fin, 'airHit', 'snap'], [SH.dur, 'airHit']);
  return { atk, vic, camZ: 6.2, orbit: 0.3 };
}

// ---------------------------------------------------------------------------
// Shadow doubles (pooled, animated copies of the model in shadow materials)
function shadeColor(hex) {
  const c = new THREE.Color(hex);
  const l = (c.r + c.g + c.b) / 3;
  return new THREE.Color(0x10060e).lerp(new THREE.Color(0x3a0f22), Math.min(1, l * 1.6)).getHex();
}

class Shade {
  constructor(vfx) {
    const dims = Object.assign({}, ND);
    for (const k in dims) dims[k] *= S;
    this.rig = new Rig(dims);
    const ms = new MatSet(0xff1a44, 0.014);
    const toon0 = MatSet.prototype.toon;
    ms.toon = function (color, opts = {}) {
      return toon0.call(this, shadeColor(color), Object.assign({}, opts, { emissive: 0x30040f, ei: 1, transparent: true }));
    };
    this.ms = ms;
    this.ex = buildModel({ rig: this.rig, ms, s: S });
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.drop = new THREE.Group();
    this.mirror = new THREE.Group();
    this.yaw = new THREE.Group();
    this.pivot = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.tilt); this.tilt.add(this.drop); this.drop.add(this.mirror); this.mirror.add(this.yaw);
    this.yaw.add(this.pivot); this.pivot.add(this.body); this.body.add(this.rig.root);
    this.yaw.rotation.y = YAW;
    this.pivot.position.y = 1.0 * S; this.body.position.y = -1.0 * S;
    for (const rb of this.ex.ribbons) { this.rig.root.add(rb.r.mesh); rb.g0 = rb.r.o.gravity; rb.r.o.gravity = 0; }
    this.root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    this.trails = this.ex.trails.map((t) => vfx.makeTrail(t.color, 10));
    this.vfx = vfx;
    this.until = -1;
    this.holder = null;
    this.t = 0;
    this.setOpacity(0);
  }
  setOpacity(o) {
    this.ms.setOpacity(Math.max(0.001, o));
    for (const g of this.ms.glows) { g.transparent = true; g.opacity = o; }
    this.root.visible = o > 0.01;
  }
  pose(P, dt = 1 / 60, fwdSpeed = 0) {
    this.rig.apply(P);
    this.pivot.rotation.x = ((P.spin || 0) * Math.PI) / 180;
    this.root.updateMatrixWorld(true);
    this.t += dt;
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), rq = new THREE.Quaternion();
    // gravity in world space, expressed in the (possibly rolled/flipped) rig frame
    this.rig.root.getWorldQuaternion(rq);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rq.clone().invert());
    for (const rb of this.ex.ribbons) {
      const accel = new THREE.Vector3(Math.sin(this.t * 9.3) * (0.6 + fwdSpeed * 2.5), 0, -fwdSpeed * 9 - 0.8).addScaledVector(down, rb.g0 || 8);
      const node = rb.body === 'hips' ? this.rig.hips : this.rig.chest;
      v.set(rb.offset[0], rb.offset[1], rb.offset[2]);
      node.localToWorld(v); this.rig.root.worldToLocal(v);
      const anchor = v.clone();
      node.getWorldQuaternion(q); this.rig.root.getWorldQuaternion(rq); q.premultiply(rq.invert());
      const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const push = rb.z || 0;
      rb.r.update(anchor, accel, dt, (p, i) => {
        const d = (p.x - anchor.x) * nrm.x + (p.y - anchor.y) * nrm.y + (p.z - anchor.z) * nrm.z;
        const lim = -0.025 - i * 0.006 + push;
        if (d > lim) p.addScaledVector(nrm, lim - d);
      }, side);
    }
  }
  feed(on) {
    const tip = new THREE.Vector3(), base = new THREE.Vector3();
    this.ex.trails.forEach((t, i) => {
      t.tip.getWorldPosition(tip); t.base.getWorldPosition(base);
      this.trails[i].mesh.visible = true;
      this.vfx.feedTrail(this.trails[i], tip, base, on);
    });
  }
  release() {
    this.until = -1;
    for (const rb of this.ex.ribbons) rb.r.init = false;
    if (this.holder) { this.holder.remove(this.root); this.holder = null; }
    for (const tr of this.trails) { tr.hist.length = 0; tr.mesh.visible = false; }
    this.setOpacity(0);
  }
}

// Holder whose traverse() does not descend, so vfx/ent cleanup never disposes the
// pooled shade's shared geometry and materials.
function holder() {
  const g = new THREE.Group();
  g.traverse = function (cb) { cb(this); };
  return g;
}

function shadePool(ctx) {
  const v = ctx.view;
  if (!v._ysShades) v._ysShades = [];
  return v._ysShades;
}
function warmShades(ctx, n) {
  const pool = shadePool(ctx);
  while (pool.length < n) { const sh = new Shade(ctx.vfx); for (const t of sh.trails) t.mesh.visible = false; pool.push(sh); }
}
function acquireShade(ctx, life) {
  const pool = shadePool(ctx);
  let sh = pool.find((p) => ctx.time > p.until);
  if (!sh) {
    if (pool.length >= 6) { sh = pool.reduce((a, b) => (a.until < b.until ? a : b)); }
    else { sh = new Shade(ctx.vfx); pool.push(sh); }
  }
  sh.release();
  sh.until = ctx.time + life + 0.05;
  return sh;
}

function resolvePose(ref) {
  const p = typeof ref === 'string' ? POSES[ref] : merge(ST, ref);
  return scalePose(p.root ? p : merge(ST, p), S);
}

// ---------------------------------------------------------------------------
// VFX helpers
function bladeTips(ctx) {
  const v = ctx.view; const out = [];
  if (!v || !v.trails) return out;
  for (const t of v.trails) { const p = new THREE.Vector3(); t.tip.getWorldPosition(p); out.push(p); }
  return out;
}
function smoke(V, x, y, z, n = 14, size = 0.35, spread = 0.4) {
  V.burst({ x, y, z, count: n, color: C.smoke, additive: false, shape: 'smoke', size: [size * 0.6, size], size1: size * 1.8, speed: [0.3, 1.4], life: [0.35, 0.7], drag: 0.9, gravity: -0.6, alpha: 0.75, intensity: 1, jx: spread, jy: spread * 0.8 });
  V.burst({ x, y, z: z + 0.05, count: Math.ceil(n / 2), color: C.glow, shape: 'soft', size: [0.04, 0.08], size1: 0, speed: [0.6, 2.2], life: [0.25, 0.5], drag: 0.9, gravity: -1, jx: spread * 0.6, jy: spread * 0.6, intensity: 2 });
}
// Tapered crescent "sickle slash" mesh (additive), arc bulging toward `ang`, its
// midpoint passing through (x, y).
function crescentGeo(r, th, arc, n = 26) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = -arc / 2 + arc * u;
    const w = th * Math.pow(Math.sin(Math.PI * u), 0.8);
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r - w), Math.sin(a) * (r - w), 0);
    if (i < n) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function slashArc(V, x, y, ang, r, o = {}) {
  const g = new THREE.Group();
  const th = o.thick ?? r * 0.16, arc = o.arc ?? 2.0;
  const geo = crescentGeo(r, th, arc);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? C.glow).multiplyScalar(o.intensity ?? 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0d8).multiplyScalar(1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m1 = new THREE.Mesh(geo, mat);
  const m2 = new THREE.Mesh(crescentGeo(r - th * 0.15, th * 0.35, arc * 0.8), hot);
  g.add(m1, m2);
  g.rotation.z = ang;
  g.position.set(x - Math.cos(ang) * r, y - Math.sin(ang) * r, o.z ?? 0.45);
  g.renderOrder = 24;
  const life = o.life ?? 0.2, grow = o.grow ?? 0.18;
  return V.custom(g, life, (obj, u) => {
    const k = 1 - u;
    obj.scale.setScalar(1 + grow * Math.sqrt(u));
    mat.opacity = k * k; hot.opacity = Math.max(0, 1 - u * 2.2);
  });
}
// Crimson energy column (no white core), rising and thinning out.
function column(V, x, y, h, r, life) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, 0);
  return V.custom(m, life, (obj, u) => {
    const k = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
    obj.scale.set(r * (0.4 + 0.6 * k), h, r * (0.4 + 0.6 * k));
    mat.opacity = k * 0.55; obj.rotation.y += 0.08;
  });
}
// Straight variant kept for long dash streaks (thin, crimson, no white core).
function streak(V, x0, y0, x1, y1, o = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? C.glow).multiplyScalar(o.intensity ?? 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, o.z ?? 0.3);
  m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  const w = o.width ?? 0.08;
  return V.custom(m, o.life ?? 0.25, (obj, u) => { obj.scale.set(len * (0.6 + 0.4 * Math.min(1, u * 5)), w * (1 - u), 1); mat.opacity = 1 - u; });
}
function play(ctx, n) { if (ctx.audio && ctx.audio.play) ctx.audio.play(n); }

// Thousand Shadows: one shadow double dashes through the victim from direction `n`.
const CLONE_DIRS = [160, 18, 118, 236, 302, 62, 196, 338, 140, 40, 252, 100];
function cloneStrike(ctx, e) {
  const V = ctx.vfx;
  const vic = ctx.G.fighters[1 - e.p];
  const cx = vic.x * S2M, cy = vic.y * S2M + 1.0;
  const from = (CLONE_DIRS[e.n % CLONE_DIRS.length] * Math.PI) / 180;
  const dirX = -Math.cos(from), dirY = -Math.sin(from);       // travel direction
  const face = dirX >= 0 ? 1 : -1;
  const roll = Math.max(-1.1, Math.min(1.1, Math.atan2(dirY, Math.abs(dirX))));
  const z = (e.n % 3 - 1) * 0.35;
  const R0 = 1.7, life = 0.3, cross = 0.38;
  const sh = acquireShade(ctx, life);
  const h = holder();
  h.add(sh.root);
  sh.holder = h;
  sh.tilt.rotation.z = roll * face;
  sh.mirror.scale.x = face;
  sh.drop.position.y = -0.95 * S;
  const pA = resolvePose({ root: [0.2, 0.7, 0], lean: 40, head: [-30, 0], hL: [0.5, 1.12, -0.16], wL: 120, hR: [0.42, 1.06, 0.2], wR: 130, fL: [0.4, 0.2, -0.1], fR: [-0.46, 0.34, 0.12, -40] });
  const pB = resolvePose({ root: [0.24, 0.66, 0], lean: 46, head: [-36, 0], hL: [0.42, 0.66, 0.1], wL: -70, hR: [-0.36, 0.86, 0.3], wR: 205, fL: [0.44, 0.24, -0.1], fR: [-0.52, 0.36, 0.12, -40] });
  h.position.set(cx - dirX * R0, cy - dirY * R0, z);
  h.updateMatrixWorld(true);
  for (let i = 0; i < 14; i++) sh.pose(pA, 1 / 60, 2.2);   // settle the cloth in world gravity
  let slashed = false;
  V.custom(h, life, (obj, u, dt) => {
    if (sh.holder !== h) return;          // shade was released or re-acquired elsewhere
    const k = u < cross ? -1 + u / cross : (u - cross) / (1 - cross);
    const dist = k * R0;
    h.position.set(cx + dirX * dist, cy + dirY * dist, z);
    const a = u < 0.12 ? u / 0.12 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
    sh.setOpacity(a * 0.95);
    const pose = lerpPose(pA, pB, ease.snap(Math.max(0, Math.min(1, (u - cross + 0.12) / 0.2))));
    sh.pose(pose, dt, 2.2);
    sh.feed(u > cross - 0.15 && u < cross + 0.25);
    if (!slashed && u >= cross) {
      slashed = true;
      const ta = Math.atan2(dirY, dirX);
      slashArc(V, cx, cy, ta + Math.PI / 2 * face, 0.95, { thick: 0.11, arc: 2.2, life: 0.22, z: z * 0.5 + 0.4, intensity: 1.7 });
    }
    if (u > 0.96) sh.release();
  });
  smoke(V, cx - dirX * R0, cy - dirY * R0, z, 8, 0.3, 0.25);
  V.burst({ x: cx - dirX * R0 * 0.5, y: cy - dirY * R0 * 0.5, z, count: 8, color: C.glow, shape: 'spark', speed: [4, 9], dir: Math.atan2(dirY, dirX), spread: 0.15, size: [0.025, 0.04], life: [0.12, 0.22], stretch: 2, intensity: 1.2 });
}

// ---------------------------------------------------------------------------
export default {
  id: 'ysolde',
  scale: S,
  dims: DIMS,
  outline: 0x0a0509,
  glowColor: C.glow,
  flip: true,
  wDefaults: {
    kd: { L: 175, R: 190 }, dead: { L: 170, R: 185 }, airHit: { L: 140, R: 160 }, held: { L: -70, R: -80 },
    hitHigh: { L: 120, R: -60 }, hitMid: { L: -40, R: -100 }, hitLow: { L: 30, R: -140 }, jsq: { L: 40, R: -130 },
    land: { L: 40, R: -130 }, rise: { L: 60, R: -110 }, tech: { L: 80, R: -90 }, dispel: { L: 100, R: 80 }, cast: { L: 90, R: 80 },
  },
  build(ctx) {
    const ex = buildModel(ctx);
    installHook(ctx.rig, ex);
    return ex;
  },
  poses: POSES,
  moves: MOVES,
  noTrail: ['throw'],
  trailLock(F, G) {
    const K = G.lock;
    if (!K || K.id !== 'shadows') return false;
    return K.af <= 7 || (K.af >= 106 && K.af <= 118);
  },
  locks: {
    throw: {
      atk: [[0, 'throwReach'],
        [6, { root: [0.04, 0.82, 0], lean: 6, hL: [0.44, 1.42, -0.14], wL: 150, hR: [0.42, 1.38, 0.16], wR: 30 }, 'io'],
        [10, { root: [0.1, 0.86, 0], lean: 20, hL: [0.34, 1.3, -0.14], wL: 160, hR: [0.32, 1.26, 0.16], wR: 20, fL: [0.36, 0.56, -0.06, -40] }, 'snap'],
        [18, { root: [0.02, 0.84, 0], lean: 4, hL: [0.36, 1.36, -0.14], wL: 150, hR: [0.34, 1.3, 0.16], wR: 30 }, 'io'],
        [24, { root: [-0.04, 0.96, 0], lean: -28, head: [-10, 0], hL: [-0.12, 1.24, -0.32], wL: 200, hR: [-0.16, 1.16, 0.32], wR: 200, fL: [0.66, 1.0, -0.06, -60], fR: [-0.1, 0, 0.14] }, 'snap'],
        [30, { root: [-0.04, 0.9, 0], lean: -20, hL: [-0.1, 1.2, -0.32], wL: 200, hR: [-0.14, 1.12, 0.32], wR: 200, fL: [0.5, 0.7, -0.06, -40], fR: [-0.1, 0, 0.14] }],
        [36, 'stance', 'io']],
      vic: [[0, 'held'], [10, 'hitMid', 'snap'], [16, 'held'], [24, 'airHit', 'snap'], [36, 'airHit']],
    },
    shadows: shadowsTimelines(),
  },
  ents: {
    clone: {
      build(ctx, e) {
        const h = holder();
        const sh = acquireShade(ctx, (e.life || 44) / 60 + 0.4);
        h.add(sh.root); sh.holder = h;
        sh.tilt.rotation.z = 0; sh.mirror.scale.x = 1; sh.drop.position.y = 0;
        h.userData.sh = sh;
        h.userData.pA = resolvePose({ root: [0, 0.56, 0], lean: 30, twist: -30, head: [-20, 20], hL: [0.06, 1.34, 0.2], wL: 150, hR: [0.1, 1.3, -0.18], wR: 160, fL: [0.36, 0, -0.15], fR: [-0.3, 0, 0.17] });
        h.userData.pB = resolvePose({ root: [0.12, 0.62, 0], lean: 36, twist: 20, head: [-24, 0], hL: [0.66, 0.9, -0.36], wL: -30, hR: [0.6, 0.86, 0.4], wR: -40, fL: [0.44, 0, -0.15], fR: [-0.3, 0, 0.17] });
        h.updateMatrixWorld(true);
        for (let i = 0; i < 14; i++) sh.pose(h.userData.pA);
        return h;
      },
      update(obj, e, ctx) {
        const sh = obj.userData.sh;
        if (!sh || sh.holder !== obj) return;
        const age = e.age;
        const a = age < 6 ? age / 6 : age > 34 ? Math.max(0, (44 - age) / 10) : 1;
        sh.setOpacity(a * 0.92);
        const u = Math.max(0, Math.min(1, (age - 21) / 4));
        const pose = lerpPose(obj.userData.pA, obj.userData.pB, ease.snap(u));
        sh.pose(pose, ctx.dt || 1 / 60, 0);
        sh.feed(age >= 20 && age <= 27);
        if (age >= 24 && !obj.userData.slashed) {
          obj.userData.slashed = true;
          const x = e.x * S2M + e.face * 0.35, y = 1.0;
          const fc = e.face;
          slashArc(ctx.vfx, x, y + 0.1, fc > 0 ? 0.55 : Math.PI - 0.55, 0.85, { thick: 0.13, arc: 2.3, life: 0.24 });
          slashArc(ctx.vfx, x, y - 0.1, fc > 0 ? -0.55 : Math.PI + 0.55, 0.85, { thick: 0.13, arc: 2.3, life: 0.24 });
          play(ctx, 'whiff_blade');
        }
        if (Math.random() < 0.5) ctx.vfx.particle({ x: e.x * S2M + (Math.random() - 0.5) * 0.5, y: Math.random() * 1.6, z: 0.1, color: C.smoke, additive: false, shape: 'smoke', size: 0.22, size1: 0.4, life: 0.5, speed: 0.4, dir: Math.PI / 2, spread: 0.6, alpha: 0.5 * a, intensity: 1 });
      },
      end(obj, e, ctx) {
        const sh = obj.userData.sh;
        smoke(ctx.vfx, e.x * S2M, 0.9, 0.1, 16, 0.4, 0.4);
        if (sh && sh.holder === obj) sh.release();
      },
    },
  },
  buffFx: {
    shadowdance(F, b, ctx) {
      const v = ctx.view;
      if (v) v.rig._sd = 3;
      if (Math.random() < 0.6) {
        for (const p of bladeTips(ctx)) {
          if (Math.random() < 0.5) continue;
          ctx.vfx.particle({ x: p.x, y: p.y, z: p.z, color: C.glow, shape: 'soft', size: 0.07, size1: 0, life: 0.35, speed: 0.4, dir: Math.PI / 2, spread: 0.8, intensity: 2.2 });
        }
        ctx.vfx.particle({ x: F.x * S2M + (Math.random() - 0.5) * 0.5, y: F.y * S2M + 0.1 + Math.random() * 0.4, z: 0.1, color: C.smoke, additive: false, shape: 'smoke', size: 0.2, size1: 0.45, life: 0.5, speed: 0.5, dir: Math.PI / 2, spread: 0.5, alpha: 0.55, intensity: 1 });
      }
    },
  },
  onEvent(e, ctx) {
    const V = ctx.vfx;
    const G = ctx.G;
    const F = G.fighters[e.p];
    if (ctx.view && ctx.view.rig) ctx.view.rig._vfx = V;
    const fx = F.x * S2M, fy = F.y * S2M;
    switch (e.t) {
      case 'swing': play(ctx, 'whiff_blade'); break;
      case 'dash': case 'rushdash': case 'bdash':
        smoke(V, fx - F.face * 0.2 * (e.dir || 1), fy + 0.4, 0, 10, 0.3, 0.3);
        break;
      case 'cast': {
        play(ctx, 'shadow_cast');
        if (e.s === 'Q') {
          smoke(V, fx - F.face * 0.3, fy + 0.5, 0, 14, 0.35, 0.3);
          V.ring({ x: fx, y: fy + 0.5, z: 0.2, color: C.glow, r0: 0.1, r1: 0.9, life: 0.22, axis: 'x', thick: 0.08 });
        } else if (e.s === 'W') {
          V.burst({ x: fx, y: fy + 0.1, count: 20, color: C.glow, shape: 'spark', dir: Math.PI / 2, spread: 0.5, speed: [3, 7], size: [0.03, 0.05], life: [0.15, 0.3], stretch: 1.5 });
          smoke(V, fx, fy + 0.15, 0, 12, 0.35, 0.35);
        } else if (e.s === 'E') {
          warmShades(ctx, 1);
          smoke(V, fx + F.face * 0.3, fy + 0.9, 0.1, 22, 0.45, 0.45);
          V.flash({ x: fx, y: fy + 1.0, color: C.glow, size: 1.5, life: 0.14, intensity: 1.5 });
        } else if (e.s === 'R') {
          warmShades(ctx, 4);
        }
        break;
      }
      case 'ult': {
        V.flash({ x: fx + F.face * 0.05, y: fy + 1.55, color: C.eye, size: 1.2, life: 0.6, grow: true });
        smoke(V, fx, fy + 0.8, 0, 30, 0.5, 0.6);
        play(ctx, 'shadow_cast');
        break;
      }
      case 'cine': {
        switch (e.k) {
          case 'ys_sd': ctx.view._sdHit = 1; break;
          case 'ys_clone': cloneStrike(ctx, e); play(ctx, 'whiff_blade'); break;
          case 'ys_through': {
            const x = e.x * S2M;
            streak(V, x - F.face * 0.4, fy + 0.95, x + F.face * 2.1, fy + 0.95, { width: 0.1, life: 0.3 });
            streak(V, x - F.face * 0.2, fy + 0.7, x + F.face * 1.9, fy + 0.72, { width: 0.05, life: 0.22, intensity: 1.2 });
            smoke(V, x, fy + 0.8, 0, 18, 0.4, 0.5);
            play(ctx, 'teleport');
            break;
          }
          case 'ys_blink': {
            const dest = e.vx * S2M - F.face * 0.94;
            smoke(V, e.x * S2M, 0.8, 0, 22, 0.45, 0.45);
            smoke(V, dest, 0.6, 0, 22, 0.45, 0.45);
            V.flash({ x: dest, y: 0.8, color: C.glow, size: 1.2, life: 0.12, intensity: 1.6 });
            play(ctx, 'teleport');
            break;
          }
          case 'ys_rise': {
            const x = e.x * S2M, y = e.y * S2M + 1.0;
            V.burst({ x, y, count: 40, color: C.glow, color2: 0xffffff, shape: 'soft', speed: [-6, -2], size: [0.05, 0.1], size1: 0, life: [0.2, 0.3], jx: 1.4, jy: 1.2, drag: 0.85 });
            V.ring({ x, y, z: 0.4, color: C.glow, r0: 1.8, r1: 0.1, life: 0.25, thick: 0.1 });
            V.light({ x, y, color: C.glow, intensity: 8, life: 0.4 });
            break;
          }
        }
        break;
      }
      case 'hit': case 'block': {
        const x = e.x * S2M, y = e.y * S2M;
        const big = e.str === 'U' ? 1.4 : e.str === 'H' || e.str === 'S' ? 1 : e.str === 'M' ? 0.75 : 0.55;
        if (e.t === 'hit') {
          play(ctx, e.type === 'm' ? 'shadow_impact' : 'hit_blade');
          const tilt = (((e.f * 0.618) % 1) - 0.5) * 1.2;
          if (!e.lock) slashArc(V, x, y, (F.face > 0 ? 0 : Math.PI) + tilt + Math.PI / 2, 0.35 + 0.3 * big, { thick: 0.05 + 0.04 * big, arc: 1.9, life: 0.15, intensity: 1.5 });
          V.burst({ x, y, z: 0.4, count: Math.round(6 + 8 * big), color: C.smoke, additive: false, shape: 'smoke', size: [0.15, 0.3], size1: 0.5, speed: [0.5, 2], life: [0.25, 0.5], alpha: 0.6, intensity: 1 });
        }
        if (ctx.view._sdHit) {
          ctx.view._sdHit = 0;
          V.ring({ x, y, z: 0.5, color: 0xff5070, r0: 0.1, r1: 1.1, life: 0.24, thick: 0.08, intensity: 2.2 });
          V.burst({ x, y, z: 0.45, count: 18, color: C.glow, shape: 'star', speed: [2, 6], size: [0.05, 0.1], life: [0.2, 0.4], drag: 0.88, intensity: 1.6 });
          slashArc(V, x, y, F.face > 0 ? -1.0 : Math.PI + 1.0, 0.7, { thick: 0.1, arc: 2.0, life: 0.2, color: 0xff6080 });
        }
        if (e.fx === 'ys_cross') {
          slashArc(V, x, y, Math.PI / 2 - 0.5, 1.5, { thick: 0.22, arc: 2.4, life: 0.45, intensity: 2.2, grow: 0.3 });
          slashArc(V, x, y, Math.PI / 2 + 0.5, 1.5, { thick: 0.22, arc: 2.4, life: 0.45, intensity: 2.2, grow: 0.3 });
          column(V, x, 0, 5.5, 0.42, 0.5);
          V.burst({ x, y, count: 60, color: C.glow, color2: 0xffb0c0, shape: 'spark', speed: [4, 13], size: [0.03, 0.06], life: [0.25, 0.6], drag: 0.9, stretch: 1.6, intensity: 1.4 });
          smoke(V, x, y - 0.5, 0, 30, 0.6, 0.8);
          V.light({ x, y, color: C.glow, intensity: 14, life: 0.5, distance: 8 });
          V.shake(0.22, 0.4);
          play(ctx, 'ult_impact');
        }
        break;
      }
      case 'spawn':
        if (e.k === 'ysolde.clone') smoke(V, e.x * S2M, 0.9, 0.1, 20, 0.45, 0.45);
        break;
    }
  },
};
