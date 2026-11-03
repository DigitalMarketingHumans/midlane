// The Molten Forge — a colossal underground forge cavern: riveted iron floor with
// glowing cracks, a crusted lava lake, lava falls, giant anvils with a striking
// hammer, rotating gears, swaying chains, and a crucible that pours molten metal
// every 12 seconds.
import * as THREE from 'three';
import {
  Kit, rng, xf, paint, merge, rockGeo, fbm3, smooth, lerp, col, wrapDraw, speckle, blotches, blurCanvas,
  GLSL_NOISE, FOG_FRAG_ADD, gpuParticles, glowPoints, skyDome, inject,
} from './common.js';

const LAVA_Y = -1.3;
const wallZ = (x) => -47 + 0.0065 * x * x;
const POUR_PERIOD = 12;
const CRUCIBLE = { x: 7.4, z: -17, y: 5.6 };
const HAMMER = { x: -10.5, z: -20, period: 3.4, y: 0.5 };
const GEARS = [
  { x: -16, y: 8.5, r: 6, teeth: 22, w: 0.07, d: 1.0 },
  { x: -7.6, y: 12.6, r: 3.6, teeth: 13, w: -0.07 * 6 / 3.6, d: 0.8 },
  { x: 21, y: 9.5, r: 7, teeth: 26, w: -0.05, d: 1.1 },
  { x: 12.4, y: 6.3, r: 2.8, teeth: 10, w: 0.05 * 7 / 2.8, d: 0.7 },
  { x: 2, y: 15, r: 8, teeth: 30, w: 0.03, d: 1.2, dz: -4 },
];
const FALLS = [{ x: -27, w: 2.4 }, { x: -11.5, w: 1.6 }, { x: 15.5, w: 2.0 }, { x: 31, w: 2.8 }];
const CHAINS = [[-6.8, -7.5, 4.7], [-1.5, -12, 6.2], [3.6, -9, 5.0], [14.5, -11, 4.4], [-15.5, -10, 4.9], [-19, -22, 6.5], [24, -20, 6]];

const SKY_FS = /* glsl */`
vec3 sky(vec3 d){
  float e = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  vec3 c = mix(vec3(0.09, 0.025, 0.015), vec3(0.008, 0.004, 0.006), smoothstep(-0.05, 0.4, e));
  float sm = fbm(vec2(az * 3.0 + uTime * 0.01, e * 6.0 - uTime * 0.02));
  c += vec3(0.12, 0.035, 0.01) * smoothstep(0.4, 0.8, sm) * (1.0 - smoothstep(0.0, 0.5, e));
  return c;
}
`;

