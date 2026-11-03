<div align="center">

<img src="docs/media/title.jpg" alt="MIDLANE title screen" width="100%">

# MIDLANE

**Six heroes. One lane. No mercy.**

A 2.5D fighting game for the browser where MOBA heroes settle things Street Fighter style.
Level up mid-fight, buy items between rounds, unleash your ultimate, and beat your friend over the LAN with rollback netcode.

[![CI](https://github.com/howmuchcomputer/midlane/actions/workflows/ci.yml/badge.svg)](https://github.com/howmuchcomputer/midlane/actions/workflows/ci.yml)
![zero runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-brightgreen)
![no build step](https://img.shields.io/badge/build%20step-none-blue)
[![MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

<img src="docs/media/ultimate.gif" alt="Orren casting Supernova Lance" width="100%">

</div>

---

## 🎮 Get fighting in 30 seconds

You need [Node.js](https://nodejs.org) 18 or newer. That's it. No `npm install`, no bundler, no build step.

```bash
git clone https://github.com/howmuchcomputer/midlane.git
cd midlane
npm start            # or: node server.js
```

```
  ⚔  MIDLANE server running

     Local:   http://localhost:7878
     LAN:     http://192.168.1.23:7878   (en0)
```

Open the **Local** link. Press any key. Pick a hero. Hit things.

## 🤝 Beat up a friend (LAN)

1. Run the server on one machine.
2. You open the **Local** link; your friend opens the **LAN** link on their laptop (same Wi-Fi).
3. Both go to **LAN Battle**. One of you clicks **Host a lane**, the other clicks it in the list to join.
4. Pick heroes, the host picks the arena, and settle it.

Inputs travel over **GGPO-style rollback netcode**. Your own inputs apply instantly, your friend's are predicted, and any wrong guesses get quietly rewound and replayed. On home Wi-Fi it's usually 1 to 3 frames of rollback, so it feels like you're on the same couch. The small `ping · rb` readout under the timer shows how it's doing.

> **On a Mac?** The first time you run it, macOS asks if `node` can accept incoming connections. Click **Allow** or your friend will be shouting "it won't load" at you.
>
> **Port 7878 taken?** The server hops to the next free port and tells you. To pick one yourself: `PORT=8080 npm start`.

---

## ⚔️ The roster

<img src="docs/media/select.jpg" alt="Character select" width="100%">

| | Hero | Plays like | Ultimate |
|---|---|---|---|
| ☀️ | **Aldric**, the Sunforged | The all-rounder. Fireball, invincible uppercut, armoured charge. Learn him first. | **Heaven's Verdict** |
| 🌙 | **Ysolde**, the Duskblade | Rushdown menace. Low dashes, overhead flips, shadow clones that make you guess wrong. | **Thousand Shadows** |
| ⭐ | **Orren**, the Starwright | Space wizard zoner. Angled star bolts, a gravity well that drags you in, short teleport. | **Supernova Lance** |
| 🔨 | **Brakka**, the Iron Bastion | Walking fortress. Shrugs off hits, shockwaves the floor, and grabs you when you block. | **Colossus Slam** |
| ❄️ | **Kaida**, the Frostborn | Berserker with a very long axe. Ice waves, and she hits harder the more hurt she is. | **Frostquake** |
| 🌿 | **Wren**, the Thornwarden | Trapper. Long whip, root seeds, vaults over your head on a vine. | **Heartwood Colossus** |

Every hero has a passive, three abilities, an ultimate, a full set of normals, and a throw. Pause → **Move list** shows the whole kit with frame data.

### Four arenas

| | |
|---|---|
| <img src="docs/media/stage-river.jpg" alt="Riverbank at Dusk"> **Riverbank at Dusk** | <img src="docs/media/stage-frost.jpg" alt="Frostfang Summit"> **Frostfang Summit** |
| <img src="docs/media/stage-forge.jpg" alt="The Molten Forge"> **The Molten Forge** | <img src="docs/media/stage-astral.jpg" alt="Astral Sanctum"> **Astral Sanctum** |

---

## 🕹️ Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / jump / crouch | `W` `A` `S` `D` or arrows | Left stick / D-pad |
| Light · Medium · Heavy | `J` · `K` · `L` | X · Y · RB |
| Abilities Q · W · E | `U` · `I` · `O` | A · B · RT |
| **Ultimate** | `Space` | LB |
| Dash / Dispel / Rush | `Shift` (hold back to backdash) | LT |
| Throw | `J`+`K` or `H` | X+Y |
| Pause | `Esc` | Start |

- **Block** by holding away from your opponent. Crouch to block lows, stand to block overheads.
- **Two players, one keyboard:** P1 gets `WASD` + `F G H` / `R T Y` / `V` / `LShift`; P2 gets the arrows + `, . /` / `K L ;` / `'` / `RShift`. Two gamepads also work.
- Everything is rebindable in **Options**.

## 🧠 It's deeper than it looks

<img src="docs/media/fight.jpg" alt="Ysolde vs Brakka in the Molten Forge" width="100%">

**The fighting game part**
- Light → Medium → Heavy **chains**, normals **cancel into abilities**, some abilities cancel into your **ultimate**.
- **Rush cancel:** dash out of a normal that connects (costs mana) to keep the pressure going.
- **Throws** beat blocking, strikes beat throws, and you can **tech** a throw by throwing right back.
- **Counter hits**, **punish counters**, juggles, combo scaling, invulnerable backdashes, reversals, quick rise.
- **Dispel:** dash while you're being comboed or blocking to blast the attacker away. Your get-out-of-jail card, paid for with mana.

**The MOBA part**
- **Mana and cooldowns** on every ability. Spam carefully.
- **Levels 1 to 6 inside a match.** Dealing and taking damage earns XP. Abilities rank up, and your **ultimate unlocks at level 4**.
- **Gold and items.** Earn gold from damage, combos and rounds (the loser gets comeback gold). Spend it in the **Strategy phase** and between rounds: 12 items, 4 slots.
- **Runes** spawn mid-round: Fury, Haste, Renewal, Insight, Fortune. Fight over them.

<img src="docs/media/shop.jpg" alt="Strategy phase item shop" width="100%">

**Modes:** Versus CPU (Easy, Normal, Hard, Legend) · Local Versus · LAN Battle · Training (infinite mana, dummy settings, frame advantage readout, **hitbox overlay**).

---

## 🛠️ Build on it

Everything is plain ES modules served straight from `public/`. Edit a file, refresh the browser, done. All the models, animations, arenas, music and sound effects are generated in code, so there are no asset pipelines to fight.

```mermaid
flowchart LR
  subgraph A["Browser A"]
    IA[Input] --> RA[Rollback session]
    RA --> SA["Sim · 60 Hz<br/>integer-only, deterministic"]
    SA --> VA["Renderer<br/>three.js + bloom"]
  end
  subgraph B["Browser B"]
    IB[Input] --> RB[Rollback session]
    RB --> SB["Sim · 60 Hz"]
    SB --> VB[Renderer]
  end
  RA <-- "inputs over WebSocket" --> S["server.js<br/>static files + lobby relay"]
  S <--> RB
```

The simulation is **integer-only and fully deterministic**: no floating-point positions, no `Math.random`, no clock. Two browsers given the same inputs land on the same state bit for bit, which is what makes rollback work. The renderer just draws whatever state the sim hands it.

```
server.js                  Zero-dependency HTTP server + WebSocket lobby/relay
public/index.html          Entry point (import map → vendored three.js)
public/src/sim/            The game: fighters, combat, items, runes, CPU AI   (deterministic!)
public/src/sim/heroes/     Hero kits: frame data, hitboxes, abilities, grabs
public/src/net/            Rollback session + WebSocket client
public/src/render/         three.js renderer: IK rig, cel shading, VFX, camera, post-processing
public/src/render/heroes/  Hero models, animation timelines, ability effects
public/src/render/stages/  The four arenas
public/src/audio/          Procedural sound effects + music sequencer
public/src/ui/             Menus, character select, lobby, HUD, shop
tools/                     Tests, soak tests, balance simulator
docs/HEROES.md             How to make your own hero
```

### Add your own hero

A hero is two files: a **sim** file (stats, frame data, hitboxes, abilities) and a **render** file (model, poses, effects). [`docs/HEROES.md`](docs/HEROES.md) walks through it, and Aldric is the reference implementation to copy. Register both in their folder's `index.js` and your hero shows up in character select. Fill in a few AI hints and the CPU can play them too, and because the sim is deterministic, LAN play just works.

### Tests and tools

```bash
npm install       # dev tools only (ESLint); the game itself needs nothing
npm test          # determinism soak for all 36 matchups, rollback over a fake laggy network,
                  # CPU matches for every hero, and the LAN server + WebSocket lobby
npm run lint

node tools/balance.mjs 8 2                # CPU round-robin: win rates, match length, ult timing
node tools/simtest.mjs kaida wren 20000   # random-input soak + determinism check for one matchup
node tools/nettest.mjs orren brakka 6 6 2 # two rollback clients, 6±6 frames of lag, input delay 2
```

With the server running, there are dev pages too:

- `/dev/sandbox.html?p1=ysolde&p2=kaida&stage=forge`: a raw fight sandbox
- `/dev/poses.html?hero=brakka`: every animation as a contact sheet with hitboxes drawn on
- `/dev/stage.html?stage=astral`, `/dev/icons.html`, `/dev/audio.html`: arenas, icons, every sound

CI runs lint and tests on every push and pull request.

### Ideas if you're looking for something to build

- A seventh hero (a summoner? a hook-thrower?)
- Online play beyond the LAN (the relay is tiny, it just needs hosting)
- Replays. The sim is deterministic, so a replay is just the seed plus the input log.
- A spectator mode, an arcade ladder, or a tournament bracket for game night

---

## 🩹 Troubleshooting

- **Friend can't connect:** they need the **LAN** address, not `localhost`. Check you're on the same network and that the macOS firewall let `node` through. Some guest and office networks block device-to-device traffic.
- **Choppy frame rate:** Options → Graphics → Performance, then reload.
- **No sound:** browsers only start audio after you interact, so press a key on the title screen.

## 📜 License

[MIT](LICENSE). Go wild.

All heroes, arenas and code are original. Bundled third-party bits: [three.js](https://threejs.org) (MIT, see `public/vendor/three/LICENSE`) and the Cinzel, Cinzel Decorative and Rajdhani fonts (SIL Open Font License, see `public/vendor/fonts/LICENSE-OFL.txt`).
