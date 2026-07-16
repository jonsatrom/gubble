// The mixer (§10): four corners, one puck, bilinear everything.
//
// The puck does not "select" an aesthetic. The puck LEANS. Bilinear
// weights across four corners; nobody wins, everybody bleeds into
// everybody. Per-cell noise keeps the crossfade shimmering — a uniform
// dissolve would imply the mix has an opinion. It doesn't. It has a
// position.
//
// Corruption aesthetics are ordinary citizens here: put REDACTION on a
// corner and dragging toward it IS degradation — loss is positional and
// chosen, not infrastructural (Directive 3).

import { deriveUnit } from "./hash.js";
import { clusterWidth } from "./width.js";
import { weightedPick, applyStack, lerp, clamp } from "./draw.js";
import type { Ductus, GrainAffinity } from "./ductus.js";
import type { CellBuffer, Provenance } from "./buffer.js";

/** Corner order: [top-left, top-right, bottom-left, bottom-right]. null = empty corner. */
export type Corners = [Ductus | null, Ductus | null, Ductus | null, Ductus | null];

/**
 * Effect states, page scope (§9 — the three that go live at M2).
 * density: -1..+1 gain (starve ↔ flood). grain: -1..+1 (poster ↔
 * texture re-voicing). phase: 0..1 (stability ↔ shimmer; the fraction
 * of cells that flutter per frame).
 */
export interface EffectState {
  density: number;
  grain: number;
  phase: number;
}

export const NEUTRAL_EFFECTS: EffectState = { density: 0, grain: 0, phase: 0 };

/**
 * A kit (§10): the patch file. Corners + puck + effects (+ the doc seed
 * rides along at the document level, not here). URL-encodable via
 * kit.ts — the URL is the patch file format.
 */
export interface Kit {
  corners: Corners;
  puck: { x: number; y: number };
  effects: EffectState;
}

/** Bilinear corner weights for a puck position. Sums to 1. */
export function bilinearWeights(x: number, y: number): [number, number, number, number] {
  const cx = clamp(x, 0, 1);
  const cy = clamp(y, 0, 1);
  return [(1 - cx) * (1 - cy), cx * (1 - cy), (1 - cx) * cy, cx * cy];
}

/** Grain affinity as a number for mixing: poster −1, both 0, texture +1. */
const grainNum = (g: GrainAffinity): number => (g === "poster" ? -1 : g === "texture" ? 1 : 0);

export interface MixedVector {
  density: number;
  runMean: number;
  stackDepth: number;
  jitter: number;
  /** numeric grain, −1..+1, post-mixing */
  grain: number;
}

/**
 * Interpolate the corner vectors at the puck. Null corners contribute
 * nothing and their weight is renormalized away — an empty corner isn't
 * "a corner of zeros" (that would drag every mix toward silence), it's
 * absent, and the mix is a conversation among whoever showed up.
 */
export function mixVectors(corners: Corners, weights: [number, number, number, number]): MixedVector | null {
  let total = 0;
  const acc = { density: 0, runMean: 0, stackDepth: 0, jitter: 0, grain: 0 };
  for (let i = 0; i < 4; i++) {
    const d = corners[i];
    if (!d) continue;
    const w = weights[i]!;
    total += w;
    acc.density += d.vector.density * w;
    acc.runMean += d.vector.runLength.mean * w;
    acc.stackDepth += d.vector.stackDepth * w;
    acc.jitter += d.vector.jitter * w;
    acc.grain += grainNum(d.vector.grainAffinity) * w;
  }
  if (total === 0) return null;
  return {
    density: acc.density / total,
    runMean: acc.runMean / total,
    stackDepth: acc.stackDepth / total,
    jitter: acc.jitter / total,
    grain: acc.grain / total,
  };
}

/**
 * Apply effect gains to a mixed vector (§9, density + grain at M2;
 * phase acts at draw time, not here). Density gain slides linearly
 * toward flood (1) or starvation (0); grain shifts the poster↔texture
 * lean, which modulates ink coverage the way the specimen's grainBoost
 * does. At density extremes the EXPRESSION changes too — see
 * starvation/promotion in cellGlyph.
 */
export function applyEffects(mixed: MixedVector, effects: EffectState): MixedVector {
  const g = clamp(effects.density, -1, 1);
  const density = clamp(g >= 0 ? mixed.density + g * (1 - mixed.density) : mixed.density * (1 + g), 0.005, 0.98);
  const grain = clamp(mixed.grain + effects.grain, -1, 1);
  // Grain re-voices coverage: texture wants the field, poster wants the air.
  const grainFactor = lerp(0.85, 1.15, (grain + 1) / 2);
  return { ...mixed, density: clamp(density * grainFactor, 0.005, 0.98), grain };
}

// Starvation vocabulary (§9 density at min): hair space, lone braille
// dots, an orphaned combining mark on bare space. The page doesn't go
// blank at the bottom of the density well — it goes SPARSE, which is a
// different, better silence.
const STARVATION_GLYPHS = [" ", "⠁", "⠄", "·", " ̷"];

export interface CellDrawOptions {
  /** flutter frame — only consulted for cells that PHASE selects */
  frame?: number;
}

/**
 * The per-cell kit draw: pure random access, §4.3 discipline — any cell
 * computable alone, no neighbors, no memory. Returns the glyph for a
 * cell (or " " if the ink gate says air), plus which corner inked it
 * (for provenance).
 */
