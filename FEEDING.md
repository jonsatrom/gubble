# FEEDING.md — how to feed middens to gubble

This is the operator's manual for Phase Zero: you dump material into
folders, the compiler censuses it into a ductus (the aesthetic's compiled
signature) and a specimen (its demo page), and the seed library grows
while the instrument itself is still being built. Studio and dev run
parallel — that was the whole point of shipping the CLI first (§8).

## 0. One-time setup

```bash
cd ~/Documents/_studio/speed_projs/20260716-gubble
nvm use          # reads .nvmrc → Node 20. IMPORTANT: your default is
                 # Node 16, which is EOL and lacks things we use.
npm install      # once, and again if package.json ever changes
npm run build    # compiles core + cli
```

**The Node thing, solved:** every `./gubble …` command below runs
through a launcher script that finds Node 20 on its own (your current
one if it's new enough, else nvm's copy) — so for CLI use you can
forget `nvm use` exists. You still need it for `npm install` / `npm
run build` / `npm test`, which use whatever node your shell has. If
you run the CLI raw with old Node anyway, it now tells you exactly
what's wrong instead of muttering "crypto is not defined".

Sanity check — run the whole test suite (81 tests: determinism, width
math, census calibration, specimen sweeps, URL round-trips, event-log
replay):

```bash
npm test
```

Green means the rulers and dice are honest. If anything's red after a
fresh pull, that's a bug worth reporting loudly.

## 1. Compile the two examples that already exist

```bash
./gubble compile aesthetics/gradient-blocks
./gubble compile aesthetics/myspace-swirl
```

(`npx gubble compile …` also works if npm linked the bin during install;
the `./gubble` form always works. Pick whichever
your fingers like.)

Each compile prints the vector — density, whitespace, symmetry,
run-length, drip, jitter, emojiRatio, stackDepth, grain proposal — and
writes two files into the folder:

- `ductus.json` — the aesthetic itself. Small on purpose (<~2KB): it has
  to fit in a URL. That constraint is the platform-independence guarantee.
- `specimen.txt` — the demo page. **Look at it in a monospace context**
  (editor, terminal: `cat aesthetics/myspace-swirl/specimen.txt`). Two
  sweeps: maximal→minimal top-to-bottom; if the folder has a corpus,
  legible→shredded left-to-right.

The exit criterion for this whole milestone was "a ductus + specimen
worth arguing with." So: argue. If gradient-blocks feels too symmetric
or the swirl's specimen too sparse, that's a calibration conversation —
the ink-weight table in `packages/core/src/ramp.ts` and the sweep
formulas in `specimen.ts` are the argument's venue.

## 2. Make your own aesthetic (the actual point)

```bash
mkdir -p aesthetics/YOUR-NAME/sources
```

Then feed it:

