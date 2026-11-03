// Fighter state machine: input buffering, neutral options, cancels, movement, physics.
import {
  px, GRAVITY, BUFFER, DASH_WINDOW, THROW_WINDOW, STAGE_HALF, SCREEN_HALF, MANA,
  KD_FRAMES, QUICK_RISE_FRAMES, THROW_INVULN, DISPEL_COST, DISPEL_CD, RUSH_COST, ULT_LEVEL,
  START_GOLD, PROX_GUARD, AIR_PUSH_LIFT,
} from './const.js';
import { UP, DOWN, LEFT, RIGHT, BTNS, BI } from './input.js';
import { KINDS, heroOf, moveOf } from './heroes/registry.js';
import { ev, hasBuff, clamp } from './core.js';
import { stats } from './stats.js';
import { endCombo } from './combat.js';

export function newFighter(i, heroId) {
  return {
    i, h: heroId,
    x: 0, y: 0, vx: 0, vy: 0, face: i === 0 ? 1 : -1, pv: 0, pvSrc: -1,
    hp: 1, mhp: 1, mana: 0, xp: 0, lv: 1, gold: START_GOLD, items: [],
    act: 'idle', af: 0, mv: null, conn: 0, hm: 0, md: 0, chainL: 0, armorUsed: 0,
    hs: 0, stun: 0, crouch: false, jv: 0, airAtk: 0, reset: false, kdOnLand: false, jug: 0,
    inv: 0, tinv: 0, pinv: 0, ghost: 0, rush: 0,
    combo: 0, cdmg: 0, comboBy: -1, ult: false,
    cd: [0, 0, 0, 0], dcd: 0,
    in: 0, pin: 0, buf: [0, 0, 0, 0, 0, 0, 0, 0], pa: [99, 99, 99, 99, 99, 99, 99, 99],
    tapF: 99, tapB: 99, dashReq: 0, dashReqT: 0,
    buffs: [], shield: 0, shieldT: 0, sigilUsed: false, neutralT: 0,
    dead: false, lock: 0, d: {},
    st: { dealt: 0, taken: 0, maxCombo: 0, abil: 0, runes: 0, ults: 0, throws: 0, blocks: 0, gold: 0 },
  };
}

const NEUTRAL = { idle: 1, walk: 1, crouch: 1, guard: 1 };
export const SLOT_INDEX = { Q: 0, W: 1, E: 2, R: 3 };
const SLOT_BTN = { Q: BI.Q, W: BI.W, E: BI.E, R: BI.R };

// ---------------------------------------------------------------------------
// Input
export function readInput(G, f, bits) {
  f.pin = f.in;
  f.in = bits;
  const pressed = bits & ~f.pin;
  if (f.hs === 0 && !G.freeze) {
    for (let i = 0; i < 8; i++) if (f.buf[i] > 0) f.buf[i]--;
  }
  for (let i = 0; i < 8; i++) {
    if (pressed & BTNS[i]) { f.buf[i] = BUFFER; f.pa[i] = 0; }
    else if (f.pa[i] < 99) f.pa[i]++;
  }
  const fwd = f.face > 0 ? RIGHT : LEFT, back = f.face > 0 ? LEFT : RIGHT;
  if (f.dashReqT > 0 && --f.dashReqT === 0) f.dashReq = 0;
  if ((pressed & fwd) && !(bits & DOWN)) {
    if (f.tapF <= DASH_WINDOW) { f.dashReq = 1; f.dashReqT = 5; f.tapF = 99; } else f.tapF = 0;
  } else if (f.tapF < 99) f.tapF++;
  if ((pressed & back) && !(bits & DOWN)) {
    if (f.tapB <= DASH_WINDOW) { f.dashReq = -1; f.dashReqT = 5; f.tapB = 99; } else f.tapB = 0;
  } else if (f.tapB < 99) f.tapB++;
}

