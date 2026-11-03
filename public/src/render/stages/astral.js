// Astral Sanctum — an ancient marble platform floating in the cosmos: glowing rune
// circles, broken pillars, drifting rock islands, a ringed giant planet, an
// astrolabe of orbiting light rings, comets and gold dust in a baked nebula sky.
import * as THREE from 'three';
import {
  Kit, rng, xf, paint, attr, merge, rockGeo, noise3, smooth, col, speckle, blotches, blurCanvas,
  GLSL_NOISE, FOG_FRAG_ADD, gpuParticles, glowPoints, inject,
} from './common.js';

const PLAT = { r: 13.5, z: 3 };
const PLANET = { dir: new THREE.Vector3(Math.sin(0.4), Math.sin(0.11), -Math.cos(0.4)).normalize(), dist: 320, r: 40 };
const STAR = new THREE.Vector3(-0.85, 0.35, -0.4).normalize();
const ASTRO = new THREE.Vector3(-34, 9.5, -84);

const NEBULA_FS = /* glsl */`
vec3 nebula(vec3 d){
  vec3 p = d * 2.1;
  vec3 w = vec3(fbm3d(p), fbm3d(p + vec3(5.2, 1.3, 2.8)), fbm3d(p + vec3(2.0, 7.0, 1.0)));
  float n = fbm3d(p * 1.3 + w * 1.7);
  float n2 = fbm3d(p * 2.4 - w * 0.9 + 4.0);
  float n3 = fbm3d(p * 3.2 + w * 1.2 + 9.0);
  vec3 c = vec3(0.010, 0.008, 0.028);
  vec3 neb = mix(vec3(0.20, 0.05, 0.34), vec3(0.03, 0.26, 0.34), smoothstep(0.38, 0.68, n2));
  neb = mix(neb, vec3(0.50, 0.14, 0.40), smoothstep(0.58, 0.78, n) * 0.55);
  float dens = smoothstep(0.36, 0.78, n);
  c += neb * dens * 0.85;
  c += vec3(0.55, 0.38, 0.16) * smoothstep(0.66, 0.85, n3) * dens * 0.35;
  c *= 1.0 - 0.65 * smoothstep(0.52, 0.68, fbm3d(p * 3.6 + 13.0)) * dens;
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.86, 0.4))) / 0.2, 2.0));
  c += vec3(0.11, 0.08, 0.17) * band * (0.4 + fbm3d(d * 9.0));
  return c;
}
void main(){ gl_FragColor = vec4(nebula(normalize(vDir)), 1.0); }
`;

const SKY_FS = /* glsl */`
uniform samplerCube uNeb; uniform mat3 uRot;
vec3 sky(vec3 d){
  vec3 dr = uRot * d;
  vec3 c = textureCube(uNeb, dr).rgb;
  float dens = clamp(dot(c, vec3(1.0)) * 2.0, 0.0, 1.0);
  c *= 0.92 + 0.08 * sin(uTime * 0.3 + dr.x * 4.0 + dr.y * 3.0);
  c += vec3(0.85, 0.88, 1.0) * starField(dr, 230.0, 0.16, uTime * 1.5) * 1.1;
  c += vec3(1.0, 0.86, 0.62) * starField(dr, 85.0, 0.045, uTime) * 2.0;
  c += vec3(1.0, 0.72, 0.3) * starField(dr, 420.0, 0.35, uTime * 3.0) * dens * 0.9;
  return c;
}
`;

