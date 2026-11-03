// Riverbank at Dusk — a worn stone causeway beside a slow river at sunset, two
// guardian towers (gold / violet) on the far banks, cel-shaded trees, reeds,
// fireflies and lanterns.
import * as THREE from 'three';
import {
  Kit, rng, xf, paint, attr, merge, rockGeo, fbm3, noise3, smooth, lerp, col, wrapDraw, speckle, blotches, blurCanvas,
  GLSL_NOISE, FOG_FRAG_ADD, gpuParticles, glowPoints, skyDome, ridgeGeo, terrainGeo, swayMaterial,
} from './common.js';

const WY = -0.35; // water level
const SUN = new THREE.Vector3(-0.24, 0.085, -1).normalize();
const TOWERS = [
  { x: -14.5, z: -31, color: '#ffc04a', stone: '#9a8466', dark: '#5e4c3c', trim: '#d9a645' },
  { x: 15.5, z: -33, color: '#b27bff', stone: '#6f6e8c', dark: '#43405a', trim: '#9a7ae0' },
];
const nearBank = (x) => -2.78 - 4.4 * smooth(9.2, 14.5, Math.abs(x)) + 0.5 * Math.sin(x * 0.41) * smooth(10, 15, Math.abs(x));
const farBank = (x) => -18.5 + 1.4 * Math.sin(x * 0.11 + 0.6) + 0.6 * Math.sin(x * 0.37 + 2.0);
function H(x, z) {
  const nb = nearBank(x), fb = farBank(x);
  if (z > nb) {
    const d = z - nb;
    let y = lerp(-1.1, 0.0, smooth(0, 0.8, d));
    const ax = Math.abs(x);
    if (z > -2.7 && z < 3.75 && ax < 44) return Math.min(y, -0.05); // under the causeway
    if (z >= 3.75) return ax < 31 ? -0.05 : y + 0.25 * smooth(31, 40, ax) * fbm3(x * 0.12, z * 0.12, 1);
    y += (0.35 * fbm3(x * 0.15, z * 0.15, 2) + 0.2) * smooth(0.5, 3, d) * smooth(9.5, 13, ax);
    return y;
  }
  if (z < fb) {
    const d = fb - z;
    let y = lerp(-1.1, 0.12, smooth(0, 1.4, d));
    y += (fbm3(x * 0.035, z * 0.035, 5) - 0.42) * 6 * smooth(4, 30, d) + 0.3 * smooth(0.5, 4, d);
    y += 4 * smooth(30, 70, d) * fbm3(x * 0.02, z * 0.02, 9);
    return y;
  }
  return -1.15 + 0.15 * noise3(x * 0.3, z * 0.3);
}

// ---------------------------------------------------------------------------
// Sky GLSL shared by dome + water reflection
const SKY_FN = /* glsl */`
uniform vec3 uSun;
vec3 skyBase(vec3 d){
  float e = asin(clamp(d.y, -1.0, 1.0));
  vec2 hz = normalize(d.xz + 1e-5); vec2 sz = normalize(uSun.xz);
  float sa = max(dot(hz, sz), 0.0);
  vec3 cHor = mix(vec3(0.80, 0.36, 0.16), vec3(1.0, 0.56, 0.18), pow(sa, 3.0));
  vec3 cLow = mix(vec3(0.60, 0.22, 0.25), vec3(0.75, 0.30, 0.22), pow(sa, 2.0));
  vec3 cMid = vec3(0.27, 0.10, 0.27);
  vec3 cTop = vec3(0.05, 0.035, 0.13);
  vec3 c = mix(cHor, cLow, smoothstep(0.03, 0.13, e));
  c = mix(c, cMid, smoothstep(0.11, 0.25, e));
  c = mix(c, cTop, smoothstep(0.22, 0.6, e));
  c += vec3(0.7, 0.3, 0.1) * pow(sa, 12.0) * exp(-max(e, 0.0) * 9.0) * 0.45;
  float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
  c += vec3(1.0, 0.5, 0.2) * (exp(-ang * 14.0) * 0.4 + exp(-ang * 60.0) * 0.6);
  return c;
}
`;

const SKY_DOME_FS = SKY_FN + /* glsl */`
#ifdef LOWQ
float cloudN(vec2 q){ return fbm3x(q) * 0.94; }
#else
float cloudN(vec2 q){ return fbm(q) + 0.25 * vnoise(q * 3.1); }
#endif
vec3 sky(vec3 d){
  vec3 c = skyBase(d);
  float e = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  float ang = acos(clamp(dot(d, uSun), -1.0, 1.0));
  c = mix(c, vec3(3.2, 1.9, 0.8), 1.0 - smoothstep(0.015, 0.0175, ang));
  // stylized cel clouds: violet bodies with gold undersides, drifting slowly
  vec2 hz = normalize(d.xz + 1e-5); vec2 sz = normalize(uSun.xz);
  float sa = max(dot(hz, sz), 0.0);
  vec2 q = vec2(az * 2.6 + uTime * 0.004, e * 22.0);
  float band = smoothstep(0.07, 0.12, e) * (1.0 - smoothstep(0.24, 0.4, e));
  float thr = 0.7;
  float n0 = cloudN(q) * band + 0.12 * band;
  float n1 = cloudN(q - vec2(0.0, 0.35)) * band + 0.12 * band;
  float cl = smoothstep(thr, thr + 0.01, n0);
  float under = cl * (1.0 - smoothstep(thr, thr + 0.01, n1 + 0.02));
  float inner = smoothstep(thr + 0.04, thr + 0.05, n0);
  vec3 body = mix(c * 0.78 + vec3(0.02, 0.0, 0.04), c * 0.9 + vec3(0.06, 0.02, 0.0), sa);
  vec3 lit = mix(vec3(0.80, 0.34, 0.30), vec3(1.15, 0.62, 0.28), pow(sa, 2.5));
  vec3 cc = mix(body, body * 0.88, inner);
  cc = mix(cc, lit, under);
  c = mix(c, cc, cl);
  c += vec3(0.9, 0.9, 1.0) * starField(d, 160.0, 0.07, uTime) * smoothstep(0.25, 0.55, e) * 0.8;
  return c;
}
`;

