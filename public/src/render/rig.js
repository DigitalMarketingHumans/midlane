// IK-driven humanoid rig. Poses specify hip placement, torso lean/twist and
// hand/foot targets; two-bone IK solves elbows and knees.
//
// Model space: +Z = forward (toward opponent), +Y = up, +X = character's LEFT
// (away from camera). Pose arrays use [fwd, up, side] with side + = character's
// RIGHT (toward camera), which is the intuitive way to author them.
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const DEFAULT_DIMS = {
  hipW: 0.10, spine: 0.30, shoulderH: 0.21, shoulderW: 0.20, neck: 0.43,
  upper: 0.30, fore: 0.29, thigh: 0.47, shin: 0.46, ankle: 0.07,
};

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();

export function P2M(p, out = new THREE.Vector3()) {
  return out.set(-(p[2] || 0), p[1], p[0]);
}

export class Rig {
  constructor(dims = {}) {
    this.d = Object.assign({}, DEFAULT_DIMS, dims);
    const d = this.d;
    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.chest = new THREE.Group();
    this.head = new THREE.Group();
    this.neckBase = new THREE.Group();
    this.root.add(this.hips);
    this.hips.add(this.chest);
    this.chest.position.set(0, d.spine, 0);
    this.chest.add(this.head);
    this.head.position.set(0, d.neck, 0);
    this.chest.add(this.neckBase);
    this.neckBase.position.set(0, d.shoulderH + 0.04, 0);
    this.seg = {};
    for (const k of ['uaL', 'uaR', 'faL', 'faR', 'thL', 'thR', 'shL', 'shR']) {
      const g = new THREE.Group();
      this.root.add(g);
      this.seg[k] = g;
    }
    this.hand = { L: new THREE.Group(), R: new THREE.Group() };
    this.foot = { L: new THREE.Group(), R: new THREE.Group() };
    for (const g of [this.hand.L, this.hand.R, this.foot.L, this.foot.R]) this.root.add(g);
    // Joint positions (model space) after each solve
    this.j = {};
    for (const k of ['shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hpL', 'hpR', 'knL', 'knR', 'ftL', 'ftR', 'chest', 'head', 'hips']) this.j[k] = new THREE.Vector3();
  }

  // Solve two-bone IK; writes elbow/knee into `mid`, clamped end into `end`.
  static ik(A, T, l1, l2, poleDir, mid, end) {
    _v.subVectors(T, A);
    let dlen = _v.length();
    const maxR = l1 + l2 - 0.002, minR = Math.abs(l1 - l2) + 0.01;
    if (dlen < 1e-5) { _v.set(0, -1, 0); dlen = minR; }
    const dir = _v.divideScalar(dlen);
    dlen = Math.min(maxR, Math.max(minR, dlen));
    end.copy(A).addScaledVector(dir, dlen);
    const a = (l1 * l1 - l2 * l2 + dlen * dlen) / (2 * dlen);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // pole component perpendicular to dir
    _z.copy(poleDir).addScaledVector(dir, -poleDir.dot(dir));
    if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(dir, -dir.z);
    _z.normalize();
    mid.copy(A).addScaledVector(dir, a).addScaledVector(_z, h);
  }

  // Orient a segment group so its local -Y runs from A to B; hint orients local +Z.
  static orient(g, A, B, hint) {
    g.position.copy(A);
    _y.subVectors(A, B).normalize();
    _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
    if (_z.lengthSq() < 1e-6) { _z.set(1, 0, 0).addScaledVector(_y, -_y.x); }
    _z.normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    g.quaternion.setFromRotationMatrix(_m);
  }

  // Orient a group so local +Y points along dir, local +X stays close to sideAxis.
  static aim(g, dir, sideAxis) {
    _y.copy(dir).normalize();
    _x.copy(sideAxis).addScaledVector(_y, -sideAxis.dot(_y));
    if (_x.lengthSq() < 1e-6) _x.set(0, 0, 1).addScaledVector(_y, -_y.z);
    _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    g.quaternion.setFromRotationMatrix(_m);
  }

