# Authoring heroes for MIDLANE

A hero is two files:

| File | Purpose |
|---|---|
| `public/src/sim/heroes/<id>.js` | Gameplay: stats, frame data, hitboxes, abilities, projectiles, grabs. **Deterministic.** |
| `public/src/render/heroes/<id>.js` | Visuals: 3D model built on the IK rig, poses, move animations, ability VFX. |

Both are registered in their folder's `index.js`. `aldric.js` (both files) is the reference implementation.

---

## 1. Determinism rules (sim file) — read this first

The simulation runs identically on two machines for rollback netcode. In sim code:

- **Integers only.** Positions/velocities are integer *sub-pixels* (1 px = 100 sub). Use `px(n)` from `../const.js` to convert. Divide with `Math.floor`/`Math.trunc`. Never store fractional numbers in state.
- **No `Math.random`, `Date`, `performance`, `Math.sin/cos/pow/exp/log`.** Use `rngInt(G, n)` / `rngRange(G, a, b)` from `../rng.js` if randomness is needed.
- **State lives only in `G` (game) and fighter/entity objects.** Hero hooks may read/write `G`, fighters `f`/`o`, and entities. Never keep module-level mutable state. Per-fighter hero scratch data goes in `f.d` (plain JSON values only; reset each round).
- Hooks are plain functions in the hero definition; they must not capture anything mutable.
- Coordinates: `x` grows right, `y` grows up from the floor (0). `f.face` is `1` (facing right) or `-1`.

## 2. Units & conventions

- Frames at 60 fps. Distances in px when authoring (converted for you), sub-px at runtime.
- Fighter origin = centre of feet. Standing hurtbox = `[-width/2, 0, width, height]`.
- **Boxes** are `[x, y, w, h]` in px relative to the origin, *as if facing right* (mirrored automatically). `x` is the left edge; e.g. `[30, 90, 100, 40]` covers 30–130 px in front, 90–130 px up.
- Typical reach (from centre to hitbox tip): jab ~95, medium ~130, heavy ~150, sweep ~150, command-normal ~135.
- Damage scale: HP ≈ 900–1250. Light 24–34, medium 48–60, heavy 78–95, specials 60–140, ultimates 260–380 total.

## 3. Sim file format

```js
import { defineHero } from './registry.js';
import { spawn, ev, addBuff, hasBuff, removeBuff, removeEnt, opp } from '../core.js';
import { px } from '../const.js';
import { rngInt } from '../rng.js';

export default defineHero({
  id, name, title, attr: 'str'|'agi'|'int', roles: ['Rushdown', ...], diff: 1..3,
  blurb: 'One-line lore', color: '#hex' (UI accent), color2: '#hex',
  stats: {
    hp, mana, regen /* mana per sec */, armor /* % phys reduction */, mr /* % magic reduction */,
    walkF, walkB /* px/frame */, jumpV /* px/frame up, ~19 */, jumpX /* px/frame fwd */,
    width, height, crouchH, airH /* hurtbox sizes px */,
    dash: [frames, distancePx], bdash: [frames, distancePx, invulnFrames],
  },
  passive: { name, icon, desc, dmgBonus(G, atk, vic, hit) → %, mods(G, f, statsObj), onHit(G, atk, vic, hit, dmg, src), onTaken(G, f, atk, dmg, type), onCast(G, f, slot), onBlocked(G, atk, vic, hit) },
  normals: { stL, stM, stH, crL, crM, crH, jL, jM, jH, fH /* forward+H command normal, optional */, fM /* optional */ },
  abilities: { Q, W, E, R },
  extraMoves: { id: move },          // sub-moves you switch into from scripts
  kinds: { name: entityKind },       // projectiles, traps, zones, beams (id becomes '<hero>.<name>')
  locks: { name: lock },             // grabs and cinematic ultimates. `throw` is supplied by default.
  buffMods: { buffKey(G, f, stats, buff) { stats.dmg += 15; } },
  onRoundStart(G, f) {},
  ai: { aa, pokes, zone, specials, enders, range, punish, ultRange, items },   // CPU hints
});
```

### Moves (normals and abilities share this format)