// ---------------------------------------------------------------------------
function roadTextures(kit) {
  const S = kit.hi ? 1024 : 512, R = rng(11);
  const stones = [];
  const rows = 7, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    const ws = [];
    let tot = 0;
    while (tot < S - rh * 1.1) { const w = rh * R.range(1.15, 2.1); ws.push(w); tot += w; }
    const k = S / tot;
    let x = R() * S;
    for (const w of ws) { stones.push({ x, y: r * rh, w: w * k, h: rh, tone: R(), wear: R(), crack: R() < 0.3, seed: R() }); x += w * k; }
  }
  const g = S / 170, rad = S / 90;
  const path = (x, s, ox, oy, inset, R2) => {
    const x0 = ox + inset, y0 = oy + inset, x1 = ox + s.w - inset, y1 = oy + s.h - inset;
    const j = () => (R2() - 0.5) * g * 1.6;
    const pts = [[x0 + j(), y0 + j()], [x1 + j(), y0 + j()], [x1 + j(), y1 + j()], [x0 + j(), y1 + j()]];
    x.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 3) % 4];
      const ra = Math.min(rad, s.w * 0.3, s.h * 0.3);
      const dxb = b[0] - a[0], dyb = b[1] - a[1], lb = Math.hypot(dxb, dyb);
      const dxc = c[0] - a[0], dyc = c[1] - a[1], lc = Math.hypot(dxc, dyc);
      const p1 = [a[0] + dxc / lc * ra, a[1] + dyc / lc * ra], p2 = [a[0] + dxb / lb * ra, a[1] + dyb / lb * ra];
      if (i === 0) x.moveTo(p1[0], p1[1]); else x.lineTo(p1[0], p1[1]);
      x.quadraticCurveTo(a[0], a[1], p2[0], p2[1]);
    }
    x.closePath();
  };
  const map = kit.tex(S, S, (x) => {
    x.fillStyle = '#2f2a26'; x.fillRect(0, 0, S, S);
    blotches(x, S, S, R, 60, S * 0.01, S * 0.03, ['#3f5a2a', '#4d6a2e', '#2c3d22'], 0.5);
    for (const s of stones) {
      wrapDraw(S, S, s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w, s.h), (cx, cy) => {
        const ox = cx - s.w / 2, oy = cy - s.h / 2;
        const R3 = rng(Math.floor(s.seed * 1e6));
        const l = 44 + s.tone * 14, hue = 22 + s.tone * 18;
        path(x, s, ox, oy, g, R3);
        x.fillStyle = `hsl(${hue}, ${8 + s.tone * 6}%, ${l}%)`; x.fill();
        x.save(); x.clip();
        const gr = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(s.w, s.h) * 0.6);
        gr.addColorStop(0, `rgba(255,240,220,${0.08 + s.wear * 0.1})`); gr.addColorStop(1, 'rgba(30,20,20,0.22)');
        x.fillStyle = gr; x.fillRect(ox, oy, s.w, s.h);
        // worn top-left bevel highlight / bottom-right shade
        x.lineWidth = g * 1.6;
        x.strokeStyle = 'rgba(255,235,210,0.18)'; x.beginPath(); x.moveTo(ox, oy + s.h); x.lineTo(ox + g * 1.5, oy + g * 1.5); x.lineTo(ox + s.w, oy + g * 1.2); x.stroke();
        x.strokeStyle = 'rgba(20,10,10,0.28)'; x.beginPath(); x.moveTo(ox + s.w - g, oy); x.lineTo(ox + s.w - g, oy + s.h - g); x.lineTo(ox, oy + s.h - g); x.stroke();
        for (let k = 0; k < 6; k++) { // speck pits
          x.fillStyle = `rgba(30,22,18,${0.15 + R3() * 0.2})`;
          x.beginPath(); x.arc(ox + R3() * s.w, oy + R3() * s.h, g * (0.3 + R3() * 0.8), 0, 7); x.fill();
        }
        if (s.crack) {
          x.strokeStyle = 'rgba(25,18,14,0.6)'; x.lineWidth = g * 0.5; x.beginPath();
          let px = ox + s.w * R3(), py = oy + g;
          x.moveTo(px, py);
          for (let k = 0; k < 5; k++) { px += (R3() - 0.5) * s.w * 0.25; py += s.h / 5; x.lineTo(px, py); }
          x.stroke();
        }
        // moss creeping on edges
        for (let k = 0; k < 4; k++) {
          const ex = ox + (R3() < 0.5 ? R3() * s.w : (R3() < 0.5 ? 0 : s.w)), ey = oy + (R3() < 0.5 ? s.h : R3() * s.h);
          const mr = g * (1.5 + R3() * 3);
          const mg = x.createRadialGradient(ex, ey, 0, ex, ey, mr);
          mg.addColorStop(0, 'rgba(78,105,45,0.55)'); mg.addColorStop(1, 'rgba(78,105,45,0)');
          x.fillStyle = mg; x.fillRect(ex - mr, ey - mr, mr * 2, mr * 2);
        }
        x.restore();
      });
    }
    blotches(x, S, S, R, 40, S * 0.05, S * 0.15, ['#5a4a40', '#3a3540', '#6a5a48'], 0.12);
    speckle(x, S, S, R, 16);
  }, { aniso: kit.aniso, repeat: [80 / 4, 6.6 / 4] });
  const bump = kit.tex(S, S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    for (const s of stones) {
      wrapDraw(S, S, s.x + s.w / 2, s.y + s.h / 2, Math.max(s.w, s.h), (cx, cy) => {
        const R3 = rng(Math.floor(s.seed * 1e6));
        path(x, s, cx - s.w / 2, cy - s.h / 2, g, R3);
        x.fillStyle = `rgb(${150 + s.tone * 60 | 0},${150 + s.tone * 60 | 0},${150 + s.tone * 60 | 0})`; x.fill();
      });
    }
    blurCanvas(x, S, S, Math.max(1, S / 300));
    speckle(x, S, S, R, 30);
  }, { srgb: false, aniso: kit.aniso, repeat: [80 / 4, 6.6 / 4] });
  return { map, bump };
}

