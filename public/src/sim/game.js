// Match controller: phases, rounds, shop, runes, KO handling. step() is the single
// deterministic entry point used by local play, AI, and rollback netcode.
import {
  px, ROUND_TIME, INTRO_FRAMES, KO_FRAMES, ROUND_END_FRAMES, SHOP_FRAMES, FIRST_SHOP_FRAMES,
  ROUNDS_TO_WIN, START_X, MANA, RUNE_FIRST, RUNE_EVERY, RUNE_LIFE, RUNE_BUFF, INVENTORY,
  STAGE_HALF, SCREEN_HALF,
} from './const.js';
import { UP, DOWN, LEFT, RIGHT, B_L, B_M, B_H, B_R } from './input.js';
import { setOut, ev, addBuff, overlap, clamp } from './core.js';
import { rngInt, rngRange } from './rng.js';
import { ITEMS, ITEM_BY_ID, RUNE_KINDS } from './items.js';
import { HEROES } from './heroes/registry.js';
import { stats, gainXP, gainGold } from './stats.js';
import { newFighter, readInput, updateFighter, resolvePush, fighterTimers, faceOpponent } from './fighter.js';
import { checkFighterHit, applyHit, updateEnts, entityHits, updateLock, hurtBoxes } from './combat.js';
import './heroes/index.js';

export function createGame(cfg) {
  const G = {
    frame: 0,
    phase: 'shop', pt: FIRST_SHOP_FRAMES,
    round: 0, timer: ROUND_TIME, wins: [0, 0], winner: -1, roundWinner: -1,
    rng: (cfg.seed >>> 0) || 0x1234567,
    freeze: 0, freezeBy: -1,
    camX: 0,
    fighters: [newFighter(0, cfg.heroes[0]), newFighter(1, cfg.heroes[1])],
    ents: [], nextId: 1,
    lock: null,
    rune: null, runeT: RUNE_FIRST,
    shop: [{ cur: 0, ready: false }, { cur: 0, ready: false }],
    firstBlood: -1,
    cfg: {
      stage: cfg.stage || 'river',
      training: !!cfg.training,
      tr: cfg.training ? Object.assign({ dummy: 'stand', block: 'none', infinite: true, refill: true }, cfg.tr || {}) : null,
      noRunes: !!cfg.noRunes,
      noShop: !!cfg.noShop,
      roundsToWin: cfg.roundsToWin || ROUNDS_TO_WIN,
    },
  };
  for (const f of G.fighters) {
    const s = stats(G, f);
    f.mhp = s.hp; f.hp = s.hp; f.mana = s.mana * MANA;
  }
  if (G.cfg.training) {
    for (const f of G.fighters) { f.lv = 6; f.gold = 99999; }
    startRound(G);
    G.phase = 'fight'; G.pt = 0;
    for (const f of G.fighters) f.act = 'idle';
  } else if (G.cfg.noShop) {
    startRound(G);
  }
  return G;
}

export function step(G, inputs, out = null) {
  setOut(out);
  G.frame++;
  const [a, b] = G.fighters;
  readInput(G, a, inputs[0] | 0);
  readInput(G, b, inputs[1] | 0);
  switch (G.phase) {
    case 'shop': shopStep(G); break;
    case 'intro':
      fightStep(G);
      if (--G.pt <= 0) {
        G.phase = 'fight';
        for (const f of G.fighters) { f.act = 'idle'; f.af = 0; }
        ev(G, 'fight', { n: G.round });
      }
      break;
    case 'fight':
      fightStep(G);
      if (!G.cfg.training) {
        if (!G.freeze && !G.lock) G.timer--;
        checkRoundEnd(G);
      }
      break;
    case 'ko':
      if (G.pt % 2 === 0 || G.lock) fightStep(G);
      if (--G.pt <= 0) toEndPhase(G);
      break;
    case 'end':
      fightStep(G);
      if (G.pt === ROUND_END_FRAMES - 30) poseWinner(G);
      if (--G.pt <= 0) afterRound(G);
      break;
    case 'over':
      fightStep(G);
      break;
  }
  setOut(null);
}

