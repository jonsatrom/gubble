// The ductus (§7.2): the compiled signature of an aesthetic — what
// remains when meaning is stripped. Glyph palette + behavior vector +
// color + affinities, small enough to travel inside a URL. This file
// owns the shape, the content-derived id, and the size discipline.

import { fnv1a } from "./hash.js";
import type { CensusStats } from "./census.js";

export type GrainAffinity = "poster" | "texture" | "both";

export interface Ductus {
  id: string;
  name: string;
  version: string;
  palette: {
    glyphs: string[];
    weights: number[];
    phrases: string[];
  };
  vector: {
    density: number;
    whitespace: number;
    symmetry: number;
    runLength: { mean: number; var: number };
    drip: number;
    jitter: number;
    emojiRatio: number;
    stackDepth: number;
    grainAffinity: GrainAffinity;
  };
  color: { swatches: string[]; ansiSafe: number[] };
  flow: { fontHints: string[] };
  meta: {
    kin: string[];
    lineage: string | null;
    author: string | null;
    hazard: boolean;
  };
}

/**
 * The URL size discipline (§7.2): a ductus must stay under ~2KB before
 * compression, measured on its COMPACT serialization — that constraint
 * is the entire platform-independence guarantee. Overflow warns, never
 * auto-truncates: the compiler proposes, the author disposes.
 */
export const DUCTUS_BYTE_BUDGET = 2048;

export function ductusByteSize(ductus: Ductus): number {
  // TextEncoder-free byte count (core stays lib-lean): UTF-8 length of
  // the compact JSON. Blob/TextEncoder exist everywhere we run, but a
  // hand-count is 4 lines and has no ambient-type ceremony.
  const json = JSON.stringify(ductus);
  let bytes = 0;
  for (const ch of json) {
    const cp = ch.codePointAt(0)!;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** JSON.stringify with recursively sorted keys — canonical form for hashing. */
function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Content-derived id: hash of the canonical palette + vector. The same
 * midden, recompiled unchanged, produces the same id — "determinism or
 * death" applied to identity itself. The id only moves when the material
 * moves, which makes version history the aesthetic's biography for real
 * (§7.1), not a log of arbitrary re-mints.
 *
 * [PLACED DEFAULT — §19]: names/meta deliberately excluded from the hash,
 * so renaming an aesthetic doesn't re-identify it. Veto-able.
 */
export function ductusId(palette: Ductus["palette"], vector: Ductus["vector"]): string {
  const hash = fnv1a(canonicalStringify({ palette, vector }));
  return `aes_${hash.toString(36).padStart(7, "0")}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface BuildDuctusOptions {
  name: string;
  version?: string;
  phrases?: string[];
  /** Contributor-set; the compiler only PROPOSES grain (§7.2). */
  grainAffinity?: GrainAffinity;
  swatches?: string[];
  fontHints?: string[];
  kin?: string[];
  lineage?: string | null;
  author?: string | null;
  hazard?: boolean;
  /** Palette cap — top-N clusters by frequency. Placed default: 24. */
  maxGlyphs?: number;
}

/**
 * The compiler's grain PROPOSAL — dense material with long sideways runs
 * reads as texture (glyph as grain); sparse material with distinct marks
 * reads as poster (glyph as figure). The contributor's manifest setting
 * always wins; this only fills silence (§7.2: "agency at both ends").
 */
export function proposeGrain(stats: CensusStats): GrainAffinity {
  const texturey = stats.density > 0.5 || stats.runLength.mean > 4;
  const postery = stats.density < 0.3 && stats.runLength.mean < 2.5;
  if (texturey && !postery) return "texture";
  if (postery && !texturey) return "poster";
  return "both";
}

/** Nearest ANSI-256 index for a #rrggbb hex swatch — the 6×6×6 cube + gray ramp. */
export function hexToAnsi256(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 7; // unparseable → default light gray, not a crash
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 23);
  }
  const to6 = (v: number) => Math.round((v / 255) * 5);
  return 16 + 36 * to6(r) + 6 * to6(g) + to6(b);
}

/** Assemble a full ductus from census stats + authorial options. */
export function buildDuctus(stats: CensusStats, opts: BuildDuctusOptions): Ductus {
  const maxGlyphs = opts.maxGlyphs ?? 24;
  const glyphs = stats.glyphs.slice(0, maxGlyphs);
  const counts = stats.counts.slice(0, maxGlyphs);
  const maxCount = counts[0] ?? 1;
  // Weights scaled to 1..9 ints, like the §7.2 example — small to
  // serialize, big enough to preserve proportion.
  const weights = counts.map((c) => Math.max(1, Math.round((c / maxCount) * 9)));

  const palette = { glyphs, weights, phrases: opts.phrases ?? [] };
  const vector = {
    density: round2(stats.density),
    whitespace: round2(stats.whitespace),
    symmetry: round2(stats.symmetry),
    runLength: { mean: round1(stats.runLength.mean), var: round1(stats.runLength.var) },
    drip: round2(stats.drip),
    jitter: round2(stats.jitter),
    emojiRatio: round2(stats.emojiRatio),
    stackDepth: round2(stats.stackDepth),
    grainAffinity: opts.grainAffinity ?? proposeGrain(stats),
  };

  const swatches = opts.swatches ?? [];
  return {
    id: ductusId(palette, vector),
    name: opts.name,
    version: opts.version ?? "0.1.0",
    palette,
    vector,
    color: { swatches, ansiSafe: swatches.map(hexToAnsi256) },
    flow: { fontHints: opts.fontHints ?? [] },
    meta: {
      kin: opts.kin ?? [],
      lineage: opts.lineage ?? null,
      author: opts.author ?? null,
      // Hazard: manifest may declare it; census detection ORs in on top —
      // you can claim hazard you don't measurably have (genre is a choice)
      // but you can't hide hazard you do (§15.3: informed consent).
      hazard: (opts.hazard ?? false) || stats.hazard.rtl || stats.hazard.zwFlood,
    },
  };
}
