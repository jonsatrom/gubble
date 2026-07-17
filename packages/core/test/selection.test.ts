// M4a property tests: selection as replay state + the applyOnce verbs.
// The mistranscode tests check REAL encoding math against known
// mojibake — if "é" stops becoming "Ã©", someone replaced arithmetic
// with vibes, and the spec forbids that in so many words (§11).

import { describe, expect, it } from "vitest";
import { createDocument, appendOp, replay } from "../src/log.js";
import { mistranscode, invertGlyph, posterizeGlyph } from "../src/corrupt.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";
const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█"), { name: "blocks" });

function docWithFill() {
  const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
  appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus: blocks } });
  return doc;
}

describe("mistranscode — real encoding math, not vibes", () => {
  it("é becomes Ã© (the canonical wound)", () => {
    expect(mistranscode("é")).toBe("Ã©");
  });

  it("ASCII passes through untouched — that's why real mojibake stays half-legible", () => {
    expect(mistranscode("thanks 4 the add!!")).toBe("thanks 4 the add!!");
  });

  it("█ becomes â–ˆ (UTF-8 E2 96 88 read as cp1252)", () => {
    expect(mistranscode("█")).toBe("â–ˆ");
  });

  it("right single quote becomes â€™ (the € proves the table is cp1252, not Latin-1)", () => {
    expect(mistranscode("’")).toBe("â€™");
  });

  it("corruption expands: output length ≥ input length, always", () => {
    for (const s of ["¤ø,¸¸,ø¤º°", "中文", "🌊", "plain"]) {
      expect(mistranscode(s).length).toBeGreaterThanOrEqual(s.length);
    }
  });
});

describe("invert / posterize", () => {
  it("invert: solid becomes air, air becomes solid", () => {
    expect(invertGlyph("█")).toBe(" ");
    expect(invertGlyph(" ")).toBe("█");
  });

  it("posterize collapses to the 3-step ramp", () => {
    for (const g of ["█", "▓", "▒", "░", "·", "a", " "]) {
      expect([" ", "▒", "█"]).toContain(posterizeGlyph(g));
    }
  });
});

describe("selection ops through the log", () => {
  it("redact paints the range with █/▓ only, and leaves the rest alone", () => {
    const doc = docWithFill();
    const before = replay(doc).toText();
    appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 20, to: 39 } } }); // row 1
    appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "redact" } });
    const buffer = replay(doc);
    for (let c = 0; c < 20; c++) {
      expect(["█", "▓", ""]).toContain(buffer.get(1, c).glyph);
    }
    // row 0 untouched
    expect(buffer.toText().split("\n")[0]).toBe(before.split("\n")[0]);
  });

  it("applyOnce without a selection is a shrug, not a crash", () => {
    const doc = docWithFill();
    const before = replay(doc).toText();
    appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "redact" } });
    expect(replay(doc).toText()).toBe(before);
  });

  it("clearSelect disarms subsequent verbs", () => {
    const doc = docWithFill();
    appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 0, to: 19 } } });
    appendOp(doc, { op: "clearSelect", scope: { kind: "selection" }, args: {} });
    const before = replay(doc).toText();
    appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "invert" } });
    expect(replay(doc).toText()).toBe(before);
  });

  it("the whole selection story replays deterministically (JSON round-trip included)", () => {
    const doc = docWithFill();
    appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 5, to: 60 } } });
    appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "mistranscode" } });
    appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "posterize" } });
    const a = replay(doc).toText();
    const b = replay(JSON.parse(JSON.stringify(doc))).toText();
    expect(a).toBe(b);
  });

  it("fillWith fences the mixer inside the range", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 40, to: 59 } } }); // row 2
    appendOp(doc, {
      op: "applyOnce",
      scope: { kind: "selection" },
      args: {
        verb: "fillWith",
        kit: { corners: [blocks, null, null, null], puck: { x: 0, y: 0 }, effects: { density: 0.5, grain: 0, phase: 0 } },
      },
    });
    const buffer = replay(doc);
    let inkedInRange = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 20; c++) {
        const inked = buffer.get(r, c).glyph !== " " && buffer.get(r, c).glyph !== "";
        if (r === 2 && inked) inkedInRange++;
        if (r !== 2) expect(inked).toBe(false); // nothing outside the fence
      }
    }
    expect(inkedInRange).toBeGreaterThan(0);
  });
});