// ---------------------------------------------------------------------------
function fightStep(G) {
  if (G.freeze > 0) { G.freeze--; return; }
  const [a, b] = G.fighters;
  updateFighter(G, a, b);
  updateFighter(G, b, a);
  updateLock(G);
  resolvePush(G);
  updateEnts(G);
  // Fighter vs fighter hits (simultaneous → trades)
  const ha = checkFighterHit(G, a, b);
  const hb = checkFighterHit(G, b, a);
  // Throws lose to strikes on the same frame
  if (ha && hb && ha.h.grab && !hb.h.grab) resolveMelee(G, b, a, hb);
  else if (ha && hb && hb.h.grab && !ha.h.grab) resolveMelee(G, a, b, ha);
  else if (ha && hb && ha.h.grab && hb.h.grab) {
    // simultaneous throws: auto-tech
    for (const f of [a, b]) { f.act = 'tech'; f.af = 0; f.pv = (f.x < (a.x + b.x) / 2 ? -1 : 1) * px(7); }
    ev(G, 'tech', { p: 0, v: 1, x: (a.x + b.x) >> 1 });
  } else {
    if (ha) resolveMelee(G, a, b, ha);
    if (hb && !G.lock) resolveMelee(G, b, a, hb);
  }
  entityHits(G);
  if (G.phase === 'fight' || G.phase === 'ko' || G.phase === 'intro') {
    for (const f of G.fighters) fighterTimers(G, f);
    if (G.phase === 'fight') runeStep(G);
  }
}

function resolveMelee(G, atk, vic, hit) {
  atk.hm |= 1 << hit.i;
  const hx = Math.trunc((Math.max(hit.box[0], hit.hurt[0]) + Math.min(hit.box[0] + hit.box[2], hit.hurt[0] + hit.hurt[2])) / 2);
  const hy = Math.trunc((Math.max(hit.box[1], hit.hurt[1]) + Math.min(hit.box[1] + hit.box[3], hit.hurt[1] + hit.hurt[3])) / 2);
  const m = HEROES[atk.h].moves[hit.mv];
  const rank = m.slot ? abilityRankOf(atk, m.slot) : 0;
  applyHit(G, atk, vic, hit.h, { x: atk.x, dir: atk.face, proj: false, rank, ult: m.slot === 'R', hx, hy });
  if (m.onConnect) m.onConnect(G, atk, vic, hit.h);
}

function abilityRankOf(f, slot) {
  if (slot === 'R') return f.lv >= 6 ? 2 : 1;
  return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0);
}

// ---------------------------------------------------------------------------
function startRound(G) {
  G.round++;
  G.phase = 'intro'; G.pt = INTRO_FRAMES;
  G.timer = ROUND_TIME;
  G.ents = []; G.lock = null; G.freeze = 0;
  G.rune = null; G.runeT = RUNE_FIRST;
  G.roundWinner = -1;
  G.camX = 0;
  for (const f of G.fighters) {
    const s = stats(G, f);
    f.x = (f.i === 0 ? -1 : 1) * START_X; f.y = 0; f.vx = 0; f.vy = 0; f.pv = 0;
    f.face = f.i === 0 ? 1 : -1;
    f.mhp = s.hp; f.hp = s.hp; f.mana = s.mana * MANA;
    f.cd = [0, 0, 0, 0]; f.dcd = 0; f.buffs = []; f.shield = 0; f.shieldT = 0; f.sigilUsed = false;
    f.act = 'intro'; f.af = 0; f.mv = null; f.hs = 0; f.stun = 0; f.lock = 0;
    f.combo = 0; f.cdmg = 0; f.jug = 0; f.dead = false; f.inv = 0; f.tinv = 0; f.ghost = 0;
    f.kdOnLand = false; f.reset = false; f.d = {};
    f.buf = [0, 0, 0, 0, 0, 0, 0, 0];
    const H = HEROES[f.h];
    if (H.onRoundStart) H.onRoundStart(G, f);
  }
  ev(G, 'round', { n: G.round });
}

