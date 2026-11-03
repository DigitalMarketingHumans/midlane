// Hit detection and resolution, damage formula, entities, grab/cinematic locks.
import {
  px, SCALING, ULT_MIN_SCALE, COUNTER_DMG, COUNTER_HITSTUN, PUNISH_HITSTUN, CHIP_MAGIC,
  JUGGLE_MAX, KD_FRAMES, MANA, STAGE_HALF,
} from './const.js';
import { DOWN, LEFT, RIGHT } from './input.js';
import { HEROES, KINDS, heroOf, moveOf } from './heroes/registry.js';
import { ev, worldBox, overlap, addBuff, hasBuff, removeEnt, clamp } from './core.js';
import { stats, gainXP, gainGold, RANK_SCALE, abilityRank } from './stats.js';
import { throwInput } from './fighter.js';

const EMPTY = [];

export function hurtBoxes(G, f) {
  if (f.lock || f.dead || f.inv > 0) return EMPTY;
  switch (f.act) {
    case 'kd': case 'dispel': case 'tech': case 'intro': return EMPTY;
    case 'ahit': if (f.reset || f.jug >= JUGGLE_MAX) return EMPTY; break;
  }
  const m = moveOf(f);
  if (m && m.inv && f.af >= m.inv[0] && f.af <= m.inv[1]) return EMPTY;
  const S = heroOf(f).stats;
  const hw = S.hw;
  const crouch = f.act === 'crouch' || ((f.act === 'block' || f.act === 'hit') && f.crouch) || (m && m.stance === 'cr');
  let body;
  if (m && m.hurtS && f.af >= (m.hurtAt ? m.hurtAt[0] : 0) && f.af <= (m.hurtAt ? m.hurtAt[1] : 999)) body = m.hurtS;
  else if (f.y > 0 || f.act === 'ahit') body = [-hw + px(4), px(14), hw * 2 - px(8), S.airS];
  else if (crouch) body = [-hw - px(4), 0, hw * 2 + px(8), S.crouchS];
  else body = [-hw, 0, hw * 2, S.heightS];
  const out = [worldBox(body, f.x, f.y, f.face, [0, 0, 0, 0])];
  if (m && m.ext && f.af >= m.startup) {
    for (const h of m.hits) {
      if (h.grab) continue;
      const b = h.box;
      const ext = [b[0], b[1] + Math.floor(b[3] / 6), Math.floor((b[2] * 3) / 4), Math.floor((b[3] * 2) / 3)];
      out.push(worldBox(ext, f.x, f.y, f.face, [0, 0, 0, 0]));
    }
  }
  return out;
}

function lowInvuln(f) {
  const m = moveOf(f);
  return !!(m && m.lowInv && f.af >= m.lowInv[0] && f.af <= m.lowInv[1]);
}
function projInvuln(f) {
  if (f.pinv > 0) return true;
  const m = moveOf(f);
  return !!(m && m.pinv && f.af >= m.pinv[0] && f.af <= m.pinv[1]);
}

export function throwable(G, v) {
  if (v.y > 0 || v.lock || v.tinv > 0 || v.inv > 0 || v.dead) return false;
  switch (v.act) {
    case 'hit': case 'block': case 'kd': case 'jsq': case 'ahit': case 'tech': case 'dispel': case 'intro':
      return false;
  }
  const m = moveOf(v);
  if (m && (m.air || (m.inv && v.af >= m.inv[0] && v.af <= m.inv[1]))) return false;
  return true;
}

// Returns {h, i, box} for the first hit of a's current move that touches b.
export function checkFighterHit(G, a, b) {
  if (a.act !== 'move' || a.lock) return null;
  const m = moveOf(a);
  if (!m.hits.length) return null;
  let hurts = null;
  for (let i = 0; i < m.hits.length; i++) {
    const h = m.hits[i];
    if (a.af < h.from || a.af > h.to || (a.hm & (1 << i))) continue;
    const hb = worldBox(h.box, a.x, a.y, a.face, [0, 0, 0, 0]);
    if (h.grab) {
      if (!throwable(G, b)) continue;
      const S = heroOf(b).stats;
      const body = [b.x - S.hw, 0, S.hw * 2, S.heightS];
      if (overlap(hb, body)) return { h, i, box: hb, hurt: body, mv: a.mv };
      continue;
    }
    if (h.lvl === 'low' && lowInvuln(b)) continue;
    if (!hurts) hurts = hurtBoxes(G, b);
    for (const hr of hurts) if (overlap(hb, hr)) return { h, i, box: hb, hurt: hr, mv: a.mv };
  }
  return null;
}

