// M1's promised property tests (§17): replay determinism, in every way a
// well-meaning refactor could break it. These are the tests that stand
// between "the log IS the document" and "the log is a decorative
// changelog." Directive 2 lives or dies here.

import { describe, expect, it } from "vitest";
import { createDocument, appendOp, truncate, forkDocument, replay } from "../src/log.js";
import type { GubbleDoc } from "../src/log.js";
import { CellBuffer } from "../src/buffer.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import { measureText } from "../src/width.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";

const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█\n█▓▒░·█▓▒░·"), { name: "blocks" });
const cjk = buildDuctus(censusText("中中文文字字\n字文中中文字\n文字中文中中"), { name: "cjk" });

function makeDoc(): GubbleDoc {
  const doc = createDocument({ cols: 40, rows: 12 }, DOC_SEED);
  appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
  appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: cjk } });
  return doc;
}

describe("replay — determinism or death", () => {
  it("same document replays to the identical page, every time", () => {
    expect(replay(makeDoc()).toText()).toBe(replay(makeDoc()).toText());
  });

  it("a document round-tripped through JSON replays identically (the shareable form is the real form)", () => {
    const doc = makeDoc();
    const revived = JSON.parse(JSON.stringify(doc)) as GubbleDoc;
    expect(replay(revived).toText()).toBe(replay(doc).toText());
  });

  it("wall-clock timestamps are pacing only: mutating every t changes NOTHING", () => {
    const doc = makeDoc();
    const before = replay(doc).toText();
    for (const op of doc.ops) op.t = Math.floor(Math.random() * 1e13); // the one sanctioned Math.random in this repo: proving t doesn't matter
    expect(replay(doc).toText()).toBe(before);
  });

  it("different docSeeds → different pages (the seed actually reaches the cells)", () => {
    const a = createDocument({ cols: 40, rows: 12 }, DOC_SEED);
    appendOp(a, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    const b = createDocument({ cols: 40, rows: 12 }, "ffffffff000000001111111122222222");
    appendOp(b, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    expect(replay(a).toText()).not.toBe(replay(b).toText());
  });
});

describe("undo = log truncation (Directive 2)", () => {
  it("truncating to n ops replays to the state at n", () => {
    const doc = makeDoc();
    const oneOpDoc = createDocument({ cols: 40, rows: 12 }, DOC_SEED);
    appendOp(oneOpDoc, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    expect(replay(truncate(doc, 1)).toText()).toBe(replay(oneOpDoc).toText());
  });

  it("truncation doesn't mutate the original — redo stays possible", () => {
    const doc = makeDoc();
    const full = replay(doc).toText();
    truncate(doc, 1);
    expect(replay(doc).toText()).toBe(full);
  });
});

describe("fork-at (§4.1 lineage)", () => {
  it("a fork at n replays identically to the parent truncated at n", () => {
    const doc = makeDoc();
    const fork = forkDocument(doc, 1, "gubble://parent");
    expect(replay(fork).toText()).toBe(replay(truncate(doc, 1)).toText());
    expect(fork.header.lineage).toEqual({ parent: "gubble://parent", at: 1 });
  });

  it("divergent futures from a shared prefix: same op index, different args, different pages", () => {
    const doc = makeDoc();
    const forkA = forkDocument(doc, 1);
    const forkB = forkDocument(doc, 1);
    appendOp(forkA, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    appendOp(forkB, { op: "fill", scope: { kind: "page" }, args: { ductus: cjk } });
    expect(replay(forkA).toText()).not.toBe(replay(forkB).toText());
  });
});

describe("fill — per-cell honesty", () => {
  it("wide glyphs never shear off the right edge: every line fits the definition", () => {
    const doc = createDocument({ cols: 21, rows: 10 }, DOC_SEED); // odd width to force edge collisions
    appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: cjk } });
    for (const line of replay(doc).toText().split("\n")) {
      expect(measureText(line).totalWidth).toBeLessThanOrEqual(21);
    }
  });

  it("provenance is stamped: inked cells know their aesthetic and their op", () => {
    const doc = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    const buffer = replay(doc);
    let inked = 0;
    for (let r = 0; r < buffer.rows; r++) {
      for (let c = 0; c < buffer.cols; c++) {
        const cell = buffer.get(r, c);
        if (cell.glyph !== " " && cell.glyph !== "") {
          expect(cell.provenance).toEqual({ aes: blocks.id, op: 0 });
          inked++;
        }
      }
    }
    expect(inked).toBeGreaterThan(0);
  });

  it("a second fill overprints but the survivors keep their original ancestry", () => {
    const buffer = replay(makeDoc());
    const seen = new Set<string>();
    for (let r = 0; r < buffer.rows; r++) {
      for (let c = 0; c < buffer.cols; c++) {
        const p = buffer.get(r, c).provenance;
        if (p) seen.add(p.aes);
      }
    }
    // Both aesthetics should still be present in the ancestry — fill 2
    // has density < 1, so fill 1 shows through the gaps.
    expect(seen.has(blocks.id)).toBe(true);
    expect(seen.has(cjk.id)).toBe(true);
  });
});

describe("setDefinition — resize as history", () => {
  it("resizing crops deterministically and replays stably", () => {
    const doc = createDocument({ cols: 40, rows: 12 }, DOC_SEED);
    appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
    appendOp(doc, { op: "setDefinition", scope: { kind: "page" }, args: { definition: { cols: 20, rows: 6 } } });
    const a = replay(doc).toText();
    const b = replay(JSON.parse(JSON.stringify(doc)) as GubbleDoc).toText();
    expect(a).toBe(b);
    for (const line of a.split("\n")) {
      expect(measureText(line).totalWidth).toBeLessThanOrEqual(20);
    }
    expect(a.split("\n")).toHaveLength(6);
  });
});

describe("CellBuffer — width discipline", () => {
  it("refuses a wide glyph at the last column rather than shearing it", () => {
    const buffer = new CellBuffer(4, 1);
    expect(buffer.set(0, 3, "中", null)).toBe(false);
    expect(buffer.set(0, 2, "中", null)).toBe(true);
    expect(buffer.toText()).toBe("  中");
  });

  it("evicts a whole wide glyph when either of its cells is overwritten — no orphaned halves", () => {
    const buffer = new CellBuffer(6, 1);
    buffer.set(0, 1, "中", null);
    buffer.set(0, 2, "x", null); // lands on the continuation cell
    expect(buffer.toText()).toBe("  x");
    expect(buffer.get(0, 1).glyph).toBe(" "); // the head is gone too
  });
});
