import { defineHero } from './registry.js';
import { spawn, ev, addBuff } from '../core.js';
import { px } from '../const.js';
import { LEFT, RIGHT } from '../input.js';

// KAIDA, THE FROSTBORN — Strength berserker. Slow, far-reaching greataxe normals,
// a creeping ice wave, a leaping slam that raises spikes, a blood-price frenzy and
// a marching line of ice pillars. Hits harder the more she bleeds.

function rank(f) { return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0); }
const fwdBit = (f) => (f.face > 0 ? RIGHT : LEFT);
const backBit = (f) => (f.face > 0 ? LEFT : RIGHT);

// ---------------------------------------------------------------------------
// Frostquake: six pillars at PX(i) px in front of Kaida, one every `every` frames.
// The first pillar that connects starts lock `quake<i>`; inside the lock the
// remaining pillars carry the foe forward, the last one (the spire) entombs them
// and Kaida leaps in to shatter it.
export const QUAKE = { n: 6, x0: 56, gap: 70, start: 14, every: 6, lt: 8 };
const PX = (i) => QUAKE.x0 + QUAKE.gap * i;

function quakeLock(k) {
  const LT = QUAKE.lt;
  const T5 = (5 - k) * LT;                 // lock frame the spire entombs the foe
  const leap0 = T5 + 6, chop = T5 + 26, dur = T5 + 44;
  const D = PX(5);
  // [t, atkX, atkY, vicX, vicY] world px from lock origin (forward-relative)
  const K = [[0, 0, 0, PX(k), 34]];
  for (let j = k + 1; j <= 5; j++) {
    const t = (j - k) * LT, y = 30 + 14 * (j - k);
    K.push([t - LT / 2, 0, 0, (PX(j - 1) + PX(j)) / 2, y + 44]);
    K.push([t, 0, 0, PX(j), j === 5 ? 40 : y]);
  }
  K.push([T5 + 4, 0, 0, D, 40]);
  K.push([leap0, 0, 0, D, 40]);
  K.push([leap0 + 9, Math.round((D - 96) * 0.48), 170, D, 40]);
  K.push([chop - 4, D - 96, 120, D, 40]);
  K.push([chop, D - 96, 0, D, 36]);
  K.push([dur, D - 96, 0, D, 36]);
  const apos = K.map(([t, ax, ay]) => [t, ax, ay]);
  const vpos = K.map(([t, ax, ay, vx, vy]) => [t, vx - ax, vy - ay]);
  const hits = [];
  const evs = {};
  for (let j = k + 1; j <= 5; j++) {
    const t = (j - k) * LT;
    hits.push({ at: t, dmg: 36, type: 'm', str: 'H', hitstop: 4 });
    evs[t - 2] = (G, a, v, L) => {
      for (const e of G.ents) if (e.o === a.i && e.d && e.d.i === j) return;
      spawn(G, 'kaida.pillarFx', a.i, { abs: true, x: L.ox + L.face * px(PX(j)), y: 0, face: L.face, life: 60, d: { i: j } });
    };
  }
  hits.push({ at: T5 + 2, dmg: 20, type: 'm', str: 'S', hitstop: 8 });
  hits.push({ at: chop, dmg: 240, type: 'p', str: 'U', hitstop: 18, fx: 'kd_shatter' });
  const enc = evs[T5 + 2];
  evs[T5 + 2] = (G, a, v, L) => { if (enc) enc(G, a, v, L); ev(G, 'cine', { p: a.i, k: 'kd_encase', x: v.x, y: v.y }); };
  evs[leap0] = (G, a) => ev(G, 'cine', { p: a.i, k: 'kd_leap', x: a.x });
  evs[chop] = (G, a, v) => ev(G, 'cine', { p: a.i, k: 'kd_shatter', x: v.x, y: v.y });
  return { dur, ult: true, apos, vpos, hits, ev: evs, rel: [2.5, 7], recov: 20, meta: { k, T5, leap0, chop, dur } };
}

