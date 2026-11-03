// Kaida — tall glacier berserker: pale braided hair, bone circlet, heavy fur mantle,
// an ice-crystal pauldron, slate leathers, frost-rune tattoos and a two-handed
// greataxe whose head is glowing glacial crystal.
import * as THREE from 'three';
import { part, G3 } from '../toon.js';
import { Ribbon } from '../cloth.js';
import { DEFAULT_DIMS } from '../rig.js';
import { HEROES } from '../../sim/heroes/index.js';
import { QUAKE } from '../../sim/heroes/kaida.js';

const S = 1.04;
const DIMS = { hipW: 0.112, shoulderW: 0.215, spine: 0.31, upper: 0.31, fore: 0.3, thigh: 0.47, shin: 0.46, neck: 0.43 };
const ND = Object.assign({}, DEFAULT_DIMS, DIMS);
const S2M = 1 / 10000;
const D2R = Math.PI / 180;

const C = {
  slate: 0x3a4757, slateD: 0x262f3b, leather: 0x5a4636, leatherD: 0x3a2d24, fur: 0xd6cfc1, furS: 0xb0a694, furD: 0x857a69,
  skin: 0xe2b69c, lip: 0xb9786c, hair: 0xb3d5ee, hairS: 0x84b0d6, bone: 0xefe5cf, ice: 0x7fd2f8, iceD: 0x3a92c4,
  wood: 0x4e3828, metal: 0x96a2b0, metalD: 0x5c6672, glow: 0x7fe0ff, rune: 0x8fe8ff, eye: 0x9ff0ff, mist: 0xcff6ff,
};

