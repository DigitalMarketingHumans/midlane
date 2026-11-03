import { defineHero } from './registry.js';
import { spawn, ev, addBuff, removeEnt } from '../core.js';
import { px, STAGE_HALF } from '../const.js';
import { UP, LEFT, RIGHT } from '../input.js';

// ORREN, THE STARWRIGHT — Intelligence zoner. Directional star bolts, a gravity
// well that drags and slows, a short invulnerable phase-step and a screen-long
// supernova beam. His passive shaves time off his other spells on every cast.

const rankOf = (f) => 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0);
const rankR = (f) => (f.lv >= 6 ? 2 : 1);
const backBit = (f) => (f.face > 0 ? LEFT : RIGHT);
const BOLT_LIFE = 80;
// Supernova Lance channel window (move frames). Blocked hits take longer (block
// hitstop), so the channel is long; landing the final hit skips ahead to the fade.
const LANCE_FROM = 17, LANCE_TO = 66, LANCE_FADE = 62;

function faceToward(f, o) {
  if (o.x > f.x) f.face = 1; else if (o.x < f.x) f.face = -1;
}

// Phase Step: blink `dist` px forward (or back) and re-face the opponent.
function phase(G, f, o, dist) {
  f.x += f.face * px(dist);
  const lim = STAGE_HALF - px(40);
  if (f.x > lim) f.x = lim; else if (f.x < -lim) f.x = -lim;
  f.ghost = 4;
  faceToward(f, o);
  ev(G, 'cine', { p: f.i, k: 'phase_in', x: f.x, y: f.y });
}

const boltHit = { dmg: 64, type: 'm', lvl: 'mid', hs: 18, bs: 14, push: 22, str: 'S' };

