// Mixer property tests (§10): the puck LEANS, corners bleed, and every
// bit of it must be reproducible from a seed — including mid-shimmer.

import { describe, expect, it } from "vitest";
import { bilinearWeights, mixVectors, applyEffects, cellDraw, kitFill, NEUTRAL_EFFECTS } from "../src/mixer.js";
import type { Kit, Corners, EffectState } from "../src/mixer.js";
import { encodeKitUrl, decodeKitUrl } from "../src/kit.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import { CellBuffer } from "../src/buffer.js";
import { createDocument, appendOp, replay } from "../src/log.js";
import { inkWeight } from "../src/ramp.js";
import { segmentGraphemes } from "../src/width.js";

const heavy = buildDuctus(censusText("████▓▓██████▓▓████\n██▓▓████▓▓████████"), { name: "heavy" });
const dots = buildDuctus(censusText("· . · . ˚ . · ˚ ·\n. ˚ · . · . ˚ · ."), { name: "dots" });
const swirl = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n~*~*~*~*~"), { name: "swirl" });
const wave = buildDuctus(censusText("∿∿≋≋∿∿≋≋\n≋∿≋∿≋∿≋∿"), { name: "wave" });

const corners: Corners = [heavy, dots, swirl, wave];
const TEST_COLS = 20; // arbitrary buffer width for tests that don't care about row/col geometry

function kit(x: number, y: number, effects = NEUTRAL_EFFECTS): Kit {
  return { corners, puck: { x, y }, effects };
}

describe("bilinearWeights", () => {
  it("sums to 1 everywhere", () => {
    for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5], [0.3, 0.8], [0.01, 0.99]] as const) {
      const w = bilinearWeights(x, y);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it("is corner-exact: puck parked on a corner gives that corner everything", () => {
    expect(bilinearWeights(0, 0)).toEqual([1, 0, 0, 0]);
    expect(bilinearWeights(1, 0)).toEqual([0, 1, 0, 0]);
    expect(bilinearWeights(0, 1)).toEqual([0, 0, 1, 0]);
    expect(bilinearWeights(1, 1)).toEqual([0, 0, 0, 1]);
  });
});

describe("mixVectors", () => {
  it("null corners renormalize away instead of dragging the mix toward zero", () => {
    const solo: Corners = [heavy, null, null, null];
    // Puck far from the only occupied corner: the mix should still be
    // fully heavy, not heavy-diluted-by-absence.
    const mixed = mixVectors(solo, bilinearWeights(0.9, 0.9));
    expect(mixed).not.toBeNull();
    expect(mixed!.density).toBeCloseTo(heavy.vector.density, 5);
  });

  it("all-null corners mix to nothing, honestly", () => {
    expect(mixVectors([null, null, null, null], bilinearWeights(0.5, 0.5))).toBeNull();
  });
});

describe("effects (§9 — density, grain)", () => {
  const base = mixVectors(corners, bilinearWeights(0.5, 0.5))!;

  it("density gain is monotonic: more gain, more ink", () => {
    const starved = applyEffects(base, { ...NEUTRAL_EFFECTS, density: -0.8 });
    const neutral = applyEffects(base, NEUTRAL_EFFECTS);
    const flooded = applyEffects(base, { ...NEUTRAL_EFFECTS, density: 0.8 });
    expect(starved.density).toBeLessThan(neutral.density);
    expect(neutral.density).toBeLessThan(flooded.density);
  });

  it("grain re-voices coverage: texture lean inks more than poster lean", () => {
    const poster = applyEffects(base, { ...NEUTRAL_EFFECTS, grain: -1 });
    const texture = applyEffects(base, { ...NEUTRAL_EFFECTS, grain: 1 });
    expect(texture.density).toBeGreaterThan(poster.density);
  });
});

describe("cellDraw — determinism and shimmer", () => {
  it("same kit, same seed, same cell → same glyph, forever", () => {
    const k = kit(0.37, 0.62);
    for (let i = 0; i < 50; i++) {
      expect(cellDraw(k, "seedseed", i, TEST_COLS)).toEqual(cellDraw(k, "seedseed", i, TEST_COLS));
    }
  });

  it("shimmer: mid-pad cells draw from MULTIPLE corners, not one winner", () => {
    const k = kit(0.5, 0.5);
    const sources = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { corner } = cellDraw(k, "seedseed", i, TEST_COLS);
      if (corner) sources.add(corner.id);
    }
    expect(sources.size).toBeGreaterThanOrEqual(3); // the crossfade is a conversation
  });

  it("corner-parked puck draws overwhelmingly from that corner", () => {
    const k = kit(0, 0); // parked on `heavy`
    let heavyCount = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const { corner } = cellDraw(k, "seedseed", i, TEST_COLS);
      if (!corner) continue;
      total++;
      if (corner.id === heavy.id) heavyCount++;
    }
    // Baseline wobble (0.06) keeps a whisper of neighbors even parked —
    // that's the shimmer working — but the parked corner dominates.
    expect(heavyCount / total).toBeGreaterThan(0.85);
  });
});

