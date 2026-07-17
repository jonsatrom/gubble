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

## Resolved 2026-07-17 (Jon's answers, between sessions)

1. **Stream vs. field wasn't actually a dilemma — it maps onto the
   regimes that already exist.** `chars`/`physical` are literally
   defined in §6 as "faithful to the text"/"faithful to the page" —
   that means FLOW keeps GRID's hard line breaks and re-renders them
   proportionally (`{whiteSpace: 'pre-wrap'}`). No streaming question
   there at all. `vw` is "the web one" — reflows live, which only
   means anything if the hard breaks are dropped and the buffer is
   read as one continuous stream that Pretext free-wraps. So: **stream
   behavior is `vw`-only**, grid-faithful pre-wrap everywhere else.
   Ships both, no new philosophy required.
2. **Fonts: ship the fast version, which is already the aesthetics
   version.** `ductus.json`'s `flow.fontHints` already exists
   (myspace-swirl carries `["Comic Sans MS", "cursive"]` today) — so
   "whole-page font from the dominant corner" (highest bilinear weight
   at render time) uses infrastructure that's already there. Zero new
   schema. Per-glyph fonts via `rich-inline` (cow-cells vs. swirl-cells
   in different faces, keyed by provenance) is the fast-follow
   experiment once FLOW has a pulse to play with — not a day-one
   commitment.
3. **Toggle first, but build it so side-by-side is a "draw twice" away.**
   Side-by-side is the more on-brand move long-term — it's a live
   demonstration of §5's actual thesis, one buffer performed two ways
   at once, updating together as the puck drags. But FLOW is about to
   be a brand-new renderer needing solo debugging (font-load races,
   Pretext quirks, bidi meeting the hazard corpus) — toggle keeps the
   surface small while that shakes out. Both views must read from
   identical buffer/kit state from the start so upgrading later costs
   nothing architecturally.

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
