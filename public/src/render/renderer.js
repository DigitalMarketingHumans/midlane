// Main game renderer: scene, lights, stage, fighter views, entities, runes,
// camera direction, generic combat VFX, post-processing.
import * as THREE from 'three';
import { Post } from './post.js';
import { VFX } from './vfx.js';
import { FighterView, S2M } from './fighterView.js';
import { buildStage } from './stages/index.js';
import { HERO_RENDER } from './heroes/index.js';
import { HEROES, KINDS } from '../sim/heroes/index.js';
import { RUNES } from '../sim/items.js';
import { hurtBoxes } from '../sim/combat.js';
import { worldBox } from '../sim/core.js';
import { pushBox } from '../sim/fighter.js';

const D2R = Math.PI / 180;
const STR_BIG = { L: 0.5, M: 0.72, H: 1.0, S: 0.9, U: 1.35, T: 0.9 };

const DEFAULT_ENT = {
  build(ctx) {
    const g = new ctx.THREE.Group();
    const m = new ctx.THREE.Mesh(new ctx.THREE.SphereGeometry(0.18, 16, 12), new ctx.THREE.MeshBasicMaterial({ color: new ctx.THREE.Color(ctx.color).multiplyScalar(3) }));
    g.add(m);
    return g;
  },
  update(obj, e, ctx) {
    ctx.vfx.particle({ x: obj.position.x, y: obj.position.y, color: ctx.color, shape: 'soft', size: 0.2, size1: 0, life: 0.25, speed: 0.4 });
  },
};

