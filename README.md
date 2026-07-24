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
reality moves; dated history lives in git log and stays put. If prose
here contradicts running code, the prose is the bug. Last verified:
2026-07-18. **v1's core loop is complete and playable, INCLUDING the
full effects roster now (closed same night as the v1.0.0 tag) — but
it's still not a 100%-of-spec checklist pass.** Image census and the
full distill proposal panel remain genuinely absent; see ABSENT below.

**Verify ritual:** `nvm use && npm run verify` — build + every core test
(141) + app typecheck. Green means the promises below held.

**ALIVE** (built, crossing-tested against real behavior, playable now):
- `gubble compile` CLI: census → ductus + specimen; mix/fill/link/census
  verbs (`./gubble …` from repo root; see FEEDING.md)
- Event log: state = replay(ops), undo = truncation, fork with lineage.
  RECORDS HANDS, not just choices (Jon's ruling, 2026-07-18): puck drags
  (`movePuck`), corner swaps (`swapCorner`), and distillations (`distill`)
  are all logged gestures, path-sampled ≤20Hz where continuous — not
  just the moments you hit STAMP. Inert on the buffer (`fill` stays
  self-contained so a single op still grafts cleanly) — waits for v2
  playback to actually walk the paths. Real tested consequence: a
  stamp's seed depends on its INDEX, so gesture ops before it change
  what it draws — hands are woven into the generative math. Measured: a
  realistic 20-min set (300 drags : 80 stamps) runs ~16KB as a URL,
  barely more than choices-only — kit-carrying stamps were always the
  heavy payload, not the gesture paths.
- GRID + FLOW: two performances of one buffer (FLOW: Pretext, vw=stream
  / chars=grid-faithful, cursor displacer; dominant-corner fontHints)
- The mixer: bilinear corners, per-cell shimmer, ~2s seeded crossfades.
  **All 8 of §9's named effects are live now** (closed 2026-07-18, "before
  zzz"): density/grain/phase (M2) plus drip/jitter/symmetry/blur/filter
  (M6). The last five needed real neighbor-awareness the original
  per-cell-pure `cellDraw` didn't have — split into `naturalDraw` (the
  original pure primitive) plus a post-effects layer that calls it AGAIN
  at specific neighbor indices (the cell above for drip, a mirror
  partner for symmetry, a plus-neighborhood for blur) — each lookup
  stays pure, same trick run-continuation already used. Verified against
  census's OWN drip/symmetry measurements (the instrument checking
  itself two ways), not just typechecked. New EffectState fields are
  OPTIONAL — every kit shared before tonight still loads and behaves
  identically (tested directly, not assumed).
- Selection: drag-select, applyOnce verbs (redact / invert / posterize /
  fillWith / mistranscode with REAL cp1252 math), spawnable controllers
  (select text → mixer materializes on it), persistSection
- DISTILL (minimal cut, §7.5): select → census → new folder-less
  aesthetic, docked in the rail, playable immediately. The loop "fill →
  mark → distill → fill with what you distilled" closes. Named
  deterministically from the resulting ductus's own content-hash id, not
  Math.random.
- Provenance inspector (§14.1): hover a GRID cell, see which aesthetic
  + which op inked it, live.
- Hazard marker (§15.3): rail chips carrying a hazardous ductus show ⚠.
  Verified against a genuinely hazardous aesthetic (real RTL-override
  detection), loaded through the actual `?a=` path — not faked.
- Sharing: ?a= aesthetics, ?k= kits, ?g= whole documents with at/f/mode
  (view|edit — NOT replay, unparsed on purpose); URLs mint at the
  running origin; arrived documents FORK at first committed touch with
  lineage stamped; frozen (?f=&mode=view) arrivals hold still until
  touched; FREEZE stamps the moment, mints its URL, opens print.
- STRATA view (op-age tint — §14.1's inspector, first face)
- `.gbbl`: the whole performance as a real, standards-compliant ZIP
  (header.json + ops.jsonl + thumb.txt, STORED not DEFLATEd, fixed
  1980-01-01 timestamps so identical documents produce byte-identical
  files). EXPORT/IMPORT in the app; import is an arrival like a shared
  URL. Verified against the REAL system `unzip`, not just our own
  decoder — including a browser-fingerprint cross-check of the actual
  export button's output, not just a Node-side round-trip.


**PARTIAL** (exists, but less than the spec's full sentence):
- `physical` width regime: linked size↔chars readout only; print-unit
  enforcement lands with paged print work
- Hazard UX: detection + marker exist; no consent GATE (§15.3's
  informed-consent dramaturgy — "here's what's hazardous, choose" — isn't
  built, just the label)
- `main.ts` holds nearly the whole app; decomposition along project
  concepts is queued (see packages/app/README.md); `gesture.ts` is the
  only cut made so far

**ABSENT** (v1 spec says yes; not built):
- Image census (luminance→ink, k-means→swatches) — nothing here at all;
  the CLI just warns and skips images it finds
- The full distill proposal panel (live-manipulable pre-naming — click
  glyphs to strike, drag vector params) — only the minimal closed-loop
  cut above exists

**TABLED** (deliberately parked, on the record):
- `replay` URL mode → v2 playback UI (parsed nowhere, honestly)
- LLM-distill, brushes/stroke scope, ANSI+SAUCE export, svgbob misuse,
  the cootie, commons/mouvance — see spec §16 ledger
- Async/LLM brushes 🪲 (§19's contractually recurring bug)

```
packages/core  → the math + the log (framework-free TS, 153 tests)
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
