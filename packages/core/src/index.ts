// @gubble/core — the barrel. If it's exported here, it's part of the
// contract other packages (and eventually other people's code) can lean
// on. Keep this list honest: re-export what's actually load-bearing, not
// every internal helper.

export { fnv1a, deriveSeed, deriveUnit } from "./hash.js";
export { splitmix32, sfc32, createRng, RNG_ID } from "./prng.js";
export { mintDocSeed } from "./seed.js";
export {
  MEASURE_ID,
  isWide,
  isDefaultEmojiPresentation,
  segmentGraphemes,
  clusterWidth,
  measureText,
} from "./width.js";
export type { MeasuredCluster, MeasureOptions } from "./width.js";

// Not here yet, and deliberately not faked in the meantime:
//   - log.ts (§4 event log + replay) — the actual "state = replay(ops)"
//     machinery, M1's other half.
//   - census.ts (§7.3) — M0's actual deliverable, imported unchanged by
//     both the CLI and, later, the app's in-app distill panel (§7.5).