// ---------------------------------------------------------------------------
export function calcDamage(G, atk, vic, h, o) {
  const sa = stats(G, atk), sv = stats(G, vic);
  let d = h.dmg;
  if (o.rank) d = Math.floor((d * RANK_SCALE[o.rank]) / 100);
  let mult = 100 + sa.dmg + (h.type === 'm' ? sa.mag : sa.phys);
  const HA = heroOf(atk);
  if (HA.passive && HA.passive.dmgBonus) mult += HA.passive.dmgBonus(G, atk, vic, h) | 0;
  d = Math.floor((d * mult) / 100);
  if (o.counter) d = Math.floor((d * (COUNTER_DMG + sa.chDmg)) / 100);
  if (!o.blocked) {
    let sc = SCALING[Math.min(vic.combo, SCALING.length - 1)];
    if (o.ult) sc = Math.max(sc, ULT_MIN_SCALE);
    d = Math.floor((d * sc) / 100);
  }
  const red = clamp((h.type === 'm' ? sv.mr : sv.armor) + sv.dr, -50, 75);
  d = Math.floor((d * (100 - red)) / 100);
  if (o.blocked) {
    if (h.type !== 'm' && !h.chip) return 0;
    const chip = h.chip ?? CHIP_MAGIC;
    return Math.max(0, Math.floor((d * chip * (100 + sv.chip)) / 10000));
  }
  return Math.max(1, d);
}

export function dealDamage(G, atk, vic, d, type, chip = false) {
  let dmg = d;
  if (vic.shield > 0) { const a = Math.min(vic.shield, dmg); vic.shield -= a; dmg -= a; }
  vic.hp -= dmg;
  if (G.cfg.training) { if (vic.hp < 1) vic.hp = 1; }
  if (chip && vic.hp < 1 && type !== 'm') vic.hp = 1;
  atk.st.dealt += d; vic.st.taken += d;
  gainXP(G, atk, d);
  gainXP(G, vic, d >> 1);
  const g = Math.floor((d * 55) / 100);
  gainGold(G, atk, g); atk.st.gold += g;
  atk.mana += d * 12;
  vic.mana += d * 20;
  if (type === 'p') {
    const sa = stats(G, atk);
    if (sa.steal) atk.hp = Math.min(atk.mhp, atk.hp + Math.floor((d * sa.steal) / 100));
  }
  const HV = heroOf(vic);
  if (HV.passive && HV.passive.onTaken) HV.passive.onTaken(G, vic, atk, d, type);
}

export function canBlock(G, v, h, srcX) {
  if (v.y > 0 || v.lock) return false;
  const ok = v.act === 'idle' || v.act === 'walk' || v.act === 'crouch' || v.act === 'guard' || v.act === 'block';
  if (!ok) return false;
  const tr = G.cfg.training && G.cfg.tr;
  if (tr && v.i === 1 && tr.block && tr.block !== 'none' && v.act !== 'walk') {
    if (tr.block === 'all' || (tr.block === 'after' && (v.d.trHit || 0) > 0)) {
      if (h.lvl === 'low') v.in |= DOWN; else if (h.lvl === 'over') v.in &= ~DOWN;
      return true;
    }
  }
  const away = srcX > v.x ? LEFT : srcX < v.x ? RIGHT : (v.face > 0 ? LEFT : RIGHT);
  if (!(v.in & away)) return false;
  const crouching = !!(v.in & DOWN);
  if (h.lvl === 'low' && !crouching) return false;
  if (h.lvl === 'over' && crouching) return false;
  return true;
}

function armorAbsorb(G, v, h) {
  if (h.grab || h.unblock && h.lock) return false;
  if (v.act === 'move') {
    const m = moveOf(v);
    if (m.armor && v.af >= m.armor[0] && v.af <= m.armor[1] && v.armorUsed < (m.armor[2] || 1)) {
      v.armorUsed++;
      return true;
    }
  }
  const b = hasBuff(v, 'armor');
  if (b && b.v > 0 && (v.act === 'idle' || v.act === 'walk' || v.act === 'crouch' || v.act === 'guard' || v.act === 'move' || v.act === 'dash')) {
    b.v--;
    return true;
  }
  return false;
}

