// CPU opponent. Produces input bits from the game state (it never mutates state).
// Hero data can supply hints in `H.ai` to make the AI play to the hero's strengths.
import { UP, DOWN, LEFT, RIGHT, B_L, B_M, B_H, B_Q, B_W, B_E, B_R, B_S } from './input.js';
import { HEROES, KINDS } from './heroes/registry.js';
import { ITEMS, ITEM_BY_ID } from './items.js';
import { ULT_LEVEL, MANA, DISPEL_COST } from './const.js';
import { SHOP_COLS } from './game.js';

export const AI_LEVELS = [
  { name: 'Easy',   react: 28, block: 0.25, aa: 0.12, combo: 0.35, aggr: 0.3,  dispel: 0.0, punish: 0.15, ability: 0.25, tech: 0.05 },
  { name: 'Normal', react: 19, block: 0.55, aa: 0.4,  combo: 0.7,  aggr: 0.45, dispel: 0.25, punish: 0.4, ability: 0.5,  tech: 0.25 },
  { name: 'Hard',   react: 13, block: 0.8,  aa: 0.7,  combo: 0.92, aggr: 0.55, dispel: 0.6, punish: 0.75, ability: 0.75, tech: 0.5 },
  { name: 'Legend', react: 9,  block: 0.92, aa: 0.88, combo: 1.0,  aggr: 0.62, dispel: 0.85, punish: 0.92, ability: 0.9, tech: 0.75 },
];

const SLOT_BIT = { Q: B_Q, W: B_W, E: B_E, R: B_R };
const SLOT_I = { Q: 0, W: 1, E: 2, R: 3 };
const NORMAL_BIT = { L: B_L, M: B_M, H: B_H };