export default defineHero({
  id: 'orren', name: 'Orren', title: 'The Starwright', attr: 'int',
  roles: ['Zoner', 'Control'], diff: 3,
  blurb: 'A hooded cartographer of the night sky who learned to pull the stars down by their names.',
  color: '#9fe8ff', color2: '#ff7ae0',
  stats: {
    hp: 930, mana: 320, regen: 7.5, armor: 6, mr: 18,
    walkF: 3.1, walkB: 3.0, jumpV: 18, jumpX: 3.8,
    width: 60, height: 186, crouchH: 120, airH: 118,
    dash: [22, 130], bdash: [24, 130, 8],
  },
  passive: {
    name: 'Arcane Flow', icon: 'orbit',
    desc: 'Every ability cast shortens the current cooldowns of his other basic abilities by 1 second.',
    onCast(G, f, slot) {
      const si = { Q: 0, W: 1, E: 2, R: 3 }[slot];
      for (let i = 0; i < 3; i++) {
        if (i === si || f.cd[i] <= 0) continue;
        f.cd[i] = Math.max(0, f.cd[i] - 60000);
      }
    },
  },
  normals: {
    stL: { name: 'Palm Strike', f: [5, 2, 8], dmg: 28, adv: [3, 0], box: [22, 108, 74, 32], push: 12 },
    stM: { name: 'Staff Thrust', f: [8, 3, 14], dmg: 52, adv: [2, -3], box: [40, 96, 112, 28], push: 20 },
    stH: { name: 'Starfall Arc', f: [12, 5, 20], dmg: 86, adv: [1, -6], push: 24,
      hits: [
        { at: [12, 13], box: [-20, 150, 120, 120], dmg: 86, adv: [1, -6], push: 24 },
        { at: [14, 16], box: [20, 96, 124, 150], dmg: 86, adv: [1, -6], push: 24 },
      ],
      onConnect(G, f) { f.hm = 3; } },
    crL: { name: 'Staff Tap', f: [5, 2, 8], dmg: 24, adv: [3, 1], box: [24, 4, 76, 26], lvl: 'low', push: 12 },
    crM: { name: 'Low Staff Poke', f: [8, 3, 15], dmg: 46, adv: [1, -4], box: [40, 6, 106, 26], lvl: 'low', push: 18 },
    crH: { name: 'Orbit Sweep', f: [10, 4, 24], dmg: 78, adv: [0, -12], box: [30, 0, 126, 30], lvl: 'low', kd: true, noSp: true, push: 20 },
    jL: { name: 'Air Palm', f: [5, 5, 5], dmg: 28, hs: 14, bs: 10, box: [14, 40, 66, 44] },
    jM: { name: 'Air Staff Sweep', f: [7, 5, 7], dmg: 50, hs: 17, bs: 13, box: [20, 8, 104, 62] },
    jH: { name: 'Meteor Spike', f: [10, 5, 9], dmg: 82, hs: 20, bs: 15, box: [4, -48, 92, 104] },
    fH: { name: 'Comet Palm', f: [16, 4, 18], dmg: 80, type: 'm', adv: [3, -3], box: [30, 70, 92, 84], push: 34, str: 'H' },
  },
  abilities: {
    Q: {
      name: 'Star Bolt', icon: 'star', cost: 28, cd: 72,
      desc: 'Fling a star. Hold UP to send it rising at an angle (anti-air); in the air it streaks downward. Magic damage.',
      f: [12, 1, 23], str: 'S',
      variant: (G, f, o, air) => (air ? 'Qair' : (f.in & UP) ? 'Qup' : 'Q'),
      ev: { 12: (G, f) => spawn(G, 'orren.bolt', f.i, { x: 66, y: 118, vx: 9, life: BOLT_LIFE, rank: rankOf(f) }) },
      variants: {
        Qup: {
          f: [12, 1, 23],
          ev: { 12: (G, f) => spawn(G, 'orren.bolt', f.i, { x: 56, y: 150, vx: 7.4, vy: 5.2, life: 60, rank: rankOf(f), d: { up: 1 } }) },
        },
        Qair: {
          f: [10, 1, 16], stance: 'air', noGrav: [1, 16], landLag: 6,
          vel: [[1, 16, 0.6, 0]],
          ev: { 10: (G, f) => spawn(G, 'orren.bolt', f.i, { x: 48, y: 62, vx: 7.4, vy: -5.2, life: 60, rank: rankOf(f), d: { dn: 1 } }) },
        },
      },
    },
    W: {
      name: 'Gravity Well', icon: 'vortex', cost: 70, cd: 480,
      desc: 'Open a singularity in front of you for 3 seconds. Foes inside are dragged toward its heart, slowed, and take pulsing magic damage.',
      f: [16, 1, 24], str: 'S',
      ev: {
        16: (G, f) => {
          for (const e of G.ents.slice()) if (e.o === f.i && e.k === 'orren.well') removeEnt(G, e, 'replace');
          let x = f.x + f.face * px(260);
          const lim = STAGE_HALF - px(70);
          if (x > lim) x = lim; else if (x < -lim) x = -lim;
          spawn(G, 'orren.well', f.i, { x, y: px(96), abs: true, life: 180, hits: 0, rank: rankOf(f) });
        },
      },
    },
    E: {
      name: 'Phase Step', icon: 'phase', cost: 45, cd: 240,
      desc: 'Fold space and reappear a short distance forward (or back, holding BACK). Invulnerable while unseen; can pass through the foe.',
      f: [8, 1, 12], inv: [1, 10], str: 'S',
      variant: (G, f, o, air) => (air ? null : (f.in & backBit(f)) ? 'Eb' : 'E'),
      ev: { 8: (G, f, o) => phase(G, f, o, 230) },
      variants: {
        Eb: { f: [8, 1, 12], inv: [1, 10], ev: { 8: (G, f, o) => phase(G, f, o, -230) } },
      },
    },
    R: {
      name: 'Supernova Lance', icon: 'beam', cost: 160, cd: 2700,
      desc: 'ULTIMATE — Channel a newborn star through the staff: a screen-long lance that strikes 12 times, chips hard on block and launches on the final hit.',
      f: [LANCE_FROM, LANCE_TO - LANCE_FROM + 1, 16], inv: [1, 16],
      ev: { [LANCE_FROM]: (G, f) => spawn(G, 'orren.lance', f.i, { x: 0, y: 0, life: 200, hits: 12, rank: rankR(f) }) },
    },
  },
  kinds: {
    bolt: {
      box: [44, 44], clash: 1, proj: true, ground: true,
      hit: boltHit,
    },
    // Gravity well: no hit of its own (so it doesn't trigger proximity guard),
    // drags + slows every frame and emits a damaging pulse every 30 frames.
    well: {
      box: [170, 180],
      zone(G, e, t) {
        if (t.act === 'kd' || t.dead) return;
        const dx = e.x - t.x;
        const step = Math.min(Math.abs(dx), 110);
        if (step > 0) t.x += dx > 0 ? step : -step;
        addBuff(G, t, 'slow', 24, 35);
      },
      update(G, e) {
        if (e.age % 30 === 20) spawn(G, 'orren.pulse', e.o, { x: e.x, y: e.y, abs: true, face: e.face, life: 2, rank: e.rank });
      },
    },
    pulse: {
      box: [170, 180], proj: false,
      hit: { dmg: 12, type: 'm', lvl: 'mid', hs: 12, bs: 10, push: 0, str: 'L', hitstop: 4 },
      pushDir: (G, e, t) => (t.x >= e.x ? -1 : 1),
    },
    lance: {
      box: [900, 100], follow: [520, 122], srcOwner: true, ult: true, persist: true, interval: 3,
      hit: { dmg: 28, type: 'm', lvl: 'mid', hs: 16, bs: 14, push: 4, str: 'S', hitstop: 1, chip: 30, jug: 0 },
      pushDir: (G, e) => e.face,
      update: lanceUpdate,
      onHit(G, e) { if (e.hits === 1) e.k = 'orren.lanceEnd'; },
    },
    lanceEnd: {
      box: [900, 100], follow: [520, 122], srcOwner: true, ult: true, persist: true, interval: 3,
      hit: { dmg: 64, type: 'm', lvl: 'mid', hs: 30, bs: 18, push: 24, str: 'U', hitstop: 14, chip: 30, launch: [5, 14] },
      pushDir: (G, e) => e.face,
      update: lanceUpdate,
      onHit(G, e) {
        const o = G.fighters[e.o];
        if (o.act === 'move' && o.mv === 'R' && o.af < LANCE_FADE) o.af = LANCE_FADE;
      },
    },
  },
  ai: {
    aa: 'Q:U', aa2: 'stH', escape: 'E:B', pokes: ['stM', 'crM'], zone: 'Q', specials: ['W', 'E'], enders: ['Q'],
    range: 260, ultRange: 520, punish: 'Q', punishRange: 150,
    items: ['codex', 'prism', 'glass', 'cloak'],
  },
});

// The lance lives only while Orren channels it.
function lanceUpdate(G, e) {
  const o = G.fighters[e.o];
  if (o.act !== 'move' || o.mv !== 'R' || o.af > LANCE_TO) removeEnt(G, e, 'end');
}
