import { fnv1a } from "./hash.js";

// sfc32, ratified in GUBBLE-SPEC.md §4.3. This is the ORDERED-draw engine —
// the thing you reach for when draw N genuinely depends on having made
// draw N-1 (splice-point placement in the cut-up engine, shuffles). It is
// deliberately NOT what per-cell glyph selection uses — that's hash.ts's
// deriveUnit(), which is random-ACCESS on purpose. Two different shapes of
// randomness for two different jobs; see the §4.3 note on why auditioning
// this for "feel" is a category error.
//
// sfc32 needs four 32-bit words of internal state. A document only carries
// one seed. splitmix32 is the bridge: a tiny, fast, well-mixed generator
// used ONCE to expand a single seed into sfc32's four starting words. This
// is the "or splitmix64→sfc32" the spec mentions in §4.3 — we use the
// 32-bit sibling since everything else here is already 32-bit (matches
// FNV-1a's word size, keeps the whole determinism chain in one register
// width, no 64-bit BigInt tax on a hot path).
//
// The RNG identity gets recorded in every document header as `rng` (§4.1):
// a future, better generator is an ADDITION new documents opt into, never
// a silent rewrite of what a year-old share-URL means. See the Directive 1
// addendum in §2 — the dice are named so they can be forked without
// breaking anyone's replay.
export const RNG_ID = "sfc32/1" as const;

/**
 * Expand a single 32-bit seed into a stream of well-mixed 32-bit words.
 * Used once per RNG instantiation, to derive sfc32's four state words —
 * not intended as a general-purpose generator in its own right.
 */
export function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0bb15);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z;
  };
}

/**
 * sfc32 ("small fast counter"), seeded with four 32-bit state words.
 * Returns a generator function producing floats in [0, 1). Public-domain
 * algorithm (via Chris Doty-Humphrey's PractRand-tested small PRNGs,
 * popularized by bryc's PRNG collection) — small enough to read in one
 * sitting, which matters for a tool whose whole premise is that the dice
 * are meant to be inspectable, not a black box.
 */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  let sa = a >>> 0;
  let sb = b >>> 0;
  let sc = c >>> 0;
  let sd = d >>> 0;
  return function next(): number {
    sa |= 0;
    sb |= 0;
    sc |= 0;
    sd |= 0;
    const t = (((sa + sb) | 0) + sd) | 0;
    sd = (sd + 1) | 0;
    sa = sb ^ (sb >>> 9);
    sb = (sc + (sc << 3)) | 0;
    sc = (sc << 21) | (sc >>> 11);
    sc = (sc + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * The one function most callers actually want: turn a seed string
 * (typically an op's `deriveSeed(docSeed, opIndex)` result, §4.3 — but any
 * string works) into a ready-to-call sfc32 generator, `rng: "sfc32/1"`-
 * flavored. The seed is hashed once to a uint32 via FNV-1a (hash.ts — the
 * same hash everything else in gubble uses, so there's exactly one
 * string-to-uint32 pathway in the whole codebase, not two that could
 * quietly drift apart), then expanded via splitmix32 into sfc32's four
 * state words.
 */
export function createRng(seed: string): () => number {
  const expand = splitmix32(fnv1a(seed));
  return sfc32(expand(), expand(), expand(), expand());
}
