// Ink weight: how much visual "ink" a glyph deposits in its cell, 0..1.
// This is the shared vocabulary underneath half the spec — the census's
// density stat (§7.3), the specimen's max→min sweep (§7.4), the blur
// effect's ramp-diffusion (§9), and eventually image luminance mapping
// all speak in ink weight. One table, one heuristic chain, used
// everywhere; parallel implementations of "how dark is this character"
// would drift, and drift here means the same aesthetic censusing to
// different densities in different code paths. No.
//
// These numbers are CALIBRATED BY EYEBALL, not derived — someone looked
// at the glyphs in a monospace font and assigned weights. That's fine.
// They're frozen and versioned by living in this file under version
// control; arguing with them is legitimate and encouraged (that's what
// the calibration fixtures in /calibration are for), but argue via
// commit, not via a second table somewhere else.

import { clusterWidth, isCombining } from "./width.js";

/**
 * The canonical ink-weight ramp, §7.3 — heaviest to lightest. The blur
 * effect and image-luminance census both remap through this exact
 * sequence. The trailing space is load-bearing: "no ink" is a legitimate
 * rung of the ladder, not an absence of one.
 */
export const INK_RAMP = ["█", "▓", "▒", "░", "·", "˚", " "] as const;

// Glyphs someone has actually looked at. Everything else falls through
// to the heuristic chain below.
const KNOWN_WEIGHTS: Record<string, number> = {
  // block elements / shades
  "█": 1.0, "▓": 0.8, "▒": 0.55, "░": 0.3,
  "▁": 0.13, "▂": 0.25, "▃": 0.38, "▄": 0.5, "▅": 0.63, "▆": 0.75, "▇": 0.88,
  "▏": 0.13, "▎": 0.25, "▍": 0.38, "▌": 0.5, "▋": 0.63, "▊": 0.75, "▉": 0.88,
  "▖": 0.25, "▗": 0.25, "▘": 0.25, "▝": 0.25,
  "▚": 0.5, "▞": 0.5, "▙": 0.75, "▛": 0.75, "▜": 0.75, "▟": 0.75,
  "■": 0.9, "□": 0.35, "▪": 0.4, "▫": 0.2,
  // dots, specks, hesitations
  "·": 0.1, "˚": 0.08, ".": 0.08, ",": 0.1, "'": 0.06, "`": 0.06,
  ":": 0.14, ";": 0.16, "∴": 0.18, "∵": 0.18, "⋆": 0.2,
  // rules and box-drawing
  "─": 0.18, "━": 0.3, "┄": 0.14, "╍": 0.22, "═": 0.32, "│": 0.18, "┃": 0.3,
  "╬": 0.5, "┼": 0.35, "╭": 0.2, "╮": 0.2, "╰": 0.2, "╯": 0.2,
  // wave / swirl / web1 material
  "~": 0.18, "-": 0.12, "_": 0.15, "=": 0.28, "*": 0.28,
  "°": 0.15, "º": 0.15, "¤": 0.32, "ø": 0.42, "¸": 0.08,
  "∿": 0.25, "≋": 0.4, "^": 0.12,
  // ornamental
  "✿": 0.5, "♡": 0.4, "☆": 0.38, "★": 0.6, "✭": 0.48, "✦": 0.35,
  "◢": 0.6, "◣": 0.6, "◤": 0.6, "◥": 0.6,
};

const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;

/**
 * Ink weight of one grapheme cluster, 0..1. Chain: known table → braille
 * dot-count (the offset from U+2800 is literally a bitfield of which dots
 * are raised, so the ink weight of braille is COMPUTED, not guessed —
 * the one corner of this file that's derivation rather than eyeball) →
 * wide/emoji heavy → ASCII-ish classes → default. Combining marks each
 * add a little ink on top: zalgo is heavy because it literally is.
 */
export function inkWeight(cluster: string): number {
  if (cluster.trim() === "") return 0;

  const codepoints = Array.from(cluster, (ch) => ch.codePointAt(0)!);
  const base = codepoints[0]!;
  const baseChar = String.fromCodePoint(base);
  const marks = codepoints.filter((cp) => isCombining(cp)).length;

  let weight: number;
  const known = KNOWN_WEIGHTS[baseChar];
  if (known !== undefined) {
    weight = known;
  } else if (base >= BRAILLE_START && base <= BRAILLE_END) {
    // Count raised dots via the bitfield. ⣿ (all 8) → 0.9, ⠁ (one) → ~0.11.
    let bits = base - BRAILLE_START;
    let dots = 0;
    while (bits > 0) {
      dots += bits & 1;
      bits >>= 1;
    }
    weight = (dots / 8) * 0.9;
  } else if (clusterWidth(cluster) === 2) {
    weight = 0.85; // CJK / emoji read heavy in a text field
  } else if (/[A-Za-z0-9]/.test(baseChar)) {
    weight = 0.5;
  } else if (base < 0x80) {
    weight = 0.3; // remaining ASCII punctuation
  } else {
    weight = 0.45; // unknown non-ASCII: assume middling ink until someone eyeballs it
  }

  return Math.min(1, weight + marks * 0.05);
}

/** Map an ink weight back to the nearest ramp glyph — blur/filters (§9) and image luminance (§7.3) both land here eventually. */
export function nearestRampGlyph(weight: number): string {
  // Ramp weights, precomputed through the same inkWeight above so the
  // round-trip is internally consistent by construction.
  let best = INK_RAMP[INK_RAMP.length - 1]!;
  let bestDist = Infinity;
  for (const glyph of INK_RAMP) {
    const dist = Math.abs(inkWeight(glyph) - weight);
    if (dist < bestDist) {
      bestDist = dist;
      best = glyph;
    }
  }
  return best;
}