function pillarKind(i) {
  return {
    box: [96, 236], anchor: 'bottom', proj: false, ult: true, srcOwner: true, pushDir: (G, e) => e.face,
    activeFrom: 2, activeTo: 7,
    hit: { dmg: 36, type: 'm', lvl: 'mid', str: 'H', chip: 40, hs: 18, bs: 10, push: 14, launch: [1.5, 10], jug: 0, lock: 'quake' + i },
  };
}

// Glacier Leap: arcing jump of `dist` px; descending axe is an overhead and the
// landing raises an ice-spike burst.
function leap(dist) {
  const air = 32;
  return {
    f: [8, 32, 20], type: 'p',
    vel: [[8, 8, Math.round((dist * 10) / air) / 10, 14.5]],
    hits: [{ at: [27, 40], box: [10, -46, 112, 150], dmg: 70, lvl: 'over', hs: 18, bs: 10, push: 10, str: 'H' }],
    onLand(G, f) {
      spawn(G, 'kaida.spikes', f.i, { x: 46, y: 0, life: 26, rank: rank(f) });
      ev(G, 'cine', { p: f.i, k: 'kd_slam', x: f.x + f.face * px(46) });
      f.act = 'land'; f.af = 0; f.stun = 18; f.vx = 0; f.mv = null;
      ev(G, 'land', { p: f.i });
    },
  };
}

