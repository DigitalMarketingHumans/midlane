// Frostfang Summit — a wind-scoured mountaintop shelf above a sea of clouds,
// under a living aurora. Ice crystals, a frozen waterfall, snowfall with gusts
// and drifting snow mist.
import * as THREE from 'three';
import {
  Kit, rng, xf, paint, attr, merge, rockGeo, fbm3, noise3, smooth, col, wrapDraw, speckle, blotches, blurCanvas,
  GLSL_NOISE, gpuParticles, glowPoints, skyDome, ridgeGeo, terrainGeo, inject,
} from './common.js';

const MOON = new THREE.Vector3(0.42, 0.2, -1).normalize();

// Shelf height: flat play area, gentle drifts around, irregular rim dropping into the abyss.
const rimZ = (x) => -8.6 + 1.1 * Math.sin(x * 0.23 + 1.0) + 0.6 * Math.sin(x * 0.57) - 2.5 * smooth(12, 24, Math.abs(x));
function H(x, z) {
  const ax = Math.abs(x);
  const flat = ax < 11.5 && z > -3.2;
  let y = 0;
  if (!flat) {
    const k = Math.max(smooth(11, 15, ax), smooth(-3.2, -5.5, z));
    y += k * (0.55 * fbm3(x * 0.18, z * 0.18, 3) + 0.35 * smooth(14, 30, ax) * fbm3(x * 0.07, z * 0.07, 8) * 3);
  }
  const rz = rimZ(x);
  // drifted cornice: a wavy raised lip just before the drop
  const lip = smooth(rz + 3.2, rz + 0.6, z) * (0.35 + 0.55 * fbm3(x * 0.35, 4.2, 1) + 0.4 * Math.max(0, Math.sin(x * 0.9 + 1.3)));
  if (z > rz) y += lip * smooth(-3.4, -5.0, z);
  if (z < rz) y += lip * 0.6 - Math.pow((rz - z), 1.6) * 3.5;
  return y;
}

const SKY_FS = /* glsl */`
uniform vec3 uMoon;
vec3 aurora(vec3 d, float e, float az){
  vec3 acc = vec3(0.0);
  #ifdef LOWQ
  const int AN = 2;
  #else
  const int AN = 3;
  #endif
  for (int i = 0; i < AN; i++){
    float fi = float(i);
    float base = 0.06 + fi * 0.035 + 0.022 * sin(az * 2.2 + uTime * 0.05 + fi * 2.1) + 0.014 * sin(az * 5.3 - uTime * 0.07 + fi);
    float h = e - base;
    float curtain = h > 0.0 ? exp(-h / (0.035 + 0.02 * fi)) : exp(-h * h / 0.00012);
    float rays = vnoise(vec2(az * 38.0 + fi * 13.0, uTime * 0.25 + fi)); rays = rays * rays;
    float rays2 = vnoise(vec2(az * 90.0 - fi * 7.0, uTime * 0.4));
    float mask = smoothstep(0.3, 0.62, fbm3x(vec2(az * 1.6 + fi * 5.0 - uTime * 0.015, fi * 3.0)));
    float fold = 0.55 + 0.45 * sin(az * 14.0 + uTime * 0.15 + 4.0 * vnoise(vec2(az * 2.5, uTime * 0.03 + fi)));
    float I = curtain * (0.2 + 0.5 * rays + 0.3 * rays2) * mask * fold * 0.62;
    float u = clamp(h / 0.14, 0.0, 1.0);
    vec3 cLo = i == 1 ? vec3(0.05, 0.85, 0.75) : vec3(0.15, 1.0, 0.45);
    vec3 cHi = i == 2 ? vec3(0.85, 0.25, 0.75) : vec3(0.45, 0.2, 1.0);
    acc += mix(cLo, cHi, u) * I;
  }
  return acc;
}
vec3 sky(vec3 d){
  float e = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  vec3 cHor = vec3(0.085, 0.12, 0.27), cMid = vec3(0.03, 0.042, 0.12), cTop = vec3(0.008, 0.01, 0.04);
  vec3 c;
  if (e >= 0.0) {
    c = mix(cHor, cMid, smoothstep(0.0, 0.16, e));
    c = mix(c, cTop, smoothstep(0.14, 0.7, e));
    c += vec3(0.9, 0.95, 1.0) * starField(d, 210.0, 0.12, uTime * 2.0) * smoothstep(0.0, 0.12, e) * 1.2;
    c += vec3(0.7, 0.8, 1.0) * starField(d, 90.0, 0.04, uTime * 1.3) * 1.4;
    #ifndef LOWQ
    // faint milky band
    c += vec3(0.08, 0.06, 0.14) * smoothstep(0.55, 0.85, fbm(vec2(az * 3.0, e * 9.0) + 3.0)) * smoothstep(0.05, 0.3, e);
    #endif
    c += aurora(d, e, az);
    // moon
    float ma = acos(clamp(dot(d, uMoon), -1.0, 1.0));
    vec3 mc = vec3(1.5, 1.6, 1.9) * (0.85 + 0.15 * vnoise(d.xy * 400.0));
    float disc = 1.0 - smoothstep(0.022, 0.025, ma);
    float crescent = smoothstep(0.0, 0.004, length(d - uMoon + vec3(0.009, -0.006, 0.0)) - 0.0215);
    c = mix(c, mc, disc * crescent);
    c += vec3(0.35, 0.45, 0.8) * exp(-ma * 22.0) * 0.4;
  } else {
    // sea of clouds far below, cel-banded, tinted by the aurora
    float t = 13.0 / max(-d.y, 0.004);
    vec2 p = d.xz * t * 0.02 + vec2(uTime * 0.02, uTime * 0.006);
    float n = fbm(p) + 0.35 * vnoise(p * 3.5 - uTime * 0.01);
    float lit = smoothstep(0.62, 0.66, n);
    float mid = smoothstep(0.48, 0.52, n);
    vec3 cs = mix(vec3(0.05, 0.07, 0.17), vec3(0.11, 0.15, 0.31), mid);
    cs = mix(cs, vec3(0.20, 0.27, 0.48), lit);
    cs += vec3(0.04, 0.16, 0.12) * lit * (0.5 + 0.5 * sin(az * 3.0 + uTime * 0.1));
    float haze = smoothstep(-0.005, -0.12, d.y);
    c = mix(cHor * 1.05, cs, haze);
  }
  return c;
}
`;