export const pressed = (f, bi) => f.buf[bi] > 0;
export const consume = (f, bi) => { f.buf[bi] = 0; };
export function throwInput(f) {
  return f.pa[0] <= THROW_WINDOW && f.pa[1] <= THROW_WINDOW && (f.buf[0] > 0 || f.buf[1] > 0);
}
function fwdBit(f) { return f.face > 0 ? RIGHT : LEFT; }
function backBit(f) { return f.face > 0 ? LEFT : RIGHT; }

export function setAct(f, a) {
  if (f.act !== a) { f.act = a; f.af = 0; }
}
export function faceOpponent(f, o) {
  if (o.x > f.x) f.face = 1; else if (o.x < f.x) f.face = -1;
}

export function isAir(f) { return f.y > 0 || f.vy > 0; }

// ---------------------------------------------------------------------------
// Main per-frame update (called only during active play phases)
export function updateFighter(G, f, o) {
  if (f.lock) return;
  if (f.hs > 0) { f.hs--; return; }
  if (G.phase === 'fight' && !f.dead) decide(G, f, o);
  else if (NEUTRAL[f.act]) { f.vx = 0; if (f.act !== 'idle') setAct(f, 'idle'); }
  f.af++;
  advance(G, f, o);
  physics(G, f, o);
}

function decide(G, f, o) {
  const s = f.act;
  if (NEUTRAL[s]) return groundNeutral(G, f, o, false);
  if (s === 'air') return airNeutral(G, f, o);
  if (s === 'move') return moveCancels(G, f, o);
  if (s === 'dash' && f.af >= (f.rush ? 8 : 12)) return groundNeutral(G, f, o, true);
  if (s === 'hit' || s === 'block' || (s === 'ahit' && !f.reset && !f.dead)) return dispelCheck(G, f, o);
}

function isRooted(f) { return !!hasBuff(f, 'root'); }

function groundNeutral(G, f, o, attacksOnly) {
  if (!attacksOnly) faceOpponent(f, o);
  const H = heroOf(f);
  const inp = f.in;
  const fwd = fwdBit(f), back = backBit(f);

  if (pressed(f, BI.R) && tryAbility(G, f, o, 'R')) return;
  if (throwInput(f)) { consume(f, 0); consume(f, 1); startMove(G, f, o, 'throw'); return; }
  for (const slot of ['Q', 'W', 'E']) {
    if (pressed(f, SLOT_BTN[slot]) && tryAbility(G, f, o, slot)) return;
  }
  if (!attacksOnly && pressed(f, BI.S) && !isRooted(f)) {
    consume(f, BI.S);
    if (inp & back) startDash(G, f, -1); else startDash(G, f, 1);
    return;
  }
  if (pressed(f, BI.H)) {
    consume(f, BI.H);
    const id = (inp & DOWN) ? 'crH' : ((inp & fwd) && H.moves.fH) ? 'fH' : 'stH';
    startMove(G, f, o, id); return;
  }
  if (pressed(f, BI.M)) {
    consume(f, BI.M);
    const id = (inp & DOWN) ? 'crM' : ((inp & fwd) && H.moves.fM) ? 'fM' : 'stM';
    startMove(G, f, o, id); return;
  }
  if (pressed(f, BI.L)) {
    consume(f, BI.L);
    startMove(G, f, o, (inp & DOWN) ? 'crL' : 'stL'); return;
  }
  if (attacksOnly) return;
  if (f.dashReq && !isRooted(f)) {
    const d = f.dashReq; f.dashReq = 0; f.dashReqT = 0;
    startDash(G, f, d); return;
  }
  f.chainL = 0;
  const S = H.stats;
  const st = stats(G, f);
  const spd = 100 + st.speed;
  if (isRooted(f)) {
    f.vx = 0;
    setAct(f, (inp & DOWN) ? 'crouch' : (inp & back) ? 'guard' : 'idle');
    return;
  }
  if (inp & UP) {
    setAct(f, 'jsq');
    f.jv = (inp & fwd) ? 1 : (inp & back) ? -1 : 0;
    f.vx = 0;
    return;
  }
  if (inp & DOWN) { setAct(f, 'crouch'); f.vx = 0; return; }
  if (inp & fwd) { setAct(f, 'walk'); f.vx = f.face * Math.floor((S.walkF * spd) / 100); return; }
  if (inp & back) {
    if (threatNear(G, f, o)) { setAct(f, 'guard'); f.vx = 0; return; }
    setAct(f, 'walk'); f.vx = -f.face * Math.floor((S.walkB * spd) / 100); return;
  }
  setAct(f, 'idle'); f.vx = 0;
}

