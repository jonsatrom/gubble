// The census (§7.3): given raw text — a midden's worth of dumped
// material — measure what's actually there. No interpretation, no LLM,
// no taste. The census is a scavenger with a clipboard: it counts
// graphemes, weighs ink, notices symmetry, measures how often glyphs
// repeat sideways and bleed downward. What it emits becomes the ductus
// vector (§7.2) — the compiled signature of an aesthetic, what remains
// when meaning is stripped.
//
// Everything here is cell-honest: stats are computed over a width-aware
// cell grid (via width.ts, measuring against the frozen `measure`
// snapshot), not over naive string indices. A CJK glyph is two cells of
// material; a zalgo stack is one cell, deep. This is the same width math
// GRID will render with — §8's rule: the census code is EXACTLY the code
// the app will use. No parallel implementations.

import { segmentGraphemes, clusterWidth, stackDepthOf, isDefaultEmojiPresentation } from "./width.js";
import { inkWeight } from "./ramp.js";
import { glyphsMirror } from "./draw.js";

export interface RunLengthStats {
  mean: number;
  var: number;
}

export interface HazardFlags {
  /** Directional-override / isolate codepoints present (U+202A–202E, U+2066–2069). */
  rtl: boolean;
  /** Standalone zero-width characters make up >5% of clusters — a zero-width flood. */
  zwFlood: boolean;
}

export interface CensusStats {
  /** Grapheme clusters ranked by frequency, most common first. Whitespace excluded. */
  glyphs: string[];
  /** Parallel to glyphs: raw occurrence counts. */
  counts: number[];
  density: number;
  whitespace: number;
  symmetry: number;
  runLength: RunLengthStats;
  drip: number;
  jitter: number;
  emojiRatio: number;
  stackDepth: number;
  hazard: HazardFlags;
  /** Bookkeeping for reports: how much material got censused. */
  totals: { lines: number; cells: number; clusters: number };
}

// Mirror pairs for the symmetry score: a "(" on the left answering a ")"
// on the right IS symmetry, even though the characters differ. Table now
// lives in draw.ts (glyphsMirror) — mixer.ts's symmetry effect needs the
// same table to ENFORCE what this file only MEASURES, and a project this
// obsessive about one-true-implementation shouldn't have two mirror tables.

const RTL_CONTROLS = new Set([0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]);
const ZERO_WIDTHS = new Set([0x200b, 0x200c, 0x200d, 0xfeff, 0x2060]);

/**
 * One row of the internal cell grid. `cells[c]` is the cluster occupying
 * that cell, `""` for the continuation cell of a wide glyph, `" "` for
 * space. Trailing whitespace is trimmed before gridding — a right-ragged
 * text file shouldn't census as an ocean of trailing nothing.
 */
function toCellRow(line: string): string[] {
  const cells: string[] = [];
  for (const cluster of segmentGraphemes(line.replace(/\s+$/, ""))) {
    if (cluster === "\t") {
      // Tabs are 2 cells of space here — a placed default, not gospel.
      cells.push(" ", " ");
      continue;
    }
    const width = clusterWidth(cluster);
    cells.push(cluster);
    if (width === 2) cells.push(""); // continuation cell: same glyph's territory
  }
  return cells;
}

/**
 * Census a body of text. Deterministic by construction — there is not a
 * single random draw in here; the same midden always measures identically.
 * (Which is why recompiling an unchanged folder yields an identical
 * ductus, identical id, identical specimen. The aesthetic only drifts
 * when the material does.)
 */
