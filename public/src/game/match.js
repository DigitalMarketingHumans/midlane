// Runs one match: fixed 60 Hz stepping for local modes, or a rollback session
// for LAN play. Also maps sim events to sounds/announcer.
import { createGame, step } from '../sim/game.js';
import { AI } from '../sim/ai.js';
import { HEROES } from '../sim/heroes/index.js';
import { RollbackSession } from '../net/rollback.js';
import { UP, DOWN } from '../sim/input.js';
import { S2M } from '../render/fighterView.js';

const STEP = 1 / 60;
const BLADES = { aldric: 1, ysolde: 1, kaida: 1 };
const NEUTRAL = { idle: 1, walk: 1, crouch: 1, guard: 1, air: 1 };

export class Match {
  // cfg: { mode: 'cpu'|'local'|'training'|'online', heroes, stage, seed, devices: [d0, d1],
  //        ai: [lvl|null, lvl|null], roundsToWin, runes, shop, tr, online: { client, local, delay } }
  constructor(app, cfg) {
    this.app = app;
    this.cfg = cfg;
    this.mode = cfg.mode;
    const G = createGame({
      heroes: cfg.heroes, seed: cfg.seed, stage: cfg.stage,
      training: cfg.mode === 'training', tr: cfg.tr,
      noRunes: cfg.runes === false, noShop: cfg.shop === false, roundsToWin: cfg.roundsToWin || 2,
    });
    this.G0 = G;
    this.ais = (cfg.ai || [null, null]).map((lvl, i) => (lvl == null ? null : new AI(i, lvl, (cfg.seed ^ (i * 7919)) >>> 0)));
    this.acc = 0;
    this.paused = false;
    this.local = [true, true];
    if (cfg.online) {
      const o = cfg.online;
      this.local = [o.local === 0, o.local === 1];
      this.session = new RollbackSession({ G, local: o.local, delay: o.delay ?? 1, send: (m) => o.client.send(m) });
      this.offs = ['in', 'cs', 'ping', 'pong'].map((t) => o.client.on(t, (m) => this.session.onMessage(m)));
    }
    if (cfg.mode === 'cpu') this.local = [true, false];
    // training tracking
    this.tinfo = { hits: 0, dmg: 0, adv: null, move: null, dummy: '' };
    this.track = null;
    this.trainingDummy = cfg.tr ? cfg.tr.dummy : 'stand';
    if (cfg.mode === 'training' && this.trainingDummy === 'cpu') this.ais[1] = new AI(1, 2, 99);
  }

  get G() { return this.session ? this.session.G : this.G0; }

  dispose() { if (this.offs) for (const off of this.offs) off(); }

  inputFor(i) {
    const G = this.G;
    if (this.ais[i]) return this.ais[i].think(G);
    if (this.mode === 'training' && i === 1) {
      return this.trainingDummy === 'crouch' ? DOWN : this.trainingDummy === 'jump' ? UP : 0;
    }
    return this.app.input.bits(this.cfg.devices[i]);
  }

  update(dt) {
    const evs = [];
    if (this.paused && !this.session) return evs;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      this.acc -= STEP; n++;
      if (this.session) {
        const li = this.cfg.online.local;
        this.session.tick(this.paused ? 0 : this.inputFor(li), evs);
      } else {
        step(this.G0, [this.inputFor(0), this.inputFor(1)], evs);
        if (this.mode === 'training') this.trackTraining(evs);
      }
    }
    if (this.acc > STEP * 4) this.acc = 0;
    return evs;
  }

  setTrainingDummy(mode) {
    this.trainingDummy = mode;
    this.ais[1] = mode === 'cpu' ? new AI(1, 2, 99) : null;
  }

  trackTraining(evs) {
    const G = this.G0;
    const [a, b] = G.fighters;
    for (const e of evs) {
      if ((e.t === 'hit' || e.t === 'block') && e.p === 0) this.track = { aFree: null, bFree: null, frame: G.frame };
      if (e.t === 'combo_end' && e.p === 0) { this.tinfo.hits = e.hits; this.tinfo.dmg = e.dmg; }
      if ((e.t === 'swing' || e.t === 'cast') && e.p === 0) {
        const m = HEROES[a.h].moves[e.id];
        this.tinfo.move = m ? (m.name || e.id) + ` (${m.startup}f startup)` : e.id;
      }
    }
    if (this.track) {
      const T = this.track;
      if (T.aFree == null && (NEUTRAL[a.act] || a.act === 'land' && a.af >= a.stun)) T.aFree = G.frame;
      if (T.bFree == null && NEUTRAL[b.act]) T.bFree = G.frame;
      if (a.act === 'move' && a.af === 1 && G.frame > T.frame + 1) this.track = null;
      else if (T.aFree != null && T.bFree != null) { this.tinfo.adv = T.bFree - T.aFree; this.track = null; }
      else if (G.frame - T.frame > 240) this.track = null;
    }
    this.tinfo.dummy = this.trainingDummy;
  }
}

