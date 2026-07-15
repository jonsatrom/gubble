# GUBBLE — SPEC v0.9 (Claude Code Handoff)

> *"Gubble gubble."* — the sound entropy makes when it speaks, per P.K. Dick, *Martian Time-Slip*, 1964

**GUBBLE** is a web-native instrument for generating, painting, mixing, corrupting,
and publishing text-mode compositions — borders, dividers, fills, full pages —
built from ASCII, Unicode, emoji, mojibake, and shredded language.
It is a drawing app for digital detritus. It is a synthesizer whose oscillators
are aesthetics. It is an hr generator with delusions of grandeur, and the
delusions are the point.

This document is the build contract. It was argued into existence over one long
conversation; where a decision is marked **[ASSUMED]**, Jon has not explicitly
ratified it and gets a veto (collected in §19). Where it's marked **[TABLED]**,
do not build it, but do not forget it either.

**To the implementing Claude:** you are inheriting a tool with a worldview.
Read §2 before writing a line. The worldview is load-bearing.

---

## 1. Vocabulary (use these words; they are not decoration)

| Term | Meaning |
|---|---|
| **gubble** | The tool; also a verb. To gubble a page is to fill/paint/corrupt it. |
| **ductus** | The compiled signature of an aesthetic — what remains when meaning is stripped: glyph palette + behavior vector + color + affinities. Lives in `ductus.json`. (From asemic-writing theory: the gesture of the hand, minus the words.) |
| **specimen** | The canonical rendered demo of an aesthetic (`specimen.txt`), in the lineage of type-foundry specimen sheets. |
| **kit** | A saved mixer state: 4 corner aesthetics + effect settings + definition settings + seed. URL-encodable. The patch file. |
| **distill** | Select a region of a document → extract a new aesthetic from what's actually there. The reverse of fill. |
| **graft** | Lift an op-range from one document's history and replay it onto another. Deliberately lossy: ops are deterministic but substrate-dependent, so grafts *take* but grow differently in new soil. Horticulture, not merge. |
| **mouvance** | The fork-cloud ontology: a work existing only as a swarm of variants with no authoritative original (Zumthor's term for medieval textuality). The commons' branch viewer is the **mouvance view**. |
| **cootie** | The optional zero-width attribution payload in plain-text exports. See §14. |
| **kipple** | Ambient term for the material itself. Sources folders are middens. Treat the discard pile as the record. |

## 2. Prime Directives (non-negotiable; violations are bugs)

1. **Determinism or death.** No naked `Math.random()` anywhere. All randomness
   flows from a seedable PRNG (§4.3). A share URL must reproduce a moment
   *exactly*, including mid-flutter states. The URL is the provenance.
   **Addendum (ratified 2026-07-15):** the seed and the ruler freeze
   together. Determinism isn't a ban on accidents — this tool *loves*
   accidents — it's the preservation medium for them. The seed doesn't
   prevent the glitch; it archives it, so a beautiful accident becomes
   kipple instead of evaporating: collectible, forkable, graftable. That
   means every input to reproduction gets named and versioned in the
   document header, not just the dice — see `rng` and `measure` in §4.1.
   Nothing in gubble is bedrock. Everything is declared material,
   including its own infrastructure.
2. **The event log IS the document.** Current state is always a replay of the
   log (§4). This ships in v1 even though playback UI is v2 — retrofitting a
   log under a state-based format later is misery. Undo = log truncation.
3. **Flat ontology. No originals.** There is no "signal" that "noise" degrades.
   Mojibake, zalgo, spam corpus, braille static, and redaction blocks are
   materials with equal standing — corruption operations are *aesthetics in
   the library*, not a post-process stage. There is no LEGIBILITY master
   slider. Degrading is remixing: you can't corrupt something without getting
   material on it. (This was fought over. Model B lost. Do not resurrect it.)
4. **No merge. Graft only.** Merging implies reconciliation toward a canonical
   state, which smuggles provenance-toward-an-original back in. Banned.
5. **URL-native sovereignty.** A v1 document, kit, or aesthetic must be fully
   shareable as a URL with no platform in between. The commons (§15) is an
   optional convenience index, never a gate.
6. **Interpretation-not-sampling firewall.** `sources/` folders are private
   studio material and NEVER publish. Only `ductus.json` + `specimen.txt` +
   `manifest.yml` leave the folder. The folder is the studio; the ductus is
   the work.
7. **Comments and READMEs are playfully verbose.** This is a ratified project
   requirement, not a style suggestion. See Appendix B for the house voice.
   A future reader should be able to reconstruct *why* from the comments alone.
8. **Feral inputs are genre, not crime.** Layout-breaking codepoints get a
   ⚠ hazard tag (§15.3), not a ban. Informed consent over sanitization.

## 3. Architecture at 30,000 Feet

```
 /aesthetics/<name>/          gubble-core (TS lib)            gubble-app (web)
 ┌──────────────┐   compile   ┌──────────────────┐   import   ┌────────────────┐
 │ sources/ 🗑️  │ ──────────▶ │ census · ductus  │ ─────────▶ │ GRID instance  │
 │ corpus.txt   │  (CLI, M0)  │ PRNG · event log │            │ FLOW instance  │
 │ manifest.yml │             │ cell buffer      │            │ XY pad · rail  │
 └──────────────┘             │ mixer · effects  │            │ selection · fx │
        ▲                     └──────────────────┘            │ URLs · freeze  │
        │  distill (reverse arrow: select canvas → new folder-less aesthetic)  │
        └──────────────────────────────────────────────────────────────────────┘
```

Three packages, one repo (workspace):
- **`gubble-core`** — framework-free TypeScript: PRNG, event log + replay, cell
  buffer with width math, census, mixer math, effects. Runs in browser, Node,
  and Web Workers. Zero DOM assumptions.
- **`gubble-cli`** — Phase Zero deliverable (§8). `compile-aesthetic <folder>`.
  Imports gubble-core's census. Ships FIRST, before any UI exists, so the seed
  library grows while the instrument is still being built.
- **`gubble-app`** — the instrument. Vite, minimal chrome. See §18 for stack.

## 4. The Document: Event Log Format

### 4.1 Ops

A document is an append-only array of ops plus a header. State = `replay(ops)`.

```jsonc
// header
{
  "gubble": "0.9",              // format version
  "docSeed": "7f3a9c...",       // 128-bit hex; root of all randomness. Minted
                                //   ONCE via crypto.getRandomValues at doc
                                //   creation — the single sanctioned act of
                                //   real non-determinism in the whole system.
                                //   Everything downstream of this is dice,
                                //   not chaos.
  "rng": "sfc32/1",             // the dice, named + versioned (§4.3). A future
                                //   better RNG is an addition new docs opt
                                //   into, never a silent rewrite of what a
                                //   1-year-old share-URL means.
  "measure": "eaw-16.0/g1",     // the ruler, named + versioned (§5.1): which
                                //   frozen Unicode width snapshot GRID's cell
                                //   math measures against. Vendored, never a
                                //   live dependency — an un-pinned width table
                                //   is Directive 1 leaking through package.json.
  "created": 1780000000000,
  "definition": { ... },        // §6 snapshot at creation (ops may change it)
  "lineage": null               // or { "parent": "<url>", "at": 340 } for forks
}

// op
{
  "i": 42,                      // index; also the fork/graft address
  "t": 1780000012345,           // wall-clock ms (for playback pacing only —
                                //   NEVER used in generation math)
  "op": "fill",                 // see op table below
  "scope": { "kind": "section", "id": "s2" },   // or "page" | "selection" | "stroke"(v2)
  "args": { "kit": { ... } },
  "seed": "d41d8cd9"            // derived: hash(docSeed ‖ i) — every op gets
                                //   its own reproducible stream
}
```

**v1 op table:** `setDefinition`, `fill`, `setEffect`, `select`, `clearSelect`,
`applyOnce` (redact / mistranscode / transform), `spawnController`,
`moveController` (slider/XY positions — throttled, coalesced),
`persistSection`, `swapCorner`, `movePuck`, `distill`, `freeze`, `sign` (§14).
v2 adds `stroke`. Grafting (v3) is `replayRange(srcDoc, i0, i1)` — one op that
references foreign history.

**Coalescing rule:** continuous gestures (puck drags, slider moves) log as one
op with a sampled path, max ~20Hz, or the log bloats and playback jitters.

### 4.2 The .gbbl package **[ASSUMED — extension veto-able]**

`document.gbbl` = zip: `header.json` + `ops.jsonl` + `assets/` (dumped images
for v3 inline use) + `thumb.txt` (plain-text render of final state, so the file
previews in a text editor — a package that is also its own screenshot).

### 4.3 PRNG

**Ratified:** `sfc32`, recorded in the header as `rng: "sfc32/1"` (§4.1).
Per-op state is expanded from `opSeed` via `splitmix32` (four 32-bit words in,
sfc32 needs four out) and stepped sequentially wherever an op needs an
*ordered* stream — splice-point placement (§10), shuffles, anything where
draw N genuinely depends on having made draw N-1.

Per-cell randomness is a different shape on purpose: `hash(opSeed ‖
cellIndex)`, hashed with **FNV-1a** (ratified — cheap, ~15 lines, zero
dependency, honors "framework-free" the same way hand-rolling cell-width math
does), so any single cell is computable in isolation. A re-render of any
subregion is stable without replaying neighbors — random *access*, not random
*sequence*. Flutter (§9 PHASE) extends the same hash one key deeper:
`hash(opSeed ‖ cellIndex ‖ frameIndex)` — time enters ONLY as an integer frame
counter carried in app state, never `Date.now()`, so `?at=` can freeze
mid-shimmer.

Note the hash itself is uniform-draw plumbing, not the aesthetic layer —
auditioning hash functions for "feel" the way you'd audition synth
oscillators is connoisseurship theater; for uniform draws any decent-avalanche
hash is perceptually interchangeable. The real aesthetic knob lives one floor
up: whether draws sourced from the hash land *spatially* white-noise-flat or
blue-noise/coherent before hitting the cell buffer. That's `noiseCharacter` —
reserved for v2/v3 (§16), not built in v1.

## 5. Rendering Instances

One core buffer, two performances of it. Both ship in v1.

### 5.1 GRID (monospace; the paint & print surface)

- Character-addressed cell buffer. Copy-paste-able, scene-compatible, honest.
- **Cell width math is ours** (Pretext explicitly does not cover pre-wrap):
  - Grapheme clustering via `Intl.Segmenter`.
  - East-Asian-Width `W`/`F` and emoji presentation → **2 cells**, sourced
    from a **vendored, frozen** Unicode data snapshot — never a live npm
    dependency. An un-pinned width table is Directive 1 leaking through
    `package.json`: same seed, same ops, a different cell layout after next
    year's Unicode update, and nothing in the log to blame. The snapshot
    version is recorded in the document header as `measure` (§4.1) — the
    ruler freezes alongside the dice.
  - Combining marks / ZWJ / variation selectors → **0 cells**, attach to the
    previous cluster (this is how zalgo stack-depth lives in one cell).
  - A `shear` debug toggle deliberately mis-measures by ±1 for controlled
    breakage. ("More broken" was requested as a slider. It gets one.) It's
    also the seed of a bigger idea, parked for v3: **width tables as
    material** — a swappable `measure` isn't just a debug flag, it's a
    ductus for space itself (a composition that believes combining marks
    are wide and box-drawing is narrow). See §16 v3.
- Renders to Canvas2D for speed, mirrored to an offscreen DOM `<pre>` that is
  the copy/export source of truth (what you copy is real characters, always).

### 5.2 FLOW (proportional; the live performance surface)

- Layout via **`@chenglou/pretext`** (`prepare()` once per font/glyph-set,
  `layout()` per frame — it's ~0.0002ms/call, safe at 60fps).
- Proportional-font detritus is nearly unexplored territory; FLOW is where
  gubble stops inheriting ANSI-scene assumptions.
- **Obstacle-aware flow:** composition text reflows in realtime around
  displacers — the cursor (with radius), and in v3, dragged inline images with
  alpha-contour exclusion shapes (§16 v3). Pretext's scanline-exclusion demos
  are the reference implementation.
- Pretext caveats to honor: fonts must be loaded before `prepare()`
  (`document.fonts.load`), standard CSS line-breaking only, Safari emoji
  calibration is built-in (trust it).
- Aesthetics may carry `flow.fontHints` (§7.2) — an aesthetic that insists on
  Comic Sans is carrying a legitimate payload.

## 6. Definition Controls (width · size · grain)

"Definition" decomposes into three linked controls:

1. **Width regime:**
   - `vw` — viewport-native; composition re-wraps live on resize (FLOW) or
     re-flows the grid column count (GRID). The default; the web one.
   - `chars` — fixed character width (80, 132… lineprinter lineage). Faithful
     to the text.
   - `physical` — fixed mm/inches for print. Faithful to the page.
2. **Font size** — a first-class slider. At `physical` width, font size and
   character count are **inversely locked** (one slider moves both — the
   collision is the feature; render the linked value live).
3. **GRAIN interplay** — the same ductus at 250 chars / 180pt is a *poster*
   (glyph as figure); at 10,000 chars / 6pt it is a *texture* (glyph as grain).
   Halftone frequency for text. Definition controls don't just fit output to
   media; they re-voice the aesthetic.

## 7. Aesthetics

### 7.1 Aesthetic-as-folder (the pre-tool substrate)

```
/aesthetics/y2k-egirl/
  sources/        # THE MIDDEN. Dump anything within file limits: .txt, .md,
                  #   screenshots, saved fragments, fonts, future media.
                  #   The compiler is a scavenger, not a customs agent.
                  #   PRIVATE FOREVER (Prime Directive 6).
  corpus.txt      # legible material, if any: spam lines, AI-voice phrases,
                  #   theory paragraphs. This is where language lives.
  specimen.txt    # COMPILED. The gradient demo page (§7.4).
  ductus.json     # COMPILED. The aesthetic itself (§7.2).
  manifest.yml    # name, kin tags (free + optional CARI/Aesthetics-Wiki
                  #   links), lineage, semver version, author, hazard flag.
```

Folders are recompilable; the ductus **drifts** as the midden grows — version
history is the aesthetic's biography. (Working metaphor from Jon: *metamedia
LoRAs*. Keep that phrase in the README.)

### 7.2 ductus.json schema (v1)

```jsonc
{
  "id": "aes_8f3k2x",                    // unique; names are NOT unique
  "name": "y2k-egirl",
  "version": "1.3.0",
  "palette": {
    "glyphs":  ["¤","ø","¸",",","°","º","✿","꒰","🎀","꒱","💖","˚","୨","୧","⋆"],
    "weights": [9,8,8,6,6,6,3,2,2,2,2,4,3,3,5],   // parallel array
    "phrases": []                        // corpus-derived legible units
  },
  "vector": {                            // THE DUCTUS PROPER
    "density": 0.78,                     // ink-weight mean, 0..1
    "whitespace": 0.12,                  // gap ratio
    "symmetry": 0.61,                    // mirror-correlation score
    "runLength": { "mean": 3.2, "var": 1.1 },
    "drip": 0.05,                        // vertical bleed probability
    "jitter": 0.2,
    "emojiRatio": 0.18,
    "stackDepth": 0,                     // combining marks per glyph (zalgo)
    "grainAffinity": "poster"            // poster | texture | both —
                                         //   CONTRIBUTOR-SET, compiler only
                                         //   PROPOSES. Agency at both ends.
  },
  "color":  { "swatches": ["#ff9de2","#c8f7ff","#fff6a9"], "ansiSafe": [218,159,229] },
  "flow":   { "fontHints": ["Comic Sans MS", "cursive"] },
  "meta":   { "kin": ["y2k","webcore"], "lineage": null, "author": "jon",
              "hazard": false }
}
```

**Size discipline:** a ductus must stay small enough to travel *inside a URL*
(target: < ~2KB before compression). That single constraint is the whole
platform-independence guarantee — aesthetics pass hand-to-hand as links.

### 7.3 Compilation: census mode (v1, deterministic — no LLM anywhere)

Given a folder, the census:
- **Text sources →** grapheme-frequency table (→ palette + weights), density
  profile, whitespace ratio, symmetry score, run-length stats, stack-depth,
  emoji ratio, drip estimate (vertical adjacency correlation).
- **corpus.txt →** `phrases[]`, split on lines/sentences, deduped.
- **Images (v1 jobs!):**
  - *Luminance census:* map to the ink-weight ramp (`█▓▒░·˚ `) → contributes
    density/grain stats AND doubles as an image→text page-fill texture — the
    image-to-ascii tool arrives early through the side door.
  - *Chroma extraction:* k-means (k=5–8) → `color.swatches` (+ nearest
    ANSI-256 quantization). Dump a Lisa Frank screenshot; the aesthetic now
    knows its own pinks. Images are **colorists in v1, glyph-whisperers in v2.**
- **Fonts →** pass through to `flow.fontHints`. The census doesn't read them;
  it respects them.

**LLM-distill is v2** (glyph-neighborhood interpretation, the
faithful↔interpreted slider, few-shot-primed by the hand-corrected seed
library). Census mode ships first and dissolves all v1 hosting questions —
there is nothing to host.

### 7.4 specimen.txt format **[ASSUMED — awaiting explicit ratification]**

One page, two sweeps: **maximal→minimal top-to-bottom**, and **if corpus.txt
exists, a legible→shredded sweep left-to-right** (via progressively heavier
cut-up splice + substitution + stacking + block-out drawn from the corruption
aesthetics, mixed in — not a hidden gauntlet stage, an on-page demonstration).
The specimen is the aesthetic's Hamburgefonstiv.

### 7.5 In-app distillation (no forms, ever)

Select region → **DISTILL** → census runs on the selection *and its provenance
channel* (§14.1) → proposal renders live on-canvas in a panel where every
element is directly manipulable: click glyphs to strike them, drag vector
params and watch the patch re-render, set grainAffinity by resizing the
preview. Name it → it's in your rail. **The review process is drawing with it.**
The loop is the soul: *fill → mark → distill → fill with what you distilled.*
Nobody contributes; sediment accumulates.

## 8. Phase Zero: `gubble compile` (the CLI ships before the app)

```
gubble compile <folder>            # census → ductus.json + specimen.txt
gubble compile <folder> --watch    # recompile on midden changes
gubble specimen <ductus.json>      # re-render specimen at --width --grain
gubble census <file|dir> --json    # raw stats, no write (calibration use)
gubble link <ductus.json>          # print the aesthetic-as-URL
```

- Node CLI (commander or similar), importing `gubble-core` — the census code
  is EXACTLY the code the app will use. No parallel implementations.
- Exit criterion for M0: Jon can run `gubble compile aesthetics/y2k-egirl/`
  today and get a ductus + specimen worth arguing with.
- **Calibration fixtures:** gradient documents (density L→R, grain T→B, etc.)
  live in `/calibration/`. Test = census the left third vs right third; the
  vectors MUST differ in the swept parameter and only meaningfully in it.
  Test fixtures disguised as compositions; hang them in the commons later.

## 9. Effects (scope-agnostic; there are no "masters")

One bag of effects. Each attaches at **page**, **section**, **selection**, or
**(v2) stroke** scope. "Master sliders" turned out to be effects that happened
to be wearing page-scope; the category is dissolved.

| Effect | What it does | Notes |
|---|---|---|
| **density** | max↔min gain on ink-weight; at extremes, glyph promotion/starvation (fullwidth + stacking + drip at max; hair-spaces U+200A, lone braille dots, one orphaned combining mark at min) | the original MAX/MIN axis |
| **grain** | poster↔texture re-voicing (glyph size vs count tradeoff within scope) | interacts with §6; fights grainAffinity *beautifully* when cranked against it |
| **phase** | stability↔shimmer. Per-cell desync of flutter via seeded phase offsets (`hash(opSeed‖cell‖frame)`) | KIPPLE/STICKER lineage: desynchronized instances as aesthetic. A parked puck still breathes. |
| **drip** | vertical bleed into lines below | per Jon: affects a brush AND a page fill — the observation that killed the master/param split |
| **jitter** | positional noise (GRID: cell swap-adjacency; FLOW: baseline wobble) | |
| **symmetry** | mirror/rotational enforcement strength | |
| **blur** | **ramp-diffusion**: each cell averages neighborhood ink-weight → remap to nearest glyph on the lightness ramp. The page defocuses into fog *without leaving text* — copy the blur, it's still real characters | CSS/canvas filter blur allowed in FLOW as the cheap dishonest option, clearly labeled |
| **filters** | per-cell remap family: invert ink-weight, posterize (3-step ramp), threshold | nearly free once ramp mapping exists |

## 10. Mixing: kits, the XY pad, the rail

- **Rail** (left, scrollable): each aesthetic chip **renders itself as its own
  label** — no plain-text names in the rail. Drag chip → corner (mobile: tap
  corner → picker sheet). Drag chip *out* → copies its aesthetic-URL.
- **XY pad** (the Ableton citation): puck mixes 4 corners **bilinearly** —
  interpolate ductus vectors; per-cell glyph sourcing is a weighted draw
  across the four palettes; per-cell noise so transitions **shimmer** rather
  than dissolve uniformly. PHASE wobbles the puck's *effective* position
  per-cell.
- **Corner swap crossfades over ~2s** rather than snapping — swaps are
  performable moves, not menu operations.
- **Kit** = 4 corners + effect states + definition + seed → URL-encoded. The
  kit is the patch file; the URL is the patch file format.
- **Cut-up engine** (inside the mixer): splice-gap insertion and density-
  collapse rhythm between sourced fragments — the "third border" that emerges
  *between* materials. Splice points are seeded (Directive 1).
- Corruption aesthetics (mojibake, zalgo-burial, cut-up-splice, redaction) are
  ordinary library citizens: put REDACTION on a corner and **dragging toward
  it IS degradation** — loss is positional and chosen, not infrastructural.

## 11. Selection & Sections ("like a text editor DUH")

- **Selectors:** linear (text-editor drag over grid ranges) ships v1;
  shape (rect/ellipse) and lasso (arbitrary cell mask) ship v2 with brushes
  (same hit-testing).
- On selection, two verbs:
  1. **Apply once** — redact (chunky `██▓` block-out), mistranscode
     (deterministic corruptions: RTF guts `\f0\fs24\cf0`, `&nbsp;%20&amp;`,
     mojibake `Ã© â€™ ï»¿`, UTF-8-read-as-Latin-1 — real encoding math, not
     vibes), invert, posterize, or fill-with-aesthetic.
  2. **Spawn a controller** — a floating single-axis slider (one aesthetic,
     intensity up) pinned to the selection, expandable to a **mini-XY**
     (four corners scoped to just those cells). As far as we know, no text
     tool does *select text, spawn a mixer on it*. Build it like you know that.
- **A selection with a controller pinned to it IS a section.** `persistSection`
  freezes the mask + kit + controller state. Sections are persisted selections
  of any shape (v1: rectangular ranges; shaped sections arrive with shaped
  selectors). Pages are just the default section. One concept, not two.
- Translation transforms (Spanish/Klingon/register-shift) are **[TABLED]** —
  see §19. Their *fakes* are v1-legal: register-shift as lookup table
  (`"lit"→"aligned"`, `"no cap"→"transparently"`) and AI-voice as shredded
  corpus phrases are deterministic, local, flutter-compatible, and arguably
  better portraits of register-laundering than the real thing.

## 12. URLs, Sharing, Freeze, Print

| Param | Meaning |
|---|---|
| `?k=` | kit (compressed: corners-by-id-or-inline + effects + definition + seed) |
| `?a=` | a full aesthetic inline (ductus-as-URL; §7.2 size discipline) |
| `?mode=` | `view` (replay instantly to end) · `replay` (Procreate-style playback) · `edit` (replay then append) |
| `?at=` | op index to stop at. `?at=340&mode=edit` **is fork-at-frame** |
| `?f=` | frame index for mid-flutter freeze (PHASE determinism, §4.3) |

- **FREEZE** = snapshot current state → static DOM + print stylesheet
  (`@page` margins honoring `physical` definition) → CMD+P works; also yields
  a share-URL of the exact moment. Freeze is both a print path and a "keep
  this flutter-frame" gesture.
- Web2Print beyond print-CSS (paged.js imposition, server PDF, riso
  spot-black for redaction fields) is v2.5+.
- v1 documents are **fully URL-native** (ops fit in fragment for modest docs;
  else the .gbbl file travels). v2 stroke data breaks URL-completeness →
  small state blob, but v1 stays pure. Very web1 of us. Keep it.

## 13. Export / IO

| Format | Era | Notes |
|---|---|---|
| Plain UTF-8 | v1 | The DOM `<pre>` mirror is source of truth. Round-trips free with asciiflow / Monodraw / textik. |
| ANSI + **SAUCE** | v2 | Color brushes serialize to SGR; SAUCE metadata record written → legitimate citizenship in PabloDraw / Moebius / 16colo.rs scene. Rainbow brush gets an ANSI-256-quantized mode. |
| REXPaint `.xp` | v2, maybe | Layered, documented; maps to brush layers. |
| **svgbob / ditaa misuse pipeline** | v2 | "EXPORT VIA SVGBOB": feed detritus to diagram parsers and let them **hallucinate structure** — confident SVG misreadings of noise, then print huge. A legibility-machine performing its need to find diagrams. Costs ~nothing (svgbob has WASM). The most on-brand export in the spec. |
| Freeze/print CSS | v1 | §12. |
| `.gbbl` | v1 | §4.2. |

## 14. Hidden Layers

### 14.1 Provenance channel (v1)

Under every cell: which aesthetic inked it, which op, lineage pointers.
Rich-text formatting where the formatting is *ancestry* — crumple logic
per-character. Feeds distillation (§7.5), makes forking honest, and powers a
future **inspector**: hover a cell, core-sample its genealogy. Never exported
in plain text (except via §14.2, opt-in).

### 14.2 The cootie (v3): stego as author's mark

Zero-width Unicode (ZWJ, variation selectors, ZWNBSP) threaded through
plain-text exports — invisible, survives copy-paste, strips harmlessly.
Reframed from "secret channel" to the **clipboard-cootie**: the news-site
copy-hijack gesture ("Read more at…") made invisible and made yours. Paste a
gubble border into an email; it silently carries `— Jon Satrom, <URL>`.

- **Per-document setting via a `sign` op. DEFAULT OFF until signed** — like
  signing a print, not like surveillance. ("Your document narcs on its process
  unless you opt out" was considered and rejected.)
- Payload options: attribution string · kit-URL · statement · all three.

## 15. The Commons (optional, always optional)

- One registry, two tables: **aesthetic index** + **fork registry**.
  Documents/aesthetics are sovereign via URL whether or not they ever report
  in. Unregistered forks are simply **dark forks** — unlisted, fine, privacy.
- **Ancestor-walk** (v2) is free — lineage pointers go up with no
  infrastructure. **Descendant browsing** needs the reverse index (v3):
  playback reaches op 340, pauses, branches shimmer — *three makers diverged
  here, follow which?* That's the **mouvance view**. Choose-your-own-adventure
  across the variant swarm.
- **Forking is the governance model.** Names non-unique, IDs unique, lineage
  visible; disputes resolve by provenance-display, not namespace policing.
- **Moderation: a floor, not a taste regime.** Slur/CSAM-floor removal +
  report button. No aesthetic gatekeeping.
- **⚠ hazard tags:** auto-detected for troublemaker codepoints (RTL-override,
  zero-width floods, layout-breakers) — hazard as a *labeled genre*. Someone
  will contribute an aesthetic that breaks the tool's own UI, and that's
  on-brand; users get informed consent instead of a bouncer.

## 16. Version Ledger

| Era | Contents |
|---|---|
| **v1** | `gubble compile` CLI (M0) · event-log document + seeded PRNG · GRID + FLOW (Pretext) · definition controls · page/fill · kits + XY pad + rail · effects at page/section scope (density, grain, phase, drip, jitter, symmetry, blur/filters) · linear selection + applyOnce + spawn-controller · sections-as-persisted-selections · census-distill in-app · provenance channel · image luminance + k-means color census · URLs (`k/a/mode/at/f`) · freeze/print CSS · plain-text + .gbbl export |
| **v2** | brushes (= stroke scope; clone, eraser, min/max, color solid/rainbow/random, drip, redaction, mistranscode, pencil-one-glyph-at-a-time; REXPaint-style palette-grid + keyboard glyph picker as UI reference) · lasso/shape selectors + shaped sections · playback UI (timelapse, scrub-as-instrument) · ancestor-walk display · ANSI+SAUCE · svgbob misuse pipeline · LLM-distill (faithful↔interpreted) · `noiseCharacter` effect param (white/blue/coherent spatial distribution of hash draws — the aesthetic layer above the PRNG, §4.3) · maybe .xp |
| **v2.5** | paged.js / Web2Print proper · 3D vector-point Venn interface for n-way aesthetic relationships (Jon's note: the aesthetic-libraries-as-points-in-vectorspace idea) |
| **v3** | inline images with contour flow (Pretext rich-inline + alpha-contour scanline exclusions; default size ≈ one letter; scale/rotate; drag-with-realtime-reflow; adjustable padding radius; non-square shapes via contour trace) · the cootie (§14.2) · commons fork-registry + mouvance view · grafting (v3/v4) · alternate/swappable `measure` width tables as material (⚠-tagged; ferally-measured exports shear in other people's terminals — degradation-in-transit, consent-labeled per §15.3) |
| **v4** | async/LLM brushes for real (per-stroke, darkroom-develop latency as material) · "faking→real" refinements · whatever the fakes turned out to be worse at, if anything |

## 17. Build Order (v1 milestones)

- **M0 — the CLI.** `gubble compile` + folder format + calibration fixtures +
  ≥3 example folders compiled to arguable ductuses. *Jon starts feeding
  middens immediately; studio and dev run parallel.*
- **M1 — core.** PRNG, event log + replay, cell buffer with full width math
  (grapheme clustering, EAW, zero-width attachment). Property tests: replay
  determinism; census-gradient calibration; emoji/ZWJ width table.
- **M2 — GRID + mixer.** Canvas render + `<pre>` mirror, fill, kits, XY pad,
  rail, density/grain/phase live. *First moment the instrument makes sound.*
- **M3 — FLOW.** Pretext integration, vw re-wrap, cursor displacer,
  definition controls incl. the inverse-locked size/chars slider.
- **M4 — selection.** Linear select, applyOnce verbs, spawn-controller,
  persistSection.
- **M5 — share.** URL params, freeze/print CSS, .gbbl read/write.
- **M6 — sediment.** Provenance channel, in-app distill panel, polish,
  hazard detection, ship.

## 18. Tech Stack **[ASSUMED]**

TypeScript everywhere. Vite. **No framework for the canvas core** (gubble-core
is vanilla TS); UI chrome may use Preact/vanilla — implementer's choice, but
the instrument should feel close-to-metal, not ceremonial. Canvas2D for GRID,
`@chenglou/pretext` + Canvas for FLOW. `sfc32` PRNG. Node CLI sharing
gubble-core. Deploys static (Railway-friendly); the commons, when it exists,
is a separate tiny service and NOT a v1 dependency.

## 19. ASSUMED / VETO LIST + the BUG-JON LEDGER

**Awaiting Jon's veto or blessing:**
1. `.gbbl` extension (§4.2) — alternatives: `.gubble`, `.skpg`-cousin naming.
2. specimen.txt two-sweep format (§7.4).
3. Tech stack details (§18).
4. Kit URL param letters (`k/a/mode/at/f`) — bikesheddable.

**Placed defaults from the M0 build (2026-07-15) — working now, veto-able
always:**
5. Ductus `id` is content-derived (FNV-1a over canonical palette+vector):
   same midden recompiled → same id; renaming does not re-identify.
6. `corpus.txt` is treated as non-publishing material (gitignored along
   with `sources/`) per the strict Directive 6 leave-list reading. Its
   phrases travel inside the compiled ductus; the raw file stays home.
7. Caps: 40 phrases / 24 palette glyphs by default (`--max-phrases`,
   `--max-glyphs`). Oversized ductus (>2KB) warns loudly, never
   auto-truncates — the compiler proposes, the author disposes.
8. Empty midden = compile error, not a null ductus.
9. `gubble link` origin is a placeholder (`gubble.example`) until the
   app exists somewhere real; the payload after `#a=` is the artifact.
10. Sources feed the census; corpus feeds phrases. They only cross when
    sources/ is empty (corpus becomes fallback census material).
11. Image census (luminance + chroma, §7.3) deferred within v1 — the CLI
    warns when it finds images rather than skipping silently.
12. Census `jitter` is measured as run-choppiness (fraction of
    single-glyph runs). BUG-JON: does that match what your hand means by
    jitter? 🪲

**TABLED — but I was instructed to keep bugging Jon, so, Jon: 👋**
- **Async/LLM brushes** (translate: Spanish, Klingon, millennial→corporate).
  Per-stroke async, never per-frame; region greys out and the transform
  *develops in* like a darkroom print — latency as material. The open
  questions when we return: BYOK vs hosted, caching strategy, and whether the
  deterministic fakes (§11) turn out to be the better artwork. Revisit at v4
  planning. This bullet is the bug. It will reappear. 🪲

**RATIFIED — 2026-07-15, via interview (the hash-function and width-table
questions, asked properly instead of bikeshedding them):**
- PRNG: `sfc32`, state expanded from seed via `splitmix32`, named in-header
  as `rng` (§4.1, §4.3).
- Hash: `FNV-1a` — zero-dep, embeddable, honors "framework-free" (§4.3).
- Unicode width source: vendored frozen snapshot, never a live dependency,
  named in-header as `measure` (§4.1, §5.1). This one wasn't a bikeshed —
  an un-pinned table is a real, quiet Directive 1 leak.
- Both `rng` and `measure` are declared, versioned document properties, not
  silent bedrock. The ruling that produced this: determinism isn't a ban on
  accidents, it's the preservation medium for them — so name everything the
  preservation depends on.

## 20. Lineage (cite in README; theory is load-bearing, not ornamental)

P.K. Dick (*kipple*, Androids; **gubble**, Martian Time-Slip — the name is a
found object: the exact lexical artifact where the project's two source
metaphors met in 1964) · Paul Zumthor (*mouvance*) · asemic writing (*ductus*)
· zaum / Khlebnikov & Kruchenykh (respectful citation, name deliberately not
taken) · Burroughs/Gysin cut-up · type specimen sheets · ANSI/textmode scene
(PabloDraw, Moebius, REXPaint, 16colo.rs, SAUCE) · CARI + Aesthetics Wiki
(named-aesthetic-plus-example as community practice) · Deluxe Paint / MacPaint
/ HyperCard (make marks, keep the ones you like) · Ableton XY macro control ·
Cheng Lou's Pretext · news-site clipboard hijacking (the cootie's disreputable
ancestor) · Jon's own stack: KippleCore crumples (provenance channel),
KIPPLE/STICKER desync (PHASE), facsimile.gallery (degradation-in-transit,
and the anti-provenance argument that killed the LEGIBILITY master).

---

## Appendix A — Seed Glyph Pools (from the founding thread)

Starter middens; each family is a candidate `/aesthetics/` folder. Jon authors
the canonical ones (studio session, separate from this spec):

- **gradient-blocks:** `█▓▒░ ▁▂▃▄▅▆▇█ ▖▗▘▙▚▛▜▝▞▟`
- **box-rule:** `═╬╍━┄╭╮ ◢◤◥◣`
- **braille-static:** `⣿⣷⣶⣤⣀⡀⠁⠄` (screen-reader-hostile; candidate first ⚠)
- **myspace-swirl:** ``¤ø,¸¸,ø¤º°`°º¤`` (yes, it contains a live grave
  accent — the palette bites its own delimiter; fitting)
- **soft-kawaii:** `˚₊‧ ୨ৎ ⋆ ꒰꒱ ・:*:・゚✭`
- **wave:** `~^ ∿ ≋ ⟅⟆`
- **rain/specks:** `∴∵ ⛆ · .`
- **emoji-anchors:** `📠 🗑️ 💾 🌊 🪱 ⛆ ✂` (the fax machine is non-negotiable)
- **zalgo-marks:** combining-mark stacks; the orphaned ` ̷` on a bare space
- **hairline-min:** `U+200A`, `▏`, lone `⠁`, one hesitation per line
- **corruption family (corpus-bearing):** mojibake / RTF-guts / AI-voice
  phrases ("Great question!", "it's not X, it's Y", "want me to—") /
  register-shift lookup pairs / spam

## Appendix B — House Voice for Comments & READMEs (ratified requirement)

Playfully verbose. Explain the *why*, embed the argument, keep the jokes
structural. Reference calibrations:

```ts
// The puck does not "select" an aesthetic. The puck LEANS.
// Bilinear weights across four corners; nobody wins, everybody bleeds
// into everybody. Per-cell noise keeps the crossfade shimmering —
// a uniform dissolve would imply the mix has an opinion. It doesn't.
// It has a position.
```

```ts
// Why hash(opSeed ‖ cellIndex ‖ frameIndex) and not Date.now():
// because a URL must be able to freeze a shimmer MID-SHIMMER.
// Wall-clock time is for playback pacing only. Time, in gubble,
// is just another integer we can point at.
```

```ts
// This function deliberately mis-measures cell width by ±1.
// It is not a bug. It is a slider called "more broken."
// (The actual bugs are elsewhere and less charming.)
```

*— end of spec. gubble gubble. —*
