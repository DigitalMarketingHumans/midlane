// `npm test` — headless checks that keep the game honest:
//   1. every hero matchup survives a random-input soak test and is bit-for-bit deterministic
//   2. two rollback clients over a laggy, jittery fake network never desync
//   3. the CPU AI can finish a full match (shop, rounds, KO) for every hero
//   4. the LAN server serves the game and relays lobby messages over WebSocket
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGame, step, hashState } from '../public/src/sim/game.js';
import { HERO_LIST } from '../public/src/sim/heroes/index.js';
import { AI } from '../public/src/sim/ai.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let failed = 0;
const ok = (name, detail = '') => console.log(`  \x1b[32m✔\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ''}`);
const bad = (name, detail = '') => { failed++; console.log(`  \x1b[31m✘ ${name}\x1b[0m ${detail}`); };

function rnd(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function soak(a, b, seed, frames) {
  const G = createGame({ heroes: [a, b], seed });
  const r = rnd(seed * 31 + 7);
  const held = [0, 0];
  for (let i = 0; i < frames && G.phase !== 'over'; i++) {
    for (let p = 0; p < 2; p++) if (r() < 0.12) held[p] = (r() * 4096) | 0;
    step(G, held, []);
  }
  return hashState(G);
}

console.log('\nDeterminism (random-input soak, every matchup)');
for (const a of HERO_LIST) {
  const results = [];
  for (const b of HERO_LIST) {
    try {
      const h1 = soak(a, b, 1234, 5000), h2 = soak(a, b, 1234, 5000);
      if (h1 !== h2) bad(`${a} vs ${b}`, 'hashes differ between identical runs');
      else results.push(b);
    } catch (e) { bad(`${a} vs ${b}`, e.stack); }
  }
  if (results.length === HERO_LIST.length) ok(`${a} vs everyone`);
}

console.log('\nCPU matches run to completion');
for (const a of HERO_LIST) {
  const b = HERO_LIST[(HERO_LIST.indexOf(a) + 3) % HERO_LIST.length];
  const G = createGame({ heroes: [a, b], seed: 99 });
  const ais = [new AI(0, 2, 5), new AI(1, 2, 6)];
  try {
    let ults = 0;
    while (G.phase !== 'over' && G.frame < 60 * 60 * 8) {
      const ev = [];
      step(G, [ais[0].think(G), ais[1].think(G)], ev);
      for (const e of ev) if (e.t === 'ult') ults++;
    }
    if (G.phase === 'over') ok(`${a} vs ${b}`, `${G.round} rounds, ${(G.frame / 60).toFixed(0)}s, ${ults} ultimates, winner ${G.fighters[G.winner].h}`);
    else bad(`${a} vs ${b}`, 'match did not finish');
  } catch (e) { bad(`${a} vs ${b}`, e.stack); }
}

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
}

console.log('\nRollback netcode (fake network: latency + jitter + clock drift)');
for (const [a, b, lat, jit, delay] of [['aldric', 'kaida', 2, 2, 1], ['ysolde', 'brakka', 4, 4, 1], ['orren', 'wren', 7, 6, 2]]) {
  const { code, out } = await run(process.execPath, ['tools/nettest.mjs', a, b, lat, jit, delay]);
  const line = (out.match(/client0 .*/) || [''])[0];
  const info = line ? JSON.parse(line.slice(8)) : {};
  if (code === 0) ok(`${a} vs ${b} @ ${lat}+${jit} frames lag, delay ${delay}`, `${info.rollbacks} rollbacks, max depth ${info.maxRb}, no desync`);
  else bad(`${a} vs ${b} @ ${lat}+${jit}`, out);
}

console.log('\nLAN server');
{
  const port = 20000 + Math.floor(Math.random() * 20000);
  const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' } });
  await new Promise((r) => setTimeout(r, 600));
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    const html = await page.text();
    if (page.ok && html.includes('MIDLANE')) ok('serves the game'); else bad('serves the game', String(page.status));
    const traversal = await fetch(`http://127.0.0.1:${port}/..%2f..%2fserver.js`);
    if (traversal.status !== 200) ok('blocks path traversal'); else bad('blocks path traversal');
    const junk = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    const alive = await fetch(`http://127.0.0.1:${port}/api/info`).then((r) => r.ok, () => false);
    if (junk.status === 400 && alive) ok('survives malformed URLs'); else bad('survives malformed URLs', String(junk.status));
    const info = await (await fetch(`http://127.0.0.1:${port}/api/info`)).json();
    if (info.port === port) ok('reports its port and LAN addresses'); else bad('api/info', JSON.stringify(info));
    if (typeof WebSocket !== 'undefined') {
      const open = (name) => new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const inbox = [];
        ws.onmessage = (m) => inbox.push(JSON.parse(m.data));
        ws.onopen = () => { ws.send(JSON.stringify({ t: 'hello', name })); resolve({ ws, inbox }); };
        ws.onerror = reject;
      });
      const wait = (inbox, t) => new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => { const m = inbox.find((x) => x.t === t); if (m) resolve(m); else if (Date.now() - t0 > 2000) reject(new Error(`no ${t}`)); else setTimeout(tick, 20); };
        tick();
      });
      const A = await open('Host'), B = await open('Guest');
      A.ws.send(JSON.stringify({ t: 'create' }));
      await wait(A.inbox, 'joined');
      const rooms = await new Promise((resolve) => setTimeout(() => resolve([...B.inbox].reverse().find((m) => m.t === 'rooms' && m.rooms.length)), 200));
      B.ws.send(JSON.stringify({ t: 'join', room: rooms.rooms[0].id }));
      await wait(A.inbox, 'peer_joined');
      B.ws.send(JSON.stringify({ t: 'in', i: [[3, 16]], cf: 2, adv: 0 }));
      const relayed = await wait(A.inbox, 'in');
      if (relayed.i[0][1] === 16) ok('lobby: host, join and relay inputs over WebSocket'); else bad('relay');
      A.ws.close(); B.ws.close();
    } else ok('WebSocket relay test skipped (needs Node 22+)');
  } catch (e) { bad('server', e.stack); }
  srv.kill();
}

console.log(failed ? `\n\x1b[31m${failed} check(s) failed\x1b[0m\n` : '\n\x1b[32mAll checks passed.\x1b[0m\n');
process.exit(failed ? 1 : 0);