// ---------------------------------------------------------------------------
function braidTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 128);
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    x.fillStyle = '#9fb4c8';
    x.beginPath(); x.moveTo(0, y); x.lineTo(16, y + 10); x.lineTo(16, y + 13); x.lineTo(0, y + 4); x.fill();
    x.beginPath(); x.moveTo(32, y + 8); x.lineTo(16, y + 18); x.lineTo(16, y + 21); x.lineTo(32, y + 12); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildModel({ rig, ms, s }) {
  const M = {
    slate: ms.toon(C.slate), slateD: ms.toon(C.slateD), lea: ms.toon(C.leather), leaD: ms.toon(C.leatherD),
    fur: ms.toon(C.fur), furS: ms.toon(C.furS), furD: ms.toon(C.furD), skin: ms.toon(C.skin), lip: ms.toon(C.lip),
    hair: ms.toon(C.hair), hairS: ms.toon(C.hairS), bone: ms.toon(C.bone), wood: ms.toon(C.wood), metal: ms.toon(C.metal), metalD: ms.toon(C.metalD),
    ice: ms.toon(C.ice, { emissive: 0x15607f, ei: 0.55 }), iceD: ms.toon(C.iceD, { emissive: 0x0b3550, ei: 0.5 }),
  };
  const glow = ms.glow(C.glow, 1.7);
  const rune = ms.glow(C.rune, 1.8);
  const eye = ms.glow(C.eye, 2.0);
  const add = (parent, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    m.position.set(x * s, y * s, z * s); m.rotation.set(rx, ry, rz); m.scale.multiplyScalar(s); parent.add(m); return m;
  };
  const so = { smoothOutline: true };
  const tuft = (parent, mat, x, y, z, r, rx = 0, ry = 0, rz = 0, sy = 1.25) => {
    const m = part(G3.ellip(r, r * sy, r * 0.85, 10, 8), mat, ms);
    return add(parent, m, x, y, z, rx, ry, rz);
  };

  // --- Pelvis: wide belt, bone buckle, layered tassets, fur skirt
  const H = rig.hips;
  add(H, part(G3.ellip(0.17, 0.13, 0.13), M.slateD, ms), 0, 0, 0);
  add(H, part(G3.cyl(0.178, 0.17, 0.08, 18), M.lea, ms), 0, 0.075, 0);
  add(H, part(G3.cyl(0.05, 0.05, 0.02, 14), M.bone, ms), 0, 0.075, 0.178, Math.PI / 2, 0, 0);
  add(H, part(G3.cyl(0.02, 0.02, 0.024, 6), glow, null, { outline: false }), 0, 0.075, 0.186, Math.PI / 2, 0, 0);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.3;
    const front = Math.cos(a) > 0.6;
    if (front) continue;
    tuft(H, i % 2 ? M.fur : M.furS, Math.sin(a) * 0.16, -0.07, Math.cos(a) * 0.15, 0.065, Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3, 1.7);
  }
  for (const sg of [-1, 1]) {
    add(H, part(G3.box(0.12, 0.2, 0.025), M.lea, ms, so), sg * 0.085, -0.1, 0.13, 0.18, sg * 0.25, 0);
    add(H, part(G3.box(0.1, 0.03, 0.03), M.metalD, ms, so), sg * 0.085, -0.02, 0.15, 0.18, sg * 0.25, 0);
  }
  add(H, part(G3.box(0.12, 0.26, 0.02), M.leaD, ms, so), 0, -0.13, 0.152, 0.14, 0, 0);

  // --- Torso: muscular waist, leather bodice with layered plates, strap, chest rune
  add(H, part(G3.limb(0.14, 0.135, 0.17), M.slate, ms), 0, 0.2, 0);
  const Ch = rig.chest;
  add(Ch, part(G3.ellip(0.2, 0.19, 0.14), M.slate, ms), 0, 0.07, 0);
  add(Ch, part(G3.ellip(0.185, 0.12, 0.145), M.slateD, ms), 0, 0.12, 0.008);
  add(Ch, part(G3.ellip(0.16, 0.07, 0.135), M.lea, ms), 0, -0.04, 0.01);
  add(Ch, part(G3.box(0.04, 0.46, 0.02), M.leaD, ms, so), 0.0, 0.06, 0.147, -0.05, 0, 0.62);
  add(Ch, part(G3.cyl(0.026, 0.026, 0.02, 10), M.bone, ms), 0.035, 0.1, 0.155, Math.PI / 2, 0, 0);
  const runeChest = new THREE.Group();
  add(Ch, runeChest, 0, 0.13, 0.152, -0.08, 0, 0);
  for (const [x, y, r, l] of [[0, 0, 0, 0.07], [0, 0.0, Math.PI / 2, 0.05], [-0.022, 0.024, 0.7, 0.03], [0.022, 0.024, -0.7, 0.03], [-0.022, -0.024, -0.7, 0.03], [0.022, -0.024, 0.7, 0.03]]) {
    const m = part(G3.box(0.007, l, 0.006), rune, null, { outline: false });
    m.position.set(x, y, 0); m.rotation.z = r; runeChest.add(m);
  }

  // --- Fur mantle: clustered tufts ringing the neck and shoulders
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rx = 0.2, rz = 0.155;
    tuft(Ch, i % 3 === 0 ? M.furS : M.fur, Math.sin(a) * rx, 0.25 + (Math.cos(a) < 0 ? 0.03 : 0), Math.cos(a) * rz, 0.072, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5, 1.1);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    tuft(Ch, M.furD, Math.sin(a) * 0.22, 0.2, Math.cos(a) * 0.17, 0.05, Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6, 1.4);
  }
  tuft(Ch, M.fur, 0, 0.27, -0.16, 0.1, -0.3, 0, 0, 1.2);
  tuft(Ch, M.furS, 0, 0.16, -0.18, 0.09, -0.2, 0, 0, 1.4);

  // --- Head: face, war paint, circlet with crystal, pale hair cap & side locks
  const Hd = rig.head;
  add(Hd, part(G3.ellip(0.085, 0.105, 0.095), M.skin, ms), 0, -0.005, 0.01);
  add(Hd, part(G3.ellip(0.06, 0.045, 0.06), M.skin, ms), 0, -0.07, 0.035);
  add(Hd, part(G3.cone(0.016, 0.045, 6), M.skin, ms), 0, -0.005, 0.105, Math.PI / 2 + 0.3, 0, 0);
  add(Hd, part(G3.box(0.04, 0.008, 0.01), M.lip, ms), 0, -0.058, 0.094);
  for (const sg of [-1, 1]) {
    add(Hd, part(G3.ellip(0.018, 0.009, 0.01), eye, null, { outline: false }), sg * 0.034, 0.018, 0.09, 0, sg * 0.3, 0);
    add(Hd, part(G3.box(0.04, 0.009, 0.012), M.hairS, ms), sg * 0.035, 0.038, 0.09, 0, sg * 0.3, sg * 0.18);
    add(Hd, part(G3.box(0.006, 0.05, 0.006), rune, null, { outline: false }), sg * 0.05, -0.02, 0.08, 0.1, sg * 0.6, sg * 0.1);
    add(Hd, part(G3.box(0.006, 0.04, 0.006), rune, null, { outline: false }), sg * 0.064, -0.016, 0.07, 0.1, sg * 0.8, sg * 0.1);
  }
  add(Hd, part(G3.ellip(0.099, 0.097, 0.097), M.hair, ms), 0, 0.045, -0.045);
  add(Hd, part(G3.ellip(0.09, 0.07, 0.09), M.hairS, ms), 0, -0.02, -0.06);
  add(Hd, part(G3.ellip(0.08, 0.032, 0.05), M.hair, ms), 0, 0.09, 0.045, 0.3, 0, 0);
  for (const sg of [-1, 1]) add(Hd, part(G3.ellip(0.022, 0.1, 0.028), M.hair, ms), sg * 0.085, -0.05, 0.0, 0.1, 0, sg * 0.12);
  add(Hd, part(G3.torus(0.1, 0.011, 6, 28), M.bone, ms), 0, 0.055, 0.005, Math.PI / 2 + 0.12, 0, 0);
  add(Hd, part(G3.cone(0.018, 0.06, 4), M.ice, ms), 0, 0.085, 0.1, -0.15, 0, 0);
  add(Hd, part(G3.cone(0.01, 0.04, 4), glow, null, { outline: false }), 0, 0.083, 0.104, -0.15, 0, 0);
  for (const sg of [-1, 1]) add(Hd, part(G3.cone(0.01, 0.05, 4), M.bone, ms), sg * 0.06, 0.08, 0.075, -0.2, 0, -sg * 0.5);
  add(Hd, part(G3.sphere(0.04, 10, 8), M.hair, ms), 0, 0.02, -0.135);
  add(Hd, part(G3.torus(0.03, 0.01, 6, 12), M.bone, ms), 0, 0.0, -0.15, 0.6, 0, 0);

  // --- Arms: bare upper arms with frost runes; leather bracers with fur cuffs
  const runeMats = [rune];
  for (const sd of ['L', 'R']) {
    const sg = sd === 'L' ? 1 : -1;
    const ua = rig.seg['ua' + sd], fa = rig.seg['fa' + sd];
    add(ua, part(G3.limb(0.066, 0.056, ND.upper - 0.06), M.skin, ms), 0, -ND.upper / 2, 0);
    for (const [y, r, z] of [[-0.09, 0.4, 0.06], [-0.15, -0.4, 0.062], [-0.21, 0.4, 0.058], [-0.12, 0, -0.064]]) {
      add(ua, part(G3.box(0.01, 0.065, 0.006), rune, null, { outline: false }), sg * 0.025, y, z, 0, 0, r);
    }
    add(ua, part(G3.box(0.07, 0.008, 0.008), rune, null, { outline: false }), sg * 0.005, -0.06, 0.06, 0, 0, 0);
    add(fa, part(G3.limb(0.064, 0.05, ND.fore - 0.05), M.lea, ms), 0, -ND.fore / 2, 0);
    for (let i = 0; i < 2; i++) add(fa, part(G3.torus(0.062 - i * 0.006, 0.01, 5, 16), M.metal, ms), 0, -0.12 - i * 0.1, 0, Math.PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; tuft(fa, M.fur, Math.sin(a) * 0.06, -0.025, Math.cos(a) * 0.06, 0.034, 0, 0, 0, 1.1); }
    add(rig.hand[sd], part(G3.ellip(0.052, 0.058, 0.055), M.leaD, ms), 0, 0, 0);
  }
  // left pauldron: leather + fur; right: ice crystal pauldron
  add(rig.seg.uaL, part(G3.ellip(0.1, 0.07, 0.1), M.lea, ms), 0.02, 0.0, 0);
  tuft(rig.seg.uaL, M.fur, 0.05, 0.03, 0, 0.06);
  add(rig.seg.uaR, part(G3.ellip(0.11, 0.075, 0.11), M.slateD, ms), -0.02, 0.0, 0);
  add(rig.seg.uaR, part(G3.ellip(0.115, 0.03, 0.115), M.metalD, ms), -0.02, -0.04, 0);
  for (const [x, y, z, rx, rz, h, r] of [[-0.06, 0.06, 0.0, 0.0, 0.5, 0.2, 0.04], [-0.05, 0.05, 0.06, 0.6, 0.4, 0.15, 0.032], [-0.05, 0.04, -0.06, -0.6, 0.45, 0.16, 0.034], [-0.09, 0.0, 0.03, 0.3, 1.1, 0.13, 0.03], [-0.02, 0.07, 0.03, 0.2, 0.15, 0.11, 0.026], [-0.09, 0.0, -0.04, -0.3, 1.2, 0.12, 0.028]]) {
    add(rig.seg.uaR, part(G3.cone(r * 1.35, h * 1.45, 5), M.ice, ms), x * 1.2, y + h * 0.5, z * 1.2, rx, 0, rz);
    add(rig.seg.uaR, part(G3.cone(r * 0.6, h, 5), glow, null, { outline: false }), x * 1.2, y + h * 0.45, z * 1.2, rx, 0, rz);
  }

  // --- Legs: slate trousers, bone knee guards, fur-trimmed boots
  for (const sd of ['L', 'R']) {
    const th = rig.seg['th' + sd], sh = rig.seg['sh' + sd];
    add(th, part(G3.limb(0.092, 0.072, ND.thigh - 0.08), M.slate, ms), 0, -ND.thigh / 2, 0);
    add(th, part(G3.box(0.03, 0.2, 0.02), M.leaD, ms, so), 0, -0.22, 0.09);
    add(sh, part(G3.limb(0.07, 0.056, ND.shin - 0.05), M.lea, ms), 0, -ND.shin / 2, 0);
    add(sh, part(G3.ellip(0.05, 0.06, 0.035), M.bone, ms), 0, -0.01, 0.06);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; tuft(sh, i % 2 ? M.fur : M.furS, Math.sin(a) * 0.068, -0.17, Math.cos(a) * 0.066, 0.032, 0, 0, 0, 1.3); }
    add(sh, part(G3.torus(0.06, 0.01, 5, 14), M.leaD, ms), 0, -0.3, 0, Math.PI / 2, 0, 0);
    add(rig.foot[sd], part(G3.ellip(0.062, 0.055, 0.14), M.leaD, ms), 0, -0.03, 0.05);
  }

  // --- Greataxe in the right hand. Local +Y = haft (head end), +Z = leading edge.
  const axe = greataxe(ms, M, glow);
  axe.g.scale.setScalar(s);
  rig.hand.R.add(axe.g);

  // --- Braid (textured ribbon) + two short side braids
  const braidMat = ms.toon(C.hair, { side: THREE.DoubleSide, unique: true });
  const tex = braidTexture();
  if (tex) { braidMat.map = tex; braidMat.needsUpdate = true; }
  const braid = new Ribbon({ segs: 11, len: 1.08 * s, width: 0.105 * s, taper: 0.4, mat: braidMat, drag: 0.9, gravity: 8 });
  const capeMat = ms.toon(C.furD, { side: THREE.DoubleSide, unique: true });
  const pelt = new Ribbon({ segs: 6, len: 0.62 * s, width: 0.34 * s, taper: 0.7, mat: capeMat, drag: 0.9, gravity: 9 });
  return {
    trails: [{ tip: axe.tip, base: axe.base, color: 0x8fe8ff, n: 14 }],
    ribbons: [
      { r: pelt, body: 'chest', offset: [0, 0.2 * s, -0.17 * s], z: -0.01 },
      { r: braid, body: 'head', offset: [0, -0.02 * s, -0.15 * s], z: -0.02 },
    ],
    glowColor: C.glow,
    mats: { glow, rune, runeMats, eye },
    axe,
  };
}