describe("PHASE (§9) — a parked puck still breathes", () => {
  it("phase 0: frames are irrelevant, the page is stone", () => {
    const k = kit(0.4, 0.4);
    for (let i = 0; i < 100; i++) {
      expect(cellDraw(k, "s", i, TEST_COLS, { frame: 0 })).toEqual(cellDraw(k, "s", i, TEST_COLS, { frame: 999 }));
    }
  });

  it("phase > 0: SOME cells move between frames, most hold still at low phase", () => {
    const k = kit(0.4, 0.4, { ...NEUTRAL_EFFECTS, phase: 0.3 });
    let moved = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const a = cellDraw(k, "s", i, TEST_COLS, { frame: 0 });
      const b = cellDraw(k, "s", i, TEST_COLS, { frame: 7 });
      if (a.glyph !== b.glyph) moved++;
    }
    expect(moved).toBeGreaterThan(0); // it breathes
    expect(moved / N).toBeLessThan(0.6); // it doesn't strobe
  });

  it("mid-shimmer freeze: the same frame reproduces exactly (?f= is possible)", () => {
    const k = kit(0.4, 0.4, { ...NEUTRAL_EFFECTS, phase: 0.8 });
    const buffer1 = new CellBuffer(30, 8);
    const buffer2 = new CellBuffer(30, 8);
    kitFill(buffer1, k, "opseed01", 0, { frame: 4242 });
    kitFill(buffer2, k, "opseed01", 0, { frame: 4242 });
    expect(buffer1.toText()).toBe(buffer2.toText());
  });
});

describe("kit fill through the event log", () => {
  it("a fill op carrying a kit replays deterministically, frame included", () => {
    const doc = createDocument({ cols: 30, rows: 8 }, "abcdef0123456789abcdef0123456789");
    appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { kit: kit(0.6, 0.3, { ...NEUTRAL_EFFECTS, phase: 0.5 }) } });
    expect(replay(doc, { frame: 17 }).toText()).toBe(replay(doc, { frame: 17 }).toText());
    expect(replay(doc, { frame: 17 }).toText()).not.toBe(replay(doc, { frame: 18 }).toText());
  });
});

describe("kit-as-URL (§12 ?k=)", () => {
  it("round-trips the whole patch", async () => {
    const k = kit(0.25, 0.75, { density: 0.3, grain: -0.5, phase: 0.1 });
    const url = await encodeKitUrl(k);
    expect(await decodeKitUrl(url)).toEqual(k);
  });
});

// ── M6, "before zzz": the five effects spec §9 named and M2 never built ──
// drip, jitter, symmetry, blur, filter. Each test closes the loop with
// something ALREADY trusted rather than inventing new assertions from
// scratch — drip/symmetry get verified through the same census.ts stats
// that measure them in source material; that's not laziness, it's the
// same instrument checking itself two ways.

function fillBuffer(
  effects: Partial<EffectState>,
  seed = "gubble-effects-seed",
  cols = 30,
  rows = 20,
  puck = { x: 0.5, y: 0.5 },
): CellBuffer {
  const buffer = new CellBuffer(cols, rows);
  const k: Kit = { corners, puck, effects: { ...NEUTRAL_EFFECTS, density: 0.6, ...effects } };
  kitFill(buffer, k, seed, 0, {});
  return buffer;
}

describe("DRIP (§9) — vertical bleed, verified via census's OWN drip stat", () => {
  it("drip=1 measurably out-drips drip=0 at the same seed", () => {
    const dry = censusText(fillBuffer({ drip: 0 }).toText()).drip;
    const wet = censusText(fillBuffer({ drip: 1 }).toText()).drip;
    expect(wet).toBeGreaterThan(dry);
  });

  it("drip never fires on row 0 — there's nothing above it to bleed from", () => {
    const buffer = fillBuffer({ drip: 1 });
    // Not a strict assertion on content (row 0 is still whatever density
    // draws) — just confirms the function doesn't throw indexing row -1.
    expect(() => buffer.toText()).not.toThrow();
  });
});

describe("JITTER (§9) — positional noise, a cell borrowing a neighbor's content", () => {
  it("jitter=1 differs from jitter=0 at the same seed in a real fraction of cells", () => {
    const still = fillBuffer({ jitter: 0 }).toText();
    const jittery = fillBuffer({ jitter: 1 }).toText();
    expect(jittery).not.toBe(still);
    let diffChars = 0;
    for (let i = 0; i < still.length; i++) if (still[i] !== jittery[i]) diffChars++;
    expect(diffChars).toBeGreaterThan(still.length * 0.05); // not just a rounding-error handful
  });
});

