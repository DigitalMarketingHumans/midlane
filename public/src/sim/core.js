// Shared helpers used by the simulation and hero ability scripts.
// Nothing in here touches the DOM or rendering.
import { px, MANA, HITSTOP } from './const.js';

// ---------------------------------------------------------------------------
// Event output. Events are cosmetic notifications (sounds, particles, UI).
// They are NOT part of the game state. The caller passes an array to step().
let OUT = null;
export function setOut(o) { OUT = o; }
export function ev(G, t, data = {}) {
  if (!OUT) return;
  data.t = t;
  data.f = G.frame;
  OUT.push(data);
}

// ---------------------------------------------------------------------------
// Boxes: [x, y, w, h] in sub-pixels relative to an origin, facing right.
export function worldBox(box, ox, oy, face, out) {
  const x = face > 0 ? ox + box[0] : ox - box[0] - box[2];
  out[0] = x; out[1] = oy + box[1]; out[2] = box[2]; out[3] = box[3];
  return out;
}
export function overlap(a, b) {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

// ---------------------------------------------------------------------------
// Hit definitions — authored in px/frames, converted to internal integers.
export function normHit(h, defaults = {}) {
  const o = Object.assign({}, defaults, h);
  if (o.box) o.box = o.box.map(px);
  o.type = o.type || 'p';
  o.lvl = o.lvl || 'mid';
  o.str = o.str || 'M';
  o.hitstop = o.hitstop ?? HITSTOP[o.str] ?? 9;
  o.push = px(o.push ?? 18);
  if (o.launch) o.launch = [px(o.launch[0]), px(o.launch[1])];
  o.jug = o.jug ?? 1;
  o.dmg = o.dmg | 0;
  return o;
}

// Normalise a move (normal or ability). Frame data f = [startup, active, recovery].
export function normMove(m, id) {
  m.id = id;
  const [s, a, r] = m.f;
  m.startup = s; m.active = a; m.recovery = r;
  m.total = s + a + r - 1;
  m.lastActive = s + a - 1;
  if (!m.hits && m.box) {
    m.hits = [{ at: [s, s + a - 1], box: m.box, dmg: m.dmg, adv: m.adv, hs: m.hs, bs: m.bs,
      lvl: m.lvl, type: m.type, str: m.str, push: m.push, kd: m.kd, launch: m.launch,
      jug: m.jug, effects: m.effects, hitstop: m.hitstop, lock: m.lock, unblock: m.unblock }];
  }
  m.hits = (m.hits || []).map((h) => {
    const n = normHit(h, { str: m.str || 'M', type: m.type || 'p' });
    n.from = h.at[0]; n.to = h.at[1];
    // Advantage-based stun: measured from the first active frame of this hit.
    const remain = m.total - n.from;
    if (n.hs == null) n.hs = Math.max(1, (h.adv ? h.adv[0] : 2) + remain);
    if (n.bs == null) n.bs = Math.max(1, (h.adv ? h.adv[1] : -2) + remain);
    return n;
  });
  // Velocity segments: [from, to, vx(px/f), vy(px/f) | null]
  m.vel = (m.vel || []).map((v) => [v[0], v[1], v[2] == null ? null : px(v[2]), v[3] == null ? null : px(v[3])]);
  if (m.cost) m.cost = m.cost * MANA;
  m.ext = m.ext ?? (!m.slot && m.hits.length > 0);
  return m;
}

// ---------------------------------------------------------------------------
// Entities (projectiles, traps, zones, beams)
export function spawn(G, kind, owner, opts) {
  const f = G.fighters[owner];
  const face = opts.face ?? f.face;
  const e = {
    id: G.nextId++, k: kind, o: owner, face,
    x: opts.abs ? opts.x : f.x + face * px(opts.x || 0),
    y: opts.abs ? opts.y : f.y + px(opts.y || 0),
    vx: face * px(opts.vx || 0), vy: px(opts.vy || 0), ay: px(opts.ay || 0),
    age: 0, life: opts.life ?? 120, hs: 0, hits: opts.hits ?? 1, icd: 0,
    rank: opts.rank ?? 1, d: opts.d || {},
  };
  G.ents.push(e);
  ev(G, 'spawn', { id: e.id, k: kind, p: owner, x: e.x, y: e.y });
  return e;
}

export function removeEnt(G, e, why = 'end') {
  const i = G.ents.indexOf(e);
  if (i >= 0) {
    G.ents.splice(i, 1);
    ev(G, 'ent_end', { id: e.id, k: e.k, p: e.o, x: e.x, y: e.y, why });
  }
}

// ---------------------------------------------------------------------------
// Buffs / status effects stored on fighters: { k, t, v }
export function addBuff(G, f, k, t, v = 0) {
  for (const b of f.buffs) {
    if (b.k === k) { b.t = Math.max(b.t, t); b.v = v; return b; }
  }
  const b = { k, t, v };
  f.buffs.push(b);
  ev(G, 'buff', { p: f.i, k });
  return b;
}
export function hasBuff(f, k) {
  for (const b of f.buffs) if (b.k === k) return b;
  return null;
}
export function removeBuff(f, k) {
  const i = f.buffs.findIndex((b) => b.k === k);
  if (i >= 0) f.buffs.splice(i, 1);
}

export function opp(G, f) { return G.fighters[1 - f.i]; }
export function dist(a, b) { return Math.abs(a.x - b.x); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
