// MIDLANE — application shell: boot, main loop, backdrop (attract-mode) scenes,
// screen routing.
import { GameRenderer } from './render/renderer.js';
import { AudioEngine } from './audio/audio.js';
import { Input } from './input/input.js';
import { loadSettings, saveSettings } from './settings.js';
import { createGame, step } from './sim/game.js';
import { AI } from './sim/ai.js';
import { HERO_LIST } from './sim/heroes/index.js';
import { STAGES } from './render/stages/index.js';
import { TitleScreen } from './ui/screens.js';
import { playEventAudio } from './game/match.js';
import { toast } from './ui/dom.js';

const PLAY_STAGES = STAGES.filter((s) => s.id !== 'debug').map((s) => s.id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class App {
  constructor() {
    this.settings = loadSettings();
    this.input = new Input();
    this.audio = new AudioEngine();
    this.applyVolumes();
    this.canvas = document.getElementById('gl');
    this.ui = document.getElementById('ui');
    this.hudRoot = document.getElementById('hud');
    this.shadeEl = document.getElementById('shade');
    this.renderer = new GameRenderer(this.canvas, { quality: this.settings.quality, audio: this.audio });
    this.screen = null;
    this.backdrop = null;
    this.time = 0;
    this.fpsT = 0; this.fpsN = 0; this.fps = 60;
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    this.input.onNav((a, src, e) => { if (this.screen && this.screen.nav) this.screen.nav(a, src, e); });
    addEventListener('resize', () => this.renderer.resize());
    window.app = this;
  }

  applyVolumes() {
    const s = this.settings;
    this.audio.setVolume('master', s.master);
    this.audio.setVolume('sfx', s.sfx);
    this.audio.setVolume('music', s.music);
    this.audio.setVolume('voice', s.announcer ? s.voice : 0);
  }
  saveSettings(patch) { this.settings = saveSettings(patch); this.applyVolumes(); }

  shade(cls) { this.shadeEl.className = cls || ''; }

  go(screen) {
    if (this.screen && this.screen.exit) this.screen.exit();
    this.ui.innerHTML = '';
    this.screen = screen;
    screen.enter();
  }

  // Backdrop: an AI-vs-AI exhibition (or idle pose) rendered behind menus.
  setBackdrop(opts = {}) {
    const heroes = opts.heroes || [pick(HERO_LIST), pick(HERO_LIST)];
    const stage = opts.stage || this.backdropStage || pick(PLAY_STAGES);
    const idle = !!opts.idle;
    const G = createGame({ heroes, seed: (Math.random() * 1e9) | 0, stage, noShop: true, noRunes: idle, training: idle, roundsToWin: 2 });
    if (idle) {
      for (const f of G.fighters) f.x = (f.i === 0 ? -1 : 1) * 8500;
    } else {
      G.pt = 1; // skip most of the intro
      for (const f of G.fighters) { f.lv = 4 + Math.floor(Math.random() * 3); f.mana = 99999; }
    }
    this.backdrop = { G, idle, ais: idle ? null : [new AI(0, 3, (Math.random() * 1e9) | 0), new AI(1, 3, (Math.random() * 1e9) | 0)], acc: 0, endT: 0 };
    this.backdropStage = stage;
    this.renderer.setStage(stage);
    this.renderer.setFighters(heroes);
    return this.backdrop;
  }

  stepBackdrop(dt) {
    const B = this.backdrop;
    if (!B) return [];
    const evs = [];
    B.acc += dt;
    let n = 0;
    while (B.acc >= 1 / 60 && n < 4) {
      B.acc -= 1 / 60; n++;
      const inp = B.ais ? [B.ais[0].think(B.G), B.ais[1].think(B.G)] : [0, 0];
      step(B.G, inp, evs);
      if (!B.idle) {
        // keep exhibitions flowing: refill and swap matchups now and then
        for (const f of B.G.fighters) if (B.G.phase === 'fight') f.mana = Math.max(f.mana, 8000);
        if (B.G.phase === 'over' || B.G.phase === 'shop') { B.endT += 1 / 60; }
      }
    }
    if (B.acc > 0.1) B.acc = 0;
    if (!B.idle && B.endT > 2.5) this.setBackdrop({ stage: pick(PLAY_STAGES) });
    return evs;
  }

  loop(now) {
    const rawDt = (now - (this.last || now)) / 1000;
    const dt = Math.min(0.1, rawDt);
    this.last = now;
    this.time += dt;
    this.input.pollPadNav();
    let scene = null;
    try {
      if (this.screen && this.screen.update) scene = this.screen.update(dt);
      if (!scene && this.backdrop) {
        const evs = this.stepBackdrop(dt);
        scene = { G: this.backdrop.G, events: evs };
        for (const e of evs) {
          if (e.t === 'hit' || e.t === 'block' || e.t === 'clash') playEventAudio(this, e, scene.G, { gain: 0.18, quiet: true });
        }
      }
      if (scene) this.renderer.render(scene.G, dt, scene.events);
    } catch (err) {
      console.error(err);
      if (!this.errShown) { this.errShown = true; toast('Something went wrong — check the console. ' + err.message, true, 6000); }
    }
    this.input.endFrame();
    this.fpsN++; this.fpsT += rawDt;
    if (this.fpsT >= 1) { this.fps = this.fpsN / this.fpsT; this.fpsN = 0; this.fpsT = 0; }
    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    this.setBackdrop();
    this.go(new TitleScreen(this));
    requestAnimationFrame((t) => this.loop(t));
    setTimeout(() => document.getElementById('boot').classList.add('gone'), 250);
  }
}

const app = new App();
app.start();
export default app;
