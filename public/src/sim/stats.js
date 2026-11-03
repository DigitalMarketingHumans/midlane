// Derived stats: hero base + level + items + buffs + passives. Recomputed on demand.
import { HEROES } from './heroes/registry.js';
import { ITEM_BY_ID } from './items.js';
import { MANA, XP_TABLE, MAX_LEVEL } from './const.js';
import { ev } from './core.js';

export function stats(G, f) {
  const H = HEROES[f.h];
  const B = H.stats;
  const s = {
    hp: B.hpBase, mana: B.mana, regen: B.regen, armor: B.armor, mr: B.mr,
    phys: 0, mag: 0, dmg: 0, speed: 0, cdr: 0, steal: 0, chDmg: 0, chStun: 0,
    chip: 0, bdInv: 0, sigil: 0, blink: 0, atkSpd: 0, dr: 0, regenPct: 0,
  };
  for (const id of f.items) {
    const m = ITEM_BY_ID[id].mods;
    for (const k in m) s[k] += m[k];
  }
  s.dmg += (f.lv - 1) * 4;
  s.regenPct += (f.lv - 1) * 10;
  for (const b of f.buffs) {
    switch (b.k) {
      case 'fury': s.dmg += 30; break;
      case 'haste': s.speed += 35; break;
      case 'insight': s.cdr += 100; break;
      case 'slow': s.speed -= b.v || 35; break;
      default: {
        const bm = H.buffMods && H.buffMods[b.k];
        if (bm) bm(G, f, s, b);
      }
    }
  }
  if (H.passive && H.passive.mods) H.passive.mods(G, f, s);
  return s;
}

export function regenPerFrame(s) {
  // s.regen is mana/sec, s.regenPct a percentage bonus; returns centi-mana per frame
  return Math.floor((s.regen * MANA * (100 + s.regenPct)) / 6000);
}

export function abilityRank(f, slot) {
  if (slot === 'R') return f.lv >= MAX_LEVEL ? 2 : 1;
  return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0);
}
export const RANK_SCALE = [0, 100, 115, 130];

export function gainXP(G, f, amt) {
  if (amt <= 0 || G.cfg.training) return;
  f.xp += amt;
  while (f.lv < MAX_LEVEL && f.xp >= XP_TABLE[f.lv + 1]) {
    f.lv++;
    ev(G, 'levelup', { p: f.i, lv: f.lv });
  }
}
export function gainGold(G, f, amt, why) {
  if (amt <= 0 || G.cfg.training) return;
  f.gold += amt;
  if (why) ev(G, 'gold', { p: f.i, amt, why });
}
