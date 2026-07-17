// The event log (§4): Prime Directive 2 made executable. A document is
// not a grid of characters — it's a header plus an append-only array of
// ops, and the grid is always replay(ops). Undo is log truncation. A
// fork is a shared prefix. Playback UI is v2, but the format ships NOW,
// because a state-based format with a log bolted on later is misery, and
// this project fights its miseries up front.
//
// Why hash(docSeed ‖ i) and not Date.now(): because a URL must be able
// to freeze a shimmer MID-SHIMMER. Wall-clock time is for playback
// pacing only. Time, in gubble, is just another integer we can point at.

import { deriveSeed, deriveUnit } from "./hash.js";
import { RNG_ID } from "./prng.js";
import { mintDocSeed } from "./seed.js";
import { MEASURE_ID, clusterWidth } from "./width.js";
import { CellBuffer } from "./buffer.js";
import { weightedPick, applyStack } from "./draw.js";
import { kitFill, cellDraw, type Kit } from "./mixer.js";
import { mistranscode, redactGlyph, invertGlyph, posterizeGlyph } from "./corrupt.js";
import { segmentGraphemes } from "./width.js";
import type { Ductus } from "./ductus.js";

/**
 * Core's grid definition: cols × rows. The full §6 definition regime
 * (vw / chars / physical, the inverse-locked size slider) belongs to the
 * app, where viewports and pages exist — core only needs to know how
 * big the buffer is. [PLACED DEFAULT — §19: definition shape is minimal
 * in core; the §6 controls compile DOWN to this.]
 */
export interface GridDefinition {
  cols: number;
  rows: number;
}

/** Document header, per §4.1 — the dice and the ruler travel with the work. */
export interface DocHeader {
  gubble: "0.9";
  docSeed: string;
  rng: typeof RNG_ID;
  measure: typeof MEASURE_ID;
  created: number;
  definition: GridDefinition;
  lineage: { parent: string | null; at: number } | null;
}

/** v1 op names land incrementally with their features; these exist today. */
export type OpKind = "setDefinition" | "fill" | "select" | "clearSelect" | "applyOnce";

/**
 * A linear selection (§11): text-editor semantics over the grid —
 * reading-order cell indices, inclusive. Shape and lasso arrive at v2
 * with brushes; sections are persisted selections and arrive with
 * controllers (M4's back half).
 */
export interface SelectionRange {
  from: number;
  to: number;
}

export interface Op {
  /** index; also the fork/graft address */
  i: number;
  /**
   * wall-clock ms — playback pacing ONLY. Never generation math. There's
   * a test that mutates every t and asserts the replay doesn't budge.
   */
  t: number;
  op: OpKind;
  scope: { kind: "page" | "selection" };
  args: Record<string, unknown>;
  /** derived: hash(docSeed ‖ i) — every op gets its own reproducible stream */
  seed: string;
}

export interface GubbleDoc {
  header: DocHeader;
  ops: Op[];
}

export function createDocument(definition: GridDefinition, docSeed?: string): GubbleDoc {
  return {
    header: {
      gubble: "0.9",
      docSeed: docSeed ?? mintDocSeed(),
      rng: RNG_ID,
      measure: MEASURE_ID,
      created: Date.now(),
      definition,
      lineage: null,
    },
    ops: [],
  };
}

/**
 * Append an op. The index and per-op seed are assigned here — callers
 * describe WHAT happened, the log decides where it sits in history and
 * which dice it gets. Returns the same doc for chaining; the ops array
 * is append-only by convention (nothing in core ever splices it —
 * truncate() returns a NEW doc).
 */
export function appendOp(
  doc: GubbleDoc,
  op: { op: OpKind; scope: Op["scope"]; args: Op["args"] },
): GubbleDoc {
  const i = doc.ops.length;
  doc.ops.push({
    i,
    t: Date.now(),
    op: op.op,
    scope: op.scope,
    args: op.args,
    seed: deriveSeed(doc.header.docSeed, i),
  });
  return doc;
}

/**
 * Undo, the whole implementation: a document truncated to its first n
 * ops. Nothing is deleted from anything — the caller keeps the longer
 * doc if they want redo. History isn't mutable here; it's addressable.
 */
