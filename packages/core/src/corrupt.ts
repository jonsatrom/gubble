// The applyOnce corruption verbs (§11): deterministic transforms on a
// selection. The house rule, verbatim from the spec: REAL ENCODING
// MATH, NOT VIBES. Mojibake here is not a lookup table of "glitchy
// looking" characters — it is the actual arithmetic of reading UTF-8
// bytes as Windows-1252, the same wrong turn a million real documents
// took on their way through real pipelines. ASCII survives it
// untouched (bytes < 0x80 mean the same thing in both worlds), which
// is why real mojibake has that signature texture: legible words
// studded with Ã© â€™ eruptions. We inherit that texture by inheriting
// the math.

import { inkWeight } from "./ramp.js";
import { deriveUnit } from "./hash.js";

/** UTF-8 encode one string — the honest byte layer under every cluster. */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000)
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return bytes;
}

// Windows-1252's 0x80–0x9F row — the printable characters Microsoft
// put where Latin-1 keeps invisible controls. This table is WHY
// mojibake says â€™ instead of â?TM. Five slots are genuinely
// undefined in cp1252; they render here as U+FFFD �, the replacement
// character, mojibake's cursor-shaped tombstone.
const CP1252_80_9F = [
  "€", "�", "‚", "ƒ", "„", "…", "†", "‡", "ˆ", "‰", "Š", "‹", "Œ", "�", "Ž", "�",
  "�", "'", "'", "“", "”", "•", "–", "—", "˜", "™", "š", "›", "œ", "�", "ž", "Ÿ",
];

/**
 * Read a string's UTF-8 bytes as if they were Windows-1252 — the
 * classic mojibake misread, done with the actual math. "é" → "Ã©",
 * "█" → "â–ˆ", plain ASCII → itself. Note the output is LONGER than
 * the input (multibyte sequences explode into one char per byte):
 * corruption expands, exactly like it does in the wild.
 */
export function mistranscode(text: string): string {
  let out = "";
  for (const byte of utf8Bytes(text)) {
    if (byte < 0x80) out += String.fromCharCode(byte);
    else if (byte < 0xa0) out += CP1252_80_9F[byte - 0x80]!;
    else out += String.fromCharCode(byte); // 0xA0–0xFF: Latin-1 proper, codepoint = byte
  }
  return out;
}

/**
 * Redaction glyph for one cell (§11 "chunky ██▓ block-out"): mostly
 * solid, occasionally ▓, seeded — a marker stroke, not a paint bucket.
 */
export function redactGlyph(seed: string, cellIndex: number): string {
  return deriveUnit(seed, cellIndex, "redact") < 0.82 ? "█" : "▓";
}

/** Ink-weight inversion via the ramp: dark becomes light, air becomes wall. */
export function invertGlyph(glyph: string): string {
  return rampFor(1 - inkWeight(glyph));
}

/** Posterize: collapse the ink continuum to a 3-step ramp (§9 filters). */
export function posterizeGlyph(glyph: string): string {
  const w = inkWeight(glyph);
  return w < 0.2 ? " " : w < 0.6 ? "▒" : "█";
}

/** Threshold: the hardest filter in the family — binary, no ramp survives it (§9 filters). */
export function thresholdGlyph(glyph: string): string {
  return inkWeight(glyph) > 0.5 ? "█" : " ";
}

function rampFor(weight: number): string {
  // Local 5-step ramp for inversion — coarser than nearestRampGlyph on
  // purpose: inversion is a statement, not a restoration.
  return weight < 0.12 ? " " : weight < 0.35 ? "░" : weight < 0.6 ? "▒" : weight < 0.85 ? "▓" : "█";
}
