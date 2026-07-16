// These are the property tests M1 promises in GUBBLE-SPEC.md §17: "replay
// determinism" and part of the "emoji/ZWJ width table" trio (the width
// half waits on width.ts). Directive 1 is "determinism or death" — so
// these tests aren't bookkeeping, they're the thing that would catch it
// if someone's well-meaning refactor quietly broke every existing share
// URL on earth.

import { describe, expect, it } from "vitest";
import { fnv1a, deriveSeed, deriveUnit } from "../src/hash.js";
import { createRng, splitmix32, sfc32, RNG_ID } from "../src/prng.js";
import { mintDocSeed } from "../src/seed.js";

describe("fnv1a", () => {
  it("is deterministic: same input, same output, every time", () => {
    expect(fnv1a("gubble gubble")).toBe(fnv1a("gubble gubble"));
  });

  it("is sensitive: different input, (almost certainly) different output", () => {
    expect(fnv1a("gubble")).not.toBe(fnv1a("Gubble"));
  });

  it("always returns an unsigned 32-bit integer", () => {
    const h = fnv1a("kipple kipple kipple");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("deriveSeed / deriveUnit — the random-ACCESS primitives", () => {
  const docSeed = "7f3a9c00112233445566778899aabbcc";

  it("op seeds are stable across repeated derivation (same doc, same op index)", () => {
    expect(deriveSeed(docSeed, 42)).toBe(deriveSeed(docSeed, 42));
  });

  it("op seeds differ across op index (Directive 1 would be pointless otherwise)", () => {
    expect(deriveSeed(docSeed, 42)).not.toBe(deriveSeed(docSeed, 43));
  });

  it("a single cell is computable without its neighbors — the whole point of hash-based access", () => {
    const opSeed = deriveSeed(docSeed, 7);
    // Compute cell 500 directly...
    const direct = deriveUnit(opSeed, 500);
    // ...and compute it again after "visiting" a bunch of other cells first.
    // If this ever drifts, per-cell random access silently breaks and
    // "re-render just this subregion" (§4.3) stops being true.
    for (let i = 0; i < 499; i++) deriveUnit(opSeed, i);
    const afterNeighbors = deriveUnit(opSeed, 500);
    expect(afterNeighbors).toBe(direct);
  });

  it("deriveUnit lands in [0, 1)", () => {
    const opSeed = deriveSeed(docSeed, 1);
    for (let i = 0; i < 200; i++) {
      const v = deriveUnit(opSeed, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("frame index extends the key for flutter (§9 PHASE) without colliding with the frameless case", () => {
    const opSeed = deriveSeed(docSeed, 3);
    const noFrame = deriveUnit(opSeed, 10);
    const frame0 = deriveUnit(opSeed, 10, 0);
    // These are different keys (different arg count → different joined
    // string), so there's no guarantee they collide — and they shouldn't:
    // "at rest" and "mid-flutter frame 0" ought to be distinguishable.
    expect(frame0).not.toBe(noFrame);
  });

  it("REGRESSION (the sfc32/2 bug): sequential cell indices must not correlate", () => {
    // Raw FNV-1a gave adjacent cells nearly identical rolls (Δ≈0.004),
    // so fills came out row-banded — dead rows, flooded rows. The fmix32
    // finalizer fixed it. This test pins the fix two ways:
    const opSeed = deriveSeed(docSeed, 7);

    // 1. Adjacent draws differ substantially on average (raw FNV-1a
    //    averaged ~0.004 here; anything decorrelated averages ~1/3).
    let deltaSum = 0;
    const N = 600;
    for (let i = 0; i < N - 1; i++) {
      deltaSum += Math.abs(deriveUnit(opSeed, i + 1) - deriveUnit(opSeed, i));
    }
    expect(deltaSum / (N - 1)).toBeGreaterThan(0.2);

    // 2. No 60-cell "row" of a 0.21-density gate comes out empty or
    //    flooded (binomial mean ≈ 12.6; 0 or 60 means banding is back).
    for (let row = 0; row < 10; row++) {
      let inked = 0;
      for (let col = 0; col < 60; col++) {
        if (deriveUnit(opSeed, row * 60 + col) < 0.21) inked++;
      }
      expect(inked).toBeGreaterThan(2);
      expect(inked).toBeLessThan(30);
    }
  });
});

describe("splitmix32 + sfc32 — the ORDERED-draw engine", () => {
  it("splitmix32 is a deterministic stream: same seed, same sequence", () => {
    const a = splitmix32(12345);
    const b = splitmix32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("sfc32 produces floats in [0, 1)", () => {
    const rng = sfc32(1, 2, 3, 4);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("sfc32 is not degenerate: doesn't just repeat the same value", () => {
    const rng = sfc32(1, 2, 3, 4);
    const draws = new Set([rng(), rng(), rng(), rng(), rng()]);
    expect(draws.size).toBeGreaterThan(1);
  });
});

describe("createRng — the full seed-string-to-generator chain", () => {
  it("is the whole point: same seed, same generator, same sequence, forever", () => {
    const rngA = createRng("d41d8cd9");
    const rngB = createRng("d41d8cd9");
    const seqA = Array.from({ length: 10 }, () => rngA());
    const seqB = Array.from({ length: 10 }, () => rngB());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const rngA = createRng("d41d8cd9");
    const rngB = createRng("00000000");
    expect(rngA()).not.toBe(rngB());
  });

  it("RNG_ID matches what the header schema (§4.1) expects to record", () => {
    expect(RNG_ID).toBe("sfc32/2");
  });
});

describe("mintDocSeed — the ONE sanctioned non-determinism in gubble-core", () => {
  it("produces a 128-bit hex string (32 hex chars)", () => {
    const seed = mintDocSeed();
    expect(seed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("varies across calls — this is the single spot in the codebase allowed to do that", () => {
    const seeds = new Set(Array.from({ length: 20 }, () => mintDocSeed()));
    expect(seeds.size).toBe(20);
  });
});
