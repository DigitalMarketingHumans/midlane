import { defineHero } from './registry.js';
import { spawn, ev, addBuff, removeBuff } from '../core.js';

// YSOLDE, THE DUSKBLADE — Agility rushdown / mixup. Twin sickles, short fast
// normals, a pass-through low rush, a rising anti-air that dives back down as an
// overhead, and a decoy double for setplay. Dashing primes her next hit.

const SD_WINDOW = 40;      // frames after a dash ends during which Shadowdance is primed
const SD_BONUS = 20;       // % bonus damage
const DASH_LEN = { f: 15, b: 20 };

function rank(f) { return 1 + (f.lv >= 3 ? 1 : 0) + (f.lv >= 5 ? 1 : 0); }

// ---------------------------------------------------------------------------
// Thousand Shadows: 12 clone slashes from every direction, then a rising cross.
// Ysolde dashes clean through the victim, kneels behind them while her shadows
// cut, then blinks back in front for the finisher. Positions are authored as
// world offsets from the lock origin; vpos is derived so the victim never drifts.
const SH = {
  first: 16, every: 7, n: 12, warn: 4,     // slash k lands on lock frame first + every*k
  vanish: 100, fin: 110, dur: 130,
};
function shadowsLock() {
  // [t, atkX, atkY, vicX, vicY] world px relative to lock origin (forward-relative)
  const K = [
    [0, 0, 0, 70, 0],
    [6, 178, 0, 70, 0],
    [14, 178, 0, 70, 14],
    [SH.vanish, 178, 0, 70, 18],
    [SH.vanish + 1, -24, 0, 70, 18],
    [SH.fin - 3, -24, 0, 70, 14],
    [SH.fin, -18, 22, 70, 34],
    [SH.fin + 8, -12, 64, 70, 96],
    [SH.dur, -12, 70, 70, 128],
  ];
  const apos = K.map(([t, ax, ay]) => [t, ax, ay]);
  const vpos = K.map(([t, ax, ay, vx, vy]) => [t, vx - ax, vy - ay]);
  const hits = [];
  const evs = {};
  for (let k = 0; k < SH.n; k++) {
    const at = SH.first + SH.every * k;
    hits.push({ at, dmg: 20, type: 'm', str: 'S', hitstop: 2 });
    evs[at - SH.warn] = (G, a, v) => ev(G, 'cine', { p: a.i, k: 'ys_clone', n: k, x: v.x, y: v.y });
  }
  hits.push({ at: SH.fin, dmg: 270, type: 'p', str: 'U', hitstop: 16, fx: 'ys_cross' });
  evs[3] = (G, a) => ev(G, 'cine', { p: a.i, k: 'ys_through', x: a.x });
  evs[SH.vanish] = (G, a, v) => ev(G, 'cine', { p: a.i, k: 'ys_blink', x: a.x, y: a.y, vx: v.x });
  evs[SH.fin - 4] = (G, a, v) => ev(G, 'cine', { p: a.i, k: 'ys_rise', x: v.x, y: v.y });
  return { dur: SH.dur, ult: true, apos, vpos, hits, ev: evs, rel: [1.5, 12], recov: 22 };
}

export const YSOLDE_SHADOWS = SH;

