// Mixer property tests (§10): the puck LEANS, corners bleed, and every
// bit of it must be reproducible from a seed — including mid-shimmer.

import { describe, expect, it } from "vitest";
import { bilinearWeights, mixVectors, applyEffects, cellDraw, kitFill, NEUTRAL_EFFECTS } from "../src/mixer.js";
import type { Kit, Corners } from "../src/mixer.js";
import { encodeKitUrl, decodeKitUrl } from "../src/kit.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import { CellBuffer } from "../src/buffer.js";
import { createDocument, appendOp, replay } from "../src/log.js";

const heavy = buildDuctus(censusText("████▓▓██████▓▓████\n██▓▓████▓▓████████"), { name: "heavy" });
const dots = buildDuctus(censusText("· . · . ˚ . · ˚ ·\n. ˚ · . · . ˚ · ."), { name: "dots" });
const swirl = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n~*~*~*~*~"), { name: "swirl" });
const wave = buildDuctus(censusText("∿∿≋≋∿∿≋≋\n≋∿≋∿≋∿≋∿"), { name: "wave" });

const corners: Corners = [heavy, dots, swirl, wave];

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
      expect(cellDraw(k, "seedseed", i)).toEqual(cellDraw(k, "seedseed", i));
    }
  });

  it("shimmer: mid-pad cells draw from MULTIPLE corners, not one winner", () => {
    const k = kit(0.5, 0.5);
    const sources = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const { corner } = cellDraw(k, "seedseed", i);
      if (corner) sources.add(corner.id);
    }
    expect(sources.size).toBeGreaterThanOrEqual(3); // the crossfade is a conversation
  });

  it("corner-parked puck draws overwhelmingly from that corner", () => {
    const k = kit(0, 0); // parked on `heavy`
    let heavyCount = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const { corner } = cellDraw(k, "seedseed", i);
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
      expect(cellDraw(k, "s", i, { frame: 0 })).toEqual(cellDraw(k, "s", i, { frame: 999 }));
    }
  });

  it("phase > 0: SOME cells move between frames, most hold still at low phase", () => {
    const k = kit(0.4, 0.4, { ...NEUTRAL_EFFECTS, phase: 0.3 });
    let moved = 0;
    const N = 500;
    for (let i = 0; i < N; i++) {
      const a = cellDraw(k, "s", i, { frame: 0 });
      const b = cellDraw(k, "s", i, { frame: 7 });
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
