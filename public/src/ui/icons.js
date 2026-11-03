// MIDLANE icon set — hand-authored vector glyphs on a 64×64 grid.
//
// Style rules (keep new glyphs consistent):
//  • One bold primary silhouette in currentColor, ~44–52 units across, centred on (32,32).
//  • Secondary elements at opacity .45–.6, tertiary at ~.3 (motion lines, sparks, glows).
//  • Line work uses a 5-unit round stroke (4 for secondary, 3 for fine detail).
//  • Cut-outs (finger gaps, facets, eye holes) are 2–3 units wide, done with a luminance
//    mask whose id is unique per call, so glyphs can be inlined many times on one page.
//
//   glyph(name)                → inner SVG markup for a 64×64 viewBox (currentColor)
//   iconSVG(name, opts)        → standalone framed icon SVG string
//   iconDataURL(name, opts)    → 'data:image/svg+xml,…' for <img> / CSS

// Ids are unique per call and namespaced (masks vs. frame defs) so inlined icons never collide.
let UID = 0;
const uid = (p = 'mlm') => p + (++UID).toString(36) + '_';
const n = (v) => Math.round(v * 100) / 100;
const D2R = Math.PI / 180;
const polar = (cx, cy, r, deg) => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)];
const poly = (a) => 'M' + a.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + 'Z';
const line = (a) => 'M' + a.map(([x, y]) => `${n(x)} ${n(y)}`).join('L');
const circ = (cx, cy, r) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
const ell = (cx, cy, rx, ry) => `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 0 ${n(2 * rx)} 0a${n(rx)} ${n(ry)} 0 1 0 ${n(-2 * rx)} 0Z`;
function rr(x, y, w, h, r = 0) {
  r = Math.min(r, w / 2, h / 2);
  if (!r) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`;
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}
const starPts = (cx, cy, k, ro, ri, rot = -90) => { const a = []; for (let i = 0; i < 2 * k; i++) a.push(polar(cx, cy, i % 2 ? ri : ro, rot + (i * 180) / k)); return a; };
const op = (o) => (o != null && o !== 1 ? ` opacity="${o}"` : '');
// Direct markup (inherits fill=currentColor from the wrapping group)
const F = (d, o) => `<path d="${d}"${op(o)}/>`;
const S = (d, w = 5, o, extra = '') => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${op(o)}${extra}/>`;
const T = (tf, inner) => `<g transform="${tf}">${inner}</g>`;
// Mask content: white = ink, black = cut
const W = (d) => `<path d="${d}" fill="#fff"/>`;
const K = (d) => `<path d="${d}" fill="#000"/>`;
const WS = (d, w = 5) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const KS = (d, w = 2.5) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
function M(inner, o) {
  const i = uid();
  return `<mask id="${i}" maskUnits="userSpaceOnUse" x="-8" y="-8" width="80" height="80"><rect x="-8" y="-8" width="80" height="80" fill="#000"/>${inner}</mask><rect x="-8" y="-8" width="80" height="80" fill="currentColor" mask="url(#${i})"${op(o)}/>`;
}

// ---------------------------------------------------------------------------
// Shared parts
const FIST_W = W(rr(13, 14, 10.5, 20, 5.2)) + W(rr(22.5, 10.5, 10.5, 22, 5.2)) + W(rr(32, 10.5, 10.5, 22, 5.2)) + W(rr(41.5, 13.5, 9.5, 19, 4.75))
  + W(rr(13, 22, 38, 24, 8)) + W(rr(11.5, 29, 28, 10.5, 5.25));
const FIST_K = KS('M22.75 15.5V25M32.25 12.5V24M41.75 15.5V25', 2.6) + KS(rr(11.5, 29, 28, 10.5, 5.25), 2.6);
const fist = (wrist = true) => FIST_W + (wrist ? W(rr(19, 42, 26, 15, 3)) : '') + FIST_K + (wrist ? KS('M18 45.5H46', 2.6) : '');
const bustW = (x, y) => W(circ(x, y - 12, 8.5)) + W(`M${x - 15} ${y + 22}C${x - 15} ${y + 5} ${x - 8} ${y} ${x} ${y}C${x + 8} ${y} ${x + 15} ${y + 5} ${x + 15} ${y + 22}Z`);
const bustK = (x, y, w = 4) => K(circ(x, y - 12, 8.5)) + KS(circ(x, y - 12, 8.5), w) + K(`M${x - 15} ${y + 22}C${x - 15} ${y + 5} ${x - 8} ${y} ${x} ${y}C${x + 8} ${y} ${x + 15} ${y + 5} ${x + 15} ${y + 22}Z`)
  + KS(`M${x - 15} ${y + 22}C${x - 15} ${y + 5} ${x - 8} ${y} ${x} ${y}C${x + 8} ${y} ${x + 15} ${y + 5} ${x + 15} ${y + 22}`, w);
const spark = (x, y, r, o = 0.7) => F(poly(starPts(x, y, 4, r, r * 0.3)), o);
const leafD = (len, wid) => `M0 0C${n(len * 0.3)} ${n(-wid)} ${n(len * 0.75)} ${n(-wid)} ${n(len)} 0C${n(len * 0.75)} ${n(wid)} ${n(len * 0.3)} ${n(wid)} 0 0Z`;
const leafAt = (x, y, deg, len, wid) => `<path transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})" d="${leafD(len, wid)}"/>`;
const chevron = (x) => poly([[x, 13], [x + 11, 13], [x + 25, 32], [x + 11, 51], [x, 51], [x + 14, 32]]);
const dagger = () => W('M32 4L37.5 12V36.5H26.5V12Z') + W(rr(20, 35.5, 24, 5.5, 2.75)) + W(rr(28.5, 40.5, 7, 11, 2)) + W(circ(32, 55, 4));
const daggerK = () => KS('M32 4L37.5 12V36.5H26.5V12Z', 3.5) + KS(rr(20, 35.5, 24, 5.5, 2.75), 3.5) + KS(rr(28.5, 40.5, 7, 11, 2), 3.5) + KS(circ(32, 55, 4), 3.5)
  + K('M32 4L37.5 12V36.5H26.5V12Z') + K(rr(20, 35.5, 24, 5.5, 2.75)) + K(rr(28.5, 40.5, 7, 11, 2)) + K(circ(32, 55, 4));
function spiralLine(cx, cy, turns, r0, r1, a0 = -90) {
  const pts = [], N = Math.round(turns * 40);
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(polar(cx, cy, r0 + (r1 - r0) * t, a0 + t * turns * 360)); }
  return line(pts);
}
function laurel(side) {
  // side = -1 left, +1 right; stem from bottom centre curving up and out
  const P = (t) => { const x0 = 32 + side * 4, y0 = 58, x1 = 32 + side * 26, y1 = 34, x2 = 32 + side * 16, y2 = 8; const u = 1 - t; return [u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]; };
  let out = S(line(Array.from({ length: 21 }, (_, i) => P(i / 20))), 3.5);
  for (let i = 1; i <= 6; i++) {
    const t = i / 6.6, p = P(t), q = P(t + 0.02);
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]) / D2R;
    out += leafAt(p[0], p[1], dir - side * 52, 11 - i * 0.5, 3.6);
    out += leafAt(p[0], p[1], dir + side * 40, 10 - i * 0.6, 3.3);
  }
  return out;
}