function greataxe(ms, M, glow) {
  const g = new THREE.Group();
  const a = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  a(part(G3.cyl(0.024, 0.028, 1.38, 10), M.wood, ms), 0, 0.42, 0);
  for (let i = 0; i < 3; i++) a(part(G3.torus(0.029, 0.007, 5, 12), M.leaD, ms), 0, -0.04 + i * 0.06, 0, Math.PI / 2, 0, 0);
  for (let i = 0; i < 3; i++) a(part(G3.torus(0.028, 0.007, 5, 12), M.leaD, ms), 0, 0.3 + i * 0.06, 0, Math.PI / 2, 0, 0);
  a(part(G3.cone(0.034, 0.1, 6), M.metal, ms), 0, -0.3, 0, Math.PI, 0, 0);
  a(part(G3.cyl(0.034, 0.034, 0.05, 8), M.metal, ms), 0, -0.24, 0);
  a(part(G3.cyl(0.036, 0.032, 0.2, 8), M.metalD, ms), 0, 1.0, 0);
  a(part(G3.box(0.05, 0.16, 0.12), M.metal, ms, { smoothOutline: true }), 0, 1.0, 0.04);
  // glacial bearded crescent (shape x → +Z outward, y → +Y along the haft)
  const blade = [[0.04, 0.86], [0.12, 0.88], [0.22, 0.83], [0.32, 0.76], [0.4, 0.71], [0.47, 0.81], [0.51, 0.95], [0.525, 1.1], [0.495, 1.24], [0.435, 1.36], [0.36, 1.41], [0.28, 1.31], [0.18, 1.19], [0.1, 1.13], [0.04, 1.13]];
  a(part(G3.extrude(blade, 0.03, 0.006), M.ice, ms), 0, 0, 0, 0, -Math.PI / 2, 0);
  const edge = [[0.4, 0.71], [0.47, 0.81], [0.51, 0.95], [0.525, 1.1], [0.495, 1.24], [0.435, 1.36], [0.36, 1.41], [0.405, 1.31], [0.455, 1.215], [0.483, 1.1], [0.47, 0.97], [0.435, 0.85], [0.385, 0.765]];
  a(part(G3.extrude(edge, 0.044, 0), glow, null, { outline: false }), 0, 0, 0, 0, -Math.PI / 2, 0);
  const core = [[0.1, 0.94], [0.2, 0.9], [0.3, 0.86], [0.36, 0.92], [0.38, 1.06], [0.34, 1.2], [0.26, 1.18], [0.16, 1.08], [0.1, 1.06]];
  a(part(G3.extrude(core, 0.038, 0), M.iceD, ms), 0, 0, 0, 0, -Math.PI / 2, 0);
  for (const [y0, y1] of [[0.95, 1.12], [0.99, 1.05]]) a(part(G3.box(0.04, Math.abs(y1 - y0) + 0.01, 0.006), glow, null, { outline: false }), 0, (y0 + y1) / 2, 0.24, 0, 0, 0);
  // back spike + crystal shards
  a(part(G3.cone(0.045, 0.22, 5), M.ice, ms), 0, 1.0, -0.13, -Math.PI / 2 - 0.25, 0, 0);
  a(part(G3.cone(0.022, 0.15, 5), glow, null, { outline: false }), 0, 1.0, -0.11, -Math.PI / 2 - 0.25, 0, 0);
  a(part(G3.cone(0.036, 0.2, 5), M.ice, ms), 0, 1.2, 0.0, -0.1, 0, 0);
  a(part(G3.cone(0.03, 0.15, 5), M.ice, ms), 0.0, 1.36, 0.36, -0.5, 0, 0);
  a(part(G3.cone(0.016, 0.12, 5), glow, null, { outline: false }), 0, 1.18, 0.0, -0.1, 0, 0);
  const tip = new THREE.Object3D(); tip.position.set(0, 1.06, 0.52); g.add(tip);
  const base = new THREE.Object3D(); base.position.set(0, 1.0, 0.12); g.add(base);
  const head = new THREE.Object3D(); head.position.set(0, 1.04, 0.3); g.add(head);
  return { g, tip, base, head };
}

const _wp = new THREE.Vector3();
function installHook(rig, ex) {
  const apply0 = rig.apply.bind(rig);
  let t = Math.random() * 10, k = 0;
  rig.apply = (P) => {
    apply0(P);
    t += 1 / 60;
    const on = rig._fz > 0 ? 1 : 0;
    if (rig._fz > 0) rig._fz--;
    k += (on - k) * 0.12;
    const r = ex.mats.rune, g = ex.mats.glow, e = ex.mats.eye;
    r.color.copy(r.userData.base).multiplyScalar(0.8 + 0.2 * Math.sin(t * 2.1) + k * (1.2 + 0.4 * Math.sin(t * 11)));
    g.color.copy(g.userData.base).multiplyScalar(1 + 0.1 * Math.sin(t * 1.7) + k * 0.6);
    e.color.copy(e.userData.base).multiplyScalar(1 + k * 1.2);
    // ambient frost glinting off the axe head (vfx handle stashed by onEvent)
    const V = rig._vfx;
    if (V && Math.random() < 0.12 + k * 0.3) {
      ex.axe.head.getWorldPosition(_wp);
      V.particle({ x: _wp.x + (Math.random() - 0.5) * 0.4, y: _wp.y + (Math.random() - 0.5) * 0.4, z: _wp.z, color: C.mist, shape: 'star', size: 0.05, size1: 0, life: 0.5, speed: 0.25, gravity: 0.6, intensity: 1.6 });
    }
  };
}

// ---------------------------------------------------------------------------
// Two-handed grip: left hand placed along the haft, k metres from the right hand.
function ax(hR, wR, k = 0.36, ds = -0.07, wy = 0) {
  const a = wR * D2R, y = wy * D2R;
  const o = { hR, wR, hL: [hR[0] + Math.cos(y) * Math.cos(a) * k, hR[1] + Math.sin(a) * k, hR[2] + Math.sin(y) * Math.cos(a) * k + ds], eL: [0.2, -1, -0.6] };
  o.wRy = wy;
  return o;
}
function P(o, grip) { return Object.assign({}, o, grip || {}); }

