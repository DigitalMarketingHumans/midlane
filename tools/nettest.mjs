// Rollback netcode soak test: two sessions connected through a simulated network
// with latency, jitter and clock drift, both driven by CPU AIs. Verifies that the
// periodic state-hash checkpoints always agree (no desync) and reports stats.
//   node tools/nettest.mjs [heroA] [heroB] [latencyFrames] [jitterFrames] [delay]
import { createGame } from '../public/src/sim/game.js';
import { AI } from '../public/src/sim/ai.js';
import { RollbackSession } from '../public/src/net/rollback.js';

const [ha = 'aldric', hb = 'kaida', lat = 3, jit = 3, delay = 1] = process.argv.slice(2);
let seedR = 12345;
const rnd = () => { seedR ^= seedR << 13; seedR ^= seedR >>> 17; seedR ^= seedR << 5; return (seedR >>> 0) / 4294967296; };

const cfg = { heroes: [ha, hb], seed: 4242, stage: 'river' };
const queues = [[], []]; // messages in flight to client i: { at, m }
let tick = 0;
const mk = (i) => new RollbackSession({
  G: createGame(cfg), local: i, delay: +delay,
  send: (m) => queues[1 - i].push({ at: tick + (+lat) + Math.floor(rnd() * (+jit + 1)), m: JSON.parse(JSON.stringify(m)) }),
});
const S = [mk(0), mk(1)];
const ais = [new AI(0, 2, 101), new AI(1, 2, 202)];
let checked = 0;
const origCheck = RollbackSession.prototype.checkHash;
for (const s of S) s.checkHash = function (f) { if (this.hashes.has(f) && this.remoteHashes.has(f)) checked++; return origCheck.call(this, f); };

const t0 = Date.now();
while (tick < 60 * 60 * 6) {
  tick++;
  for (let i = 0; i < 2; i++) {
    // deliver due messages (TCP: in order)
    const q = queues[i];
    while (q.length && q[0].at <= tick) S[i].onMessage(q.shift().m);
  }
  for (let i = 0; i < 2; i++) {
    // clock drift: client 1 occasionally runs an extra or missing frame
    const n = i === 1 ? (rnd() < 0.01 ? 2 : rnd() < 0.01 ? 0 : 1) : 1;
    for (let k = 0; k < n; k++) S[i].tick(ais[i].think(S[i].G), []);
  }
  // keep message delivery order monotonic per queue
  for (const q of queues) q.sort((a, b) => a.at - b.at);
  if (S[0].G.phase === 'over' && S[1].G.phase === 'over') break;
}
const info = S.map((s) => s.info());
console.log(`${ha} vs ${hb} | latency ${lat}+${jit}f, delay ${delay} | ticks ${tick} (${Date.now() - t0} ms)`);
console.log('phase', S.map((s) => s.G.phase).join('/'), 'wins', S[0].G.wins.join('-'), '/', S[1].G.wins.join('-'));
console.log('hash checkpoints compared:', checked, '| desync:', info.map((x) => x.desync).join('/'));
console.log('client0', JSON.stringify(info[0]));
console.log('client1', JSON.stringify(info[1]));
if (info.some((x) => x.desync >= 0)) process.exit(1);
