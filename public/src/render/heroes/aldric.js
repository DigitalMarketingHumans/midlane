// Aldric — gilded paladin with a sunsteel longsword, crested helm and white cape.
import * as THREE from 'three';
import { part, G3 } from '../toon.js';
import { Ribbon } from '../cloth.js';

const C = {
  gold: 0xd9a63c, goldDark: 0x9c6f22, white: 0xf1ebdc, navy: 0x27305a, navyDark: 0x1a1f3d,
  leather: 0x5a3a22, steel: 0xc8ccd6, glow: 0xffcf55, plume: 0xc8313b,
};

export default {
  id: 'aldric',
  scale: 1.0,
  dims: {},
  outline: 0x120c06,
  glowColor: 0xffcf55,
  wDefaults: { kd: { R: 175 }, dead: { R: 170 }, airHit: { R: 120 }, held: { R: -60 }, dispel: { R: 95 }, hitHigh: { R: 100 } },
  build(ctx) {
    const { rig, ms } = ctx;
    const d = rig.d;
    const gold = ms.toon(C.gold), goldD = ms.toon(C.goldDark), white = ms.toon(C.white);
    const navy = ms.toon(C.navy), navyD = ms.toon(C.navyDark), leather = ms.toon(C.leather), steel = ms.toon(C.steel);
    const glow = ms.glow(C.glow, 3.2);
    const add = (parent, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };

    // Pelvis / belt / tassets
    add(rig.hips, part(G3.ellip(0.17, 0.13, 0.13), navyD, ms), 0, 0.02, 0);
    add(rig.hips, part(G3.cyl(0.175, 0.17, 0.07, 18), leather, ms), 0, 0.09, 0);
    add(rig.hips, part(G3.box(0.07, 0.05, 0.03), gold, ms, { smoothOutline: true }), 0, 0.09, 0.17);
    for (const s of [-1, 1]) add(rig.hips, part(G3.box(0.13, 0.17, 0.04), gold, ms, { smoothOutline: true }), s * 0.12, -0.04, 0.09, 0.15, s * 0.5, 0);
    // tabard front & back
    add(rig.hips, part(G3.box(0.16, 0.36, 0.02), white, ms, { smoothOutline: true }), 0, -0.14, 0.15, 0.08, 0, 0);
    add(rig.hips, part(G3.box(0.22, 0.32, 0.02), white, ms, { smoothOutline: true }), 0, -0.12, -0.15, -0.1, 0, 0);
    add(rig.hips, part(G3.cyl(0.05, 0.05, 0.005, 16), glow, null, { outline: false }), 0, -0.08, 0.162, Math.PI / 2, 0, 0);

    // Torso
    add(rig.hips, part(G3.limb(0.15, 0.13, 0.18), navy, ms), 0, 0.2, 0);
    add(rig.chest, part(G3.ellip(0.22, 0.2, 0.16), gold, ms), 0, 0.08, 0.01);
    add(rig.chest, part(G3.ellip(0.17, 0.11, 0.12), goldD, ms), 0, -0.07, 0.02);
    // sun emblem
    add(rig.chest, part(G3.cyl(0.055, 0.055, 0.01, 20), glow, null, { outline: false }), 0, 0.1, 0.165, Math.PI / 2, 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(rig.chest, part(G3.cone(0.016, 0.05, 4), glow, null, { outline: false }), Math.cos(a) * 0.08, 0.1 + Math.sin(a) * 0.08, 0.158, Math.PI / 2, 0, a - Math.PI / 2).rotation.set(0, 0, a - Math.PI / 2);
    }
    // gorget
    add(rig.chest, part(G3.cyl(0.09, 0.12, 0.08, 16), steel, ms), 0, 0.24, 0);

    // Helm
    const h = rig.head;
    add(h, part(G3.ellip(0.13, 0.15, 0.14), gold, ms), 0, 0.01, 0);
    add(h, part(G3.box(0.2, 0.035, 0.05), navyD, ms, { smoothOutline: true }), 0, 0.0, 0.11);
    add(h, part(G3.box(0.17, 0.014, 0.02), glow, null, { outline: false }), 0, 0.0, 0.135);
    add(h, part(G3.box(0.03, 0.12, 0.03), goldD, ms, { smoothOutline: true }), 0, -0.06, 0.13);
    // crest
    add(h, part(G3.ellip(0.03, 0.09, 0.17), ms.toon(C.plume), ms), 0, 0.15, -0.04, -0.3, 0, 0);
    // little sun-wings
    for (const s of [-1, 1]) add(h, part(G3.cone(0.03, 0.13, 4), glow, null, { outline: false }), s * 0.13, 0.06, -0.02, 0.4, 0, -s * 1.1);

    // Arms
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      const ua = rig.seg['ua' + s], fa = rig.seg['fa' + s];
      add(ua, part(G3.limb(0.065, 0.055, d.upper - 0.08), navy, ms), 0, -d.upper / 2, 0);
      add(ua, part(G3.ellip(0.13, 0.1, 0.13), gold, ms), sg * 0.02, -0.02, 0);
      add(ua, part(G3.ellip(0.11, 0.06, 0.11), goldD, ms), sg * 0.03, -0.1, 0);
      add(fa, part(G3.limb(0.06, 0.05, d.fore - 0.06), gold, ms), 0, -d.fore / 2, 0);
      add(fa, part(G3.torus(0.062, 0.014, 6, 16), goldD, ms), 0, -0.04, 0, Math.PI / 2, 0, 0);
      add(rig.hand[s], part(G3.ellip(0.055, 0.06, 0.055), steel, ms), 0, 0.0, 0);
    }
    // Legs
    for (const s of ['L', 'R']) {
      const th = rig.seg['th' + s], sh = rig.seg['sh' + s];
      add(th, part(G3.limb(0.085, 0.07, d.thigh - 0.1), navy, ms), 0, -d.thigh / 2, 0);
      add(th, part(G3.ellip(0.07, 0.15, 0.05), gold, ms), 0, -d.thigh / 2, 0.05);
      add(sh, part(G3.limb(0.07, 0.055, d.shin - 0.06), gold, ms), 0, -d.shin / 2, 0);
      add(sh, part(G3.ellip(0.06, 0.06, 0.06), goldD, ms), 0, 0.0, 0.03);
      add(rig.foot[s], part(G3.ellip(0.06, 0.05, 0.13), goldD, ms), 0, -0.03, 0.06);
    }

    // Sunsteel longsword in right hand: local +Y = blade direction, Z = edge.
    const sword = new THREE.Group();
    add(sword, part(G3.cyl(0.018, 0.02, 0.2, 8), leather, ms), 0, -0.02, 0);
    add(sword, part(G3.sphere(0.03, 10, 8), gold, ms), 0, -0.14, 0);
    add(sword, part(G3.box(0.04, 0.035, 0.24), gold, ms, { smoothOutline: true }), 0, 0.09, 0);
    const bladeShape = [[0, -0.03], [0.04, 0], [0.036, 0.82], [0, 0.98], [-0.036, 0.82], [-0.04, 0]];
    const blade = part(G3.extrude(bladeShape.map(([x, y]) => [x, y]), 0.012, 0.003), steel, ms);
    blade.rotation.set(0, Math.PI / 2, 0);
    add(sword, blade, 0, 0.1, 0, 0, Math.PI / 2, 0);
    const edge = part(G3.extrude([[0, 0], [0.014, 0.02], [0.012, 0.8], [0, 0.95], [-0.012, 0.8], [-0.014, 0.02]], 0.026, 0), glow, null, { outline: false });
    add(sword, edge, 0, 0.12, 0, 0, Math.PI / 2, 0);
    rig.hand.R.add(sword);
    const tip = new THREE.Object3D(); tip.position.set(0, 1.04, 0); sword.add(tip);
    const base = new THREE.Object3D(); base.position.set(0, 0.25, 0); sword.add(base);

    // Cape
    const capeMat = ms.toon(C.white, { side: THREE.DoubleSide, unique: true });
    const cape = new Ribbon({ segs: 9, len: 0.95, width: 0.42, taper: 1.25, mat: capeMat, drag: 0.9 });
    const trim = new Ribbon({ segs: 9, len: 0.97, width: 0.46, taper: 1.25, mat: ms.toon(C.gold, { side: THREE.DoubleSide, unique: true }), drag: 0.9 });
    return {
      trails: [{ tip, base, color: 0xffd36a, width: 1 }],
      ribbons: [
        { r: trim, anchor: [-0.13, 1.55, 0], body: 'chest', offset: [0, 0.16, -0.155], z: -0.004 },
        { r: cape, anchor: [-0.13, 1.55, 0], body: 'chest', offset: [0, 0.16, -0.15] },
      ],
      glowColor: C.glow,
    };
  },

  // --------------------------------------------------------------------------
  poses: {
    stance: { root: [0, 0.9, 0], lean: 8, twist: -18, hipTwist: -14, head: [-4, 16],
      hL: [0.3, 1.3, -0.1], hR: [0.14, 1.04, 0.27], wR: 58,
      fL: [0.22, 0, -0.1], fR: [-0.22, 0, 0.15, 0, -20] },
    crouch: { root: [0, 0.58, 0], lean: 18, twist: -18, hipTwist: -10, head: [-12, 16],
      hL: [0.33, 0.98, -0.1], hR: [0.2, 0.78, 0.28], wR: 40,
      fL: [0.28, 0, -0.14], fR: [-0.26, 0, 0.17, 0, -20] },
    jumpUp: { root: [0, 1.0, 0], lean: 4, hL: [0.28, 1.55, -0.18], hR: [0.1, 1.42, 0.28], wR: 80, fL: [0.12, 0.38, -0.1, 30], fR: [-0.12, 0.22, 0.1, 20] },
    fall: { root: [0, 0.98, 0], lean: 6, hL: [0.32, 1.42, -0.2], hR: [0.12, 1.25, 0.3], wR: 50, fL: [0.18, 0.2, -0.12], fR: [-0.12, 0.32, 0.12, 20] },
    walk: { stride: 0.26, lift: 0.09, bob: 0.025 },
    intro: { root: [0, 0.46, 0], lean: 20, head: [25, 0], hL: [0.3, 0.95, -0.15], hR: [0.35, 0.95, 0.15], wR: -88, fL: [0.28, 0, -0.14], fR: [-0.3, 0, 0.16, 0, 0], kR: [0, -1, 0.2] },
    win: { root: [0, 0.94, 0], lean: -6, head: [-20, 0], hL: [0.1, 1.15, -0.25], hR: [0.12, 2.05, 0.15], wR: 90, fL: [0.15, 0, -0.14], fR: [-0.15, 0, 0.16] },
  },

  moves: {
    stL: [[0, 'stance'], ['s-2', { twist: -12, hL: [0.24, 1.38, -0.08] }, 'io'],
      ['s', { root: [0.08, 0.9, 0], lean: 14, twist: -42, head: [-4, 34], hL: [0.74, 1.38, -0.02] }, 'snap'], ['a+2', { root: [0.08, 0.9, 0], lean: 14, twist: -42, head: [-4, 34], hL: [0.7, 1.38, -0.02] }], ['e', 'stance', 'io']],
    stM: [[0, 'stance'], ['s-3', { twist: -38, hR: [-0.12, 0.88, 0.3], wR: -130 }, 'io'],
      ['s', { twist: 18, lean: 12, hR: [0.48, 1.45, 0.14], wR: 45 }, 'snap'], ['a+2', { twist: 22, lean: 10, hR: [0.4, 1.62, 0.1], wR: 82 }], ['e', 'stance', 'io']],
    stH: [[0, 'stance'], ['s-5', { root: [-0.04, 0.95, 0], lean: -10, twist: -12, hR: [-0.1, 1.85, 0.18], hL: [-0.05, 1.8, 0.08], wR: 150 }, 'io'],
      ['s', { root: [0.14, 0.82, 0], lean: 26, twist: 4, hR: [0.58, 1.12, 0.06], hL: [0.52, 1.14, 0.0], wR: 4, fL: [0.42, 0, -0.1] }, 'snap'],
      ['a+3', { root: [0.14, 0.8, 0], lean: 28, twist: 8, hR: [0.54, 0.92, 0.06], hL: [0.48, 0.95, 0.0], wR: -24, fL: [0.42, 0, -0.1] }], ['e', 'stance', 'io']],
    crL: [[0, 'crouch'], ['s-1', { fL: [0.4, 0.12, -0.08] }], ['s', { lean: 8, fL: [0.68, 0.05, -0.08, -10] }, 'snap'], ['a+2', { lean: 8, fL: [0.64, 0.05, -0.08] }], ['e', 'crouch']],
    crM: [[0, 'crouch'], ['s-3', { twist: -30, hR: [0.0, 0.7, 0.32], wR: 10 }], ['s', { root: [0.1, 0.55, 0], lean: 26, twist: 20, hR: [0.66, 0.55, 0.1], wR: -6 }, 'snap'], ['a+3', { root: [0.1, 0.55, 0], lean: 26, twist: 20, hR: [0.62, 0.55, 0.1], wR: -6 }], ['e', 'crouch']],
    crH: [[0, 'crouch'], ['s-3', { twist: -50, lean: 20, hR: [-0.2, 0.5, 0.36], wR: 185 }, 'io'],
      ['s', { root: [0.12, 0.45, 0], lean: 34, twist: 34, hR: [0.58, 0.32, 0.18], wR: -6, fL: [0.4, 0, -0.16] }, 'snap'],
      ['a+4', { root: [0.12, 0.45, 0], lean: 34, twist: 48, hR: [0.44, 0.34, -0.1], wR: 30, fL: [0.4, 0, -0.16] }], ['e', 'crouch', 'io']],
    jL: [[0, 'fall'], ['s', { lean: 14, hL: [0.6, 1.2, -0.05], fL: [0.2, 0.42, -0.1] }, 'snap'], ['a', { lean: 14, hL: [0.58, 1.2, -0.05], fL: [0.2, 0.42, -0.1] }], ['e', 'fall']],
    jM: [[0, 'fall'], ['s-2', { hR: [0.0, 1.62, 0.25], wR: 125 }], ['s', { lean: 18, hR: [0.5, 1.0, 0.15], wR: -32 }, 'snap'], ['a', { lean: 18, hR: [0.45, 0.92, 0.15], wR: -45 }], ['e', 'fall']],
    jH: [[0, 'fall'], ['s-4', { lean: -6, hR: [-0.08, 1.78, 0.15], hL: [-0.04, 1.74, 0.05], wR: 158, fL: [0.25, 0.5, -0.1], fR: [0.05, 0.45, 0.1] }],
      ['s', { lean: 26, hR: [0.45, 0.72, 0.1], hL: [0.4, 0.76, 0.02], wR: -60, fL: [0.22, 0.4, -0.1], fR: [-0.05, 0.3, 0.1] }, 'snap'],
      ['a', { lean: 28, hR: [0.4, 0.62, 0.1], hL: [0.36, 0.66, 0.02], wR: -82, fL: [0.22, 0.4, -0.1], fR: [-0.05, 0.3, 0.1] }], ['e', 'fall']],
    fH: [[0, 'stance'], ['s-8', { root: [0.02, 1.0, 0], lean: -12, hR: [-0.12, 1.88, 0.15], hL: [-0.08, 1.85, 0.05], wR: 128, fR: [-0.25, 0.05, 0.15, -30] }, 'io'],
      ['s', { root: [0.16, 0.78, 0], lean: 34, hR: [0.56, 0.86, 0.05], hL: [0.5, 0.9, 0.0], wR: -28, fL: [0.45, 0, -0.1] }, 'snap'],
      ['a+3', { root: [0.16, 0.76, 0], lean: 36, hR: [0.54, 0.74, 0.05], hL: [0.48, 0.78, 0.0], wR: -40, fL: [0.45, 0, -0.1] }], ['e', 'stance', 'io']],
    throw: [[0, 'stance'], ['s', { root: [0.12, 0.86, 0], lean: 18, twist: 0, hL: [0.62, 1.25, -0.1], hR: [0.6, 1.2, 0.12], wR: null }, 'snap'], ['e', 'throwWhiff']],
    Q: [[0, 'stance'], ['s-5', { twist: -48, lean: 4, hR: [-0.3, 1.15, 0.32], wR: 200 }, 'io'],
      ['s', { root: [0.08, 0.86, 0], twist: 30, lean: 16, hR: [0.58, 1.12, 0.12], wR: 4, hL: [0.1, 1.2, -0.25] }, 'snap'],
      ['s+8', { root: [0.08, 0.86, 0], twist: 34, lean: 16, hR: [0.5, 1.02, 0.0], wR: -10, hL: [0.1, 1.2, -0.25] }], ['e', 'stance', 'io']],
    W: [[0, 'stance'], ['s-3', { root: [0, 0.66, 0], lean: 22, hR: [0.3, 0.6, 0.22], hL: [0.25, 0.65, 0.05], wR: 64 }, 'snap'],
      ['s', { root: [0, 1.0, 0], lean: -4, head: [-20, 0], hR: [0.32, 1.95, 0.12], hL: [0.22, 1.7, -0.1], wR: 86, fL: [0.12, 0.35, -0.1, 30], fR: [-0.08, 0.55, 0.1, 30] }, 'snap'],
      ['a', { root: [0, 1.0, 0], lean: -8, head: [-25, 0], hR: [0.28, 2.0, 0.1], hL: [0.18, 1.75, -0.1], wR: 92, fL: [0.12, 0.35, -0.1, 30], fR: [-0.08, 0.55, 0.1, 30] }], ['e', 'fall', 'io']],
    E: [[0, 'stance'], ['s-4', { root: [-0.05, 0.78, 0], lean: 22, twist: -30, hL: [0.15, 1.2, -0.22] }, 'io'],
      ['s', { root: [0.16, 0.84, 0], lean: 36, twist: -64, head: [-10, 50], hL: [0.18, 1.15, -0.2], hR: [-0.22, 1.0, 0.3], wR: 195, fL: [0.42, 0, -0.1], fR: [-0.45, 0.12, 0.12, -40] }, 'snap'],
      ['a', { root: [0.16, 0.84, 0], lean: 36, twist: -64, head: [-10, 50], hL: [0.18, 1.15, -0.2], hR: [-0.22, 1.0, 0.3], wR: 195, fL: [0.42, 0, -0.1], fR: [-0.45, 0.12, 0.12, -40] }], ['e', 'stance', 'io']],
    R: [[0, 'stance'], ['s-4', { root: [-0.06, 0.8, 0], lean: 10, twist: -40, hR: [-0.15, 1.15, 0.3], wR: 0 }, 'io'],
      ['s', { root: [0.22, 0.8, 0], lean: 30, twist: 10, hR: [0.78, 1.25, 0.05], hL: [-0.05, 1.15, -0.3], wR: 2, fL: [0.55, 0, -0.1], fR: [-0.5, 0.06, 0.12, -30] }, 'snap'],
      ['a', { root: [0.22, 0.8, 0], lean: 30, twist: 10, hR: [0.78, 1.25, 0.05], hL: [-0.05, 1.15, -0.3], wR: 2, fL: [0.55, 0, -0.1], fR: [-0.5, 0.06, 0.12, -30] }], ['e', 'stance', 'io']],
  },
  locks: {
    throw: {
      atk: [[0, 'throwReach'], [12, { root: [0.05, 0.92, 0], lean: -6, hL: [0.45, 1.6, -0.08], hR: [0.42, 1.55, 0.12], wR: null }], [26, { root: [0.1, 0.84, 0], lean: 30, twist: 30, hL: [0.6, 1.0, -0.1], hR: [0.55, 0.95, 0.15], wR: null }, 'snap'], [34, 'stance']],
      vic: [[0, 'held'], [14, 'held'], [26, 'airHit']],
    },
    verdict: {
      atk: [[0, { root: [0.22, 0.8, 0], lean: 30, hR: [0.78, 1.25, 0.05], wR: 2, fL: [0.55, 0, -0.1], fR: [-0.5, 0.06, 0.12, -30] }],
        [18, { root: [0, 0.92, 0], lean: -6, head: [-30, 0], hR: [0.22, 2.02, 0.1], hL: [0.15, 1.9, -0.05], wR: 92 }, 'io'],
        [70, { root: [0, 0.95, 0], lean: -10, head: [-35, 0], hR: [0.2, 2.05, 0.1], hL: [0.14, 1.92, -0.05], wR: 95 }],
        [80, { root: [0.15, 0.7, 0], lean: 30, hR: [0.6, 0.8, 0.05], hL: [0.55, 0.84, 0.0], wR: -40, fL: [0.45, 0, -0.12] }, 'snap'],
        [104, 'stance', 'io']],
      vic: [[0, 'hitHigh'], [18, 'airHit'], [104, 'airHit']],
    },
  },
};