const POSES = {
  stance: P({ root: [0, 0.86, 0], lean: 8, twist: -20, hipTwist: -18, head: [-6, 20], fL: [0.34, 0, -0.17], fR: [-0.32, 0, 0.2, 0, -25], kL: [0.25, 0, 1], kR: [0.15, 0, 1] },
    ax([0.3, 1.18, 0.22], 152, -0.26, -0.02)),
  crouch: P({ root: [0.02, 0.56, 0], lean: 22, twist: -18, hipTwist: -12, head: [-18, 18], fL: [0.4, 0, -0.18], fR: [-0.34, 0, 0.21, 0, -25] },
    ax([0.34, 0.9, 0.22], 158, -0.26, -0.02)),
  jumpUp: P({ root: [0, 1.0, 0], lean: 6, head: [-10, 0], fL: [0.14, 0.4, -0.1, 30], fR: [-0.14, 0.24, 0.12, 20] }, ax([0.2, 1.3, 0.22], 110, -0.3)),
  jumpTuck: P({ root: [0, 0.95, 0], lean: 26, fL: [0.25, 0.56, -0.1, 20], fR: [0.08, 0.5, 0.1, 20] }, ax([0.3, 1.1, 0.22], 150, -0.3)),
  fall: P({ root: [0, 0.98, 0], lean: 6, head: [-6, 0], fL: [0.2, 0.22, -0.12], fR: [-0.12, 0.34, 0.12, 20] }, ax([0.24, 1.2, 0.22], 120, -0.3)),
  walk: { stride: 0.24, lift: 0.08, bob: 0.03 },
  dash: P({ root: [0.08, 0.78, 0], lean: 28, head: [-24, 0], fL: [0.32, 0.04, -0.14], fR: [-0.36, 0.14, 0.14, -30] }, ax([0.1, 1.0, 0.24], 165, -0.3)),
  bdash: P({ root: [-0.06, 0.84, 0], lean: -10, head: [6, 0], fL: [0.28, 0.08, -0.14], fR: [-0.24, 0, 0.16] }, ax([0.26, 1.1, 0.22], 118, -0.3)),
  blockHigh: P({ root: [-0.04, 0.84, 0], lean: 6, twist: -12, head: [10, 0], fL: [0.3, 0, -0.16], fR: [-0.3, 0, 0.18] }, ax([0.3, 1.18, 0.2], 95, 0.42, -0.1)),
  blockLow: P({ root: [-0.04, 0.56, 0], lean: 16, twist: -12, head: [8, 0], fL: [0.36, 0, -0.18], fR: [-0.32, 0, 0.19] }, ax([0.34, 0.88, 0.2], 75, 0.42, -0.1)),
  land: P({ root: [0, 0.68, 0], lean: 16, fL: [0.26, 0, -0.16], fR: [-0.26, 0, 0.18] }, ax([0.3, 0.95, 0.22], 130, -0.3)),
  jsq: P({ root: [0, 0.72, 0], lean: 14, fL: [0.18, 0, -0.14], fR: [-0.18, 0, 0.16] }, ax([0.26, 1.0, 0.22], 125, -0.3)),
  intro: { root: [0, 0.84, 0], lean: 6, twist: -10, head: [-12, 14], fL: [0.3, 0, -0.18], fR: [-0.3, 0, 0.2], hR: [0.44, 1.2, 0.17], wR: -86, hL: [0.45, 1.46, 0.08], eL: [0.2, -1, -0.6] },
  win: { root: [0, 0.92, 0], lean: -8, twist: 10, head: [-24, -6], hL: [0.18, 1.0, -0.32], hR: [0.18, 2.02, 0.2], wR: 92, fL: [0.18, 0, -0.17], fR: [-0.18, 0, 0.2] },
  throwReach: P({ root: [0.1, 0.84, 0], lean: 14, fL: [0.36, 0, -0.16], fR: [-0.24, 0, 0.18], hL: [0.62, 1.32, -0.1] }, { hR: [0.1, 1.0, 0.26], wR: 120 }),
  throwWhiff: P({ root: [0.1, 0.84, 0], lean: 18, fL: [0.34, 0, -0.16], fR: [-0.22, 0, 0.18], hL: [0.52, 1.18, -0.12] }, { hR: [0.1, 0.98, 0.26], wR: 120 }),
  cast: P({ root: [0, 0.86, 0], lean: 4, head: [-10, 0], fL: [0.3, 0, -0.17], fR: [-0.3, 0, 0.2] }, ax([0.3, 1.1, 0.2], 100, 0.36)),
};