// Proximity guard: holding back while an attack is incoming plants you in a guard pose.
function threatNear(G, f, o) {
  if (o.act === 'move' && Math.abs(o.x - f.x) < PROX_GUARD) {
    const m = moveOf(o);
    if (m && m.hits.length && o.af <= m.lastActive) return true;
  }
  for (const e of G.ents) {
    if (e.o === f.i) continue;
    const K = KINDS[e.k];
    if (K && K.hit && Math.abs(e.x - f.x) < PROX_GUARD + px(60)) return true;
  }
  return false;
}

function airNeutral(G, f, o) {
  const H = heroOf(f);
  if (pressed(f, BI.R)) { if (tryAbility(G, f, o, 'R')) return; }
  for (const slot of ['Q', 'W', 'E']) {
    if (pressed(f, SLOT_BTN[slot]) && tryAbility(G, f, o, slot)) return;
  }
  if (f.airAtk) return;
  for (const [b, id] of [[BI.H, 'jH'], [BI.M, 'jM'], [BI.L, 'jL']]) {
    if (pressed(f, b) && H.moves[id]) {
      consume(f, b);
      f.airAtk = 1;
      startMove(G, f, o, id);
      return;
    }
  }
}

function moveCancels(G, f, o) {
  const m = moveOf(f);
  const H = heroOf(f);
  if (f.af <= 2 && (f.mv === 'stL' || f.mv === 'stM') && throwInput(f)) {
    consume(f, 0); consume(f, 1); startMove(G, f, o, 'throw'); return;
  }
  if (!f.conn) return;
  if (f.af > m.lastActive + 16) return;
  const isNormal = !m.slot && m.id !== 'throw';
  if (pressed(f, BI.R) && (isNormal ? !m.noSp : !!m.sc)) {
    if (tryAbility(G, f, o, 'R', true)) return;
  }
  if (isNormal && !m.noSp) {
    for (const slot of ['Q', 'W', 'E']) {
      if (pressed(f, SLOT_BTN[slot]) && tryAbility(G, f, o, slot, true)) return;
    }
    if (pressed(f, BI.S) && f.y === 0 && !isRooted(f)) {
      consume(f, BI.S);
      const infinite = G.cfg.training && G.cfg.tr && G.cfg.tr.infinite;
      if (f.mana >= RUSH_COST || infinite) {
        if (!infinite) f.mana -= RUSH_COST;
        startDash(G, f, 1, true);
        ev(G, 'rush', { p: f.i });
        return;
      }
      ev(G, 'notready', { p: f.i, s: 'S', why: 'mana' });
    }
  }
  if (isNormal && m.strN && !m.noChain) {
    for (const [b, n] of [[BI.H, 3], [BI.M, 2], [BI.L, 1]]) {
      if (!pressed(f, b)) continue;
      if (!(n > m.strN || (n === 1 && m.strN === 1 && f.chainL < 3))) continue;
      const letter = n === 3 ? 'H' : n === 2 ? 'M' : 'L';
      const id = m.air ? 'j' + letter : ((f.in & DOWN) ? 'cr' : 'st') + letter;
      if (!H.moves[id]) continue;
      consume(f, b);
      startMove(G, f, o, id);
      return;
    }
  }
}

