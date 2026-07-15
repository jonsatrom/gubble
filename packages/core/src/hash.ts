// FNV-1a, 32-bit. Ratified in GUBBLE-SPEC.md §4.3 (and re-ratified, at
// length, in an actual interview — see §19 RATIFIED). Chosen for being
// boring: ~10 lines, zero dependencies, no supply chain to audit, honors
// "framework-free" the same way hand-rolling cell-width math does instead
// of importing someone's abandoned string-width package.
//
// Load-bearing reminder from the ruling that picked this: the hash is
// uniform-draw PLUMBING, not the aesthetic layer. Don't go auditioning
// hash functions for "feel" later — that's connoisseurship theater. If
// you want gubble's noise to have a texture (white vs blue vs spatially
// coherent), that's `noiseCharacter`, one floor up, reserved for v2/v3.
// This function's only job is: same bytes in, same uint32 out, forever,
// on every platform gubble runs on (browser / Node / Web Worker).

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Raw FNV-1a over a string's UTF-16 code units. Returns an unsigned 32-bit int. */
export function fnv1a(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

// The spec writes derivation as hash(docSeed ‖ i) and hash(opSeed ‖
// cellIndex ‖ frameIndex) — using the actual DOUBLE VERTICAL LINE glyph
// (U+2016) as its notation for "concatenated, deliberately, as distinct
// fields." We use the same glyph as the real field separator here, not
// just in the prose, so the code and the spec are citing each other.
const FIELD_SEP = "‖";

/**
 * Combine a seed with any number of key parts (op index, cell index, frame
 * index...) into an 8-hex-char derived seed. This is what ends up in an
 * op's `"seed"` field (§4.1) — readable, greppable, and stable: the same
 * inputs always produce the same seed, which is the entire point of a tool
 * whose Prime Directive is "determinism or death."
 */
export function deriveSeed(seed: string, ...keys: (string | number)[]): string {
  const joined = [seed, ...keys].join(FIELD_SEP);
  return fnv1a(joined).toString(16).padStart(8, "0");
}

/**
 * Combine a seed with key parts into a float in [0, 1) — the direct,
 * random-ACCESS (not random-sequence) primitive that per-cell glyph draws,
 * per-cell noise, and PHASE's per-cell-per-frame flutter all sit on top of.
 * Any single cell is independently computable without replaying its
 * neighbors, which is what makes "re-render just this subregion" possible
 * at all.
 */
export function deriveUnit(seed: string, ...keys: (string | number)[]): number {
  const joined = [seed, ...keys].join(FIELD_SEP);
  return fnv1a(joined) / 0x1_0000_0000; // 2^32 — normalize uint32 to [0, 1)
}