// ---------------------------------------------------------------------------
const G = {
  // ---- strikes & motion -------------------------------------------------
  arc: () => F('M22 6A26 26 0 0 1 22 58A30 30 0 0 0 22 6Z') + S('M5 22H13', 4, 0.5) + S('M3 32H16', 4, 0.75) + S('M5 42H13', 4, 0.5) + spark(53, 12, 6),
  uppercut: () => M(T('translate(17 1) scale(.72)', fist())) + S('M8 60C9 44 15 34 26 29', 5, 0.55) + S('M17 62C19 52 24 46 33 43', 4, 0.3),
  charge: () => F(chevron(28)) + F(chevron(14), 0.5) + F(chevron(0), 0.22),
  dash: () => S('M4 22H17M2 32H13M4 42H17', 4, 0.45) + F(rr(18, 26, 22, 12, 4)) + F('M36 14C36 11 39 9.5 41.5 11.5L59 28.5C61.5 30.5 61.5 33.5 59 35.5L41.5 52.5C39 54.5 36 53 36 50Z') + F(rr(9, 28, 6, 8, 3), 0.25),
  leap: () => S('M9 52Q28 -2 50 38', 5) + F(poly([[56, 50], [42, 40], [55, 34]])) + F(circ(9, 57, 4), 0.5) + F(circ(17, 59, 2.8), 0.35) + S('M48 58H60', 4, 0.45),
  stomp: () => M(W('M18 4H38V31L51 35C57 37 58 45 52 46H18Z') + W(rr(16, 45, 40, 7, 2.5)) + KS('M18 12H38', 2.4) + KS('M38 31C34 33 33 37 34 41', 2))
    + S('M3 58H61', 4, 0.5) + S('M9 48L4 43M10 54L3 54M56 40L61 35', 3.5, 0.55),
  fist: () => M(T('translate(-2 3)', fist())) + S('M54 9L59 4M57 19L62 17M47 4L48 -1', 3.5, 0.55),
  grab: () => M(W(rr(15, 30, 31, 21, 9)) + WS('M20 34L16.5 17L20 11', 6.5) + WS('M27 32L26 11L29.5 5', 6.5) + WS('M34.5 32L36 11L40 6', 6.5)
    + WS('M41.5 34L46 18L50 14', 6.5) + WS('M19 45L10 36L9.5 28', 6.5) + W(rr(22, 47, 17, 13, 3)) + KS('M21 49.5H40', 2.2)) + S('M54 30C58 34 58 42 54 46', 3.5, 0.5),
  claw: () => F('M8 57C18 44 29 28 41 6C37 26 29 43 15 59Z') + F('M18 59C28 46 39 30 51 8C47 28 39 45 25 61Z') + F('M28 60C38 48 48 34 60 13C56 31 49 46 35 62Z', 1),
  whip: () => T('rotate(-42 13 52)', F(rr(7, 42, 12, 20, 4)) + F(rr(6, 40, 14, 4, 2))) + S('M19 44C26 36 34 40 40 34', 5) + S('M40 34C46 28 42 20 48 14', 3.8) + S('M48 14C51 11 55 11 56 14', 2.6) + spark(57, 18, 6.5, 0.85) + S('M28 52C36 52 42 48 46 42', 3, 0.3),
  frenzy: () => [0, 90, 180, 270].map((r) => T(`rotate(${r} 32 32)`, S('M27.5 8.5Q24.5 24.5 8.5 27.5', 6.5))).join('') + spark(32, 32, 8.5, 0.9) + S('M50 6L54 2M58 14L62 12', 3, 0.45),
  // ---- light / celestial ---------------------------------------------------
  pillar: () => F(rr(20, 3, 24, 58, 12), 0.2) + F('M25 54V13A7 7 0 0 1 39 13V54Z') + F(rr(16, 52, 32, 7, 3.5)) + S('M13 16V46M51 16V46', 3.5, 0.45) + spark(32, 8, 5, 0.9),
  sun: () => F(circ(32, 32, 11.5)) + Array.from({ length: 8 }, (_, i) => { const a = i * 45; return F(poly([polar(32, 32, 15, a - 10), polar(32, 32, i % 2 ? 23.5 : 29, a), polar(32, 32, 15, a + 10)])); }).join(''),
  moon: () => M(W(circ(30, 32, 25)) + K(circ(43, 25, 20))) + spark(51, 45, 6.5) + spark(56, 29, 3.5, 0.55),
  star: () => F(poly(starPts(32, 34, 5, 28, 11.5))) + spark(54, 9, 5, 0.6),
  comet: () => F(poly([[3, 3], [47.6, 33.6], [33.6, 47.6]]), 0.35) + F(poly([[16, 16], [49, 35], [35, 49]]), 0.7) + F(circ(42, 42, 10.5)) + spark(14, 44, 4, 0.5),
  orbit: () => M(T('rotate(-28 32 32)', WS(ell(32, 32, 27, 10), 4.5)) + K(circ(32, 32, 13)) + W(circ(32, 32, 9.5))
    + T('rotate(-28 32 32)', KS('M5 32A27 10 0 0 0 59 32', 9) + WS('M5 32A27 10 0 0 0 59 32', 4.5)) + K(circ(54.5, 17.5, 7)) + W(circ(54.5, 17.5, 4.5))),
  beam: () => F(circ(14, 32, 16), 0.2) + F(circ(14, 32, 10)) + F('M20 25H55A7 7 0 0 1 55 39H20Z') + F(rr(23, 17, 31, 3.5, 1.75), 0.45) + F(rr(23, 43.5, 31, 3.5, 1.75), 0.45),
  sigil: () => S(circ(32, 32, 26.5), 4) + S(circ(32, 32, 17), 3) + Array.from({ length: 12 }, (_, i) => S(line([polar(32, 32, 19.5, i * 30), polar(32, 32, 24, i * 30)]), 2.4, i % 3 ? 0.55 : 1)).join('')
    + F(poly(starPts(32, 32, 4, 13, 4.2))) + F(circ(32, 32, 2.6), 0) ,
  rune: () => M(W(poly([[21, 5], [43, 5], [54, 18], [51, 51], [32, 60], [13, 51], [10, 18]])) + KS('M32 13V51M32 25L21 16M32 25L43 16M32 37L22 46M32 37L42 46', 3.4)),
  portal: () => M(W(ell(32, 32, 19, 27.5)) + K(ell(32, 32, 13, 21.5))) + F(ell(32, 33, 8, 15), 0.4) + S('M32 21C38 23 38 34 32 36C27 37 26 30 31 29', 3, 0.7) + spark(55, 10, 5.5) + spark(9, 52, 4, 0.5),
  vortex: () => [0, 120, 240].map((r) => T(`rotate(${r} 32 32)`, F('M32 32C29 17 40 6 56 9C45 12 38 20 39 32Z'))).join('') + F(circ(32, 32, 5.5)),
  spiral: () => S(spiralLine(32, 32, 2.25, 1.5, 26.5, 0), 4.5),
  phase: () => M(bustW(22, 34), 0.3) + M(bustW(42, 34) + K(rr(-8, -8, 41, 80))) + S('M34.5 4V60', 3, 0.75, ' stroke-dasharray="4.5 5"'),
  clone: () => M(bustW(23, 30) + bustK(40, 34, 5), 0.45) + M(bustW(40, 34)),
  shadow: () => M(W('M32 4C45 4 52 16 52 30V52L46 47L40 54L34 47L28 54L22 47L16 52L12 48V30C12 16 19 4 32 4Z') + K(ell(32, 27, 11, 12.5))
    + W('M22.5 26.5L30 29L23.5 31Z') + W('M41.5 26.5L34 29L40.5 31Z')),
  mask: () => M(W('M32 8C46 8 55 16 55 28C55 44 43 56 32 58C21 56 9 44 9 28C9 16 18 8 32 8Z') + K('M14 28C18 23.5 24 23.5 28.5 28.5C24 33 18 33 14 28Z')
    + K('M50 28C46 23.5 40 23.5 35.5 28.5C40 33 46 33 50 28Z') + KS('M32 13V23', 2.6) + K('M26 44Q32 49 38 44Q32 46.5 26 44Z')) + S('M9 25L3 29M55 25L61 29', 3, 0.5),
  eye: () => M(W('M2 32C12 15 52 15 62 32C52 49 12 49 2 32Z') + K(circ(32, 32, 13.5)) + W(circ(32, 32, 10)) + K(circ(32, 32, 4.3)) + W(circ(35.6, 28.4, 2.1)))
    + S('M19 13L16 8M32 10V4M45 13L48 8', 3, 0.55),
  bolt: () => F('M40 2L12 36H29L21 62L52 25H35L47 2Z'),
  burst: () => M(W(poly(Array.from({ length: 24 }, (_, i) => polar(32, 32, i % 2 ? 13 + (i % 4 === 1 ? 2 : 0) : [29, 24, 28, 22, 30, 25][(i / 2) % 6], i * 15 - 90)))) + K(circ(32, 32, 9.5)) + W(circ(32, 32, 6))),
  wave: () => M(W('M2 46C12 46 15 25 31 19C44 14 56 21 58 33C52 27 42 28 40 35C38 43 47 47 58 45V59H2Z') + KS('M8 51C15 49 20 41 26 34', 2.4)) + F(circ(51, 13, 3), 0.55) + F(circ(58, 20, 2), 0.4),
  wind: () => S('M6 21H37C45 21 47 11 41 8C36 5 32 9 33 13', 4.5) + S('M3 33H50C58 33 59 45 52 47C47 49 43 45 45 41', 4.5) + S('M10 45H31', 4, 0.5) + S('M14 55H26', 4, 0.3),
  // ---- defense / steel ---------------------------------------------------
  shield: () => M(W('M32 4L56 10V30C56 45 46 55 32 61C18 55 8 45 8 30V10Z') + KS('M32 10.5L50 15V30C50 41 43 49 32 54C21 49 14 41 14 30V15Z', 2.6)
    + K(poly([[32, 18], [44, 31], [44, 39], [32, 27], [20, 39], [20, 31]])) + K(circ(32, 44.5, 3.6))),
  blade: () => F('M23 43C35 35 47 22 58 4C56 22 45 38 29 49Z') + T('rotate(45 25 46)', F(rr(14, 43, 22, 6, 3))) + S('M19 51L10 60', 6.5) + F(circ(8.5, 61, 3.5), 0.8),
  sword: () => M(T('rotate(45 32 32)', W('M32 0L38 8V39H26V8Z') + KS('M32 8V36', 2.2) + W(rr(17, 38.5, 30, 6.5, 3.25)) + W(rr(28, 44, 8, 12.5, 2)) + W(circ(32, 59.5, 4.5)) + KS('M28 48.5H36M28 52.5H36', 1.4))),
  twinblade: () => M(T('rotate(-38 32 32)', dagger()) + T('rotate(38 32 32)', daggerK() + dagger())),
  axe: () => S('M14 60L44 10', 5.5) + M(W('M38 6C46 2 56 6 60 16C62 24 60 32 54 38C52 30 48 26 40 25C42 20 42 14 38 6Z') + W('M38 15L24 9C20 8 18 12 21 14L36 22Z')
    + KS('M41 24L38 7', 2.2)) + F(circ(14, 60, 3), 0.7),
  anvil: () => F('M4 15H46C53 15 59 19 62 24C55 26 49 27 45 30L41 36V42H48V53H14V42H22V36C18 31 11 27 4 25Z') + spark(22, 7, 5.5, 0.75) + spark(33, 4, 3.5, 0.5),
  hammer: () => '',
  chain: () => M(T('rotate(-45 32 32)', WS(ell(14, 32, 11, 7.5), 5) + WS(ell(50, 32, 11, 7.5), 5) + KS(rr(21, 28.5, 22, 7, 3.5), 3.4) + W(rr(21, 28.5, 22, 7, 3.5)) + K(rr(25.5, 31, 13, 2, 1)))),
  lock: () => S('M21 28V19A11 11 0 0 1 43 19V28', 5.5) + M(W(rr(12, 26, 40, 32, 7)) + K(circ(32, 38.5, 4.6)) + K(poly([[30, 40], [34, 40], [35.6, 50], [28.4, 50]])) + KS('M17 31H47', 1.6)),
  crack: () => M(T('translate(-3 1)', W(circ(32, 32, 24)) + K(poly([[34, -8], [28, 12], [36, 24], [27, 36], [34, 47], [29, 72], [80, 72], [80, -8]]))))
    + M(T('translate(3 -1)', W(circ(32, 32, 24)) + K(poly([[34, -8], [28, 12], [36, 24], [27, 36], [34, 47], [29, 72], [-16, 72], [-16, -8]]))))
    + F(poly([[52, 6], [57, 4], [55, 9]]), 0.55) + F(poly([[10, 56], [6, 61], [12, 60]]), 0.45),
  quake: () => M(W(rr(3, 41, 58, 17, 3)) + W(poly([[17, 41], [24, 25], [29.5, 41]])) + W(poly([[34, 41], [40.5, 20], [47, 41]])) + KS('M32 41L28 47L34 51L30 58', 3.2))
    + S('M10 31C7 27 7 23 10 19M54 31C57 27 57 23 54 19', 3.5, 0.6) + S('M4 33C1 27 1 21 4 15M60 33C63 27 63 21 60 15', 3, 0.3),
  furnace: () => M(W(rr(9, 16, 46, 43, 6)) + W(rr(38, 3, 10, 15, 2)) + K('M19 55V36A13 13 0 0 1 45 36V55Z')
    + W('M32 53C24.5 53 22.5 46 26 40C27 44.5 29 45.5 30.5 42.5C30.5 38 33.5 36 32.5 30.5C39 36 42 42.5 38.5 48.5C37 51.5 35 53 32 53Z') + KS('M20 47.5H44', 2.4)
    + K(circ(14.5, 21.5, 1.6)) + K(circ(49.5, 21.5, 1.6))) + F(circ(43, 1, 2.6), 0.35),
  // ---- elements / nature ---------------------------------------------------
  flame: () => M(W('M32 2C36 13 48 19 50 35C51 48 43 59 32 59C21 59 13 50 14 38C15 29 21 24 24 16C27 22 28 25 31 27C33 19 34 11 32 2Z')
    + K('M32 25C35.5 32 42 36 42 44.5C42 51 37.5 55 32 55C26.5 55 22 51 22 45C22 40.5 25.5 37 27.5 33C28.5 37 30 38 31 39C32 34 33 29.5 32 25Z')
    + W('M32 38.5C34.5 43 37.5 45.5 37.5 49C37.5 52 35.2 54 32 54C28.8 54 26.5 52 26.5 49C26.5 46 30 43.5 32 38.5Z')),
  snowflake: () => [0, 60, 120].map((a) => S(line([polar(32, 32, 27, a - 90), polar(32, 32, 27, a + 90)]), 4.5)).join('')
    + [30, 90, 150, 210, 270, 330].map((a) => { const p = polar(32, 32, 16, a); return S(line([polar(p[0], p[1], 8.5, a - 42), p, polar(p[0], p[1], 8.5, a + 42)]), 3.8); }).join('')
    + F(poly(Array.from({ length: 6 }, (_, i) => polar(32, 32, 6, i * 60 + 30)))),
  ice: () => M(T('rotate(-26 20 48)', W(poly([[20, 16], [26, 24], [26, 50], [20, 56], [14, 50], [14, 24]]))) + T('rotate(26 44 48)', W(poly([[44, 16], [50, 24], [50, 50], [44, 56], [38, 50], [38, 24]])))
    + KS(poly([[32, 3], [41, 14], [41, 50], [32, 60], [23, 50], [23, 14]]), 3.4) + W(poly([[32, 3], [41, 14], [41, 50], [32, 60], [23, 50], [23, 14]])) + KS('M32 9V55M23 14L32 20L41 14', 2)),
  drop: () => M(W('M32 3C40 17 51 28 51 40A19 19 0 0 1 13 40C13 28 24 17 32 3Z') + KS('M21 40C21 47 25.5 51 31 52', 3)),
  leaf: () => M(W('M7 57C7 28 24 7 58 7C58 40 38 57 7 57Z') + KS('M9 55L50 14', 2.6) + KS('M21 43L20.5 31M29 35L29.5 23.5M37 27L39 17.5M24 47L36 47.5M32 39L43 38.5M40 31L49 29.5', 2.1)),
  vine: () => S('M8 60C8 46 30 46 30 33C30 21 13 22 17 12C20 4 32 4 34 11', 5) + leafAt(22, 47, -20, 18, 6.5) + leafAt(29, 29, 160, 16, 6) + leafAt(30, 33, 20, 16, 5.6) + leafAt(17, 13, -110, 12, 4.5) + S('M34 11C36 16 31 19 29 15', 3.2),
  seed: () => S('M32 34V18', 4.5) + leafAt(31, 22, -150, 17, 6.2) + leafAt(33, 19, -35, 16, 5.8) + M(W(ell(32, 46, 14, 12)) + KS('M24 41C28 37 36 37 40 41', 2.2)),
  thorn: () => S('M7 57L57 7', 6) + [0.2, 0.4, 0.6, 0.8].map((t, i) => { const x = 7 + 50 * t, y = 57 - 50 * t, s = i % 2 ? 1 : -1; return F(poly([[x - 5.5, y - 5.5], [x + s * 13 - 3, y + s * 13 + 3], [x + 5.5, y + 5.5]])); }).join('') + F(poly([[52, 12], [62, 2], [57, 13]]), 0.9),
  tree: () => M(W(circ(32, 21, 15)) + W(circ(18, 30, 11.5)) + W(circ(46, 30, 11.5)) + W(circ(32, 33, 12)) + W(rr(28, 34, 8, 18, 1)) + W('M20 59C26 55 28 50 28 44H36C36 50 38 55 44 59Z')
    + KS('M22 38C27 42 37 42 42 38', 2.2) + KS('M32 46V59', 1.8)),
  root: () => S('M3 19H17M47 19H61', 3.5, 0.45) + M(W(rr(21, 3, 22, 15, 3)) + KS('M21 9H43', 2) + WS('M28 16C26 30 18 36 10 41', 5) + WS('M10 41C7 44 6 48 6 52', 3.2) + WS('M32 18C32 34 30 45 26 58', 5)
    + WS('M36 16C40 28 48 35 54 45', 5) + WS('M54 45C56 49 56 53 55 57', 3.2) + WS('M30 36C36 40 40 46 42 52', 3)),
  flower: () => M([0, 72, 144, 216, 288].map((a) => T(`rotate(${a} 32 32)`, W(ell(32, 15, 9, 13)))).join('') + K(circ(32, 32, 10)) + W(circ(32, 32, 7))),
  tree2: () => '',
  // ---- body / life -------------------------------------------------------
  skull: () => M(W(circ(32, 27, 21)) + W(rr(21, 37, 22, 18, 5)) + K(ell(23.5, 29, 6, 6.8)) + K(ell(40.5, 29, 6, 6.8)) + K(poly([[32, 36], [28.5, 42.5], [35.5, 42.5]]))
    + KS('M27 47.5V54.5M32 47.5V55.5M37 47.5V54.5', 2.4) + KS('M22 45.5H42', 2)),
  fang: () => M(W(rr(6, 5, 52, 11, 5.5)) + W('M10 14H26C26 30 22 46 14 59C15 45 13 30 10 14Z') + W('M54 14H38C38 30 42 46 50 59C49 45 51 30 54 14Z')
    + W(poly([[27, 14], [29.5, 24], [32, 14]])) + W(poly([[32, 14], [34.5, 24], [37, 14]])) + KS('M10 16.5H54', 2)) + F('M32 40C34 44 36 46 36 49A4 4 0 0 1 28 49C28 46 30 44 32 40Z', 0.6),
  heart: () => M(W('M32 57C14 45 5 34 5 22C5 13 12 6 20.5 6C26 6 30 9 32 13C34 9 38 6 43.5 6C52 6 59 13 59 22C59 34 50 45 32 57Z') + KS('M13 19C13 15.5 15.5 13 19 13', 3)),
  cloak: () => M(W('M32 4C41 4 46 11 46 18C52 27 56 43 60 59H4C8 43 12 27 18 18C18 11 23 4 32 4Z') + K(ell(32, 19, 8, 9.5)) + KS('M24 31L17.5 58M40 31L46.5 58M32 34V58', 2.2) + W(circ(32, 31, 3.4))),
  boot: () => F('M16 13C8 12 3 17 2 23C6 21 11 21 16 22Z', 0.6) + F('M16 22C9 22 4 27 4 32C8 30 12 30 16 31Z', 0.4)
    + M(W('M16 5H35V35L50 39C57 41 57 50 50 50H16Z') + W(rr(14, 49, 44, 8, 3)) + KS('M16 13H35', 2.4) + KS('M35 35C31 37 30 41 31 45', 2)),
  hourglass: () => F(rr(10, 3, 44, 7, 3.5)) + F(rr(10, 54, 44, 7, 3.5)) + S('M17 10C17 25 29 27 29 32C29 37 17 39 17 54M47 10C47 25 35 27 35 32C35 37 47 39 47 54', 4)
    + F('M22 15H42C40 21 34 25 32 27.5C30 25 24 21 22 15Z', 0.75) + F('M32 40C35 44 42 46 43.5 51H20.5C22 46 29 44 32 40Z') + S('M32 30V42', 1.8, 0.6),
  gem: () => M(W(poly([[18, 9], [46, 9], [59, 24], [32, 57], [5, 24]])) + KS('M5 24H59M18 9L25 24L32 9L39 24L46 9M25 24L32 57L39 24', 2.3)),
  book: () => M(W(rr(10, 6, 40, 52, 4)) + W(rr(46, 10, 9, 44, 2)) + KS('M47.5 14V50M51 14V50', 1.5) + K(rr(15, 6, 3, 52)) + K(poly(starPts(33, 29, 4, 10, 3.6))) + KS(circ(33, 29, 13.5), 2)) + F(poly([[38, 54], [45, 54], [45, 63], [41.5, 59.5], [38, 63]]), 0.6),
  crown: () => M(W(poly([[7, 19], [19.5, 33], [32, 11], [44.5, 33], [57, 19], [52.5, 46], [11.5, 46]])) + W(rr(10, 45, 44, 11, 3)) + W(circ(7, 17, 4.2)) + W(circ(32, 9, 4.6)) + W(circ(57, 17, 4.2))
    + KS('M11 46H53', 2.2) + K(circ(32, 50.5, 2.8)) + K(circ(21, 50.5, 2.1)) + K(circ(43, 50.5, 2.1))),
  // ---- attributes & meta ---------------------------------------------------
  str: () => M(T('translate(0 -3)', FIST_W + FIST_K) + W(rr(14, 40, 36, 19, 3.5)) + KS('M14 43.5H50', 2.6) + K(circ(21, 51.5, 2.1)) + K(circ(32, 51.5, 2.1)) + K(circ(43, 51.5, 2.1))),
  agi: () => S('M11 53L47 17', 4.5) + F(poly([[59, 5], [54, 25], [39, 10]])) + leafAt(13, 51, -100, 14, 4.2) + leafAt(13, 51, 10, 14, 4.2) + leafAt(19, 45, -100, 12, 3.6) + leafAt(19, 45, 10, 12, 3.6) + S('M33 55L25 63M45 49L40 54', 3, 0.4),
  int: () => M(W(poly(starPts(32, 32, 8, 30, 20.5, -90))) + K('M12 32C18 22 46 22 52 32C46 42 18 42 12 32Z') + W(circ(32, 32, 7)) + K(circ(32, 32, 3)) + W(circ(34.2, 29.8, 1.3))),
  gold: () => M(W(rr(7, 41, 34, 9, 0)) + W(ell(24, 50, 17, 6)) + KS(ell(24, 41, 17, 6), 2.2) + W(ell(24, 41, 17, 6))
    + W(rr(9, 31, 34, 9, 0)) + W(ell(26, 40, 17, 6)) + KS(ell(26, 31, 17, 6), 2.2) + W(ell(26, 31, 17, 6))
    + W(rr(7, 21, 34, 9, 0)) + W(ell(24, 30, 17, 6)) + KS(ell(24, 21, 17, 6), 2.2) + W(ell(24, 21, 17, 6)) + KS(ell(24, 21, 10, 3.2), 1.6)
    + KS(circ(46, 41, 14), 3.4) + W(circ(46, 41, 13)) + KS(circ(46, 41, 8.5), 2) + K(poly([[46, 35], [50, 41], [46, 47], [42, 41]]))),
  xp: () => F(poly(starPts(32, 17, 5, 14, 6))) + F(poly([[9, 33], [32, 45], [55, 33], [55, 42], [32, 54], [9, 42]])) + F(poly([[9, 47], [32, 59], [55, 47], [55, 54], [32, 64], [9, 54]]), 0.5),
  level: () => laurel(-1) + laurel(1) + F(poly(starPts(32, 24, 5, 9.5, 4))) + F(circ(32, 59, 3.5)),
};
delete G.hammer; delete G.tree2;

