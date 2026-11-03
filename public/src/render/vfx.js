// VFX system: GPU-instanced velocity-stretched particles, shockwave rings, flashes,
// pooled point lights, beams/pillars, weapon trails and camera shake.
// All coordinates are world metres (sim sub-px / 10000).
import * as THREE from 'three';

const MAX_P = 6000;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (v, def) => (v === undefined ? def : Array.isArray(v) ? rand(v[0], v[1]) : v);

// shape ids: 0 soft dot, 1 spark streak, 2 shard (diamond), 3 smoke puff, 4 star, 5 ring-dot
const SHAPES = { soft: 0, spark: 1, shard: 2, smoke: 3, star: 4, ring: 5 };

const P_VS = /* glsl */`
  attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec3 iSz; // w, stretch, shape
  varying vec4 vCol; varying vec2 vUv; varying float vShape;
  void main() {
    vCol = iCol; vUv = uv; vShape = iSz.z;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec3 vv = (modelViewMatrix * vec4(iPos + iVel * 0.016, 1.0)).xyz - mv.xyz;
    vec2 d = vv.xy; float L = length(d);
    vec2 dir = L > 1e-5 ? d / L : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = iSz.x;
    float stretch = 1.0 + iSz.y * L * 60.0;
    vec2 off = dir * position.x * w * stretch + nrm * position.y * w;
    if (iSz.z > 1.5 && iSz.z < 2.5) { off = vec2(position.x, position.y) * w; }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
  }
`;
const P_FS = /* glsl */`
  varying vec4 vCol; varying vec2 vUv; varying float vShape;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float a;
    if (vShape < 0.5) { a = exp(-dot(p, p) * 3.2); }
    else if (vShape < 1.5) { a = exp(-p.y * p.y * 9.0) * (1.0 - abs(p.x)); a *= a > 0.0 ? 1.0 : 0.0; }
    else if (vShape < 2.5) { a = 1.0 - smoothstep(0.75, 1.0, abs(p.x) + abs(p.y)); }
    else if (vShape < 3.5) { a = smoothstep(1.0, 0.1, length(p)) * 0.55; }
    else if (vShape < 4.5) { float r = length(p); float s = max(abs(p.x * p.y) * 8.0, 0.0); a = exp(-r * r * 4.0) + exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.5) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.5); a = min(a, 1.4); }
    else { float r = length(p); a = smoothstep(0.55, 0.75, r) * (1.0 - smoothstep(0.85, 1.0, r)); }
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * a * vCol.a, a * vCol.a);
  }
`;

class ParticlePool {
  constructor(additive) {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(MAX_P * 3);
    this.vel = new Float32Array(MAX_P * 3);
    this.col = new Float32Array(MAX_P * 4);
    this.sz = new Float32Array(MAX_P * 3);
    this.aPos = new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.InstancedBufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSz = new THREE.InstancedBufferAttribute(this.sz, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel);
    g.setAttribute('iCol', this.aCol); g.setAttribute('iSz', this.aSz);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      premultipliedAlpha: true,
    });
    if (!additive) this.mat.blending = THREE.CustomBlending, this.mat.blendSrc = THREE.OneFactor, this.mat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.g = g;
    this.list = [];
  }
  add(p) { if (this.list.length < MAX_P) this.list.push(p); }
  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const u = p.t / p.life;
      p.vy -= p.g * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor && p.y < 0.01) { p.y = 0.01; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.7; }
      const o3 = n * 3, o4 = n * 4;
      this.pos[o3] = p.x; this.pos[o3 + 1] = p.y; this.pos[o3 + 2] = p.z;
      this.vel[o3] = p.vx; this.vel[o3 + 1] = p.vy; this.vel[o3 + 2] = p.vz;
      const fade = p.fadeIn ? Math.min(1, u * 6) * (1 - u) : (1 - u * u);
      const c = p.c2 ? lerpColor(p.c, p.c2, u) : p.c;
      this.col[o4] = c.r; this.col[o4 + 1] = c.g; this.col[o4 + 2] = c.b; this.col[o4 + 3] = fade * p.a;
      this.sz[o3] = p.s0 + (p.s1 - p.s0) * u; this.sz[o3 + 1] = p.stretch; this.sz[o3 + 2] = p.shape;
      L[n] = p; n++;
    }
    L.length = n;
    this.g.instanceCount = n;
    this.aPos.needsUpdate = true; this.aVel.needsUpdate = true; this.aCol.needsUpdate = true; this.aSz.needsUpdate = true;
  }
}
const _c = new THREE.Color();
function lerpColor(a, b, t) { return _c.setRGB(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t); }

