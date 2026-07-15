// Census property tests, including the §8 calibration discipline:
// "gradient documents… census the left third vs right third; the vectors
// MUST differ in the swept parameter and only meaningfully in it."

import { describe, expect, it } from "vitest";
import { censusText, corpusToPhrases } from "../src/census.js";
import { buildDuctus, ductusId, proposeGrain } from "../src/ductus.js";

// A deterministic density gradient, dense-left → sparse-right, built
// with plain arithmetic (no RNG — fixtures shouldn't need dice). The
// same formula generates /calibration/density-sweep-lr.txt.
export function densityGradientLR(width = 90, height = 24): string {
  const lines: string[] = [];
  for (let r = 0; r < height; r++) {
    let line = "";
    for (let c = 0; c < width; c++) {
      const threshold = 1 - c / (width - 1); // full ink at left, none at right
      const pseudo = ((r * 31 + c * 17) % 97) / 97; // deterministic scatter
      line += pseudo < threshold ? "█" : " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

describe("censusText — determinism", () => {
  it("same text, same stats, every time", () => {
    const text = "¤ø,¸¸,ø¤º°`°º¤\n░▒▓█▓▒░\nhello 🌊 world";
    expect(censusText(text)).toEqual(censusText(text));
  });
});

describe("censusText — the calibration gradient (§8)", () => {
  const full = densityGradientLR();
  const lines = full.split("\n");
  const third = Math.floor(lines[0]!.length / 3);
  const left = lines.map((l) => l.slice(0, third)).join("\n");
  const right = lines.map((l) => l.slice(2 * third)).join("\n");

  it("left third censuses much denser than right third", () => {
    const dl = censusText(left).density;
    const dr = censusText(right).density;
    expect(dl - dr).toBeGreaterThan(0.3);
  });

  it("whitespace sweeps the other way", () => {
    expect(censusText(right).whitespace).toBeGreaterThan(censusText(left).whitespace);
  });
});

describe("censusText — the vector's stranger limbs", () => {
  it("stackDepth: zalgo text censuses deep, plain text censuses flat", () => {
    const plain = censusText("hello world");
    const zalgo = censusText("h̸̢̛e̷̳͠l̶̡̀l̵̙̈o̸͇͝");
    expect(plain.stackDepth).toBe(0);
    expect(zalgo.stackDepth).toBeGreaterThan(1);
  });

  it("emojiRatio: emoji material registers, ASCII doesn't", () => {
    expect(censusText("🌊🌊🪱✂✂️").emojiRatio).toBeGreaterThan(0.5);
    expect(censusText("plain old text").emojiRatio).toBe(0);
  });

  it("drip: vertically repeated columns census high, diagonal marks census zero", () => {
    const drippy = "█·█·█\n█·█·█\n█·█·█";
    // First draft of this fixture used · as the "empty" filler and the
    // census rightly scored it 0.6 — dots below dots ARE drip. Material
    // is material; only actual space is nothing.
    const dry = "█    \n  █  \n    █";
    expect(censusText(drippy).drip).toBeGreaterThan(0.9);
    expect(censusText(dry).drip).toBe(0);
  });

  it("symmetry: mirrored lines score high, ragged lines score low", () => {
    const mirrored = "(░▒▓█▓▒░)\n<~≋∿≋~>";
    const ragged = "█▓░····\n·░░█▓▓▓";
    expect(censusText(mirrored).symmetry).toBeGreaterThan(0.8);
    expect(censusText(ragged).symmetry).toBeLessThan(0.4);
  });

  it("runLength: '████' is one run of 4, alternation is runs of 1", () => {
    expect(censusText("████").runLength.mean).toBe(4);
    expect(censusText("█▓█▓█▓").runLength.mean).toBe(1);
  });

  it("hazard: an RTL override trips the flag", () => {
    expect(censusText("normal text").hazard.rtl).toBe(false);
    expect(censusText("sneaky ‮ reversed").hazard.rtl).toBe(true);
  });

  it("wide glyphs occupy two cells of territory in the denominators", () => {
    // Four CJK glyphs = 8 cells, all inked; four ASCII = 4 cells.
    const cjk = censusText("中中中中");
    const ascii = censusText("aaaa");
    expect(cjk.totals.cells).toBe(8);
    expect(ascii.totals.cells).toBe(4);
  });
});

describe("corpusToPhrases", () => {
  it("splits lines and sentences, dedupes, preserves first-seen order", () => {
    const corpus = "thanks 4 the add!! see u around.\nthanks 4 the add!!\ntop 8 forever";
    expect(corpusToPhrases(corpus)).toEqual(["thanks 4 the add!!", "see u around.", "top 8 forever"]);
  });

  it("drops empties and >120-char monsters", () => {
    const monster = "x".repeat(121);
    expect(corpusToPhrases(`\n\n${monster}\nkeep me`)).toEqual(["keep me"]);
  });
});

describe("ductus — identity discipline", () => {
  it("same census + same options → same id (recompiling unchanged material re-identifies nothing)", () => {
    const stats = censusText(densityGradientLR());
    const a = buildDuctus(stats, { name: "cal" });
    const b = buildDuctus(stats, { name: "cal" });
    expect(a.id).toBe(b.id);
    expect(a).toEqual(b);
  });

  it("renaming does NOT re-identify (names are not identity — §15: names non-unique, IDs unique)", () => {
    const stats = censusText(densityGradientLR());
    const a = buildDuctus(stats, { name: "one-name" });
    const b = buildDuctus(stats, { name: "another-name" });
    expect(a.id).toBe(b.id);
  });

  it("different material → different id", () => {
    const a = buildDuctus(censusText("████████"), { name: "x" });
    const b = buildDuctus(censusText("········"), { name: "x" });
    expect(a.id).not.toBe(b.id);
  });

  it("manifest grainAffinity wins over the compiler's proposal", () => {
    const stats = censusText("████████\n████████");
    expect(proposeGrain(stats)).toBe("texture");
    const d = buildDuctus(stats, { name: "x", grainAffinity: "poster" });
    expect(d.vector.grainAffinity).toBe("poster");
  });

  it("censused hazard cannot be hidden by the manifest", () => {
    const stats = censusText("sneaky ‮ reversed material");
    const d = buildDuctus(stats, { name: "x", hazard: false });
    expect(d.meta.hazard).toBe(true);
  });
});
