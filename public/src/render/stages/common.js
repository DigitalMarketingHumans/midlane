// Shared helpers for stage environments: seeded RNG + JS noise, geometry
// transform/paint/merge, procedural canvas textures, GPU-animated billboard
// particle systems, sky domes, shader-injection helpers and shared GLSL noise.
// Everything is procedural; every resource a stage creates goes through a Kit so
// dispose() can free it.
import * as THREE from 'three';
import { toonRamp } from '../toon.js';

// ---------------------------------------------------------------------------
// Random / noise (JS side, used at build time)
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf);
}
export function fbm3(x, y, z = 0, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += noise3(x, y, z) * a; n += a; x *= 2.03; y *= 2.01; z *= 1.97; a *= 0.5; }
  return s / n;
}
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const col = (c) => new THREE.Color(c);

// ---------------------------------------------------------------------------
// Geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
// Transform a geometry in place: {x,y,z, rx,ry,rz, s, sx,sy,sz}
export function xf(geo, o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// Vertex colours: c is a Color, or fn(x,y,z,nx,ny,nz,i) -> Color
export function paint(geo, c) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const P = g.attributes.position, N = g.attributes.normal;
  const arr = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const cc = typeof c === 'function'
      ? c(P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 1, N ? N.getZ(i) : 0, i)
      : c;
    arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Add a float attribute: v is a number or fn(x,y,z,i) -> number
export function attr(geo, name, v, size = 1) {
  const P = geo.attributes.position;
  const arr = new Float32Array(P.count * size);
  for (let i = 0; i < P.count; i++) {
    const r = typeof v === 'function' ? v(P.getX(i), P.getY(i), P.getZ(i), i) : v;
    if (size === 1) arr[i] = r; else for (let k = 0; k < size; k++) arr[i * size + k] = r[k];
  }
  geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  return geo;
}

// Merge geometries into one non-indexed geometry. Missing attributes are
// zero-filled (colour defaults to white). Inputs are disposed.
export function merge(list) {
  const geos = list.filter(Boolean).map((g) => (g.index ? g.toNonIndexed() : g));
  const names = new Map();
  for (const g of geos) for (const [n, a] of Object.entries(g.attributes)) if (!names.has(n)) names.set(n, a.itemSize);
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [n, size] of names) {
    const arr = new Float32Array(total * size);
    if (n === 'color') arr.fill(1);
    let off = 0;
    for (const g of geos) {
      const a = g.attributes[n], cnt = g.attributes.position.count;
      if (a) {
        if (a.array.length === cnt * size && !a.isInterleavedBufferAttribute) arr.set(a.array, off);
        else for (let i = 0; i < cnt; i++) for (let k = 0; k < size; k++) arr[off + i * size + k] = a.getComponent(i, k);
      }
      off += cnt * size;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  for (const g of list) if (g) g.dispose();
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Low-poly displaced rock (faceted). Returns non-indexed geometry with flat normals.
export function rockGeo(rand, o = {}) {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 1);
  const P = g.attributes.position;
  const seed = rand() * 100;
  const jag = o.jag ?? 0.28, flat = o.flat ?? 0.35, fq = o.freq ?? 1.6;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const n = fbm3(x * fq + seed, y * fq + seed * 0.7, z * fq - seed, 3);
    const k = 1 + jag * (n - 0.5) * 2;
    x *= k; y *= k; z *= k;
    if (y < -flat) y = -flat + (y + flat) * 0.15;
    if (o.top != null && y > o.top) y = o.top + (y - o.top) * 0.3;
    P.setXYZ(i, x * (o.sx ?? 1), y * (o.sy ?? 1), z * (o.sz ?? 1));
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Canvas textures
export function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso || 1;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  return t;
}
// Call fn(ox, oy) at the wrap offsets needed for a shape at (x,y) with radius r in a w×h tile.
export function wrapDraw(w, h, x, y, r, fn) {
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
    if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
    fn(x + ox, y + oy);
  }
}
// Speckle noise overlay on a canvas (tileable since it's per-pixel random).
// Blur the whole canvas once (cheap compared to per-shape filters).
export function blurCanvas(x, w, h, px) {
  const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
  const y = c2.getContext('2d', { willReadFrequently: true });
  y.drawImage(x.canvas, 0, 0);
  x.save(); x.filter = `blur(${px}px)`;
  // draw wrapped copies so the blur stays tileable
  for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) x.drawImage(c2, ox, oy);
  x.restore();
}
export function speckle(x, w, h, rand, amt = 18, alpha = 1) {
  const img = x.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amt;
    d[i] = Math.max(0, Math.min(255, d[i] + n)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n)); d[i + 3] = d[i + 3] * alpha;
  }
  x.putImageData(img, 0, 0);
}
// Tileable value-noise blotches painted with low alpha (cloudy variation).
export function blotches(x, w, h, rand, n, rMin, rMax, colors, alpha = 0.12) {
  for (let i = 0; i < n; i++) {
    const cx = rand() * w, cy = rand() * h, r = rMin + rand() * (rMax - rMin);
    const c = colors[Math.floor(rand() * colors.length)];
    wrapDraw(w, h, cx, cy, r, (px, py) => {
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = alpha; x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    });
  }
  x.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Shared GLSL
export const GLSL_NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1,0,0)), c = hash13(i + vec3(0,1,0)), d = hash13(i + vec3(1,1,0));
  float e = hash13(i + vec3(0,0,1)), f1 = hash13(i + vec3(1,0,1)), g = hash13(i + vec3(0,1,1)), h = hash13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = m * p; a *= 0.5; } return s; }