function snowTextures(kit) {
  const S = kit.hi ? 1024 : 512, R = rng(41);
  const ripples = [];
  for (let i = 0; i < 70; i++) ripples.push({ x: R() * S, y: R() * S, w: S * R.range(0.08, 0.3), a: (R() - 0.5) * 0.4, b: R.range(0.01, 0.03) * S, t: R() });
  const ice = [];
  for (let i = 0; i < 5; i++) ice.push({ x: R() * S, y: R() * S, r: S * R.range(0.05, 0.11) });
  const drawRipple = (x, rp, light, dark) => wrapDraw(S, S, rp.x, rp.y, rp.w, (cx, cy) => {
    x.save(); x.translate(cx, cy); x.rotate(rp.a);
    x.strokeStyle = dark; x.lineWidth = S * 0.006; x.beginPath(); x.moveTo(-rp.w / 2, 0); x.quadraticCurveTo(0, rp.b, rp.w / 2, 0); x.stroke();
    x.strokeStyle = light; x.lineWidth = S * 0.004; x.beginPath(); x.moveTo(-rp.w / 2, -S * 0.004); x.quadraticCurveTo(0, rp.b - S * 0.004, rp.w / 2, -S * 0.004); x.stroke();
    x.restore();
  });
  const map = kit.tex(S, S, (x) => {
    x.fillStyle = '#d4dcea'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, R, 50, S * 0.08, S * 0.25, ['#c4cee2', '#e4eaf4', '#ccd6ea', '#bcc6dc'], 0.25);
    for (const ic of ice) wrapDraw(S, S, ic.x, ic.y, ic.r, (cx, cy) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, ic.r);
      g.addColorStop(0, 'rgba(150,190,225,0.55)'); g.addColorStop(0.7, 'rgba(160,195,225,0.35)'); g.addColorStop(1, 'rgba(160,195,225,0)');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, ic.r * 1.4, ic.r * 0.8, 0.3, 0, 7); x.fill();
      x.strokeStyle = 'rgba(235,245,255,0.5)'; x.lineWidth = S * 0.0015;
      for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(cx + (R() - 0.5) * ic.r, cy + (R() - 0.5) * ic.r * 0.6); x.lineTo(cx + (R() - 0.5) * ic.r * 1.6, cy + (R() - 0.5) * ic.r); x.stroke(); }
    });
    for (const rp of ripples) drawRipple(x, rp, 'rgba(245,250,255,0.4)', 'rgba(140,156,196,0.28)');
    speckle(x, S, S, R, 10);
  }, { aniso: kit.aniso, repeat: [90 / 4, 26 / 4] });
  const bump = kit.tex(S, S, (x) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, R, 40, S * 0.08, S * 0.25, ['#a0a0a0', '#606060'], 0.4);
    for (const rp of ripples) drawRipple(x, rp, 'rgba(255,255,255,0.8)', 'rgba(0,0,0,0.8)');
    blurCanvas(x, S, S, Math.max(1, S / 400));
    speckle(x, S, S, R, 16);
  }, { srgb: false, aniso: kit.aniso, repeat: [90 / 4, 26 / 4] });
  return { map, bump };
}