| Field | Meaning |
|---|---|
| `f: [startup, active, recovery]` | Frame data. Active frames are `startup … startup+active-1`. |
| `box, dmg, lvl, push, kd, launch, type, str` | Single-hit shorthand (see Hits). |
| `adv: [onHit, onBlock]` | Frame advantage if the hit connects on its first active frame. Ground moves only. |
| `hs, bs` | Explicit hitstun/blockstun (use for air normals). |
| `hits: [{ at: [from, to], box, dmg, adv/hs/bs, ... }]` | Multi-hit moves. Each entry connects at most once. |
| `vel: [[from, to, vx, vy]]` | Velocity (px/frame) applied each frame in range. `vx` is forward-relative. `null` leaves an axis alone. Setting `vy > 0` makes the move airborne. |
| `airborne: true, landLag: n` | Grounded move that leaves the ground; landing ends it with `n` frames of recovery. |
| `noGrav: [from, to]` | Ignore gravity in this frame range (hovering). |
| `inv: [from, to]` | Strike+throw invulnerable frames. `pinv` = projectile-invulnerable. `lowInv` = lows whiff (jump-like). |
| `armor: [from, to, hits]` | Super armour: absorbs `hits` strikes without flinching. |
| `stance: 'st'|'cr'|'air'` | Hurtbox/animation base. Defaults from id prefix. |
| `hurt: [x,y,w,h]` + `hurtAt: [from,to]` | Custom body hurtbox (px) — set `m.hurtS` in `start` instead if you need sub-px. |
| `noSp: true` | Cannot be special-cancelled (sweeps). `noChain` stops chaining. |
| `sc: true` | (abilities) can be cancelled into the Ultimate on connect. |
| `ev: { frame: (G, f, o) => {} }` | Script callbacks on specific frames (spawn projectiles, teleport, buff...). |
| `tick(G, f, o)` | Called every frame of the move. |
| `start(G, f, o)` | Called when the move starts (after costs paid). |
| `onLand(G, f, o)` | Override landing behaviour for airborne moves. |
| `onConnect(G, f, o, hit)` | Called after one of this move's hits resolves (hit or block — check `f.conn`: 1 hit, 2 block). |

Ability-only fields: `name, icon, desc, cost` (mana), `cd` (frames), `air: true` (usable airborne), `airOnly`, `variant(G, f, o, isAir) → moveId|null` (choose a variant move id, e.g. directional versions; variant moves go in `ab.variants: { id: move }`), `can(G, f, o) → bool`, `aiDir` (direction bits AI should hold).

Ultimates (`R`) cost 120–170 mana, `cd` 2100–2700 frames, unlock at level 4 and trigger a 46-frame super-freeze when cast. Give them invulnerable startup. Use `lock: '<name>'` on a hit to start a cinematic.

### Hits

`{ box, dmg, type: 'p'|'m', lvl: 'mid'|'low'|'over', str: 'L'|'M'|'H'|'S'|'U', push (px), kd: true (knockdown), launch: [vx, vy] (px/frame juggle launch, implies knockdown), jug: juggle cost (default 1), unblock: true, grab: true (+ throw: true for techable), lock: 'lockName', effects: [{ k: 'slow'|'root'|'burn'|custom, t: frames, v }], chip: % (override), hitstop }`

Magic (`'m'`) damage chips 25% on block; physical does not. Abilities usually deal magic damage.

### Entities (`kinds`)

```js
kinds: {
  bolt: {
    box: [w, h], anchor: 'center'|'bottom', clash: 1 (projectile durability vs others), proj: true,
    hit: { dmg, type, lvl, hs, bs, push, str, launch, kd, effects },
    hits: n (set at spawn), interval: frames between multi-hits, persist: true (don't die at 0 hits),
    follow: [dx, dy] (stick to owner, px), srcOwner: true (block direction from owner — beams),
    ground: true + onGround(G, e) (called when y <= 0; default removes),
    trig: [w, h] + trigger(G, e, target) (traps), armAt: frames before the trigger works, trigAir: true,
    zone(G, e, target) (called every frame while target overlaps `box`),
    activeFrom, activeTo (age window for hitting), update(G, e), onHit(G, e, target, result),
    pushDir(G, e, target) → ±1,
  },
}
```

Spawn with `spawn(G, '<hero>.<kind>', f.i, { x, y (px offset from owner, forward-relative), vx, vy, ay (gravity px/f²), life (frames), hits, rank, abs: true (x/y are absolute sub-px), face, d: {} })`. Pass `rank` = ability rank so damage scales with level: `1 + (f.lv >= 3) + (f.lv >= 5)`.

### Locks (grabs & cinematics)

```js
locks: {
  name: {
    dur: frames, tech: 0 (untechable) | frames (throw tech window), ult: true (ult scaling + cinematic camera/dim),
    apos: [[frame, dx, dy], ...] (attacker offset from where the lock began, px; optional),
    vpos: [[frame, dx, dy], ...] (victim offset from attacker, px, forward-relative),
    hits: [{ at: frame, dmg, type, str, hitstop, fx }],
    ev: { frame: (G, atk, vic, K) => {} },
    rel: [vx, vy] (victim release velocity px/frame; vy<=0 → instant knockdown), recov: attacker recovery frames,
    jugAfter: juggle count after release (default = no follow-ups),
  },
}
```

## 4. Render file format

```js
import * as THREE from 'three';
import { part, G3 } from '../toon.js';
import { Ribbon } from '../cloth.js';

export default {
  id, scale: 1.0 /* overall size; Brakka ~1.15 */, dims: { /* rig overrides, see rig.js DEFAULT_DIMS */ },
  outline: 0x0a0a12, flip: true (forward-flip on diagonal jumps),
  glowColor: 0xRRGGBB (ability/hit tint),
  build({ rig, ms, THREE, s }) → { trails: [{ tip, base, color, moves? }], ribbons: [{ r: Ribbon, body: 'chest'|'hips'|'head', offset: [x,y,z] }] },
  poses: { stance, crouch, jumpUp, fall, intro, win, walk: { stride, lift, bob }, ...overrides of anim.js GENERIC },
  moves: { moveId: [[time, pose, ease], ...] },
  locks: { lockName: { atk: [...timeline], vic: [...timeline], camZ, orbit } },
  ents: { kindName: { build(ctx, e) → Object3D, update(obj, e, ctx), end(obj, e, ctx), autoPos: true, z } },
  onEvent(e, ctx) {},          // events where e.p === this hero's slot
  buffFx: { buffKey(F, buff, ctx) {} },
  noTrail: ['moveId'],
};
```