export class AI {
  constructor(idx, level = 1, seed = 0x9e3779b9) {
    this.i = idx;
    this.L = AI_LEVELS[Math.max(0, Math.min(3, level))];
    this.s = seed >>> 0 || 1;
    this.plan = 'neutral';
    this.planT = 0;
    this.lastBtn = 0;
    this.opMv = null; this.opAge = 0;
    this.comboStep = 0;
    this.dirHold = 0;
    this.shopTarget = -1;
    this.shopDone = false;
    this.lastPhase = '';
  }
  r() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; }

  think(G) {
    const me = G.fighters[this.i], op = G.fighters[1 - this.i];
    if (G.phase !== this.lastPhase) { this.lastPhase = G.phase; this.shopDone = false; this.shopTarget = -1; this.plan = 'neutral'; this.planT = 0; }
    let out = 0;
    if (G.phase === 'shop') out = this.shop(G, me);
    else if (G.phase === 'fight') out = this.fight(G, me, op);
    // Buttons must be released between presses for edge detection.
    const btns = out & ~(UP | DOWN | LEFT | RIGHT);
    if (btns & this.lastBtn) out &= ~(btns & this.lastBtn);
    this.lastBtn = out & ~(UP | DOWN | LEFT | RIGHT);
    return out;
  }

  // -------------------------------------------------------------------------
  shop(G, me) {
    const S = G.shop[this.i];
    if (S.ready || this.shopDone) return 0;
    if (this.shopTarget < 0) {
      const H = HEROES[me.h];
      const pri = (H.ai && H.ai.items) || ['vgem', 'wraps', 'codex', 'glass', 'fang', 'vest', 'mark', 'sigil'];
      const want = pri.find((id) => !me.items.includes(id) && ITEM_BY_ID[id].cost <= me.gold && me.items.length < 4);
      if (!want) { this.shopDone = true; return B_H; }
      this.shopTarget = ITEM_BY_ID[want].idx;
      this.shopWait = 0;
    }
    if (++this.shopWait % 3 !== 0) return 0;
    if (S.cur === this.shopTarget) { this.shopTarget = -1; return B_L; }
    const n = ITEMS.length;
    const fwdSteps = (this.shopTarget - S.cur + n) % n;
    if (fwdSteps >= SHOP_COLS && fwdSteps <= n - SHOP_COLS) return DOWN;
    return fwdSteps <= n / 2 ? RIGHT : LEFT;
  }

  // -------------------------------------------------------------------------
  fight(G, me, op) {
    const L = this.L;
    const H = HEROES[me.h];
    const hint = H.ai || {};
    const fwd = me.face > 0 ? RIGHT : LEFT, back = me.face > 0 ? LEFT : RIGHT;
    const awayFromOp = op.x > me.x ? LEFT : RIGHT;
    const dist = Math.abs(op.x - me.x) / 100;
    // opponent move age (reaction modelling)
    if (op.act === 'move' && op.mv === this.opMv && op.af >= (this.opAgePrevAf || 0)) this.opAge++;
    else { this.opMv = op.act === 'move' ? op.mv : null; this.opAge = 0; }
    this.opAgePrevAf = op.af;

    // In hitstun: dispel out of long combos
    if ((me.act === 'hit' || me.act === 'ahit' || me.act === 'block') && me.dcd === 0 && me.mana >= DISPEL_COST + 20 * MANA) {
      const bad = me.act === 'block' ? (op.act === 'move' && this.r() < 0.01 * L.dispel) : (me.combo >= 4 && this.r() < 0.08 * L.dispel);
      if (bad) return B_S;
    }
    // Throw tech
    if (me.act === 'held' && G.lock && G.lock.thr && G.lock.af > 2 && this.r() < L.tech * 0.25) return B_L | B_M;

    // Combo continuation when our attack connects
    if (me.act === 'move' && me.conn) return this.comboFollow(G, me, op, H, hint, fwd);
    if (me.act === 'move' || me.act === 'lock' || me.act === 'held') return 0;

    const neutral = me.act === 'idle' || me.act === 'walk' || me.act === 'crouch' || me.act === 'guard' || me.act === 'block' || me.act === 'air' || me.act === 'land' || me.act === 'dash';
    if (!neutral) return 0;
    const air = me.y > 0;

    // Defense: incoming strike
    const threat = this.strikeThreat(G, me, op, dist);
    if (threat && !air) {
      if (this.opAge >= L.react || threat.proj) {
        if (this.blockRoll === undefined || this.blockRollFor !== op.mv + op.af - this.opAge) {
          this.blockRollFor = op.mv + (op.af - this.opAge); this.blockRoll = this.r();
        }
        if (this.blockRoll < L.block) {
          if (threat.proj && hint.vsProj && this.r() < 0.02) return this.ability(G, me, hint.vsProj) || (awayFromOp | DOWN);
          return awayFromOp | (threat.lvl === 'over' ? 0 : threat.lvl === 'low' || threat.lvl === 'mid' ? DOWN : 0);
        }
      }
    }
    // Anti-air
    if (!air && op.y > 0 && dist < 230 && op.vy < 600 && ((op.x - me.x) * op.vx < 0 || dist < 120)) {
      if (this.aaRollFor !== op.af - (op.act === 'air' ? op.af : 0) + G.round * 1000 + Math.floor(G.frame / 60)) {
        this.aaRollFor = op.af - (op.act === 'air' ? op.af : 0) + G.round * 1000 + Math.floor(G.frame / 60);
        this.aaRoll = this.r();
      }
      if (this.aaRoll < L.aa && op.y < 26000) {
        const aa = hint.aa || 'stH';
        const b = this.ability(G, me, aa);
        if (b) return b;
        const nrm = SLOT_BIT[aa[0]] && (aa.length === 1 || aa[1] === ':') ? (hint.aa2 || 'stH') : aa;
        return nrm.startsWith('cr') ? DOWN | NORMAL_BIT[nrm[2]] : NORMAL_BIT[nrm[nrm.length - 1]] || B_H;
      }
    }
    // Whiff punish
    if (!air && op.act === 'move' && dist < (hint.punishRange || 175)) {
      const om = HEROES[op.h].moves[op.mv];
      if (om && op.af > om.lastActive && om.total - op.af > 8 && this.r() < L.punish * 0.4) {
        const b = this.ability(G, me, hint.punish || 'E') || (dist < 140 ? B_H : 0);
        if (b) return b | (dist < 140 ? 0 : fwd);
      }
    }
    if (op.act === 'land' && dist < 150 && this.r() < L.punish * 0.3) return DOWN | B_M;
    if (op.act === 'kd' || op.act === 'tech' || op.act === 'dispel') return dist > 160 ? fwd : (this.r() < 0.4 ? DOWN : 0);

    if (air) {
      if (me.act === 'air' && !me.airAtk && dist < 170 && me.vy < 300 && this.r() < 0.35) return this.r() < 0.6 ? B_H : B_M;
      return 0;
    }

    // Ultimate when it can land
    if (me.lv >= ULT_LEVEL && me.cd[3] === 0) {
      const R = H.abilities.R;
      if (R && me.mana >= H.moves.R.cost && dist < (hint.ultRange || 150) && (op.act === 'move' || op.act === 'land' || this.r() < 0.004)) return B_R;
    }

    // Rune hunting
    if (G.rune && this.r() < 0.9) {
      const rd = Math.abs(G.rune.x - me.x) / 100;
      const od = Math.abs(G.rune.x - op.x) / 100;
      if (rd < od + 60 && rd > 20) {
        if (G.rune.y > 5000 && rd < 90) return UP | (G.rune.x > me.x ? RIGHT : LEFT);
        return G.rune.x > me.x ? RIGHT : LEFT;
      }
    }

    // Neutral planning
    if (--this.planT <= 0) this.choosePlan(G, me, op, dist, hint);
    const pref = hint.range || 150;
    switch (this.plan) {
      case 'approach':
        if (dist < pref) { this.planT = 0; break; }
        return fwd;
      case 'dash':
        this.plan = 'approach'; this.planT = 20;
        return dist > 180 ? B_S : fwd;
      case 'retreat':
        return back;
      case 'wait':
        return awayFromOp | (this.r() < 0.7 ? DOWN : 0);
      case 'jump':
        this.plan = 'neutral'; this.planT = 30;
        return UP | fwd;
      case 'poke': {
        this.plan = 'neutral'; this.planT = 8 + Math.floor(this.r() * 20);
        const pokes = hint.pokes || ['crM', 'stM', 'crL'];
        const p = pokes[Math.floor(this.r() * pokes.length)];
        const ab = this.ability(G, me, p);
        if (ab) return ab;
        return (p.startsWith('cr') ? DOWN : p.startsWith('f') ? fwd : 0) | NORMAL_BIT[p[p.length - 1]];
      }
      case 'throw':
        if (dist > 95) return fwd;
        this.plan = 'neutral'; this.planT = 20;
        return B_L | B_M;
      case 'zone': {
        this.plan = 'neutral'; this.planT = 30;
        const z = hint.zone || 'Q';
        return this.ability(G, me, z) || back;
      }
      case 'escape': {
        this.plan = 'retreat'; this.planT = 20;
        return this.ability(G, me, hint.escape) || B_S | back;
      }
      case 'special': {
        this.plan = 'neutral'; this.planT = 30;
        const sp = hint.specials || ['E'];
        return this.ability(G, me, sp[Math.floor(this.r() * sp.length)]) || 0;
      }
    }
    return 0;
  }

  choosePlan(G, me, op, dist, hint) {
    const L = this.L;
    const pref = hint.range || 150;
    const x = this.r();
    this.planT = 10 + Math.floor(this.r() * 30);
    if (pref >= 200) {
      // Zoners: keep the opponent at arm's length and fill the screen with projectiles.
      if (dist < 130) {
        if (x < 0.3) { this.plan = 'throw'; return; }
        if (x < 0.55) { this.plan = 'poke'; return; }
        if (x < 0.75 && hint.escape) { this.plan = 'escape'; this.planT = 5; return; }
        this.plan = 'retreat'; this.planT = 18; return;
      }
      if (dist < pref - 50) { this.plan = x < 0.45 ? 'retreat' : x < 0.75 ? 'zone' : 'poke'; this.planT = 14; return; }
      if (dist < pref + 160) { this.plan = x < 0.55 + L.ability * 0.25 ? 'zone' : x < 0.85 ? 'wait' : 'special'; return; }
      this.plan = x < 0.5 ? 'zone' : 'approach';
      return;
    }
    if (dist > pref + 220) {
      if (hint.zone && x < L.ability * 0.5) { this.plan = 'zone'; return; }
      this.plan = x < 0.75 ? 'approach' : 'dash';
      return;
    }
    if (dist > pref + 40) {
      if (hint.zone && x < L.ability * 0.35) { this.plan = 'zone'; return; }
      if (x < L.aggr) { this.plan = this.r() < 0.18 ? 'jump' : this.r() < 0.3 ? 'dash' : 'approach'; return; }
      this.plan = x < L.aggr + 0.2 ? 'wait' : 'approach';
      return;
    }
    if (dist < 100 && x < 0.25) { this.plan = 'throw'; return; }
    if (x < L.aggr) { this.plan = 'poke'; return; }
    if (x < L.aggr + L.ability * 0.25) { this.plan = 'special'; return; }
    if (x < 0.85) { this.plan = 'wait'; this.planT = 12; return; }
    this.plan = 'retreat'; this.planT = 15;
  }

  strikeThreat(G, me, op, dist) {
    if (op.act === 'move') {
      const m = HEROES[op.h].moves[op.mv];
      if (m && m.hits.length && op.af <= m.lastActive) {
        let reach = 0, lvl = 'mid';
        for (const h of m.hits) { reach = Math.max(reach, (h.box[0] + h.box[2]) / 100); if (h.lvl !== 'mid') lvl = h.lvl; if (h.grab) return null; }
        const v = m.vel.reduce((a, s) => Math.max(a, Math.abs(s[2] || 0) * (s[1] - s[0] + 1)), 0) / 100;
        if (dist < reach + v + 70) return { lvl: op.y > 0 ? 'mid' : lvl };
      }
    }
    for (const e of G.ents) {
      if (e.o === me.i) continue;
      const K = KINDS[e.k];
      if (!K || !K.hit) continue;
      const dx = me.x - e.x;
      const approaching = e.vx === 0 || Math.sign(e.vx) === Math.sign(dx);
      if (approaching && Math.abs(dx) < 34000 && Math.abs(e.y - me.y) < 20000) return { lvl: K.hit.lvl || 'mid', proj: true };
    }
    return null;
  }

  // Returns ability button bits if slot usable now, else 0.
  ability(G, me, slotSpec) {
    // 'Q:U' / 'Q:D' / 'Q:F' / 'Q:B' = hold a direction while casting.
    let slot = slotSpec, dir = 0;
    if (slotSpec && slotSpec.length > 2 && slotSpec[1] === ':') {
      slot = slotSpec[0];
      const d = slotSpec[2];
      dir = d === 'U' ? UP : d === 'D' ? DOWN : d === 'F' ? (me.face > 0 ? RIGHT : LEFT) : d === 'B' ? (me.face > 0 ? LEFT : RIGHT) : 0;
    }
    if (!SLOT_BIT[slot]) return 0;
    const H = HEROES[me.h];
    const ab = H.abilities[slot];
    if (!ab) return 0;
    if (slot === 'R' && me.lv < ULT_LEVEL) return 0;
    if (me.cd[SLOT_I[slot]] > 0) return 0;
    if (me.mana < (H.moves[slot].cost || 0)) return 0;
    if (this.r() > this.L.ability + 0.15) return 0;
    return SLOT_BIT[slot] | (dir || ab.aiDir || 0);
  }

  comboFollow(G, me, op, H, hint, fwd) {
    const m = H.moves[me.mv];
    if (!m) return 0;
    if (me.conn !== 1) {
      // blocked: sometimes continue pressure with a safe chain
      if (!m.slot && m.strN === 1 && this.r() < 0.3) return B_L;
      return 0;
    }
    if (this.comboRollFor !== me.mv + G.frame - me.af) { this.comboRollFor = me.mv + G.frame - me.af; this.comboRoll = this.r(); }
    if (this.comboRoll > this.L.combo) return 0;
    if (me.af < m.lastActive) return 0;
    if (m.slot) {
      if (m.sc && me.lv >= ULT_LEVEL && me.cd[3] === 0 && me.mana >= H.moves.R.cost) return B_R;
      return 0;
    }
    if (m.strN === 1 && !m.air) return this.r() < 0.5 ? B_L | (me.in & DOWN) : B_M | (this.r() < 0.5 ? DOWN : 0);
    if (m.strN === 2 && !m.air) return B_H | (this.r() < 0.4 ? DOWN : 0);
    if (m.air) return m.strN < 3 ? B_H : 0;
    // heavy → special ender
    const enders = hint.enders || ['Q', 'E', 'W'];
    for (const s of enders) {
      const b = this.ability(G, me, s);
      if (b) return b;
    }
    return 0;
  }
}