export function censusText(text: string): CensusStats {
  const lines = text.split(/\r?\n/);
  const grid = lines.map(toCellRow).filter((row) => row.length > 0);

  const freq = new Map<string, number>();
  let totalCells = 0;
  let spaceCells = 0;
  let inkSum = 0;
  let clusterCount = 0;
  let emojiCount = 0;
  let stackSum = 0;
  let rtl = false;
  let zwCount = 0;

  const runLengths: number[] = [];

  for (const row of grid) {
    totalCells += row.length;

    let runGlyph: string | null = null;
    let runLen = 0;
    const flushRun = () => {
      if (runGlyph !== null && runLen > 0) runLengths.push(runLen);
      runGlyph = null;
      runLen = 0;
    };

    for (const cell of row) {
      if (cell === "") continue; // wide-glyph continuation: territory, not a new cluster
      if (cell === " ") {
        spaceCells++;
        flushRun();
        continue;
      }

      clusterCount++;
      inkSum += inkWeight(cell) * clusterWidth(cell); // wide glyphs ink both their cells
      stackSum += stackDepthOf(cell);

      const codepoints = Array.from(cell, (ch) => ch.codePointAt(0)!);
      const base = codepoints[0]!;
      if (codepoints.some((cp) => RTL_CONTROLS.has(cp))) rtl = true;
      if (codepoints.every((cp) => ZERO_WIDTHS.has(cp))) zwCount++;
      if (
        isDefaultEmojiPresentation(base) ||
        codepoints.includes(0xfe0f) ||
        (codepoints.includes(0x200d) && clusterWidth(cell) === 2)
      ) {
        emojiCount++;
      }

      freq.set(cell, (freq.get(cell) ?? 0) + 1);

      if (cell === runGlyph) {
        runLen++;
      } else {
        flushRun();
        runGlyph = cell;
        runLen = 1;
      }
    }
    flushRun();
  }

  // Wide continuation cells were pushed as "" — they count as cells for
  // density/whitespace denominators (they're real territory on the page).
  const density = totalCells > 0 ? inkSum / totalCells : 0;
  const whitespace = totalCells > 0 ? spaceCells / totalCells : 0;

  // Symmetry: per-line mirror correlation, lines of ≥4 clusters only
  // (shorter lines are symmetric by accident, which is noise, not signal).
  let symWeighted = 0;
  let symWeight = 0;
  for (const row of grid) {
    const clusters = row.filter((c) => c !== "");
    if (clusters.length < 4) continue;
    let matches = 0;
    const half = Math.floor(clusters.length / 2);
    for (let i = 0; i < half; i++) {
      if (glyphsMirror(clusters[i]!, clusters[clusters.length - 1 - i]!)) matches++;
    }
    symWeighted += (matches / half) * clusters.length;
    symWeight += clusters.length;
  }
  const symmetry = symWeight > 0 ? symWeighted / symWeight : 0;

  const runMean = runLengths.length > 0 ? runLengths.reduce((a, b) => a + b, 0) / runLengths.length : 0;
  const runVar =
    runLengths.length > 0
      ? runLengths.reduce((a, b) => a + (b - runMean) ** 2, 0) / runLengths.length
      : 0;

  // Jitter, honestly approximated: the fraction of runs that are one
  // glyph long. A jittery texture never repeats itself sideways; a calm
  // one settles into runs. This is a PROXY and might deserve better —
  // BUG-JON: does jitter-as-choppiness match what your hand means by
  // jitter, or should this measure something else entirely?
  const jitter = runLengths.length > 0 ? runLengths.filter((l) => l === 1).length / runLengths.length : 0;

  // Drip: vertical adjacency correlation — how often does a glyph appear
  // directly below itself? (§7.3 "drip estimate".) Counted over the cell
  // grid so columns mean actual columns.
  let dripHits = 0;
  let dripDenom = 0;
  for (let r = 0; r < grid.length - 1; r++) {
    const row = grid[r]!;
    const below = grid[r + 1]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell || cell === " " || cell === "") continue;
      if (c < below.length) {
        dripDenom++;
        if (below[c] === cell) dripHits++;
      }
    }
  }
  const drip = dripDenom > 0 ? dripHits / dripDenom : 0;

  const glyphEntries = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return {
    glyphs: glyphEntries.map(([g]) => g),
    counts: glyphEntries.map(([, n]) => n),
    density,
    whitespace,
    symmetry,
    runLength: { mean: runMean, var: runVar },
    drip,
    jitter,
    emojiRatio: clusterCount > 0 ? emojiCount / clusterCount : 0,
    stackDepth: clusterCount > 0 ? stackSum / clusterCount : 0,
    hazard: {
      rtl,
      zwFlood: clusterCount > 0 && zwCount / clusterCount > 0.05,
    },
    totals: { lines: grid.length, cells: totalCells, clusters: clusterCount },
  };
}

/**
 * corpus.txt → phrases[] (§7.3): split on lines, then sentence
 * boundaries, trim, dedupe (first occurrence wins — the corpus is a
 * record, order matters), drop empties and >120-char monsters. Returns
 * ALL surviving phrases; capping to fit the ductus URL budget is the
 * caller's decision to make loudly, not this function's to make silently.
 */
export function corpusToPhrases(corpus: string): string[] {
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const line of corpus.split(/\r?\n/)) {
    for (const piece of line.split(/(?<=[.!?])\s+/)) {
      const phrase = piece.trim();
      if (!phrase || phrase.length > 120 || seen.has(phrase)) continue;
      seen.add(phrase);
      phrases.push(phrase);
    }
  }
  return phrases;
}