**Rig/model space:** +Z forward (toward opponent), +Y up, +X = character's left (away from camera). Rig nodes: `rig.hips`, `rig.chest`, `rig.head` (rotate with torso), `rig.seg.uaL/uaR/faL/faR/thL/thR/shL/shR` (limb segments: origin at the proximal joint, the limb runs down local −Y; place meshes at `y = -length/2`), `rig.hand.L/R` (local +Y = weapon direction, Z = blade edge, X = flat side), `rig.foot.L/R` (local +Z = toes). `rig.d` holds dimensions.

**Materials:** `ms.toon(color)` (cel-shaded), `ms.glow(color, intensity)` (unlit, blooms; >2 glows strongly). `part(geometry, material, ms, { smoothOutline })` adds an outline; pass `null` for `ms` to skip outlines (glow bits). Geometry helpers in `G3`: `capsule, limb(r1, r2, len), box, sphere, ellip(rx, ry, rz), cone, cyl, torus, lathe(pts), extrude(pts2d, depth)` — all centred.

**Poses** are partial objects; positions in metres at nominal scale (they are multiplied by `scale`):

| Key | Meaning |
|---|---|
| `root: [fwd, up, side]` | Hip centre. Standing ≈ `[0, 0.9, 0]`, crouch ≈ 0.58. |
| `lean, chestLean, twist, hipTwist, tilt, chestTilt` | Degrees. `lean` + = bow forward. `twist` + = right (camera-side) shoulder forward. |
| `head: [pitch, yaw, roll]` | `pitch` + = look down. |
| `hL, hR: [fwd, up, side]` | Hand targets. `side` + = toward the camera (character's right). Shoulders ≈ `[0, 1.41, ±0.2]`, arm ≈ 0.59 long. |
| `eL, eR: [fwd, up, side]` | Elbow pole direction (default down/back/out). |
| `wL, wR` | Weapon angle in degrees in the side plane: 0 = forward, 90 = up, -90 = down, 180 = backward. `null` = follow forearm. `wRy` yaws it. |
| `fL, fR: [fwd, up, side, pitch, yaw]` | Foot targets (`up` 0 = planted). |
| `kL, kR` | Knee pole direction (default forward). |
| `spin` | Whole-body pitch about the hips, degrees (flips). |

**Timelines:** `[[t, pose, ease]]`. `t` may be a number (move frame) or a token: `'0'`, `'s'` (first active frame), `'a'` (last active frame), `'e'` (last frame), with offsets like `'s-3'`, `'a+2'`. Pose is either a library name (`'stance'`, `'crouch'`, `'fall'`, any generic like `'hitHigh'`) or a partial object merged over the move's base pose (stance / crouch / fall). Eases: `out` (default), `in`, `io`, `snap`, `lin`.

**VFX API** (`ctx.vfx`, world metres; convert sim units with `ctx.S2M`): `burst({ x, y, z, count, color, color2, speed, size, size1, life, gravity, drag, dir, spread, shape: 'spark'|'soft'|'shard'|'smoke'|'star'|'ring', stretch, additive, intensity, jx, jy, floor })`, `particle(...)`, `ring({ x, y, z, color, r0, r1, life, thick, axis: 'z'|'y'|'x' })`, `flash({ x, y, color, size, life, grow })`, `light({ x, y, color, intensity, life, distance })`, `beam({ x0, y0, x1, y1, color, width, life })`, `pillar({ x, y, color, height, radius, life })`, `shake(amount, dur)`, `custom(object3d, life, (obj, u, dt) => {})`.

Events your `onEvent` receives (all have `t`, `f`, `p`): `cast {s, id}`, `spawn {id, k, x, y}`, `ent_end {id, k, why}`, `hit {v, x, y, str, d, k (entity kind if projectile)}`, `cine {k, ...}` (emit your own with `ev(G, 'cine', { p: f.i, k: 'myKey' })` from sim scripts), `lock {id}`, `release`, `buff {k}`, `ult`, `swing {str, id}`.

## 5. Testing

- Pose sheet: `/dev/poses.html?hero=<id>&mode=moves` (and `&mode=misc`). Red boxes = active hitboxes. `&moves=Q,W&at=w,s,a,r,12` picks moves/frames.
- Sandbox: `/dev/sandbox.html?p1=<id>&p2=aldric&ai=2&lvl=2` (play with WASD + J K L / U I O / Space / Shift). Screenshot mode: `&ai=&script=10:Q,40:W&frames=60` runs 60 frames deterministically.
- Headless sim: `node tools/simtest.mjs <heroA> <heroB>`.