export function tryAbility(G, f, o, slot, isCancel = false) {
  const H = heroOf(f);
  const ab = H.abilities[slot];
  consume(f, SLOT_BTN[slot]);
  if (!ab) return false;
  const air = isAir(f);
  let id = slot;
  if (ab.variant) id = ab.variant(G, f, o, air) || null;
  else if (air && !ab.air) id = null;
  else if (!air && ab.airOnly) id = null;
  if (!id) return false;
  const tr = G.cfg.training && G.cfg.tr;
  if (slot === 'R' && f.lv < ULT_LEVEL && !tr) { ev(G, 'notready', { p: f.i, s: slot, why: 'level' }); return false; }
  const si = SLOT_INDEX[slot];
  if (f.cd[si] > 0) { ev(G, 'notready', { p: f.i, s: slot, why: 'cd' }); return false; }
  const cost = H.moves[slot].cost || 0;
  if (f.mana < cost) { ev(G, 'notready', { p: f.i, s: slot, why: 'mana' }); return false; }
  if (ab.can && !ab.can(G, f, o)) { ev(G, 'notready', { p: f.i, s: slot, why: 'cond' }); return false; }
  f.mana -= cost;
  f.cd[si] = (ab.cd || 0) * 1000;
  f.st.abil++;
  ev(G, 'cast', { p: f.i, s: slot, id });
  if (slot === 'R') {
    f.st.ults++;
    G.freeze = 46; G.freezeBy = f.i;
    ev(G, 'ult', { p: f.i, id });
  }
  if (H.passive && H.passive.onCast) H.passive.onCast(G, f, slot);
  startMove(G, f, o, id);
  return true;
}

export function startMove(G, f, o, id) {
  const H = heroOf(f);
  const m = H.moves[id];
  if (!m) throw new Error(`Unknown move ${f.h}.${id}`);
  f.act = 'move'; f.mv = id; f.af = 0; f.conn = 0; f.hm = 0; f.armorUsed = 0;
  f.md = f.in; f.rush = 0;
  if (!isAir(f) && !m.keepVx) f.vx = 0;
  if (m.strN === 1 && !m.air) f.chainL++;
  if (m.start) m.start(G, f, o);
  if (!m.slot && id !== 'throw') ev(G, 'swing', { p: f.i, str: m.str, id });
  if (id === 'throw') ev(G, 'swing', { p: f.i, str: 'T', id });
}

function startDash(G, f, dir, rush = false) {
  const st = stats(G, f);
  if (dir > 0) {
    setAct(f, 'dash'); f.af = 0; f.rush = rush ? 1 : 0;
    if (st.blink && !rush) { f.inv = 12; f.ghost = 14; f.d.blink = 1; } else f.d.blink = 0;
  } else {
    setAct(f, 'bdash'); f.af = 0;
    f.inv = heroOf(f).stats.bdInv + st.bdInv;
    f.tinv = 24;
  }
  f.dashReq = 0;
  const H = heroOf(f);
  if (H.passive && H.passive.onDash) H.passive.onDash(G, f, dir, rush);
  ev(G, rush ? 'rushdash' : 'dash', { p: f.i, dir });
}

function dispelCheck(G, f, o) {
  if (!pressed(f, BI.S)) return;
  consume(f, BI.S);
  const tr = G.cfg.training && G.cfg.tr && G.cfg.tr.infinite;
  if (f.dcd > 0 || (f.mana < DISPEL_COST && !tr)) {
    ev(G, 'notready', { p: f.i, s: 'S', why: f.dcd > 0 ? 'cd' : 'mana' });
    return;
  }
  if (!tr) { f.mana -= DISPEL_COST; f.dcd = DISPEL_CD; }
  endCombo(G, f);
  f.act = 'dispel'; f.af = 0; f.inv = 28; f.tinv = 30; f.vx = 0; f.pv = 0; f.hs = 0;
  if (f.y > 0) f.vy = px(2); else f.vy = 0;
  if (Math.abs(o.x - f.x) < px(250) && !o.lock && o.act !== 'kd') {
    const dir = o.x >= f.x ? 1 : -1;
    o.act = 'ahit'; o.af = 0; o.reset = true; o.kdOnLand = false; o.hs = 0;
    o.vx = dir * px(7); o.vy = px(10); o.inv = 0;
    o.mv = null;
  }
  ev(G, 'dispel', { p: f.i, x: f.x, y: f.y });
}

