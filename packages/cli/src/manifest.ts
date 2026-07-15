// manifest.yml parsing — deliberately a tiny YAML SUBSET, not a YAML
// engine. A manifest is flat keys, scalars, and lists (§7.1); parsing
// exactly that in ~80 lines beats a 200KB dependency that also parses
// anchors, aliases, octal integers, and the Norway problem. If a
// manifest needs more than this, the manifest is wrong, not the parser.
//
// Supported:
//   key: value            (strings, booleans, quoted strings)
//   key: [a, b, "c d"]    (inline lists)
//   key:                  (block lists)
//     - item
//   # comments and blank lines
//
// Unknown keys warn (playfully) rather than error — a manifest from a
// future gubble version shouldn't brick an old CLI.

export interface Manifest {
  name?: string;
  version?: string;
  author?: string;
  kin?: string[];
  lineage?: string;
  hazard?: boolean;
  grainAffinity?: "poster" | "texture" | "both";
  fontHints?: string[];
  swatches?: string[];
}

const KNOWN_KEYS = new Set([
  "name",
  "version",
  "author",
  "kin",
  "lineage",
  "hazard",
  "grainAffinity",
  "fontHints",
  "swatches",
]);

const LIST_KEYS = new Set(["kin", "fontHints", "swatches"]);

function parseScalar(raw: string): string | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const quoted = /^["'](.*)["']$/.exec(trimmed);
  return quoted ? quoted[1]! : trimmed;
}

function parseInlineList(raw: string): string[] {
  return raw
    .slice(1, -1)
    .split(",")
    .map((item) => String(parseScalar(item)))
    .filter((item) => item.length > 0);
}

export interface ManifestParse {
  manifest: Manifest;
  warnings: string[];
}

export function parseManifest(text: string): ManifestParse {
  const manifest: Record<string, unknown> = {};
  const warnings: string[] = [];
  let pendingListKey: string | null = null;

  for (const [lineNo, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/(^|\s)#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    const blockItem = /^\s+-\s*(.+)$/.exec(line);
    if (blockItem && pendingListKey) {
      (manifest[pendingListKey] as string[]).push(String(parseScalar(blockItem[1]!)));
      continue;
    }

    const kv = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) {
      warnings.push(`line ${lineNo + 1}: couldn't parse "${line.trim()}" — skipped, shrugging`);
      pendingListKey = null;
      continue;
    }

    const [, key, rawValue] = kv;
    if (!KNOWN_KEYS.has(key!)) {
      warnings.push(`unknown key "${key}" — ignored (future gubble? typo? either way, no harm done)`);
      pendingListKey = null;
      continue;
    }

    if (rawValue === "") {
      // block list follows
      manifest[key!] = [];
      pendingListKey = key!;
      continue;
    }

    pendingListKey = null;
    if (rawValue!.startsWith("[") && rawValue!.endsWith("]")) {
      manifest[key!] = parseInlineList(rawValue!);
    } else if (LIST_KEYS.has(key!)) {
      manifest[key!] = [String(parseScalar(rawValue!))];
    } else {
      manifest[key!] = parseScalar(rawValue!);
    }
  }

  // Light validation — grainAffinity is an enum, hazard is a bool.
  if (
    manifest.grainAffinity !== undefined &&
    !["poster", "texture", "both"].includes(manifest.grainAffinity as string)
  ) {
    warnings.push(
      `grainAffinity "${manifest.grainAffinity}" isn't poster|texture|both — falling back to the compiler's proposal`,
    );
    delete manifest.grainAffinity;
  }
  if (manifest.hazard !== undefined && typeof manifest.hazard !== "boolean") {
    warnings.push(`hazard should be true or false — got "${manifest.hazard}", treating as false`);
    delete manifest.hazard;
  }

  return { manifest: manifest as Manifest, warnings };
}
