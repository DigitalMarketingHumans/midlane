import { defineHero } from './registry.js';
import { spawn, ev, addBuff } from '../core.js';

// BRAKKA, THE IRON BASTION — Strength grappler. Slow, enormous normals with
// armoured startup, a low ground shockwave, a buff that turns him into a wall,
// and the throws that make standing next to him a mistake.
export default defineHero({
  id: 'brakka', name: 'Brakka', title: 'The Iron Bastion', attr: 'str',
  roles: ['Grappler', 'Tank'], diff: 2,
  blurb: 'A siege-forge given a will. The furnace in his chest was lit to hold one gate; the gate fell, and he never stopped holding.',
  color: '#ff8a2a', color2: '#ffd3a1',
  stats: {
    hp: 1220, mana: 180, regen: 4.5, armor: 18, mr: 6,
    walkF: 2.7, walkB: 2.4, jumpV: 17.5, jumpX: 3.6,
    width: 86, height: 220, crouchH: 140, airH: 140,
    dash: [22, 120], bdash: [24, 100, 5],
  },
  passive: {
    name: 'Bastion Plating', icon: 'shield',
    desc: 'Standing Heavy and Iron Maul shrug off one hit during startup. Takes 30% less chip damage.',
    mods: (G, f, s) => { s.chip -= 30; },
  },
  normals: {
    stL: { name: 'Rivet Jab', f: [5, 2, 9], dmg: 36, adv: [3, 0], box: [30, 118, 80, 34], push: 14 },
    stM: { name: 'Boiler Hook', f: [9, 3, 16], dmg: 64, adv: [2, -3], box: [34, 92, 108, 58], push: 20 },
    stH: { name: 'Rampart Breaker', f: [14, 4, 22], dmg: 110, adv: [2, -6], armor: [4, 14, 1], box: [36, 68, 126, 100], push: 28 },
    crL: { name: 'Knuckle Drag', f: [5, 2, 9], dmg: 30, adv: [2, 0], box: [28, 4, 84, 30], lvl: 'low', push: 12 },
    crM: { name: 'Shin Crusher', f: [9, 3, 17], dmg: 58, adv: [1, -4], box: [32, 4, 112, 32], lvl: 'low', push: 18 },
    crH: { name: 'Fault Line', f: [12, 4, 26], dmg: 92, adv: [0, -14], box: [34, 0, 124, 34], lvl: 'low', kd: true, noSp: true, push: 22 },
    jL: { name: 'Iron Knee', f: [5, 6, 4], dmg: 36, hs: 14, bs: 10, box: [16, 22, 72, 56] },
    jM: { name: 'Anvil Heel', f: [7, 5, 6], dmg: 62, hs: 17, bs: 13, box: [26, 2, 84, 72] },
    jH: { name: 'Siege Drop', f: [10, 6, 8], dmg: 98, hs: 21, bs: 16, box: [14, 30, 108, 92] },
    fH: { name: 'Iron Maul', f: [20, 4, 20], dmg: 92, adv: [2, -4], lvl: 'over', armor: [5, 19, 1], box: [34, 46, 112, 132], push: 20 },
  },
  abilities: {
    Q: {
      name: 'Seismic Stomp', icon: 'quake', cost: 50, cd: 240,
      desc: 'Stomp the earth and send a shockwave rolling along the ground. Hits low and knocks down — jump it or crouch-block it.',
      f: [14, 1, 24], str: 'S',
      ev: { 14: (G, f) => spawn(G, 'brakka.shockwave', f.i, { x: 64, y: 0, vx: 8, life: 40, rank: rank(f) }) },
    },
    W: {
      name: 'Bastion Stance', icon: 'furnace', cost: 60, cd: 600,
      desc: 'Stoke the furnace: for 3 seconds take 25% less damage and shrug off the next 2 hits without flinching.',
      f: [6, 1, 12],
      ev: { 6: (G, f) => { addBuff(G, f, 'bastion', 180); addBuff(G, f, 'armor', 180, 2); ev(G, 'cine', { p: f.i, k: 'bastion' }); } },
    },
    E: {
      name: 'Siege Grab', icon: 'grab', cost: 55, cd: 270,
      desc: 'Lurch forward and seize the foe by the throat, then slam them into the ground. Unblockable and cannot be teched.',
      f: [9, 3, 32], vel: [[1, 7, 6, null], [8, 8, 0, null]],
      hits: [{ at: [9, 11], box: [0, 20, 92, 150], grab: true, lock: 'siege', str: 'T', dmg: 0 }],
    },
    R: {
      name: 'Colossus Slam', icon: 'anvil', cost: 150, cd: 2400,
      desc: 'ULTIMATE — Seize the foe, leap sky-high, and drive them head-first into the earth. Unblockable.',
      f: [8, 4, 40], inv: [1, 10],
      hits: [{ at: [8, 11], box: [0, 10, 140, 170], grab: true, lock: 'colossus', str: 'U', dmg: 0 }],
    },
  },
  kinds: {
    shockwave: {
      box: [70, 50], anchor: 'bottom', clash: 1, proj: true,
      hit: { dmg: 80, type: 'm', lvl: 'low', kd: true, hs: 20, bs: 18, push: 24, str: 'S' },
    },
  },
  buffMods: {
    bastion(G, f, s) { s.dr += 25; },
  },
  locks: {
    // Lift overhead and slam down in front. Techable.
    throw: {
      dur: 42, tech: 10,
      vpos: [[0, 64, 0], [10, 44, 40], [18, 8, 140], [24, 0, 146], [30, 56, 110], [34, 104, 0], [42, 104, 0]],
      hits: [{ at: 34, dmg: 140, str: 'H', hitstop: 12, fx: 'slam' }],
      ev: { 12: (G, a) => ev(G, 'cine', { p: a.i, k: 'throw_lift' }) },
      rel: [2, 0], recov: 18,
    },
    // Command grab: one-handed choke-lift, a blast from the furnace, chokeslam.
    siege: {
      dur: 58, tech: 0, slot: 'E',
      vpos: [[0, 62, 0], [6, 70, 20], [16, 84, 92], [30, 86, 98], [36, 84, 124], [40, 100, 0], [58, 100, 0]],
      hits: [
        { at: 26, dmg: 30, type: 'm', str: 'M', hitstop: 5, fx: 'furnace' },
        { at: 40, dmg: 140, str: 'H', hitstop: 13, fx: 'slam' },
      ],
      ev: { 24: (G, a) => ev(G, 'cine', { p: a.i, k: 'siege_vent' }) },
      rel: [2, 0], recov: 16,
    },
    // Ultimate: leap ~5 m into the sky, windmill the foe, piledrive into a crater.
    colossus: {
      dur: 146, ult: true,
      apos: [[0, 0, 0], [12, 0, 0], [16, 4, 100], [22, 10, 250], [30, 16, 380], [38, 20, 455], [46, 22, 490], [56, 22, 502],
        [80, 22, 496], [86, 24, 470], [92, 28, 380], [98, 34, 220], [103, 37, 80], [106, 38, 0], [146, 38, 0]],
      // Windmill (56-80): the victim orbits Brakka's hip pivot at arm's length while he somersaults.
      vpos: [[0, 72, 0], [12, 24, 100], [16, 12, 108], [52, 12, 112], [56, 12, 128], [59, 90, 88], [62, 115, 3], [65, 73, -75], [68, -12, -100],
        [71, -90, -58], [74, -115, 27], [77, -73, 105], [80, 12, 130], [88, 58, -60], [106, 60, -100], [146, 60, -100]],
      hits: [
        { at: 68, dmg: 50, str: 'H', hitstop: 6, fx: 'spin' },
        { at: 106, dmg: 290, str: 'U', hitstop: 22, fx: 'crater' },
      ],
      ev: {
        12: (G, a) => ev(G, 'cine', { p: a.i, k: 'colossus_leap', x: a.x }),
        106: (G, a, v) => ev(G, 'cine', { p: a.i, k: 'colossus_impact', x: v.x }),
      },
      rel: [5, 9], recov: 22,
    },
  },
  ai: {
    aa: 'stH', pokes: ['stM', 'crM'], specials: ['E', 'Q'], enders: ['Q'],
    range: 110, punish: 'E', ultRange: 140, items: ['vest', 'vgem', 'sigil', 'fang'],
  },
});

function rank(f) { return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0); }