function checkRoundEnd(G) {
  const [a, b] = G.fighters;
  const aDead = a.hp <= 0, bDead = b.hp <= 0;
  if (aDead || bDead) {
    if (aDead) a.dead = true;
    if (bDead) b.dead = true;
    G.roundWinner = aDead && bDead ? -1 : aDead ? 1 : 0;
    G.phase = 'ko'; G.pt = KO_FRAMES;
    const w = G.roundWinner >= 0 ? G.fighters[G.roundWinner] : null;
    ev(G, 'ko', { p: G.roundWinner, perfect: !!(w && w.hp === w.mhp), double: aDead && bDead });
    for (const f of G.fighters) {
      if (f.dead && !f.lock && f.act !== 'ahit' && f.act !== 'kd') {
        f.act = 'ahit'; f.af = 0; f.kdOnLand = true; f.reset = false;
        f.vx = -f.face * px(4); f.vy = px(8); if (f.y === 0) f.y = 1;
      }
    }
    return;
  }
  if (G.timer <= 0) {
    const pa = Math.floor((a.hp * 1000) / a.mhp), pb = Math.floor((b.hp * 1000) / b.mhp);
    G.roundWinner = pa > pb ? 0 : pb > pa ? 1 : -1;
    G.phase = 'ko'; G.pt = 30;
    ev(G, 'timeup', { p: G.roundWinner });
  }
}

function toEndPhase(G) {
  G.phase = 'end'; G.pt = ROUND_END_FRAMES;
  const w = G.roundWinner;
  if (w >= 0) {
    G.wins[w]++;
    const W = G.fighters[w], Lf = G.fighters[1 - w];
    gainGold(G, W, 350, 'round');
    gainGold(G, Lf, 500, 'comeback');
    gainXP(G, W, 150);
    gainXP(G, Lf, 260);
    if (G.firstBlood < 0) { G.firstBlood = w; gainGold(G, W, 200, 'firstblood'); ev(G, 'firstblood', { p: w }); }
  } else {
    for (const f of G.fighters) { gainGold(G, f, 400, 'round'); gainXP(G, f, 200); }
  }
  ev(G, 'roundwin', { p: w, wins: G.wins.slice() });
}

function poseWinner(G) {
  const w = G.roundWinner;
  if (w < 0) return;
  const f = G.fighters[w];
  if (!f.lock && !f.dead && f.y === 0) {
    f.act = 'win'; f.af = 0; f.vx = 0; f.mv = null;
    faceOpponent(f, G.fighters[1 - w]);
  }
}

function afterRound(G) {
  const need = G.cfg.roundsToWin;
  const w = G.roundWinner;
  if (w >= 0 && G.wins[w] >= need) {
    G.phase = 'over'; G.winner = w; G.pt = 0;
    ev(G, 'match', { p: w });
    return;
  }
  if (G.cfg.noShop) { startRound(G); return; }
  G.phase = 'shop'; G.pt = SHOP_FRAMES;
  for (const s of G.shop) s.ready = false;
  ev(G, 'shop', {});
}

// ---------------------------------------------------------------------------
// Shop. Navigation lives in the sim so it's deterministic over the network.
export const SHOP_COLS = 4;
function shopStep(G) {
  for (const f of G.fighters) {
    const S = G.shop[f.i];
    const pr = f.in & ~f.pin;
    if (!S.ready) {
      const n = ITEMS.length;
      if (pr & LEFT) S.cur = (S.cur + n - 1) % n;
      if (pr & RIGHT) S.cur = (S.cur + 1) % n;
      if (pr & UP) S.cur = (S.cur + n - SHOP_COLS) % n;
      if (pr & DOWN) S.cur = (S.cur + SHOP_COLS) % n;
      if (pr & (LEFT | RIGHT | UP | DOWN)) ev(G, 'shop_nav', { p: f.i, cur: S.cur });
      if (pr & B_L) shopBuy(G, f, ITEMS[S.cur].id);
      if (pr & B_M) shopSell(G, f, ITEMS[S.cur].id);
    }
    if (pr & (B_H | B_R)) { S.ready = !S.ready; ev(G, 'shop_ready', { p: f.i, ready: S.ready }); }
  }
  G.pt--;
  if (G.pt <= 0 || (G.shop[0].ready && G.shop[1].ready)) startRound(G);
}