  apply(P) {
    const d = this.d;
    const j = this.j;
    // Hips & torso
    this.hips.position.set(-(P.root[2] || 0), P.root[1], P.root[0]);
    this.hips.rotation.set((P.lean || 0) * 0.45 * D2R, (P.hipTwist || 0) * D2R, (P.tilt || 0) * D2R, 'YXZ');
    this.chest.rotation.set((P.lean || 0) * 0.55 * D2R + (P.chestLean || 0) * D2R, ((P.twist || 0) - (P.hipTwist || 0)) * D2R, (P.chestTilt || 0) * D2R, 'YXZ');
    this.head.rotation.set((P.head ? P.head[0] : 0) * D2R, (P.head ? P.head[1] : 0) * D2R, (P.head ? (P.head[2] || 0) : 0) * D2R, 'YXZ');
    this.hips.updateMatrix();
    this.chest.updateMatrix();
    _m2.multiplyMatrices(this.hips.matrix, this.chest.matrix);
    j.hips.copy(this.hips.position);
    j.chest.set(0, 0, 0).applyMatrix4(_m2);
    j.shL.set(d.shoulderW, d.shoulderH, 0).applyMatrix4(_m2);
    j.shR.set(-d.shoulderW, d.shoulderH, 0).applyMatrix4(_m2);
    j.hpL.set(d.hipW, -0.02, 0).applyMatrix4(this.hips.matrix);
    j.hpR.set(-d.hipW, -0.02, 0).applyMatrix4(this.hips.matrix);
    // Arms
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      const target = P2M(P['h' + s], _v.clone());
      const pole = P['e' + s] ? P2M(P['e' + s], new THREE.Vector3()) : new THREE.Vector3(0.35 * sign, -0.7, -0.55);
      Rig.ik(j['sh' + s], target, d.upper, d.fore, pole, j['el' + s], j['ha' + s]);
      Rig.orient(this.seg['ua' + s], j['sh' + s], j['el' + s], _v.set(0, 0, 1));
      Rig.orient(this.seg['fa' + s], j['el' + s], j['ha' + s], _v.set(0, 0, 1));
      const hg = this.hand[s];
      hg.position.copy(j['ha' + s]);
      const wa = P['w' + s];
      if (wa != null) {
        const yaw = (P['w' + s + 'y'] || 0) * D2R;
        const a = wa * D2R;
        const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(a), Math.sin(a), Math.cos(yaw) * Math.cos(a));
        Rig.aim(hg, dir, new THREE.Vector3(1, 0, 0));
      } else {
        // fist follows forearm; local +Y continues the forearm direction
        const dir = new THREE.Vector3().subVectors(j['ha' + s], j['el' + s]);
        Rig.aim(hg, dir, new THREE.Vector3(1, 0, 0));
      }
    }
    // Legs
    for (const s of ['L', 'R']) {
      const sign = s === 'L' ? 1 : -1;
      const fp = P['f' + s];
      const target = new THREE.Vector3(-(fp[2] || 0), (fp[1] || 0) + d.ankle, fp[0]);
      const pole = P['k' + s] ? P2M(P['k' + s], new THREE.Vector3()) : new THREE.Vector3(0.18 * sign, 0, 1);
      Rig.ik(j['hp' + s], target, d.thigh, d.shin, pole, j['kn' + s], j['ft' + s]);
      Rig.orient(this.seg['th' + s], j['hp' + s], j['kn' + s], _v.set(0, 0, 1));
      Rig.orient(this.seg['sh' + s], j['kn' + s], j['ft' + s], _v.set(0, 0, 1));
      const fg = this.foot[s];
      fg.position.copy(j['ft' + s]);
      fg.rotation.set(-(fp[3] || 0) * D2R, (fp[4] || 0) * D2R, 0, 'YXZ');
    }
    j.head.set(0, 0, 0).applyMatrix4(this.head.matrixWorld);
  }
}