// ---------------------------------------------------------------------------
function roundTree(R, x, y, z, s, pal) {
  const parts = [];
  const h = 2.0 * s;
  const lean = (R() - 0.5) * 0.12;
  const trunk = xf(new THREE.CylinderGeometry(0.11 * s, 0.2 * s, h, 6, 2), { x, y: y + h / 2, z, rz: lean });
  parts.push(attr(paint(trunk, col(pal.bark)), 'aSway', (px, py) => smooth(y, y + h * 1.6, py) * 0.6));
  const cy = y + h * 1.05, n = 3 + Math.floor(R() * 3);
  const base = col(pal.leaf[Math.floor(R() * pal.leaf.length)]);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R();
    const rr = s * (0.75 + R() * 0.55) * (i === 0 ? 1.25 : 1);
    const bx = x + lean * -h + (i === 0 ? 0 : Math.cos(a) * s * 0.75), bz = z + (i === 0 ? 0 : Math.sin(a) * s * 0.6);
    const by = cy + (i === 0 ? s * 0.55 : R() * s * 0.5);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const P = g.attributes.position, sd = R() * 50;
    for (let k = 0; k < P.count; k++) {
      const px = P.getX(k), py = P.getY(k), pz = P.getZ(k);
      const j = 1 + (noise3(px * 2 + sd, py * 2, pz * 2) - 0.5) * 0.3;
      P.setXYZ(k, px * j, py * j * 0.82, pz * j);
    }
    xf(g, { x: bx, y: by, z: bz, s: rr });
    const tint = base.clone().offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.05);
    const warm = col(pal.warm);
    parts.push(attr(paint(g, (px, py, pz, nx, ny, nz) => {
      const c = tint.clone();
      c.lerp(col(pal.shade), smooth(0.2, -0.8, ny) * 0.7);
      c.lerp(warm, smooth(0.35, 0.95, -nx * 0.5 + ny * 0.6) * 0.18);
      return c;
    }), 'aSway', (px, py) => smooth(y + h * 0.5, y + h * 2.2, py)));
  }
  return parts;
}
function pineTree(R, x, y, z, s, pal) {
  const parts = [];
  const h = 1.0 * s;
  parts.push(attr(paint(xf(new THREE.CylinderGeometry(0.08 * s, 0.16 * s, h * 1.2, 5), { x, y: y + h * 0.6, z }), col(pal.bark)), 'aSway', 0));
  const tiers = 3 + (R() < 0.5 ? 1 : 0);
  const leaf = col(pal.pine[Math.floor(R() * pal.pine.length)]);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = s * (0.95 - t * 0.6), th = s * (1.25 - t * 0.3);
    const g = new THREE.ConeGeometry(r, th, 7, 1);
    xf(g, { x, y: y + h * 0.8 + s * (t * 1.9) + th / 2, z, ry: R() * 3 });
    parts.push(attr(paint(g, (px, py, pz, nx, ny) => {
      const c = leaf.clone();
      c.lerp(col(pal.shade), smooth(0.4, -0.3, ny) * 0.6);
      c.lerp(col(pal.warm), smooth(0.2, 0.8, -nx) * 0.25 * (1 - t * 0.5));
      return c;
    }), 'aSway', (px, py) => smooth(y, y + s * 4.5, py)));
  }
  return parts;
}
function reedClump(R, x, y, z, s, n) {
  const parts = [];
  const green = [col('#557a36'), col('#668a3a'), col('#7f8a40'), col('#8f7e48'), col('#4a6e3a')];
  for (let i = 0; i < n; i++) {
    const h = s * (0.7 + R() * 0.9), w = 0.05 * s;
    const bx = x + (R() - 0.5) * 0.7 * s, bz = z + (R() - 0.5) * 0.5 * s;
    const ang = R() * Math.PI, bend = (R() - 0.5) * 0.6;
    const pos = [];
    const seg = 3;
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg, t1 = (k + 1) / seg;
      const w0 = w * (1 - t0 * 0.9), w1 = w * (1 - t1 * 0.9);
      const o0 = bend * t0 * t0 * h, o1 = bend * t1 * t1 * h;
      const a = [-w0 + o0, t0 * h], b = [w0 + o0, t0 * h], c = [w1 + o1, t1 * h], d = [-w1 + o1, t1 * h];
      pos.push(...a, 0, ...b, 0, ...c, 0, ...a, 0, ...c, 0, ...d, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nrm = []; for (let k = 0; k < pos.length / 3; k++) nrm.push(0.25, 0.95, 0.2);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    xf(g, { x: bx, y, z: bz, ry: ang });
    const c0 = green[Math.floor(R() * green.length)];
    parts.push(attr(paint(g, (px, py) => c0.clone().multiplyScalar(0.55 + 0.6 * smooth(y, y + h, py))), 'aSway', (px, py) => smooth(y, y + 1.6 * s, py)));
    if (R() < 0.22) {
      const tip = xf(new THREE.CapsuleGeometry(0.03 * s, 0.2 * s, 2, 6), { x: bx + bend * h, y: y + h + 0.1 * s, z: bz });
      parts.push(attr(paint(tip, col('#4a2c20')), 'aSway', smooth(y, y + 1.6 * s, y + h)));
    }
  }
  return parts;
}
function bush(R, x, y, z, s, pal) {
  const parts = [];
  const base = col(pal.leaf[Math.floor(R() * pal.leaf.length)]).multiplyScalar(0.9);
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const rr = s * (0.6 + R() * 0.5);
    xf(g, { x: x + (R() - 0.5) * s * 1.4, y: y + rr * 0.45, z: z + (R() - 0.5) * s * 0.7, sx: rr * 1.2, sy: rr * 0.8, sz: rr });
    parts.push(attr(paint(g, (px, py, pz, nx, ny) => base.clone().lerp(col(pal.shade), smooth(0.2, -0.8, ny) * 0.6).lerp(col(pal.warm), smooth(0.4, 1, ny) * 0.15)), 'aSway', (px, py) => smooth(y, y + s * 2.5, py) * 0.6));
  }
  return parts;
}