// Hexagonal ice crystal with a pointed tip; aH attribute = 0 base .. 1 tip.
function crystal(r, h) {
  const body = new THREE.CylinderGeometry(r * 0.92, r, h, 6, 1);
  body.translate(0, h / 2, 0);
  const tip = new THREE.ConeGeometry(r * 0.92, r * 1.9, 6, 1);
  tip.translate(0, h + r * 0.95, 0);
  const g = merge([body, tip]);
  g.computeVertexNormals();
  return attr(g, 'aH', (x, y) => y / (h + r * 1.9));
}
function crystalCluster(R, x, y, z, s, tint) {
  const out = [];
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const main = i === 0;
    const h = s * (main ? R.range(1.6, 2.4) : R.range(0.5, 1.4)), r = s * (main ? 0.26 : R.range(0.1, 0.2));
    const g = crystal(r, h);
    const a = R() * Math.PI * 2, tilt = main ? R.range(-0.15, 0.15) : R.range(0.35, 0.8);
    xf(g, { rz: tilt, ry: R() * Math.PI });
    xf(g, { ry: a });
    xf(g, { x: x + (main ? 0 : Math.cos(a) * s * 0.25), y: y - 0.1 * s, z: z + (main ? 0 : Math.sin(a) * s * 0.2) });
    out.push(paint(g, tint.clone().offsetHSL((R() - 0.5) * 0.04, 0, 0)));
  }
  return out;
}

