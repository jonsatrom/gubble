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

This is an M0-stage repo. Read the spec's §17 Build Order before assuming
anything below is further along than it looks:

```
gubble/
  packages/
    core/    @gubble/core   — framework-free TS. PRNG (sfc32, ratified
                               §4.3), hash (FNV-1a, ratified §4.3), seed
                               minting, and cell-width math (§5.1 — EAW +
                               emoji presentation against a vendored,
                               frozen Unicode 16.0 snapshot, `measure:
                               "eaw-16.0/g1"`) are DONE and tested, 40/40.
                               KNOWN GAP, documented in width.ts: grapheme
                               CLUSTER BOUNDARIES still come from the host
                               engine's Intl.Segmenter/ICU, which isn't
                               vendored or versioned by us — a real,
                               unclosed Directive 1 crack, not pretended
                               away. Event log, cell buffer, census still
                               not written. Don't assume anything exists;
                               check src/.
    cli/     @gubble/cli    — the M0 deliverable per spec §8. Package
                               shape exists; `gubble compile` itself is
                               not implemented (it needs census.ts, which
                               needs the event log, which needs width.ts —
                               see the dependency chain in §3's diagram).
    app/     @gubble/app    — placeholder only. Arrives at M2. See its
                               own README for why that's not a bug.
  aesthetics/                — empty. This is where middens go once Jon
                               starts feeding them (sources/ folders are
                               gitignored — Prime Directive 6, they never
                               publish and they don't get committed either).
  calibration/                — empty. Gradient test fixtures per §8, not
                               built yet.
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