function marbleTextures(kit) {
  const S = kit.hi ? 1024 : 512, R = rng(61);
  const T = S / 2; // 2 m tiles
  const veins = [];
  for (let i = 0; i < 26; i++) {
    const pts = [[R() * S, R() * S]];
    const a = R() * Math.PI * 2;
    for (let k = 0; k < 6; k++) { const p = pts[pts.length - 1]; pts.push([p[0] + Math.cos(a + (R() - 0.5) * 1.4) * S * 0.08, p[1] + Math.sin(a + (R() - 0.5) * 1.4) * S * 0.08]); }
    veins.push({ pts, w: R.range(0.6, 2.2), gold: R() < 0.2 });
  }
  const map = kit.tex(S, S, (x) => {
    x.fillStyle = '#cfc6de'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, R, 40, S * 0.06, S * 0.22, ['#e2dbee', '#b8aed0', '#d6cfe6', '#c2b6d8'], 0.4);
    for (const v of veins) {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        x.beginPath(); x.moveTo(v.pts[0][0] + ox, v.pts[0][1] + oy);
        for (let k = 1; k < v.pts.length - 1; k++) x.quadraticCurveTo(v.pts[k][0] + ox, v.pts[k][1] + oy, (v.pts[k][0] + v.pts[k + 1][0]) / 2 + ox, (v.pts[k][1] + v.pts[k + 1][1]) / 2 + oy);
        x.strokeStyle = v.gold ? 'rgba(200,160,80,0.55)' : 'rgba(110,96,140,0.35)'; x.lineWidth = v.w * S / 512; x.stroke();
      }
    }
    // tiles with bevel
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const ox = i * T, oy = j * T;
      x.strokeStyle = 'rgba(70,56,100,0.4)'; x.lineWidth = S / 420; x.strokeRect(ox + 1, oy + 1, T - 2, T - 2);
      x.strokeStyle = 'rgba(255,250,255,0.25)'; x.lineWidth = S / 500;
      x.beginPath(); x.moveTo(ox + 4, oy + T - 4); x.lineTo(ox + 4, oy + 4); x.lineTo(ox + T - 4, oy + 4); x.stroke();
      // gold inlay border inset
      x.strokeStyle = 'rgba(190,150,70,0.75)'; x.lineWidth = S / 400; x.strokeRect(ox + T * 0.08, oy + T * 0.08, T * 0.84, T * 0.84);
      // corner diamonds
      for (const [cx, cy] of [[ox + T * 0.08, oy + T * 0.08], [ox + T * 0.92, oy + T * 0.08], [ox + T * 0.08, oy + T * 0.92], [ox + T * 0.92, oy + T * 0.92]]) {
        x.fillStyle = 'rgba(200,160,80,0.9)'; x.beginPath(); x.moveTo(cx, cy - S * 0.008); x.lineTo(cx + S * 0.008, cy); x.lineTo(cx, cy + S * 0.008); x.lineTo(cx - S * 0.008, cy); x.fill();
      }
    }
    speckle(x, S, S, R, 8);
  }, { aniso: kit.aniso, repeat: [PLAT.r * 2 / 4, PLAT.r * 2 / 4] });
  const emissive = kit.tex(S, S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const ox = i * T, oy = j * T;
      x.strokeStyle = 'rgba(255,200,110,1)'; x.lineWidth = S / 420; x.strokeRect(ox + T * 0.08, oy + T * 0.08, T * 0.84, T * 0.84);
    }
    blurCanvas(x, S, S, S / 700);
  }, { aniso: kit.aniso, repeat: [PLAT.r * 2 / 4, PLAT.r * 2 / 4] });
  return { map, emissive };
}

// Fluted classical column, optionally broken with a jagged slanted top.
function column(R, x, z, h, o = {}) {
  const r = o.r ?? 0.42;
  const parts = [];
  const marble = col(o.tint || '#bcb2d0');
  const sh = (c) => (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.82 + 0.25 * Math.max(0, ny));
  parts.push(paint(xf(new THREE.BoxGeometry(r * 3.0, 0.32, r * 3.0), { y: 0.16 }), sh(marble.clone().multiplyScalar(0.85))));
  parts.push(paint(xf(new THREE.CylinderGeometry(r * 1.3, r * 1.4, 0.22, 20), { y: 0.43 }), sh(marble)));
  const shaft = new THREE.CylinderGeometry(r * 0.9, r, h, 24, Math.max(2, Math.round(h * 2)));
  shaft.translate(0, 0.54 + h / 2, 0);
  const P = shaft.attributes.position;
  const cutA = R.range(-0.5, 0.5), cutB = R.range(-0.5, 0.5);
  for (let i = 0; i < P.count; i++) {
    let px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
    const ang = Math.atan2(pz, px);
    const fl = 1 - 0.07 * Math.pow(Math.abs(Math.cos(ang * 8)), 0.6);
    px *= fl; pz *= fl;
    if (o.broken) {
      const top = 0.54 + h - 0.35 + (px * cutA + pz * cutB) * 0.9 + (noise3(px * 6, pz * 6, py) - 0.5) * 0.3;
      if (py > top) py = top;
    }
    P.setXYZ(i, px, py, pz);
  }
  shaft.computeVertexNormals();
  parts.push(paint(shaft, (px, py, pz, nx, ny) => {
    const c = marble.clone().multiplyScalar(0.8 + 0.25 * Math.max(0, ny));
    if (o.broken && ny > 0.5) c.multiplyScalar(0.75);
    return c.lerp(col('#7a6a9a'), smooth(1.5, 0.4, py) * 0.25);
  }));
  if (!o.broken) {
    parts.push(paint(xf(new THREE.CylinderGeometry(r * 1.35, r * 0.95, 0.3, 20), { y: 0.54 + h + 0.15 }), sh(marble)));
    parts.push(paint(xf(new THREE.BoxGeometry(r * 3.0, 0.26, r * 3.0), { y: 0.54 + h + 0.43 }), sh(marble.clone().multiplyScalar(0.92))));
  }
  const g = merge(parts);
  xf(g, { x, y: o.y || 0, z, ry: R() * Math.PI });
  return g;
}