// ---------------------------------------------------------------------------
// Event → sound / announcer
export function playEventAudio(app, e, G, opts = {}) {
  const A = app.audio;
  if (!A) return;
  const camX = app.renderer ? app.renderer.cam.x : 0;
  const pan = (x) => Math.max(-0.8, Math.min(0.8, ((x * S2M) - camX) / 6));
  const fx = (i) => (G.fighters[i] ? G.fighters[i].x : 0);
  const gain = opts.gain ?? 1;
  const ann = (t) => { if (!opts.quiet && app.settings.announcer) A.announce(t); };
  switch (e.t) {
    case 'hit': {
      const name = { L: 'hit_l', M: 'hit_m', H: 'hit_h', S: e.type === 'm' ? 'hit_magic' : 'hit_h', U: 'hit_u', T: 'hit_h' }[e.str] || 'hit_m';
      A.play(name, { pan: pan(e.x), gain });
      const atk = G.fighters[e.p];
      if (atk && BLADES[atk.h] && e.type === 'p' && (e.str === 'M' || e.str === 'H')) A.play('hit_blade', { pan: pan(e.x), gain: 0.55 * gain });
      if (e.ch) A.play('counter', { pan: pan(e.x), gain });
      break;
    }
    case 'block': A.play(e.str === 'H' || e.str === 'U' ? 'block_heavy' : 'block', { pan: pan(e.x), gain }); break;
    case 'swing': {
      const f = G.fighters[e.p];
      const blade = f && BLADES[f.h] && e.str !== 'L';
      A.play(blade ? 'whiff_blade' : ({ L: 'whiff_l', M: 'whiff_m', H: 'whiff_h', T: 'whiff_m' }[e.str] || 'whiff_m'), { pan: pan(fx(e.p)), gain: 0.8 * gain });
      break;
    }
    case 'jump': A.play('jump', { pan: pan(fx(e.p)), gain: 0.7 * gain }); break;
    case 'land': A.play('land', { pan: pan(fx(e.p)), gain: 0.6 * gain }); break;
    case 'dash': A.play('dash', { pan: pan(fx(e.p)), gain }); break;
    case 'rushdash': A.play('rush', { pan: pan(fx(e.p)), gain }); break;
    case 'kd': A.play('kd', { pan: pan(e.x ?? fx(e.p)), gain }); break;
    case 'tech': A.play('tech', { gain }); break;
    case 'dispel': A.play('dispel', { pan: pan(e.x), gain }); break;
    case 'armor': A.play('armor', { pan: pan(e.x), gain }); break;
    case 'clash': A.play('clash', { pan: pan(e.x), gain }); break;
    case 'lock': if (e.thr) A.play('grab', { gain }); break;
    case 'release': if (e.id === 'throw') A.play('throw_slam', { gain }); break;
    case 'ult': A.play('ult_cast', { gain }); A.duck(0.5, 0.9); break;
    case 'levelup': A.play('level_up', { pan: pan(fx(e.p)), gain }); break;
    case 'rune_spawn': A.play('rune_spawn', { pan: pan(e.x), gain }); break;
    case 'rune_take': A.play('rune_take', { pan: pan(fx(e.p)), gain }); break;
    case 'sigil': A.play('buff', { gain }); break;
    case 'round': A.play('round', { gain }); {
      const need = G.cfg.roundsToWin;
      const final = G.wins[0] === need - 1 && G.wins[1] === need - 1;
      ann(final ? 'Final round' : `Round ${e.n}`);
    } break;
    case 'fight': A.play('fight', { gain }); ann('Fight!'); break;
    case 'ko': A.play('ko', { gain }); A.duck(0.7, 1.3); ann(e.double ? 'Double K O' : 'K O'); if (e.perfect) setTimeout(() => { A.play('perfect'); ann('Perfect'); }, 1300); break;
    case 'timeup': A.play('timeup', { gain }); ann('Time'); break;
    case 'firstblood': A.play('firstblood', { gain }); ann('First blood'); break;
    case 'match': A.play('victory', { gain }); break;
    case 'buy': A.play('buy'); break;
    case 'sell': A.play('sell'); break;
    case 'shop_nav': if (opts.local && opts.local[e.p]) A.play('ui_move', { gain: 0.6 }); break;
    case 'shop_err': if (opts.local && opts.local[e.p]) A.play('ui_error'); break;
    case 'shop_ready': if (opts.local && opts.local[e.p]) A.play('ui_ready'); break;
    case 'notready': if (opts.local && opts.local[e.p]) A.play('notready', { gain: 0.8 }); break;
    case 'gold': if (e.why === 'round' || e.why === 'comeback' || e.why === 'rune') A.play('gold', { gain: 0.7 }); break;
  }
}