float fbm3x(vec2 p){ float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = m * p; a *= 0.5; } return s / 0.875; }
float fbm3d(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
// Stars: cell-hashed points on the view sphere.
float starField(vec3 d, float scale, float density, float t){
  vec3 p = d * scale; vec3 c = floor(p); vec3 f = fract(p) - 0.5;
  vec3 h = hash33(c);
  if (h.x > density) return 0.0;
  vec3 o = (h - 0.5) * 0.6; float r = length(f - o);
  float tw = 0.6 + 0.4 * sin(t * (1.0 + h.y * 3.0) + h.z * 40.0);
  return smoothstep(0.09, 0.0, r) * tw * (0.4 + h.z * 1.2);
}
`;

export const FOG_FRAG_ADD = /* glsl */`
#ifdef USE_FOG
  float fogF = smoothstep(fogNear, fogFar, vFogDepth);
#else
  float fogF = 0.0;
#endif
`;

// ---------------------------------------------------------------------------
// Kit: material/texture factory that tracks resources for disposal.
export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.hi = ctx.quality !== 'low';
    this.time = { value: 0 };
    this.things = [];
    this.aniso = Math.min(8, (ctx.renderer && ctx.renderer.capabilities && ctx.renderer.capabilities.getMaxAnisotropy()) || 1);
    this.updaters = [];
  }
  t(x) { this.things.push(x); return x; }
  tex(w, h, draw, o) { return this.t(canvasTex(w, h, draw, o)); }
  toon(o = {}) { return this.t(new THREE.MeshToonMaterial(Object.assign({ gradientMap: toonRamp() }, o))); }
  std(o = {}) { return this.t(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.92, metalness: 0 }, o))); }
  lambert(o = {}) { return this.t(new THREE.MeshLambertMaterial(o)); }
  glow(color, k = 2.5, o = {}) {
    return this.t(new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(color).multiplyScalar(k) }, o)));
  }
  shader({ uniforms = {}, vs, fs, fog = true, defines = {}, ...rest }) {
    const u = Object.assign({}, fog ? THREE.UniformsUtils.clone(THREE.UniformsLib.fog) : {}, { uTime: this.time }, uniforms);
    // LOWQ lets shaders drop octaves / layers on the 'low' quality setting.
    const d = Object.assign(this.hi ? {} : { LOWQ: 1 }, defines);
    return this.t(new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: vs, fragmentShader: fs, fog, defines: d }, rest)));
  }
  // Premultiplied additive (One, One): shaders output rgb already scaled by their alpha.
  additive(mat) {
    mat.transparent = true; mat.depthWrite = false;
    mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor;
    return mat;
  }
  mesh(geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !!o.cast; m.receiveShadow = !!o.receive;
    if (o.order != null) m.renderOrder = o.order;
    if (o.nocull) m.frustumCulled = false;
    return m;
  }
  dispose(group) {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.userData && o.userData.geoBase) o.userData.geoBase.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) m.dispose();
    });
    for (const x of this.things) if (x && x.dispose) x.dispose();
    this.things.length = 0;
  }
}

// Inject GLSL into a built-in material. o = { uniforms, vertexHead, vertex (after begin_vertex),
// fragHead, emissive (after emissivemap_fragment, may modify totalEmissiveRadiance), color (after color_fragment) }
export function inject(mat, kit, o) {
  const key = JSON.stringify(o, (k, v) => (k === 'uniforms' ? Object.keys(v) : v));
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = kit.time;
    for (const [k, v] of Object.entries(o.uniforms || {})) sh.uniforms[k] = v;
    const decl = 'uniform float uTime;\n' + Object.entries(o.uniforms || {}).map(([k, v]) => `uniform ${v.type || 'float'} ${k};`).join('\n') + '\n';
    sh.vertexShader = decl + GLSL_NOISE + (o.vertexHead || '') + '\n' + sh.vertexShader;
    if (o.vertex) sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vertex);
    if (o.worldPos) {
      sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vec4 wpp = vec4(transformed, 1.0);\n #ifdef USE_INSTANCING\n wpp = instanceMatrix * wpp;\n #endif\n vWPos = (modelMatrix * wpp).xyz;');
      sh.fragmentShader = 'varying vec3 vWPos;\n' + sh.fragmentShader;
    }
    sh.fragmentShader = decl + GLSL_NOISE + (o.fragHead || '') + '\n' + sh.fragmentShader;
    if (o.color) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.color);
    if (o.emissive) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.emissive);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

// Wind sway for foliage/reeds: requires a per-vertex 'aSway' attribute (0 base .. 1 tip).
export function swayMaterial(mat, kit, amp = 0.08, speed = 1.6) {
  return inject(mat, kit, {
    uniforms: { uSwayAmp: { value: amp }, uSwaySpd: { value: speed } },
    vertexHead: 'attribute float aSway;',
    vertex: `{ vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
      float ph = wp.x * 0.35 + wp.z * 0.21;
      float gust = 0.65 + 0.35 * sin(uTime * 0.37 + wp.x * 0.05);
      float w = aSway * aSway * uSwayAmp * gust;
      transformed.x += w * (sin(uTime * uSwaySpd + ph) + 0.4 * sin(uTime * uSwaySpd * 2.3 + ph * 1.7));
      transformed.z += w * 0.5 * cos(uTime * uSwaySpd * 0.8 + ph); }`,
  });
}

// ---------------------------------------------------------------------------
// GPU particle system: instanced billboards whose motion is computed entirely
// in the vertex shader from uTime and per-instance randoms (aR, aR2: vec4 in 0..1).
// `body` must define: void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V)
//   P = world position, S = size (m), C = colour (rgb premult intensity, a alpha), V = velocity for stretch.
// shape: 'soft' | 'dot' (core + halo) | 'flake' | 'streak' | 'mist' | 'spark'
const SHAPE = {
  soft: 'float a = exp(-r2 * 4.0);',
  dot: 'float a = exp(-r2 * 28.0) + 0.35 * exp(-r2 * 5.0);',
  flake: 'float a = smoothstep(1.0, 0.25, sqrt(r2));',
  mist: 'float a = smoothstep(1.0, 0.0, sqrt(r2)); a = a * a * (0.75 + 0.25 * sin(p.x * 3.0 + p.y * 2.0));',
  streak: 'float a = exp(-p.y * p.y * 7.0) * smoothstep(1.0, 0.2, abs(p.x)) * (0.55 + 0.45 * (p.x * 0.5 + 0.5));',
  spark: 'float a = exp(-p.y * p.y * 10.0) * (1.0 - abs(p.x));',
  glow: 'float a = exp(-r2 * 6.0) * 0.7 + exp(-r2 * 1.6) * 0.3;',
};
export function gpuParticles(kit, o) {
  const count = o.count;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const R = rng(o.seed || 1);
  const a1 = new Float32Array(count * 4), a2 = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) { a1[i] = R(); a2[i] = R(); }
  g.setAttribute('aR', new THREE.InstancedBufferAttribute(a1, 4));
  g.setAttribute('aR2', new THREE.InstancedBufferAttribute(a2, 4));
  for (const [k, [arr, size]] of Object.entries(o.attrs || {})) g.setAttribute(k, new THREE.InstancedBufferAttribute(arr, size));
  g.instanceCount = count;
  const attrDecl = Object.entries(o.attrs || {}).map(([k, [, size]]) => `attribute ${size === 1 ? 'float' : 'vec' + size} ${k};`).join('\n');
  const vs = /* glsl */`
    attribute vec4 aR; attribute vec4 aR2;
    ${attrDecl}
    ${Object.entries(o.uniforms || {}).map(([k, v]) => `uniform ${v.type || 'float'} ${k};`).join('\n')}
    uniform float uTime;
    varying vec2 vUv; varying vec4 vCol;
    #include <fog_pars_vertex>
    ${GLSL_NOISE}
    ${o.body}
    void main(){
      vec3 P = vec3(0.0); float S = 0.05; vec4 C = vec4(1.0); vec3 V = vec3(0.0);
      particle(P, S, C, V);
      vec4 mvPosition = modelViewMatrix * vec4(P, 1.0);
      vec2 off = position.xy * S;
      if (dot(V, V) > 1e-8) {
        vec3 v2 = (modelViewMatrix * vec4(P + V, 1.0)).xyz - mvPosition.xyz;
        float L = length(v2.xy);
        vec2 dir = L > 1e-5 ? v2.xy / L : vec2(1.0, 0.0);
        off = dir * position.x * (S + L) + vec2(-dir.y, dir.x) * position.y * S;
      }
      mvPosition.xy += off;
      gl_Position = projectionMatrix * mvPosition;
      vUv = uv; vCol = C;
      if (C.a <= 0.002) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      #include <fog_vertex>
    }`;
  const fs = /* glsl */`
    varying vec2 vUv; varying vec4 vCol;
    #include <fog_pars_fragment>
    void main(){
      vec2 p = vUv * 2.0 - 1.0; float r2 = dot(p, p);
      ${SHAPE[o.shape || 'soft']}
      ${FOG_FRAG_ADD}
      a *= vCol.a * (1.0 - fogF);
      if (a < 0.002) discard;
      gl_FragColor = vec4(vCol.rgb * a, ${o.blending === 'normal' ? 'a' : '0.0'});
    }`;
  const mat = kit.shader({ uniforms: o.uniforms || {}, vs, fs, transparent: true, depthWrite: false, fog: o.fog !== false });
  if (o.blending === 'normal') { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor; }
  else { mat.blending = THREE.CustomBlending; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; }
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = o.order ?? 12;
  mesh.userData.geoBase = base;
  return mesh;
}

// Static glows (halos) at fixed points, one draw call. list: [{p:[x,y,z], size, color, k, flicker}]
export function glowPoints(kit, list, o = {}) {
  const n = list.length;
  const pos = new Float32Array(n * 4), colr = new Float32Array(n * 4);
  list.forEach((g, i) => {
    pos[i * 4] = g.p[0]; pos[i * 4 + 1] = g.p[1]; pos[i * 4 + 2] = g.p[2]; pos[i * 4 + 3] = g.size;
    const c = new THREE.Color(g.color).multiplyScalar(g.k ?? 1);
    colr[i * 4] = c.r; colr[i * 4 + 1] = c.g; colr[i * 4 + 2] = c.b; colr[i * 4 + 3] = g.flicker ?? 0;
  });
  return gpuParticles(kit, {
    count: n, shape: o.shape || 'glow', order: o.order ?? 14, seed: 77,
    attrs: { aPos: [pos, 4], aCol: [colr, 4] },
    body: /* glsl */`
      void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        P = aPos.xyz; S = aPos.w;
        float fl = aCol.w;
        float f = 1.0 - fl * (0.25 * sin(uTime * 9.0 + aR.x * 50.0) + 0.15 * sin(uTime * 23.0 + aR.y * 30.0) + 0.1 * vnoise(vec2(uTime * 6.0, aR.z * 40.0)));
        S *= mix(1.0, f, 0.5);
        C = vec4(aCol.rgb * f, 1.0);
      }`,
  });
}

// Sky dome that follows the camera. fs must define vec3 sky(vec3 d) (d = normalized view dir).
export function skyDome(kit, { fs, uniforms = {}, radius = 400 }) {
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  const mat = kit.shader({
    fog: false, uniforms, side: THREE.BackSide, depthWrite: false,
    vs: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }`,
    fs: /* glsl */`uniform float uTime; varying vec3 vDir;
      ${GLSL_NOISE}
      ${fs}
      void main(){ vec3 c = sky(normalize(vDir)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  // Drawn last among opaques (depth = far) so pixels covered by scenery skip the sky shader.
  m.renderOrder = 50;
  m.frustumCulled = false;
  return m;
}

// Distant ridge silhouettes: strip of quads, rows high. prof(x) -> 0..1 height profile.
// colorAt(t, x, h01) -> Color  (t = 0 bottom .. 1 top of this column)
export function ridgeGeo({ z, x0, x1, seg = 160, base, hMin, hMax, prof, rows = 2, colorAt, zJitter }) {
  const P = [], C = [];
  const cols = [];
  for (let i = 0; i <= seg; i++) {
    const x = x0 + (x1 - x0) * (i / seg);
    const h01 = prof(x);
    const top = hMin + (hMax - hMin) * h01;
    const zz = z + (zJitter ? zJitter(x) : 0);
    const colv = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      colv.push([x, base + (top - base) * t, zz, colorAt(t, x, h01, top)]);
    }
    cols.push(colv);
  }
  for (let i = 0; i < seg; i++) {
    for (let r = 0; r < rows; r++) {
      const a = cols[i][r], b = cols[i + 1][r], c = cols[i + 1][r + 1], d = cols[i][r + 1];
      for (const v of [a, b, c, a, c, d]) { P.push(v[0], v[1], v[2]); C.push(v[3].r, v[3].g, v[3].b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// Heightfield grid over [x0,x1]×[z0,z1]; h(x,z) -> y; colorAt(x,y,z,nY) -> Color
export function terrainGeo({ x0, x1, z0, z1, nx, nz, h, colorAt }) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) P.setY(i, h(P.getX(i), P.getZ(i)));
  g.computeVertexNormals();
  if (colorAt) {
    const N = g.attributes.normal;
    const arr = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const c = colorAt(P.getX(i), P.getY(i), P.getZ(i), N.getY(i));
      arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

export { THREE };