function island(R, x, y, z, s, phase) {
  const parts = [];
  const top = rockGeo(R, { detail: 2, jag: 0.24, flat: 1.0, top: 0.3, sx: 1.2, sy: 0.6, sz: 1.0 });
  const P = top.attributes.position;
  for (let i = 0; i < P.count; i++) { const py = P.getY(i); if (py < 0) { const k = 2.4 + noise3(P.getX(i) * 2, P.getZ(i) * 2, 3) * 1.8; const tp = Math.pow(-py / 0.6, 1.4); P.setXYZ(i, P.getX(i) * (1 - 0.55 * tp), py * k, P.getZ(i) * (1 - 0.55 * tp)); } }
  top.computeVertexNormals();
  xf(top, { s, x, y, z, ry: R() * 6 });
  parts.push(paint(top, (px, py, pz, nx, ny) => {
    if (ny > 0.55 && py > y + s * 0.02) return col('#5a6ab8').lerp(col('#8a7ad0'), noise3(px * 0.6, pz * 0.6, 1) * 0.7);
    return col('#4a3c62').lerp(col('#6a5878'), noise3(px * 0.8, py * 0.8, pz * 0.8) * 0.7).multiplyScalar(0.6 + 0.4 * smooth(y - s * 2.2, y, py));
  }));
  if (s > 2.2 && R() < 0.8) parts.push(column(R, x + R.range(-s * 0.4, s * 0.4), z + R.range(-s * 0.3, s * 0.3), R.range(1.2, 2.6) * Math.min(1.6, s / 3), { broken: true, y: y + s * 0.18, r: 0.32 * Math.min(1.5, s / 3) }));
  const g = merge(parts);
  return attr(g, 'aPhase', phase);
}

