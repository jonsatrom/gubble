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
export type OpKind =
  | "setDefinition"
  | "fill"
  | "select"
  | "clearSelect"
  | "applyOnce"
  | "spawnController"
  | "moveController"
  | "persistSection"
  | "movePuck"
  | "swapCorner"
  | "distill";

/**
 * One sample in a coalesced gesture path (§4.1's coalescing rule:
 * "continuous gestures log as one op with a sampled path, max ~20Hz,
 * or the log bloats and playback jitters"). `t` is milliseconds since
 * the GESTURE started, not wall-clock — same rule as op.t itself: time
 * is pacing, recorded relative to something, never an absolute clock
 * value baked into generation math (there's no generation math here at
 * all; a gesture path is raw recorded input, not a seed for anything).
 */
export interface GestureSample {
  x: number;
  y: number;
  t: number;
}

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
 * A controller pinned to a selection (§11): the select-text-spawn-a-
 * mixer move. No text tool on earth does this; we build it like we
 * know that. A selection with a controller pinned to it IS a section
 * (§11's whole ontology in one sentence — pages are just the default
 * section). The controller starts as a single-axis intensity slider
 * over one kit; "expanding to a mini-XY" is just swapping the kit for
 * one with more corners — same op, no new machinery.
 */
export interface SectionState {
  id: string;
  range: SelectionRange;
  kit: Kit;
  /** last-moved intensity, 0..1 — the slider's memory */
  value: number;
  /** persistSection freezes it into the document's permanent anatomy */
  persisted: boolean;
}

/**
 * Fence-fill: the mixer scoped to a range. Shared by applyOnce's
 * fillWith and the controllers — one implementation of "the kit, but
 * only HERE," because two would drift (§8's no-parallel-implementations
 * rule, applied to ourselves).
 */
export function fenceKitFill(
  buffer: CellBuffer,
  kit: Kit,
  seed: string,
  opIndex: number,
  range: SelectionRange,
  frame: number,
): void {
  const lo = Math.max(0, Math.min(range.from, range.to));
  const hi = Math.min(buffer.cols * buffer.rows - 1, Math.max(range.from, range.to));
  for (let idx = lo; idx <= hi; idx++) {
    const { glyph, corner } = cellDraw(kit, seed, idx, { frame });
    if (glyph === " ") continue;
    buffer.set(
      Math.floor(idx / buffer.cols),
      idx % buffer.cols,
      glyph,
      corner ? { aes: corner.id, op: opIndex } : { aes: "⌁fill", op: opIndex },
    );
  }
}

/**
 * A controller move becomes ink: intensity maps to density gain, so
 * value 0 is silence (no fill at all — the slider at rest deposits
 * nothing), low values starve the fill sparse, high values flood it.
 * Every move is a STRATUM — drag the slider four times and the
 * section carries four sediment layers, each with its own op in the
 * log. The slider doesn't set state; it PLAYS. State is what the log
 * remembers about the playing.
 */
/** Intensity → density gain, one formula shared by replay and the app's live preview. */
export function boostKit(kit: Kit, value: number): Kit {
  return {
    ...kit,
    effects: { ...kit.effects, density: Math.min(1, value * 1.7 - 1 + kit.effects.density) },
  };
}

function controllerFill(buffer: CellBuffer, section: SectionState, op: Op, frame: number): void {
  if (section.value <= 0) return;
  fenceKitFill(buffer, boostKit(section.kit, section.value), op.seed, op.i, section.range, frame);
}

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
    // The mixer, scoped (§9: effects and fills are scope-agnostic) —
    // same fence-fill the controllers use.
    const kit = op.args["kit"] as Kit | undefined;
    if (kit) fenceKitFill(buffer, kit, op.seed, op.i, { from: lo, to: hi }, 0);
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

export interface ReplayResult {
  buffer: CellBuffer;
  /** live + persisted sections, in spawn order — the page's anatomy */
  sections: SectionState[];
  /** whatever selection history left standing */
  selection: SelectionRange | null;
}

/**
 * State = replay(ops). The only way to get state from a document —
 * there is no setter API on documents, no "current state" field to
 * drift out of sync. If you want the picture (or the sections, or the
 * selection), you replay the history. That's not an implementation
 * detail; it's the ontology (Directive 2).
 */
export function replayFull(doc: GubbleDoc, opts: { frame?: number } = {}): ReplayResult {
  let def = doc.header.definition;
  let buffer = new CellBuffer(def.cols, def.rows);
  const sections = new Map<string, SectionState>();
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
      case "spawnController": {
        // The mixer materializes ON the selection — under the hand,
        // instantly (§11). The range rides in the op (not read from
        // selection state) so the section outlives later reselections.
        const range = op.args["range"] as SelectionRange | undefined;
        const kit = op.args["kit"] as Kit | undefined;
        if (range && kit) {
          sections.set(`sec_${op.i}`, {
            id: `sec_${op.i}`,
            range,
            kit,
            value: 0,
            persisted: false,
          });
        }
        break;
      }
      case "moveController": {
        const id = op.args["id"] as string | undefined;
        const section = id ? sections.get(id) : undefined;
        if (section) {
          section.value = (op.args["value"] as number | undefined) ?? 0;
          // A kit may ride along — this is "expanding to a mini-XY":
          // the controller adopts new corners mid-performance.
          const kit = op.args["kit"] as Kit | undefined;
          if (kit) section.kit = kit;
          controllerFill(buffer, section, op, frame);
        }
        break;
      }
      case "persistSection": {
        const id = op.args["id"] as string | undefined;
        const section = id ? sections.get(id) : undefined;
        if (section) section.persisted = true;
        break;
      }
      case "movePuck":
      case "swapCorner":
      case "distill":
        // distill (§7.5, M6): "select region → new folder-less aesthetic."
        // Same inertness reasoning as movePuck/swapCorner — the resulting
        // ductus is docked into the RAIL (app-side, local), not written
        // into the buffer; the op exists so a document remembers that a
        // distillation happened and what it drew from (§4.1's v1 table
        // named this from the start, alongside movePuck/swapCorner).
        // Hands over choices: these ops exist so a document remembers
        // the puck leaning and the corners changing, not just the
        // moments someone hit STAMP — Jon's ruling, 2026-07-18, on the
        // spec's own long-standing v1 op table (§4.1 names both; this
        // is the first build). They're deliberately INERT on the
        // buffer today: `fill` stays self-contained, carrying its own
        // full kit snapshot, so a single fill op still grafts cleanly
        // onto a foreign document without needing to replay the
        // gesture history that led to it (§ graft: "ops are
        // deterministic but substrate-dependent" — a fill shouldn't
        // depend on ITS OWN document's puck-drag biography either).
        // What's recorded here waits for v2's playback UI, which is
        // the first thing that will actually walk these paths.
        break;
      // Unknown ops from a future gubble replay as no-ops rather than
      // crashes — an old reader shows you what it CAN of a newer
      // document. (Forward-compat posture, [PLACED DEFAULT — §19].)
      default:
        break;
    }
  }
  return { buffer, sections: [...sections.values()], selection };
}

/** The buffer-only face of replayFull — most callers just want the picture. */
export function replay(doc: GubbleDoc, opts: { frame?: number } = {}): CellBuffer {
  return replayFull(doc, opts).buffer;
}
