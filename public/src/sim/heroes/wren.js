import { defineHero } from './registry.js';
import { spawn, ev, hasBuff, removeEnt } from '../core.js';
import { px, STAGE_HALF } from '../const.js';
import { LEFT, RIGHT } from '../input.js';

// WREN, THE THORNWARDEN — Agility trapper. A living briar whip with long reach,
// seeds that sprout into rooting snares, a vine-swing vault over projectiles and
// a colossal wooden fist that erupts beneath the foe.

const rankOf = (f) => 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0);
const rankR = (f) => (f.lv >= 6 ? 2 : 1);
const fwdBit = (f) => (f.face > 0 ? RIGHT : LEFT);
const backBit = (f) => (f.face > 0 ? LEFT : RIGHT);
const clampX = (x, m) => { const lim = STAGE_HALF - px(m); return x > lim ? lim : x < -lim ? -lim : x; };

// Canopy Vault swing heights (px) for swing frames 0..18: a quick rise, a hang at
// the top of the arc, then an easing descent before the vine is released.
const VAULT_Y = [0, 30, 57, 81, 102, 120, 135, 147, 155, 159, 160, 158, 154, 149, 143, 137, 131, 125, 120];
const VAULT_FROM = 6, VAULT_TO = VAULT_FROM + VAULT_Y.length - 2; // 6..23

function tossSeed(G, f) {
  // Keep at most two seeds/sprouts: remove the oldest.
  const mine = G.ents.filter((e) => e.o === f.i && (e.k === 'wren.seed' || e.k === 'wren.sprout'));
  mine.sort((a, b) => a.id - b.id);
  while (mine.length >= 2) removeEnt(G, mine.shift(), 'replace');
  const dir = (f.md & fwdBit(f)) ? 1 : (f.md & backBit(f)) ? -1 : 0;
  spawn(G, 'wren.seed', f.i, { x: 36, y: 118, vx: 5.2 + dir * 1.8, vy: 7, ay: 0.46, life: 90, rank: rankOf(f) });
}

// Ultimate stages, scheduled from the fist entity once it lands its launcher.
function thorn(G, e, t, last) {
  spawn(G, last ? 'wren.slam' : 'wren.thorn', e.o, { x: t.x, y: t.y + px(70), abs: true, face: e.face, life: last ? 6 : 4, rank: e.rank });
}