// src: { x (block-direction source), dir (push dir), ent, proj, rank, ult, hx, hy }
export function applyHit(G, atk, vic, h, src) {
  if (h.grab) {
    startLock(G, atk, vic, h.lock, { throw: !!h.throw });
    return 'grab';
  }
  const blocked = !h.unblock && canBlock(G, vic, h, src.x);
  const dir = src.dir;
  const hx = src.hx ?? vic.x, hy = src.hy ?? vic.y + px(110);
  if (blocked) {
    vic.act = 'block'; vic.af = 0; vic.stun = h.bs; vic.crouch = !!(vic.in & DOWN); vic.vx = 0;
    vic.pv = dir * Math.floor((h.push * 6) / 25); vic.pvSrc = src.proj ? -1 : atk.i;
    const chip = calcDamage(G, atk, vic, h, { blocked: true, rank: src.rank });
    if (chip > 0) dealDamage(G, atk, vic, chip, h.type, true);
    vic.mana += 4 * MANA; atk.mana += 2 * MANA;
    gainXP(G, vic, 4); gainXP(G, atk, 3);
    const hsF = Math.max(4, h.hitstop - 2);
    vic.hs = hsF;
    if (!src.proj) { atk.hs = hsF; atk.conn = 2; } else if (src.ent) src.ent.hs = hsF;
    vic.st.blocks++;
    if (G.cfg.training) vic.d.trHit = 90;
    ev(G, 'block', { p: atk.i, v: vic.i, x: hx, y: hy, str: h.str, d: chip, type: h.type, proj: !!src.proj });
    const HA = heroOf(atk);
    if (HA.passive && HA.passive.onBlocked) HA.passive.onBlocked(G, atk, vic, h);
    return 'block';
  }
  if (armorAbsorb(G, vic, h)) {
    const d = calcDamage(G, atk, vic, h, { rank: src.rank, ult: src.ult });
    dealDamage(G, atk, vic, d, h.type);
    const hsF = Math.max(6, h.hitstop);
    vic.hs = hsF;
    if (!src.proj) { atk.hs = hsF; atk.conn = 1; } else if (src.ent) src.ent.hs = hsF;
    ev(G, 'armor', { p: atk.i, v: vic.i, x: hx, y: hy, d });
    checkKO(G, atk, vic, dir);
    return 'armor';
  }
  let counter = 0;
  if (vic.act === 'move') {
    const vm = moveOf(vic);
    counter = vic.af <= vm.lastActive ? 1 : 2;
  } else if (vic.act === 'rec' || (vic.act === 'land' && vic.stun > 3)) counter = 2;
  const ult = !!(src.ult || h.str === 'U');
  const d = calcDamage(G, atk, vic, h, { counter, rank: src.rank, ult });
  dealDamage(G, atk, vic, d, h.type);
  const sa = stats(G, atk);
  vic.combo++; vic.cdmg += d; vic.comboBy = atk.i;
  if (vic.combo > atk.st.maxCombo) atk.st.maxCombo = vic.combo;
  if (G.cfg.training) vic.d.trHit = 90;
  ev(G, 'hit', { p: atk.i, v: vic.i, x: hx, y: hy, str: h.str, d, ch: counter, type: h.type, combo: vic.combo, proj: !!src.proj, k: src.ent ? src.ent.k : null });

  if (h.lock && !vic.dead) {
    vic.mv = null;
    if (vic.hp <= 0 && !G.cfg.training) vic.dead = true;
    startLock(G, atk, vic, h.lock, {});
    return 'lock';
  }
  vic.mv = null; vic.conn = 0;
  const wasJuggle = vic.act === 'ahit' && vic.kdOnLand;
  const air = vic.y > 0 || vic.act === 'ahit';
  if (h.launch || h.kd || air) {
    vic.act = 'ahit'; vic.af = 0;
    if (h.launch) {
      vic.vx = dir * h.launch[0]; vic.vy = h.launch[1]; vic.kdOnLand = true; vic.reset = false;
    } else if (h.kd && !air) {
      vic.vx = dir * px(2); vic.vy = px(5); vic.kdOnLand = true; vic.reset = false;
    } else if (wasJuggle || h.kd) {
      vic.vx = dir * px(2); vic.vy = px(6); vic.kdOnLand = true; vic.reset = false;
    } else {
      vic.vx = dir * px(3); vic.vy = px(5); vic.reset = true; vic.kdOnLand = false;
    }
    vic.jug += h.jug;
    if (vic.y === 0) vic.y = 1;
  } else {
    let stun = h.hs + (counter === 1 ? COUNTER_HITSTUN : counter === 2 ? PUNISH_HITSTUN : 0) + (counter ? sa.chStun : 0);
    stun -= Math.floor(vic.combo / 5);
    if (stun < 6) stun = 6;
    vic.act = 'hit'; vic.af = 0; vic.stun = stun; vic.vx = 0;
    vic.crouch = !!(vic.in & DOWN);
    vic.pv = dir * Math.floor(h.push / 5); vic.pvSrc = src.proj ? -1 : atk.i;
  }
  const hsF = h.hitstop + (counter ? 3 : 0);
  vic.hs = hsF;
  if (!src.proj) { atk.hs = hsF; atk.conn = 1; } else if (src.ent) src.ent.hs = Math.min(hsF, 6);
  if (h.effects) for (const e of h.effects) addBuff(G, vic, e.k, e.t, e.v || 0);
  const HA = heroOf(atk);
  if (HA.passive && HA.passive.onHit) HA.passive.onHit(G, atk, vic, h, d, src);
  checkKO(G, atk, vic, dir);
  return 'hit';
}

