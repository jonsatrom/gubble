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
import { weightedPick, applyStack, mirrorGlyph, lerp, clamp } from "./draw.js";
import { inkWeight, nearestRampGlyph } from "./ramp.js";
import { invertGlyph, posterizeGlyph, thresholdGlyph } from "./corrupt.js";
import type { Ductus, GrainAffinity } from "./ductus.js";
import type { CellBuffer, Provenance } from "./buffer.js";

/** Corner order: [top-left, top-right, bottom-left, bottom-right]. null = empty corner. */
export type Corners = [Ductus | null, Ductus | null, Ductus | null, Ductus | null];

export type FilterMode = "none" | "invert" | "posterize" | "threshold";

/**
 * Effect states (§9 — "scope-agnostic; there are no masters"). The
 * original three (M2): density -1..+1 gain (starve↔flood), grain -1..+1
 * (poster↔texture re-voicing), phase 0..1 (stability↔shimmer). Five more
 * (M6, "before zzz"): drip 0..1 (vertical bleed), jitter 0..1
 * (positional noise — a cell borrows a neighbor's content), symmetry
 * 0..1 (mirror enforcement across the row), blur 0..1 (ramp-diffusion —
 * neighborhood ink averaged, remapped to the nearest real glyph), filter
 * (invert/posterize/threshold — discrete, not a strength, per §9's "per-
 * cell remap family").
 *
 * The five new fields are OPTIONAL, deliberately: dozens of existing
 * kits (test fixtures, already-shared URLs, persisted .gbbl files) only
 * have {density,grain,phase}. Same forward-compat posture as unknown op
 * kinds replaying as no-ops — an old kit missing new fields should mean
 * "neutral," not "malformed." Every read below defends with `?? 0` /
 * `?? "none"`; NEUTRAL_EFFECTS is the fully-specified canonical form for
 * NEW kits, not a requirement on old ones.
 */
export interface EffectState {
  density: number;
  grain: number;
  phase: number;
  drip?: number;
  jitter?: number;
  symmetry?: number;
  blur?: number;
  filter?: FilterMode;
}

export const NEUTRAL_EFFECTS: EffectState = {
  density: 0,
  grain: 0,
  phase: 0,
  drip: 0,
  jitter: 0,
  symmetry: 0,
  blur: 0,
  filter: "none",
};

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

interface NaturalDraw {
  glyph: string;
  corner: Ductus | null;
}

/**
 * The ORIGINAL per-cell kit draw (§4.3 discipline intact): pure random
 * access, any cell computable alone, no neighbors, no memory. This is
 * every effect through M2 (density/grain/phase) plus run-continuation,
 * splice-gaps, and stacking — everything that was "cellDraw" before M6.
 * It's now the inner primitive the five new (M6) effects call AGAIN, at
 * neighboring indices, to find out what a cell WOULD draw without them —
 * drip asks "what does the cell above me naturally draw," symmetry asks
 * "what does my mirror partner naturally draw," and so on. Each call
 * stays pure and self-contained; the neighbor-awareness lives one layer
 * up, in cellDraw, never inside this function.
 */