export default defineHero({
  id: 'wren', name: 'Wren', title: 'The Thornwarden', attr: 'agi',
  roles: ['Trapper', 'Mid-range'], diff: 3,
  blurb: 'Warden of the old hedge-roads. Her briar whip is alive, and it remembers every trespasser.',
  color: '#8dff7a', color2: '#ff8fc8',
  stats: {
    hp: 980, mana: 260, regen: 6, armor: 8, mr: 12,
    walkF: 4.2, walkB: 3.5, jumpV: 19.5, jumpX: 4.6,
    width: 58, height: 176, crouchH: 112, airH: 114,
    dash: [17, 150], bdash: [20, 120, 8],
  },
  passive: {
    name: 'Rooted Power', icon: 'root',
    desc: 'Her magic damage is increased by 25% against rooted or slowed opponents.',
    dmgBonus: (G, atk, vic, h) => (h.type === 'm' && (hasBuff(vic, 'root') || hasBuff(vic, 'slow')) ? 25 : 0),
  },
  normals: {
    stL: { name: 'Snap Kick', f: [4, 2, 8], dmg: 28, adv: [4, 1], box: [24, 70, 72, 34], push: 12 },
    stM: { name: 'Vine Lash', f: [8, 3, 15], dmg: 55, adv: [2, -3], box: [34, 104, 136, 20], push: 18 },
    stH: { name: 'Thorn Crack', f: [12, 4, 21], dmg: 90, push: 24,
      hits: [
        { at: [12, 13], box: [-14, 150, 150, 110], dmg: 84, adv: [1, -7], push: 24 },
        { at: [14, 15], box: [40, 76, 150, 120], dmg: 84, adv: [1, -7], push: 24 },
      ],
      onConnect(G, f) { f.hm = 3; } },
    crL: { name: 'Low Heel', f: [4, 2, 8], dmg: 24, adv: [3, 1], box: [24, 4, 76, 26], lvl: 'low', push: 12 },
    crM: { name: 'Root Lash', f: [9, 3, 16], dmg: 50, adv: [1, -5], box: [40, 4, 125, 22], lvl: 'low', push: 18 },
    crH: { name: 'Briar Trip', f: [11, 4, 24], dmg: 82, adv: [0, -13], box: [36, 0, 140, 26], lvl: 'low', kd: true, noSp: true, push: 20 },
    jL: { name: 'Air Knee', f: [4, 5, 5], dmg: 28, hs: 14, bs: 10, box: [10, 30, 64, 50] },
    jM: { name: 'Air Lash', f: [7, 4, 8], dmg: 52, hs: 17, bs: 13, box: [20, 24, 124, 40] },
    jH: { name: 'Falling Thorns', f: [10, 4, 10], dmg: 86, hs: 20, bs: 15,
      hits: [
        { at: [10, 11], box: [30, -30, 100, 80], dmg: 80, hs: 20, bs: 15 },
        { at: [12, 13], box: [56, -96, 104, 96], dmg: 80, hs: 20, bs: 15 },
      ],
      onConnect(G, f) { f.hm = 3; } },
    fM: { name: 'Thorn Kick', f: [17, 3, 13], dmg: 64, adv: [1, -2], lvl: 'over', box: [26, 70, 84, 96], push: 16,
      lowInv: [8, 19], vel: [[4, 16, 1.6, null]] },
  },
  abilities: {
    Q: {
      name: 'Briar Lash', icon: 'whip', cost: 30, cd: 120,
      desc: 'A full-length crack of the briar whip. Whiffs up close; the tip slows the foe for 2 seconds.',
      f: [12, 3, 22], str: 'S', type: 'm',
      hits: [
        { at: [12, 14], box: [240, 82, 82, 44], dmg: 72, type: 'm', adv: [3, -8], push: 22, effects: [{ k: 'slow', t: 120, v: 35 }] },
        { at: [12, 14], box: [140, 82, 100, 44], dmg: 72, type: 'm', adv: [2, -8], push: 22 },
      ],
      onConnect(G, f) { f.hm = 3; },
    },
    W: {
      name: 'Snare Seed', icon: 'seed', cost: 45, cd: 300,
      desc: 'Toss a seed (hold FORWARD/BACK for range) that buries itself as a hidden snare. The first foe to step on it is rooted and lashed. Two at a time.',
      f: [10, 1, 18], str: 'S',
      ev: { 10: (G, f) => tossSeed(G, f) },
    },
    E: {
      name: 'Canopy Vault', icon: 'vine', cost: 40, cd: 240,
      desc: 'Lash a vine overhead and swing forward in a high arc, passing over foes and projectiles. Attack out of the descent.',
      f: [6, 18, 2], str: 'S', airborne: true, landLag: 6, pinv: [3, 24], noGrav: [VAULT_FROM, VAULT_TO],
      vel: [[1, 5, 0, null], [VAULT_FROM, VAULT_TO, 12, null]],
      start(G, f) { f.ghost = 28; },
      tick(G, f) {
        if (f.af >= VAULT_FROM && f.af <= VAULT_TO) {
          const t = f.af - VAULT_FROM;
          f.vy = px(VAULT_Y[t + 1] - VAULT_Y[t]);
        } else if (f.af === VAULT_TO + 1) {
          // let go of the vine: free fall with an air attack available
          f.act = 'air'; f.af = 0; f.mv = null; f.airAtk = 0; f.jv = 0;
          f.vx = f.face * px(6); f.vy = -px(5);
          ev(G, 'cine', { p: f.i, k: 'vault_release', x: f.x, y: f.y });
        }
      },
    },
    R: {
      name: 'Heartwood Colossus', icon: 'tree', cost: 165, cd: 2700,
      desc: 'ULTIMATE — Wake the forest beneath the foe: a giant wooden fist erupts where they stand, launching them into a thicket of thorns. Unblockable, but it can be escaped — unless rooted.',
      f: [28, 1, 40], inv: [1, 12],
      ev: {
        12: (G, f, o) => {
          f.d.wrX = clampX(o.x, 80);
          spawn(G, 'wren.mark', f.i, { x: f.d.wrX, y: 0, abs: true, face: f.face, life: 16 });
        },
        28: (G, f) => spawn(G, 'wren.fist', f.i, { x: f.d.wrX, y: 0, abs: true, face: f.face, life: 70, rank: rankR(f) }),
      },
    },
  },
  extraMoves: {
    // channel pose held while the colossus juggles the foe (entered from the fist's onHit)
    Rhold: { f: [1, 1, 60], str: 'S' },
  },
  kinds: {
    seed: {
      box: [16, 16], ground: true,
      onGround(G, e) {
        spawn(G, 'wren.sprout', e.o, { x: clampX(e.x, 30), y: 0, abs: true, face: e.face, life: 360, rank: e.rank });
        removeEnt(G, e, 'ground');
      },
    },
    sprout: {
      anchor: 'bottom', trig: [64, 20], armAt: 20,
      trigger(G, e, t) {
        if (t.act === 'kd' || t.dead || t.inv > 0) return;
        spawn(G, 'wren.snare', e.o, { x: t.x, y: 0, abs: true, face: t.x >= e.x ? -1 : 1, life: 14, rank: e.rank });
        removeEnt(G, e, 'trigger');
      },
    },
    snare: {
      box: [96, 170], anchor: 'bottom', proj: false, activeTo: 6, persist: true,
      hit: { dmg: 40, type: 'm', lvl: 'mid', unblock: true, hs: 22, push: 0, str: 'S', effects: [{ k: 'root', t: 75 }] },
    },
    mark: { box: [160, 20], anchor: 'bottom' },
    fist: {
      box: [160, 280], anchor: 'bottom', proj: false, persist: true, activeFrom: 1, activeTo: 7, ult: true,
      hit: { dmg: 100, type: 'm', lvl: 'mid', unblock: true, launch: [0.4, 22], str: 'U', hitstop: 12 },
      pushDir: (G, e, t) => (t.x >= G.fighters[e.o].x ? 1 : -1),
      onHit(G, e, t, res) {
        if (res !== 'hit') return;
        e.d.t0 = G.frame; e.d.v = t.i;
        // Wren keeps channelling the colossus until the final slam lands
        const o = G.fighters[e.o];
        if (o.act === 'move' && o.mv === 'R') { o.mv = 'Rhold'; o.af = 0; }
      },
      update(G, e) {
        if (e.d.t0 == null) return;
        const t = G.fighters[e.d.v];
        const k = G.frame - e.d.t0;
        if (k === 24 || k === 31 || k === 38 || k === 45) thorn(G, e, t, false);
        else if (k === 54) thorn(G, e, t, true);
      },
    },
    thorn: {
      box: [130, 140], proj: false, ult: true, activeTo: 3,
      hit: { dmg: 32, type: 'm', lvl: 'mid', unblock: true, launch: [0.2, 6], jug: 0, str: 'S', hitstop: 5 },
      pushDir: (G, e, t) => (t.x >= G.fighters[e.o].x ? 1 : -1),
    },
    slam: {
      box: [150, 160], proj: false, ult: true, activeTo: 4,
      hit: { dmg: 90, type: 'm', lvl: 'mid', unblock: true, launch: [3, -16], jug: 0, str: 'H', hitstop: 14 },
      pushDir: (G, e, t) => (t.x >= G.fighters[e.o].x ? 1 : -1),
    },
  },
  ai: {
    aa: 'stH', pokes: ['stM', 'crM', 'Q'], zone: 'Q', specials: ['W', 'E'], enders: ['Q'],
    range: 185, ultRange: 600, punish: 'Q', punishRange: 300, escape: 'E',
    items: ['codex', 'boots', 'glass', 'cloak'],
  },
});
