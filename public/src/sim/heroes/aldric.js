import { defineHero } from './registry.js';
import { spawn, ev } from '../core.js';

// ALDRIC, THE SUNFORGED — Strength all-rounder. Fireball, invincible reversal,
// armoured charge. The "learn the game with me" hero.
export default defineHero({
  id: 'aldric', name: 'Aldric', title: 'The Sunforged', attr: 'str',
  roles: ['All-rounder', 'Reversal'], diff: 1,
  blurb: 'Last knight of a fallen dawn order. Holds the line with a blade that remembers the sun.',
  color: '#ffc94a', color2: '#fff2c4',
  stats: {
    hp: 1050, mana: 200, regen: 5, armor: 10, mr: 8,
    walkF: 3.9, walkB: 3.1, jumpV: 19, jumpX: 4.2,
    width: 64, height: 188, crouchH: 120, airH: 118,
    dash: [18, 150], bdash: [22, 120, 7],
  },
  passive: {
    name: "Sun's Favor", icon: 'sun',
    desc: 'Deals 15% bonus damage to airborne opponents. Anti-air with confidence.',
    dmgBonus: (G, atk, vic) => (vic.y > 0 || vic.act === 'ahit' ? 15 : 0),
  },
  normals: {
    stL: { name: 'Gauntlet Jab', f: [4, 2, 8], dmg: 30, adv: [4, 1], box: [26, 116, 68, 28], push: 12 },
    stM: { name: 'Rising Cut', f: [7, 3, 14], dmg: 56, adv: [3, -1], box: [28, 88, 102, 70], push: 18 },
    stH: { name: 'Sunsplitter', f: [11, 4, 20], dmg: 92, adv: [2, -5], box: [30, 50, 122, 112], push: 26 },
    crL: { name: 'Shin Kick', f: [4, 2, 8], dmg: 24, adv: [3, 1], box: [24, 4, 80, 26], lvl: 'low', push: 12 },
    crM: { name: 'Low Thrust', f: [7, 3, 14], dmg: 48, adv: [2, -3], box: [30, 8, 112, 28], lvl: 'low' },
    crH: { name: 'Dawnsweep', f: [9, 4, 22], dmg: 80, adv: [0, -12], box: [30, 0, 124, 30], lvl: 'low', kd: true, noSp: true, push: 20 },
    jL: { name: 'Air Jab', f: [4, 6, 4], dmg: 30, hs: 14, bs: 10, box: [14, 34, 66, 46] },
    jM: { name: 'Air Slash', f: [6, 5, 6], dmg: 52, hs: 17, bs: 13, box: [18, 10, 88, 62] },
    jH: { name: 'Falling Verdict', f: [9, 5, 8], dmg: 84, hs: 20, bs: 15, box: [10, -24, 108, 92] },
    fH: { name: 'Dawnbreaker', f: [19, 3, 15], dmg: 76, adv: [2, -3], lvl: 'over', box: [30, 60, 106, 124], push: 18 },
  },
  abilities: {
    Q: {
      name: 'Solar Arc', icon: 'arc', cost: 55, cd: 210,
      desc: 'Hurl a crescent of sunlight along the ground. Magic damage, chips on block.',
      f: [13, 1, 24], str: 'S',
      ev: { 13: (G, f) => spawn(G, 'aldric.arc', f.i, { x: 62, y: 96, vx: 8.5, life: 100, rank: rankQ(f) }) },
    },
    W: {
      name: 'Rising Dawn', icon: 'uppercut', cost: 70, cd: 360,
      desc: 'Invincible rising slash. The answer to jumps and pressure — but brutal to whiff.',
      f: [5, 11, 30], inv: [1, 7], airborne: true, landLag: 14, type: 'm',
      vel: [[4, 12, 1.6, 11]],
      hits: [
        { at: [5, 7], box: [18, 70, 74, 120], dmg: 50, adv: [10, -30], launch: [1, 6], type: 'm', str: 'S' },
        { at: [8, 15], box: [8, 120, 82, 130], dmg: 78, adv: [10, -30], launch: [2.5, 11], type: 'm', str: 'S', kd: true },
      ],
    },
    E: {
      name: 'Judgment Charge', icon: 'charge', cost: 60, cd: 300,
      desc: 'Shoulder-charge forward through one hit of armour, knocking the foe down.',
      f: [12, 14, 16], armor: [6, 20, 1], vel: [[12, 25, 9, null]],
      hits: [{ at: [12, 25], box: [16, 36, 74, 134], dmg: 86, adv: [0, -4], launch: [4, 7], push: 30, str: 'H' }],
    },
    R: {
      name: "Heaven's Verdict", icon: 'pillar', cost: 140, cd: 2400, sc: true,
      desc: 'ULTIMATE — Lunge with blinding speed. On hit, pin the foe beneath a pillar of judgment.',
      f: [8, 10, 34], inv: [1, 16], vel: [[8, 17, 13, null]],
      hits: [{ at: [8, 17], box: [18, 30, 86, 150], dmg: 90, adv: [0, -20], lock: 'verdict', str: 'U', type: 'm', push: 30 }],
    },
  },
  kinds: {
    arc: {
      box: [56, 96], clash: 1, proj: true,
      hit: { dmg: 72, type: 'm', lvl: 'mid', hs: 20, bs: 15, push: 28, str: 'S' },
    },
  },
  locks: {
    verdict: {
      dur: 104, ult: true,
      vpos: [[0, 72, 0], [18, 84, 50], [50, 84, 150], [84, 84, 168], [104, 120, 20]],
      hits: [
        { at: 26, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 32, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 38, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 44, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 50, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 56, dmg: 22, type: 'm', str: 'S', hitstop: 3 },
        { at: 80, dmg: 170, type: 'm', str: 'U', hitstop: 16, fx: 'pillar' },
      ],
      ev: {
        18: (G, a) => ev(G, 'cine', { p: a.i, k: 'verdict_rise' }),
        70: (G, a, v) => ev(G, 'cine', { p: a.i, k: 'verdict_pillar', x: v.x }),
      },
      rel: [6, 6], recov: 18,
    },
  },
});

function rankQ(f) { return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0); }
