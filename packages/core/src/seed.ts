// This file contains exactly one non-deterministic function call in the
// entire gubble-core package: mintDocSeed()'s crypto.getRandomValues().
// That's not an oversight — it's the sanctioned exception the Directive 1
// addendum describes (GUBBLE-SPEC.md §2): a document's docSeed is minted
// ONCE, genuinely randomly, at creation. Everything downstream of that
// single roll — every op, every cell, every flutter frame — is dice, not
// chaos: reproducible, replayable, forkable. The randomness doesn't
// disappear at v1; it gets moved to one auditable spot and never
// duplicated. If you're ever tempted to add a second call to a real
// entropy source somewhere else in gubble-core, that's Directive 1 asking
// you a question you should answer in a comment, not in silence.

// We ambient-declare the one Web Crypto method we need instead of pulling
// in the "dom" lib. gubble-core makes zero DOM assumptions (§3) — it runs
// in browsers, Node 20+, and Web Workers alike, and getRandomValues is the
// one part of the Web Crypto API all three environments actually share.
declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

/**
 * Mint a fresh 128-bit hex docSeed — the root of all randomness for one
 * document (§4.1). Call this exactly once, at document creation. Never
 * call it again for the same document; every subsequent seed in that
 * document's life is *derived* from this one via deriveSeed() (hash.ts),
 * not minted fresh.
 */
export function mintDocSeed(): string {
  const bytes = new Uint8Array(16); // 128 bits, per §4.1's docSeed spec
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