// Fallback for unknown names: the generic rune.
export const ICON_NAMES = Object.keys(G);

export function glyph(name) {
  const g = G[name] || G.rune;
  return g();
}

function hex(c) {
  let s = String(c).trim().replace('#', '');
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  const v = parseInt(s.slice(0, 6), 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [34, 34, 51];
}
function lift(c, k = 1.85, add = 14) { return '#' + hex(c).map((v) => Math.min(255, Math.round(v * k + add)).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

export function iconSVG(name, { fg = '#fff', bg = '#223', bg2, frame = '#c9a45a', size = 64, round = 12 } = {}) {
  const i = uid('mli');
  const b2 = bg2 || lift(bg);
  const r = Math.max(0, Math.min(30, round));
  const frameHi = mix(frame, '#ffffff', 0.45), frameLo = mix(frame, '#000000', 0.45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">`
    + `<defs>`
    + `<radialGradient id="${i}b" cx="50%" cy="36%" r="74%"><stop offset="0" stop-color="${b2}"/><stop offset="1" stop-color="${bg}"/></radialGradient>`
    + `<radialGradient id="${i}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${fg}" stop-opacity=".32"/><stop offset=".55" stop-color="${fg}" stop-opacity=".08"/><stop offset="1" stop-color="${fg}" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${i}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>`
    + `<linearGradient id="${i}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${frameHi}"/><stop offset=".5" stop-color="${frame}"/><stop offset="1" stop-color="${frameLo}"/></linearGradient>`
    + `<filter id="${i}s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.2" flood-color="#000" flood-opacity=".75"/></filter>`
    + `<clipPath id="${i}c"><rect x="2.5" y="2.5" width="59" height="59" rx="${Math.max(0, r - 1.5)}"/></clipPath>`
    + `</defs>`
    + `<rect x="2.5" y="2.5" width="59" height="59" rx="${Math.max(0, r - 1.5)}" fill="url(#${i}b)"/>`
    + `<g clip-path="url(#${i}c)"><circle cx="32" cy="33" r="27" fill="url(#${i}g)"/><ellipse cx="32" cy="2" rx="34" ry="14" fill="#fff" opacity=".07"/></g>`
    + `<g transform="translate(32 32.5) scale(.78) translate(-32 -32)" color="${fg}" fill="currentColor" style="color:${fg}" filter="url(#${i}s)">${glyph(name)}</g>`
    + `<rect x="4" y="4" width="56" height="56" rx="${Math.max(0, r - 3)}" fill="none" stroke="url(#${i}v)" stroke-width="1.4"/>`
    + `<rect x="1.75" y="1.75" width="60.5" height="60.5" rx="${r}" fill="none" stroke="url(#${i}f)" stroke-width="2.5"/>`
    + `<rect x="0.5" y="0.5" width="63" height="63" rx="${r + 1}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="1"/>`
    + `</svg>`;
}

export function iconDataURL(name, opts) {
  return 'data:image/svg+xml,' + encodeURIComponent(iconSVG(name, opts));
}
