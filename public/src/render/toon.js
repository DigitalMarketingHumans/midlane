// Cel-shading helpers: toon materials with a shared gradient ramp and constant-width
// inverted-hull outlines.
import * as THREE from 'three';

let RAMP = null;
export function toonRamp() {
  if (RAMP) return RAMP;
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]);
  RAMP = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  RAMP.minFilter = THREE.NearestFilter;
  RAMP.magFilter = THREE.NearestFilter;
  RAMP.generateMipmaps = false;
  RAMP.needsUpdate = true;
  return RAMP;
}

const OUTLINE_VS = /* glsl */`
  uniform float width;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    vec3 n = normalize(normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 vn = normalize(normalMatrix * n);
    // Constant screen-ish width: scale by view distance so outlines stay crisp.
    float w = width * clamp(-mv.z * 0.12, 0.6, 2.0);
    mv.xyz += vn * w;
    gl_Position = projectionMatrix * mv;
  }
`;
const OUTLINE_FS = /* glsl */`
  uniform vec3 color;
  uniform float opacity;
  void main() { gl_FragColor = vec4(color, opacity); }
`;

export function outlineMaterial(color = 0x0a0a12, width = 0.012) {
  return new THREE.ShaderMaterial({
    uniforms: { width: { value: width }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
    vertexShader: OUTLINE_VS,
    fragmentShader: OUTLINE_FS,
    side: THREE.BackSide,
  });
}

// A material set for one fighter, so we can flash / tint all of it at once.
export class MatSet {
  constructor(outlineColor = 0x08070c, outlineWidth = 0.011) {
    this.mats = [];
    this.glows = [];
    this.outline = outlineMaterial(outlineColor, outlineWidth);
    this.cache = new Map();
  }
  toon(color, opts = {}) {
    const key = `t${color}|${opts.emissive || 0}|${opts.ei || 0}`;
    if (this.cache.has(key) && !opts.unique) return this.cache.get(key);
    const m = new THREE.MeshToonMaterial({
      color: new THREE.Color(color),
      gradientMap: toonRamp(),
      emissive: new THREE.Color(opts.emissive || 0x000000),
      emissiveIntensity: opts.ei ?? 1,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    m.userData.baseEmissive = m.emissive.clone();
    m.userData.baseEI = m.emissiveIntensity;
    this.mats.push(m);
    if (!opts.unique) this.cache.set(key, m);
    return m;
  }
  // Unlit glowing material (blooms).
  glow(color, intensity = 2.5, opts = {}) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    const m = new THREE.MeshBasicMaterial({
      color: c, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: opts.depthWrite ?? !opts.additive, side: opts.side ?? THREE.FrontSide,
      toneMapped: true,
    });
    m.userData.base = c.clone();
    this.glows.push(m);
    return m;
  }
  flash(amount, color = 0xffffff) {
    const c = new THREE.Color(color);
    for (const m of this.mats) {
      if (amount > 0) { m.emissive.copy(c); m.emissiveIntensity = amount; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseEI; }
    }
  }
  setOpacity(o) {
    for (const m of this.mats) { m.transparent = o < 1; m.opacity = o; }
    this.outline.uniforms.opacity.value = o;
    this.outline.transparent = o < 1;
  }
}

// Mesh with optional outline child. Geometry should be centred on its origin.
export function part(geo, mat, ms, opts = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = false;
  if (opts.outline !== false && ms) {
    const og = opts.smoothOutline ? smoothNormals(geo) : geo;
    const o = new THREE.Mesh(og, ms.outline);
    o.castShadow = false;
    o.raycast = () => {};
    mesh.add(o);
  }
  return mesh;
}

// For hard-edged convex shapes (boxes), radial normals give gap-free outlines.
function smoothNormals(geo) {
  const g = geo.clone();
  g.computeBoundingBox();
  const c = new THREE.Vector3();
  g.boundingBox.getCenter(c);
  const pos = g.attributes.position;
  const nrm = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).sub(c).normalize();
    nrm[i * 3] = v.x; nrm[i * 3 + 1] = v.y; nrm[i * 3 + 2] = v.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

// ---------------------------------------------------------------------------
// Geometry helpers (all centred).
export const G3 = {
  capsule: (r, len, seg = 12) => new THREE.CapsuleGeometry(r, Math.max(0.001, len), 6, seg),
  // Tapered limb: cylinder with hemispherical-ish ends via lathe.
  limb: (r1, r2, len, seg = 12) => {
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r2, -len / 2 - Math.cos(a) * r2)); }
    for (let i = n; i >= 0; i--) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r1, len / 2 + Math.cos(a) * r1)); }
    return new THREE.LatheGeometry(pts, seg);
  },
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  sphere: (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs),
  ellip: (rx, ry, rz, ws = 16, hs = 12) => { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); return g; },
  cone: (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg),
  cyl: (r1, r2, h, seg = 14) => new THREE.CylinderGeometry(r1, r2, h, seg),
  torus: (r, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  lathe: (pts, seg = 16) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg),
  // Extruded 2D shape (blades, axe heads). pts in XY, depth along Z, centred.
  extrude: (pts, depth, bevel = 0.004) => {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  },
};