function floorTextures(kit) {
  const S = kit.hi ? 1024 : 512, R = rng(91);
  const pw = S / 2, ph = S / 4;
  const plates = [];
  for (let r = 0; r < 4; r++) {
    const off = (r % 2) * pw * 0.5;
    for (let c = 0; c < 3; c++) plates.push({ x: off + c * pw, y: r * ph, w: pw, h: ph, tone: R(), heat: R(), crack: R() < 0.45, seed: R() });
  }
  const g = S / 256;
  const map = kit.tex(S, S, (x) => {
    x.fillStyle = '#141011'; x.fillRect(0, 0, S, S);
    for (const p of plates) {
      wrapDraw(S, S, p.x + p.w / 2, p.y + p.h / 2, p.w, (cx, cy) => {
        const ox = cx - p.w / 2 + g * 1.5, oy = cy - p.h / 2 + g * 1.5, w = p.w - g * 3, h = p.h - g * 3;
        const R3 = rng(Math.floor(p.seed * 1e6));
        const l = 17 + p.tone * 8;
        x.fillStyle = `hsl(${10 + p.tone * 14}, ${8 + p.tone * 6}%, ${l}%)`; x.fillRect(ox, oy, w, h);
        x.save(); x.beginPath(); x.rect(ox, oy, w, h); x.clip();
        // heat discolouration
        const hx = ox + R3() * w, hy = oy + R3() * h, hr = w * (0.3 + R3() * 0.4);
        const hg = x.createRadialGradient(hx, hy, 0, hx, hy, hr);
        hg.addColorStop(0, p.heat > 0.5 ? 'rgba(120,60,140,0.22)' : 'rgba(170,80,30,0.2)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = hg; x.fillRect(ox, oy, w, h);
        // scratches
        x.strokeStyle = 'rgba(200,180,170,0.08)'; x.lineWidth = g * 0.6;
        for (let k = 0; k < 14; k++) { const sx = ox + R3() * w, sy = oy + R3() * h, a = R3() * 0.6 - 0.3, L = w * (0.05 + R3() * 0.2); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke(); }
        // grime at edges
        const eg = x.createLinearGradient(ox, oy, ox, oy + h);
        eg.addColorStop(0, 'rgba(0,0,0,0.25)'); eg.addColorStop(0.15, 'rgba(0,0,0,0)'); eg.addColorStop(0.85, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.3)');
        x.fillStyle = eg; x.fillRect(ox, oy, w, h);
        x.restore();
        // bevel
        x.strokeStyle = 'rgba(220,190,170,0.16)'; x.lineWidth = g * 1.4;
        x.beginPath(); x.moveTo(ox, oy + h); x.lineTo(ox, oy); x.lineTo(ox + w, oy); x.stroke();
        x.strokeStyle = 'rgba(0,0,0,0.45)';
        x.beginPath(); x.moveTo(ox + w, oy); x.lineTo(ox + w, oy + h); x.lineTo(ox, oy + h); x.stroke();
        // rivets
        const n = 8;
        for (let k = 0; k <= n; k++) for (const yy of [oy + g * 5, oy + h - g * 5]) {
          const rx = ox + g * 5 + (w - g * 10) * k / n;
          x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.arc(rx + g * 0.6, yy + g * 0.6, g * 2.1, 0, 7); x.fill();
          x.fillStyle = '#4a4240'; x.beginPath(); x.arc(rx, yy, g * 1.9, 0, 7); x.fill();
          x.fillStyle = 'rgba(255,220,200,0.25)'; x.beginPath(); x.arc(rx - g * 0.6, yy - g * 0.6, g * 0.8, 0, 7); x.fill();
        }
      });
    }
    blotches(x, S, S, R, 30, S * 0.05, S * 0.15, ['#000000', '#3a2018'], 0.18);
    speckle(x, S, S, R, 12);
  }, { aniso: kit.aniso, repeat: [80 / 4, 17.4 / 4] });
  const cracks = (x, glow) => {
    for (const p of plates) {
      if (!p.crack) continue;
      const R3 = rng(Math.floor(p.seed * 1e6) + 7);
      wrapDraw(S, S, p.x + p.w / 2, p.y + p.h / 2, p.w, (cx, cy) => {
        const ox = cx - p.w / 2, oy = cy - p.h / 2;
        let px = ox + p.w * (0.2 + R3() * 0.6), py = oy + g * 3;
        const pts = [[px, py]];
        for (let k = 0; k < 9; k++) { px += (R3() - 0.5) * p.w * 0.14; py += p.h / 9; pts.push([px, py]); }
        const branches = [pts];
        for (let b = 0; b < 3; b++) {
          const st = pts[1 + Math.floor(R3() * 6)];
          let bx = st[0], by = st[1];
          const bp = [[bx, by]]; const dir = R3() < 0.5 ? -1 : 1;
          for (let k = 0; k < 4; k++) { bx += dir * p.w * (0.03 + R3() * 0.05); by += (R3() - 0.3) * p.h * 0.1; bp.push([bx, by]); }
          branches.push(bp);
        }
        for (const [i, br] of branches.entries()) {
          x.beginPath(); x.moveTo(br[0][0], br[0][1]); for (const q of br) x.lineTo(q[0], q[1]);
          if (glow) {
            x.strokeStyle = 'rgba(255,80,10,0.35)'; x.lineWidth = g * (i ? 3 : 5); x.stroke();
            x.strokeStyle = 'rgba(255,170,60,1)'; x.lineWidth = g * (i ? 0.9 : 1.5); x.stroke();
          } else { x.strokeStyle = 'rgba(0,0,0,0.85)'; x.lineWidth = g * (i ? 1.6 : 2.4); x.stroke(); }
        }
      });
    }
  };
  // crack shadow lines into the albedo
  const ctx2 = map.image.getContext('2d');
  cracks(ctx2, false);
  map.needsUpdate = true;
  const emissive = kit.tex(S, S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    cracks(x, true);
    blurCanvas(x, S, S, g * 0.6);
    cracks(x, true);
  }, { aniso: kit.aniso, repeat: [80 / 4, 17.4 / 4] });
  const bump = kit.tex(S, S, (x) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
    for (const p of plates) wrapDraw(S, S, p.x + p.w / 2, p.y + p.h / 2, p.w, (cx, cy) => {
      x.fillStyle = '#b0b0b0'; x.fillRect(cx - p.w / 2 + g * 2, cy - p.h / 2 + g * 2, p.w - g * 4, p.h - g * 4);
      const n = 8;
      for (let k = 0; k <= n; k++) for (const yy of [cy - p.h / 2 + g * 6.5, cy + p.h / 2 - g * 6.5]) {
        x.fillStyle = '#fff'; x.beginPath(); x.arc(cx - p.w / 2 + g * 6.5 + (p.w - g * 13) * k / n, yy, g * 1.9, 0, 7); x.fill();
      }
    });
    blurCanvas(x, S, S, g * 0.8);
    speckle(x, S, S, R, 20);
  }, { srgb: false, aniso: kit.aniso, repeat: [80 / 4, 17.4 / 4] });
  return { map, emissive, bump };
}

function basaltColumns(R, cx, cz, rad, n, hMin, hMax, base = LAVA_Y - 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const r = R.range(0.45, 0.8);
    const h = lerp(hMax, hMin, d / rad) * R.range(0.8, 1.1) - base;
    const g = new THREE.CylinderGeometry(r * 0.96, r, h, 6, 1);
    xf(g, { x, y: base + h / 2, z, ry: R() * 1 });
    const tone = R.range(0.85, 1.15);
    out.push(paint(g, (px, py, pz, nx, ny) => {
      const c = col('#1e1b1d').multiplyScalar(tone);
      if (ny > 0.9) c.set('#4e4644').multiplyScalar(tone);
      c.lerp(col('#ff5a1a'), smooth(LAVA_Y + 0.5, LAVA_Y, py) * 0.35);
      return c;
    }));
  }
  return out;
}