export default defineHero({
  id: 'ysolde', name: 'Ysolde', title: 'The Duskblade', attr: 'agi',
  roles: ['Rushdown', 'Mixup'], diff: 3,
  blurb: 'A hooded blade of the dusk courts who hunts where the lamplight ends. You never see the second sickle.',
  color: '#ff2a4a', color2: '#ffc2cc',
  stats: {
    hp: 950, mana: 220, regen: 5.5, armor: 7, mr: 8,
    walkF: 4.8, walkB: 3.8, jumpV: 19.5, jumpX: 4.8,
    width: 56, height: 172, crouchH: 108, airH: 112,
    dash: [15, 165], bdash: [20, 125, 8],
  },
  passive: {
    name: 'Shadowdance', icon: 'shadow',
    desc: 'After any dash (forward, back or rush), her next attack within 40 frames deals +20% damage.',
    onDash(G, f, dir) {
      const len = dir > 0 ? DASH_LEN.f : DASH_LEN.b;
      f.d.sd = G.frame + len + SD_WINDOW;      // expiry frame (state, not a module timer)
      f.d.sdMv = null;
      addBuff(G, f, 'shadowdance', len + SD_WINDOW);   // cosmetic marker for the renderer
    },
    // Called once per hit/block resolution. Consumes the primed bonus on the first
    // contact after a dash; later hits of that same move instance keep it.
    dmgBonus(G, atk) {
      const d = atk.d;
      if (G.lock) return 0;
      if (d.sdMv && atk.act === 'move' && atk.mv === d.sdMv && atk.af > d.sdAf) { d.sdAf = atk.af; return SD_BONUS; }
      d.sdMv = null;
      if (d.sd && G.frame <= d.sd) {
        d.sd = 0;
        d.sdMv = atk.act === 'move' ? atk.mv : null;
        d.sdAf = atk.af;
        removeBuff(atk, 'shadowdance');
        ev(G, 'cine', { p: atk.i, k: 'ys_sd' });
        return SD_BONUS;
      }
      if (d.sd && G.frame > d.sd) { d.sd = 0; removeBuff(atk, 'shadowdance'); }
      return 0;
    },
  },
  normals: {
    stL: { name: 'Hook Jab', f: [4, 2, 7], dmg: 28, adv: [4, 1], box: [22, 106, 68, 28], push: 10 },
    stM: { name: 'Sickle Slice', f: [6, 3, 12], dmg: 52, adv: [3, -1], box: [24, 80, 100, 58], push: 16 },
    stH: { name: 'Duskcross', f: [9, 4, 18], dmg: 84, adv: [2, -5], box: [22, 52, 114, 104], push: 24 },
    crL: { name: 'Ankle Nick', f: [4, 2, 7], dmg: 24, adv: [3, 1], box: [20, 2, 78, 24], lvl: 'low', push: 10 },
    crM: { name: 'Low Reap', f: [6, 3, 13], dmg: 48, adv: [2, -3], box: [26, 4, 110, 28], lvl: 'low', push: 16 },
    crH: { name: 'Nightsweep', f: [8, 4, 22], dmg: 78, adv: [0, -12], box: [22, 0, 114, 30], lvl: 'low', kd: true, noSp: true, push: 20 },
    jL: { name: 'Air Nick', f: [4, 6, 4], dmg: 28, hs: 13, bs: 10, box: [12, 30, 66, 46] },
    jM: { name: 'Swallow Cut', f: [5, 5, 6], dmg: 50, hs: 16, bs: 12, box: [12, 4, 88, 62] },
    // Box reaches 26px behind her: a real cross-up.
    jH: { name: 'Crossfall', f: [7, 5, 8], dmg: 80, hs: 19, bs: 14, box: [-26, -30, 124, 92] },
    // Hopping overhead. Lows whiff during the hop; she lands just after the cut.
    fM: {
      name: 'Raven Drop', f: [16, 3, 14], dmg: 58, adv: [1, -4], lvl: 'over', box: [14, 28, 92, 124], push: 14,
      vel: [[3, 3, 2.4, 7.6], [4, 18, 2.4, null], [19, 19, 0, null]], lowInv: [4, 17],
      onLand(G, f) { f.vx = 0; },
    },
  },
  abilities: {
    Q: {
      name: 'Crescent Rush', icon: 'moon', cost: 40, cd: 150,
      desc: 'Dash ~200px in a low crescent slash, passing straight through the foe. Must be blocked low; trips on hit.',
      f: [10, 10, 18], type: 'p',
      vel: [[8, 9, 10, null], [10, 18, 20, null], [19, 20, 6, null], [21, 21, 0, null]],
      ev: { 8: (G, f) => { f.ghost = 16; } },
      hits: [{ at: [10, 19], box: [-10, 0, 84, 44], dmg: 70, lvl: 'low', adv: [0, -8], launch: [-1.5, 6.5], push: 8, str: 'S' }],
    },
    W: {
      name: 'Umbral Ascent', icon: 'twinblade', cost: 50, cd: 240, sc: true,
      desc: 'Spring upward with a rising cut that clips jumpers, then flip and drive both sickles down: an overhead that knocks down.',
      f: [6, 26, 12], airborne: true, landLag: 10, type: 'p',
      vel: [[5, 5, 2.6, 13.5], [17, 20, 1.2, 0], [21, 21, 4.6, -11]],
      noGrav: [17, 20],
      hits: [
        { at: [6, 11], box: [4, 78, 78, 108], dmg: 32, launch: [1.2, 9], hs: 18, bs: 12, str: 'M' },
        { at: [21, 31], box: [-6, -38, 98, 124], dmg: 80, lvl: 'over', kd: true, hs: 20, bs: 14, push: 18, str: 'S' },
      ],
    },
    E: {
      name: 'Mirage Feint', icon: 'clone', cost: 60, cd: 360,
      desc: 'Backflip away (invulnerable early), leaving a shadow double that cross-slashes a beat later. The slash launches the foe toward you.',
      f: [2, 1, 28], inv: [1, 9], airborne: true, landLag: 6,
      vel: [[2, 2, -7.4, 7.2]],
      start(G, f) { spawn(G, 'ysolde.clone', f.i, { x: 34, y: 0, life: 44, rank: rank(f) }); },
    },
    R: {
      name: 'Thousand Shadows', icon: 'eye', cost: 150, cd: 2400,
      desc: 'ULTIMATE — A blinding dash. On hit, a thousand shadows cut the foe from every side before Ysolde ends it with a rising cross.',
      f: [7, 10, 32], inv: [1, 12], vel: [[7, 16, 17, null], [17, 17, 0, null]],
      hits: [{ at: [7, 16], box: [8, 20, 86, 150], dmg: 50, adv: [0, -24], lock: 'shadows', str: 'U', type: 'p', push: 30 }],
    },
  },
  kinds: {
    // Decoy double left at her start spot. Slashes once at age 24–28 and launches toward Ysolde.
    clone: {
      box: [150, 150], anchor: 'bottom', proj: false, persist: true,
      activeFrom: 24, activeTo: 28,
      hit: { dmg: 60, type: 'm', lvl: 'mid', launch: [-2, 11], hs: 20, bs: 16, push: 16, str: 'S' },
    },
  },
  locks: {
    throw: {
      dur: 36, tech: 10,
      vpos: [[0, 58, 0], [8, 44, 0], [16, 42, 4], [24, 58, 26], [36, 104, 18]],
      hits: [{ at: 10, dmg: 30, str: 'M', hitstop: 5 }, { at: 24, dmg: 80, str: 'H', hitstop: 10 }],
      rel: [5.5, 6], recov: 14,
    },
    shadows: shadowsLock(),
  },
  ai: {
    aa: 'W', aa2: 'stH', pokes: ['crM', 'stM', 'crL', 'fM'], specials: ['Q', 'W', 'E'], enders: ['Q', 'W'],
    range: 120, punish: 'Q', ultRange: 170, items: ['wraps', 'mark', 'fang', 'boots'],
  },
});
