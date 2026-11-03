// Stage registry. Each stage module exports { id, name, sub, music, palette, build(ctx) }.
// build(ctx) returns { group, lighting, fog, background, exposure, bloom, update(dt, t, camera), dispose() }.
import * as THREE from 'three';
import river from './river.js';
import frost from './frost.js';
import forge from './forge.js';
import astral from './astral.js';
import debug from './debug.js';

export const STAGES = [river, frost, forge, astral, debug];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export function buildStage(id, ctx) {
  const S = STAGE_BY_ID[id] || STAGES[0];
  return S.build(Object.assign({ THREE }, ctx));
}