export function truncate(doc: GubbleDoc, opCount: number): GubbleDoc {
  return { header: doc.header, ops: doc.ops.slice(0, opCount) };
}

/**
 * Fork-at (§4.1 lineage, §12 `?at=&mode=edit`): same docSeed, shared op
 * prefix, divergent futures. Two forks appending different op #341 get
 * the same per-op seed — and different results, because the seed is only
 * half the op; the args are the other half. The lineage field is what
 * makes the mouvance honest.
 */
export function forkDocument(doc: GubbleDoc, at: number, parentUrl: string | null = null): GubbleDoc {
  return {
    header: { ...doc.header, lineage: { parent: parentUrl, at } },
    ops: doc.ops.slice(0, at),
  };
}

// ─── op handlers ────────────────────────────────────────────────────────

/**
 * The page fill: gubble's first real mark-making op. Two arg shapes:
 * `{ductus}` — single-aesthetic fill (a kit of one, effectively), and
 * `{kit}` — the mixer (§10), which delegates to mixer.ts. Both are PURE
 * per-cell random access — hash(opSeed ‖ cellIndex ‖ facet) and nothing
 * else (§4.3). Any cell is recomputable alone; no cell knows its
 * neighbors. (Run-length personality, which IS sequential, gets
 * expressed as a per-cell probability of copying the deterministic
 * glyph of the cell to the left — computed, not remembered. Same
 * shimmer, no state.)
 */
function applyFill(buffer: CellBuffer, op: Op, frame: number): void {
  const kit = op.args["kit"] as Kit | undefined;
  if (kit) {
    kitFill(buffer, kit, op.seed, op.i, { frame });
    return;
  }

  const ductus = op.args["ductus"] as Ductus | undefined;
  if (!ductus || ductus.palette.glyphs.length === 0) return;
  const { glyphs, weights } = ductus.palette;
  const v = ductus.vector;
  const contProb = Math.min(0.92, Math.max(0, 1 - 1 / Math.max(v.runLength.mean, 1)));

  // The glyph a cell WOULD draw, independent of the ink gate — needed so
  // "copy my left neighbor" is computable without placing the neighbor.
  const drawFor = (cellIndex: number): string =>
    weightedPick(glyphs, weights, deriveUnit(op.seed, cellIndex, "g"));

  for (let r = 0; r < buffer.rows; r++) {
    for (let c = 0; c < buffer.cols; c++) {
      const cellIndex = r * buffer.cols + c;

      // Ink gate: density decides whether this cell speaks at all.
      if (deriveUnit(op.seed, cellIndex) >= v.density) continue;

      // Run expression, stateless: with contProb, take the glyph the
      // left cell would draw (whether or not it actually inked).
      let glyph =
        c > 0 && deriveUnit(op.seed, cellIndex, "run") < contProb
          ? drawFor(cellIndex - 1)
          : drawFor(cellIndex);

      // Zalgo expression from the vector, per-cell (shared vocabulary
      // with the mixer and specimen — draw.ts).
      glyph = applyStack(glyph, v.stackDepth, op.seed, cellIndex);

      // set() refuses wide glyphs at the right edge — that refusal is
      // deterministic too, so it's part of the composition, not a bug.
      if (clusterWidth(glyph) === 2 && c + 1 >= buffer.cols) continue;
      buffer.set(r, c, glyph, { aes: ductus.id, op: op.i });
    }
  }
}

export type ApplyVerb = "redact" | "invert" | "posterize" | "mistranscode" | "fillWith";

/**
 * The applyOnce verbs (§11), acting on the current selection. Every one
 * is deterministic; the interesting one is mistranscode, whose output
 * is LONGER than its input (multibyte glyphs explode into one char per
 * byte), so the corrupted text is re-typed through the selection in
 * reading order and truncates at the range's end — the region eats as
 * much of its own corruption as it has room for. Real pipelines do the
 * same thing. Cells the re-type doesn't reach keep their old glyphs.
 */
