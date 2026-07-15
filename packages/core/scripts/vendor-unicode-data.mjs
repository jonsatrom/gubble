#!/usr/bin/env node
// This script runs ONCE, by hand, when we deliberately decide to move to a
// new Unicode version — never in CI, never on install, never live. Its
// entire job is to turn two raw UCD source files into a small, frozen,
// committed TypeScript module. That module — not this script, not the
// live unicode.org endpoint — is what `measure: "eaw-16.0/g1"` (§4.1)
// actually points at. Directive 1's addendum ("the seed and the ruler
// freeze together") is a promise about the OUTPUT of this script, not
// about this script running correctly forever.
//
// Source files (committed alongside their generated output, for
// provenance — see src/data/vendor/README.md):
//   EastAsianWidth.txt   — which codepoints are East_Asian_Width W or F
//                           (the ones that get 2 cells per §5.1)
//   emoji-data.txt        — which codepoints have Emoji_Presentation=Yes
//                           (default-render-as-emoji, also 2 cells)
//
// Usage: node scripts/vendor-unicode-data.mjs <path-to-ucd-dir> <output-dir>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [, , ucdDir, outDir] = process.argv;
if (!ucdDir || !outDir) {
  console.error("usage: vendor-unicode-data.mjs <ucd-dir> <output-dir>");
  process.exit(1);
}

const UNICODE_VERSION = "16.0.0";
const GENERATION = "g1"; // bump this if the PARSING logic changes without a new Unicode version
// Matches the `measure` field format from GUBBLE-SPEC.md §4.1's example verbatim.
const MEASURE_ID = "eaw-16.0/g1";

/** Parses a UCD-style range line: "XXXX" or "XXXX..YYYY" before the first ';'. */
function parseCodepointRange(field) {
  const trimmed = field.trim();
  if (trimmed.includes("..")) {
    const [start, end] = trimmed.split("..");
    return [parseInt(start, 16), parseInt(end, 16)];
  }
  const cp = parseInt(trimmed, 16);
  return [cp, cp];
}

/** Merges adjacent/overlapping [start,end] ranges after sorting, to keep the table small. */
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function extractRanges(text, matchesLine) {
  const ranges = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0].trim(); // strip trailing comment
    if (!line) continue;
    const fields = line.split(";").map((f) => f.trim());
    if (fields.length < 2) continue;
    const [cpField, propField] = fields;
    if (matchesLine(propField)) {
      ranges.push(parseCodepointRange(cpField));
    }
  }
  return mergeRanges(ranges);
}

// --- East Asian Width: W (Wide) and F (Fullwidth) → 2 cells (§5.1) ---
const eawText = readFileSync(join(ucdDir, "EastAsianWidth.txt"), "utf8");
const wideRanges = extractRanges(eawText, (prop) => prop === "W" || prop === "F");

// --- Emoji_Presentation=Yes → default-renders-as-emoji → 2 cells (§5.1) ---
const emojiText = readFileSync(join(ucdDir, "emoji-data.txt"), "utf8");
const emojiPresentationRanges = extractRanges(emojiText, (prop) => prop === "Emoji_Presentation");

mkdirSync(outDir, { recursive: true });

const header = `// GENERATED FILE — do not hand-edit. Regenerate with
// scripts/vendor-unicode-data.mjs if you're deliberately moving to a new
// Unicode version (that's a "measure" bump in every future document
// header, §4.1 — not a decision to make lightly or silently).
//
// Source: Unicode ${UNICODE_VERSION} UCD, EastAsianWidth.txt + emoji-data.txt
// (see ../vendor/README.md for provenance + license).
// measure id: ${MEASURE_ID}
`;

const wideOut = `${header}
/** East_Asian_Width W|F ranges — these codepoints occupy 2 cells (§5.1). */
export const WIDE_RANGES: readonly (readonly [number, number])[] = ${JSON.stringify(wideRanges)};
`;

const emojiOut = `${header}
/** Emoji_Presentation=Yes ranges — default-render-as-emoji, 2 cells (§5.1). */
export const EMOJI_PRESENTATION_RANGES: readonly (readonly [number, number])[] = ${JSON.stringify(emojiPresentationRanges)};
`;

writeFileSync(join(outDir, "wide-ranges.generated.ts"), wideOut);
writeFileSync(join(outDir, "emoji-presentation-ranges.generated.ts"), emojiOut);

console.log(`wide ranges: ${wideRanges.length} (from raw entries)`);
console.log(`emoji presentation ranges: ${emojiPresentationRanges.length}`);
console.log(`wrote ${outDir}/wide-ranges.generated.ts`);
console.log(`wrote ${outDir}/emoji-presentation-ranges.generated.ts`);