export function shopBuy(G, f, id) {
  const it = ITEM_BY_ID[id];
  if (!it) return false;
  if (f.items.includes(id)) { ev(G, 'shop_err', { p: f.i, why: 'owned' }); return false; }
  if (f.items.length >= INVENTORY) { ev(G, 'shop_err', { p: f.i, why: 'full' }); return false; }
  if (f.gold < it.cost) { ev(G, 'shop_err', { p: f.i, why: 'gold' }); return false; }
  f.gold -= it.cost;
  f.items.push(id);
  ev(G, 'buy', { p: f.i, id });
  return true;
}
export function shopSell(G, f, id) {
  const i = f.items.indexOf(id);
  if (i < 0) return false;
  f.items.splice(i, 1);
  f.gold += ITEM_BY_ID[id].cost >> 1;
  ev(G, 'sell', { p: f.i, id });
  return true;
}

// ---------------------------------------------------------------------------
function runeStep(G) {
  if (G.cfg.noRunes || G.cfg.training) return;
  if (G.rune) {
    const R = G.rune;
    R.t--;
    const rb = [R.x - px(30), R.y - px(10), px(60), px(80)];
    for (const f of G.fighters) {
      if (f.lock || f.dead || f.act === 'kd') continue;
      const hb = hurtBoxes(G, f);
      const S = HEROES[f.h].stats;
      const body = hb.length ? hb[0] : [f.x - S.hw, f.y, S.hw * 2, S.heightS];
      if (overlap(rb, body)) { takeRune(G, f, R.k); G.rune = null; return; }
    }
    if (R.t <= 0) { ev(G, 'rune_fade', { k: R.k }); G.rune = null; }
    return;
  }
  if (--G.runeT > 0) return;
  G.runeT = RUNE_EVERY;
  const [a, b] = G.fighters;
  const mid = (a.x + b.x) >> 1;
  const k = RUNE_KINDS[rngInt(G, RUNE_KINDS.length)];
  let x = mid + rngRange(G, -px(250), px(250));
  x = clamp(x, -STAGE_HALF + px(60), STAGE_HALF - px(60));
  x = clamp(x, G.camX - SCREEN_HALF + px(40), G.camX + SCREEN_HALF - px(40));
  const y = rngInt(G, 3) === 0 ? px(150) : px(12);
  G.rune = { k, x, y, t: RUNE_LIFE };
  ev(G, 'rune_spawn', { k, x, y });
}

function takeRune(G, f, k) {
  const s = stats(G, f);
  f.st.runes++;
  switch (k) {
    case 'fury': addBuff(G, f, 'fury', RUNE_BUFF); break;
    case 'haste': addBuff(G, f, 'haste', RUNE_BUFF); break;
    case 'renewal':
      f.hp = Math.min(f.mhp, f.hp + Math.floor(f.mhp / 5));
      f.mana = Math.min(s.mana * MANA, f.mana + 50 * MANA);
      break;
    case 'insight':
      f.mana = Math.min(s.mana * MANA, f.mana + 60 * MANA);
      addBuff(G, f, 'insight', RUNE_BUFF);
      break;
    case 'fortune':
      gainGold(G, f, 250, 'rune');
      gainXP(G, f, 150);
      break;
  }
  ev(G, 'rune_take', { p: f.i, k, x: f.x, y: f.y });
}

// Compact state hash for desync detection.
export function hashState(G) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h ^= v | 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(G.frame); mix(G.rng); mix(G.timer); mix(G.ents.length);
  for (const f of G.fighters) {
    mix(f.x); mix(f.y); mix(f.vx); mix(f.vy); mix(f.hp); mix(f.mana); mix(f.af); mix(f.xp); mix(f.gold);
    mix(f.act.length * 31 + f.act.charCodeAt(0));
  }
  for (const e of G.ents) { mix(e.id); mix(e.x); mix(e.y); mix(e.hits); }
  return h >>> 0;
}