1. **`sources/`** — the midden. Dump `.txt` / `.md` scraps: found
   fragments, pasted chat detritus, old ASCII art, whatever. The
   compiler reads text today (images are censused starting next pass —
   it'll warn, not choke, if it finds them). More material = better
   statistics. Weirder material = weirder statistics. Both are correct.

2. **`corpus.txt`** (optional) — legible language, one phrase per line:
   spam subject lines, AI-voice tics, theory fragments, era-speak. This
   is what the specimen shreds left-to-right and what `phrases[]`
   carries into the ductus.

3. **`manifest.yml`** (optional but recommended) — your authorial layer:

   ```yaml
   name: your-aesthetic-name
   version: 0.1.0
   author: jon
   kin: [tag, another-tag]
   grainAffinity: poster        # poster | texture | both — YOUR call;
                                # omit and the compiler proposes one
   fontHints: [Comic Sans MS, cursive]
   swatches: ["#ff9de2", "#c8f7ff"]
   hazard: false                # you can claim hazard; you can't hide it
   ```

Then:

```bash
./gubble compile aesthetics/YOUR-NAME
```

Or leave it running while you feed the midden — recompiles on every
change, the ductus drifts as the material grows:

```bash
./gubble compile aesthetics/YOUR-NAME --watch
```

## 3. The other three verbs

```bash
# raw stats, no writes — census any file or folder (calibration use):
./gubble census calibration/density-sweep-lr.txt

# re-render a specimen at other dimensions / re-voiced grain (§6):
./gubble specimen aesthetics/YOUR-NAME/ductus.json --width 132 --grain texture

# the aesthetic-as-URL — the whole ductus, compressed into a link:
./gubble link aesthetics/YOUR-NAME/ductus.json
```

## 3½. The mixer (M2 — the instrument's first sound)

```bash
# 2–4 corners, one puck. Corner order: a=top-left, b=top-right,
# c=bottom-left, d=bottom-right. The puck LEANS; everybody bleeds:
./gubble mix aesthetics/cultcow/ductus.json aesthetics/myspace-swirl/ductus.json \
  aesthetics/gradient-blocks/ductus.json --puck 0.3,0.8 --seed m00f

# effects, live at page scope (§9): density gain, grain re-voice, phase:
./gubble mix aesthetics/cultcow/ductus.json aesthetics/gradient-blocks/ductus.json \
  --puck 0.5,0.5 --density -0.6 --phase 0.7 --frame 42
# ...then change ONLY --frame: the fluttering cells move, the stable
# ones hold. --phase 0 makes --frame irrelevant. That's §4.3 working.

# the whole patch as a URL (§10: the kit IS the patch file):
./gubble mix a.json b.json --puck 0.2,0.9 --link
```

## 4. Things worth knowing before they surprise you

- **Your middens are NOT in git.** `sources/` and `corpus.txt` are
  gitignored per Prime Directive 6 — only `ductus.json`, `specimen.txt`,
  and `manifest.yml` leave a folder. Consequence: your raw material
  lives only on this machine. **Back it up privately if you care about
  it.** (This is a placed default on the §19 veto list — say the word
  and it changes.)
- **Same midden, same everything.** Recompiling unchanged material
  produces a byte-identical ductus, id, and specimen. The aesthetic only
  drifts when the material does. If you see drift without change, that's
  a Directive 1 violation — report it like a fire.
- **The id is content-derived.** Renaming an aesthetic in manifest.yml
  does not re-identify it; changing its material does.
- **Hazard is one-way.** The census ORs its detection (RTL overrides,
  zero-width floods) into whatever the manifest claims. You can label
  yourself hazardous as a genre move; you can't launder actual
  troublemaker codepoints (§15.3 — informed consent, not sanitization).
- **The 2KB warning is advice, not enforcement.** An oversized ductus
  compiles fine and warns loudly. Trimming is your decision.
- **Phrase cap: 40** (`--max-phrases` to change), glyph cap: 24
  (`--max-glyphs`). Both exist to keep the URL discipline honest.

## 5. Checking the work (yours, mine, anyone's)

Four layers, cheapest first:

```bash
# what changed lately, and in which files:
git log --oneline -8
git show --stat HEAD          # last commit's file list
git show HEAD                 # the full diff, if you want the code

# the proofs — every property the Prime Directives depend on:
npm test                      # 81 tests; red = something sacred broke

# touch the event log yourself (M1 made visible):
./gubble fill aesthetics/cultcow/ductus.json --seed cafef00d
# run it TWICE with the same --seed and diff — determinism, observable:
./gubble fill aesthetics/cultcow/ductus.json --seed abc > /tmp/a.txt
./gubble fill aesthetics/cultcow/ductus.json --seed abc > /tmp/b.txt
diff /tmp/a.txt /tmp/b.txt    # empty output = the promise holds

# undo-as-log-truncation, demonstrated live:
./gubble fill aesthetics/cultcow/ductus.json --undo
```

And squint at actual output. The first time a human pointed `gubble
fill` at a page and looked (2026-07-15), they caught a real defect the
test suite had missed: raw FNV-1a correlating adjacent cells into
row-banded fills. The fix is versioned as derivation chain `sfc32/2`,
the war story lives in `packages/core/src/hash.ts`, and a regression
test now stands guard. Eyeballs are a calibration instrument. Use them.

## 6. Beyond the CLI

The CLI is no longer the whole instrument — the app exists (`npm run
dev --workspace=@gubble/app`): GRID + FLOW, the XY mixer, selection
verbs, controllers, document URLs, FREEZE. This manual stays scoped to
the CLI/feeding workflow; **the root README's LEDGER is the single
factual account of what's alive, partial, and absent.** If this file
and the ledger disagree, trust the ledger and file a complaint against
this file.

gubble gubble.
