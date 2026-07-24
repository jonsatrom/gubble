// movePuck / swapCorner: hands over choices (Jon's ruling, 2026-07-18).
// These property tests hold the design to its own stated reasoning:
// recorded for the biography, INERT on the buffer, so a fill op stays
// self-contained and grafts cleanly regardless of what gesture history
// surrounds it in ITS OWN document, let alone a foreign one.

import { describe, expect, it } from "vitest";
import { createDocument, appendOp, forkDocument, replay, replayFull } from "../src/log.js";
import { deriveSeed } from "../src/hash.js";
import type { GubbleDoc, GestureSample } from "../src/log.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";
const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█"), { name: "blocks" });
const swirl = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n~*~*~*~*~"), { name: "swirl" });

function samplePath(n: number): GestureSample[] {
  return Array.from({ length: n }, (_, i) => ({ x: i / n, y: 1 - i / n, t: i * 50 }));
}

describe("movePuck / swapCorner — inert on the buffer, recorded in the log", () => {
  it("neither op inks a single cell on its own", () => {
    const doc = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(doc, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(12) } });
    appendOp(doc, { op: "swapCorner", scope: { kind: "page" }, args: { corner: 0, aesId: blocks.id } });
    expect(replay(doc).toText().trim()).toBe("");
  });

  it("REAL CONSEQENCE, not a bug: they still occupy an index, so a fill AFTER them gets a different seed than the identical fill as op 0 — hands are now woven into the generative math, not decoration on top of it", () => {
    const solo = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(solo, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.5, y: 0.5 }, effects: { density: 0.4, grain: 0, phase: 0 } } } });

    const afterHands = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(afterHands, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(12) } });
    appendOp(afterHands, { op: "swapCorner", scope: { kind: "page" }, args: { corner: 0, aesId: blocks.id } });
    appendOp(afterHands, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.5, y: 0.5 }, effects: { density: 0.4, grain: 0, phase: 0 } } } });

    expect(solo.ops[0]!.seed).not.toBe(afterHands.ops[2]!.seed); // different index, different stream
    expect(replay(solo).toText()).not.toBe(replay(afterHands).toText());
    // But it's still fully deterministic — same gesture history, same result, forever:
    const repeat = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(repeat, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(12) } });
    appendOp(repeat, { op: "swapCorner", scope: { kind: "page" }, args: { corner: 0, aesId: blocks.id } });
    appendOp(repeat, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.5, y: 0.5 }, effects: { density: 0.4, grain: 0, phase: 0 } } } });
    expect(replay(repeat).toText()).toBe(replay(afterHands).toText());
  });

  it("they're not silently dropped — ops.length reflects the gesture history", () => {
    const doc = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(doc, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(8) } });
    appendOp(doc, { op: "swapCorner", scope: { kind: "page" }, args: { corner: 1, aesId: swirl.id } });
    expect(doc.ops.map((o) => o.op)).toEqual(["movePuck", "swapCorner"]);
    expect(doc.ops[0]!.args["path"]).toHaveLength(8);
  });

  it("survives JSON round-trip exactly — the path itself is the record", () => {
    const doc = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(doc, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(30) } });
    const revived = JSON.parse(JSON.stringify(doc)) as GubbleDoc;
    expect(revived.ops[0]!.args["path"]).toEqual(doc.ops[0]!.args["path"]);
    expect(replayFull(revived).buffer.toText()).toBe(replayFull(doc).buffer.toText());
  });

  it("a fill op grafted (renumbered, reseeded — the real mechanism) onto a foreign document replays true to its own args, independent of the donor's gesture history", () => {
    // Graft itself is v3, unbuilt — this test exercises the PRINCIPLE
    // it depends on: a fill's picture is a pure function of {its own
    // seed, its own args}, never of neighboring ops' args. Renumbering
    // necessarily reseeds (seed = hash(docSeed, i), §4.3) — that's not
    // graft "losing" information, that's the documented lossiness
    // ("grafts take but grow differently in new soil," §1).
    const source = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(source, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(40) } });
    appendOp(source, { op: "swapCorner", scope: { kind: "page" }, args: { corner: 0, aesId: blocks.id } });
    appendOp(source, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.3, y: 0.7 }, effects: { density: 0.3, grain: 0, phase: 0 } } } });

    const grafted = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    const { i: _i, seed: _seed, ...rest } = source.ops[2]!;
    grafted.ops.push({ ...rest, i: 0, seed: deriveSeed(DOC_SEED, 0) }); // properly renumbered AND reseeded
    const solo = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(solo, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.3, y: 0.7 }, effects: { density: 0.3, grain: 0, phase: 0 } } } });

    expect(replay(grafted).toText()).toBe(replay(solo).toText());
  });
});

describe("gesture ops interact correctly with fork lineage", () => {
  it("a fork at n carries whatever gesture ops existed before n, same as any other op kind", () => {
    const doc = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(doc, { op: "movePuck", scope: { kind: "page" }, args: { path: samplePath(5) } });
    appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.5, y: 0.5 }, effects: { density: 0.4, grain: 0, phase: 0 } } } });
    const forked = forkDocument(doc, 1, "gubble://parent");
    expect(forked.ops).toHaveLength(1);
    expect(forked.ops[0]!.op).toBe("movePuck");
    expect(forked.header.lineage).toEqual({ parent: "gubble://parent", at: 1 });
  });
});

describe("moveController — the path rides alongside the value, doesn't replace it", () => {
  it("ink behavior is unchanged whether a path is present or not", () => {
    const withPath = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(withPath, { op: "spawnController", scope: { kind: "selection" }, args: { range: { from: 0, to: 19 }, kit: { corners: [blocks, null, null, null], puck: { x: 0, y: 0 }, effects: { density: 0, grain: 0, phase: 0 } } } });
    appendOp(withPath, { op: "moveController", scope: { kind: "selection" }, args: { id: "sec_0", value: 0.8, path: samplePath(15) } });

    const withoutPath = createDocument({ cols: 20, rows: 6 }, DOC_SEED);
    appendOp(withoutPath, { op: "spawnController", scope: { kind: "selection" }, args: { range: { from: 0, to: 19 }, kit: { corners: [blocks, null, null, null], puck: { x: 0, y: 0 }, effects: { density: 0, grain: 0, phase: 0 } } } });
    appendOp(withoutPath, { op: "moveController", scope: { kind: "selection" }, args: { id: "sec_0", value: 0.8 } });

    expect(replay(withPath).toText()).toBe(replay(withoutPath).toText());
  });
});