function tower(R, T) {
  const stone = [], glow = [];
  const y0 = H(T.x, T.z) - 0.2;
  const S = col(T.stone), D = col(T.dark), Tr = col(T.trim);
  const shade = (c) => (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.75 + 0.35 * Math.max(0, ny) + 0.12 * nx);
  const add = (g, c, o) => stone.push(paint(xf(g, Object.assign({ x: T.x, z: T.z }, o)), shade(c)));
  add(new THREE.CylinderGeometry(2.2, 2.6, 0.9, 8), D, { y: y0 + 0.45, ry: Math.PI / 8 });
  add(new THREE.CylinderGeometry(1.75, 2.0, 0.55, 8), S, { y: y0 + 1.15, ry: Math.PI / 8 });
  add(new THREE.CylinderGeometry(0.82, 1.12, 4.4, 8), S, { y: y0 + 3.6, ry: Math.PI / 8 });
  for (const yy of [2.2, 4.0, 5.4]) add(new THREE.CylinderGeometry(1.08 - yy * 0.035, 1.12 - yy * 0.035, 0.22, 8), D, { y: y0 + yy, ry: Math.PI / 8 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    add(new THREE.BoxGeometry(0.34, 2.4, 1.0), D, { x: T.x + Math.cos(a) * 1.15, y: y0 + 2.2, z: T.z + Math.sin(a) * 1.15, ry: -a, rz: 0 });
  }
  add(new THREE.CylinderGeometry(1.32, 0.9, 0.65, 8), D, { y: y0 + 6.1, ry: Math.PI / 8 });
  add(new THREE.CylinderGeometry(1.25, 1.32, 0.18, 8), Tr, { y: y0 + 6.5, ry: Math.PI / 8 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const px = Math.cos(a) * 0.95, pz = Math.sin(a) * 0.95;
    const g = new THREE.BoxGeometry(0.22, 1.8, 0.22);
    g.translate(0, 0.9, 0);
    xf(g, { rz: -0.32 });
    xf(g, { ry: -a });
    stone.push(paint(xf(g, { x: T.x + px, y: y0 + 6.5, z: T.z + pz }), shade(Tr)));
    const tip = new THREE.ConeGeometry(0.16, 0.45, 4);
    tip.translate(0, 1.95, 0); xf(tip, { rz: -0.32 }); xf(tip, { ry: -a });
    stone.push(paint(xf(tip, { x: T.x + px, y: y0 + 6.5, z: T.z + pz }), shade(Tr)));
  }
  // rune strips on the shaft (emissive)
  const gc = col(T.color).multiplyScalar(2.6);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8 + Math.PI / 8;
    const r = 0.98;
    const g = new THREE.BoxGeometry(0.07, 1.1, 0.05);
    xf(g, { ry: -a + Math.PI / 2 });
    glow.push(paint(xf(g, { x: T.x + Math.cos(a) * r, y: y0 + 3.1, z: T.z + Math.sin(a) * r }), gc));
  }
  const ring = new THREE.TorusGeometry(1.16, 0.035, 4, 24);
  glow.push(paint(xf(ring, { x: T.x, y: y0 + 4.65, z: T.z, rx: Math.PI / 2 }), gc));
  return { stone, glow, top: y0 + 7.75 };
}

function lantern(x, z, ry = 0) {
  const st = col('#a3978a'), dk = col('#73685f');
  const sh = (c) => (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.8 + 0.3 * Math.max(0, ny));
  const p = (g, c, o) => paint(xf(g, Object.assign({ x, z, ry }, o)), sh(c));
  const stone = [
    p(new THREE.CylinderGeometry(0.3, 0.38, 0.18, 6), dk, { y: 0.09 }),
    p(new THREE.CylinderGeometry(0.11, 0.14, 0.75, 6), st, { y: 0.55 }),
    p(new THREE.BoxGeometry(0.56, 0.08, 0.56), dk, { y: 0.95 }),
    p(new THREE.ConeGeometry(0.52, 0.34, 4), dk, { y: 1.5, ry: ry + Math.PI / 4 }),
    p(new THREE.SphereGeometry(0.07, 6, 4), st, { y: 1.72 }),
  ];
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) stone.push(p(new THREE.BoxGeometry(0.07, 0.36, 0.07), st, { x: x + dx * 0.17, z: z + dz * 0.17, y: 1.17 }));
  const glow = [paint(xf(new THREE.BoxGeometry(0.28, 0.28, 0.28), { x, y: 1.16, z, ry }), col('#ffb35a').multiplyScalar(3.2))];
  return { stone, glow, light: [x, 1.16, z] };
}