const MOVES = {
  stL: [[0, 'stance'],
    ['s-2', P({ twist: -30, lean: 6 }, ax([0.3, 1.2, 0.18], 172, 0.36, -0.06)), 'io'],
    ['s', P({ root: [0.1, 0.86, 0], lean: 16, twist: -8, head: [-6, 10], fL: [0.42, 0, -0.17] }, ax([0.68, 1.26, 0.12], 176, 0.38, -0.08)), 'snap'],
    ['a+2', P({ root: [0.1, 0.86, 0], lean: 16, twist: -8, head: [-6, 10], fL: [0.42, 0, -0.17] }, ax([0.64, 1.25, 0.12], 176, 0.38, -0.08))],
    ['e', 'stance', 'io']],
  stM: [[0, 'stance'],
    ['s-4', P({ root: [-0.04, 0.84, 0], twist: -54, lean: 4, head: [-8, 40] }, ax([-0.06, 1.08, 0.34], 8, 0.34, -0.06, 160)), 'io'],
    ['s-2', P({ root: [0.02, 0.83, 0], twist: -20, lean: 10, head: [-8, 20] }, ax([0.2, 1.06, 0.36], 6, 0.34, -0.06, 95)), 'lin'],
    ['s', P({ root: [0.08, 0.82, 0], twist: 26, lean: 18, head: [-8, -6], fL: [0.44, 0, -0.17] }, ax([0.46, 1.04, 0.12], 6, 0.34, -0.06, 0)), 'snap'],
    ['a+3', P({ root: [0.1, 0.82, 0], twist: 44, lean: 20, head: [-8, -12], fL: [0.44, 0, -0.17] }, ax([0.42, 1.0, -0.12], 2, 0.34, -0.06, -45))],
    ['e', 'stance', 'io']],
  stH: [[0, 'stance'],
    ['s-6', P({ root: [-0.06, 0.92, 0], lean: -14, twist: -10, head: [-24, 10] }, ax([0.06, 1.86, 0.16], 140, 0.34, -0.08)), 'io'],
    ['s', P({ root: [0.18, 0.78, 0], lean: 28, twist: 4, head: [-6, 6], fL: [0.54, 0, -0.17], fR: [-0.34, 0, 0.2, 0, -25] }, ax([0.58, 1.24, 0.1], 18, 0.36, -0.08)), 'snap'],
    ['a+3', P({ root: [0.2, 0.7, 0], lean: 38, twist: 8, head: [0, 6], fL: [0.56, 0, -0.17], fR: [-0.36, 0, 0.2, 0, -25] }, ax([0.56, 0.74, 0.1], -40, 0.36, -0.08))],
    ['e', 'stance', 'io']],
  crL: [[0, 'crouch'],
    ['s-2', { fL: [0.42, 0.14, -0.12] }],
    ['s', { root: [0.06, 0.58, 0], lean: 4, twist: -26, head: [-14, 26], fL: [0.86, 0.1, -0.1, -20] }, 'snap'],
    ['a+2', { root: [0.06, 0.58, 0], lean: 4, twist: -26, head: [-14, 26], fL: [0.84, 0.1, -0.1, -20] }],
    ['e', 'crouch']],
  crM: [[0, 'crouch'],
    ['s-4', P({ twist: -40, root: [-0.04, 0.56, 0] }, ax([0.0, 0.62, 0.3], 190, 0.32, -0.1)), 'io'],
    ['s-2', P({ twist: -10, root: [0.04, 0.54, 0], lean: 20 }, ax([0.2, 0.52, 0.24], 262, 0.34, -0.09)), 'lin'],
    ['s', P({ root: [0.16, 0.52, 0], lean: 30, twist: 18, head: [-24, 0], fL: [0.56, 0, -0.18] }, ax([0.44, 0.48, 0.1], 356, 0.36, -0.08)), 'snap'],
    ['a+3', P({ root: [0.16, 0.52, 0], lean: 30, twist: 22, head: [-24, 0], fL: [0.56, 0, -0.18] }, ax([0.42, 0.46, 0.08], 354, 0.36, -0.08))],
    ['e-1', P({}, ax([0.34, 0.9, 0.22], 518, -0.26, -0.02)), 'io'],
    ['e', 'crouch']],
  crH: [[0, 'crouch'],
    ['s-5', P({ root: [-0.04, 0.5, 0], lean: 24, twist: -46, head: [-20, 30] }, ax([0.02, 0.5, 0.3], 205, 0.3, -0.1)), 'io'],
    ['s-2', P({ root: [0.06, 0.52, 0], lean: 22, twist: -10, head: [-20, 10] }, ax([0.3, 0.46, 0.2], 300, 0.34, -0.09)), 'lin'],
    ['s', P({ root: [0.12, 0.74, 0], lean: 0, twist: 18, head: [-30, 0], fL: [0.42, 0, -0.17] }, ax([0.42, 1.08, 0.1], 406, 0.36, -0.08)), 'snap'],
    ['a+3', P({ root: [0.1, 0.88, 0], lean: -14, twist: 26, head: [-40, 0], fL: [0.4, 0, -0.17], fR: [-0.3, 0.04, 0.2, -20] }, ax([0.3, 1.5, 0.1], 452, 0.36, -0.08))],
    ['e-1', P({}, ax([0.34, 0.9, 0.22], 518, -0.26, -0.02)), 'io'],
    ['e', 'crouch']],
  jL: [[0, 'fall'],
    ['s', P({ lean: 22, fL: [0.24, 0.46, -0.1] }, ax([0.5, 0.78, 0.12], 152, 0.36, -0.08)), 'snap'],
    ['a', P({ lean: 22, fL: [0.24, 0.46, -0.1] }, ax([0.48, 0.74, 0.12], 150, 0.36, -0.08))], ['e', 'fall']],
  jM: [[0, 'fall'],
    ['s-3', P({ twist: -40 }, ax([0.0, 1.2, 0.28], 170, 0.34, -0.1))],
    ['s', P({ lean: 20, twist: 26 }, ax([0.42, 0.78, 0.1], -8, 0.36, -0.08)), 'snap'],
    ['a', P({ lean: 22, twist: 34 }, ax([0.38, 0.7, 0.04], -24, 0.36, -0.08))], ['e', 'fall']],
  jH: [[0, 'fall'],
    ['s-5', P({ lean: -14, head: [-20, 0], fL: [0.26, 0.5, -0.1], fR: [0.02, 0.44, 0.1] }, ax([0.02, 1.8, 0.16], 140, 0.34, -0.08)), 'io'],
    ['s', P({ lean: 30, head: [8, 0], fL: [0.26, 0.42, -0.1], fR: [-0.04, 0.32, 0.1] }, ax([0.48, 0.86, 0.1], -42, 0.36, -0.08)), 'snap'],
    ['a', P({ lean: 34, head: [10, 0], fL: [0.26, 0.42, -0.1], fR: [-0.04, 0.32, 0.1] }, ax([0.44, 0.72, 0.1], -62, 0.36, -0.08))], ['e', 'fall']],
  fH: [[0, 'stance'],
    [8, P({ root: [-0.08, 0.96, 0], lean: -18, twist: -6, head: [-30, 4], fR: [-0.34, 0.0, 0.2, 0, -25] }, ax([-0.02, 1.92, 0.16], 132, 0.34, -0.08)), 'io'],
    ['s-2', P({ root: [-0.1, 0.98, 0], lean: -22, twist: -6, head: [-32, 4] }, ax([-0.06, 1.95, 0.16], 140, 0.34, -0.08))],
    ['s', P({ root: [0.2, 0.74, 0], lean: 32, twist: 4, head: [-4, 4], fL: [0.58, 0, -0.17], fR: [-0.36, 0, 0.2, 0, -25] }, ax([0.6, 1.2, 0.1], 16, 0.36, -0.08)), 'snap'],
    ['a+3', P({ root: [0.22, 0.66, 0], lean: 40, twist: 8, head: [2, 6], fL: [0.6, 0, -0.17], fR: [-0.38, 0, 0.2, 0, -25] }, ax([0.6, 0.66, 0.1], -40, 0.36, -0.08))],
    ['e', 'stance', 'io']],
  throw: [[0, 'stance'], ['s', 'throwReach', 'snap'], ['e', 'throwWhiff']],
  Q: [[0, 'stance'],
    ['s-6', P({ root: [-0.06, 0.92, 0], lean: -12, twist: -36, head: [-20, 30] }, ax([-0.06, 1.7, 0.24], 150, 0.34, -0.08)), 'io'],
    ['s', P({ root: [0.2, 0.62, 0], lean: 40, twist: 16, head: [-14, 0], fL: [0.58, 0, -0.17], fR: [-0.4, 0, 0.2, 0, -25] }, ax([0.6, 0.66, 0.1], -16, 0.36, -0.08)), 'snap'],
    ['s+8', P({ root: [0.2, 0.6, 0], lean: 42, twist: 22, head: [-12, 0], fL: [0.58, 0, -0.17], fR: [-0.4, 0, 0.2, 0, -25] }, ax([0.58, 0.6, 0.1], -24, 0.36, -0.08))],
    ['e', 'stance', 'io']],
  W: [[0, 'stance'],
    [6, P({ root: [0, 0.58, 0], lean: 26, head: [-20, 0], fL: [0.32, 0, -0.17], fR: [-0.3, 0, 0.2] }, ax([0.2, 0.8, 0.22], 150, -0.3)), 'io'],
    [10, P({ root: [0, 1.0, 0], lean: -10, head: [-24, 0], fL: [0.2, 0.36, -0.1, 30], fR: [-0.18, 0.18, 0.12, 20] }, ax([0.06, 1.88, 0.16], 130, 0.34, -0.08)), 'out'],
    [24, P({ root: [0, 1.0, 0], lean: -16, head: [-20, 0], fL: [0.26, 0.5, -0.1, 30], fR: [0.0, 0.42, 0.12, 20] }, ax([0.0, 1.95, 0.16], 145, 0.34, -0.08)), 'io'],
    [28, P({ root: [0.06, 0.98, 0], lean: 30, head: [6, 0], fL: [0.28, 0.42, -0.1], fR: [-0.06, 0.3, 0.12] }, ax([0.5, 1.0, 0.1], -18, 0.36, -0.08)), 'snap'],
    [40, P({ root: [0.06, 0.96, 0], lean: 36, head: [8, 0], fL: [0.28, 0.38, -0.1], fR: [-0.06, 0.28, 0.12] }, ax([0.48, 0.82, 0.1], -44, 0.36, -0.08))],
    ['e', 'fall']],
  E: [[0, 'stance'],
    [5, P({ root: [0, 0.78, 0], lean: 26, head: [14, 0] }, ax([0.3, 0.92, 0.22], 140, -0.3)), 'io'],
    [12, { root: [-0.02, 0.9, 0], lean: -20, twist: 10, head: [-42, 0, 0], hL: [0.5, 1.72, -0.26], eL: [0, -1, -0.3], hR: [-0.32, 1.64, 0.3], wR: 128, fL: [0.38, 0, -0.2], fR: [-0.38, 0, 0.22] }, 'snap'],
    [20, { root: [-0.02, 0.9, 0], lean: -22, twist: 12, head: [-46, 0, 0], hL: [0.52, 1.78, -0.26], eL: [0, -1, -0.3], hR: [-0.34, 1.7, 0.3], wR: 134, fL: [0.38, 0, -0.2], fR: [-0.38, 0, 0.22] }],
    ['e', 'stance', 'io']],
  R: [[0, 'stance'],
    [6, P({ root: [-0.04, 0.98, 0], lean: -16, head: [-30, 0] }, ax([0.0, 1.98, 0.16], 120, 0.34, -0.08)), 'io'],
    [12, P({ root: [-0.02, 1.02, 0], lean: -20, head: [-34, 0], fR: [-0.32, 0.06, 0.2] }, ax([-0.02, 2.02, 0.16], 128, 0.34, -0.08))],
    [14, P({ root: [0.16, 0.5, 0], lean: 44, head: [-20, 0], fL: [0.5, 0, -0.18], fR: [-0.4, 0, 0.21, 0, 0], kR: [0, -1, 0.3] }, ax([0.56, 0.5, 0.1], -38, 0.36, -0.08)), 'snap'],
    [44, P({ root: [0.16, 0.46, 0], lean: 46, head: [-26, 0], fL: [0.5, 0, -0.18], fR: [-0.4, 0, 0.21, 0, 0], kR: [0, -1, 0.3] }, ax([0.56, 0.46, 0.1], -40, 0.36, -0.08))],
    ['e', 'stance', 'io']],
};
MOVES.Wf = MOVES.W;
MOVES.Wb = MOVES.W;