function applyOnce(buffer: CellBuffer, op: Op, selection: SelectionRange | null): void {
  if (!selection) return; // a verb with nothing selected is a shrug
  const verb = op.args["verb"] as ApplyVerb | undefined;
  if (!verb) return;
  const lo = Math.max(0, Math.min(selection.from, selection.to));
  const hi = Math.min(buffer.cols * buffer.rows - 1, Math.max(selection.from, selection.to));
  const prov = { aes: `⌁${verb}`, op: op.i }; // provenance speaks the verb's name

  if (verb === "fillWith") {
    // The mixer, scoped (§9: effects and fills are scope-agnostic —
    // this is the same cellDraw the page fill uses, fenced to the range).
    const kit = op.args["kit"] as Kit | undefined;
    if (!kit) return;
    for (let idx = lo; idx <= hi; idx++) {
      const r = Math.floor(idx / buffer.cols);
      const c = idx % buffer.cols;
      const { glyph, corner } = cellDraw(kit, op.seed, idx, {});
      if (glyph === " ") continue;
      // set() refuses wide glyphs at the right edge deterministically —
      // same composition rule as the page fill.
      buffer.set(r, c, glyph, corner ? { aes: corner.id, op: op.i } : prov);
    }
    return;
  }

  if (verb === "mistranscode") {
    // Gather the selection's text, corrupt its bytes, re-type the result.
    let source = "";
    for (let idx = lo; idx <= hi; idx++) {
      const cell = buffer.get(Math.floor(idx / buffer.cols), idx % buffer.cols);
      if (cell.glyph !== "") source += cell.glyph;
    }
    const corrupted = segmentGraphemes(mistranscode(source));
    let cursor = 0;
    for (let idx = lo; idx <= hi && cursor < corrupted.length; idx++) {
      const r = Math.floor(idx / buffer.cols);
      const c = idx % buffer.cols;
      if (buffer.get(r, c).glyph === "") continue; // continuation cells stay claimed
      buffer.set(r, c, corrupted[cursor]!, prov);
      cursor++;
    }
    return;
  }

  for (let idx = lo; idx <= hi; idx++) {
    const r = Math.floor(idx / buffer.cols);
    const c = idx % buffer.cols;
    const cell = buffer.get(r, c);
    if (cell.glyph === "") continue;
    const glyph =
      verb === "redact"
        ? redactGlyph(op.seed, idx)
        : verb === "invert"
          ? invertGlyph(cell.glyph)
          : posterizeGlyph(cell.glyph);
    if (glyph === " ") {
      buffer.set(r, c, " ", null);
    } else {
      buffer.set(r, c, glyph, prov);
    }
  }
}

/**
 * State = replay(ops). The only way to get a buffer from a document —
 * there is no setter API on documents, no "current state" field to
 * drift out of sync. If you want the picture, you replay the history.
 * That's not an implementation detail; it's the ontology (Directive 2).
 */
export function replay(doc: GubbleDoc, opts: { frame?: number } = {}): CellBuffer {
  let def = doc.header.definition;
  let buffer = new CellBuffer(def.cols, def.rows);
  // The flutter frame (§4.3, §9 PHASE): time as an integer someone hands
  // us — the app's animation loop, or a `?f=` param freezing a shimmer
  // MID-shimmer. Never a clock. Cells that PHASE doesn't select ignore
  // it entirely, so a frame change only moves the cells that breathe.
  const frame = opts.frame ?? 0;
  // Selection is replay STATE (§11): select/clearSelect are logged ops,
  // so playback will someday show selections happening — they're
  // performance gestures, part of the document's biography, not UI
  // ephemera. applyOnce reads whatever selection history left standing.
  let selection: SelectionRange | null = null;

  for (const op of doc.ops) {
    switch (op.op) {
      case "setDefinition": {
        const next = op.args["definition"] as GridDefinition;
        def = next;
        buffer = buffer.resized(next.cols, next.rows);
        break;
      }
      case "fill":
        applyFill(buffer, op, frame);
        break;
      case "select":
        selection = (op.args["range"] as SelectionRange | undefined) ?? null;
        break;
      case "clearSelect":
        selection = null;
        break;
      case "applyOnce":
        applyOnce(buffer, op, selection);
        break;
      // Unknown ops from a future gubble replay as no-ops rather than
      // crashes — an old reader shows you what it CAN of a newer
      // document. (Forward-compat posture, [PLACED DEFAULT — §19].)
      default:
        break;
    }
  }
  return buffer;
}