export default defineHero({
  id: 'kaida', name: 'Kaida', title: 'The Frostborn', attr: 'str',
  roles: ['Berserker', 'Bruiser'], diff: 2,
  blurb: 'Raised on the glacier\'s edge, she fights hardest with frost in her veins and blood on the snow.',
  color: '#7fe0ff', color2: '#e4f8ff',
  stats: {
    hp: 1040, mana: 190, regen: 5, armor: 10, mr: 6,
    walkF: 3.6, walkB: 3.0, jumpV: 18.5, jumpX: 4.0,
    width: 66, height: 190, crouchH: 122, airH: 120,
    dash: [20, 140], bdash: [22, 115, 6],
  },
  passive: {
    name: 'Frostblood', icon: 'drop',
    desc: 'Deals more damage the more she is hurt: +0% at full health, rising to +25% at 25% health or lower.',
    dmgBonus(G, atk) {
      const miss = atk.mhp - atk.hp;
      if (miss <= 0 || atk.mhp <= 0) return 0;
      return Math.min(25, Math.floor((miss * 33) / atk.mhp));
    },
  },
  normals: {
    stL: { name: 'Haft Jab', f: [5, 2, 9], dmg: 30, adv: [3, 0], box: [28, 112, 76, 30], push: 12 },
    stM: { name: 'Wide Swing', f: [8, 3, 15], dmg: 56, adv: [2, -2], box: [30, 72, 124, 62], push: 20 },
    stH: { name: 'Avalanche', f: [13, 4, 22], dmg: 88, adv: [2, -7], box: [30, 40, 124, 132], push: 34 },
    crL: { name: 'Shin Kick', f: [5, 2, 9], dmg: 26, adv: [2, 0], box: [24, 4, 84, 26], lvl: 'low', push: 12 },
    crM: { name: 'Haft Sweep', f: [9, 3, 16], dmg: 48, adv: [1, -4], box: [32, 4, 108, 30], lvl: 'low', push: 18 },
    // Launcher instead of a sweep: anti-air and juggle starter.
    crH: { name: 'Frostrise', f: [11, 4, 24], dmg: 70, adv: [0, -11], box: [22, 50, 100, 150], launch: [1, 10], push: 16 },
    jL: { name: 'Pommel Drop', f: [5, 5, 5], dmg: 32, hs: 14, bs: 10, box: [14, 28, 72, 48] },
    jM: { name: 'Gale Cut', f: [7, 5, 7], dmg: 56, hs: 17, bs: 13, box: [14, 2, 98, 66] },
    jH: { name: 'Icefall Chop', f: [10, 5, 9], dmg: 86, hs: 20, bs: 16, box: [6, -44, 118, 108] },
    fH: {
      name: 'Glacier Splitter', f: [22, 3, 18], dmg: 90, adv: [4, -6], lvl: 'over', box: [34, 36, 120, 146], push: 22,
      armor: [8, 22, 1],
    },
  },
  abilities: {
    Q: {
      name: 'Rime Cleave', icon: 'wave', cost: 50, cd: 200, type: 'm',
      desc: 'A sweeping cleave that sends a creeping wave of ice along the ground (~260px). Slows the foe on hit.',
      f: [15, 2, 24],
      ev: { 15: (G, f) => spawn(G, 'kaida.wave', f.i, { x: 70, y: 0, vx: 7, life: 38, rank: rank(f) }) },
    },
    W: Object.assign({
      name: 'Glacier Leap', icon: 'leap', cost: 60, cd: 300,
      desc: 'Leap ~240px (hold forward to go further, back to go shorter) and crash down axe-first: an overhead, then a burst of ice spikes that launches.',
      variant(G, f, o, air) {
        if (air) return null;
        if (f.in & fwdBit(f)) return 'Wf';
        if (f.in & backBit(f)) return 'Wb';
        return 'W';
      },
      variants: { Wf: leap(330), Wb: leap(150) },
    }, leap(240)),
    E: {
      name: 'Berserk Frenzy', icon: 'frenzy', cost: 30, cd: 720,
      desc: 'Pay 6% of current health with a war-roar. For 5 seconds normals recover 25% faster and deal +15% damage.',
      f: [16, 1, 8],
      start(G, f) { f.hp = Math.max(1, f.hp - Math.floor((f.hp * 6) / 100)); },
      ev: { 12: (G, f) => { addBuff(G, f, 'frenzy', 300); ev(G, 'cine', { p: f.i, k: 'kd_roar', x: f.x }); } },
    },
    R: {
      name: 'Frostquake', icon: 'quake', cost: 160, cd: 2700, inv: [1, 14],
      desc: 'ULTIMATE — Slam the earth: six ice pillars erupt in a marching line. The first to catch the foe carries them down the line into a glacier spire that Kaida shatters.',
      f: [14, 31, 22], type: 'm',
      ev: (() => {
        const o = { [QUAKE.start - 1]: (G, f) => ev(G, 'cine', { p: f.i, k: 'kd_quake', x: f.x }) };
        for (let i = 0; i < QUAKE.n; i++) {
          o[QUAKE.start + QUAKE.every * i] = (G, f) => spawn(G, 'kaida.pillar' + i, f.i, { x: PX(i), y: 0, life: 46, rank: f.lv >= 6 ? 2 : 1, d: { i } });
        }
        return o;
      })(),
    },
  },
  kinds: Object.assign({
    wave: {
      box: [76, 84], anchor: 'bottom', clash: 1, proj: true,
      hit: { dmg: 60, type: 'm', lvl: 'mid', hs: 20, bs: 15, push: 24, str: 'S', effects: [{ k: 'slow', t: 90, v: 35 }] },
    },
    spikes: {
      box: [220, 132], anchor: 'bottom', proj: false, srcOwner: true, pushDir: (G, e) => e.face,
      activeFrom: 2, activeTo: 7,
      hit: { dmg: 50, type: 'm', lvl: 'mid', launch: [2, 10], hs: 18, bs: 6, push: 18, str: 'S' },
    },
    pillarFx: { box: [96, 236], anchor: 'bottom' },
  }, Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => ['pillar' + i, pillarKind(i)]))),
  locks: Object.assign({
    throw: {
      dur: 40, tech: 10,
      vpos: [[0, 60, 0], [10, 52, 6], [16, 48, 0], [26, 70, 44], [32, 86, 20], [40, 96, 0]],
      hits: [{ at: 16, dmg: 38, str: 'M', hitstop: 6 }, { at: 32, dmg: 88, str: 'H', hitstop: 12 }],
      rel: [4, -1], recov: 16,
    },
  }, Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => ['quake' + k, quakeLock(k)]))),
  buffMods: {
    frenzy(G, f, s) { s.atkSpd += 25; s.dmg += 15; },
  },
  ai: {
    aa: 'crH', pokes: ['stM', 'crM'], zone: 'Q', specials: ['W', 'E'], enders: ['Q', 'W'],
    range: 155, punish: 'Q', ultRange: 380, items: ['vgem', 'wraps', 'fang', 'sigil'],
  },
});
