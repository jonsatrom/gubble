// Calibration cases for §5.1's cell-width math, and the M1 promise from
// §17: "emoji/ZWJ width table" property tests. Every codepoint used below
// was checked against the actual generated tables (see
// scripts/vendor-unicode-data.mjs output) before being written into an
// assertion — no guessing at what Unicode says about a given glyph.

import { describe, expect, it } from "vitest";
import {
  clusterWidth,
  isDefaultEmojiPresentation,
  isWide,
  measureText,
  segmentGraphemes,
  MEASURE_ID,
} from "../src/width.js";

describe("isWide — East_Asian_Width W|F lookup", () => {
  it("ASCII is narrow", () => {
    expect(isWide("A".codePointAt(0)!)).toBe(false);
  });

  it("Hangul syllables are wide", () => {
    expect(isWide("가".codePointAt(0)!)).toBe(true);
  });

  it("CJK ideographs are wide", () => {
    expect(isWide("中".codePointAt(0)!)).toBe(true);
  });

  it("Hiragana is wide", () => {
    expect(isWide("あ".codePointAt(0)!)).toBe(true);
  });
});

describe("isDefaultEmojiPresentation", () => {
  it("watch (U+231A) defaults to emoji presentation", () => {
    expect(isDefaultEmojiPresentation(0x231a)).toBe(true);
  });

  it("grinning face (U+1F600) defaults to emoji presentation", () => {
    expect(isDefaultEmojiPresentation(0x1f600)).toBe(true);
  });

  it("heavy check mark (U+2714) defaults to TEXT presentation", () => {
    // This one only becomes 2 cells with an explicit VS16 — see below.
    expect(isDefaultEmojiPresentation(0x2714)).toBe(false);
  });
});

describe("clusterWidth", () => {
  it("plain ASCII: 1 cell", () => {
    expect(clusterWidth("x")).toBe(1);
  });

  it("wide CJK: 2 cells", () => {
    expect(clusterWidth("中")).toBe(2);
  });

  it("default-emoji-presentation glyph: 2 cells, no VS16 needed", () => {
    expect(clusterWidth("⌚")).toBe(2);
  });

  it("text-default glyph WITHOUT VS16: 1 cell", () => {
    expect(clusterWidth("✔")).toBe(1);
  });

  it("text-default glyph WITH VS16: forced to 2 cells", () => {
    expect(clusterWidth("✔️")).toBe(2);
  });

  it("watch (U+231A) WITH VS15 stays 2 cells — it's ALSO East_Asian_Width wide", () => {
    // Turns out nearly every default-emoji-presentation codepoint is also
    // EAW wide (checked against the actual generated tables, not assumed)
    // — VS15 only strips the emoji-table vote, and the EAW vote alone
    // still says wide. So forcing text presentation here changes nothing
    // measurable. The interesting VS15 case is below.
    expect(clusterWidth("⌚︎")).toBe(2);
  });

  it("a regional-indicator letter (default-emoji, but NOT EAW-wide) WITH VS15: forced to 1 cell", () => {
    // Regional indicators (flag letters) are the actual exception to "all
    // default-emoji codepoints are also EAW-wide" — this is the one case
    // where VS15's text-presentation override is observable as a width
    // change rather than a no-op.
    expect(isDefaultEmojiPresentation(0x1f1e6)).toBe(true);
    expect(isWide(0x1f1e6)).toBe(false);
    expect(clusterWidth("\u{1F1E6}\u{FE0E}")).toBe(1);
  });
});

describe("ZWJ sequences and zalgo — ‘combining marks attach, 0 cells of their own’ (§5.1)", () => {
  it("a ZWJ family emoji sequence is ONE grapheme cluster", () => {
    const clusters = segmentGraphemes("👨‍👩‍👧‍👦");
    expect(clusters).toHaveLength(1);
  });

  it("...and that one cluster measures as 2 cells, not 2-per-person", () => {
    expect(clusterWidth("👨‍👩‍👧‍👦")).toBe(2);
  });

  it("stacking combining marks onto a base char stays ONE cluster regardless of stack depth", () => {
    const base = "e";
    const zalgo = base + "́̀̂̃̄̅̆̇"; // 8 combining marks
    const clusters = segmentGraphemes(zalgo);
    expect(clusters).toHaveLength(1);
    expect(clusterWidth(clusters[0]!)).toBe(1); // base 'e' is narrow; stack depth doesn't add cells
  });

  it("a lone lightly-stacked combining mark on a wide base still measures the base's width", () => {
    const combo = "中" + "́";
    const clusters = segmentGraphemes(combo);
    expect(clusters).toHaveLength(1);
    expect(clusterWidth(clusters[0]!)).toBe(2);
  });
});

describe("measureText", () => {
  it("sums per-cluster widths into a total", () => {
    const { totalWidth, clusters } = measureText("A中⌚");
    expect(clusters.map((c) => c.width)).toEqual([1, 2, 2]);
    expect(totalWidth).toBe(5);
  });

  it("throws if shear is requested without a seed (Directive 1 — no naked randomness)", () => {
    expect(() => measureText("hello", { shear: true })).toThrow();
  });

  it("shear is deterministic: same text + same seed → same result, every time", () => {
    const a = measureText("hello world, gubble gubble", { shear: true, shearSeed: "abc123" });
    const b = measureText("hello world, gubble gubble", { shear: true, shearSeed: "abc123" });
    expect(a).toEqual(b);
  });

  it("shear with a different seed can (and generally does) diverge", () => {
    const a = measureText("hello world, gubble gubble", { shear: true, shearSeed: "abc123" });
    const b = measureText("hello world, gubble gubble", { shear: true, shearSeed: "xyz789" });
    expect(a.clusters).not.toEqual(b.clusters);
  });

  it("shear never produces a negative width", () => {
    const { clusters } = measureText("iiiiiiiiiiiiiiiiiiiiiiii", { shear: true, shearSeed: "floor-test" });
    for (const c of clusters) {
      expect(c.width).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("MEASURE_ID", () => {
  it("matches the header schema's example (§4.1)", () => {
    expect(MEASURE_ID).toBe("eaw-16.0/g1");
  });
});