function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class VFX {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticlePool(true);
    this.norm = new ParticlePool(false);
    scene.add(this.add.mesh); scene.add(this.norm.mesh);
    this.items = [];
    this.flashTex = radialTex();
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 1.6);
      l.userData = { t: 0, life: 0, i0: 0 };
      scene.add(l); this.lights.push(l);
    }
    this.shakeAmt = 0; this.shakeT = 0;
    this.trails = [];
    this.time = 0;
  }

  // ---- particles ---------------------------------------------------------
  burst(o) {
    const n = o.count ?? 20;
    const pool = o.additive === false ? this.norm : this.add;
    const c = new THREE.Color(o.color ?? 0xffffff);
    const c2 = o.color2 != null ? new THREE.Color(o.color2) : null;
    const shape = SHAPES[o.shape || 'spark'];
    const intensity = o.intensity ?? 1.6;
    c.multiplyScalar(intensity); if (c2) c2.multiplyScalar(intensity);
    for (let i = 0; i < n; i++) {
      const ang = o.dir !== undefined ? o.dir + rand(-(o.spread ?? Math.PI), o.spread ?? Math.PI) : rand(0, Math.PI * 2);
      const sp = pick(o.speed, 4);
      const zsp = pick(o.zspeed, sp * 0.3);
      pool.add({
        x: o.x + rand(-(o.jx || 0), o.jx || 0), y: o.y + rand(-(o.jy || 0), o.jy || 0), z: (o.z || 0) + rand(-(o.jz || 0.05), o.jz || 0.05),
        vx: Math.cos(ang) * sp + (o.vx || 0), vy: Math.sin(ang) * sp + (o.vy || 0), vz: rand(-zsp, zsp),
        t: 0, life: pick(o.life, 0.4), g: o.gravity ?? 0, drag: o.drag ?? 0.92,
        s0: pick(o.size, 0.06), s1: o.size1 !== undefined ? pick(o.size1, 0) : pick(o.size, 0.06) * 0.3,
        stretch: o.stretch ?? (shape === 1 ? 1 : 0), shape, c, c2, a: o.alpha ?? 1, floor: !!o.floor, fadeIn: !!o.fadeIn,
      });
    }
  }
  // Single particle (for continuous emitters / trails)
  particle(o) { this.burst(Object.assign({ count: 1 }, o)); }

  // ---- meshes with lifetimes ------------------------------------------------
  _item(obj, life, upd) { this.scene.add(obj); this.items.push({ obj, t: 0, life, upd }); return obj; }

  ring(o) {
    const r0 = o.r0 ?? 0.1, r1 = o.r1 ?? 1.2, th = o.thick ?? 0.14;
    const geo = new THREE.PlaneGeometry(2 * r1 + 0.2, 2 * r1 + 0.2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 2) }, r: { value: r0 }, th: { value: th }, op: { value: 1 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 color; uniform float r; uniform float th; uniform float op; varying vec2 vP; void main(){ float d = length(vP); float a = smoothstep(r - th, r - th * 0.4, d) * (1.0 - smoothstep(r - th * 0.12, r, d)); a += 0.25 * exp(-pow((d - r) / (th * 1.5), 2.0)); if (a < 0.003) discard; gl_FragColor = vec4(color * a * op, a * op); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(o.x, o.y, o.z || 0);
    if (o.axis === 'y') m.rotation.x = -Math.PI / 2;
    if (o.axis === 'x') m.rotation.y = Math.PI / 2;
    if (o.tilt) m.rotation.x += o.tilt;
    m.renderOrder = 22;
    return this._item(m, o.life ?? 0.35, (it, u) => {
      mat.uniforms.r.value = r0 + (r1 - r0) * (1 - Math.pow(1 - u, 2.5));
      mat.uniforms.op.value = (1 - u) * (o.alpha ?? 1);
    });
  }

  flash(o) {
    const mat = new THREE.SpriteMaterial({ map: this.flashTex, color: new THREE.Color(o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: o.depthTest ?? true });
    const s = new THREE.Sprite(mat);
    s.position.set(o.x, o.y, o.z ?? 0.3);
    const sz = o.size ?? 1.2;
    s.renderOrder = 30;
    return this._item(s, o.life ?? 0.16, (it, u) => {
      const k = o.grow ? 0.4 + u * 0.9 : 1 - u * 0.3;
      s.scale.set(sz * k, sz * k * (o.squash ?? 1), 1);
      mat.opacity = 1 - u;
    });
  }

  light(o) {
    let best = this.lights[0];
    for (const l of this.lights) if (l.userData.life - l.userData.t < best.userData.life - best.userData.t) best = l;
    best.color.set(o.color ?? 0xffffff);
    best.position.set(o.x, o.y, o.z ?? 1.0);
    best.distance = o.distance ?? 6;
    best.userData.t = 0; best.userData.life = o.life ?? 0.3; best.userData.i0 = o.intensity ?? 12;
    best.intensity = best.userData.i0;
  }

  beam(o) {
    const len = Math.hypot(o.x1 - o.x0, o.y1 - o.y0);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    const m1 = new THREE.Mesh(geo, mat), m2 = new THREE.Mesh(geo, core);
    g.add(m1, m2);
    g.position.set((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, o.z || 0);
    g.rotation.z = Math.atan2(o.y1 - o.y0, o.x1 - o.x0) - Math.PI / 2;
    const w = o.width ?? 0.3;
    return this._item(g, o.life ?? 0.4, (it, u) => {
      const k = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      m1.scale.set(w * k, len, w * k); m2.scale.set(w * 0.35 * k, len, w * 0.35 * k);
      mat.opacity = k; core.opacity = k;
    });
  }

  pillar(o) {
    const h = o.height ?? 8, r = o.radius ?? 0.6;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color ?? 0xffe08a).multiplyScalar(o.intensity ?? 2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, core);
    g.add(a, b);
    g.position.set(o.x, h / 2 + (o.y || 0), o.z || 0);
    return this._item(g, o.life ?? 0.8, (it, u) => {
      const k = u < 0.1 ? u / 0.1 : 1 - Math.pow((u - 0.1) / 0.9, 2);
      a.scale.set(r * (0.6 + 0.4 * k), h, r * (0.6 + 0.4 * k));
      b.scale.set(r * 0.4 * k, h, r * 0.4 * k);
      mat.opacity = k * (o.alpha ?? 0.8); core.opacity = k;
      g.rotation.y += 0.05;
    });
  }

  // Arbitrary object with a custom updater: upd(obj, u, dt)
  custom(obj, life, upd) { return this._item(obj, life, (it, u, dt) => upd(obj, u, dt)); }

  shake(amount, dur = 0.25) {
    if (amount > this.shakeAmt * (this.shakeT > 0 ? 1 : 0)) { this.shakeAmt = amount; this.shakeT = dur; this.shakeDur = dur; }
  }
  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeT / this.shakeDur;
    const a = this.shakeAmt * k * k;
    return [Math.sin(this.time * 83) * a, Math.cos(this.time * 71) * a * 0.7];
  }

  // ---- weapon trails ---------------------------------------------------------
  makeTrail(color, n = 14) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 2 * 3);
    const al = new Float32Array(n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(al, 1));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color).multiplyScalar(2.2) } },
      vertexShader: 'attribute float alpha; varying float vA; varying float vS; void main(){ vA = alpha; vS = mod(float(gl_VertexID), 2.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 color; varying float vA; varying float vS; void main(){ float e = mix(0.35, 1.0, vS); gl_FragColor = vec4(color * vA * e, vA * e); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 25;
    this.scene.add(mesh);
    const tr = { mesh, geo, pos, al, n, hist: [], on: false };
    this.trails.push(tr);
    return tr;
  }
  feedTrail(tr, tip, base, on) {
    if (on) tr.hist.unshift([tip.x, tip.y, tip.z, base.x, base.y, base.z, 1]);
    for (const h of tr.hist) h[6] -= on ? 0.075 : 0.16;
    while (tr.hist.length > tr.n || (tr.hist.length && tr.hist[tr.hist.length - 1][6] <= 0)) tr.hist.pop();
    const H = tr.hist;
    for (let i = 0; i < tr.n; i++) {
      const h = H[Math.min(i, H.length - 1)];
      const o = i * 6;
      if (!h) { tr.pos.fill(0); tr.al.fill(0); break; }
      tr.pos[o] = h[0]; tr.pos[o + 1] = h[1]; tr.pos[o + 2] = h[2];
      tr.pos[o + 3] = h[3]; tr.pos[o + 4] = h[4]; tr.pos[o + 5] = h[5];
      const a = i < H.length ? Math.max(0, h[6]) * (1 - i / tr.n) : 0;
      tr.al[i * 2] = a; tr.al[i * 2 + 1] = a;
    }
    tr.geo.attributes.position.needsUpdate = true;
    tr.geo.attributes.alpha.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.add.update(dt); this.norm.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const u = it.t / it.life;
      if (u >= 1) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
        this.items.splice(i, 1);
        continue;
      }
      it.upd(it, u, dt);
    }
    for (const l of this.lights) {
      const d = l.userData;
      if (d.t < d.life) { d.t += dt; const k = 1 - d.t / d.life; l.intensity = d.i0 * k * k; }
      else l.intensity = 0;
    }
    if (this.shakeT > 0) this.shakeT -= dt;
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.obj);
    this.items = [];
    this.add.list.length = 0; this.norm.list.length = 0;
    for (const tr of this.trails) tr.hist.length = 0;
  }
}