// --- Lock timelines -----------------------------------------------------------
const slamP = MOVES.R[3][1];
function quakeTimelines(k) {
  const L = HEROES.kaida.locks['quake' + k];
  const m = L.meta;
  const atk = [[0, slamP], [m.T5, slamP],
    [m.leap0, P({ root: [0, 0.6, 0], lean: 30, head: [-20, 0], fL: [0.3, 0, -0.17], fR: [-0.3, 0, 0.2] }, ax([0.24, 0.9, 0.22], 150, -0.3)), 'io'],
    [m.leap0 + 3, P({ root: [0, 1.0, 0], lean: -12, head: [-22, 0], fL: [0.26, 0.5, -0.1, 30], fR: [0.0, 0.4, 0.12, 20] }, ax([0.04, 1.9, 0.16], 132, 0.34, -0.08)), 'out'],
    [m.chop - 4, P({ root: [0, 1.0, 0], lean: -18, head: [-20, 0], fL: [0.3, 0.42, -0.1, 30], fR: [0.04, 0.34, 0.12, 20] }, ax([-0.04, 1.96, 0.16], 146, 0.34, -0.08)), 'io'],
    [m.chop, P({ root: [0.2, 0.62, 0], lean: 40, head: [0, 0], fL: [0.56, 0, -0.17], fR: [-0.38, 0, 0.2, 0, -25] }, ax([0.6, 0.86, 0.1], -24, 0.36, -0.08)), 'snap'],
    [m.dur - 6, P({ root: [0.2, 0.6, 0], lean: 42, head: [4, 0], fL: [0.56, 0, -0.17], fR: [-0.38, 0, 0.2, 0, -25] }, ax([0.6, 0.62, 0.1], -42, 0.36, -0.08))],
    [m.dur, 'stance', 'io']];
  const vic = [[0, 'airHit']];
  for (let j = k + 1; j <= 5; j++) {
    const t = (j - k) * QUAKE.lt;
    vic.push([t - 1, { spin: -40 }], [t + 1, { spin: -10 }, 'snap']);
  }
  vic.push([m.T5 + 2, { root: [0, 0.95, 0], lean: -6, head: [-20, 0], hL: [0.1, 1.7, -0.3], hR: [0.12, 1.66, 0.3], fL: [0.1, 0.05, -0.12], fR: [-0.1, 0.0, 0.12] }, 'snap'],
    [m.chop, 'airHit', 'snap'], [m.dur, 'airHit']);
  return { atk, vic, camZ: 7.4, orbit: 0.18 };
}

// ---------------------------------------------------------------------------
// Ice geometry helpers for entities and VFX
function iceMats(ctx) {
  const v = ctx.view;
  if (v && v._kdIce) return v._kdIce;
  const ice = new THREE.MeshToonMaterial({ color: new THREE.Color(C.ice), emissive: new THREE.Color(0x2a7aa0), emissiveIntensity: 0.55 });
  const iceD = new THREE.MeshToonMaterial({ color: new THREE.Color(C.iceD), emissive: new THREE.Color(0x0f4a6a), emissiveIntensity: 0.6 });
  const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(2.4) });
  const line = new THREE.MeshBasicMaterial({ color: 0x0b2a3d, side: THREE.BackSide });
  const M = { ice, iceD, core, line };
  if (v) v._kdIce = M;
  return M;
}
// Owner-less holder: traverse() stops at the holder so shared materials survive cleanup,
// while geometries (created per entity) are disposed by us in end().
function holder() {
  const g = new THREE.Group();
  g.traverse = function (cb) { cb(this); };
  return g;
}
function disposeGeo(obj) {
  THREE.Object3D.prototype.traverse.call(obj, (o) => { if (o.geometry) o.geometry.dispose(); });
}
function crystal(M, r, h, seg = 6, outline = true) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, h * 0.78, seg), M.ice);
  body.position.y = h * 0.39;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.8, h * 0.24, seg), M.ice);
  cap.position.y = h * 0.78 + h * 0.12;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.34, h * 0.8, 5), M.core);
  core.position.y = h * 0.42;
  g.add(body, cap, core);
  if (outline) {
    for (const m of [body, cap]) {
      const o = new THREE.Mesh(m.geometry, M.line);
      o.scale.setScalar(1.06); m.add(o);
    }
  }
  return g;
}
function spike(M, r, h) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), M.ice);
  c.position.y = h / 2;
  const o = new THREE.Mesh(c.geometry, M.line); o.scale.setScalar(1.07); c.add(o);
  const core = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, h * 0.8, 4), M.core);
  core.position.y = h * 0.42;
  g.add(c, core);
  return g;
}
function hash(n) { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); }
function play(ctx, n) { if (ctx.audio && ctx.audio.play) ctx.audio.play(n); }
function shards(V, x, y, z, n, sp = [2, 7], col = C.ice) {
  V.burst({ x, y, z, count: n, color: col, color2: 0xffffff, shape: 'shard', speed: sp, size: [0.04, 0.09], size1: 0.01, life: [0.3, 0.7], gravity: 9, drag: 0.94, intensity: 1.6, floor: true, dir: Math.PI / 2, spread: 1.3 });
}
function mist(V, x, y, z, n, size = 0.4) {
  V.burst({ x, y, z, count: n, color: C.mist, additive: false, shape: 'smoke', size: [size * 0.5, size], size1: size * 1.8, speed: [0.3, 1.6], life: [0.5, 1.0], drag: 0.92, gravity: -0.3, alpha: 0.45, intensity: 1, jx: 0.3, jy: 0.1 });
}
function frostRing(V, x, y, r1 = 2.2, life = 0.45) {
  V.ring({ x, y: y + 0.03, z: 0, color: C.glow, r0: 0.2, r1, life, axis: 'y', thick: 0.18, intensity: 2.6 });
}