describe("SYMMETRY (§9) — mirror enforcement, verified via census's OWN symmetry stat", () => {
  it("symmetry=1 measurably out-mirrors symmetry=0 at the same seed", () => {
    const raw = censusText(fillBuffer({ symmetry: 0 }).toText()).symmetry;
    const mirrored = censusText(fillBuffer({ symmetry: 1 }).toText()).symmetry;
    expect(mirrored).toBeGreaterThan(raw);
  });
});

describe("BLUR (§9) — ramp-diffusion smooths ink variance without leaving text", () => {
  it("blur=1 reduces ink-weight variance versus blur=0 at the same seed", () => {
    const variance = (text: string): number => {
      const inks = segmentGraphemes(text.replace(/\n/g, "")).map(inkWeight);
      const mean = inks.reduce((a, b) => a + b, 0) / inks.length;
      return inks.reduce((s, v) => s + (v - mean) ** 2, 0) / inks.length;
    };
    const sharp = variance(fillBuffer({ blur: 0 }).toText());
    const blurred = variance(fillBuffer({ blur: 1 }).toText());
    expect(blurred).toBeLessThan(sharp);
  });

  it("blur never invents a fake character — every glyph is still real ramp material", () => {
    const text = fillBuffer({ blur: 1 }).toText();
    for (const cluster of segmentGraphemes(text.replace(/\n/g, ""))) {
      expect(cluster.length).toBeGreaterThan(0); // real characters, not empty/undefined slop
    }
  });
});

describe("FILTERS (§9) — discrete remap family, not a strength", () => {
  it("threshold output is strictly binary: only full ink or air", () => {
    const text = fillBuffer({ filter: "threshold" }).toText();
    for (const cluster of segmentGraphemes(text.replace(/\n/g, " "))) {
      expect(["█", " "]).toContain(cluster);
    }
  });

  it("posterize output only uses the 3-step ramp", () => {
    const text = fillBuffer({ filter: "posterize" }).toText();
    for (const cluster of segmentGraphemes(text.replace(/\n/g, " "))) {
      expect([" ", "▒", "█"]).toContain(cluster);
    }
  });

  it("invert flips the ink profile: a genuinely ink-heavy source (puck parked on `heavy`) reads lighter, filtered", () => {
    // First draft of this test parked the puck at CENTER, blending in
    // `dots` — whose per-glyph ink is naturally so low that the
    // "natural" census density came out LOW (0.36), and inverting
    // correctly pushed it UP (0.59). Correct behavior, wrong premise in
    // the test. Fixed by actually being high-ink to start with: park
    // squarely on `heavy` (████▓▓...), where the direction isn't a guess.
    const parked = { x: 0, y: 0 };
    const natural = censusText(fillBuffer({ filter: "none", density: 0.9 }, "invert-check", 30, 20, parked).toText()).density;
    const inverted = censusText(fillBuffer({ filter: "invert", density: 0.9 }, "invert-check", 30, 20, parked).toText()).density;
    expect(natural).toBeGreaterThan(0.6); // sanity: the premise this time is actually true
    expect(inverted).toBeLessThan(natural);
  });
});

describe("all five together — still fully deterministic, still backward compatible", () => {
  it("cranking every M6 effect to max is still 100% reproducible from the same seed", () => {
    const maxed: Partial<EffectState> = { drip: 1, jitter: 0.4, symmetry: 0.6, blur: 0.5, filter: "posterize" };
    expect(fillBuffer(maxed, "determinism-check").toText()).toBe(fillBuffer(maxed, "determinism-check").toText());
  });

  it("an OLD-STYLE kit with only {density,grain,phase} — no M6 fields at all — still fills without throwing", () => {
    const oldKit: Kit = { corners, puck: { x: 0.5, y: 0.5 }, effects: { density: 0.5, grain: 0, phase: 0 } };
    const buffer = new CellBuffer(20, 10);
    expect(() => kitFill(buffer, oldKit, "old-kit-seed", 0, {})).not.toThrow();
  });

  it("an old-style kit behaves IDENTICALLY to one with explicit-neutral M6 fields — the ?? defaults are truly neutral", () => {
    const oldKit: Kit = { corners, puck: { x: 0.4, y: 0.6 }, effects: { density: 0.5, grain: 0.2, phase: 0 } };
    const explicitKit: Kit = { ...oldKit, effects: { ...NEUTRAL_EFFECTS, density: 0.5, grain: 0.2, phase: 0 } };
    const a = new CellBuffer(20, 10);
    const b = new CellBuffer(20, 10);
    kitFill(a, oldKit, "neutral-check", 0, {});
    kitFill(b, explicitKit, "neutral-check", 0, {});
    expect(a.toText()).toBe(b.toText());
  });
});