function checkKO(G, atk, vic, dir) {
  if (vic.hp > 0 || G.cfg.training || vic.dead) return;
  vic.dead = true;
  vic.act = 'ahit'; vic.af = 0; vic.reset = false; vic.kdOnLand = true;
  vic.vx = dir * px(5); vic.vy = px(10); if (vic.y === 0) vic.y = 1;
  vic.hs = 28; atk.hs = Math.max(atk.hs, 28);
}

export function endCombo(G, f) {
  if (f.combo > 0 && f.comboBy >= 0) {
    ev(G, 'combo_end', { p: f.comboBy, v: f.i, hits: f.combo, dmg: f.cdmg });
    if (f.combo >= 5) gainGold(G, G.fighters[f.comboBy], (f.combo - 4) * 12, 'combo');
  }
  f.combo = 0; f.cdmg = 0; f.jug = 0; f.kdOnLand = false;
}

// ---------------------------------------------------------------------------
// Entities
function entBox(e, rel) {
  return worldBox(rel, e.x, e.y, e.face, [0, 0, 0, 0]);
}
function bodyBox(f) {
  const S = heroOf(f).stats;
  const h = f.y > 0 ? S.airS : S.heightS;
  return [f.x - S.hw, f.y, S.hw * 2, h];
}

export function updateEnts(G) {
  for (const e of G.ents.slice()) {
    if (G.ents.indexOf(e) < 0) continue;
    if (e.hs > 0) { e.hs--; continue; }
    const K = KINDS[e.k];
    e.age++;
    if (K.follow) {
      const o = G.fighters[e.o];
      e.x = o.x + o.face * px(K.follow[0]); e.y = o.y + px(K.follow[1]); e.face = o.face;
    } else {
      e.vy -= e.ay; e.x += e.vx; e.y += e.vy;
    }
    if (e.icd > 0) e.icd--;
    if (K.update) K.update(G, e);
    if (G.ents.indexOf(e) < 0) continue;
    if (K.ground && e.y <= 0) {
      e.y = 0;
      if (K.onGround) K.onGround(G, e); else { removeEnt(G, e, 'ground'); continue; }
    }
    if (e.age >= e.life || e.x < -STAGE_HALF - px(200) || e.x > STAGE_HALF + px(200)) removeEnt(G, e, 'expire');
  }
}

