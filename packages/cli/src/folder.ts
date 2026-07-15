// Reading a midden (§7.1): the aesthetic-as-folder. The compiler is a
// scavenger, not a customs agent — it reads what it can (text), warns
// about what it can't yet (images: coming, fonts: hint material for the
// app, mystery bytes: shrug), and NEVER writes into sources/.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".text", ".asc", ".nfo", ".ans"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".woff", ".woff2"]);

export interface MiddenContents {
  /** Concatenated text of every readable source, joined with blank lines. */
  sourceText: string;
  /** corpus.txt raw contents, if present. */
  corpus: string | null;
  /** manifest.yml raw contents, if present. */
  manifestText: string | null;
  /** What we read, what we skipped, what we're not ready for. */
  report: {
    textFiles: string[];
    imageFiles: string[];
    fontFiles: string[];
    mysteryFiles: string[];
  };
}

function walkTextish(dir: string, report: MiddenContents["report"], pieces: string[]): void {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkTextish(path, report, pieces);
      continue;
    }
    const ext = extname(entry).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext)) {
      report.textFiles.push(path);
      pieces.push(readFileSync(path, "utf8"));
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      report.imageFiles.push(path);
    } else if (FONT_EXTENSIONS.has(ext)) {
      report.fontFiles.push(path);
    } else if (!entry.startsWith(".")) {
      report.mysteryFiles.push(path);
    }
  }
}

export function readMidden(folder: string): MiddenContents {
  const report: MiddenContents["report"] = {
    textFiles: [],
    imageFiles: [],
    fontFiles: [],
    mysteryFiles: [],
  };
  const pieces: string[] = [];

  const sourcesDir = join(folder, "sources");
  if (existsSync(sourcesDir) && statSync(sourcesDir).isDirectory()) {
    walkTextish(sourcesDir, report, pieces);
  }

  const corpusPath = join(folder, "corpus.txt");
  const corpus = existsSync(corpusPath) ? readFileSync(corpusPath, "utf8") : null;

  const manifestPath = join(folder, "manifest.yml");
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;

  return {
    sourceText: pieces.join("\n\n"),
    corpus,
    manifestText,
    report,
  };
}

export function defaultName(folder: string): string {
  return basename(folder.replace(/\/+$/, ""));
}