function naturalDraw(kit: Kit, seed: string, cellIndex: number, frame: number): NaturalDraw {
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

/**
 * The public per-cell kit draw (§9's five M6 effects layered over the
 * M2 core). Still pure random access at the OUTER level — cellDraw(kit,
 * seed, idx, cols) is a deterministic function of its arguments alone —
 * but internally it may call naturalDraw a handful of extra times for
 * specific, well-defined neighbors (the cell above for drip, a random
 * adjacent cell for jitter, the row-mirror for symmetry, the plus-
 * neighborhood for blur). None of that is shared mutable state; it's
 * the same "ask the pure function about a different index" trick
 * run-continuation already used for its left neighbor. `cols` is new
 * here — naturalDraw never needed the buffer's width, but you can't
 * find "the cell above" or "my mirror partner" without it.
 *
 * NOTE on jitter's two meanings, not a bug: `v.jitter` inside
 * naturalDraw is the MIXED VECTOR's jitter (census-measured, drives the
 * splice-gap rate) — a property of the material. `kit.effects.jitter`
 * here is the new PERFORMABLE jitter slider (positional noise, a
 * neighbor-borrowing effect). Same word, spec's own choice (§9's table
 * names the effect "jitter" to match the vector field it echoes), two
 * different knobs.
 */
export function cellDraw(
  kit: Kit,
  seed: string,
  cellIndex: number,
  cols: number,
  opts: CellDrawOptions = {},
): { glyph: string; corner: Ductus | null } {
  const frame = opts.frame ?? 0;
  let { glyph, corner } = naturalDraw(kit, seed, cellIndex, frame);

  const row = Math.floor(cellIndex / cols);
  const col = cellIndex % cols;
  const fx = kit.effects;

  // DRIP (§9): vertical bleed. Does the cell ABOVE me naturally have ink?
  // If so, with probability = drip, it bleeds down and becomes me.
  // Asked from the RECEIVING cell's side (not "do I bleed down"), so
  // this stays a pure per-cell question — no stateful two-pass needed,
  // unlike the specimen renderer's drip (which composes rows sequentially
  // and can afford a second sweep; the mixer can't, by design).
  const drip = clamp(fx.drip ?? 0, 0, 1);
  if (drip > 0 && row > 0 && deriveUnit(seed, cellIndex, "drip?", frame) < drip) {
    const above = naturalDraw(kit, seed, cellIndex - cols, frame);
    if (above.glyph !== " ") {
      glyph = above.glyph;
      corner = above.corner;
    }
  }

  // JITTER (§9): positional noise — GRID's version is "cell swap-
  // adjacency" per the spec table, read here as: this cell sometimes
  // shows what a random neighbor would naturally draw instead of its
  // own content. A boiling, glitchy texture at the cell-identity level.
  const jitterFx = clamp(fx.jitter ?? 0, 0, 1);
  if (jitterFx > 0 && deriveUnit(seed, cellIndex, "jit?", frame) < jitterFx * 0.6) {
    const dx = Math.floor(deriveUnit(seed, cellIndex, "jitdx", frame) * 3) - 1; // -1, 0, or 1
    const dy = Math.floor(deriveUnit(seed, cellIndex, "jitdy", frame) * 3) - 1;
    const nr = row + dy;
    const nc = col + dx;
    if (nr >= 0 && nc >= 0 && nc < cols) {
      const neighbor = naturalDraw(kit, seed, nr * cols + nc, frame);
      glyph = neighbor.glyph;
      corner = neighbor.corner;
    }
  }

  // SYMMETRY (§9): mirror enforcement across the row's horizontal
  // midpoint. [PLACED DEFAULT]: always mirrors across the FULL row
  // width (cols), even at selection/section scope — a locally-scoped
  // mirror axis would need the fence's own bounds threaded through,
  // deferred rather than half-built. With probability = symmetry, this
  // cell shows the MIRROR GLYPH (via draw.ts's pair table, so "(" mirrors
  // to ")" rather than literally duplicating) of what its mirror partner
  // naturally draws.
  const symmetryFx = clamp(fx.symmetry ?? 0, 0, 1);
  if (symmetryFx > 0 && deriveUnit(seed, cellIndex, "sym?", frame) < symmetryFx) {
    const mirrorCol = cols - 1 - col;
    if (mirrorCol !== col) {
      const mirror = naturalDraw(kit, seed, row * cols + mirrorCol, frame);
      if (mirror.glyph !== " ") {
        glyph = mirrorGlyph(mirror.glyph);
        corner = mirror.corner;
      }
    }
  }

  // BLUR (§9): ramp-diffusion. Average this cell's ink with its
  // plus-shaped neighborhood (up/down/left/right, whichever exist),
  // blend by strength, remap to the nearest REAL glyph on the ramp —
  // "the page defocuses into fog without leaving text," per spec, and
  // it's still true here: nearestRampGlyph never returns anything that
  // isn't a real character.
  const blurFx = clamp(fx.blur ?? 0, 0, 1);
  if (blurFx > 0 && glyph !== " ") {
    const offsets: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    const neighborInks: number[] = [];
    for (const [dy, dx] of offsets) {
      const nr = row + dy;
      const nc = col + dx;
      if (nr < 0 || nc < 0 || nc >= cols) continue;
      const n = naturalDraw(kit, seed, nr * cols + nc, frame);
      neighborInks.push(inkWeight(n.glyph));
    }
    const selfInk = inkWeight(glyph);
    if (neighborInks.length > 0) {
      const avgInk = (selfInk + neighborInks.reduce((a, b) => a + b, 0)) / (1 + neighborInks.length);
      glyph = nearestRampGlyph(lerp(selfInk, avgInk, blurFx));
    }
  }

  // FILTERS (§9): the cheap-once-the-ramp-exists family. Discrete, not a
  // strength — invert/posterize/threshold are three different questions,
  // not three intensities of the same one. Pure post-processing, reusing
  // corrupt.ts's applyOnce verbs directly (one implementation, two doors
  // in — a selection verb and a continuous effect).
  const filter = fx.filter ?? "none";
  if (glyph !== " " && filter !== "none") {
    glyph = filter === "invert" ? invertGlyph(glyph) : filter === "posterize" ? posterizeGlyph(glyph) : thresholdGlyph(glyph);
  }

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
      const { glyph, corner } = cellDraw(kit, seed, cellIndex, buffer.cols, opts);
      if (glyph === " ") continue;
      const provenance: Provenance | null = corner ? { aes: corner.id, op: opIndex } : { aes: "∅", op: opIndex };
      if (clusterWidth(glyph) === 2 && c + 1 >= buffer.cols) continue; // deterministic refusal at the edge
      buffer.set(r, c, glyph, provenance);
    }
  }
}