// ---------------------------------------------------------------------------
export default {
  id: 'river', name: 'Riverbank at Dusk', sub: 'Where the old towers watch the slow water', music: 'stage_river',
  palette: { accent: '#ff9a52', dark: '#2a1c33', light: '#ffd9a8' },
  build(ctx) {
    const kit = new Kit(ctx);
    const hi = kit.hi;
    const group = new THREE.Group();
    group.name = 'stage:river';
    const R = rng(1234);

    // --- sky ---------------------------------------------------------------
    const sunU = { value: SUN.clone(), type: 'vec3' };
    const sky = skyDome(kit, { fs: SKY_DOME_FS, uniforms: { uSun: sunU } });
    group.add(sky);

    // --- distant mountains (3 layers, valley around the sun) -----------------
    const ridgeLayers = [
      { z: -235, base: -25, hMin: 3, hMax: 30, c0: '#c47a86', c1: '#b26e88', fq: 0.018, seed: 1 },
      { z: -175, base: -25, hMin: -2, hMax: 19, c0: '#8e5a7e', c1: '#7c4e78', fq: 0.026, seed: 2 },
      { z: -118, base: -18, hMin: -4, hMax: 10, c0: '#5c3f62', c1: '#4c3458', fq: 0.04, seed: 3 },
    ];
    const ridges = merge(ridgeLayers.map((L) => {
      const dist = -L.z + 11.5;
      const xs = SUN.x / -SUN.z * dist;
      return ridgeGeo({
        z: L.z, x0: -dist * 1.25, x1: dist * 1.25, seg: 220, base: L.base, hMin: L.hMin, hMax: L.hMax, rows: 2,
        prof: (x) => {
          const r = 1 - Math.abs(noise3(x * L.fq, L.seed * 10, 0) * 2 - 1);
          const v = 0.55 * Math.pow(r, 1.6) + 0.35 * fbm3(x * L.fq * 2.5, L.seed, 3, 3) + 0.1 * noise3(x * L.fq * 8, L.seed, 5);
          return v * (0.35 + 0.65 * smooth(dist * 0.05, dist * 0.22, Math.abs(x - xs)));
        },
        colorAt: (t, x, h01) => col(L.c1).lerp(col(L.c0), t).lerp(col('#ffb48a'), t > 0.99 ? 0.08 * h01 : 0),
      });
    }));
    group.add(kit.mesh(ridges, kit.t(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { order: -90 }));

    // --- terrain -----------------------------------------------------------
    const res = hi ? 0.85 : 1.4;
    const tx0 = -78, tx1 = 78, tz0 = -92, tz1 = 14;
    const grassA = col('#3d5230'), grassB = col('#56602f'), mud = col('#3a2c28'), sand = col('#6a5444'), far = col('#4a4a3c');
    const terr = terrainGeo({
      x0: tx0, x1: tx1, z0: tz0, z1: tz1, nx: Math.round((tx1 - tx0) / res), nz: Math.round((tz1 - tz0) / res), h: H,
      colorAt: (x, y, z, ny) => {
        if (y < WY - 0.05) return mud.clone();
        const n = fbm3(x * 0.2, z * 0.2, 7, 3);
        const c = grassA.clone().lerp(grassB, smooth(0.35, 0.7, n));
        c.lerp(far, smooth(-20, -60, z) * 0.5);
        c.lerp(sand, smooth(WY + 0.45, WY + 0.05, y) * 0.85);
        c.multiplyScalar(0.75 + 0.3 * ny);
        return c;
      },
    });
    const terrain = kit.mesh(terr, kit.toon({ vertexColors: true }), { receive: true });
    group.add(terrain);

    // water depth map (0 shallow .. 1 deep) for shore foam / colour
    const DW = 512, DH = 64, dr = [-95, -24, 190, 21.6];
    const dd = new Uint8Array(DW * DH);
    for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
      const x = dr[0] + (i + 0.5) / DW * dr[2], z = dr[1] + (j + 0.5) / DH * dr[3];
      dd[j * DW + i] = Math.max(0, Math.min(255, (WY - H(x, z)) / 0.9 * 255));
    }
    const depthTex = kit.t(new THREE.DataTexture(dd, DW, DH, THREE.RedFormat, THREE.UnsignedByteType));
    depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter; depthTex.needsUpdate = true;

    // --- causeway ----------------------------------------------------------
    const { map, bump } = roadTextures(kit);
    const roadGeo = new THREE.PlaneGeometry(80, 6.6, 1, 1);
    roadGeo.rotateX(-Math.PI / 2); roadGeo.translate(0, 0, (-2.75 + 3.85) / 2);
    const roadMat = kit.std({ map, bumpMap: bump, bumpScale: 1.6, roughness: 0.88, color: 0xe6d4bc });
    group.add(kit.mesh(roadGeo, roadMat, { receive: true }));
    // foreground grass bank (flat, textured)
    const GS = hi ? 512 : 256, GR = rng(21);
    const grassMap = kit.tex(GS, GS, (x) => {
      x.fillStyle = '#4a6a2c'; x.fillRect(0, 0, GS, GS);
      blotches(x, GS, GS, GR, 46, GS * 0.06, GS * 0.2, ['#5a7a30', '#3c5a2a', '#6a7e34', '#4e6e2e'], 0.4);
      const cols = ['#5e8034', '#6c8a38', '#527430', '#7a9040', '#486a2e'];
      x.lineCap = 'round';
      for (let i = 0; i < (GS * GS) / 70; i++) {
        const px = GR() * GS, py = GR() * GS, len = GS * (0.01 + GR() * 0.02), a = -Math.PI / 2 + (GR() - 0.5) * 1.0;
        x.strokeStyle = cols[Math.floor(GR() * cols.length)]; x.globalAlpha = 0.25 + GR() * 0.4; x.lineWidth = GS * 0.005;
        wrapDraw(GS, GS, px, py, len, (cx, cy) => { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); x.stroke(); });
      }
      x.globalAlpha = 1;
      const fl = ['#ffd9a8', '#f2a2c4', '#d8c6ff', '#fff2d0'];
      for (let i = 0; i < 7; i++) {
        const px = GR() * GS, py = GR() * GS, c = fl[Math.floor(GR() * fl.length)];
        for (let k = 0; k < 6; k++) { x.fillStyle = c; x.globalAlpha = 0.85; x.beginPath(); x.arc(px + (GR() - 0.5) * GS * 0.05, py + (GR() - 0.5) * GS * 0.03, GS * 0.006, 0, 7); x.fill(); }
      }
      x.globalAlpha = 1;
      speckle(x, GS, GS, GR, 8);
    }, { aniso: kit.aniso, repeat: [64 / 2.5, 10.4 / 2.5] });
    const grassGeo = new THREE.PlaneGeometry(64, 10.4, 1, 1);
    grassGeo.rotateX(-Math.PI / 2); grassGeo.translate(0, 0, 3.85 + 5.2);
    group.add(kit.mesh(grassGeo, kit.std({ map: grassMap, roughness: 1, color: 0xe8e8e0 }), { receive: true }));

    // --- water -------------------------------------------------------------
    const waterGeo = new THREE.PlaneGeometry(190, 21.6, 1, 1);
    waterGeo.rotateX(-Math.PI / 2); waterGeo.translate(0, WY, -24 + 10.8);
    const towerU = TOWERS.map((T) => ({ value: new THREE.Vector3(T.x, 0, T.z), type: 'vec3' }));
    const towerC = TOWERS.map((T) => ({ value: col(T.color).multiplyScalar(1.4), type: 'vec3' }));
    const waterMat = kit.shader({
      uniforms: {
        uSun: sunU, uDepth: { value: depthTex, type: 'sampler2D' }, uRect: { value: new THREE.Vector4(...dr), type: 'vec4' },
        uTA: towerU[0], uTB: towerU[1], uCA: towerC[0], uCB: towerC[1],
      },
      vs: /* glsl */`varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; uniform sampler2D uDepth; uniform vec4 uRect; uniform vec3 uTA, uTB, uCA, uCB;
        varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        ${SKY_FN}
        float wh(vec2 p){
          float t = uTime;
          float h = vnoise(p * vec2(0.32, 0.95) + vec2(t * 0.22, 0.0)) + 0.55 * vnoise(p * vec2(0.9, 2.4) + vec2(t * 0.42, t * 0.06));
          #ifndef LOWQ
          h += 0.28 * vnoise(p * vec2(2.3, 5.0) + vec2(t * 0.75, -t * 0.1));
          #endif
          return h;
        }
        vec3 towerRefl(vec3 T, vec3 c, vec3 N){
          vec3 C = cameraPosition; float hy = 7.6;
          float t = (C.y - ${WY.toFixed(2)}) / (C.y - (2.0 * ${WY.toFixed(2)} - hy));
          vec2 Q = C.xz + (T.xz - C.xz) * t;
          vec2 dl = normalize(Q - C.xz); vec2 rel = vW.xz - Q;
          float along = dot(rel, dl), lat = dot(rel, vec2(-dl.y, dl.x)) + N.x * 1.4;
          float w = 0.35 + max(-along, 0.0) * 0.03;
          float s = exp(-lat * lat / (w * w)) * exp(along > 0.0 ? -along * 1.5 : along * 0.16);
          s *= 0.4 + 1.2 * smoothstep(0.35, 0.75, vnoise(vec2(along * 2.5 - uTime * 1.2, lat * 3.0)));
          return c * s;
        }
        void main(){
          vec2 p = vW.xz;
          float e = 0.06;
          float h0 = wh(p), hx = wh(p + vec2(e, 0.0)), hz = wh(p + vec2(0.0, e));
          vec3 N = normalize(vec3(-(hx - h0) / e * 0.07, 1.0, -(hz - h0) / e * 0.07));
          vec3 V = normalize(cameraPosition - vW);
          vec3 Rf = reflect(-V, N);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 refl = skyBase(normalize(vec3(Rf.x, max(Rf.y, 0.0) * 2.6 + 0.07, Rf.z)));
          // far-bank treeline / mountains reflect dark near the far shore
          float far = smoothstep(-12.0, -18.5, vW.z);
          refl = mix(refl, vec3(0.10, 0.07, 0.14), far * 0.75);
          float depth = texture2D(uDepth, (p - uRect.xy) / uRect.zw).r;
          vec3 deep = vec3(0.025, 0.035, 0.09), shallow = vec3(0.10, 0.14, 0.15);
          vec3 c = mix(shallow, deep, smoothstep(0.0, 0.6, depth));
          c = mix(c, refl, clamp(fres * 0.8 + 0.06, 0.0, 0.72));
          // posterize reflection a touch for the cel look
          float l = dot(c, vec3(0.3, 0.5, 0.2));
          c *= mix(1.0, floor(l * 9.0 + 0.5) / 9.0 / max(l, 1e-3), 0.1);
          // sun glitter column
          float hh = vnoise(p * vec2(3.0, 9.0) + vec2(uTime * 1.1, 0.0));
          vec3 N2 = normalize(N + vec3((hh - 0.5) * 0.25, 0.0, (vnoise(p * 7.0 - uTime) - 0.5) * 0.25));
          vec3 R2 = reflect(-V, N2);
          float sp = max(dot(R2, uSun), 0.0);
          float hsp = step(0.55, vnoise(p * vec2(2.0, 8.0) + vec2(uTime * 0.7, 0.0)));
          c += vec3(1.0, 0.55, 0.25) * (pow(sp, 300.0) * 1.6 * hsp + pow(sp, 40.0) * 0.02) * (1.0 - far);
          // twinkling sparkles
          vec2 cell = floor(p * vec2(4.0, 10.0));
          float hs = hash12(cell + floor(uTime * 3.0 + hash12(cell) * 3.0));
          float spk = step(0.994, hs) * (pow(sp, 24.0) + 0.02) * (1.0 - far);
          c += vec3(1.4, 0.9, 0.6) * spk * 2.5;
          c += towerRefl(uTA, uCA, N) + towerRefl(uTB, uCB, N);
          // shore foam / ripples
          float fo = 1.0 - smoothstep(0.0, 0.09, depth + (vnoise(p * 5.0 + uTime * 0.4) - 0.5) * 0.04);
          float rip = smoothstep(0.04, 0.0, abs(fract(depth * 10.0 - uTime * 0.25) - 0.5) - 0.42) * (1.0 - smoothstep(0.1, 0.3, depth));
          c = mix(c, vec3(0.62, 0.46, 0.48), clamp(fo * 0.6 + rip * 0.18, 0.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    group.add(kit.mesh(waterGeo, waterMat));

    // --- static solids (one merged toon mesh) ------------------------------
    const solids = [], glows = [], foliage = [];
    // causeway curb along the river edge
    for (let x = -14; x < 14;) {
      const w = R.range(0.9, 1.5);
      const top = R.range(0.04, 0.11);
      const g = new THREE.BoxGeometry(w - 0.06, 1.0 + top, 0.42);
      const c = col('#8a7c70').offsetHSL(0, 0, (R() - 0.5) * 0.08);
      solids.push(paint(xf(g, { x: x + w / 2, y: top - (1.0 + top) / 2 + 0.0, z: -2.92, ry: (R() - 0.5) * 0.04 }), (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.75 + 0.3 * Math.max(0, ny) + (ny > 0.5 ? 0.08 : 0))));
      x += w;
    }
    // boulders at the walls + shore rocks
    const rockC = (base, moss) => (px, py, pz, nx, ny) => {
      const c = col(base).clone();
      c.offsetHSL(0, 0, (noise3(px * 2, py * 2, pz * 2) - 0.5) * 0.08);
      if (ny > 0.55 + noise3(px * 3, pz * 3, 1) * 0.3) c.lerp(col(moss), 0.8);
      return c;
    };
    const boulder = (x, z, s, sy = 0.8, ry = 0) => {
      const g = rockGeo(R, { detail: 1, jag: 0.22, flat: 0.45, sx: s * 1.2, sy: s * sy, sz: s });
      xf(g, { x, y: H(x, z) + s * sy * 0.35, z, ry });
      solids.push(paint(g, rockC(R() < 0.5 ? '#7a6e68' : '#6c6670', '#5b7034')));
    };
    for (const sx of [-1, 1]) {
      boulder(sx * 9.75, -1.05, 1.0, 1.05, R() * 3);
      boulder(sx * 9.05, -2.45, 0.7, 0.95, R() * 3);
      boulder(sx * 10.6, -0.2, 0.75, 0.8, R() * 3);
      boulder(sx * 10.9, -2.6, 1.5, 0.95, R() * 3);
      boulder(sx * 9.45, 0.45, 0.36, 0.6, R() * 3);
      boulder(sx * 8.95, -0.95, 0.42, 0.75, R() * 3);
      boulder(sx * 13.0, -4.2, 1.1, 0.8, R() * 3);
      boulder(sx * 14.5, 1.5, 0.9, 0.7, R() * 3);
    }
    for (let i = 0; i < (hi ? 26 : 14); i++) { // shore stones along both banks
      const x = R.range(-40, 40);
      const far = R() < 0.6;
      const z = far ? farBank(x) + R.range(-0.4, 0.6) : nearBank(x) - R.range(0.1, 0.5);
      if (!far && Math.abs(x) < 10) continue;
      boulder(x, z, R.range(0.25, 0.7), 0.6, R() * 3);
    }
    // lanterns
    const lightPts = [];
    for (const [x, z] of [[-8.75, -1.75], [8.75, -1.75], [-17, -2.2], [17.5, -2.3]]) {
      const L = lantern(x, z, R() * 0.3);
      solids.push(...L.stone); glows.push(...L.glow); lightPts.push(L.light);
    }
    // towers
    const towerTops = [];
    for (const T of TOWERS) {
      const t = tower(R, T);
      solids.push(...t.stone); glows.push(...t.glow);
      towerTops.push([T.x, t.top, T.z, T]);
    }
    // little far-bank dock with lamps
    for (let i = 0; i < 6; i++) {
      const x = -3.5 + i * 0.9, z = farBank(-1) + 0.3;
      solids.push(paint(xf(new THREE.BoxGeometry(0.85, 0.08, 1.4), { x, y: WY + 0.28, z }), col('#5a4232').offsetHSL(0, 0, (R() - 0.5) * 0.05)));
    }
    for (const x of [-3.9, 1.5]) {
      const z = farBank(-1) + 0.9;
      solids.push(paint(xf(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 5), { x, y: WY + 0.5, z }), col('#4a3428')));
      glows.push(paint(xf(new THREE.SphereGeometry(0.11, 8, 6), { x, y: WY + 1.4, z }), col('#ffb35a').multiplyScalar(3)));
      lightPts.push([x, WY + 1.4, z, 0.9]);
    }

    // --- trees, reeds, grass (sway mesh) -----------------------------------
    const pal = {
      bark: '#4a3328', leaf: ['#3f6244', '#48683c', '#577038', '#365a4a'], pine: ['#2a5048', '#305640', '#2f4a4e'],
      shade: '#1a2036', warm: '#b8834e',
    };
    const nTrees = hi ? 95 : 55;
    let placed = 0, guard = 0;
    while (placed < nTrees && guard++ < 2000) {
      const side = R();
      let x, z;
      if (side < 0.82) { x = R.range(-70, 70); z = farBank(x) - R.range(1.2, 30); }
      else { x = R.sign() * R.range(11.5, 30); z = R.range(nearBank(x) + 0.8, -3.6); if (z > nearBank(x) + 6) continue; }
      if (z > -3.2) continue;
      const ax = Math.abs(x);
      // keep a clearing behind the fight (lower trees) and around the towers
      if (z > -26 && ax < 7 && R() < 0.75) continue;
      if (TOWERS.some((T) => Math.hypot(x - T.x, z - T.z) < 4.2)) continue;
      // keep sight lines from the camera to the towers clear
      if (TOWERS.some((T) => z > T.z && Math.abs(x - T.x * (11.5 - z) / (11.5 - T.z)) < 3.4)) continue;
      const y = H(x, z);
      if (y < WY + 0.1) continue;
      const centre = smooth(4, 16, ax);
      const s = (0.85 + R() * 0.6) * (0.75 + 0.45 * centre) * (z > -6 ? 1.25 : 1);
      foliage.push(...(R() < 0.55 ? roundTree(R, x, y, z, s * 1.05, pal) : pineTree(R, x, y, z, s * 1.15, pal)));
      placed++;
    }
    // reeds along shores
    const nReeds = hi ? 70 : 36;
    for (let i = 0; i < nReeds; i++) {
      const far = R() < 0.55;
      const x = far ? R.range(-45, 45) : R.sign() * R.range(7.5, 40);
      const z = far ? farBank(x) + R.range(0.2, 0.9) : (Math.abs(x) < 10.5 ? -3.25 - R() * 0.4 : nearBank(x) - R.range(0.0, 0.6));
      if (!far && Math.abs(x) < 6.5) continue;
      const y = Math.max(H(x, z), WY - 0.1);
      foliage.push(...reedClump(R, x, y, z, R.range(0.9, 1.35), hi ? 12 : 7));
    }
    // shrubs along the far shore and near-bank sides
    for (let i = 0; i < (hi ? 60 : 30); i++) {
      const x = R.range(-50, 50);
      const z = farBank(x) - R.range(0.6, 6);
      if (TOWERS.some((T) => Math.hypot(x - T.x, z - T.z) < 3)) continue;
      foliage.push(...bush(R, x, H(x, z), z, R.range(0.5, 0.95), pal));
    }
    for (let i = 0; i < (hi ? 16 : 8); i++) {
      const x = R.sign() * R.range(11, 26), z = R.range(nearBank(x) + 0.5, -3.4);
      if (H(x, z) < WY + 0.1) continue;
      foliage.push(...bush(R, x, H(x, z), z, R.range(0.6, 1.1), pal));
    }
    // short grass tufts on the foreground bank (kept < 0.25 m), normals up so they light like the ground
    const nTufts = hi ? 420 : 160;
    const gcols = [col('#5e8032'), col('#6e8c36'), col('#86983e'), col('#527636')];
    for (let i = 0; i < nTufts; i++) {
      const x = R.range(-24, 24), z = R() < 0.88 ? R.range(4.0, 10) : R.range(3.75, 4.0);
      const n = 7, c0 = gcols[Math.floor(R() * gcols.length)], s0 = R.range(0.7, 1.15);
      for (let k = 0; k < n; k++) {
        const h = R.range(0.07, 0.19) * s0, w = 0.026, a = (k / n) * Math.PI + R() * 0.4, lx = (k / (n - 1) - 0.5) * 0.12;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, lx, h, (R() - 0.5) * 0.05], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
        xf(g, { x: x + (R() - 0.5) * 0.12, y: 0.002, z: z + (R() - 0.5) * 0.1, ry: a });
        foliage.push(attr(paint(g, (px, py) => c0.clone().multiplyScalar(0.55 + 3.2 * py)), 'aSway', (px, py) => py * 2.6));
      }
    }

    const solidMesh = kit.mesh(merge(solids), kit.toon({ vertexColors: true }), { cast: true, receive: true });
    group.add(solidMesh);
    const folMat = swayMaterial(kit.toon({ vertexColors: true, side: THREE.DoubleSide }), kit, 0.1, 1.3);
    const folMesh = kit.mesh(merge(foliage), folMat, { cast: true });
    group.add(folMesh);
    const glowMesh = kit.mesh(merge(glows), kit.t(new THREE.MeshBasicMaterial({ vertexColors: true })));
    group.add(glowMesh);

    // --- tower crystals (animated) -----------------------------------------
    const crystals = towerTops.map(([x, y, z, T]) => {
      const g = new THREE.OctahedronGeometry(0.55, 0);
      g.scale(1, 1.7, 1); g.computeVertexNormals();
      const m = kit.mesh(g, kit.toon({ color: col(T.color).lerp(col('#ffffff'), 0.4), emissive: col(T.color), emissiveIntensity: 2.0 }));
      m.position.set(x, y, z);
      const ringG = new THREE.TorusGeometry(0.95, 0.03, 4, 40);
      const ring = kit.mesh(ringG, kit.glow(T.color, 3.0));
      ring.position.set(x, y, z);
      group.add(m, ring);
      return { m, ring, y };
    });

    // --- glows: lanterns, tower crystals, dock lamps --------------------------
    const glist = [];
    for (const L of lightPts) {
      const big = L[3] == null;
      glist.push({ p: [L[0], L[1], L[2] + 0.05], size: big ? 1.3 : 0.9, color: '#ff9a40', k: big ? 1.1 : 1.0, flicker: 1 });
      if (big) glist.push({ p: [L[0], 0.06, L[2] + 0.4], size: 2.6, color: '#ff8a3a', k: 0.22, flicker: 0.6 });
    }
    for (const [x, y, z, T] of towerTops) {
      glist.push({ p: [x, y, z], size: 2.6, color: T.color, k: 1.1, flicker: 0.15 });
      glist.push({ p: [x, y, z], size: 7, color: T.color, k: 0.16, flicker: 0.05 });
    }
    group.add(glowPoints(kit, glist));
    // faint light beams rising from the tower crystals
    const beamGeo = merge(towerTops.map(([x, y, z, T]) => paint(xf(new THREE.CylinderGeometry(0.25, 0.55, 14, 12, 1, true), { x, y: y + 7.2, z }), col(T.color))));
    const beamMat = kit.shader({
      vs: /* glsl */`attribute vec3 color; varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV;
        #include <fog_pars_vertex>
        void main(){ vC = color; vY = uv.y; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mvPosition.xyz); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV;
        #include <fog_pars_fragment>
        void main(){ ${FOG_FRAG_ADD} float edge = pow(abs(dot(vN, vV)), 2.0); float a = edge * (1.0 - vY) * (1.0 - vY) * 0.45 * (0.8 + 0.2 * sin(uTime * 2.0 + vY * 12.0));
          a *= 1.0 - fogF; gl_FragColor = vec4(vC * a * 1.6, 0.0); }`,
      side: THREE.DoubleSide,
    });
    kit.additive(beamMat);
    group.add(kit.mesh(beamGeo, beamMat, { order: 13 }));

    // --- fireflies -----------------------------------------------------------
    group.add(gpuParticles(kit, {
      count: hi ? 150 : 60, shape: 'dot', seed: 5, order: 16,
      body: /* glsl */`
        void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
          vec3 b = vec3(mix(-26.0, 26.0, aR.x), mix(0.2, 2.8, aR.y * aR.y), mix(-17.0, -1.7, aR.z));
          float t = uTime * (0.18 + aR.w * 0.25);
          P = b + vec3(sin(t + aR2.x * 6.28) * 1.3, sin(t * 1.7 + aR2.y * 6.28) * 0.3, cos(t * 0.8 + aR2.z * 6.28) * 0.9);
          float bl = pow(0.5 + 0.5 * sin(uTime * (0.7 + aR2.w * 1.3) + aR2.x * 40.0), 4.0);
          S = 0.11;
          C = vec4(mix(vec3(1.0, 0.85, 0.35), vec3(0.75, 1.0, 0.45), aR2.y) * 3.2, bl);
        }`,
    }));
    // drifting warm dust/pollen catching the light
    group.add(gpuParticles(kit, {
      count: hi ? 90 : 40, shape: 'soft', seed: 9, order: 15,
      body: /* glsl */`
        void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
          float t = uTime * (0.08 + aR.w * 0.08) + aR.x;
          P = vec3(mix(-30.0, 30.0, fract(aR.x + t * 0.05)), mix(0.6, 4.5, aR.y) + sin(t * 3.0 + aR2.x * 6.0) * 0.3, mix(-12.0, -2.0, aR.z));
          S = 0.035; C = vec4(vec3(1.0, 0.75, 0.5) * 1.2, 0.5 * (0.5 + 0.5 * sin(uTime * 1.3 + aR2.y * 20.0)));
        }`,
    }));

    const crystalsU = crystals;
    return {
      group,
      lighting: {
        hemiSky: 0xa898c8, hemiGround: 0x4e3a30, hemiIntensity: 0.95,
        key: { color: 0xffc890, intensity: 2.35, dir: [3.5, 4.8, 7] },
        rim: { color: 0x8a7cff, intensity: 1.5, dir: [5, 3, -6] },
        rim2: { color: 0xff8a50, intensity: 1.4, dir: [-4, 1.6, -8] },
      },
      fog: { color: 0x4c3352, near: 30, far: 190 },
      background: new THREE.Color(0x2a1c33),
      exposure: 1.0,
      bloom: { strength: 0.8, radius: 0.55, threshold: 0.82 },
      update(dt, time, camera) {
        kit.time.value = time;
        if (camera) sky.position.copy(camera.position);
        for (let i = 0; i < crystalsU.length; i++) {
          const c = crystalsU[i];
          c.m.position.y = c.y + Math.sin(time * 1.3 + i * 2) * 0.12;
          c.m.rotation.y = time * 0.6 * (i ? -1 : 1);
          c.ring.position.y = c.m.position.y;
          c.ring.rotation.set(Math.PI / 2 + Math.sin(time * 0.7 + i) * 0.35, time * 0.9, Math.cos(time * 0.5 + i) * 0.3);
        }
      },
      dispose() { kit.dispose(group); },
    };
  },
};