export function entityHits(G) {
  for (const e of G.ents.slice()) {
    if (G.ents.indexOf(e) < 0 || e.hs > 0) continue;
    const K = KINDS[e.k];
    const target = G.fighters[1 - e.o];
    if (target.lock || target.dead) continue;
    if (K.trigS && K.trigger && (!K.armAt || e.age >= K.armAt)) {
      if (overlap(entBox(e, K.trigS), bodyBox(target)) && (K.trigAir || target.y <= px(60))) {
        K.trigger(G, e, target);
        if (G.ents.indexOf(e) < 0) continue;
      }
    }
    if (K.zone && K.boxS) {
      if (overlap(entBox(e, K.boxS), bodyBox(target))) K.zone(G, e, target);
    }
    if (!K.hit || e.hits <= 0 || e.icd > 0) continue;
    if (K.activeFrom && e.age < K.activeFrom) continue;
    if (K.activeTo && e.age > K.activeTo) continue;
    if (K.proj !== false && projInvuln(target)) continue;
    const hurts = hurtBoxes(G, target);
    if (!hurts.length) continue;
    const eb = entBox(e, K.boxS);
    let hr = null;
    for (const b of hurts) if (overlap(eb, b)) { hr = b; break; }
    if (!hr) continue;
    if (K.hit.lvl === 'low' && lowInvuln(target)) continue;
    const owner = G.fighters[e.o];
    const srcX = K.srcOwner ? owner.x : e.x - (e.vx > 0 ? px(30) : e.vx < 0 ? -px(30) : 0);
    const dir = K.pushDir ? K.pushDir(G, e, target) : (e.vx > 0 ? 1 : e.vx < 0 ? -1 : (target.x >= e.x ? 1 : -1));
    const hx = Math.trunc((Math.max(eb[0], hr[0]) + Math.min(eb[0] + eb[2], hr[0] + hr[2])) / 2);
    const hy = Math.trunc((Math.max(eb[1], hr[1]) + Math.min(eb[1] + eb[3], hr[1] + hr[3])) / 2);
    const res = applyHit(G, owner, target, K.hit, { x: srcX, dir, ent: e, proj: true, rank: e.rank, ult: K.ult, hx, hy });
    e.hits--; e.icd = K.interval || 0;
    if (K.onHit) K.onHit(G, e, target, res);
    if (e.hits <= 0 && !K.persist && G.ents.indexOf(e) >= 0) removeEnt(G, e, 'hit');
  }
  // Projectile clashes
  const cl = G.ents.filter((e) => KINDS[e.k].clash && e.hits > 0);
  for (let i = 0; i < cl.length; i++) {
    for (let j = i + 1; j < cl.length; j++) {
      const a = cl[i], b = cl[j];
      if (a.o === b.o || a.hits <= 0 || b.hits <= 0) continue;
      const Ka = KINDS[a.k], Kb = KINDS[b.k];
      if (!overlap(entBox(a, Ka.boxS), entBox(b, Kb.boxS))) continue;
      const pa = Ka.clash, pb = Kb.clash;
      ev(G, 'clash', { x: (a.x + b.x) >> 1, y: (a.y + b.y) >> 1 });
      a.hits -= pb; b.hits -= pa;
      if (a.hits <= 0) removeEnt(G, a, 'clash');
      if (b.hits <= 0) removeEnt(G, b, 'clash');
    }
  }
}

// ---------------------------------------------------------------------------
// Locks: throws, command grabs, cinematic ultimates.
export function startLock(G, atk, vic, lockId, opts) {
  const L = HEROES[atk.h].locks[lockId];
  if (!L) throw new Error(`missing lock ${atk.h}.${lockId}`);
  if (opts.throw) {
    const back = atk.face > 0 ? LEFT : RIGHT;
    if (atk.in & back) atk.face = -atk.face;
    atk.st.throws++;
  }
  G.lock = { id: lockId, h: atk.h, a: atk.i, v: vic.i, af: 0, ox: atk.x, oy: atk.y, face: atk.face, hs: 0, thr: opts.throw ? 1 : 0 };
  for (const f of [atk, vic]) { f.vx = 0; f.vy = 0; f.pv = 0; f.hs = 0; f.af = 0; }
  atk.lock = 1; vic.lock = 2; atk.act = 'lock'; vic.act = 'held'; vic.mv = null;
  vic.face = -atk.face;
  ev(G, 'lock', { p: atk.i, v: vic.i, id: lockId, h: atk.h, thr: G.lock.thr });
}

export function keyLerp(keys, t) {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (t <= k1[0]) {
      const k0 = keys[i - 1];
      const u = (t - k0[0]) / (k1[0] - k0[0]);
      return [k0[1] + (k1[1] - k0[1]) * u, k0[2] + (k1[2] - k0[2]) * u];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2]];
}