// ---------------------------------------------------------------------------
function advance(G, f, o) {
  const H = heroOf(f);
  const S = H.stats;
  switch (f.act) {
    case 'jsq':
      if (f.af >= 4) {
        const st = stats(G, f);
        f.act = 'air'; f.af = 0; f.airAtk = 0;
        f.vy = S.jumpV;
        f.vx = f.jv * f.face * Math.floor((S.jumpX * (100 + Math.floor(st.speed / 2))) / 100);
        ev(G, 'jump', { p: f.i });
      }
      break;
    case 'land':
    case 'rec':
      f.vx = 0;
      if (f.af >= f.stun) toNeutral(G, f);
      break;
    case 'dash': {
      if (f.d.blink) {
        f.vx = 0;
        if (f.af === 5) { f.x += f.face * px(185); }
        if (f.af >= 16) toNeutral(G, f);
        break;
      }
      const t = S.dashT;
      const sp = 100 + stats(G, f).speed;
      const mul = f.rush ? 135 : 100;
      f.vx = f.af <= t.length ? f.face * Math.floor((t[f.af - 1] * sp * mul) / 10000) : 0;
      if (f.af >= t.length + (f.rush ? 0 : 2)) toNeutral(G, f);
      break;
    }
    case 'bdash': {
      const t = S.bdashT;
      f.vx = f.af <= t.length ? -f.face * t[f.af - 1] : 0;
      if (f.af >= t.length + 2) toNeutral(G, f);
      break;
    }
    case 'move': advanceMove(G, f, o); break;
    case 'hit':
      f.vx = 0;
      if (f.af >= f.stun) { endCombo(G, f); f.tinv = THROW_INVULN; toNeutral(G, f); }
      break;
    case 'block':
      f.vx = 0;
      if (f.af >= f.stun) { f.tinv = THROW_INVULN; toNeutral(G, f); }
      break;
    case 'kd':
      f.vx = 0;
      if (f.dead) break;
      if (f.af === 16 && (f.in & (BTNS[0] | BTNS[1] | BTNS[2]))) f.stun = QUICK_RISE_FRAMES; // quick rise
      if (f.af >= (f.stun || KD_FRAMES)) { f.stun = 0; f.inv = 2; f.tinv = THROW_INVULN + 2; ev(G, 'rise', { p: f.i }); toNeutral(G, f); }
      break;
    case 'tech':
      if (f.af >= 18) toNeutral(G, f);
      break;
    case 'dispel':
      if (f.af >= 24) { if (f.y > 0) { f.act = 'air'; f.af = 0; f.airAtk = 1; } else toNeutral(G, f); }
      break;
  }
}

export function toNeutral(G, f) {
  f.mv = null; f.conn = 0; f.rush = 0;
  if (f.y > 0) { f.act = 'air'; f.af = 0; f.airAtk = 1; return; }
  f.act = (f.in & DOWN) ? 'crouch' : 'idle';
  f.af = 0;
  f.vx = 0;
}

function advanceMove(G, f, o) {
  const m = moveOf(f);
  let covered = false, ended = false;
  for (const v of m.vel) {
    if (f.af >= v[0] && f.af <= v[1]) {
      if (v[2] !== null) { f.vx = f.face * v[2]; covered = true; }
      if (v[3] !== null) f.vy = v[3];
    } else if (f.af === v[1] + 1 && v[2] !== null) ended = true;
  }
  // A grounded move stops sliding when its last velocity window closes.
  if (ended && !covered && !isAir(f) && !m.keepVx) f.vx = 0;
  if (m.ev && m.ev[f.af]) m.ev[f.af](G, f, o);
  if (m.tick) m.tick(G, f, o);
  if (f.act !== 'move') return; // script may have changed state
  const total = m.total - (m.atkSpdAffected !== false && !m.slot ? atkSpeedCut(G, f, m) : 0);
  if (f.af >= total) {
    f.mv = null;
    if (isAir(f)) { f.act = 'air'; f.af = 0; f.airAtk = 1; }
    else toNeutral(G, f);
  }
}

