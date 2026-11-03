// CPU round-robin balance report.
//   node tools/balance.mjs [matchesPerPair=6] [aiLevel=2]
import { createGame, step } from '../public/src/sim/game.js';
import { AI } from '../public/src/sim/ai.js';
import { HERO_LIST } from '../public/src/sim/heroes/index.js';
import { ULT_LEVEL } from '../public/src/sim/const.js';

const N = +(process.argv[2] || 6), LVL = +(process.argv[3] || 2);
const wins = {}, games = {}, matrix = {};
let frames = 0, matches = 0, ults = 0, rounds = 0, timeouts = 0, endLv = 0;
const ultLvFrame = [], dmg = {};
for (const a of HERO_LIST) { wins[a] = 0; games[a] = 0; matrix[a] = {}; dmg[a] = [0, 0]; }
let seed = 1;
const t0 = Date.now();
for (const a of HERO_LIST) for (const b of HERO_LIST) {
  if (a === b) continue;
  for (let k = 0; k < N; k++) {
    const G = createGame({ heroes: [a, b], seed: seed++ });
    const ais = [new AI(0, LVL, seed * 3), new AI(1, LVL, seed * 7)];
    let firstUlt = -1;
    while (G.phase !== 'over' && G.frame < 60 * 60 * 8) {
      const out = [];
      step(G, [ais[0].think(G), ais[1].think(G)], out);
      for (const e of out) {
        if (e.t === 'levelup' && e.lv === ULT_LEVEL && firstUlt < 0) firstUlt = G.frame;
        if (e.t === 'ult') ults++;
        if (e.t === 'timeup') timeouts++;
        if (e.t === 'round') rounds++;
      }
    }
    const w = G.winner;
    games[a]++; games[b]++;
    if (w >= 0) { const wh = G.fighters[w].h; wins[wh]++; matrix[a][b] = (matrix[a][b] || 0) + (w === 0 ? 1 : 0); }
    frames += G.frame; matches++;
    if (firstUlt > 0) ultLvFrame.push(firstUlt);
    endLv += (G.fighters[0].lv + G.fighters[1].lv) / 2;
    for (const f of G.fighters) { dmg[f.h][0] += f.st.dealt; dmg[f.h][1]++; }
  }
}
console.log(`${matches} matches at AI level ${LVL} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('win rate:', HERO_LIST.map((h) => `${h} ${(wins[h] / games[h] * 100).toFixed(0)}%`).join(' | '));
console.log('avg dmg dealt/match:', HERO_LIST.map((h) => `${h} ${Math.round(dmg[h][0] / dmg[h][1])}`).join(' | '));
console.log(`avg match ${(frames / matches / 60).toFixed(1)}s, rounds/match ${(rounds / matches).toFixed(2)}, timeouts ${timeouts}, ults/match ${(ults / matches).toFixed(2)}, end level ${(endLv / matches).toFixed(2)}`);
ultLvFrame.sort((x, y) => x - y);
console.log(`first ult unlock: median ${(ultLvFrame[ultLvFrame.length >> 1] / 60).toFixed(1)}s into the match (incl. shop phases)`);
console.log('P1-side wins vs (row=P1 hero):');
for (const a of HERO_LIST) console.log(a.padEnd(7), HERO_LIST.map((b) => (a === b ? ' -' : String(matrix[a][b] || 0).padStart(2))).join(' '));
