// Cell-width math, per GUBBLE-SPEC.md §5.1. "Cell width math is ours" —
// meaning: given a grapheme cluster, how many monospace cells does it
// occupy in GRID? Three rules, applied in order:
//   1. A variation selector or ZWJ inside the cluster can FORCE emoji
//      presentation (2 cells) or text presentation (1 cell, EAW-only),
//      overriding the base codepoint's default.
//   2. Otherwise, a codepoint with default Emoji_Presentation → 2 cells.
//   3. Otherwise, East_Asian_Width W or F → 2 cells; everything else → 1.
// Combining marks, ZWJ, and variation selectors never get measured on
// their own — see the KNOWN GAP note below for why that's mostly true by
// construction, and where it isn't.

import { WIDE_RANGES } from "./data/generated/wide-ranges.generated.js";
import { EMOJI_PRESENTATION_RANGES } from "./data/generated/emoji-presentation-ranges.generated.js";
import { COMBINING_RANGES } from "./data/generated/combining-ranges.generated.js";
import { deriveUnit } from "./hash.js";

/**
 * The `measure` field every document header records (§4.1) — which frozen
 * Unicode snapshot this build's width math measures against. Bump this
 * (and regenerate src/data/generated/*, §5.1) only when deliberately
 * moving to a new Unicode version. See src/data/vendor/README.md.
 */
export const MEASURE_ID = "eaw-16.0/g1" as const;

// KNOWN GAP, not solved in this pass: WIDE_RANGES and
// EMOJI_PRESENTATION_RANGES are frozen and versioned, but grapheme
// CLUSTER BOUNDARIES (which codepoints group into one cluster at all)
// come from Intl.Segmenter — which defers to the host JS engine's bundled
// ICU/Unicode tables, not to anything we vendor or version. In principle
// a future V8/Node update could reclassify a boundary and silently change
// how many cells the same input measures, with nothing in `measure` to
// blame — the same class of leak the interview caught for width
// classification, just one layer earlier, in segmentation instead of
// measurement. Fully closing this means vendoring UAX #29 grapheme-break
// data ourselves and reimplementing segmentation on top of it, which is
// its own project. Flagging it here rather than pretending width.ts
// finishes the job Directive 1 actually asks for.

const VS15 = 0xfe0e; // variation selector-15: forces TEXT presentation
const VS16 = 0xfe0f; // variation selector-16: forces EMOJI presentation
const ZWJ = 0x200d; // zero-width joiner: ZWJ sequences render as one emoji glyph

/** Binary search over a sorted, non-overlapping [start,end] range table. */
function inRanges(cp: number, ranges: readonly (readonly [number, number])[]): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid]!;
    const [start, end] = range;
    if (cp < start) hi = mid - 1;
    else if (cp > end) lo = mid + 1;
    else return true;
  }
  return false;
}

export function isWide(cp: number): boolean {
  return inRanges(cp, WIDE_RANGES);
}

export function isDefaultEmojiPresentation(cp: number): boolean {
  return inRanges(cp, EMOJI_PRESENTATION_RANGES);
}

/**
 * Is this codepoint a combining mark (General_Category Mn or Me)? Checked
 * against our frozen snapshot, NOT via `\p{M}` regex — property escapes
 * defer to whatever Unicode tables the host engine bundled, which is the
 * same unversioned-ruler leak the `measure` field exists to prevent.
 * The census uses this to count zalgo stack-depth (§7.2 vector.stackDepth).
 */
export function isCombining(cp: number): boolean {
  return inRanges(cp, COMBINING_RANGES);
}

/** How many combining marks (Mn/Me) are stacked inside one grapheme cluster? */
export function stackDepthOf(cluster: string): number {
  let depth = 0;
  for (const ch of cluster) {
    if (isCombining(ch.codePointAt(0)!)) depth++;
  }
  return depth;
}

/**
 * Split text into grapheme clusters — the unit GRID actually measures and
 * addresses cells by. A cluster may be many codepoints (base + combining
 * marks, or a ZWJ emoji sequence) that render, copy, and paste as one
 * unit; this is how zalgo stack-depth ends up living in a single cell.
 */
export function segmentGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** How many cells one grapheme cluster occupies: 1 or 2, per the rules above. */
export function clusterWidth(cluster: string): 1 | 2 {
  const codepoints = Array.from(cluster, (ch) => ch.codePointAt(0)!);
  const base = codepoints[0];
  if (base === undefined) return 1; // shouldn't happen (empty cluster), stay defined anyway

  if (codepoints.includes(VS15)) {
    // Forced text presentation: emoji tables don't get a vote here.
    return isWide(base) ? 2 : 1;
  }
  if (codepoints.includes(VS16) || codepoints.includes(ZWJ)) {
    return 2; // forced emoji presentation, or a ZWJ sequence (renders as one wide glyph)
  }
  if (isDefaultEmojiPresentation(base)) return 2;
  return isWide(base) ? 2 : 1;
}

export interface MeasuredCluster {
  text: string;
  width: number;
}

export interface MeasureOptions {
  /**
   * The `shear` debug toggle (§5.1): deliberately mis-measure some
   * clusters by ±1. "More broken" was requested as a slider; this is the
   * slider. Seeded (Directive 1 — even the breakage has to be
   * reproducible from a share URL) via deriveUnit(shearSeed, clusterIndex).
   */
  shear?: boolean;
  /** Seed for the shear roll. Required if `shear` is true — no naked randomness, ever. */
  shearSeed?: string;
}

/**
 * Measure a string in cells: segments into grapheme clusters, widths each
 * one, and returns both the per-cluster breakdown (for cell-buffer
 * placement, once that exists) and the total. This is the function
 * census.ts and the GRID renderer will both call — one width algorithm,
 * used everywhere, per §8's "no parallel implementations" rule.
 */
export function measureText(text: string, opts: MeasureOptions = {}): {
  totalWidth: number;
  clusters: MeasuredCluster[];
} {
  const clusters = segmentGraphemes(text);
  let totalWidth = 0;
  const measured: MeasuredCluster[] = clusters.map((cluster, i) => {
    let width: number = clusterWidth(cluster);
    if (opts.shear) {
      if (!opts.shearSeed) {
        throw new Error("measureText: shear requires shearSeed (Directive 1 — no naked randomness)");
      }
      const roll = deriveUnit(opts.shearSeed, "shear", i);
      const delta = roll < 1 / 3 ? -1 : roll < 2 / 3 ? 0 : 1;
      width = Math.max(0, width + delta);
    }
    totalWidth += width;
    return { text: cluster, width };
  });
  return { totalWidth, clusters: measured };
}
