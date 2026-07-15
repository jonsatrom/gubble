// The specimen (§7.4): the aesthetic's Hamburgefonstiv. One page, two
// sweeps — maximal→minimal top-to-bottom, and (when a corpus exists)
// legible→shredded left-to-right, the shred built from substitution,
// stacking, splice-gaps, and block-out. Not a hidden gauntlet stage; an
// on-page demonstration of what this aesthetic does to language.
//
// Determinism note: the specimen seed derives from the ductus id, which
// derives from the palette+vector content — so an unchanged midden
// recompiles to a byte-identical specimen, and the specimen only changes
// when the aesthetic actually drifts. Unlike the app's per-cell fill
// (§4.3), rows here are composed LEFT-TO-RIGHT with run/phrase state —
// sequential composition is fine for a one-shot page render; the pure
// random-access discipline matters for the live canvas, not the print.

import { deriveSeed, deriveUnit } from "./hash.js";
import { clusterWidth, segmentGraphemes } from "./width.js";
import type { Ductus, GrainAffinity } from "./ductus.js";

export interface SpecimenOptions {
  width?: number;
  height?: number;
  /** Re-voice the render (§6 GRAIN interplay) without touching the ductus. */
  grain?: GrainAffinity;
}

// A small standing set of combining marks for expressing stackDepth.
// These are EXPRESSION vocabulary (how the renderer performs zalgo), not
// palette material — an aesthetic's own stacked clusters live in its
// palette already; this set is only reached for when the vector says
// "this material stacks" and the drawn glyph is bare.
const ZALGO_MARKS = ["́", "̀", "̂", "̃", "̄", "̆", "̇", "̈", "̊", "̵", "̶"];

