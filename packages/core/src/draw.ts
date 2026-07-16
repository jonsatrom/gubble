// Shared drawing vocabulary. weightedPick was about to exist in three
// places (specimen, log, mixer) — three copies of "how gubble chooses a
// glyph" is three chances for them to drift into three different tools.
// One copy, here, everybody imports it.

import { deriveUnit } from "./hash.js";
import { clusterWidth } from "./width.js";

/**
 * The standing combining-mark set for EXPRESSING stackDepth — how the
 * renderer performs zalgo when a vector says "this material stacks" but
 * the drawn glyph arrives bare. An aesthetic's own stacked clusters live
 * in its palette already; this is the renderer's accent, not the
 * material's voice.
 */
export const ZALGO_MARKS = ["́", "̀", "̂", "̃", "̄", "̆", "̇", "̈", "̊", "̵", "̶"] as const;

/** Weighted draw from parallel glyph/weight arrays, driven by one roll in [0,1). */
export function weightedPick(glyphs: string[], weights: number[], roll: number): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let target = roll * total;
  for (let i = 0; i < glyphs.length; i++) {
    target -= weights[i]!;
    if (target < 0) return glyphs[i]!;
  }
  return glyphs[glyphs.length - 1] ?? " ";
}

/**
 * Stack combining marks onto a glyph per a stackDepth target, seeded.
 * Narrow glyphs only (marks on a wide glyph double-ink an already-heavy
 * cell); the fractional part of the target rolls for one extra mark.
 */
export function applyStack(
  glyph: string,
  stackTarget: number,
  seed: string,
  ...keys: (string | number)[]
): string {
  if (stackTarget <= 0 || glyph === " " || clusterWidth(glyph) !== 1) return glyph;
  let marks = Math.floor(stackTarget);
  if (deriveUnit(seed, ...keys, "z+") < stackTarget - marks) marks++;
  let out = glyph;
  for (let m = 0; m < marks; m++) {
    out += ZALGO_MARKS[Math.floor(deriveUnit(seed, ...keys, "zm", m) * ZALGO_MARKS.length)]!;
  }
  return out;
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
