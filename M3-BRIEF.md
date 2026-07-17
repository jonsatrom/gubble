# M3 BRIEF — FLOW (written 2026-07-17, at the end of the M2 session)

Handoff notes so the M3 session starts hot instead of re-deriving. Read
this + spec §5.2 (FLOW), §6 (definition controls), §17 (M3 line) and
you have the whole picture.

## What M3 is

The second performance of the core buffer (§5: one buffer, two
performances). Proportional-font detritus — nearly unexplored territory,
where gubble stops inheriting ANSI-scene assumptions. Ships: Pretext
integration, live `vw` re-wrap, the cursor-as-displacer (text reflows
around the pointer in realtime), and the §6 definition controls
including the inverse-locked font-size ↔ char-count slider at `physical`
width (one slider moves both; the collision is the feature).

## Pretext recon (done — don't redo)

`@chenglou/pretext@0.0.8` is **installed and exact-pinned** in
@gubble/app. MIT, zero deps, actively maintained, browser-only today
("soon, server-side"). Canvas-measurement-based: **fonts must be loaded
before `prepare()`** (`document.fonts.load`, per spec §5.2's caveat —
this is real, not folklore).

The API surface that matters for us:

- `prepare(text, font)` → opaque handle; `layout(prepared, width,
  lineHeight)` → `{height, lineCount}`. Cheap hot path (~0.0002ms/call
  per spec; safe at 60fps). NEVER re-prepare on resize — only re-layout.
- `prepareWithSegments` + `layoutWithLines(prepared, width, lineHeight)`
  → actual line strings for `ctx.fillText` — **this is FLOW's render
  path.**
- `layoutNextLineRange(prepared, cursor, width)` +
  `materializeLineRange` — route text ONE LINE AT A TIME with a
  different width per line. The README's own example is flowing around
  a floated image. **This is the cursor-displacer mechanism**: compute
  each line's available width from the cursor's exclusion zone, feed it
  per-line. (True both-sides-of-an-obstacle flow needs two ranges per
  row — the /demos have scanline-exclusion examples; start with the
  simpler margin-push version and see if it's enough performance-wise
  and aesthetically.)
- `{ whiteSpace: 'pre-wrap' }` option keeps spaces/tabs/hard-breaks
  visible — relevant for a grid-faithful FLOW mode.
- `@chenglou/pretext/rich-inline` subpath: per-run fonts inline
  (`prepareRichInline([{text, font}, …])`). See open question 2 — this
  might be the most gubble-native thing in the whole library.
- Also ships `bidi.js` (RTL — remember our hazard corpus) and
  `rich-inline` is the v3 inline-images route (§16).

## Design positions (held, veto-able)

- **FLOW performs the stream, not the grid.** In `vw` regime the
  document's glyph sequence re-wraps live at viewport width — reading
  the buffer as a continuous stream (provenance preserved per glyph).
  `chars` regime = FLOW honors the grid's hard line breaks
  (`pre-wrap`). This is what makes FLOW a *performance* rather than a
  scaled screenshot of GRID.
- **The cursor displacer is ephemeral** — never logged, never in the
  ops, pure live-performance surface. Same class as puck-drag preview.
- **Definition compiles down**: §6's three regimes live at app level;
  core's `GridDefinition {cols, rows}` stays dumb. `physical` needs a
  px-per-mm assumption + print CSS — that part can land with M5's
  freeze/print rather than blocking M3.

## Open questions for Jon (chew before next session)

1. **What does FLOW re-wrap?** The held position above says: the glyph
   stream in reading order. But a gubble page is a FIELD, not prose —
   is reading-order streaming the right violence to do to it? (It
   might be *exactly* the right violence: re-wrap as deliberate
   misreading. Or FLOW documents might want to be composed AS streams
   from the start. Both defensible; pick a first move.)
2. **fontHints and provenance.** myspace-swirl carries Comic Sans MS
   in `flow.fontHints`. With `rich-inline`, FLOW could set each
   glyph's font from its provenance — cow-cells in one face,
   swirl-cells in Comic Sans, per-cell typographic ancestry. Or:
   whole-page font from the dominant corner (calmer, faster). The
   per-provenance version is more gubble; the whole-page version ships
   sooner. Which first?
3. **Layout in the app**: GRID/FLOW as a toggle over the same stage, or
   side-by-side panes (see the same document performed both ways at
   once)? Side-by-side is a better argument; toggle is less chrome.

## Practical checklist for the M3 session

- [ ] `document.fonts.load("16px Comic Sans MS")` etc. BEFORE prepare —
      wire a font-loading gate into app boot.
- [ ] FLOW canvas alongside GRID's (new render module in app; core
      untouched — FLOW is presentation, the buffer already knows
      everything).
- [ ] Definition controls UI: regime picker + the inverse-locked slider
      (chars regime first; vw next; physical stub → M5).
- [ ] Cursor displacer via per-line width routing (start margin-push,
      consider scanline exclusions after).
- [ ] Watch bidi: our hazard corpus (RTL overrides) will meet Pretext's
      bidi handling — informed-consent territory, test with cultcow.
- [ ] The M2 session ended with 95/95 core tests + clean app typecheck.
      `npm test` before starting; if red, someone else was here.

## Where everything lives (2026-07-17)

Repo: github.com/jonsatrom/gubble · main @ e5944d5 · all milestones
M0/M1/M2 complete. App: `npm run dev --workspace=@gubble/app` (or the
Browser-pane launch config, port 5199 — pins nvm Node 20). CLI:
`./gubble` from repo root. Tests: `npm test`. Feeding manual:
FEEDING.md. The contract: GUBBLE-SPEC.md. Session captures: captures/
(local only).
