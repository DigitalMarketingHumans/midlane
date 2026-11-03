// Hero registry + normaliser. Hero files describe moves in px/frames; this converts
// them to the integer representation the simulation uses.
import { px } from '../const.js';
import { normMove, normHit } from '../core.js';

export const HEROES = {};
export const KINDS = {};
export const HERO_LIST = [];

const STR = { L: 1, M: 2, H: 3 };

function dashTable(frames, distPx) {
  // Front-loaded velocity curve that sums exactly to distPx (in sub-px).
  const total = px(distPx);
  const w = [];
  let sw = 0;
  for (let i = 0; i < frames; i++) { const k = frames - i; w.push(k * k); sw += k * k; }
  const t = w.map((k) => Math.floor((total * k) / sw));
  let rem = total - t.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i++, rem--) t[i % frames]++;
  return t;
}

export function defineHero(H) {
  const S = H.stats;
  S.hpBase = S.hp;
  S.walkF = px(S.walkF); S.walkB = px(S.walkB);
  S.jumpV = px(S.jumpV); S.jumpX = px(S.jumpX);
  S.hw = px(S.width / 2);
  S.heightS = px(S.height); S.crouchS = px(S.crouchH); S.airS = px(S.airH);
  S.dashT = dashTable(S.dash[0], S.dash[1]);
  S.bdashT = dashTable(S.bdash[0], S.bdash[1]);
  S.bdInv = S.bdash[2];
  S.pushH = px(Math.round(S.height * 0.82));

  H.moves = {};
  for (const [id, m] of Object.entries(H.normals)) {
    m.str = m.str || id[id.length - 1];
    m.strN = STR[m.str] || 3;
    m.air = m.air ?? id.startsWith('j');
    m.stance = m.stance ?? (id.startsWith('cr') ? 'cr' : m.air ? 'air' : 'st');
    H.moves[id] = normMove(m, id);
  }
  // Generic throw (techable grab). Range = body half-width + throw range.
  const tw = S.width / 2 + 46;
  H.moves.throw = normMove(Object.assign({
    f: [5, 2, 22], str: 'T', noSp: true,
    hits: [{ at: [5, 6], box: [0, 30, tw, 120], grab: true, throw: true, lock: 'throw', str: 'T', dmg: 0 }],
  }, H.throwMove || {}), 'throw');
  H.moves.throw.ext = false;

  for (const slot of ['Q', 'W', 'E', 'R']) {
    const ab = H.abilities[slot];
    if (!ab) continue;
    ab.slot = slot;
    ab.str = ab.str || (slot === 'R' ? 'U' : 'S');
    H.moves[slot] = normMove(ab, slot);
    for (const [vid, vm] of Object.entries(ab.variants || {})) {
      vm.slot = slot; vm.variantOf = slot; vm.str = vm.str || ab.str;
      vm.cost = 0; // paid by parent
      vm.name = vm.name || ab.name;
      H.moves[vid] = normMove(vm, vid);
    }
  }
  for (const [id, m] of Object.entries(H.extraMoves || {})) {
    m.str = m.str || 'S';
    H.moves[id] = normMove(m, id);
  }

  for (const [k, K] of Object.entries(H.kinds || {})) {
    K.id = `${H.id}.${k}`;
    if (K.box) K.boxS = [-px(K.box[0] / 2), K.anchor === 'bottom' ? 0 : -px(K.box[1] / 2), px(K.box[0]), px(K.box[1])];
    if (K.trig) K.trigS = [-px(K.trig[0] / 2), K.anchor === 'bottom' ? 0 : -px(K.trig[1] / 2), px(K.trig[0]), px(K.trig[1])];
    if (K.hit) K.hit = normHit(K.hit, { str: 'S', type: 'm' });
    KINDS[K.id] = K;
  }

  // Locks: grabs and cinematic ultimates. Default forward throw if none supplied.
  H.locks = H.locks || {};
  if (!H.locks.throw) {
    H.locks.throw = {
      dur: 34, tech: 10,
      vpos: [[0, 62, 0], [14, 70, 30], [26, 40, 90], [34, 90, 40]],
      hits: [{ at: 28, dmg: 120, str: 'H' }],
      rel: [5, 7], recov: 14,
    };
  }
  for (const L of Object.values(H.locks)) {
    L.hits = (L.hits || []).map((h) => Object.assign({ type: 'p', str: 'H' }, h));
  }
  HEROES[H.id] = H;
  HERO_LIST.push(H.id);
  return H;
}

export function heroOf(f) { return HEROES[f.h]; }
export function moveOf(f) { return f.mv ? HEROES[f.h].moves[f.mv] : null; }