function atkSpeedCut(G, f, m) {
  const s = stats(G, f).atkSpd;
  if (!s) return 0;
  return Math.floor((m.recovery * s) / 100);
}

// ---------------------------------------------------------------------------
function physics(G, f, o) {
  if (isAir(f)) {
    const m = f.act === 'move' ? moveOf(f) : null;
    const noGrav = m && m.noGrav && f.af >= m.noGrav[0] && f.af <= m.noGrav[1];
    if (!noGrav) f.vy -= GRAVITY + (f.act === 'ahit' ? f.jug * 7 : 0);
    f.x += f.vx;
    f.y += f.vy;
    if (f.y <= 0) { f.y = 0; f.vy = 0; onLand(G, f, o); }
  } else {
    f.x += f.vx;
  }
  if (f.pv) { f.x += f.pv; f.pv = Math.trunc((f.pv * 4) / 5); if (Math.abs(f.pv) < 20) f.pv = 0; }
}

function onLand(G, f, o) {
  switch (f.act) {
    case 'air':
      f.act = 'land'; f.af = 0; f.stun = 3; f.vx = 0;
      ev(G, 'land', { p: f.i });
      break;
    case 'move': {
      const m = moveOf(f);
      if (m.onLand) { m.onLand(G, f, o); break; }
      f.act = 'land'; f.af = 0; f.stun = m.landLag ?? 3; f.vx = 0; f.mv = null;
      ev(G, 'land', { p: f.i });
      break;
    }
    case 'ahit':
      f.vx = 0;
      if (f.reset && !f.dead) { f.act = 'land'; f.af = 0; f.stun = 6; f.reset = false; ev(G, 'land', { p: f.i }); }
      else {
        f.act = 'kd'; f.af = 0; f.stun = KD_FRAMES; f.reset = false;
        endCombo(G, f);
        ev(G, 'kd', { p: f.i, x: f.x });
      }
      break;
    case 'dispel':
      f.vx = 0;
      break;
    default:
      f.vx = 0;
  }
}

// ---------------------------------------------------------------------------
export function pushBox(f) {
  const S = heroOf(f).stats;
  const air = f.y > 0;
  const bottom = air ? f.y + AIR_PUSH_LIFT : 0;
  const h = air ? px(90) : (f.act === 'kd' ? px(50) : S.pushH);
  return [f.x - S.hw, bottom, S.hw * 2, h];
}

export function resolvePush(G) {
  const [a, b] = G.fighters;
  if (G.lock) { clampStage(G, a); clampStage(G, b); return; }
  if (!a.ghost && !b.ghost && !a.dead && !b.dead) {
    const pa = pushBox(a), pb = pushBox(b);
    if (pa[0] < pb[0] + pb[2] && pb[0] < pa[0] + pa[2] && pa[1] < pb[1] + pb[3] && pb[1] < pa[1] + pa[3]) {
      const ov = Math.min(pa[0] + pa[2], pb[0] + pb[2]) - Math.max(pa[0], pb[0]);
      let dir;
      if (a.x < b.x) dir = -1;
      else if (a.x > b.x) dir = 1;
      else dir = a.vx !== 0 ? (a.vx > 0 ? 1 : -1) : (a.face > 0 ? -1 : 1);
      const ha = Math.ceil(ov / 2);
      a.x += dir * ha; b.x -= dir * (ov - ha);
      // If one is pinned against a wall, the other takes the full push.
      const la = clampStage(G, a), lb = clampStage(G, b);
      if (la) b.x -= la;
      if (lb) a.x -= lb;
      clampStage(G, a); clampStage(G, b);
    }
  }
  // Screen (camera) bounds: fighters can't separate beyond the screen width.
  const c = G.camX;
  for (const f of G.fighters) {
    const S = heroOf(f).stats;
    const lo = c - SCREEN_HALF + S.hw, hi = c + SCREEN_HALF - S.hw;
    if (f.x < lo) f.x = lo; else if (f.x > hi) f.x = hi;
  }
  for (const f of G.fighters) clampStage(G, f);
  // Corner pushback transfers to the attacker.
  for (const v of G.fighters) {
    if (v.pv !== 0 && v.pvSrc >= 0 && atWall(v, v.pv)) {
      const atk = G.fighters[v.pvSrc];
      if (atk.y === 0 && !atk.lock) atk.pv = -v.pv;
      v.pv = 0; v.pvSrc = -1;
    }
  }
  const mid = Math.trunc((a.x + b.x) / 2);
  G.camX = clamp(mid, -STAGE_HALF + SCREEN_HALF, STAGE_HALF - SCREEN_HALF);
}

