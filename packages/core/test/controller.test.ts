// M4b property tests: the select-text-spawn-a-mixer move, in log form.
// The load-bearing claims: controllers are sections, moves are strata,
// and all of it replays byte-identically forever.

import { describe, expect, it } from "vitest";
import { createDocument, appendOp, replayFull, replay } from "../src/log.js";
import type { GubbleDoc, SelectionRange } from "../src/log.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import type { Kit } from "../src/mixer.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";
const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█"), { name: "blocks" });
const dots = buildDuctus(censusText("· . · . ˚ .\n. ˚ · . · ."), { name: "dots" });

const soloKit = (d = blocks): Kit => ({
  corners: [d, null, null, null],
  puck: { x: 0, y: 0 },
  effects: { density: 0, grain: 0, phase: 0 },
});

const ROW2: SelectionRange = { from: 40, to: 59 }; // row 2 of a 20-col grid

function spawnOn(doc: GubbleDoc, range = ROW2, kit = soloKit()): string {
  const i = doc.ops.length;
  appendOp(doc, { op: "spawnController", scope: { kind: "selection" }, args: { range, kit } });
  return `sec_${i}`;
}

describe("spawnController — the mixer materializes on the selection", () => {
  it("creates a section, unpersisted, at rest (value 0), depositing nothing yet", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    const { buffer, sections } = replayFull(doc);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id, range: ROW2, value: 0, persisted: false });
    expect(buffer.toText().trim()).toBe(""); // a slider at rest is silence
  });
});

describe("moveController — the slider PLAYS; the log remembers the playing", () => {
  it("a move deposits ink inside the fence and nowhere else", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 0.9 } });
    const { buffer } = replayFull(doc);
    let inRange = 0;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 20; c++) {
        const inked = buffer.get(r, c).glyph !== " " && buffer.get(r, c).glyph !== "";
        if (r === 2) {
          if (inked) inRange++;
        } else {
          expect(inked).toBe(false);
        }
      }
    }
    expect(inRange).toBeGreaterThan(0);
  });

  it("value 0 deposits nothing — silence is a valid position", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 0 } });
    expect(replay(doc).toText().trim()).toBe("");
  });

  it("intensity is monotonic-ish: cranked deposits more than a whisper", () => {
    const inkCount = (value: number): number => {
      const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
      const id = spawnOn(doc);
      appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value } });
      const { buffer } = replayFull(doc);
      let n = 0;
      for (let c = 0; c < 20; c++) {
        if (buffer.get(2, c).glyph !== " " && buffer.get(2, c).glyph !== "") n++;
      }
      return n;
    };
    expect(inkCount(1)).toBeGreaterThan(inkCount(0.35));
  });

  it("every move is a stratum: two moves leave two ops' provenance in the sediment", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 1 } });
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 0.4 } });
    const { buffer } = replayFull(doc);
    const opsSeen = new Set<number>();
    for (let c = 0; c < 20; c++) {
      const p = buffer.get(2, c).provenance;
      if (p) opsSeen.add(p.op);
    }
    // The sparse second pass overprints some cells; the flooded first
    // pass shows through its gaps — both strata visible (flat ontology:
    // neither move is "the" state).
    expect(opsSeen.size).toBeGreaterThanOrEqual(2);
  });

  it("a kit riding on a move re-corners the controller — mini-XY expansion, no new machinery", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, {
      op: "moveController",
      scope: { kind: "selection" },
      args: { id, value: 0.9, kit: soloKit(dots) },
    });
    const { buffer, sections } = replayFull(doc);
    expect(sections[0]!.kit.corners[0]!.name).toBe("dots");
    // and the fill actually speaks dots now
    let dotProvenance = 0;
    for (let c = 0; c < 20; c++) {
      const p = buffer.get(2, c).provenance;
      if (p?.aes === dots.id) dotProvenance++;
    }
    expect(dotProvenance).toBeGreaterThan(0);
  });

  it("moving a controller that doesn't exist is a shrug", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id: "sec_404", value: 1 } });
    expect(replay(doc).toText().trim()).toBe("");
  });
});

describe("persistSection — a selection with a controller IS a section (§11)", () => {
  it("flips the persisted flag; the anatomy survives replay", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, { op: "persistSection", scope: { kind: "selection" }, args: { id } });
    expect(replayFull(doc).sections[0]!.persisted).toBe(true);
  });
});

describe("determinism — the performance is re-performable", () => {
  it("the whole controller story replays byte-identically through JSON", () => {
    const doc = createDocument({ cols: 20, rows: 5 }, DOC_SEED);
    const id = spawnOn(doc);
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 0.7 } });
    appendOp(doc, { op: "persistSection", scope: { kind: "selection" }, args: { id } });
    appendOp(doc, { op: "moveController", scope: { kind: "selection" }, args: { id, value: 0.3 } });
    const a = replayFull(doc);
    const b = replayFull(JSON.parse(JSON.stringify(doc)) as GubbleDoc);
    expect(a.buffer.toText()).toBe(b.buffer.toText());
    expect(a.sections).toEqual(b.sections);
  });
});
