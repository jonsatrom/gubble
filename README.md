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

## Where things actually are, honestly, today

**M0 is REACHED**: `gubble compile` runs, two example aesthetics are
compiled, and the seed library is open for feeding. **The operator's
manual is [FEEDING.md](./FEEDING.md)** — start there if you came to make
aesthetics rather than read architecture.

```
gubble/
  packages/
    core/    @gubble/core   — framework-free TS, all tested (66/66):
                               PRNG (sfc32) · hash (FNV-1a) · seed
                               minting · cell-width math over a vendored
                               frozen Unicode 16.0 snapshot (`measure:
                               "eaw-16.0/g1"`, now incl. combining-mark
                               ranges for zalgo stack-depth) · ink-weight
                               ramp · the census (§7.3) · ductus build +
                               content-derived ids (§7.2) · two-sweep
                               specimen renderer (§7.4) · aesthetic-as-URL
                               deflate encoding (§12).
                               KNOWN GAP, documented in width.ts: grapheme
                               CLUSTER BOUNDARIES still come from the host
                               engine's Intl.Segmenter/ICU — a real,
                               unclosed Directive 1 crack, not pretended
                               away.
                               NOT YET: event log/replay (M1), cell
                               buffer, image census.
    cli/     @gubble/cli    — LIVE. compile (+ --watch) / census /
                               specimen / link, zero deps beyond core +
                               node builtins. See FEEDING.md.
    app/     @gubble/app    — placeholder only. Arrives at M2. See its
                               own README for why that's not a bug.
  aesthetics/                — two compiled examples: gradient-blocks
                               (the ramp promoted to aesthetic) and
                               myspace-swirl (corpus-bearing, profile-core
                               lineage). NOTE: their sources/ and
                               corpus.txt live only on Jon's machine —
                               Directive 6 says only ductus + specimen +
                               manifest leave a folder, so that's all git
                               carries.
  calibration/                — density-sweep-lr.txt gradient fixture +
                               the discipline docs (§8).
  FEEDING.md                  — how to feed middens. The operator's manual.
  GUBBLE-SPEC.md              — the contract. Start here, always.
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
