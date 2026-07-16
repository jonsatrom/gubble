#!/usr/bin/env node
// gubble — the Phase Zero CLI (§8). Ships before the app exists so the
// seed library can grow while the instrument is still being built. Four
// verbs: compile, census, specimen, link. Zero dependencies beyond
// @gubble/core and node builtins — a CLI this small carrying commander
// would be all hat.

import { readFileSync, writeFileSync, existsSync, statSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import {
  censusText,
  corpusToPhrases,
  buildDuctus,
  ductusByteSize,
  DUCTUS_BYTE_BUDGET,
  renderSpecimen,
  encodeDuctusUrl,
  MEASURE_ID,
  createDocument,
  appendOp,
  truncate,
  replay,
  mintDocSeed,
  encodeKitUrl,
  NEUTRAL_EFFECTS,
  type Ductus,
  type CensusStats,
  type GrainAffinity,
  type Kit,
  type Corners,
} from "@gubble/core";
import { parseManifest, type Manifest } from "./manifest.js";
import { readMidden, defaultName } from "./folder.js";

const HELP = `
  gubble — text-mode detritus compiler (Phase Zero)

  usage:
    gubble compile <folder> [--watch] [--max-glyphs N] [--max-phrases N]
        census a midden → write ductus.json + specimen.txt into <folder>

    gubble census <file|folder> [--json]
        raw stats, no writes (calibration use)

    gubble specimen <ductus.json> [--width N] [--height N] [--grain poster|texture|both]
        re-render a specimen to stdout

    gubble link <ductus.json> [--origin URL]
        print the aesthetic-as-URL

    gubble fill <ductus.json> [--width N] [--height N] [--seed HEX] [--undo]
        the event log, touchable: create a document, append fill ops,
        replay, print the page. Same --seed → byte-identical page,
        forever (pipe two runs to diff and watch nothing happen).
        --undo appends a second fill then truncates it away, printing
        both states — undo as log truncation, demonstrated.

    gubble mix <a.json> <b.json> [c.json] [d.json] --puck X,Y
               [--density -1..1] [--grain -1..1] [--phase 0..1]
               [--frame N] [--width N] [--height N] [--seed HEX] [--link]
        the MIXER (M2), in a terminal: corners are [a=top-left,
        b=top-right, c=bottom-left, d=bottom-right], the puck leans,
        everybody bleeds. --frame freezes a shimmer mid-shimmer
        (only matters when --phase > 0). --link prints the whole
        patch as a ?k= URL instead of the page.

  the folder format, the worldview, and every design fight worth having:
  GUBBLE-SPEC.md. gubble gubble.
`;

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

const fmt = (n: number) => n.toFixed(2);

function printVectorReport(ductus: Ductus, stats: CensusStats): void {
  const v = ductus.vector;
  console.log(`  the vector (argue with it — that's what it's for):`);
  console.log(`    density    ${fmt(v.density)}   whitespace ${fmt(v.whitespace)}   symmetry ${fmt(v.symmetry)}`);
  console.log(`    runLength  ${v.runLength.mean}±${v.runLength.var}   drip ${fmt(v.drip)}   jitter ${fmt(v.jitter)}`);
  console.log(`    emojiRatio ${fmt(v.emojiRatio)}   stackDepth ${fmt(v.stackDepth)}   grain → ${v.grainAffinity}`);
  console.log(`    palette    ${ductus.palette.glyphs.length} glyphs from ${stats.totals.clusters} clusters / ${stats.totals.lines} lines`);
  if (ductus.palette.phrases.length > 0) {
    console.log(`    phrases    ${ductus.palette.phrases.length} corpus fragments aboard`);
  }
  if (ductus.meta.hazard) {
    console.log(`    ⚠ hazard   troublemaker codepoints detected — labeled, not banned (§15.3)`);
  }
}

async function compileFolder(
  folder: string,
  opts: { maxGlyphs?: number; maxPhrases?: number },
): Promise<void> {
  const midden = readMidden(folder);
  const name = defaultName(folder);

  let manifest: Manifest = {};
  if (midden.manifestText) {
    const parsed = parseManifest(midden.manifestText);
    manifest = parsed.manifest;
    for (const warning of parsed.warnings) console.log(`  ⚠ manifest: ${warning}`);
  }

  // Census sources; corpus as fallback material if sources/ is empty.
  // [PLACED DEFAULT — §19]: sources feed stats, corpus feeds phrases;
  // they only cross when there's nothing else to measure.
  const material = midden.sourceText.trim() ? midden.sourceText : (midden.corpus ?? "");
  if (!material.trim()) {
    fail(`this midden is empty — feed it before compiling.\n    (drop .txt/.md scraps in ${join(folder, "sources/")} or write a corpus.txt)`);
  }

  const { report } = midden;
  if (report.imageFiles.length > 0) {
    console.log(
      `  ⚠ ${report.imageFiles.length} image(s) found — image census (luminance + chroma, §7.3) lands in the next pass; skipped TODAY, not forever:`,
    );
    for (const f of report.imageFiles) console.log(`      ${f}`);
  }
  if (report.fontFiles.length > 0) {
    console.log(`  ℹ ${report.fontFiles.length} font(s) noted — fonts pass through as fontHints; list them in manifest.yml`);
  }
  if (report.mysteryFiles.length > 0) {
    console.log(`  ℹ ${report.mysteryFiles.length} mystery file(s) shrugged past: ${report.mysteryFiles.join(", ")}`);
  }

  const stats = censusText(material);

  let phrases = midden.corpus ? corpusToPhrases(midden.corpus) : [];
  const maxPhrases = opts.maxPhrases ?? 40;
  if (phrases.length > maxPhrases) {
    console.log(`  ⚠ corpus yielded ${phrases.length} phrases; keeping the first ${maxPhrases} (--max-phrases to change)`);
    phrases = phrases.slice(0, maxPhrases);
  }

  const ductus = buildDuctus(stats, {
    name: manifest.name ?? name,
    version: manifest.version,
    phrases,
    grainAffinity: manifest.grainAffinity as GrainAffinity | undefined,
    swatches: manifest.swatches,
    fontHints: manifest.fontHints,
    kin: manifest.kin,
    lineage: manifest.lineage ?? null,
    author: manifest.author ?? null,
    hazard: manifest.hazard,
    maxGlyphs: opts.maxGlyphs,
  });

  const specimen = renderSpecimen(ductus);

  writeFileSync(join(folder, "ductus.json"), JSON.stringify(ductus, null, 2) + "\n");
  writeFileSync(join(folder, "specimen.txt"), specimen);

  const bytes = ductusByteSize(ductus);
  console.log(`\n  ✓ compiled ${ductus.name} → ${ductus.id} (measure: ${MEASURE_ID})`);
  printVectorReport(ductus, stats);
  if (bytes > DUCTUS_BYTE_BUDGET) {
    console.log(
      `  ⚠ ductus is ${bytes} bytes — over the ~${DUCTUS_BYTE_BUDGET}B URL discipline (§7.2).` +
        `\n    Not truncating anything for you (agency stays yours), but consider fewer phrases or glyphs.`,
    );
  } else {
    console.log(`    ${bytes} bytes — travels light, fits in a URL ✓`);
  }
  console.log(`    wrote ${join(folder, "ductus.json")}`);
  console.log(`    wrote ${join(folder, "specimen.txt")}\n`);
}

async function main(): Promise<void> {
  // Fail loud and early on old Node rather than cryptically deep in a
  // verb. The repo's .nvmrc pins 20; the system default around here has
  // been known to be an EOL 16, which limps through most verbs and then
  // faceplants on Web Crypto. Guard the door, name the fix.
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20) {
    fail(
      `gubble needs Node 20+, and this is Node ${process.versions.node}.\n    Fix: run \`nvm use\` in the repo root (reads .nvmrc), then try again.`,
    );
  }

  const [, , command, target, ...rest] = process.argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(HELP);
    return;
  }
  if (!target) fail(`"${command}" needs a target — see gubble --help`);

  const path = resolve(target);

  switch (command) {
    case "compile": {
      if (!existsSync(path) || !statSync(path).isDirectory()) {
        fail(`${target} isn't a folder I can find`);
      }
      const opts = {
        maxGlyphs: flagValue(rest, "--max-glyphs") ? Number(flagValue(rest, "--max-glyphs")) : undefined,
        maxPhrases: flagValue(rest, "--max-phrases") ? Number(flagValue(rest, "--max-phrases")) : undefined,
      };
      await compileFolder(path, opts);

      if (rest.includes("--watch")) {
        console.log(`  👁  watching ${target} — the midden grows, the ductus drifts (ctrl-c to stop)\n`);
        let timer: ReturnType<typeof setTimeout> | null = null;
        watch(path, { recursive: true }, (_event, filename) => {
          // Don't recompile because we just wrote our own outputs.
          if (filename && /ductus\.json$|specimen\.txt$/.test(filename)) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            console.log(`  ~ midden stirred (${filename ?? "somewhere"}) — recompiling`);
            compileFolder(path, opts).catch((err) => console.error(`  ✗ ${err.message}`));
          }, 300);
        });
      }
      break;
    }

    case "census": {
      if (!existsSync(path)) fail(`${target}: no such file or folder`);
      let text: string;
      if (statSync(path).isDirectory()) {
        const midden = readMidden(path);
        text = midden.sourceText.trim() ? midden.sourceText : (midden.corpus ?? "");
        if (!text.trim()) fail(`nothing censusable in ${target}`);
      } else {
        text = readFileSync(path, "utf8");
      }
      // --json is the documented flag (§8) and also the only output shape
      // raw stats have today, so it's the default; the flag stays legal
      // for muscle memory and future non-JSON modes.
      console.log(JSON.stringify(censusText(text), null, 2));
      break;
    }

    case "specimen": {
      if (!existsSync(path)) fail(`${target}: no such ductus.json`);
      const ductus = JSON.parse(readFileSync(path, "utf8")) as Ductus;
      const width = flagValue(rest, "--width") ? Number(flagValue(rest, "--width")) : undefined;
      const height = flagValue(rest, "--height") ? Number(flagValue(rest, "--height")) : undefined;
      const grain = flagValue(rest, "--grain") as GrainAffinity | undefined;
      console.log(renderSpecimen(ductus, { width, height, grain }));
      break;
    }

    case "link": {
      if (!existsSync(path)) fail(`${target}: no such ductus.json`);
      const ductus = JSON.parse(readFileSync(path, "utf8")) as Ductus;
      const origin = flagValue(rest, "--origin");
      const url = await encodeDuctusUrl(ductus, origin);
      const bytes = ductusByteSize(ductus);
      console.log(`\n  ${url}\n`);
      console.log(`  ${bytes} bytes of ductus → ${url.length} chars of URL`);
      console.log(`  (origin is a placeholder until the app exists — the payload IS the aesthetic)\n`);
      break;
    }

    case "fill": {
      // [PLACED DEFAULT — §19]: `fill` isn't in the §8 verb list; it
      // exists so the event log (M1) is checkable by hand instead of
      // only by test suite. It's a preview of M2's instrument, one op
      // at a time.
      if (!existsSync(path)) fail(`${target}: no such ductus.json`);
      const ductus = JSON.parse(readFileSync(path, "utf8")) as Ductus;
      const cols = flagValue(rest, "--width") ? Number(flagValue(rest, "--width")) : 80;
      const rows = flagValue(rest, "--height") ? Number(flagValue(rest, "--height")) : 24;
      const seed = flagValue(rest, "--seed") ?? mintDocSeed();

      const doc = createDocument({ cols, rows }, seed);
      appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus } });
      console.log(replay(doc).toText());
      console.log(`\n  docSeed ${seed} · 1 op · rng ${doc.header.rng} · measure ${doc.header.measure}`);
      console.log(`  reproduce this exact page anytime: --seed ${seed}`);

      if (rest.includes("--undo")) {
        appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { ductus } });
        console.log(`\n  ── op #2 appended (a second fill, overprinting) ──\n`);
        console.log(replay(doc).toText());
        const undone = truncate(doc, 1);
        console.log(`\n  ── undo = truncate(doc, 1) — no eraser, just less history ──\n`);
        console.log(replay(undone).toText());
        console.log(`\n  the undone page is byte-identical to the first: ${replay(undone).toText() === replay(truncate(doc, 1)).toText() ? "✓" : "✗ (file a bug, loudly)"}`);
      }
      break;
    }

    case "mix": {
      // Corners from positional args: target + up to 3 more ductus paths
      // before the first --flag.
      const cornerPaths = [target, ...rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1]!.startsWith("--")))].slice(0, 4);
      const loaded = cornerPaths.map((p) => {
        const full = resolve(p);
        if (!existsSync(full)) fail(`${p}: no such ductus.json`);
        return JSON.parse(readFileSync(full, "utf8")) as Ductus;
      });
      if (loaded.length < 2) fail("mix wants at least 2 corners (up to 4)");
      const corners: Corners = [loaded[0] ?? null, loaded[1] ?? null, loaded[2] ?? null, loaded[3] ?? null];

      const puckRaw = flagValue(rest, "--puck") ?? "0.5,0.5";
      const [px, py] = puckRaw.split(",").map(Number);
      if (px === undefined || py === undefined || Number.isNaN(px) || Number.isNaN(py)) {
        fail(`--puck wants X,Y like 0.3,0.7 — got "${puckRaw}"`);
      }

      const kitObj: Kit = {
        corners,
        puck: { x: px!, y: py! },
        effects: {
          density: Number(flagValue(rest, "--density") ?? NEUTRAL_EFFECTS.density),
          grain: Number(flagValue(rest, "--grain") ?? NEUTRAL_EFFECTS.grain),
          phase: Number(flagValue(rest, "--phase") ?? NEUTRAL_EFFECTS.phase),
        },
      };

      if (rest.includes("--link")) {
        const url = await encodeKitUrl(kitObj, flagValue(rest, "--origin"));
        console.log(`\n  ${url}\n`);
        console.log(`  the patch file IS the URL (§10) — corners travel inline, no registry needed\n`);
        break;
      }

      const cols = flagValue(rest, "--width") ? Number(flagValue(rest, "--width")) : 80;
      const rows = flagValue(rest, "--height") ? Number(flagValue(rest, "--height")) : 24;
      const frame = flagValue(rest, "--frame") ? Number(flagValue(rest, "--frame")) : 0;
      const seed = flagValue(rest, "--seed") ?? mintDocSeed();

      const doc = createDocument({ cols, rows }, seed);
      appendOp(doc, { op: "fill", scope: { kind: "page" }, args: { kit: kitObj } });
      console.log(replay(doc, { frame }).toText());
      console.log(
        `\n  puck ${px},${py} · corners [${loaded.map((d) => d.name).join(" · ")}]` +
          ` · fx d${kitObj.effects.density} g${kitObj.effects.grain} p${kitObj.effects.phase}` +
          (kitObj.effects.phase > 0 ? ` · frame ${frame}` : ""),
      );
      console.log(`  reproduce: --seed ${seed}${kitObj.effects.phase > 0 ? ` --frame ${frame}` : ""}\n`);
      break;
    }

    default:
      fail(`unknown command "${command}" — see gubble --help`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