export default {
  id: 'frost', name: 'Frostfang Summit', sub: 'The aurora watches the highest duel', music: 'stage_frost',
  palette: { accent: '#5ee8d8', dark: '#0d1430', light: '#d8e6ff' },
  build(ctx) {
    const kit = new Kit(ctx);
    const hi = kit.hi;
    const group = new THREE.Group();
    group.name = 'stage:frost';
    const R = rng(777);

    const windU = { value: 0 }, windV = { value: 0 }, camU = { value: new THREE.Vector3(), type: 'vec3' };
    // --- sky -----------------------------------------------------------------
    const sky = skyDome(kit, { fs: SKY_FS, uniforms: { uMoon: { value: MOON.clone() } } });
    group.add(sky);

    // --- distant peaks rising from the cloud sea ------------------------------
    const haze = col('#1a2650'), mist = col('#1b2a5a');
    const layers = [
      { z: -270, base: -40, hMin: -10, hMax: 44, rock: '#26305e', snow: '#5d6c9c', fq: 0.011, seed: 4, fade: 0.5 },
      { z: -165, base: -40, hMin: -30, hMax: 24, rock: '#182048', snow: '#7083b4', fq: 0.022, seed: 7, fade: 0.25 },
    ];
    const peaks = merge(layers.map((L) => {
      const dist = -L.z + 11.5;
      return ridgeGeo({
        z: L.z, x0: -dist * 1.3, x1: dist * 1.3, seg: 260, base: L.base, hMin: L.hMin, hMax: L.hMax, rows: 7,
        prof: (x) => {
          const r = 1 - Math.abs(noise3(x * L.fq, L.seed, 0) * 2 - 1);
          const r2 = 1 - Math.abs(noise3(x * L.fq * 2.7, L.seed + 3, 0) * 2 - 1);
          return 0.62 * Math.pow(r, 2.6) + 0.26 * Math.pow(r2, 1.6) + 0.12 * noise3(x * L.fq * 9, L.seed, 1);
        },
        colorAt: (t, x, h01, top) => {
          const yy = L.base + (top - L.base) * t;
          const snowLine = 0.55 + 0.2 * noise3(x * 0.08, L.seed, 2) - 0.15 * h01;
          const c = col(L.rock).lerp(col(L.snow), smooth(snowLine - 0.03, snowLine + 0.03, t) * smooth(-14, 0, yy));
          c.lerp(haze, L.fade);
          return c.lerp(mist, smooth(2, -14, yy));
        },
      });
    }));
    group.add(kit.mesh(peaks, kit.t(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { order: -90 }));

    // --- the shelf ----------------------------------------------------------------
    const { map, bump } = snowTextures(kit);
    const shelf = terrainGeo({
      x0: -45, x1: 45, z0: -12, z1: 14, nx: hi ? 220 : 110, nz: hi ? 90 : 45, h: H,
      colorAt: (x, y, z, ny) => {
        const c = col('#ffffff');
        c.lerp(col('#a4b0d8'), smooth(0.92, 0.5, ny) * 0.6);
        c.lerp(col('#5a6488'), smooth(-0.5, -3, y));
        return c;
      },
    });
    const snowMat = kit.std({ map, bumpMap: bump, bumpScale: 0.9, roughness: 0.8, color: 0xd2d8e6, vertexColors: true });
    inject(snowMat, kit, {
      worldPos: true, uniforms: { uWind: windU },
      emissive: /* glsl */`{
        // wind-blown snow streaking across the shelf
        float ws = fbm3x(vec2(vWPos.x * 0.16 - uWind * 0.55, vWPos.z * 0.85 + sin(vWPos.x * 0.1) * 0.6));
        float streak = smoothstep(0.56, 0.78, ws) * (1.0 - smoothstep(0.78, 0.95, ws));
        totalEmissiveRadiance += vec3(0.32, 0.38, 0.55) * streak * 0.22;
        vec3 Vd = normalize(cameraPosition - vWPos);
        vec2 q = vWPos.xz * 26.0;
        vec2 cell = floor(q);
        float h = hash12(cell), h2 = hash12(cell + 17.31);
        float tw = sin(uTime * (0.6 + h2 * 2.5) + h * 60.0 + dot(Vd.xz, vec2(40.0, 25.0)));
        float sp = step(0.975, h) * smoothstep(0.55, 1.0, tw);
        vec2 f = fract(q) - 0.5 - (vec2(h2, h) - 0.5) * 0.5;
        sp *= smoothstep(0.16, 0.0, length(f));
        float dist = length(cameraPosition - vWPos);
        totalEmissiveRadiance += vec3(0.85, 0.93, 1.0) * sp * 3.0 * (1.0 - smoothstep(9.0, 26.0, dist));
      }`,
    });
    group.add(kit.mesh(shelf, snowMat, { receive: true }));

    // --- rocks, cliffs, crystals ----------------------------------------------------
    const solids = [];
    const ice = [];
    const rockC = (snowAmt = 0.55) => (px, py, pz, nx, ny) => {
      const c = col('#2c3352').offsetHSL(0, 0, (noise3(px * 1.5, py * 1.5, pz * 1.5) - 0.5) * 0.05);
      const sn = smooth(snowAmt, snowAmt + 0.1, ny + (noise3(px * 2, py * 2, pz * 2) - 0.5) * 0.3);
      return c.lerp(col('#b8c6e4'), sn);
    };
    const rock = (x, y, z, s, o = {}) => {
      const g = rockGeo(R, Object.assign({ detail: 1, jag: 0.3, flat: 0.4 }, o));
      xf(g, { x, y, z, s, ry: R() * 6, sy: o.syy ?? 1 });
      solids.push(paint(g, rockC(o.snow ?? 0.5)));
    };
    // boundary clusters
    const iceTint = col('#7fd8ff');
    for (const sx of [-1, 1]) {
      ice.push(...crystalCluster(R, sx * 9.3, 0, -1.4, 1.35, iceTint));
      ice.push(...crystalCluster(R, sx * 8.85, 0, -2.9, 0.8, col('#9ab8ff')));
      ice.push(...crystalCluster(R, sx * 10.6, H(sx * 10.6, -0.4), -0.4, 0.9, col('#8ff0e8')));
      rock(sx * 9.9, 0.1, -2.2, 0.9, { sx: 1.3, sy: 0.9 });
      rock(sx * 9.7, 0.0, 0.35, 0.45, { sy: 0.7 });
      rock(sx * 11.5, H(sx * 11.5, -1.8), -1.8, 1.4, { sx: 1.2, sy: 1.1 });
      rock(sx * 13.5, H(sx * 13.5, 1.5), 1.5, 1.2, { sy: 0.9 });
    }
    // rim stones & small crystals along the back edge
    for (let i = 0; i < (hi ? 40 : 22); i++) {
      const x = R.range(-34, 34);
      const z = rimZ(x) + R.range(0.1, 1.4);
      if (Math.abs(x) < 2.5 && R() < 0.5) continue;
      if (R() < 0.6) rock(x, H(x, z), z, R.range(0.35, 1.1), { sy: 0.7 });
      else ice.push(...crystalCluster(R, x, H(x, z), z, R.range(0.4, 0.8), R() < 0.5 ? iceTint : col('#a8a0ff')));
    }
    // midground cliffs: left spire mass, right frozen-fall cliff
    const cliffs = [
      [-21, -34, 5, 2.2], [-26, -38, 6.5, 2.0], [-17.5, -40, 3.6, 3.0], [-33, -36, 5, 1.5], [-40, -50, 8, 1.6],
      [15.5, -24.5, 3.6, 1.7], [18.8, -26, 4.4, 1.5], [12.4, -26, 3.2, 1.9], [24, -32, 6, 1.6], [31, -44, 8, 1.5],
    ];
    for (const [x, z, s, sy] of cliffs) {
      rock(x, -s * sy * 0.55 + R.range(-1, 1), z, s, { sy, detail: 2, jag: 0.34, flat: 0.9, snow: 0.45, syy: 1 });
      rock(x + R.range(-2, 2), s * sy * 0.35, z + R.range(-1, 1), s * 0.55, { sy: sy * 0.9, detail: 1, jag: 0.35, snow: 0.4 });
    }
    // pinnacles rising from the abyss just beyond the rim (parallax layer)
    for (let i = 0; i < (hi ? 11 : 7); i++) {
      const x = -30 + i * (60 / (hi ? 10 : 6)) + R.range(-2.5, 2.5);
      if (x > 10 && x < 20) continue;
      const z = R.range(-15, -24), top = R.range(-0.5, 3.2);
      const s = R.range(1.0, 1.8), sy = (top + 22) / (s * 2 * 0.9);
      rock(x, top - s * sy * 0.95, z, s, { sy, detail: 1, jag: 0.25, flat: 0.95, snow: 0.35 });
    }
    // rock lip over the frozen fall
    rock(14.4, 6.0, -22.6, 2.2, { sx: 1.6, sy: 0.55, snow: 0.3 });
    rock(17.2, 5.6, -23.4, 1.8, { sx: 1.2, sy: 0.7, snow: 0.3 });
    // icicles fringe along the frozen fall lip
    const fallX = 14.6, fallZ = -22.2, fallTop = 5.6;
    for (let i = 0; i < 14; i++) {
      const x = fallX + R.range(-2.6, 2.6), len = R.range(0.6, 2.2);
      const g = new THREE.ConeGeometry(R.range(0.08, 0.2), len, 5);
      xf(g, { x, y: fallTop + 0.4 - len / 2 + R.range(-0.2, 0.2), z: fallZ + R.range(-0.2, 0.5), rx: Math.PI });
      ice.push(attr(paint(g, col('#b8f0ff')), 'aH', (px, py) => smooth(fallTop + 0.4 - len, fallTop + 0.4, py)));
    }
    group.add(kit.mesh(merge(solids), kit.toon({ vertexColors: true }), { cast: true, receive: true }));

    // ice material: deep core, faceted bands, bright fresnel rim that blooms
    const iceMat = kit.shader({
      vs: /* glsl */`attribute vec3 color; attribute float aH; varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vC = color; vH = aH; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec3 vC; varying float vH; varying vec3 vN; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){
          vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
          float f = 1.0 - abs(dot(N, V));
          float l = dot(N, normalize(vec3(0.4, 0.8, 0.6)));
          float band = 0.55 + 0.25 * step(0.0, l) + 0.25 * step(0.55, l);
          vec3 deep = vC * vec3(0.10, 0.22, 0.40);
          vec3 c = mix(deep, vC * 0.75, vH) * band;
          float streak = smoothstep(0.55, 0.85, vnoise(vec2(vW.x * 2.0 + vW.z * 2.0, vW.y * 0.6 - uTime * 0.05)));
          c += vC * streak * 0.18;
          c += vec3(0.55, 0.95, 1.0) * pow(f, 3.0) * (0.9 + 0.6 * vH);
          c += vec3(0.7, 1.0, 1.0) * smoothstep(0.86, 1.0, vH) * 0.9;
          float tw = pow(max(sin(uTime * 1.3 + vW.x * 3.0 + vW.y * 2.0), 0.0), 30.0);
          c += vec3(0.9, 1.0, 1.0) * tw * vH * 0.8;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    group.add(kit.mesh(merge(ice), iceMat, { cast: true }));

    // --- frozen waterfall ---------------------------------------------------------
    const fallGeo = new THREE.CylinderGeometry(2.8, 2.1, 12, 28, 24, true, -Math.PI * 0.32, Math.PI * 0.64);
    {
      const P = fallGeo.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
        const b = 1 + 0.12 * noise3(x * 1.5, y * 0.35, 3) + 0.06 * noise3(x * 4, y * 0.8, 5);
        P.setXYZ(i, x * b, y, z * b * 0.45);
      }
      fallGeo.computeVertexNormals();
      xf(fallGeo, { x: fallX, y: fallTop - 6 + 0.2, z: fallZ - 0.8 });
    }
    const fallMat = kit.shader({
      vs: /* glsl */`varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){
          vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
          float s1 = vnoise(vec2(vUv.x * 46.0, vUv.y * 2.0));
          float s2 = vnoise(vec2(vUv.x * 120.0, vUv.y * 5.0 + 3.0));
          float col1 = smoothstep(0.35, 0.75, s1);
          vec3 c = mix(vec3(0.07, 0.16, 0.32), vec3(0.28, 0.50, 0.70), col1 * 0.8 + s2 * 0.2);
          c *= 0.6 + 0.5 * vUv.y;
          float sh = exp(-pow(fract(vUv.y * 1.5 + uTime * 0.06 + s1 * 0.2) - 0.5, 2.0) * 60.0);
          c += vec3(0.5, 0.9, 1.0) * sh * col1 * 0.4;
          float f = 1.0 - abs(dot(N, V));
          c += vec3(0.4, 0.85, 1.0) * pow(f, 2.0) * 0.35;
          c += vec3(0.6, 1.0, 1.0) * smoothstep(0.93, 1.0, vUv.y) * 0.6;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    group.add(kit.mesh(fallGeo, fallMat));

    // --- glows --------------------------------------------------------------------
    const gl = [];
    for (const sx of [-1, 1]) {
      gl.push({ p: [sx * 9.3, 2.6, -1.3], size: 3.2, color: '#5ee8ff', k: 0.5, flicker: 0.2 });
      gl.push({ p: [sx * 9.3, 0.25, -1.1], size: 3.6, color: '#4ad0ff', k: 0.22, flicker: 0.1 });
    }
    gl.push({ p: [fallX, fallTop - 1, fallZ + 0.5], size: 7, color: '#5ad8ff', k: 0.08, flicker: 0.05 });
    group.add(glowPoints(kit, gl));

    // --- snowfall with wind gusts -----------------------------------------------------
    group.add(gpuParticles(kit, {
      count: hi ? 1600 : 600, shape: 'flake', blending: 'normal', seed: 31, order: 18,
      uniforms: { uWindX: windU, uWindV: windV, uCam: camU },
      body: /* glsl */`
        void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
          vec3 box = vec3(44.0, 15.0, 25.0);
          float fs = 0.55 + aR.w * 0.7;
          float wf = 0.7 + aR2.x * 0.6;
          vec3 p = aR.xyz * box;
          p.y -= uTime * fs;
          p.x += uWindX * wf;
          p.x += sin(uTime * (0.6 + aR2.y) + aR2.z * 6.28) * 0.35;
          p.z += cos(uTime * (0.5 + aR2.w) + aR2.y * 6.28) * 0.3;
          vec3 o = vec3(uCam.x - box.x * 0.5, -1.0, -19.0);
          P = mod(p - o, box) + o;
          float near = clamp(1.0 - (uCam.z - P.z) / 14.0, 0.0, 1.0);
          S = mix(0.02, 0.045, aR2.z) * (1.0 + near * 0.3);
          float fade = smoothstep(0.0, 1.5, P.y + 1.0) * (1.0 - smoothstep(12.0, 14.0, P.y + 1.0));
          C = vec4(vec3(0.82, 0.88, 1.0), 0.85 * fade * (1.0 - near * 0.45));
          V = vec3(uWindV * wf, -fs, 0.0) * 0.012;
        }`,
    }));
    // floor mist
    group.add(gpuParticles(kit, {
      count: hi ? 30 : 14, shape: 'mist', blending: 'normal', seed: 32, order: 11,
      uniforms: { uWindX: windU },
      body: /* glsl */`
        void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
          float span = 60.0;
          float x = mod(aR.x * span + uWindX * 0.35 * (0.6 + aR.w * 0.4) + uTime * 0.25, span) - span * 0.5;
          float front = step(0.8, aR2.x);
          float z = front > 0.5 ? mix(0.6, 3.0, aR.z) : mix(-1.4, -8.5, aR.z);
          P = vec3(x, mix(0.1, 0.5, aR.y), z);
          S = mix(2.5, 5.0, aR2.y);
          float edge = smoothstep(span * 0.5, span * 0.38, abs(x));
          C = vec4(vec3(0.62, 0.72, 0.95), (front > 0.5 ? 0.05 : 0.09) * edge * (0.7 + 0.3 * sin(uTime * 0.4 + aR2.z * 9.0)));
        }`,
    }));
    // drifting ice glitter in the air near the crystals
    group.add(gpuParticles(kit, {
      count: hi ? 70 : 30, shape: 'dot', seed: 33, order: 16,
      body: /* glsl */`
        void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
          float side = aR.x < 0.5 ? -1.0 : 1.0;
          float t = uTime * (0.15 + aR.w * 0.2) + aR2.x * 6.28;
          P = vec3(side * (9.6 + (aR.y - 0.5) * 2.0) + sin(t) * 0.6, mod(aR.z * 4.0 + uTime * 0.12 * (0.5 + aR2.y), 4.0), -1.6 + cos(t * 1.3) * 0.9);
          S = 0.06;
          C = vec4(vec3(0.5, 0.95, 1.0) * 2.4, pow(0.5 + 0.5 * sin(uTime * 3.0 + aR2.z * 40.0), 6.0) * smoothstep(4.0, 2.5, P.y));
        }`,
    }));

    return {
      group,
      lighting: {
        hemiSky: 0xa4b4e4, hemiGround: 0x283050, hemiIntensity: 0.9,
        key: { color: 0xc4d6ff, intensity: 2.0, dir: [3, 6, 6] },
        rim: { color: 0xff6ad5, intensity: 1.5, dir: [-6, 3, -5] },
        rim2: { color: 0x40f0d0, intensity: 1.25, dir: [6, 2, -6] },
      },
      fog: { color: 0x1a2650, near: 18, far: 150 },
      background: new THREE.Color(0x0d1430),
      exposure: 1.0,
      bloom: { strength: 0.75, radius: 0.5, threshold: 0.82 },
      update(dt, time, camera) {
        kit.time.value = time;
        if (camera) { sky.position.copy(camera.position); camU.value.copy(camera.position); }
        // gust cycle (~11 s): integrated wind offset + current speed
        windV.value = 1.1 + 1.3 * Math.sin(time * 0.57) + 0.6 * Math.sin(time * 1.31 + 1.0);
        windU.value = 1.1 * time - (1.3 / 0.57) * Math.cos(time * 0.57) - (0.6 / 1.31) * Math.cos(time * 1.31 + 1.0);
      },
      dispose() { kit.dispose(group); },
    };
  },
};
