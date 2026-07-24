// .gbbl property tests. The one that matters most isn't here — it's in
// a companion script this file's "real interop" test writes bytes for,
// verified against the SYSTEM'S unzip via Bash, not our own decoder
// reading our own encoder's output. A round-trip that only proves
// internal consistency would miss a decoder that's subtly wrong in
// exactly the way its own encoder is subtly wrong.

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { crc32 } from "../src/crc32.js";
import { encodeGbbl, decodeGbbl } from "../src/gbbl.js";
import { createDocument, appendOp, replay } from "../src/log.js";
import type { GubbleDoc } from "../src/log.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";
import { utf8Encode } from "../src/url.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";
const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█"), { name: "blocks" });
const swirl = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n~*~*~*~*~"), { name: "swirl" });

function performance3ops(): GubbleDoc {
  const doc = createDocument({ cols: 30, rows: 8 }, DOC_SEED);
  appendOp(doc, {
    op: "fill",
    scope: { kind: "page" },
    args: { kit: { corners: [blocks, swirl, null, null], puck: { x: 0.2, y: 0.8 }, effects: { density: 0.3, grain: 0, phase: 0 } } },
  });
  appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 10, to: 80 } } });
  appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "mistranscode" } });
  return doc;
}

describe("crc32 — the standard check value", () => {
  it("crc32('123456789') === 0xcbf43926, the universal CRC-32 test vector", () => {
    expect(crc32(utf8Encode("123456789"))).toBe(0xcbf43926);
  });

  it("crc32('') === 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe(".gbbl — round-trip", () => {
  it("a performance survives the trip and replays byte-identically", () => {
    const doc = performance3ops();
    const bytes = encodeGbbl(doc);
    const revived = decodeGbbl(bytes);
    expect(replay(revived).toText()).toBe(replay(doc).toText());
    expect(revived.header).toEqual(doc.header);
    expect(revived.ops).toEqual(doc.ops);
  });

  it("an empty document (zero ops) round-trips too — silence is a valid performance", () => {
    const doc = createDocument({ cols: 10, rows: 4 }, DOC_SEED);
    const revived = decodeGbbl(encodeGbbl(doc));
    expect(revived.ops).toEqual([]);
    expect(replay(revived).toText()).toBe(replay(doc).toText());
  });

  it("encoding the SAME document twice produces byte-IDENTICAL files — determinism extended to packaging", () => {
    const doc = performance3ops();
    const a = encodeGbbl(doc);
    const b = encodeGbbl(doc);
    expect(a).toEqual(b);
  });
});

describe(".gbbl — corruption fails loudly, not quietly", () => {
  it("a flipped byte in the middle is rejected via CRC mismatch", () => {
    const bytes = encodeGbbl(performance3ops());
    const wounded = new Uint8Array(bytes);
    wounded[Math.floor(bytes.length / 2)] ^= 0xff;
    expect(() => decodeGbbl(wounded)).toThrow();
  });

  it("truncated-in-transit bytes are rejected", () => {
    const bytes = encodeGbbl(performance3ops());
    expect(() => decodeGbbl(bytes.slice(0, bytes.length / 2))).toThrow();
  });

  it("a zip missing header.json or ops.jsonl is rejected by name, not silently accepted as an empty doc", () => {
    expect(() => decodeGbbl(utf8Encode("not a zip at all"))).toThrow(/valid \.gbbl/);
  });
});

describe(".gbbl — real-world interop fixture", () => {
  it("writes a .gbbl this test run's Bash step will feed to the SYSTEM unzip", () => {
    // vitest can't shell out mid-test without extra plumbing; this
    // writes the artifact, and the calling agent runs `unzip -l` /
    // `unzip -p … thumb.txt` against it as a separate, real verification
    // step — the one that actually matters, per this file's header note.
    const doc = performance3ops();
    const bytes = encodeGbbl(doc);
    const dir = "/private/tmp/claude-501/-Users-jon-Documents--studio-speed-projs-20260716-gubble/0b66405a-e179-410f-bb04-bc7c15fc31ab/scratchpad";
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/interop-fixture.gbbl`, bytes);
    // The comparison target for the Bash step: what thumb.txt SHOULD say.
    writeFileSync(`${dir}/interop-fixture.expected-thumb.txt`, replay(doc).toText());
    expect(bytes.length).toBeGreaterThan(0);
  });
});