export class GameRenderer {
  constructor(canvas, opts = {}) {
    this.quality = opts.quality || 'high';
    this.audio = opts.audio || null;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25));
    r.shadowMap.enabled = this.quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 500);
    this.camera.position.set(0, 1.8, 11);
    // Lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    this.key.castShadow = true;
    const sm = this.quality === 'high' ? 2048 : 1024;
    this.key.shadow.mapSize.set(sm, sm);
    const sc = this.key.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 7; sc.bottom = -2; sc.near = 1; sc.far = 40;
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.02;
    this.rim = new THREE.DirectionalLight(0x88aaff, 1.4);
    this.rim2 = new THREE.DirectionalLight(0xffaa66, 0.8);
    this.scene.add(this.hemi, this.key, this.key.target, this.rim, this.rim2);
    this.keyDir = new THREE.Vector3(3, 7, 6).normalize();
    this.post = new Post(r, this.scene, this.camera, this.quality);
    this.vfx = new VFX(this.scene);
    this.views = [null, null];
    this.ents = new Map();
    this.time = 0;
    this.cam = { x: 0, y: 1.8, z: 11.5, lx: 0, ly: 1.2, orbit: 0 };
    // Screen-level framing knobs used by menus: zoom multiplier, horizontal shift (fraction of half-width), vertical lift.
    this.view = { zoom: 1, shift: 0, lift: 0 };
    this.viewT = { zoom: 1, shift: 0, lift: 0 };
    this.fx = { chroma: 0, flash: 0, flashCol: new THREE.Color(1, 1, 1), sat: 1, dim: 0 };
    // Ult dim plane (sits just behind the fight plane)
    this.dimMat = new THREE.MeshBasicMaterial({ color: 0x05040a, transparent: true, opacity: 0, depthWrite: false });
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(200, 120), this.dimMat);
    this.dim.position.set(0, 10, -1.2);
    this.dim.renderOrder = 5;
    this.scene.add(this.dim);
    this.rune = null;
    this.stage = null;
    this.stageId = null;
    this.onEvent = null; // external hook (HUD/audio)
    this.showBoxes = false;
    const MAXB = 96;
    this.boxPos = new Float32Array(MAXB * 8 * 3);
    this.boxCol = new Float32Array(MAXB * 8 * 3);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.boxPos, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(this.boxCol, 3));
    this.boxLines = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.boxLines.renderOrder = 99; this.boxLines.frustumCulled = false; this.boxLines.visible = false;
    this.scene.add(this.boxLines);
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.r.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setStage(id) {
    if (this.stageId === id && this.stage) return;
    if (this.stage) {
      this.scene.remove(this.stage.group);
      if (this.stage.dispose) this.stage.dispose();
      this.stage.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.stageId = id;
    this.stage = buildStage(id, { scene: this.scene, renderer: this.r, quality: this.quality, camera: this.camera });
    this.scene.add(this.stage.group);
    const L = this.stage.lighting || {};
    this.hemi.color.set(L.hemiSky ?? 0xffffff); this.hemi.groundColor.set(L.hemiGround ?? 0x444444); this.hemi.intensity = L.hemiIntensity ?? 1.2;
    const setDir = (light, o, def) => {
      if (!o) { light.intensity = 0; return; }
      light.color.set(o.color ?? 0xffffff); light.intensity = o.intensity ?? def;
      light.userData.dir = new THREE.Vector3(...(o.dir || [3, 7, 6])).normalize();
    };
    setDir(this.key, L.key, 2.2); setDir(this.rim, L.rim, 1.4); setDir(this.rim2, L.rim2, 0.8);
    this.baseLight = { hemi: this.hemi.intensity, key: this.key.intensity, rim: this.rim.intensity, rim2: this.rim2.intensity };
    if (this.stage.fog) this.scene.fog = new THREE.Fog(this.stage.fog.color, this.stage.fog.near, this.stage.fog.far);
    else this.scene.fog = null;
    this.scene.background = this.stage.background ?? null;
    this.r.toneMappingExposure = this.stage.exposure ?? 1.0;
    this.post.setBloom(this.stage.bloom);
  }

  setFighters(ids) {
    for (const v of this.views) {
      if (!v) continue;
      this.scene.remove(v.group);
      if (v.dispose) v.dispose();
      v.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.dispose) m.dispose();
      });
    }
    for (const t of this.vfx.trails) { this.scene.remove(t.mesh); t.geo.dispose(); t.mesh.material.dispose(); }
    this.vfx.trails = [];
    for (const [, rec] of this.ents) this.scene.remove(rec.obj);
    this.ents.clear();
    this.vfx.clear();
    this.views = ids.map((id, i) => {
      const v = new FighterView(id, i);
      this.scene.add(v.group);
      v.trailFx = v.trails.map((t) => this.vfx.makeTrail(t.color, t.n || 12));
      return v;
    });
  }

  ctx(i, G, dt) {
    const v = this.views[i];
    return { THREE, vfx: this.vfx, G, dt, time: this.time, view: v, S2M, color: v ? (v.R.glowColor ?? 0xffffff) : 0xffffff, audio: this.audio, renderer: this, i };
  }

  // -------------------------------------------------------------------------
  handleEvents(G, evs) {
    for (const e of evs) {
      this.genericFx(G, e);
      const p = e.p;
      if (p === 0 || p === 1) {
        const R = HERO_RENDER[G.fighters[p].h];
        if (R && R.onEvent) {
          try { R.onEvent(e, this.ctx(p, G, 0)); } catch (err) { console.error(err); }
        }
      }
      if (this.onEvent) this.onEvent(e, G);
    }
  }

  genericFx(G, e) {
    const V = this.vfx;
    const f = (i) => G.fighters[i];
    const glow = (i) => (this.views[i] && this.views[i].R.glowColor) || 0xffd080;
    switch (e.t) {
      case 'hit': {
        const x = e.x * S2M, y = e.y * S2M;
        let big = STR_BIG[e.str] || 0.7;
        // Rapid multi-hit sources (beams, ticks) and lock hits get toned-down generic FX.
        const K = e.k ? KINDS[e.k] : null;
        const multi = (K && K.interval) || e.lock;
        if (multi) big *= 0.5;
        const col = e.type === 'm' ? glow(e.p) : e.ch ? 0xff5a2a : 0xffc06a;
        V.burst({ x, y, z: 0.4, count: Math.round(10 + 22 * big), color: col, color2: 0xff3a10, speed: [3, 10 * big + 2], size: [0.025, 0.055], life: [0.12, 0.34], shape: 'spark', stretch: 1.6, drag: 0.85, gravity: 5 });
        if (!multi) V.burst({ x, y, z: 0.45, count: 2, color: 0xffffff, shape: 'soft', size: 0.35 * big + 0.12, size1: 0.7 * big + 0.15, life: 0.09, speed: 0, intensity: 1.6 });
        V.flash({ x, y, z: 0.5, color: col, size: (1.0 + 1.1 * big) * (multi ? 0.6 : 1), life: 0.1, intensity: multi ? 1.4 : 2.4 });
        if (big >= 0.7) V.ring({ x, y, z: 0.4, color: col, r0: 0.08, r1: 0.55 + 0.6 * big, life: 0.22, thick: 0.1 });
        V.light({ x, y, z: 1.2, color: col, intensity: 9 * big + 3, life: 0.16, distance: 5 });
        V.shake(0.03 + 0.06 * big * big + (e.ch ? 0.05 : 0), 0.14 + 0.12 * big);
        if (e.ch) V.ring({ x, y, z: 0.45, color: 0xff2a10, r0: 0.2, r1: 1.5, life: 0.32, thick: 0.06, intensity: 3 });
        if (this.views[e.v] && !multi) this.views[e.v].hitFlash(e.type === 'm' ? glow(e.p) : 0xffffff, 0.07);
        this.fx.chroma = Math.max(this.fx.chroma, 0.35 * big + (e.ch ? 0.4 : 0));
        if (e.str === 'U' && !multi) { this.fx.flash = Math.max(this.fx.flash, 0.1); this.fx.flashCol.set(glow(e.p)); }
        break;
      }
      case 'block': {
        const x = e.x * S2M, y = e.y * S2M;
        V.burst({ x, y, z: 0.4, count: 12, color: 0x8fd8ff, speed: [2, 6], size: [0.025, 0.05], life: [0.1, 0.25], shape: 'shard', drag: 0.85 });
        V.ring({ x, y, z: 0.4, color: 0x7fc8ff, r0: 0.15, r1: 0.6, life: 0.16, thick: 0.08, intensity: 2.5 });
        V.flash({ x, y, z: 0.5, color: 0x9fd8ff, size: 0.9, life: 0.08 });
        V.shake(0.02, 0.1);
        break;
      }
      case 'armor': {
        const x = e.x * S2M, y = e.y * S2M;
        V.burst({ x, y, z: 0.4, count: 16, color: 0xffa040, speed: [2, 7], size: [0.03, 0.05], life: [0.15, 0.3], shape: 'spark', stretch: 1.2 });
        V.flash({ x, y, color: 0xffc070, size: 1.2, life: 0.1 });
        if (this.views[e.v]) this.views[e.v].hitFlash(0xffa040, 0.1);
        break;
      }
      case 'clash': {
        const x = e.x * S2M, y = e.y * S2M;
        V.flash({ x, y, color: 0xffffff, size: 2.2, life: 0.18 });
        V.ring({ x, y, color: 0xffffff, r0: 0.1, r1: 1.2, life: 0.3 });
        V.burst({ x, y, count: 30, color: 0xffe0a0, speed: [3, 9], shape: 'spark', life: [0.2, 0.4] });
        V.shake(0.06, 0.15);
        break;
      }
      case 'jump': case 'land': case 'dash': case 'rushdash': case 'kd': {
        const F = f(e.p);
        const x = (e.t === 'kd' && e.x != null ? e.x : F.x) * S2M;
        const n = e.t === 'kd' ? 26 : e.t === 'land' ? 10 : 8;
        V.burst({ x, y: 0.05, z: 0.1, count: n, color: 0xb0a594, additive: false, shape: 'smoke', size: [0.18, 0.35], size1: 0.6, speed: [0.6, 2.2], dir: Math.PI / 2, spread: 1.4, life: [0.35, 0.7], drag: 0.9, gravity: -0.4, alpha: 0.5, intensity: 1 });
        if (e.t === 'kd') V.shake(0.05, 0.2);
        if (e.t === 'rushdash') {
          V.burst({ x, y: 1.0, count: 24, color: glow(e.p), speed: [1, 4], size: [0.04, 0.08], life: [0.2, 0.4], shape: 'spark', dir: F.face > 0 ? Math.PI : 0, spread: 0.5 });
          V.ring({ x, y: 1.0, color: glow(e.p), r0: 0.2, r1: 1.0, life: 0.2, axis: 'x' });
        }
        break;
      }
      case 'dispel': {
        const x = e.x * S2M, y = e.y * S2M + 1.0;
        V.ring({ x, y, z: 0.3, color: 0x9ff0ff, r0: 0.2, r1: 3.0, life: 0.45, thick: 0.25, intensity: 3 });
        V.ring({ x, y, z: 0.3, color: 0xffffff, r0: 0.1, r1: 2.0, life: 0.3, thick: 0.1, intensity: 3 });
        V.flash({ x, y, color: 0xbff8ff, size: 4, life: 0.25 });
        V.burst({ x, y, count: 60, color: 0x9ff0ff, speed: [4, 12], shape: 'spark', life: [0.2, 0.5], size: [0.03, 0.06] });
        V.light({ x, y, color: 0x9ff0ff, intensity: 30, life: 0.35, distance: 8 });
        V.shake(0.1, 0.25);
        this.fx.flash = 0.25; this.fx.flashCol.set(0xbff8ff);
        break;
      }
      case 'ult': {
        const F = f(e.p);
        const x = F.x * S2M, y = F.y * S2M + 1.2;
        const c = glow(e.p);
        V.flash({ x, y, color: c, size: 5, life: 0.5, grow: true });
        V.ring({ x, y, z: 0.5, color: c, r0: 0.2, r1: 3.5, life: 0.6, thick: 0.18, intensity: 3 });
        V.burst({ x, y, count: 80, color: c, color2: 0xffffff, speed: [2, 9], shape: 'spark', life: [0.3, 0.7], size: [0.03, 0.07], drag: 0.9 });
        V.light({ x, y, color: c, intensity: 40, life: 0.8, distance: 10 });
        this.fx.chroma = 1.0;
        break;
      }
      case 'levelup': {
        const F = f(e.p);
        const x = F.x * S2M;
        V.pillar({ x, y: F.y * S2M, color: 0xffd36a, height: 4.5, radius: 0.55, life: 0.9, intensity: 2 });
        V.burst({ x, y: 0.2 + F.y * S2M, count: 40, color: 0xffe08a, speed: [1, 4], dir: Math.PI / 2, spread: 0.6, shape: 'star', size: [0.08, 0.14], life: [0.5, 1.0], drag: 0.94, gravity: -1 });
        V.ring({ x, y: 0.05, color: 0xffd36a, r0: 0.2, r1: 1.4, life: 0.5, axis: 'y' });
        break;
      }
      case 'rune_spawn': {
        const x = e.x * S2M, y = e.y * S2M + 0.4;
        const c = RUNES[e.k].color;
        V.ring({ x, y, color: c, r0: 0.1, r1: 1.4, life: 0.5 });
        V.burst({ x, y, count: 40, color: c, speed: [1, 4], shape: 'star', size: [0.06, 0.12], life: [0.4, 0.9] });
        break;
      }
      case 'rune_take': {
        const F = f(e.p);
        const c = RUNES[e.k].color;
        const x = F.x * S2M, y = F.y * S2M + 1;
        V.pillar({ x, y: F.y * S2M, color: c, height: 3.5, radius: 0.5, life: 0.6 });
        V.burst({ x, y, count: 50, color: c, speed: [2, 6], shape: 'star', size: [0.06, 0.12], life: [0.4, 0.8] });
        V.light({ x, y, color: c, intensity: 20, life: 0.5 });
        break;
      }
      case 'ko': {
        this.fx.flash = 0.4; this.fx.flashCol.set(0xffffff);
        V.shake(0.22, 0.6);
        this.fx.chroma = 1.2;
        break;
      }
      case 'tech': {
        const x = e.x * S2M;
        V.flash({ x, y: 1.2, color: 0xffffff, size: 2, life: 0.15 });
        V.ring({ x, y: 1.2, color: 0xffffff, r0: 0.1, r1: 1.0, life: 0.25 });
        break;
      }
      case 'sigil': {
        const F = f(e.p);
        V.ring({ x: F.x * S2M, y: F.y * S2M + 1, color: 0xffd36b, r0: 0.3, r1: 1.4, life: 0.5, thick: 0.2 });
        V.flash({ x: F.x * S2M, y: F.y * S2M + 1, color: 0xffd36b, size: 3, life: 0.3 });
        break;
      }
      case 'cast': {
        const F = f(e.p);
        const c = glow(e.p);
        V.burst({ x: F.x * S2M + F.face * 0.3, y: F.y * S2M + 1.2, count: 14, color: c, speed: [0.5, 2.5], shape: 'soft', size: [0.08, 0.16], life: [0.2, 0.4] });
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  syncEnts(G, dt) {
    const seen = new Set();
    for (const e of G.ents) {
      seen.add(e.id);
      let rec = this.ents.get(e.id);
      if (!rec) {
        const [hid, kname] = e.k.split('.');
        const R = HERO_RENDER[hid];
        const def = (R && R.ents && R.ents[kname]) || DEFAULT_ENT;
        const obj = def.build(this.ctx(e.o, G, dt), e);
        this.scene.add(obj);
        rec = { obj, def, e };
        this.ents.set(e.id, rec);
      }
      rec.e = e;
      if (rec.def.autoPos !== false) {
        rec.obj.position.set(e.x * S2M, e.y * S2M, rec.def.z ?? 0.05);
        rec.obj.scale.x = Math.abs(rec.obj.scale.x) * (e.face < 0 ? -1 : 1);
      }
      if (rec.def.update) rec.def.update(rec.obj, e, this.ctx(e.o, G, dt));
    }
    for (const [id, rec] of this.ents) {
      if (seen.has(id)) continue;
      if (rec.def.end) { try { rec.def.end(rec.obj, rec.e, this.ctx(rec.e.o, G, dt)); } catch (err) { console.error(err); } }
      this.scene.remove(rec.obj);
      rec.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.ents.delete(id);
    }
  }

  syncRune(G, dt) {
    const R = G.rune;
    if (!R) {
      if (this.rune) { this.scene.remove(this.rune.g); this.rune = null; }
      return;
    }
    if (!this.rune || this.rune.k !== R.k) {
      if (this.rune) this.scene.remove(this.rune.g);
      const c = new THREE.Color(RUNES[R.k].color);
      const g = new THREE.Group();
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.5) }));
      gem.scale.set(1, 1.5, 1);
      const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.2), wireframe: true, transparent: true, opacity: 0.6 }));
      shell.scale.set(1, 1.5, 1);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(0.8), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 3;
      const base = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      base.rotation.x = -Math.PI / 2;
      g.add(gem, shell, beam, base);
      this.scene.add(g);
      this.rune = { k: R.k, g, gem, shell, beam, base, c };
    }
    const r = this.rune;
    const x = R.x * S2M, y = R.y * S2M + 0.45;
    r.g.position.set(x, 0, 0.05);
    r.gem.position.y = y + Math.sin(this.time * 2.5) * 0.08;
    r.shell.position.y = r.gem.position.y;
    r.gem.rotation.y += dt * 2; r.shell.rotation.y -= dt * 1.2;
    r.base.position.y = 0.02;
    const fade = R.t < 120 ? (Math.sin(this.time * 20) > 0 ? 1 : 0.3) : 1;
    r.g.visible = fade > 0.5 || R.t % 8 < 5;
    if (Math.random() < 0.5) this.vfx.particle({ x: x + (Math.random() - 0.5) * 0.5, y: y - 0.3, color: r.c.getHex(), shape: 'star', size: 0.07, size1: 0, life: 0.8, speed: 0.6, dir: Math.PI / 2, spread: 0.3 });
  }

  buffAuras(G, dt) {
    for (const F of G.fighters) {
      const v = this.views[F.i];
      if (!v) continue;
      for (const b of F.buffs) {
        const R = v.R;
        if (R.buffFx && R.buffFx[b.k]) { R.buffFx[b.k](F, b, this.ctx(F.i, G, dt)); continue; }
        const col = b.k === 'fury' ? 0xff3a2a : b.k === 'haste' ? 0xffe14a : b.k === 'insight' ? 0x4aa8ff : b.k === 'slow' ? 0x9a7aff : b.k === 'burn' ? 0xff7a2a : b.k === 'root' ? 0x5ad070 : null;
        if (!col || Math.random() > 0.55) continue;
        const x = F.x * S2M + (Math.random() - 0.5) * 0.6, y = F.y * S2M + Math.random() * 1.8;
        this.vfx.particle({ x, y, z: 0.2, color: col, shape: b.k === 'haste' ? 'spark' : 'soft', size: 0.09, size1: 0, life: 0.5, speed: 0.8, dir: Math.PI / 2, spread: 0.4, stretch: 0.5 });
      }
      if (F.shield > 0 && Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        this.vfx.particle({ x: F.x * S2M + Math.cos(a) * 0.55, y: F.y * S2M + 1 + Math.sin(a) * 0.9, color: 0xffd36b, shape: 'star', size: 0.08, size1: 0, life: 0.4, speed: 0.2 });
      }
    }
  }

  trailsFx(G) {
    const tip = new THREE.Vector3(), base = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const v = this.views[i];
      if (!v) continue;
      const F = G.fighters[i];
      for (let k = 0; k < v.trails.length; k++) {
        const tr = v.trails[k];
        let on = false;
        if (F.act === 'move') {
          const m = v.H.moves[F.mv];
          const tw = tr.moves ? tr.moves.includes(F.mv) : !(v.R.noTrail && v.R.noTrail.includes(F.mv));
          on = tw && m.hits.length > 0 && F.af >= m.startup - 3 && F.af <= m.lastActive + 1;
        } else if (F.act === 'lock' && v.R.trailLock) on = v.R.trailLock(F, G);
        v.trailPoints(k, tip, base);
        this.vfx.feedTrail(v.trailFx[k], tip, base, on);
      }
    }
  }

  // -------------------------------------------------------------------------
  updateCamera(G, dt) {
    const a = G.fighters[0], b = G.fighters[1];
    const ax = a.x * S2M, bx = b.x * S2M, ay = a.y * S2M, by = b.y * S2M;
    const maxY = Math.max(ay, by);
    let cx = (ax + bx) / 2;
    const dist = Math.abs(ax - bx);
    let z = Math.min(12.4, Math.max(9.4, 8.4 + dist * 0.52));
    let ly = 1.18 + maxY * 0.42;
    let y = 1.62 + maxY * 0.32 + (z - 9.4) * 0.07;
    let orbit = 0;
    let speed = 7;
    const tanH = Math.tan((this.camera.fov / 2) * D2R) * this.camera.aspect;
    if (G.phase === 'intro') {
      const u = Math.max(0, Math.min(1, G.pt / 110));
      z += u * 3.5; y += u * 0.8; orbit = u * 0.18;
      speed = 3;
    }
    if (G.freeze > 0 && G.freezeBy >= 0) {
      const F = G.fighters[G.freezeBy];
      cx = F.x * S2M + F.face * 0.35; z = 5.4; ly = F.y * S2M + 1.25; y = ly + 0.15; orbit = F.face * -0.12;
      speed = 10;
    } else if (G.lock) {
      const K = G.lock;
      const R = HERO_RENDER[K.h];
      const L = R && R.locks && R.locks[K.id];
      const def = HEROES[K.h].locks[K.id];
      if (def.ult || (L && L.cam)) {
        const A = G.fighters[K.a], V = G.fighters[K.v];
        cx = (A.x + V.x) / 2 * S2M;
        const top = Math.max(A.y, V.y) * S2M;
        z = Math.min((L && L.camZ) || 6.8, 9 + top * 0.6); ly = 1.15 + top * 0.92; y = ly + 0.25;
        orbit = (L && L.orbit != null ? L.orbit : 0.22) * Math.sin(K.af / 40) * A.face;
        speed = 4;
      }
    } else if (G.phase === 'ko' || (G.phase === 'end' && G.pt > 100)) {
      const lo = G.roundWinner >= 0 ? G.fighters[1 - G.roundWinner] : a;
      cx = cx * 0.5 + lo.x * S2M * 0.5; z = Math.max(7.5, z - 2.2); speed = 2.5;
    } else if (G.phase === 'end' || G.phase === 'over') {
      const w = G.roundWinner >= 0 ? G.fighters[G.roundWinner] : null;
      if (w) { cx = w.x * S2M; z = 7.2; ly = 1.3; y = 1.45; orbit = -w.face * 0.15; speed = 2; }
    }
    const V = this.view, VT = this.viewT, vk = 1 - Math.exp(-dt * 3);
    V.zoom += (VT.zoom - V.zoom) * vk; V.shift += (VT.shift - V.shift) * vk; V.lift += (VT.lift - V.lift) * vk;
    z *= V.zoom; y += V.lift; ly += V.lift * 0.6;
    const halfW = z * tanH;
    const lim = 8.2 + 0.9 - halfW;
    if (lim > 0) cx = Math.max(-lim, Math.min(lim, cx)); else cx = 0;
    const k = 1 - Math.exp(-dt * speed);
    const C = this.cam;
    C.x += (cx - C.x) * k; C.z += (z - C.z) * k; C.y += (y - C.y) * k; C.ly += (ly - C.ly) * k; C.orbit += (orbit - C.orbit) * k;
    const [sx, sy] = this.vfx.shakeOffset();
    const off = -V.shift * C.z * tanH;
    this.camera.position.set(C.x + off + Math.sin(C.orbit) * C.z + sx, C.y + sy, Math.cos(C.orbit) * C.z);
    this.camera.lookAt(C.x + off + sx * 0.5, C.ly + sy * 0.5, 0);
    // Shadow follows
    const d = this.key.userData.dir || this.keyDir;
    this.key.position.set(C.x + d.x * 15, d.y * 15, d.z * 15);
    this.key.target.position.set(C.x, 0, 0);
    for (const l of [this.rim, this.rim2]) {
      const dd = l.userData.dir || new THREE.Vector3(-1, 1, -1);
      l.position.set(C.x + dd.x * 15, dd.y * 15, dd.z * 15);
      l.target = this.key.target;
    }
  }

  drawBoxes(G) {
    this.boxLines.visible = this.showBoxes;
    if (!this.showBoxes) return;
    let n = 0;
    const P = this.boxPos, C = this.boxCol, MAX = P.length / 24;
    const add = (b, r, g, bl) => {
      if (n >= MAX) return;
      const x0 = b[0] * S2M, y0 = b[1] * S2M, x1 = (b[0] + b[2]) * S2M, y1 = (b[1] + b[3]) * S2M, z = 0.6;
      const pts = [x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0];
      for (let k = 0; k < 8; k++) { const o = (n * 8 + k) * 3; P[o] = pts[k * 2]; P[o + 1] = pts[k * 2 + 1]; P[o + 2] = z; C[o] = r; C[o + 1] = g; C[o + 2] = bl; }
      n++;
    };
    for (const f of G.fighters) {
      add(pushBox(f), 0.9, 0.9, 0.3);
      for (const b of hurtBoxes(G, f)) add(b, 0.2, 1, 0.4);
      if (f.act === 'move') {
        const m = HEROES[f.h].moves[f.mv];
        for (const hh of m.hits) if (f.af >= hh.from && f.af <= hh.to) add(worldBox(hh.box, f.x, f.y, f.face, [0, 0, 0, 0]), 1, 0.15, 0.2);
      }
    }
    for (const e of G.ents) {
      const K = KINDS[e.k];
      if (K && K.boxS) add(worldBox(K.boxS, e.x, e.y, e.face, [0, 0, 0, 0]), 1, 0.55, 0.1);
    }
    P.fill(0, n * 24);
    this.boxLines.geometry.attributes.position.needsUpdate = true;
    this.boxLines.geometry.attributes.color.needsUpdate = true;
    this.boxLines.geometry.setDrawRange(0, n * 8);
  }

  render(G, dt, events) {
    this.time += dt;
    this.resize();
    if (events && events.length) this.handleEvents(G, events);
    for (let i = 0; i < 2; i++) if (this.views[i]) this.views[i].update(G.fighters[i], G, dt, this.time);
    this.trailsFx(G);
    this.buffAuras(G, dt);
    this.syncEnts(G, dt);
    this.syncRune(G, dt);
    if (this.stage && this.stage.update) this.stage.update(dt, this.time, this.camera);
    this.updateCamera(G, dt);
    this.drawBoxes(G);
    // Ult dim & lighting
    const dimT = G.freeze > 0 ? 0.72 : (G.lock && HEROES[G.lock.h].locks[G.lock.id].ult ? 0.45 : 0);
    this.fx.dim += (dimT - this.fx.dim) * (1 - Math.exp(-dt * 12));
    this.dimMat.opacity = this.fx.dim;
    this.dim.position.x = this.cam.x;
    const lk = 1 - this.fx.dim * 0.35;
    if (this.baseLight) { this.hemi.intensity = this.baseLight.hemi * lk; }
    // Grade
    const U = this.post.u;
    this.fx.chroma = Math.max(0, this.fx.chroma - dt * 3.5);
    this.fx.flash = Math.max(0, this.fx.flash - dt * 2.5);
    const satT = G.phase === 'ko' ? 0.35 : 1;
    this.fx.sat += (satT - this.fx.sat) * (1 - Math.exp(-dt * 6));
    U.chroma.value = this.fx.chroma;
    U.flash.value = this.fx.flash;
    U.flashCol.value.copy(this.fx.flashCol);
    U.sat.value = this.fx.sat;
    this.vfx.update(dt);
    this.post.draw(dt);
  }
}
