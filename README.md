# gubble

> *"Gubble gubble."* — the sound entropy makes when it speaks, per P.K. Dick,
> *Martian Time-Slip*, 1964.

A web-native instrument for generating, painting, mixing, corrupting, and
publishing text-mode compositions — borders, dividers, fills, full pages —
built from ASCII, Unicode, emoji, mojibake, and shredded language. A drawing
app for digital detritus. A synthesizer whose oscillators are aesthetics.
An hr generator with delusions of grandeur, and the delusions are the point.

The whole argument — worldview, vocabulary, Prime Directives, the fights
that got settled and the ones deliberately left open — lives in
[GUBBLE-SPEC.md](./GUBBLE-SPEC.md). Read it before touching architecture.
It is not boilerplate; it is the contract.

## THE LEDGER — current state, brutally factual

This section is the front door, not the sediment. It gets REWRITTEN as
reality moves; dated history lives in the milestone briefs (M3-BRIEF.md,
git log) and stays put. If prose here contradicts running code, the
prose is the bug. Last verified: 2026-07-18.

**Verify ritual:** `nvm use && npm run verify` — runs every core test
(125) and typechecks the app. Green means the promises below held.

**ALIVE** (built, crossing-tested, playable now):
- `gubble compile` CLI: census → ductus + specimen; mix/fill/link/census
  verbs (`./gubble …` from repo root; see FEEDING.md)
- Event log: state = replay(ops), undo = truncation, fork with lineage.
  RECORDS HANDS, not just choices (Jon's ruling, 2026-07-18): puck drags
  (`movePuck`) and corner swaps (`swapCorner`) are logged gestures,
  path-sampled ≤20Hz, not just the moments you hit STAMP. Inert on the
  buffer today (`fill` stays self-contained so a single op still grafts
  cleanly) — waits for v2 playback to actually walk the paths. Real
  consequence, tested: a stamp's seed depends on its INDEX, so gesture
  ops before it change what it draws — hands are woven into the
  generative math, not decoration on top of it. Measured cost: a
  realistic 20-min set (300 drags : 80 stamps) runs ~16KB as a URL,
  barely more than choices-only would have — kit-carrying stamps were
  always the heavy payload, not the gesture paths.
- GRID + FLOW: two performances of one buffer (FLOW: Pretext, vw=stream
  / chars=grid-faithful, cursor displacer; dominant-corner fontHints)
- The mixer: bilinear corners, per-cell shimmer, ~2s seeded crossfades,
  density/grain/phase at page scope (PHASE = integer-frame flutter,
  freezable mid-shimmer)
- Selection: drag-select, applyOnce verbs (redact / invert / posterize /
  fillWith / mistranscode with REAL cp1252 math), spawnable controllers
  (select text → mixer materializes on it), persistSection
- Sharing: ?a= aesthetics, ?k= kits, ?g= whole documents with at/f/mode
  (view|edit); URLs minted at the running origin; arrived documents FORK
  at first touch with lineage stamped; frozen (?f=&mode=view) arrivals
  hold still until touched; FREEZE stamps the moment, mints its URL,
  opens print
- STRATA view (op-age tint — §14.1's inspector, first face)
- `.gbbl`: the whole performance as a real, standards-compliant ZIP
  (header.json + ops.jsonl + thumb.txt, STORED not DEFLATEd, fixed
  1980-01-01 timestamps so identical documents produce byte-identical
  files). EXPORT/IMPORT in the app; import is an arrival like a shared
  URL — forks at first touch, same as `?g=`. Verified against the REAL
  system `unzip`, not just our own decoder: `unzip -l` lists it cleanly,
  `unzip -p thumb.txt` shows the actual composition to a tool that has
  never heard of gubble — "a package that is also its own screenshot,"
  per §4.2, literally true. This is the overflow path when a URL gets
  too big to hand someone.

**PARTIAL** (exists, but less than the spec's full sentence):
- `physical` width regime: linked size↔chars readout only; print-unit
  enforcement lands with paged print work
- Hazard handling: census flags + ductus hazard bit exist; the app has
  no consent dramaturgy yet (§15.3's informed-consent UI is absent)
- Provenance: recorded per-cell and colorable, but no hover inspector
- `main.ts` holds nearly the whole app; decomposition along project
  concepts is queued (see packages/app/README.md)

**ABSENT** (v1 spec says yes; not built):
- Image census (luminance→ink, k-means→swatches)
- In-app distill panel (§7.5)

**TABLED** (deliberately parked, on the record):
- `replay` URL mode → v2 playback UI (parsed nowhere, honestly)
- LLM-distill, brushes/stroke scope, ANSI+SAUCE export, svgbob misuse,
  the cootie, commons/mouvance — see spec §16 ledger
- Async/LLM brushes 🪲 (§19's contractually recurring bug)

```
packages/core  → the math + the log (framework-free TS, 125 tests)
packages/cli   → gubble compile/census/specimen/link/mix/fill
packages/app   → the instrument (Vite; npm run dev --workspace=@gubble/app)
aesthetics/    → compiled ductus+specimen travel; sources/ stay home (Directive 6)
calibration/   → gradient fixtures (§8)
FEEDING.md     → operator's manual · GUBBLE-SPEC.md → the contract
```

**Repo naming, settled:** the repo is `gubble`, not `gubble-core` — naming
the whole monorepo after one of its own child packages would've buried the
word in a stutter (`gubble-core/gubble-core/...`). Packages are scoped
`@gubble/*` instead, so the word "gubble" shows up in literally every
import statement across the codebase (`import { createRng } from
"@gubble/core"`) — maximal reference density for a project that loves its
own name.

## Tooling, and why

- **Node 20** (`.nvmrc`), not whatever's on your PATH. The system default
  when this repo started was Node 16, which has been EOL since September
  2023 — worth knowing if `node --version` surprises you.
- **npm workspaces**, not pnpm or yarn. Zero extra global installs, ships
  with Node. This was a placed default, not an argued one — veto-able same
  as anything else in spec §19 if you want pnpm's speed/disk-efficiency
  later.
- **TypeScript, strict.** `tsconfig.base.json` at the root, each package
  extends it. `@gubble/core` targets ES2022 with zero DOM lib assumptions
  on purpose (§3: runs in browser, Node, and Web Workers alike) — where it
  needs one Web Crypto method for `mintDocSeed()`, it ambient-declares
  just that method rather than pulling in the whole `dom` lib.
- **vitest**, for the property tests spec §17 explicitly promises at M1:
  replay determinism, census-gradient calibration, emoji/ZWJ width table.
  Only the first of those three exists yet (`packages/core/test/
  determinism.test.ts`) — the other two wait on census.ts and width.ts.

## The ledger so far

Two interview questions — what hash function, and where do Unicode's width
tables come from — turned out not to be bikeshedding. They're recorded as
RATIFIED in spec §19, and the actual decisions (sfc32 named as `rng` in
every document header, a frozen Unicode snapshot named as `measure`,
FNV-1a as the hash) are implemented in `packages/core/src/prng.ts`,
`hash.ts`, and `seed.ts` — read the comments there, they carry the
argument, not just the code. Determinism, in this project, isn't a ban on
accidents. It's the preservation medium for them.

Gubble gubble.
