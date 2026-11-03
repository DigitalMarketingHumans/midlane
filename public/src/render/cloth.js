// Lightweight verlet ribbon for capes, scarves and sashes (cosmetic only).
import * as THREE from 'three';

export class Ribbon {
  // opts: { segs, len, width, taper, mat, stiff, gravity, drag }
  constructor(opts) {
    this.o = Object.assign({ segs: 8, len: 1, width: 0.5, taper: 1, stiff: 0.6, gravity: 9.8, drag: 0.92, side: new THREE.Vector3(1, 0, 0) }, opts);
    const n = this.o.segs + 1;
    this.p = []; this.q = [];
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3(0, -i * this.seg(), -0.05 * i)); this.q.push(this.p[i].clone()); }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = 0; uv[i * 4 + 1] = 1 - i / (n - 1); uv[i * 4 + 2] = 1; uv[i * 4 + 3] = 1 - i / (n - 1);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, this.o.mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.init = false;
  }
  seg() { return this.o.len / this.o.segs; }

  // anchor: model-space Vector3; accel: model-space external acceleration; dt seconds.
  // collide(p) can push a point out of the body.
  update(anchor, accel, dt, collide, sideAxis) {
    const P = this.p, Q = this.q, n = P.length, L = this.seg();
    if (!this.init) {
      for (let i = 0; i < n; i++) { P[i].set(anchor.x, anchor.y - i * L, anchor.z - 0.04 * i); Q[i].copy(P[i]); }
      this.init = true;
    }
    dt = Math.min(dt, 1 / 30);
    const g = this.o.gravity, drag = this.o.drag;
    P[0].copy(anchor); Q[0].copy(anchor);
    const tmp = new THREE.Vector3();
    for (let i = 1; i < n; i++) {
      tmp.copy(P[i]);
      const vx = (P[i].x - Q[i].x) * drag, vy = (P[i].y - Q[i].y) * drag, vz = (P[i].z - Q[i].z) * drag;
      P[i].x += vx + accel.x * dt * dt;
      P[i].y += vy + (accel.y - g) * dt * dt;
      P[i].z += vz + accel.z * dt * dt;
      Q[i].copy(tmp);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) {
        const a = P[i - 1], b = P[i];
        tmp.subVectors(b, a);
        const d = tmp.length() || 1e-5;
        const diff = (d - L) / d;
        if (i === 1) b.addScaledVector(tmp, -diff);
        else { a.addScaledVector(tmp, diff * 0.5); b.addScaledVector(tmp, -diff * 0.5); }
      }
      if (collide) for (let i = 1; i < n; i++) collide(P[i], i);
      P[0].copy(anchor);
    }
    // write strip
    const side = sideAxis || this.o.side;
    const w0 = this.o.width / 2;
    for (let i = 0; i < n; i++) {
      const w = w0 * (1 - (1 - this.o.taper) * (i / (n - 1)));
      const o = i * 6;
      this.pos[o] = P[i].x + side.x * w; this.pos[o + 1] = P[i].y + side.y * w; this.pos[o + 2] = P[i].z + side.z * w;
      this.pos[o + 3] = P[i].x - side.x * w; this.pos[o + 4] = P[i].y - side.y * w; this.pos[o + 5] = P[i].z - side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
