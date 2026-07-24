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
  isCombining,
  stackDepthOf,
  segmentGraphemes,
  clusterWidth,
  measureText,
} from "./width.js";
export type { MeasuredCluster, MeasureOptions } from "./width.js";
export { INK_RAMP, inkWeight, nearestRampGlyph } from "./ramp.js";
export { censusText, corpusToPhrases } from "./census.js";
export type { CensusStats, RunLengthStats, HazardFlags } from "./census.js";
export {
  buildDuctus,
  ductusId,
  ductusByteSize,
  proposeGrain,
  hexToAnsi256,
  DUCTUS_BYTE_BUDGET,
} from "./ductus.js";
export type { Ductus, GrainAffinity, BuildDuctusOptions } from "./ductus.js";
export { renderSpecimen } from "./specimen.js";
export type { SpecimenOptions } from "./specimen.js";
export {
  encodePayload,
  decodePayload,
  encodeDuctusUrl,
  decodeDuctusUrl,
  encodeDocUrl,
  decodeDocUrl,
} from "./url.js";
export type { DecodedDocUrl } from "./url.js";
export { CellBuffer } from "./buffer.js";
export type { Cell, Provenance } from "./buffer.js";
export {
  createDocument,
  appendOp,
  truncate,
  forkDocument,
  replay,
  replayFull,
  fenceKitFill,
  boostKit,
} from "./log.js";
export type {
  GubbleDoc,
  DocHeader,
  Op,
  OpKind,
  GridDefinition,
  SelectionRange,
  ApplyVerb,
  SectionState,
  ReplayResult,
  GestureSample,
} from "./log.js";
export { mistranscode, redactGlyph, invertGlyph, posterizeGlyph, thresholdGlyph } from "./corrupt.js";
export { weightedPick, applyStack, ZALGO_MARKS, mirrorGlyph, glyphsMirror, MIRROR_PAIRS } from "./draw.js";
export {
  bilinearWeights,
  mixVectors,
  applyEffects,
  cellDraw,
  kitFill,
  NEUTRAL_EFFECTS,
} from "./mixer.js";
export type { Kit, Corners, EffectState, MixedVector, FilterMode } from "./mixer.js";
export { encodeKitUrl, decodeKitUrl } from "./kit.js";
export { crc32 } from "./crc32.js";
export { encodeGbbl, decodeGbbl } from "./gbbl.js";

// Not here yet, and deliberately not faked in the meantime:
//   - image census (§7.3 luminance + k-means chroma) — v1 job, next
//     pass. The CLI warns when it finds images rather than skipping
//     them silently.
//   - mixer math / kits (M2), effects (M2), selection scopes (M4),
//     .gbbl packaging + doc-as-URL (M5).