function weightedPick(glyphs: string[], weights: number[], roll: number): string {
  const total = weights.reduce((a, b) => a + b, 0);
  let target = roll * total;
  for (let i = 0; i < glyphs.length; i++) {
    target -= weights[i]!;
    if (target < 0) return glyphs[i]!;
  }
  return glyphs[glyphs.length - 1] ?? " ";
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Render the specimen page for a ductus. Pure function of
 * (ductus, options) — same in, same page out, forever.
 */
export function renderSpecimen(ductus: Ductus, opts: SpecimenOptions = {}): string {
  const W = opts.width ?? 80;
  const H = opts.height ?? 40;
  const { glyphs, weights, phrases } = ductus.palette;
  const v = ductus.vector;
  const grain = opts.grain ?? v.grainAffinity;

  if (glyphs.length === 0) return "";

  const seed = deriveSeed(ductus.id, "specimen", W, H, grain);

  // The vertical sweep passes THROUGH the aesthetic's native density
  // around mid-page: top pushes toward its maximal self, bottom starves
  // toward almost-nothing. Grain re-voices the curve — texture leans
  // denser everywhere (glyph as grain wants coverage), poster leans
  // airier (glyph as figure wants whitespace to pose in).
  const grainBoost = grain === "texture" ? 1.25 : grain === "poster" ? 0.8 : 1.0;
  const dTop = clamp((0.35 + v.density * 0.65) * grainBoost, 0.15, 0.97);
  const dBottom = clamp(v.density * 0.06, 0.01, 0.08);

  // Run continuation probability from the censused run-length mean: an
  // aesthetic that runs long sideways keeps running here.
  const contProb = clamp(1 - 1 / Math.max(v.runLength.mean, 1), 0, 0.92);

  const legible = phrases.length > 0;
  const rows: string[] = [];

  for (let r = 0; r < H; r++) {
    const t = H > 1 ? r / (H - 1) : 0;
    const target = lerp(dTop, dBottom, t);

    // Each row gets its own phrase, cycled deterministically.
    const phrase = legible
      ? segmentGraphemes(phrases[Math.floor(deriveUnit(seed, "p", r) * phrases.length)]!)
      : [];
    let phraseIdx = 0;

    let row = "";
    let cellsUsed = 0;
    let prevGlyph: string | null = null;

    while (cellsUsed < W) {
      const x = cellsUsed / (W - 1);

      // Ink-or-air gate: the vertical sweep.
      if (deriveUnit(seed, r, cellsUsed) >= target) {
        row += " ";
        cellsUsed++;
        prevGlyph = null;
        continue;
      }

      // Splice-gap (§7.4 cut-up lineage): sparse hesitations that get
      // more frequent as the shred deepens rightward.
      if (legible && deriveUnit(seed, "sp", r, cellsUsed) < 0.08 * x) {
        row += " ";
        cellsUsed++;
        prevGlyph = null;
        continue;
      }

      let glyph: string;
      let fromPhrase = false;

      if (legible && deriveUnit(seed, "leg", r, cellsUsed) < 1 - x) {
        // The legible side: lay corpus text, character by character.
        glyph = phrase[phraseIdx % phrase.length] ?? " ";
        phraseIdx++;
        fromPhrase = true;
      } else if (legible && deriveUnit(seed, "bo", r, cellsUsed) < 0.06 * x * x) {
        glyph = "█"; // block-out: redaction creeping in from the shredded edge
      } else if (prevGlyph && deriveUnit(seed, "run", r, cellsUsed) < contProb) {
        glyph = prevGlyph; // run continuation: sideways habit
      } else {
        glyph = weightedPick(glyphs, weights, deriveUnit(seed, "g", r, cellsUsed));
      }

      // Zalgo expression: stacking is part of the shred (§7.4), so in
      // legible mode marks pile on harder toward the right edge.
      const stackScale = legible ? x : 1;
      const stackTarget = v.stackDepth * stackScale;
      if (stackTarget > 0 && clusterWidth(glyph) === 1 && glyph !== " ") {
        let marks = Math.floor(stackTarget);
        if (deriveUnit(seed, "z", r, cellsUsed) < stackTarget - marks) marks++;
        for (let m = 0; m < marks; m++) {
          glyph += ZALGO_MARKS[Math.floor(deriveUnit(seed, "zm", r, cellsUsed, m) * ZALGO_MARKS.length)]!;
        }
      }

      const width = clusterWidth(glyph);
      if (cellsUsed + width > W) {
        row += " ";
        cellsUsed++;
        continue;
      }
      row += glyph;
      cellsUsed += width;
      prevGlyph = fromPhrase ? null : glyph;
    }

    rows.push(row.replace(/\s+$/, ""));
  }

  // Drip pass: glyphs bleed into empty rows below, probability straight
  // from the censused vertical-adjacency estimate. Applied on the cell
  // level after composition, like gravity is.
  if (v.drip > 0) {
    const cellRows = rows.map((line) => {
      const cells: string[] = [];
      for (const cl of segmentGraphemes(line)) {
        cells.push(cl);
        if (clusterWidth(cl) === 2) cells.push("");
      }
      return cells;
    });
    for (let r = 0; r < cellRows.length - 1; r++) {
      const row = cellRows[r]!;
      const below = cellRows[r + 1]!;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || cell === " " || cell === "" || clusterWidth(cell) === 2) continue;
        if ((below[c] === " " || below[c] === undefined) && deriveUnit(seed, "d", r, c) < v.drip * 1.5) {
          while (below.length < c) below.push(" ");
          below[c] = cell;
        }
      }
    }
    for (let r = 0; r < rows.length; r++) {
      rows[r] = cellRows[r]!.join("").replace(/\s+$/, "");
    }
  }

  // Foundry header: specimen sheets carry their own colophon.
  const title = ` ${ductus.name} · ${ductus.id} · v${ductus.version} `;
  const pad = Math.max(0, W - title.length);
  const left = Math.floor(pad / 2);
  const header = "─".repeat(left) + title + "─".repeat(pad - left);

  return [header, ...rows].join("\n") + "\n";
}
