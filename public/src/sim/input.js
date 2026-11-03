// Input bitfield shared by keyboard, gamepad, AI and network.
export const UP = 1, DOWN = 2, LEFT = 4, RIGHT = 8;
export const B_L = 16;   // light attack
export const B_M = 32;   // medium attack
export const B_H = 64;   // heavy attack
export const B_Q = 128;  // ability 1
export const B_W = 256;  // ability 2
export const B_E = 512;  // ability 3
export const B_R = 1024; // ultimate
export const B_S = 2048; // mobility: dash / dispel / rush-cancel

export const BTNS = [B_L, B_M, B_H, B_Q, B_W, B_E, B_R, B_S];
export const BI = { L: 0, M: 1, H: 2, Q: 3, W: 4, E: 5, R: 6, S: 7 };
export const DIRS = UP | DOWN | LEFT | RIGHT;

// Clean simultaneous opposite directions (SOCD): L+R = neutral, U+D = up.
export function cleanInput(bits) {
  if ((bits & LEFT) && (bits & RIGHT)) bits &= ~(LEFT | RIGHT);
  if ((bits & UP) && (bits & DOWN)) bits &= ~DOWN;
  return bits;
}

// Mirror horizontal directions (used by AI that thinks in "forward/back").
export function mirror(bits) {
  const l = bits & LEFT, r = bits & RIGHT;
  bits &= ~(LEFT | RIGHT);
  if (l) bits |= RIGHT;
  if (r) bits |= LEFT;
  return bits;
}
