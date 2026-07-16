// The cell buffer: gubble's canvas, GRID's substrate (§5.1). A cols×rows
// field of cells where every glyph knows its width (measured against the
// frozen ruler) and every cell knows its ancestry (§14.1 — the
// provenance channel ships in v1 because retrofitting rich-text-where-
// the-formatting-is-ancestry under a bare grid later would be the same
// misery as retrofitting the event log; see Directive 2).
//
// The buffer is deliberately dumb: it places, it reports, it mirrors to
// plain text. It does not decide WHAT to place — that's the ops' job
// (log.ts). Keeping placement policy out of here means GRID rendering,
// export, and the census can all trust the buffer without inheriting
// anyone's opinions.

import { clusterWidth } from "./width.js";

/**
 * Who inked this cell: which aesthetic, via which op. This is the
 * crumple logic — hover a cell someday and core-sample its genealogy
 * (§14.1). Never exported in plain text (the cootie, §14.2, is v3 and
 * opt-in); it exists for distillation, honest forking, and the future
 * inspector.
 */
export interface Provenance {
  /** ductus id that inked this cell */
  aes: string;
  /** op index that placed it */
  op: number;
}

export interface Cell {
  /**
   * The grapheme cluster occupying this cell. `""` marks the
   * continuation cell of a wide glyph (the glyph lives one cell left);
   * `" "` is honest empty space.
   */
  glyph: string;
  provenance: Provenance | null;
}

const EMPTY_CELL: Cell = Object.freeze({ glyph: " ", provenance: null });

export class CellBuffer {
  readonly cols: number;
  readonly rows: number;
  private cells: Cell[];

  constructor(cols: number, rows: number) {
    if (cols < 1 || rows < 1) throw new Error(`CellBuffer needs positive dims, got ${cols}×${rows}`);
    this.cols = cols;
    this.rows = rows;
    this.cells = new Array<Cell>(cols * rows).fill(EMPTY_CELL);
  }

  private index(row: number, col: number): number {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      throw new Error(`cell (${row},${col}) outside ${this.cols}×${this.rows} buffer`);
    }
    return row * this.cols + col;
  }

  get(row: number, col: number): Cell {
    return this.cells[this.index(row, col)]!;
  }

  /**
   * Place one grapheme cluster at (row, col), width-aware. A wide glyph
   * claims (row, col) AND (row, col+1); if col+1 would fall off the row
   * edge, the placement is refused (returns false) rather than sheared —
   * deliberate breakage is a slider (§5.1 `shear`), never an accident.
   * Placing anything over a wide glyph's continuation cell, or over the
   * head of a wide glyph, evicts the whole glyph first — no orphaned
   * half-cows.
   */
  set(row: number, col: number, glyph: string, provenance: Provenance | null): boolean {
    const width = glyph === " " || glyph === "" ? 1 : clusterWidth(glyph);
    if (width === 2 && col + 1 >= this.cols) return false;

    this.evict(row, col);
    if (width === 2) this.evict(row, col + 1);

    this.cells[this.index(row, col)] = { glyph, provenance };
    if (width === 2) {
      this.cells[this.index(row, col + 1)] = { glyph: "", provenance };
    }
    return true;
  }

  /** Clear a cell — and if it's half of a wide glyph, clear the other half too. */
  private evict(row: number, col: number): void {
    const cell = this.cells[this.index(row, col)]!;
    if (cell.glyph === "") {
      // continuation cell: the head is one left
      this.cells[this.index(row, col - 1)] = EMPTY_CELL;
    } else if (cell.glyph !== " " && clusterWidth(cell.glyph) === 2 && col + 1 < this.cols) {
      this.cells[this.index(row, col + 1)] = EMPTY_CELL;
    }
    this.cells[this.index(row, col)] = EMPTY_CELL;
  }

  /**
   * The plain-text mirror — what copy/export sees (§5.1: "what you copy
   * is real characters, always"; §13: the mirror is the source of
   * truth). Continuation cells vanish (their glyph is already emitted by
   * the head cell); trailing spaces are trimmed per line.
   */
  toText(): string {
    const lines: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      let line = "";
      for (let c = 0; c < this.cols; c++) {
        line += this.cells[r * this.cols + c]!.glyph; // "" for continuations adds nothing
      }
      lines.push(line.replace(/\s+$/, ""));
    }
    return lines.join("\n");
  }

  /**
   * Resize into a new buffer, preserving whatever overlaps. Content
   * beyond the new bounds is cropped — a wide glyph straddling the new
   * right edge is dropped whole (no half-glyphs, same rule as set()).
   */
  resized(cols: number, rows: number): CellBuffer {
    const next = new CellBuffer(cols, rows);
    for (let r = 0; r < Math.min(this.rows, rows); r++) {
      for (let c = 0; c < Math.min(this.cols, cols); c++) {
        const cell = this.cells[r * this.cols + c]!;
        if (cell.glyph === "" || cell.glyph === " ") continue;
        next.set(r, c, cell.glyph, cell.provenance); // refusal at the edge = crop
      }
    }
    return next;
  }
}