function anvil(x, y, z, s, ry = 0) {
  const iron = col('#3a3436'), top = col('#6a6260');
  const sh = (c) => (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.8 + 0.35 * Math.max(0, ny));
  const p = (g, c, o) => paint(xf(g, Object.assign({}, o)), sh(c));
  const parts = [
    p(new THREE.BoxGeometry(1.5, 0.35, 1.0), iron, { y: 0.175 }),
    p(new THREE.BoxGeometry(1.1, 0.2, 0.75), iron, { y: 0.45 }),
    p(new THREE.BoxGeometry(0.55, 0.55, 0.5), iron, { y: 0.82 }),
    p(new THREE.BoxGeometry(1.7, 0.42, 0.75), top, { y: 1.3 }),
    p(new THREE.BoxGeometry(0.5, 0.2, 0.75), iron, { y: 1.0, x: 0.55 }),
  ];
  const horn = new THREE.ConeGeometry(0.33, 1.1, 8);
  horn.rotateZ(Math.PI / 2); horn.scale(1, 1, 0.9);
  parts.push(p(horn, top, { x: -1.4, y: 1.33 }));
  const g = merge(parts);
  xf(g, { s, ry });
  xf(g, { x, y, z });
  return g;
}

function gearGeo(r, teeth, depth) {
  const sh = new THREE.Shape();
  const ri = r * 0.86, steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const ph = i % 4;
    const rr = ph === 1 || ph === 2 ? r : ri;
    const aa = a + (ph === 1 ? 0.12 : ph === 2 ? -0.12 : 0) * (Math.PI * 2 / teeth);
    if (i === 0) sh.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); else sh.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
  }
  const spokes = teeth > 14 ? 6 : 4;
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + 0.22, a1 = ((k + 1) / spokes) * Math.PI * 2 - 0.22;
    const h = new THREE.Path();
    const r0 = r * 0.28, r1 = r * 0.7;
    h.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    h.absarc(0, 0, r1, a0, a1, false);
    h.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
    h.absarc(0, 0, r0, a1, a0, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: r * 0.02, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, depth * 1.6, 12);
  hub.rotateX(Math.PI / 2);
  return merge([paint(g, (px, py, pz, nx, ny, nz) => col('#585050').multiplyScalar(0.7 + 0.35 * Math.abs(nz)).lerp(col('#c86a30'), smooth(r * 0.8, r, Math.hypot(px, py)) * 0.4 * smooth(0.2, -0.6, ny))), paint(hub, col('#7a6a60'))]);
}

function chainGeo(len, R) {
  const parts = [];
  const n = Math.ceil(len / 0.42);
  for (let i = 0; i < n; i++) {
    const t = new THREE.TorusGeometry(0.17, 0.05, 5, 10);
    t.scale(1, 1.45, 1);
    xf(t, { y: -i * 0.42 - 0.2, ry: i % 2 ? Math.PI / 2 : 0 });
    parts.push(paint(t, col('#4a4042')));
  }
  const hook = new THREE.TorusGeometry(0.42, 0.11, 6, 14, Math.PI * 1.4);
  xf(hook, { y: -n * 0.42 - 0.5, rz: Math.PI * 0.8 });
  parts.push(paint(hook, col('#5a4e4a')));
  if (R() < 0.5) parts.push(paint(xf(new THREE.BoxGeometry(0.7, 0.9, 0.7), { y: -n * 0.42 - 0.75 }), col('#3a3234')));
  return merge(parts);
}

