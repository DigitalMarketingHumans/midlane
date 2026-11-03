// Deterministic xorshift32 RNG whose state lives inside the game state.
export function rngNext(G) {
  let x = G.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  G.rng = x >>> 0;
  return G.rng;
}
// integer in [0, n)
export function rngInt(G, n) {
  return rngNext(G) % n;
}
export function rngRange(G, a, b) {
  return a + rngInt(G, b - a + 1);
}
