import { describe, expect, it } from "vitest";
import { censusText, corpusToPhrases } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import { renderSpecimen } from "../src/specimen.js";
import { measureText } from "../src/width.js";
import { inkWeight } from "../src/ramp.js";
import { segmentGraphemes } from "../src/width.js";

const blocksDuctus = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█\n█▓▒░·█▓▒░·"), {
  name: "test-blocks",
});

const corpusDuctus = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n~*~*~*~*~"), {
  name: "test-swirl",
  phrases: corpusToPhrases("thanks 4 the add!!\ntop 8 forever\nxoxo"),
});

describe("renderSpecimen — determinism", () => {
  it("same ductus, same options → byte-identical page", () => {
    expect(renderSpecimen(blocksDuctus)).toBe(renderSpecimen(blocksDuctus));
    expect(renderSpecimen(corpusDuctus)).toBe(renderSpecimen(corpusDuctus));
  });

  it("different dims → different page (dims are part of the specimen seed)", () => {
    expect(renderSpecimen(blocksDuctus, { width: 60 })).not.toBe(renderSpecimen(blocksDuctus, { width: 80 }));
  });
});

describe("renderSpecimen — width honesty", () => {
  it("no line ever exceeds the requested cell width", () => {
    for (const ductus of [blocksDuctus, corpusDuctus]) {
      const page = renderSpecimen(ductus, { width: 64, height: 30 });
      for (const line of page.split("\n")) {
        expect(measureText(line).totalWidth).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe("renderSpecimen — the two sweeps (§7.4)", () => {
  function rowInk(line: string): number {
    const clusters = segmentGraphemes(line);
    if (clusters.length === 0) return 0;
    return clusters.reduce((sum, cl) => sum + inkWeight(cl), 0);
  }

  it("vertical sweep: the top of the page carries more ink than the bottom", () => {
    const page = renderSpecimen(blocksDuctus, { width: 80, height: 40 });
    const rows = page.split("\n").slice(1); // drop the colophon header
    const topInk = rows.slice(0, 5).reduce((s, l) => s + rowInk(l), 0);
    const bottomInk = rows.slice(-5).reduce((s, l) => s + rowInk(l), 0);
    expect(topInk).toBeGreaterThan(bottomInk * 2);
  });

  it("horizontal sweep: with a corpus, the left half reads more corpus-ish than the right", () => {
    const page = renderSpecimen(corpusDuctus, { width: 80, height: 40 });
    const rows = page.split("\n").slice(1);
    const corpusChars = new Set("thanks4headd!!top8foreverxo ".split(""));
    let leftHits = 0;
    let leftTotal = 0;
    let rightHits = 0;
    let rightTotal = 0;
    for (const row of rows.slice(0, 15)) {
      // top rows only — bottom rows are too sparse to say anything
      const clusters = segmentGraphemes(row);
      clusters.forEach((cl, i) => {
        if (cl === " ") return;
        const base = cl[0] ?? "";
        if (i < clusters.length / 2) {
          leftTotal++;
          if (corpusChars.has(base)) leftHits++;
        } else {
          rightTotal++;
          if (corpusChars.has(base)) rightHits++;
        }
      });
    }
    const leftRatio = leftTotal > 0 ? leftHits / leftTotal : 0;
    const rightRatio = rightTotal > 0 ? rightHits / rightTotal : 0;
    expect(leftRatio).toBeGreaterThan(rightRatio);
  });
});