export default {
  id: 'astral', name: 'Astral Sanctum', sub: 'A duel beneath the turning heavens', music: 'stage_astral',
  palette: { accent: '#c9a2ff', dark: '#120c2a', light: '#ffe2a0' },
  build(ctx) {
    const kit = new Kit(ctx);
    const hi = kit.hi;
    const group = new THREE.Group();
    group.name = 'stage:astral';
    const R = rng(9001);

    // --- nebula baked into a cube map once ----------------------------------------
    // ~28 MB at 768² RGBA16F (12 MB on low); the nebula is soft, stars are drawn live on top.
    const cubeRT = kit.t(new THREE.WebGLCubeRenderTarget(hi ? 768 : 512, { type: THREE.HalfFloatType, generateMipmaps: false }));
    {
      const bakeScene = new THREE.Scene();
      const bakeMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, depthTest: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vDir;\n' + GLSL_NOISE + NEBULA_FS,
      });
      const bakeGeo = new THREE.SphereGeometry(10, 48, 24);
      bakeScene.add(new THREE.Mesh(bakeGeo, bakeMat));
      const cam = new THREE.CubeCamera(0.5, 50, cubeRT);
      if (ctx.renderer) cam.update(ctx.renderer, bakeScene);
      bakeGeo.dispose(); bakeMat.dispose();
    }
    const rotU = { value: new THREE.Matrix3(), type: 'mat3' };
    const skyGeo = new THREE.SphereGeometry(400, 48, 32);
    const skyMat = kit.shader({
      fog: false, side: THREE.BackSide, depthWrite: false, uniforms: { uNeb: { value: cubeRT.texture }, uRot: rotU },
      vs: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); p.z = p.w * 0.99999; gl_Position = p; }`,
      fs: /* glsl */`uniform float uTime; varying vec3 vDir;
        ${GLSL_NOISE}
        ${SKY_FS}
        void main(){ gl_FragColor = vec4(sky(normalize(vDir)), 1.0); }`,
    });
    const sky = kit.mesh(skyGeo, skyMat, { order: 50, nocull: true });
    group.add(sky);

    // --- planet with rings -----------------------------------------------------------
    const pPos = PLANET.dir.clone().multiplyScalar(PLANET.dist);
    const planetMat = kit.shader({
      fog: false, uniforms: { uStar: { value: STAR.clone() } },
      vs: /* glsl */`varying vec3 vN; varying vec3 vO; varying vec3 vW;
        void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fs: /* glsl */`uniform float uTime; uniform vec3 uStar; varying vec3 vN; varying vec3 vO; varying vec3 vW;
        ${GLSL_NOISE}
        void main(){
          vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
          float lat = vO.y;
          float lon = atan(vO.z, vO.x);
          float warp = fbm(vec2(lon * 2.0 + uTime * 0.01, lat * 6.0)) * 0.35;
          float b = fbm(vec2(lat * 7.0 + warp, 0.5)) ;
          vec3 c1 = vec3(0.24, 0.12, 0.42), c2 = vec3(0.08, 0.30, 0.44), c3 = vec3(0.62, 0.38, 0.22);
          vec3 base = mix(c1, c2, smoothstep(0.35, 0.6, b));
          base = mix(base, c3, smoothstep(0.62, 0.72, b) * 0.7);
          base *= 0.85 + 0.3 * vnoise(vec2(lon * 6.0, lat * 40.0));
          float l = dot(N, uStar);
          float lit = smoothstep(-0.08, 0.05, l) * 0.55 + smoothstep(0.25, 0.4, l) * 0.45;
          vec3 c = base * (0.03 + 0.6 * lit);
          float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
          c += vec3(0.45, 0.55, 1.0) * rim * (0.1 + 0.9 * smoothstep(-0.3, 0.3, l)) * 0.7;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const planet = kit.mesh(new THREE.SphereGeometry(PLANET.r, 64, 40), planetMat, { order: 40 });
    planet.position.copy(pPos);
    planet.rotation.z = 0.32;
    group.add(planet);
    const ringMat = kit.shader({
      fog: false, uniforms: { uStar: { value: STAR.clone() }, uPlanet: { value: pPos.clone(), type: 'vec3' }, uPR: { value: PLANET.r } },
      vs: /* glsl */`varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fs: /* glsl */`uniform float uTime; uniform vec3 uStar; uniform vec3 uPlanet; uniform float uPR; varying vec2 vP; varying vec3 vW;
        ${GLSL_NOISE}
        void main(){
          float r = length(vP) / ${PLANET.r.toFixed(1)};
          float b = vnoise(vec2(r * 40.0, 1.0)) * 0.6 + vnoise(vec2(r * 130.0, 2.0)) * 0.4;
          float a = smoothstep(1.45, 1.55, r) * (1.0 - smoothstep(2.25, 2.4, r)) * (0.25 + 0.75 * b);
          a *= 1.0 - 0.75 * smoothstep(1.86, 1.88, r) * (1.0 - smoothstep(1.94, 1.96, r));
          // planet shadow on the ring
          vec3 toP = uPlanet - vW; float t = dot(toP, -uStar);
          float sh = t < 0.0 ? smoothstep(uPR * 0.95, uPR * 1.05, length(toP + uStar * t)) : 1.0;
          vec3 c = mix(vec3(0.5, 0.42, 0.66), vec3(0.8, 0.66, 0.46), b) * (0.2 + 0.8 * sh) * 0.5;
          if (a < 0.01) discard;
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    ringMat.blending = THREE.CustomBlending; ringMat.blendSrc = THREE.OneFactor; ringMat.blendDst = THREE.OneMinusSrcAlphaFactor;
    const rings = kit.mesh(new THREE.RingGeometry(PLANET.r * 1.4, PLANET.r * 2.45, 128, 1), ringMat, { order: 41 });
    rings.position.copy(pPos);
    rings.lookAt(pPos.clone().add(new THREE.Vector3(0.18, 1, 0.35)));
    group.add(rings);

    // --- platform ---------------------------------------------------------------------
    const { map, emissive } = marbleTextures(kit);
    const floorGeo = new THREE.CircleGeometry(PLAT.r, 128);
    floorGeo.rotateX(-Math.PI / 2); floorGeo.translate(0, 0, PLAT.z);
    const floorMat = kit.std({ map, emissiveMap: emissive, emissive: 0xffc070, emissiveIntensity: 0.9, roughness: 0.5, color: 0xc4bcd6 });
    inject(floorMat, kit, {
      worldPos: true,
      emissive: /* glsl */`{
        float d = length(vWPos.xz - vec2(0.0, ${PLAT.z.toFixed(1)}));
        float pulse = 0.55 + 0.45 * sin(uTime * 1.1 - d * 0.6);
        totalEmissiveRadiance *= pulse * (0.35 + 0.65 * smoothstep(4.0, 10.0, abs(vWPos.x) + max(0.0, -vWPos.z) * 1.5));
      }`,
    });
    group.add(kit.mesh(floorGeo, floorMat, { receive: true }));

    const solids = [], glows = [];
    // rim band + underside rock
    const band = new THREE.CylinderGeometry(PLAT.r, PLAT.r - 0.4, 0.9, 128, 1, true);
    xf(band, { y: -0.45, z: PLAT.z });
    solids.push(paint(band, (px, py) => col('#b8aed0').lerp(col('#6a5a8a'), smooth(-0.2, -0.9, py))));
    const under = rockGeo(R, { detail: 3, jag: 0.18, flat: 1.0 });
    {
      const P = under.attributes.position;
      for (let i = 0; i < P.count; i++) { const py = P.getY(i); P.setY(i, py > 0 ? 0 : py * 1.0); }
      under.computeVertexNormals();
    }
    xf(under, { sx: PLAT.r - 0.3, sy: 9, sz: PLAT.r - 0.3, y: -0.85, z: PLAT.z });
    solids.push(paint(under, (px, py, pz, nx, ny) => col('#3a3050').lerp(col('#5a4870'), noise3(px * 0.3, py * 0.3, pz * 0.3) * 0.7)));
    glows.push(paint(xf(new THREE.TorusGeometry(PLAT.r, 0.04, 4, 160), { rx: Math.PI / 2, y: 0.0, z: PLAT.z }), col('#ffc870').multiplyScalar(1.6)));
    // boundary pillars (intact, with floating flame orbs) + back-edge ruins
    const orbs = [];
    for (const sx of [-1, 1]) {
      solids.push(column(R, sx * 9.05, -1.5, 4.2, { r: 0.46 }));
      glows.push(paint(xf(new THREE.TorusGeometry(0.47, 0.035, 4, 32), { rx: Math.PI / 2, x: sx * 9.05, y: 1.4, z: -1.5 }), col('#ffc860').multiplyScalar(2.4)));
      glows.push(paint(xf(new THREE.TorusGeometry(0.44, 0.03, 4, 32), { rx: Math.PI / 2, x: sx * 9.05, y: 3.6, z: -1.5 }), col('#ffc860').multiplyScalar(2.4)));
      orbs.push([sx * 9.05, 5.9, -1.5]);
      solids.push(column(R, sx * 8.3, -7.4, 2.3, { broken: true, r: 0.44, tint: '#a89cc0' }));
      solids.push(column(R, sx * 4.6, -9.4, 1.1, { broken: true, r: 0.42 }));
      solids.push(column(R, sx * 11.6, -4.9, 2.2, { broken: true, r: 0.44 }));
      // fallen drum segments
      const drum = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 20);
      xf(drum, { rz: Math.PI / 2, ry: sx * 0.6 + R() * 0.3, x: sx * 6.7, y: 0.42, z: -8.2 });
      solids.push(paint(drum, (px, py, pz, nx, ny) => col('#a89cc0').multiplyScalar(0.75 + 0.25 * Math.max(0, ny))));
      const blk = rockGeo(R, { detail: 0, jag: 0.15, sx: 0.8, sy: 0.4, sz: 0.6 });
      xf(blk, { x: sx * 10.4, y: 0.2, z: -0.3 });
      solids.push(paint(blk, col('#b8aed0')));
    }
    // a low stepped dais behind the fight (kept below 0.2 m)
    group.add(kit.mesh(merge(solids), kit.toon({ vertexColors: true }), { cast: true, receive: true }));
    group.add(kit.mesh(merge(glows), kit.t(new THREE.MeshBasicMaterial({ vertexColors: true }))));

    // --- rune circles (additive decals) -------------------------------------------------
    const runeMat = kit.shader({
      vs: /* glsl */`attribute vec3 color; attribute float aSpin; varying vec2 vUv; varying vec3 vC; varying float vSpin;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vC = color; vSpin = aSpin; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec2 vUv; varying vec3 vC; varying float vSpin;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        float tri(vec2 p, float r){ vec2 n1 = vec2(0.0, -1.0), n2 = vec2(0.8660, 0.5), n3 = vec2(-0.8660, 0.5); return max(max(dot(p, n1), dot(p, n2)), dot(p, n3)) - r; }
        void main(){
          ${FOG_FRAG_ADD}
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          float a = atan(p.y, p.x) + uTime * 0.06 * vSpin;
          float w = fwidth(r) * 1.2;
          float ring = smoothstep(w + 0.012, 0.0, abs(r - 0.96)) + smoothstep(w + 0.006, 0.0, abs(r - 0.9)) * 0.8
                     + smoothstep(w + 0.006, 0.0, abs(r - 0.6)) * 0.8 + smoothstep(w + 0.01, 0.0, abs(r - 0.55));
          float N = 32.0; float sa = a / 6.28318 * N; float seg = floor(sa); float cell = fract(sa);
          float h = hash12(vec2(seg, 3.0));
          float rr = (r - 0.64) / 0.22;
          float lw = 0.09;
          float g = step(0.5, fract(h * 2.0)) * smoothstep(lw, 0.0, abs(cell - 0.5)) * step(0.15, rr) * step(rr, 0.85);
          g += step(0.5, fract(h * 4.0)) * smoothstep(lw * 0.8, 0.0, abs(rr - 0.5)) * step(0.2, cell) * step(cell, 0.8);
          g += step(0.5, fract(h * 8.0)) * smoothstep(lw, 0.0, abs(rr - cell)) * step(0.15, rr) * step(rr, 0.85);
          g += step(0.4, fract(h * 16.0)) * smoothstep(0.12, 0.06, length(vec2(cell - 0.5, (rr - 0.18) * 1.6)));
          g = min(g, 1.0) * step(0.64, r) * step(r, 0.86);
          vec2 q = vec2(cos(-uTime * 0.04 * vSpin) * p.x - sin(-uTime * 0.04 * vSpin) * p.y, sin(-uTime * 0.04 * vSpin) * p.x + cos(-uTime * 0.04 * vSpin) * p.y);
          float hex = smoothstep(w + 0.008, 0.0, abs(tri(q, 0.27))) + smoothstep(w + 0.008, 0.0, abs(tri(-q, 0.27)));
          hex *= step(r, 0.56);
          float v = ring + g + hex * 0.8;
          float pulse = 0.75 + 0.25 * sin(uTime * 1.6 + vSpin * 2.0);
          float al = v * pulse * 0.62 * (1.0 - fogF);
          gl_FragColor = vec4(vC * al, 0.0);
        }`,
    });
    kit.additive(runeMat);
    const circ = (x, z, r, c, spin) => attr(paint(xf(new THREE.PlaneGeometry(r * 2, r * 2), { rx: -Math.PI / 2, x, y: 0.012, z }), col(c)), 'aSpin', spin);
    const runeGeo = merge([
      circ(0, -0.6, 3.6, '#a88a4a', 1),
      circ(-6.6, -3.6, 1.35, '#8a6ad8', -1.6),
      circ(6.6, -3.6, 1.35, '#8a6ad8', 1.6),
    ]);
    group.add(kit.mesh(runeGeo, runeMat, { order: 3 }));

    // --- floating islands (merged; bobbing in the vertex shader) ------------------------------
    const isl = [];
    const islandDefs = [
      [-24, -6, -34, 4.2], [-14, 3.5, -46, 2.6], [17, -9, -30, 3.4], [30, 6, -52, 5.0], [6, 11, -70, 3.0],
      [-42, 2, -70, 6.5], [46, -14, -60, 6], [-8, -18, -55, 4.5], [22, 16, -95, 4], [-60, 14, -110, 8], [64, 4, -120, 9],
      [-30, -12, -24, 2.0], [12, -4, -22, 1.4],
    ];
    const crystalsG = [];
    for (const [x, y, z, s] of islandDefs.slice(0, hi ? 13 : 9)) {
      const ph = R() * 6.28;
      isl.push(island(R, x, y, z, s, ph));
      if (s > 2.5) {
        for (let k = 0; k < 3; k++) {
          const g = new THREE.OctahedronGeometry(s * R.range(0.12, 0.2), 0);
          g.scale(0.6, 1.8, 0.6);
          xf(g, { x: x + R.range(-s * 0.4, s * 0.4), y: y - s * R.range(0.9, 1.4), z: z + R.range(-s * 0.3, s * 0.3), rz: Math.PI + R.range(-0.4, 0.4) });
          crystalsG.push(attr(paint(g, col(R() < 0.5 ? '#ffc860' : '#5ae0ff').multiplyScalar(2.2)), 'aPhase', ph));
        }
      }
    }
    const bob = { vertexHead: 'attribute float aPhase;', vertex: 'transformed.y += sin(uTime * 0.32 + aPhase) * 0.7; transformed.x += sin(uTime * 0.21 + aPhase * 1.7) * 0.35;' };
    const islMat = inject(kit.toon({ vertexColors: true }), kit, bob);
    group.add(kit.mesh(merge(isl), islMat));
    const crysMat = inject(kit.t(new THREE.MeshBasicMaterial({ vertexColors: true })), kit, bob);
    group.add(kit.mesh(merge(crystalsG), crysMat));

    // --- astrolabe: a crystal core with orbiting rings of light -----------------------------
    const astro = new THREE.Group();
    astro.position.copy(ASTRO);
    const core = kit.mesh(new THREE.OctahedronGeometry(1.4, 0), kit.toon({ color: 0xffe8c0, emissive: 0xffb840, emissiveIntensity: 1.6 }));
    core.geometry.scale(1, 1.6, 1);
    astro.add(core);
    const ringMats = [kit.glow('#ffc860', 1.9), kit.glow('#7ae8ff', 1.7), kit.glow('#c89aff', 1.7)];
    const aRings = [4.2, 5.6, 7.0].map((rr, i) => {
      const m = kit.mesh(new THREE.TorusGeometry(rr, 0.07 + i * 0.01, 6, 96), ringMats[i]);
      const holder = new THREE.Group(); holder.add(m);
      holder.rotation.set(0.4 + i * 0.7, i * 1.1, 0.2 * i);
      astro.add(holder);
      return { m, holder, sp: [0.25, -0.18, 0.13][i] };
    });
    // orbiting satellites on the outer ring
    const sats = kit.mesh(merge([0, 1, 2].map((k) => xf(new THREE.SphereGeometry(0.28, 10, 8), { x: Math.cos(k * 2.1) * 7, y: Math.sin(k * 2.1) * 7 }))), kit.glow('#ffe0a0', 3));
    aRings[2].m.add(sats);
    group.add(astro);

    // --- glows: pillar orbs, astrolabe, island crystals ---------------------------------------
    const gl = [];
    for (const [x, y, z] of orbs) {
      gl.push({ p: [x, y, z], size: 1.3, color: '#ffd27a', k: 1.4, flicker: 0.4 });
      gl.push({ p: [x, y, z], size: 4.2, color: '#ffb84a', k: 0.25, flicker: 0.3 });
    }
    gl.push({ p: ASTRO.toArray(), size: 7, color: '#ffc860', k: 0.3, flicker: 0.1 });
    gl.push({ p: ASTRO.toArray(), size: 22, color: '#a87aff', k: 0.06, flicker: 0.05 });
    group.add(glowPoints(kit, gl));
    // pillar orb cores (floating flame)
    group.add(gpuParticles(kit, {
      count: hi ? 60 : 30, shape: 'soft', seed: 21, order: 17,
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float side = aR.x < 0.5 ? ${orbs[0][0].toFixed(2)} : ${orbs[1][0].toFixed(2)};
        float life = 0.9 + aR.y * 0.6; float t = fract(uTime / life + aR.z);
        float a = aR2.x * 6.283 + uTime * 1.5; float r = 0.28 * (1.0 - t) * sqrt(aR2.y);
        P = vec3(side + cos(a) * r, ${orbs[0][1].toFixed(2)} - 0.15 + t * 0.9, ${orbs[0][2].toFixed(2)} + sin(a) * r);
        S = mix(0.32, 0.06, t);
        C = vec4(mix(vec3(2.6, 2.0, 1.1), vec3(1.6, 0.6, 1.8), t), smoothstep(0.0, 0.15, t) * (1.0 - t));
      }`,
    }));

    // --- gold dust and orbiting mote ring ------------------------------------------------
    group.add(gpuParticles(kit, {
      count: hi ? 260 : 110, shape: 'dot', seed: 22, order: 16,
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float t = uTime * (0.05 + aR.w * 0.06);
        P = vec3(mix(-24.0, 24.0, aR.x) + sin(t * 3.0 + aR2.x * 6.0) * 1.5, mix(-2.0, 9.0, aR.y) + sin(t * 2.0 + aR2.y * 6.0) * 0.8, mix(-30.0, -1.8, aR.z));
        S = 0.05 + aR2.z * 0.05;
        C = vec4(mix(vec3(1.0, 0.8, 0.4), vec3(0.8, 0.7, 1.0), aR2.w) * 2.2, pow(0.5 + 0.5 * sin(uTime * (1.0 + aR2.x * 2.0) + aR2.y * 30.0), 3.0));
      }`,
    }));
    group.add(gpuParticles(kit, {
      count: hi ? 320 : 140, shape: 'dot', seed: 23, order: 16,
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float a = aR.x * 6.28318 + uTime * 0.07;
        float rr = 21.0 + (aR.y - 0.5) * 2.5;
        vec3 q = vec3(cos(a) * rr, (aR.z - 0.5) * 0.6, sin(a) * rr);
        float tl = 0.22; q = vec3(q.x, q.y * cos(tl) - q.z * sin(tl), q.y * sin(tl) + q.z * cos(tl));
        P = q + vec3(0.0, 3.0, -9.0);
        S = 0.07 + aR2.x * 0.06;
        float back = smoothstep(-3.0, -6.0, P.z);
        C = vec4(mix(vec3(1.0, 0.82, 0.45), vec3(0.55, 0.85, 1.0), aR2.y) * 2.0, back * (0.5 + 0.5 * sin(uTime * 2.0 + aR2.z * 40.0)));
      }`,
    }));
    // comets
    const camU = { value: new THREE.Vector3(), type: 'vec3' };
    group.add(gpuParticles(kit, {
      count: 3, shape: 'streak', seed: 24, order: 19, fog: false, uniforms: { uCam: camU },
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float per = 7.0 + aR.x * 6.0;
        float k = floor((uTime + aR.y * per) / per);
        float t = mod(uTime + aR.y * per, per);
        float dur = 1.6 + aR.z * 0.8;
        float u = t / dur;
        float h1 = hash12(vec2(k, aR.w * 50.0)), h2 = hash12(vec2(k + 7.0, aR.w * 30.0));
        vec3 a = normalize(vec3(mix(-0.9, 0.9, h1), mix(0.06, 0.28, h2), -1.0));
        vec3 b = normalize(a + vec3(h1 < 0.5 ? 0.55 : -0.55, -0.1, 0.05));
        vec3 dir = normalize(mix(a, b, clamp(u, 0.0, 1.0)));
        P = uCam + dir * 300.0;
        V = (b - a) * 300.0 * 0.18;
        S = 0.9;
        C = vec4(vec3(1.0, 0.86, 0.65) * 2.6, step(u, 1.0) * sin(clamp(u, 0.0, 1.0) * 3.14159));
      }`,
    }));

    return {
      group,
      lighting: {
        hemiSky: 0x9a8cff, hemiGround: 0x2a1e48, hemiIntensity: 1.0,
        key: { color: 0xc4b6ff, intensity: 2.2, dir: [3, 7, 6] },
        rim: { color: 0xffc35a, intensity: 1.9, dir: [-5, 2, -6] },
        rim2: { color: 0x5ae0ff, intensity: 1.1, dir: [6, 2, -5] },
      },
      fog: { color: 0x1a1238, near: 40, far: 240 },
      background: new THREE.Color(0x0a0618),
      exposure: 1.0,
      bloom: { strength: 0.85, radius: 0.55, threshold: 0.82 },
      update(dt, time, camera) {
        kit.time.value = time;
        if (camera) { sky.position.copy(camera.position); camU.value.copy(camera.position); }
        const a = time * 0.004;
        rotU.value.set(Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a));
        planet.rotation.y = time * 0.01;
        core.rotation.y = time * 0.5;
        astro.position.y = ASTRO.y + Math.sin(time * 0.4) * 0.6;
        for (const r of aRings) { r.m.rotation.z = time * r.sp; r.holder.rotation.y += dt * r.sp * 0.3; }
      },
      dispose() { kit.dispose(group); },
    };
  },
};