export function updateLock(G) {
  const K = G.lock;
  if (!K) return;
  const atk = G.fighters[K.a], vic = G.fighters[K.v];
  const L = HEROES[K.h].locks[K.id];
  if (K.hs > 0) { K.hs--; return; }
  K.af++; atk.af = K.af; vic.af = K.af;
  if (L.tech && K.af <= L.tech && throwInput(vic) && !vic.dead) {
    G.lock = null; atk.lock = 0; vic.lock = 0;
    atk.act = 'tech'; vic.act = 'tech'; atk.af = 0; vic.af = 0;
    atk.pv = -K.face * px(7); vic.pv = K.face * px(7);
    vic.buf[0] = 0; vic.buf[1] = 0;
    ev(G, 'tech', { p: atk.i, v: vic.i, x: (atk.x + vic.x) >> 1 });
    return;
  }
  if (L.apos) {
    const p = keyLerp(L.apos, K.af);
    atk.x = K.ox + K.face * Math.round(p[0] * 100); atk.y = Math.max(0, K.oy + Math.round(p[1] * 100));
  }
  const v = keyLerp(L.vpos, K.af);
  vic.x = atk.x + K.face * Math.round(v[0] * 100);
  vic.y = Math.max(0, atk.y + Math.round(v[1] * 100));
  // keep the pair on stage
  const hwA = heroOf(atk).stats.hw, hwV = heroOf(vic).stats.hw;
  const lo = -STAGE_HALF, hi = STAGE_HALF;
  let shift = 0;
  if (vic.x - hwV < lo) shift = lo - (vic.x - hwV);
  else if (vic.x + hwV > hi) shift = hi - (vic.x + hwV);
  if (atk.x - hwA + shift < lo) shift = lo - (atk.x - hwA);
  else if (atk.x + hwA + shift > hi) shift = hi - (atk.x + hwA);
  if (shift) { atk.x += shift; vic.x += shift; K.ox += shift; }
  for (const h of L.hits) {
    if (h.at !== K.af) continue;
    const ult = h.str === 'U' || !!L.ult;
    const rank = L.ult ? abilityRank(atk, 'R') : (L.slot ? abilityRank(atk, L.slot) : 0);
    const d = calcDamage(G, atk, vic, h, { ult, rank });
    dealDamage(G, atk, vic, d, h.type);
    vic.combo++; vic.cdmg += d; vic.comboBy = atk.i;
    if (vic.combo > atk.st.maxCombo) atk.st.maxCombo = vic.combo;
    if (vic.hp <= 0 && !G.cfg.training) vic.dead = true;
    ev(G, 'hit', { p: atk.i, v: vic.i, x: vic.x, y: vic.y + px(100), str: h.str, d, ch: 0, type: h.type, combo: vic.combo, lock: 1, fx: h.fx || null });
    K.hs = h.hitstop ?? 5;
  }
  if (L.ev && L.ev[K.af]) L.ev[K.af](G, atk, vic, K);
  if (K.af >= L.dur) releaseLock(G);
}

export function releaseLock(G) {
  const K = G.lock;
  const atk = G.fighters[K.a], vic = G.fighters[K.v];
  const L = HEROES[K.h].locks[K.id];
  G.lock = null; atk.lock = 0; vic.lock = 0;
  vic.act = 'ahit'; vic.af = 0; vic.reset = false; vic.kdOnLand = true;
  vic.jug = L.jugAfter ?? JUGGLE_MAX;
  vic.vx = K.face * Math.round(L.rel[0] * 100); vic.vy = Math.round(L.rel[1] * 100);
  if (vic.y === 0) {
    if (vic.vy > 0) vic.y = 1;
    else { vic.act = 'kd'; vic.stun = KD_FRAMES; vic.vx = 0; endCombo(G, vic); ev(G, 'kd', { p: vic.i, x: vic.x }); }
  }
  atk.mv = null;
  if (atk.y > 0) { atk.act = 'air'; atk.af = 0; atk.airAtk = 1; }
  else { atk.act = 'rec'; atk.af = 0; atk.stun = L.recov ?? 12; }
  ev(G, 'release', { p: atk.i, v: vic.i, id: K.id });
}
