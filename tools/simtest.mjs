// Headless smoke test: random-input matches + determinism check.
//   node tools/simtest.mjs [heroA] [heroB] [frames]
import { createGame, step, hashState } from '../public/src/sim/game.js';
import { HERO_LIST } from '../public/src/sim/heroes/index.js';
const [ha = 'aldric', hb = 'aldric', frames = 20000] = process.argv.slice(2);
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function run(seed) {
  const G = createGame({ heroes: [ha, hb], seed: 99 });
  const r = rnd(seed); const held = [0, 0]; const counts = {};
  for (let i = 0; i < +frames; i++) {
    for (let p = 0; p < 2; p++) if (r() < 0.12) held[p] = (r() * 4096) | 0;
    const out = []; step(G, held, out);
    for (const e of out) counts[e.t] = (counts[e.t] || 0) + 1;
    if (G.phase === 'over') break;
  }
  return { G, counts };
}
const a = run(7), b = run(7);
console.log('heroes', HERO_LIST.join(','), '| test', ha, 'vs', hb);
console.log('frame', a.G.frame, 'phase', a.G.phase, 'round', a.G.round, 'wins', a.G.wins.join('-'), 'deterministic', hashState(a.G) === hashState(b.G));
console.log(JSON.stringify(a.counts));
if (hashState(a.G) !== hashState(b.G)) process.exit(1);