function atWall(f, dir) {
  const hw = heroOf(f).stats.hw;
  if (dir > 0) return f.x >= STAGE_HALF - hw;
  return f.x <= -STAGE_HALF + hw;
}

// Clamp to stage walls. Returns signed amount clamped (positive if pushed left).
export function clampStage(G, f) {
  const hw = heroOf(f).stats.hw;
  const lo = -STAGE_HALF + hw, hi = STAGE_HALF - hw;
  if (f.x < lo) { const d = f.x - lo; f.x = lo; return d; }
  if (f.x > hi) { const d = f.x - hi; f.x = hi; return d; }
  return 0;
}

// ---------------------------------------------------------------------------
export function fighterTimers(G, f) {
  const st = stats(G, f);
  // Max values may change with items.
  f.mhp = st.hp;
  const maxMana = st.mana * MANA;
  if (f.mana < maxMana) f.mana = Math.min(maxMana, f.mana + regenFor(st));
  if (f.mana > maxMana) f.mana = maxMana;
  const tick = 10 * (100 + st.cdr);
  for (let i = 0; i < 4; i++) if (f.cd[i] > 0) f.cd[i] = Math.max(0, f.cd[i] - tick);
  if (f.dcd > 0) f.dcd--;
  if (f.inv > 0) f.inv--;
  if (f.tinv > 0) f.tinv--;
  if (f.ghost > 0) f.ghost--;
  if (f.shieldT > 0 && --f.shieldT === 0) f.shield = 0;
  for (let i = f.buffs.length - 1; i >= 0; i--) {
    const b = f.buffs[i];
    if (b.k === 'burn' && b.t % 20 === 0 && f.hp > 1 && !f.dead) {
      f.hp = Math.max(1, f.hp - (b.v || 8));
    }
    if (--b.t <= 0) f.buffs.splice(i, 1);
  }
  if (st.sigil && !f.sigilUsed && f.hp > 0 && f.hp * 4 < f.mhp && !f.dead) {
    f.sigilUsed = true; f.shield = 220; f.shieldT = 240;
    ev(G, 'sigil', { p: f.i });
  }
  // Training conveniences
  if (G.cfg.training && G.cfg.tr) {
    const tr = G.cfg.tr;
    if (tr.infinite) { f.mana = maxMana; f.cd = [0, 0, 0, 0]; f.dcd = 0; }
    const neutral = NEUTRAL[f.act] || f.act === 'air';
    f.neutralT = neutral ? f.neutralT + 1 : 0;
    if (tr.refill !== false && f.neutralT === 50 && f.hp < f.mhp) { f.hp = f.mhp; ev(G, 'refill', { p: f.i }); }
    if (f.hp <= 0) f.hp = 1;
  }
}

function regenFor(st) {
  return Math.floor((st.regen * MANA * (100 + st.regenPct)) / 6000);
}