export default {
  id: 'forge', name: 'The Molten Forge', sub: 'Steel is born where the mountain bleeds', music: 'stage_forge',
  palette: { accent: '#ff6a1a', dark: '#1a0807', light: '#ffc58a' },
  build(ctx) {
    const kit = new Kit(ctx);
    const hi = kit.hi;
    const group = new THREE.Group();
    group.name = 'stage:forge';
    const R = rng(4242);

    const sky = skyDome(kit, { fs: SKY_FS });
    group.add(sky);

    // --- floor ---------------------------------------------------------------
    const { map, emissive, bump } = floorTextures(kit);
    const floorGeo = new THREE.PlaneGeometry(80, 17.4);
    floorGeo.rotateX(-Math.PI / 2); floorGeo.translate(0, 0, -3.4 + 8.7);
    const floorMat = kit.std({ map, bumpMap: bump, bumpScale: 1.5, emissiveMap: emissive, emissive: 0xff6a1c, emissiveIntensity: 1.7, roughness: 0.62, metalness: 0.15, color: 0xffffff });
    inject(floorMat, kit, {
      worldPos: true,
      emissive: /* glsl */`{
        float m = smoothstep(0.42, 0.62, vnoise(vWPos.xz * 0.21 + 3.0));
        m = max(m, smoothstep(-1.2, -3.3, vWPos.z));
        m *= 1.0 - 0.8 * smoothstep(-1.5, 1.5, vWPos.z) * (1.0 - smoothstep(7.0, 10.0, abs(vWPos.x)) * 0.0 - 0.0);
        m *= 1.0 - 0.6 * smoothstep(-1.5, 1.5, vWPos.z) * (1.0 - smoothstep(6.0, 10.0, abs(vWPos.x)));
        float pulse = 0.55 + 0.45 * sin(uTime * 1.4 + vWPos.x * 0.6 + vnoise(vWPos.xz * 0.4) * 6.0);
        totalEmissiveRadiance *= m * pulse;
      }`,
    });
    group.add(kit.mesh(floorGeo, floorMat, { receive: true }));

    // --- lava lake ---------------------------------------------------------------
    const lavaGeo = new THREE.PlaneGeometry(180, 70, 1, 1);
    lavaGeo.rotateX(-Math.PI / 2); lavaGeo.translate(0, LAVA_Y, -3.5 - 35);
    const pourU = { value: 0 };
    const LAVA_FN = /* glsl */`
      float lavaN(vec2 p){
        vec2 q = p * 0.32;
        vec2 w = vec2(fbm3x(q + vec2(0.0, uTime * 0.05)), fbm3x(q + vec2(5.2, 1.3) - uTime * 0.04));
        #ifdef LOWQ
        return fbm3x(q * 1.4 + w * 1.7 + vec2(uTime * 0.06, 0.0)) * 0.94;
        #else
        return fbm(q * 1.4 + w * 1.7 + vec2(uTime * 0.06, 0.0));
        #endif
      }`;
    const lavaMat = kit.shader({
      uniforms: { uPour: pourU },
      vs: /* glsl */`varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; uniform float uPour; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        ${LAVA_FN}
        void main(){
          vec2 p = vW.xz; p.x += uTime * 0.18;
          float n = lavaN(p);
          float crust = smoothstep(0.41, 0.46, n);
          float vein = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.435));
          float heat = smoothstep(0.42, 0.25, n);
          vec3 hot = mix(vec3(0.85, 0.15, 0.01), vec3(2.2, 0.85, 0.16), floor(heat * 3.0 + 0.5) / 3.0);
          vec3 cr = mix(vec3(0.035, 0.013, 0.012), vec3(0.09, 0.03, 0.018), vnoise(p * 2.5));
          cr += vec3(0.25, 0.05, 0.0) * smoothstep(0.5, 0.42, n);
          vec3 c = mix(hot, cr, crust) + vec3(1.4, 0.4, 0.05) * vein * 0.45;
          // hotter under the falls and near the crucible pour
          float nearFall = 0.0;
          ${FALLS.map((f) => `nearFall += exp(-pow((vW.x - (${f.x.toFixed(1)})) / 3.5, 2.0)) * smoothstep(-30.0, -42.0, vW.z);`).join('\n')}
          float pour = uPour * exp(-length(vW.xz - vec2(${CRUCIBLE.x.toFixed(1)}, ${CRUCIBLE.z.toFixed(1)})) / 2.5);
          c += vec3(2.0, 0.8, 0.15) * (nearFall * 0.35 + pour * 1.2) * (1.0 - crust * 0.6);
          // dim close to the platform so fighters read against it
          c *= mix(0.45, 1.0, smoothstep(-4.0, -12.0, vW.z));
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    group.add(kit.mesh(lavaGeo, lavaMat));

    // --- solids: platform lip, islands, back wall, anvils, boundary braziers --------
    const solids = [];
    const glows = [];
    // platform lip with bolts
    solids.push(paint(xf(new THREE.BoxGeometry(80, 1.5, 0.35), { y: -0.72, z: -3.55 }), (px, py, pz, nx, ny) => col('#2e2829').multiplyScalar(ny > 0.5 ? 1.5 : 0.8).lerp(col('#ff5a1a'), smooth(-0.6, -1.4, py) * 0.4)));
    for (let x = -30; x <= 30; x += 1.2) solids.push(paint(xf(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 6), { x, y: 0.035, z: -3.5 }), col('#5a4e4a')));
    // islands of basalt columns in the lake
    const islands = [
      [-10.5, -20, 3.2, 26, 0.0, 0.5], [19, -26, 3.6, 28, 0.6, 1.6], [11.6, -17, 1.4, 9, 0.3, 1.0],
      [-24, -26, 4, 22, 0.2, 2.6], [30, -14, 3, 16, 0.4, 2.4], [-30, -12, 3, 14, 0.2, 1.8], [-3, -33, 3, 14, 0, 1.2], [12, -10.5, 1.4, 6, -0.4, 0.2],
    ];
    for (const [x, z, rad, n, h0, h1] of islands) solids.push(...basaltColumns(R, x, z, rad, hi ? n : Math.ceil(n * 0.6), h0, h1));
    // back wall of basalt columns, curving forward at the ends
    for (let x = -72; x <= 72; x += hi ? 1.25 : 1.9) {
      const z = wallZ(x) - R.range(0, 2.5);
      const h = 10 + 22 * fbm3(x * 0.05, 3, 1) + R.range(0, 4) + smooth(20, 60, Math.abs(x)) * 10;
      const r = R.range(0.9, 1.5);
      const g = new THREE.CylinderGeometry(r, r * 1.05, h - LAVA_Y + 2, 6);
      xf(g, { x, y: LAVA_Y - 2 + (h - LAVA_Y + 2) / 2, z, ry: R() });
      solids.push(paint(g, (px, py) => col('#1a1618').lerp(col('#5a2210'), smooth(4, LAVA_Y, py) * 0.6).multiplyScalar(R.range(0.8, 1.1))));
    }
    // giant anvils on two islands + the hammer's pillar
    solids.push(anvil(HAMMER.x, HAMMER.y, HAMMER.z, 2.2, 0.15));
    solids.push(anvil(19, 1.55, -24, 2.8, -0.3));
    solids.push(paint(xf(new THREE.BoxGeometry(1.4, 7.2, 1.4), { x: HAMMER.x - 6.3, y: HAMMER.y + 5.8 - 3.6, z: HAMMER.z - 0.4 }), (px, py, pz, nx, ny) => col('#2e2829').lerp(col('#7a2e12'), smooth(3, -1, py) * 0.6)));
    // crucible gantry
    const cx = CRUCIBLE.x, cz = CRUCIBLE.z;
    solids.push(paint(xf(new THREE.BoxGeometry(0.9, 10, 0.9), { x: cx + 4.2, y: 4, z: cz }), (px, py) => col('#3a3234').lerp(col('#7a2e12'), smooth(2, -1, py) * 0.5)));
    solids.push(paint(xf(new THREE.BoxGeometry(5.6, 0.6, 0.6), { x: cx + 1.6, y: CRUCIBLE.y + 2.4, z: cz }), col('#4a4042')));
    solids.push(paint(xf(new THREE.BoxGeometry(0.25, 2.2, 0.25), { x: cx, y: CRUCIBLE.y + 1.2, z: cz - 0.95 }), col('#4a4042')));
    solids.push(paint(xf(new THREE.BoxGeometry(0.25, 2.2, 0.25), { x: cx, y: CRUCIBLE.y + 1.2, z: cz + 0.95 }), col('#4a4042')));
    // boundary braziers (iron pillars with fire bowls) + ingot stacks
    const brazierTops = [];
    for (const sx of [-1, 1]) {
      const bx = sx * 8.85, bz = -1.7;
      const sh = (c) => (px, py, pz, nx, ny) => c.clone().multiplyScalar(0.75 + 0.4 * Math.max(0, ny));
      solids.push(paint(xf(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 8), { x: bx, y: 0.175, z: bz }), sh(col('#3a3234'))));
      solids.push(paint(xf(new THREE.CylinderGeometry(0.22, 0.3, 1.7, 8), { x: bx, y: 1.2, z: bz }), sh(col('#2e2829'))));
      for (const yy of [0.6, 1.5]) solids.push(paint(xf(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 8), { x: bx, y: yy, z: bz }), sh(col('#6a4a3a'))));
      const bowl = new THREE.LatheGeometry([[0.05, 0], [0.5, 0.05], [0.72, 0.38], [0.78, 0.45], [0.7, 0.45]].map((p) => new THREE.Vector2(p[0], p[1])), 10);
      solids.push(paint(xf(bowl, { x: bx, y: 2.05, z: bz }), sh(col('#3a3234'))));
      glows.push(paint(xf(new THREE.CylinderGeometry(0.62, 0.4, 0.2, 10), { x: bx, y: 2.4, z: bz }), col('#ff7a20').multiplyScalar(2.6)));
      brazierTops.push([bx, 2.5, bz]);
      // ingot stacks & a small anvil just past the wall
      for (let k = 0; k < 6; k++) {
        const g = new THREE.BoxGeometry(0.6, 0.18, 0.28);
        xf(g, { x: sx * (9.9 + (k % 3) * 0.05), y: 0.09 + Math.floor(k / 3) * 0.18, z: -0.4 - (k % 3) * 0.32, ry: Math.floor(k / 3) * Math.PI / 2 });
        solids.push(paint(g, (px, py, pz, nx, ny) => col('#8a6a4a').multiplyScalar(0.7 + 0.4 * Math.max(0, ny))));
      }
      solids.push(anvil(sx * 10.6, 0, -2.6, 0.75, sx * 0.4 + 0.2));
      const rk = rockGeo(R, { detail: 1, jag: 0.3, sx: 1.4, sy: 0.8 });
      xf(rk, { x: sx * 11.8, y: 0.3, z: -0.8, s: 1.1 });
      solids.push(paint(rk, (px, py, pz, nx, ny) => col('#2a2224').lerp(col('#4a3a36'), Math.max(0, ny) * 0.6)));
    }
    group.add(kit.mesh(merge(solids), kit.toon({ vertexColors: true }), { cast: true, receive: true }));

    // --- lava falls ---------------------------------------------------------------
    const fallParts = FALLS.map((f) => {
      const z = wallZ(f.x) + 1.2;
      const g = new THREE.CylinderGeometry(f.w, f.w * 1.3, 18, 16, 12, true, -Math.PI * 0.35, Math.PI * 0.7);
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) P.setZ(i, P.getZ(i) * 0.35);
      g.computeVertexNormals();
      xf(g, { x: f.x, y: LAVA_Y + 9, z });
      return g;
    });
    const fallMat = kit.shader({
      vs: /* glsl */`varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){
          vec2 q = vec2(vUv.x * 9.0 + vW.x * 0.3, vUv.y * 3.0 + uTime * 0.9);
          float n = fbm(q * vec2(1.0, 0.6));
          float streak = vnoise(vec2(vUv.x * 30.0 + vW.x, vUv.y * 1.5 + uTime * 1.4));
          float crust = smoothstep(0.52, 0.62, n);
          vec3 hot = mix(vec3(0.9, 0.2, 0.02), vec3(1.9, 0.8, 0.18), streak);
          vec3 c = mix(hot, vec3(0.16, 0.035, 0.02), crust * 0.9);
          float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          c *= 0.4 + 0.6 * edge;
          c += vec3(2.0, 0.9, 0.25) * smoothstep(0.12, 0.0, vUv.y) * 0.8;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
      side: THREE.DoubleSide,
    });
    group.add(kit.mesh(merge(fallParts), fallMat));

    // --- gears -----------------------------------------------------------------------
    const gearMat = kit.toon({ vertexColors: true });
    const gears = GEARS.map((G) => {
      const m = kit.mesh(gearGeo(G.r, G.teeth, G.d), gearMat);
      m.position.set(G.x, G.y, wallZ(G.x) + 2.4 + (G.dz || 0));
      group.add(m);
      return m;
    });

    // --- chains --------------------------------------------------------------------------
    const chainMat = kit.toon({ vertexColors: true });
    const chains = CHAINS.map(([x, z, bottom], i) => {
      const top = 24;
      const m = kit.mesh(chainGeo(top - bottom, R), chainMat);
      m.position.set(x, top, z);
      m.userData.ph = R() * 6.28;
      group.add(m);
      return m;
    });

    // --- hammer automaton ----------------------------------------------------------------
    const hammer = new THREE.Group();
    hammer.position.set(HAMMER.x - 6.3, HAMMER.y + 5.05, HAMMER.z - 0.4);
    const hm = merge([
      paint(xf(new THREE.BoxGeometry(6.6, 0.45, 0.45), { x: 3.3 }), col('#4a3a32')),
      paint(xf(new THREE.BoxGeometry(1.6, 2.2, 1.6), { x: 6.0, y: -0.6 }), (px, py, pz, nx, ny) => col('#3a3436').multiplyScalar(0.8 + 0.4 * Math.max(0, ny)).lerp(col('#ff6a1a'), smooth(-1.2, -1.7, py) * 0.5)),
      paint(xf(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 10), { rx: Math.PI / 2 }), col('#5a4a44')),
    ]);
    hammer.add(kit.mesh(hm, kit.toon({ vertexColors: true }), { cast: true }));
    group.add(hammer);

    // --- crucible ----------------------------------------------------------------------------
    const crucible = new THREE.Group();
    crucible.position.set(cx, CRUCIBLE.y, cz);
    const bucket = new THREE.LatheGeometry([[0, -1.3], [0.9, -1.25], [1.2, -0.8], [1.35, 0.2], [1.45, 0.75], [1.6, 0.85], [1.55, 0.95], [1.3, 0.9]].map((p) => new THREE.Vector2(p[0], p[1])), 18);
    const spout = xf(new THREE.ConeGeometry(0.35, 0.9, 8, 1, true), { x: 1.7, y: 0.8, rz: -Math.PI / 2 - 0.3 });
    const crucMesh = kit.mesh(merge([
      paint(bucket, (px, py, pz, nx, ny) => col('#3a3032').multiplyScalar(0.8 + 0.3 * Math.max(0, -nx)).lerp(col('#ff6a1a'), smooth(-0.4, -1.3, py) * 0.35)),
      paint(spout, col('#3a3032')),
      paint(xf(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 8), { rx: Math.PI / 2 }), col('#5a4a44')),
    ]), kit.toon({ vertexColors: true, side: THREE.DoubleSide }), { cast: true });
    const molten = kit.mesh(xf(new THREE.CircleGeometry(1.35, 18), { rx: -Math.PI / 2, y: 0.72 }), kit.glow('#ff8a2a', 2.6));
    crucible.add(crucMesh, molten);
    group.add(crucible);
    // pour stream (scaled in Y from the spout)
    const streamGeo = new THREE.CylinderGeometry(0.11, 0.17, 1, 10, 8, true);
    streamGeo.translate(0, -0.5, 0);
    const streamMat = kit.shader({
      uniforms: { uPour: pourU },
      vs: /* glsl */`uniform float uTime; varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec3 p = position; p.x += sin(p.y * 3.0 + uTime * 9.0) * 0.03; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; uniform float uPour; varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){ float n = vnoise(vec2(vUv.x * 8.0, vW.y * 2.0 + uTime * 6.0));
          vec3 c = mix(vec3(1.2, 0.32, 0.04), vec3(1.9, 0.75, 0.14), n);
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
        }`,
    });
    const stream = kit.mesh(streamGeo, streamMat);
    stream.visible = false;
    group.add(stream);
    const pourLight = new THREE.PointLight(0xff7a2a, 0, 11, 2);
    pourLight.position.set(cx + 1.5, 1.5, cz + 2);
    group.add(pourLight);

    group.add(kit.mesh(merge(glows), kit.t(new THREE.MeshBasicMaterial({ vertexColors: true }))));

    // --- glows ------------------------------------------------------------------------
    const gl = [];
    for (const [x, y, z] of brazierTops) {
      gl.push({ p: [x, y + 0.2, z], size: 2.0, color: '#ff8a30', k: 0.65, flicker: 1 });
      gl.push({ p: [x, y, z], size: 5, color: '#ff5a1a', k: 0.18, flicker: 0.6 });
    }
    for (const f of FALLS) gl.push({ p: [f.x, LAVA_Y + 0.8, wallZ(f.x) + 2.5], size: 10, color: '#ff6a1a', k: 0.22, flicker: 0.2 });
    group.add(glowPoints(kit, gl));
    // pour impact glow (driven by uPour)
    group.add(gpuParticles(kit, {
      count: 2, shape: 'glow', seed: 3, order: 15, uniforms: { uPour: pourU },
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        P = vec3(${cx.toFixed(1)} + 1.9, ${LAVA_Y.toFixed(2)} + 0.3, ${cz.toFixed(1)} + 0.5); S = aR.x < 0.5 ? 3.0 : 7.0;
        C = vec4(vec3(1.0, 0.45, 0.1) * (aR.x < 0.5 ? 1.4 : 0.35) * (0.85 + 0.15 * sin(uTime * 20.0 + aR.y * 9.0)), uPour); }`,
    }));

    // --- fire flames on the braziers ---------------------------------------------------------
    const bt = brazierTops;
    group.add(gpuParticles(kit, {
      count: hi ? 70 : 36, shape: 'soft', seed: 7, order: 17,
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float side = aR.x < 0.5 ? ${bt[0][0].toFixed(2)} : ${bt[1][0].toFixed(2)};
        float life = 0.7 + aR.y * 0.5;
        float t = fract(uTime / life + aR.z);
        float a = aR2.x * 6.283; float r = sqrt(aR2.y) * 0.45 * (1.0 - t);
        P = vec3(side + cos(a) * r + sin(uTime * 3.0 + aR2.z * 9.0) * 0.08 * t, 2.45 + t * (1.1 + aR2.w * 0.6), ${bt[0][2].toFixed(2)} + sin(a) * r * 0.6);
        S = mix(0.42, 0.08, t);
        vec3 c = mix(vec3(1.7, 0.75, 0.18), vec3(1.1, 0.2, 0.03), smoothstep(0.1, 0.6, t));
        C = vec4(c, smoothstep(0.0, 0.1, t) * (1.0 - t));
      }`,
    }));
    // --- embers rising from the lake -------------------------------------------------------------
    group.add(gpuParticles(kit, {
      count: hi ? 420 : 160, shape: 'dot', seed: 11, order: 16,
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float life = 4.0 + aR.w * 5.0;
        float t = fract(uTime / life + aR.z);
        vec3 b = vec3(mix(-28.0, 28.0, aR.x), ${LAVA_Y.toFixed(2)}, mix(-4.5, -40.0, aR.y * aR.y));
        float tt = t * life;
        P = b + vec3(sin(tt * (0.6 + aR2.x) + aR2.y * 6.0) * 0.6 + tt * 0.15, tt * (0.9 + aR2.z * 1.1), cos(tt * 0.7 + aR2.w * 6.0) * 0.4);
        S = 0.05 + aR2.x * 0.04;
        float fl = 0.6 + 0.4 * sin(uTime * 12.0 + aR2.y * 50.0);
        C = vec4(mix(vec3(2.8, 1.2, 0.3), vec3(1.6, 0.25, 0.05), t) * fl, smoothstep(0.0, 0.06, t) * (1.0 - t));
        V = vec3(0.0, 0.02, 0.0);
      }`,
    }));
    // --- spark bursts (hammer strikes + pour splash) ---------------------------------------------
    const burst = [0, 1, 2, 3].map(() => ({ value: new THREE.Vector4(0, -100, 0, -100), type: 'vec4' }));
    group.add(gpuParticles(kit, {
      count: hi ? 320 : 140, shape: 'spark', seed: 13, order: 21,
      uniforms: { uB0: burst[0], uB1: burst[1], uB2: burst[2], uB3: burst[3] },
      body: /* glsl */`void particle(inout vec3 P, inout float S, inout vec4 C, inout vec3 V){
        float k = floor(aR.x * 4.0);
        vec4 B = k < 1.0 ? uB0 : k < 2.0 ? uB1 : k < 3.0 ? uB2 : uB3;
        float t = uTime - B.w;
        float life = 0.5 + aR.y * 0.9;
        float a = aR.z * 6.283, el = mix(0.15, 1.35, aR2.x);
        float sp = 3.0 + aR2.y * 7.0;
        vec3 v0 = vec3(cos(a) * cos(el), sin(el), sin(a) * cos(el) * 0.6) * sp;
        P = B.xyz + v0 * t + vec3(0.0, -6.0, 0.0) * t * t;
        V = (v0 + vec3(0.0, -12.0, 0.0) * t) * 0.012;
        S = 0.035;
        float alive = step(0.0, t) * step(t, life);
        C = vec4(mix(vec3(3.0, 1.8, 0.6), vec3(2.0, 0.5, 0.08), t / life), alive * (1.0 - t / life));
      }`,
    }));
    // --- heat haze above the lake -------------------------------------------------------------------
    const hazeGeo = new THREE.PlaneGeometry(90, 9);
    hazeGeo.translate(0, LAVA_Y + 4.5, -6);
    const hazeMat = kit.shader({
      vs: /* glsl */`varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fs: /* glsl */`uniform float uTime; varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_fragment>
        ${GLSL_NOISE}
        void main(){
          ${FOG_FRAG_ADD}
          vec2 q = vec2(vW.x * 0.35, vW.y * 0.5 - uTime * 0.45);
          float n = fbm(q + vec2(sin(vW.y * 2.0 + uTime) * 0.15, 0.0));
          float w = smoothstep(0.55, 0.75, n) * (1.0 - smoothstep(0.75, 0.95, n));
          float a = w * smoothstep(1.0, 0.15, vUv.y) * smoothstep(0.0, 0.08, vUv.y) * 0.07;
          // soft warm backlight band at fighter height so dark silhouettes separate from the wall
          float band = exp(-pow((vUv.y - 0.3) / 0.2, 2.0)) * 0.085 * (0.85 + 0.15 * sin(uTime * 0.7 + vW.x * 0.2));
          gl_FragColor = vec4((vec3(1.0, 0.45, 0.12) * a + vec3(1.0, 0.38, 0.12) * band) * (1.0 - fogF), 0.0);
        }`,
    });
    kit.additive(hazeMat);
    group.add(kit.mesh(hazeGeo, hazeMat, { order: 9 }));

    let lastStrike = -1e9, slot = 0, lastSplash = -1e9;
    const lip = new THREE.Vector3();
    return {
      group,
      lighting: {
        hemiSky: 0x4a3440, hemiGround: 0xc0501c, hemiIntensity: 0.85,
        key: { color: 0xffbe8a, intensity: 2.1, dir: [2.5, 4.5, 6] },
        rim: { color: 0x4ad8ff, intensity: 2.0, dir: [-5, 1.6, -5] },
        rim2: { color: 0xff5a1a, intensity: 1.5, dir: [3, 0.6, -6] },
      },
      fog: { color: 0x160807, near: 14, far: 85 },
      background: new THREE.Color(0x0a0405),
      exposure: 1.0,
      bloom: { strength: 0.85, radius: 0.5, threshold: 0.82 },
      update(dt, time, camera) {
        kit.time.value = time;
        if (camera) sky.position.copy(camera.position);
        for (let i = 0; i < gears.length; i++) gears[i].rotation.z = time * GEARS[i].w;
        for (const c of chains) {
          c.rotation.z = Math.sin(time * 0.45 + c.userData.ph) * 0.025;
          c.rotation.x = Math.cos(time * 0.37 + c.userData.ph) * 0.015;
        }
        // hammer: slow lift, fast drop, strike at 78% of the cycle
        const P = HAMMER.period, hp = (time % P) / P;
        const lift = hp < 0.7 ? smooth(0, 0.7, hp) : hp < 0.78 ? 1 - Math.pow((hp - 0.7) / 0.08, 2) : 0;
        hammer.rotation.z = 0.62 * lift;
        const strikeT = (Math.floor(time / P - 0.78) + 0.78) * P;
        if (strikeT > lastStrike && time - strikeT < 0.3) {
          lastStrike = strikeT;
          burst[slot].value.set(HAMMER.x - 0.3, HAMMER.y + 3.4, HAMMER.z + 0.1, strikeT);
          slot = (slot + 1) % 4;
        }
        // crucible pour cycle (12 s): idle → tilt → pour → return
        const cp = time % POUR_PERIOD;
        const tilt = smooth(6.5, 8.0, cp) * (1 - smooth(10.5, 11.8, cp));
        crucible.rotation.z = -tilt * 1.05;
        const pour = smooth(7.7, 8.2, cp) * (1 - smooth(10.2, 10.7, cp));
        pourU.value = pour;
        molten.material.color.setRGB(1.0, 0.54, 0.16).multiplyScalar(2.2 + 0.4 * Math.sin(time * 3) + pour);
        // stream from spout lip (world) down to the lake
        lip.set(1.85, 0.95, 0).applyEuler(crucible.rotation).add(crucible.position);
        stream.visible = pour > 0.01;
        if (stream.visible) {
          const len = (lip.y - LAVA_Y) * smooth(7.7, 8.15, cp);
          const tail = smooth(10.2, 10.7, cp) * (lip.y - LAVA_Y);
          stream.position.set(lip.x + 0.05, lip.y - tail, lip.z);
          stream.scale.set(0.7 + 0.3 * pour, Math.max(0.01, len - tail), 0.7 + 0.3 * pour);
        }
        pourLight.intensity = pour * (10 + 3 * Math.sin(time * 17));
        pourLight.position.set(lip.x, LAVA_Y + 1.2, lip.z + 1.5);
        if (pour > 0.5 && time - lastSplash > 0.45) {
          lastSplash = time;
          burst[slot].value.set(lip.x + 0.05, LAVA_Y + 0.1, lip.z, time);
          slot = (slot + 1) % 4;
        }
      },
      dispose() { kit.dispose(group); },
    };
  },
};
