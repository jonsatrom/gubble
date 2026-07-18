// Crossing tests: URL → decoded document → replay. The soul audit's
// charge was exact — the core math was proven while the promises lived
// untested at the seams. These tests hold the sentences to their
// literal reading: "the URL is the recording" means a document that
// round-trips a fragment must replay byte-identically; "fork-at-frame"
// means lineage, not just truncation; a malformed arrival must FAIL,
// audibly, not sanitize itself into something polite.

import { describe, expect, it } from "vitest";
import { encodeDocUrl, decodeDocUrl } from "../src/url.js";
import { createDocument, appendOp, truncate, forkDocument, replay } from "../src/log.js";
import type { GubbleDoc } from "../src/log.js";
import { censusText } from "../src/census.js";
import { buildDuctus } from "../src/ductus.js";

const DOC_SEED = "7f3a9c00112233445566778899aabbcc";
const blocks = buildDuctus(censusText("█▓▒░·█▓▒░·\n░▒▓█▓▒░▒▓█"), { name: "blocks" });

function performance3ops(): GubbleDoc {
  const doc = createDocument({ cols: 30, rows: 8 }, DOC_SEED);
  appendOp(doc, {
    op: "fill",
    scope: { kind: "page" },
    args: { kit: { corners: [blocks, null, null, null], puck: { x: 0.2, y: 0.8 }, effects: { density: 0.1, grain: 0, phase: 0.4 } } },
  });
  appendOp(doc, { op: "select", scope: { kind: "selection" }, args: { range: { from: 10, to: 80 } } });
  appendOp(doc, { op: "applyOnce", scope: { kind: "selection" }, args: { verb: "mistranscode" } });
  return doc;
}

describe("the URL is the recording — literally", () => {
  it("a document round-trips a fragment and replays byte-identically", async () => {
    const doc = performance3ops();
    const url = await encodeDocUrl(doc, { origin: "http://localhost:5199" });
    const decoded = await decodeDocUrl<GubbleDoc>(url);
    expect(replay(decoded.doc).toText()).toBe(replay(doc).toText());
    expect(decoded.doc.header).toEqual(doc.header); // rng + measure travel too
  });

  it("modifiers survive the trip: at, f, mode", async () => {
    const url = await encodeDocUrl(performance3ops(), { at: 2, frame: 777, mode: "view" });
    const decoded = await decodeDocUrl<GubbleDoc>(url);
    expect(decoded.at).toBe(2);
    expect(decoded.frame).toBe(777);
    expect(decoded.mode).toBe("view");
  });

  it("a frozen frame is a real address: same f, same shimmer, different f, different shimmer", async () => {
    const url = await encodeDocUrl(performance3ops(), { frame: 777 });
    const { doc } = await decodeDocUrl<GubbleDoc>(url);
    expect(replay(doc, { frame: 777 }).toText()).toBe(replay(doc, { frame: 777 }).toText());
    expect(replay(doc, { frame: 777 }).toText()).not.toBe(replay(doc, { frame: 778 }).toText());
  });
});

describe("arrivals that should fail, failing audibly", () => {
  it("a URL with no document payload throws, names the problem", async () => {
    await expect(decodeDocUrl("http://localhost:5199/#k=whatever")).rejects.toThrow(/g=/);
  });

  it("a corrupted payload throws instead of sanitizing itself polite", async () => {
    const url = await encodeDocUrl(performance3ops());
    const wounded = url.replace(/#g=(.{20})./, "#g=$1!"); // one hostile byte
    await expect(decodeDocUrl(wounded)).rejects.toThrow();
  });

  it("truncated-in-transit payload throws", async () => {
    const url = await encodeDocUrl(performance3ops());
    await expect(decodeDocUrl(url.slice(0, url.length / 2))).rejects.toThrow();
  });

  it("the replay mode of v2 is not parsed as if it exists", async () => {
    const url = (await encodeDocUrl(performance3ops())) + "&mode=replay";
    const decoded = await decodeDocUrl<GubbleDoc>(url);
    expect(decoded.mode).toBeNull(); // unknown until playback is real
  });
});

describe("fork-at-frame means LINEAGE, not just truncation", () => {
  it("a fork remembers its parent and divergence point; a truncation remembers nothing", () => {
    const doc = performance3ops();
    const forked = forkDocument(doc, 2, "http://localhost:5199/#g=parent");
    const cut = truncate(doc, 2);
    expect(forked.header.lineage).toEqual({ parent: "http://localhost:5199/#g=parent", at: 2 });
    expect(cut.header.lineage).toBeNull();
    // same picture, different biography — both replay to the state at op 2
    expect(replay(forked).toText()).toBe(replay(cut).toText());
  });

  it("lineage survives the URL round-trip — the fork's fork can find its grandparent", async () => {
    const doc = performance3ops();
    const forked = forkDocument(doc, 1, "gubble://gen-1");
    const url = await encodeDocUrl(forked);
    const { doc: revived } = await decodeDocUrl<GubbleDoc>(url);
    expect(revived.header.lineage).toEqual({ parent: "gubble://gen-1", at: 1 });
  });
});