function pillarEnt() {
  return {
    build(ctx, e) {
      const M = iceMats(ctx);
      const h = holder();
      const i = e.d && e.d.i != null ? e.d.i : 0;
      const big = i === 5 ? 1.35 : 1 + i * 0.03;
      const g = new THREE.Group();
      const main = crystal(M, 0.24 * big, 2.0 * big);
      g.add(main);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + hash(e.id + k) * 0.8;
        const c = crystal(M, (0.1 + hash(e.id * 3 + k) * 0.07) * big, (0.6 + hash(e.id * 7 + k) * 0.7) * big);
        c.position.set(Math.cos(a) * 0.26 * big, 0, Math.sin(a) * 0.2 * big);
        c.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        g.add(c);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2 * big, 0.62 * big, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.6), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
      h.add(g, ring);
      h.userData = { g, ring, big, i };
      g.scale.set(1, 0.05, 1);
      return h;
    },
    update(obj, e, ctx) {
      const { g, ring } = obj.userData;
      const a = e.age;
      let sy;
      if (a <= 2) sy = 0.1 + 0.55 * a;
      else if (a <= 5) sy = 1.2 - (a - 2) * 0.067;
      else sy = 1;
      const fade = Math.max(0, Math.min(1, (e.life - a) / 10));
      g.scale.set(0.6 + 0.4 * fade, sy * (0.25 + 0.75 * fade), 0.6 + 0.4 * fade);
      g.position.y = -(1 - fade) * 0.6;
      ring.material.opacity = 0.7 * Math.max(0, 1 - a / 22);
      ring.scale.setScalar(1 + a * 0.03);
      if (a < 8 && Math.random() < 0.7) ctx.vfx.particle({ x: obj.position.x + (Math.random() - 0.5) * 0.5, y: Math.random() * 1.8, z: 0.2, color: C.mist, shape: 'star', size: 0.08, size1: 0, life: 0.5, speed: 0.6, intensity: 1.8 });
    },
    end(obj, e, ctx) {
      shards(ctx.vfx, obj.position.x, 0.6, 0.1, 18, [1, 4]);
      mist(ctx.vfx, obj.position.x, 0.2, 0, 6, 0.5);
      disposeGeo(obj);
      obj.userData.ring.material.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
export default {
  id: 'kaida',
  scale: S,
  dims: DIMS,
  outline: 0x0a1018,
  glowColor: C.glow,
  flip: true,
  wDefaults: {
    kd: { R: 170 }, dead: { R: 172 }, airHit: { R: 140 }, held: { R: -70 }, hitHigh: { R: 130 }, hitMid: { R: 120 }, hitLow: { R: 140 },
    rise: { R: 150 }, tech: { R: 110 }, dispel: { R: 95 },
  },
  build(ctx) {
    const ex = buildModel(ctx);
    installHook(ctx.rig, ex);
    return ex;
  },
  poses: POSES,
  moves: MOVES,
  noTrail: ['throw', 'E', 'stL', 'jL', 'crL'],
  trailLock(F, G) {
    const K = G.lock;
    if (!K || !K.id.startsWith('quake')) return false;
    const m = HEROES.kaida.locks[K.id].meta;
    return K.af >= m.chop - 5 && K.af <= m.chop + 1;
  },
  locks: Object.assign({
    throw: {
      atk: [[0, 'throwReach'],
        [8, P({ root: [0.02, 0.86, 0], lean: 4, hL: [0.4, 1.36, -0.08] }, { hR: [0.1, 1.0, 0.26], wR: 120 }), 'io'],
        [16, P({ root: [0.1, 0.84, 0], lean: 26, head: [24, 0], hL: [0.36, 1.3, -0.08] }, { hR: [0.1, 1.0, 0.26], wR: 120 }), 'snap'],
        [24, P({ root: [-0.02, 0.9, 0], lean: -8, twist: -30, head: [-10, 0] }, ax([0.1, 1.5, 0.22], 150, 0.34, -0.1)), 'io'],
        [32, P({ root: [0.16, 0.74, 0], lean: 34, twist: 10, fL: [0.48, 0, -0.17] }, ax([0.6, 0.9, 0.12], 178, 0.4, -0.08)), 'snap'],
        [40, 'stance', 'io']],
      vic: [[0, 'held'], [16, 'hitHigh', 'snap'], [24, 'held'], [32, 'hitMid', 'snap'], [36, 'airHit']],
    },
  }, Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => ['quake' + k, quakeTimelines(k)]))),
  ents: Object.assign({
    wave: {
      build(ctx, e) {
        const M = iceMats(ctx);
        const h = holder();
        const g = new THREE.Group();
        for (let k = 0; k < 7; k++) {
          const x = -0.32 + k * 0.11;
          const ht = 0.22 + (k / 6) * 0.55 + hash(e.id + k) * 0.12;
          const c = crystal(M, 0.06 + hash(e.id * 5 + k) * 0.04, ht, 5);
          c.position.set(x, 0, (hash(e.id * 9 + k) - 0.5) * 0.4);
          c.rotation.set((hash(k + 2) - 0.5) * 0.5, 0, -0.35 - hash(k) * 0.2);
          g.add(c);
        }
        const slab = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.3), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        slab.rotation.x = -Math.PI / 2; slab.position.set(-0.1, 0.02, 0);
        h.add(g, slab);
        h.userData = { g, slab };
        return h;
      },
      update(obj, e, ctx) {
        const { g } = obj.userData;
        const grow = Math.min(1, e.age / 5);
        g.scale.set(1, grow * (0.92 + 0.08 * Math.sin(e.age * 0.9)), 1);
        const x = obj.position.x;
        const back = -e.face * 0.45;
        if (Math.random() < 0.8) ctx.vfx.particle({ x: x + back, y: 0.1, z: (Math.random() - 0.5) * 0.4, color: C.mist, additive: false, shape: 'smoke', size: 0.22, size1: 0.5, life: 0.6, speed: 0.4, dir: Math.PI / 2, spread: 0.7, alpha: 0.4, intensity: 1 });
        if (Math.random() < 0.6) ctx.vfx.particle({ x: x + back * 0.5, y: 0.05, z: (Math.random() - 0.5) * 0.5, color: C.ice, shape: 'shard', size: 0.05, size1: 0.01, life: 0.7, speed: 1.2, dir: Math.PI / 2, spread: 0.8, gravity: 6, floor: true, intensity: 1.4 });
      },
      end(obj, e, ctx) {
        const V = ctx.vfx;
        shards(V, obj.position.x, 0.35, 0.1, e.why === 'hit' ? 40 : 28, [2, 6]);
        mist(V, obj.position.x, 0.2, 0, 8, 0.45);
        V.flash({ x: obj.position.x, y: 0.4, color: C.glow, size: 1.1, life: 0.12, intensity: 1.4 });
        if (e.why === 'expire' || e.why === 'clash') play(ctx, 'frost_impact');
        disposeGeo(obj);
        obj.userData.slab.material.dispose();
      },
    },
    spikes: {
      build(ctx, e) {
        const M = iceMats(ctx);
        const h = holder();
        const g = new THREE.Group();
        for (let k = 0; k < 13; k++) {
          const u = (k / 12) * 2 - 1;
          const s = spike(M, 0.07 + hash(e.id + k) * 0.05, (0.5 + (1 - Math.abs(u)) * 0.7) * (0.75 + hash(e.id * 3 + k) * 0.4));
          s.position.set(u * 1.0, 0, (hash(e.id * 11 + k) - 0.5) * 0.7);
          s.rotation.set((hash(k * 5) - 0.5) * 0.4, 0, -u * 0.6);
          g.add(s);
        }
        h.add(g);
        h.userData = { g };
        g.scale.set(1, 0.05, 1);
        return h;
      },
      update(obj, e) {
        const a = e.age;
        const sy = a <= 2 ? 0.1 + a * 0.55 : a <= 4 ? 1.2 - (a - 2) * 0.1 : a < 16 ? 1 : Math.max(0.02, 1 - (a - 16) / 10);
        obj.userData.g.scale.set(1, sy, 1);
      },
      end(obj, e, ctx) { shards(ctx.vfx, obj.position.x, 0.3, 0.1, 16, [1, 3]); disposeGeo(obj); },
    },
    pillarFx: pillarEnt(),
  }, Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => ['pillar' + i, pillarEnt()]))),
  buffFx: {
    frenzy(F, b, ctx) {
      const v = ctx.view;
      if (v) v.rig._fz = 3;
      const V = ctx.vfx;
      const x = F.x * S2M, y = F.y * S2M;
      if (Math.random() < 0.8) V.particle({ x: x + (Math.random() - 0.5) * 0.8, y: y + Math.random() * 1.9, z: 0.2, color: C.glow, shape: 'spark', size: 0.06, size1: 0, life: 0.5, speed: 1.4, dir: Math.PI / 2, spread: 0.3, stretch: 1.2, intensity: 2 });
      if (Math.random() < 0.35) V.particle({ x: x + (Math.random() - 0.5) * 0.6, y: y + 0.1, z: 0, color: C.mist, additive: false, shape: 'smoke', size: 0.3, size1: 0.6, life: 0.7, speed: 0.6, dir: Math.PI / 2, spread: 0.4, alpha: 0.35, intensity: 1 });
      if (v && v.extras && v.extras.axe && Math.random() < 0.6) {
        const p = new THREE.Vector3(); v.extras.axe.head.getWorldPosition(p);
        V.particle({ x: p.x, y: p.y, z: p.z, color: C.glow, shape: 'soft', size: 0.1, size1: 0, life: 0.4, speed: 0.5, intensity: 2.4 });
      }
      if (b.t % 40 === 0) V.ring({ x, y: y + 0.05, z: 0, color: C.glow, r0: 0.3, r1: 1.1, life: 0.4, axis: 'y', thick: 0.08, intensity: 1.6 });
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
      case 'cast': {
        play(ctx, 'frost_cast');
        if (e.s === 'Q') {
          V.burst({ x: fx + F.face * 0.4, y: fy + 1.4, count: 16, color: C.glow, shape: 'soft', speed: [0.5, 2], size: [0.06, 0.12], life: [0.25, 0.45], intensity: 2 });
        } else if (e.s === 'W') {
          mist(V, fx, fy + 0.1, 0, 10, 0.4);
        } else if (e.s === 'R') {
          V.pillar({ x: fx, y: fy, color: C.glow, height: 5, radius: 0.6, life: 0.7, intensity: 1.1, alpha: 0.5 });
          V.burst({ x: fx, y: fy + 1.5, count: 50, color: C.mist, shape: 'star', speed: [1, 4], size: [0.06, 0.12], life: [0.5, 1.0], drag: 0.92 });
        }
        break;
      }
      case 'cine': {
        switch (e.k) {
          case 'kd_quake': {
            const x = fx + F.face * 0.6;
            frostRing(V, x, 0, 3.4, 0.6); frostRing(V, x, 0, 2.0, 0.4);
            shards(V, x, 0.2, 0.1, 50, [3, 9]);
            mist(V, x, 0.15, 0, 14, 0.6);
            V.flash({ x, y: 0.4, color: C.glow, size: 2.2, life: 0.18, intensity: 1.4 });
            V.light({ x, y: 0.6, color: C.glow, intensity: 6, life: 0.4, distance: 7 });
            V.shake(0.2, 0.4);
            play(ctx, 'shockwave'); play(ctx, 'explosion');
            break;
          }
          case 'kd_slam': {
            const x = e.x * S2M;
            frostRing(V, x, 0, 2.0, 0.4);
            shards(V, x, 0.2, 0.1, 30, [2, 7]);
            mist(V, x, 0.15, 0, 10, 0.5);
            V.shake(0.12, 0.25);
            play(ctx, 'shockwave');
            break;
          }
          case 'kd_roar': {
            const y = fy + 1.45;
            V.ring({ x: fx, y, z: 0.6, color: C.glow, r0: 0.6, r1: 2.6, life: 0.45, thick: 0.07, intensity: 1.1 });
            V.ring({ x: fx, y: fy + 0.04, z: 0, color: C.glow, r0: 0.3, r1: 2.0, life: 0.5, thick: 0.12, intensity: 1.5, axis: 'y' });
            V.burst({ x: fx, y, z: 0.5, count: 34, color: C.glow, shape: 'spark', speed: [3, 8], size: [0.025, 0.045], life: [0.25, 0.5], stretch: 1.4, intensity: 1.2, jx: 0.3, jy: 0.3 });
            V.burst({ x: fx, y: fy + 0.9, z: 0.3, count: 24, color: C.mist, shape: 'shard', speed: [1, 4], size: [0.04, 0.08], life: [0.4, 0.8], gravity: 4, intensity: 1.2, jx: 0.4, jy: 0.6 });
            mist(V, fx, fy + 0.2, 0, 12, 0.5);
            V.shake(0.08, 0.3);
            play(ctx, 'buff');
            break;
          }
          case 'kd_encase': {
            const x = e.x * S2M, y = e.y * S2M;
            const M = iceMats(ctx);
            const g = holder();
            const shell = new THREE.Group();
            const geo = new THREE.IcosahedronGeometry(1, 0);
            const glass = new THREE.MeshToonMaterial({ color: new THREE.Color(0x8fd8f8), emissive: new THREE.Color(0x0e3550), emissiveIntensity: 0.4, transparent: true, opacity: 0.42, depthWrite: false });
            const body = new THREE.Mesh(geo, glass); body.scale.set(0.62, 1.15, 0.55); body.position.y = 1.0;
            const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(C.glow).multiplyScalar(1.1), wireframe: true, transparent: true, opacity: 0.55 }));
            edge.scale.copy(body.scale).multiplyScalar(1.01); edge.position.copy(body.position);
            shell.add(body, edge);
            for (let k = 0; k < 7; k++) {
              const c = crystal(M, 0.1 + hash(k) * 0.06, 0.6 + hash(k * 3) * 0.6, 5);
              const a = (k / 7) * Math.PI * 2;
              c.position.set(Math.cos(a) * 0.4, 0.1 + hash(k * 7) * 1.2, Math.sin(a) * 0.3);
              c.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
              shell.add(c);
            }
            g.add(shell);
            g.position.set(x, y, 0.05);
            g.userData.dead = false;
            ctx.view._kdCrystal = g;
            V.custom(g, 4, (obj, u) => {
              const k = Math.min(1, u * 4 / 0.15);
              shell.scale.setScalar(0.4 + 0.6 * k);
              if (obj.userData.dead) { obj.visible = false; }
              if (u > 0.97) { disposeGeo(obj); glass.dispose(); edge.material.dispose(); }
            });
            frostRing(V, x, 0, 1.6, 0.35);
            shards(V, x, y + 1.0, 0.3, 22, [2, 5]);
            V.flash({ x, y: y + 1.0, color: C.glow, size: 1.6, life: 0.16, intensity: 1.4 });
            play(ctx, 'frost_impact');
            break;
          }
          case 'kd_leap': {
            mist(V, fx, 0.1, 0, 10, 0.5);
            V.burst({ x: fx, y: 0.3, count: 24, color: C.glow, shape: 'spark', dir: Math.PI / 2, spread: 0.6, speed: [3, 7], size: [0.03, 0.05], life: [0.2, 0.4] });
            play(ctx, 'frost_cast');
            break;
          }
          case 'kd_shatter': {
            const x = e.x * S2M, y = e.y * S2M + 1.0;
            const cr = ctx.view._kdCrystal;
            if (cr) { cr.userData.dead = true; cr.visible = false; ctx.view._kdCrystal = null; }
            V.burst({ x, y, z: 0.3, count: 70, color: C.ice, color2: 0xcff4ff, shape: 'shard', speed: [3, 11], size: [0.05, 0.11], size1: 0.02, life: [0.4, 0.9], gravity: 10, drag: 0.93, floor: true, intensity: 1.0 });
            V.burst({ x, y, z: 0.4, count: 36, color: C.glow, shape: 'spark', speed: [5, 13], size: [0.025, 0.05], life: [0.2, 0.45], stretch: 1.8, intensity: 1.2 });
            V.ring({ x, y, z: 0.4, color: C.glow, r0: 0.3, r1: 3.0, life: 0.45, thick: 0.12, intensity: 1.5 });
            frostRing(V, x, 0, 3.0, 0.5);
            V.light({ x, y, color: C.glow, intensity: 5, life: 0.4, distance: 6 });
            mist(V, x, 0.3, 0, 16, 0.7);
            V.shake(0.26, 0.5);
            play(ctx, 'ult_impact'); play(ctx, 'explosion');
            break;
          }
        }
        break;
      }
      case 'hit': case 'block': {
        const x = e.x * S2M, y = e.y * S2M;
        const big = e.str === 'U' ? 1.4 : e.str === 'H' ? 1.1 : e.str === 'S' ? 1 : e.str === 'M' ? 0.75 : 0.55;
        if (e.t === 'hit') {
          if (e.type === 'm') { play(ctx, 'frost_impact'); shards(V, x, y, 0.4, Math.round(10 + 14 * big), [2, 7]); }
          else { play(ctx, 'hit_blade'); V.burst({ x, y, z: 0.4, count: Math.round(8 + 10 * big), color: C.mist, shape: 'star', speed: [1.5, 5], size: [0.05, 0.1], life: [0.2, 0.45], drag: 0.9, intensity: 1.6 }); }
          if (e.k === 'kaida.wave') play(ctx, 'slow');
          if (big >= 1) mist(V, x, y - 0.3, 0.2, 5, 0.4);
        }
        break;
      }
      case 'ent_end':
        break;
    }
  },
};
