# @gubble/app — the instrument

This package was a placeholder until M2; it is now the instrument
itself. If this README ever claims the package is empty again, that is
drift, and drift in a project about provenance is a bug with a moral
dimension. Current factual state lives in the root README's ledger.

What's here: GRID (canvas + `<pre>` mirror as the copy source of
truth) · FLOW (Pretext, vw/chars regimes, cursor displacer) · the XY
mixer with self-labeling rail chips and per-cell crossfades ·
density/grain/phase live · drag-select + applyOnce verbs + spawnable
selection controllers · STRATA age-tint view · share/load for
aesthetics (?a=), kits (?k=), and whole documents (?g=, with at/f/mode)
· fork-on-first-touch lineage for arrived documents · FREEZE (stamp
the moment, mint its URL, print).

Run it: `npm run dev --workspace=@gubble/app` (Node 20 — `nvm use`).

Structural honesty note: `src/main.ts` currently holds nearly all of
this — document lifecycle, two renderers, gestures, arrivals, and
controllers in one file. It works and it's tested at the seams, but it
is overdue for decomposition along the project's own concepts
(document/history · performances · gestures · arrivals · inspectors).
That's queued work, not a hidden virtue.