export function cellDraw(
  kit: Kit,
  seed: string,
  cellIndex: number,
  opts: CellDrawOptions = {},
): { glyph: string; corner: Ductus | null } {
  const frame = opts.frame ?? 0;
  const phase = clamp(kit.effects.phase, 0, 1);

  // PHASE, part one: is this one of the fluttering cells? A parked puck
  // still breathes — the fraction that shimmer scales with the effect.
  const flutters = phase > 0 && deriveUnit(seed, cellIndex, "ph?") < phase;
  // Fluttering cells key their rolls by frame (desynced per-cell via a
  // seeded offset, so the page shimmers instead of strobing in unison);
  // stable cells ignore time entirely.
  const offset = flutters ? Math.floor(deriveUnit(seed, cellIndex, "ph0") * 997) : 0;
  const f = flutters ? frame + offset : -1;

  // PHASE, part two: wobble the puck's EFFECTIVE position per-cell —
  // baseline shimmer always (transitions must not dissolve uniformly),
  // more under phase.
  const wobble = 0.06 + phase * 0.25;
  const x = clamp(kit.puck.x + (deriveUnit(seed, cellIndex, "px", f) - 0.5) * wobble, 0, 1);
  const y = clamp(kit.puck.y + (deriveUnit(seed, cellIndex, "py", f) - 0.5) * wobble, 0, 1);

  const weights = bilinearWeights(x, y);
  const mixed = mixVectors(kit.corners, weights);
  if (!mixed) return { glyph: " ", corner: null };
  const v = applyEffects(mixed, kit.effects);

  // Ink gate.
  if (deriveUnit(seed, cellIndex, "ink", f) >= v.density) return { glyph: " ", corner: null };

  // Starvation expression at the bottom of the density well (§9).
  if (v.density < 0.05) {
    const glyph = STARVATION_GLYPHS[Math.floor(deriveUnit(seed, cellIndex, "st", f) * STARVATION_GLYPHS.length)]!;
    return { glyph, corner: null };
  }

  // Which corner speaks for this cell: weighted draw across the four
  // palettes (§10) — renormalized over the corners that exist.
  const present = kit.corners.map((d, i) => (d ? weights[i]! : 0));
  const corner = kit.corners[
    pickIndex(present, deriveUnit(seed, cellIndex, "c", f))
  ]!;

  let glyph = weightedPick(corner.palette.glyphs, corner.palette.weights, deriveUnit(seed, cellIndex, "g", f));

  // Run personality, stateless: with contProb, take the glyph the LEFT
  // cell would draw — computed, never remembered (same trick as log.ts).
  const contProb = clamp(1 - 1 / Math.max(v.runMean, 1), 0, 0.92);
  if (cellIndex > 0 && deriveUnit(seed, cellIndex, "run", f) < contProb) {
    const leftWeights = bilinearWeights(
      clamp(kit.puck.x + (deriveUnit(seed, cellIndex - 1, "px", f) - 0.5) * wobble, 0, 1),
      clamp(kit.puck.y + (deriveUnit(seed, cellIndex - 1, "py", f) - 0.5) * wobble, 0, 1),
    );
    const leftPresent = kit.corners.map((d, i) => (d ? leftWeights[i]! : 0));
    const leftCorner = kit.corners[pickIndex(leftPresent, deriveUnit(seed, cellIndex - 1, "c", f))];
    if (leftCorner) {
      glyph = weightedPick(leftCorner.palette.glyphs, leftCorner.palette.weights, deriveUnit(seed, cellIndex - 1, "g", f));
    }
  }

  // Splice-gap gesture (§10 cut-up engine, first breath): seeded
  // hesitations whose rate rides the mixed jitter. The full
  // fragment-splicing engine arrives with phrases-in-the-mixer; this is
  // its rhythm section showing up early.
  if (deriveUnit(seed, cellIndex, "sp", f) < 0.05 * v.jitter) {
    return { glyph: " ", corner: null };
  }

  // Density promotion at the top of the well (§9 max): stacking piles on.
  const stackBonus = v.density > 0.9 ? 1 : 0;
  glyph = applyStack(glyph, v.stackDepth + stackBonus, seed, cellIndex, "stk", f);

  return { glyph, corner };
}

function pickIndex(weights: number[], roll: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let target = roll * total;
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i]!;
    if (target < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Fill a buffer from a kit — the mixer's page-scope op body. Pure
 * per-cell random access; the only sequential thing here is the write
 * loop itself.
 */
export function kitFill(
  buffer: CellBuffer,
  kit: Kit,
  seed: string,
  opIndex: number,
  opts: CellDrawOptions = {},
): void {
  for (let r = 0; r < buffer.rows; r++) {
    for (let c = 0; c < buffer.cols; c++) {
      const cellIndex = r * buffer.cols + c;
      const { glyph, corner } = cellDraw(kit, seed, cellIndex, opts);
      if (glyph === " ") continue;
      const provenance: Provenance | null = corner ? { aes: corner.id, op: opIndex } : { aes: "∅", op: opIndex };
      if (clusterWidth(glyph) === 2 && c + 1 >= buffer.cols) continue; // deterministic refusal at the edge
      buffer.set(r, c, glyph, provenance);
    }
  }
}
