import { describe, expect, it } from "vitest";
import { censusText } from "../src/census.js";
import { buildDuctus, ductusByteSize, DUCTUS_BYTE_BUDGET } from "../src/ductus.js";
import { encodeDuctusUrl, decodeDuctusUrl, encodePayload, decodePayload } from "../src/url.js";
import type { Ductus } from "../src/ductus.js";

const ductus = buildDuctus(censusText("¤ø,¸¸,ø¤º°`°º¤\n░▒▓█▓▒░\n∿≋∿≋∿"), {
  name: "url-test",
  phrases: ["thanks 4 the add!!"],
  swatches: ["#ff9de2", "#c8f7ff"],
});

describe("aesthetic-as-URL (§12)", () => {
  it("round-trips a ductus exactly — the URL IS the aesthetic", async () => {
    const url = await encodeDuctusUrl(ductus);
    const back = await decodeDuctusUrl<Ductus>(url);
    expect(back).toEqual(ductus);
  });

  it("accepts ?a= as well as #a=", async () => {
    const payload = await encodePayload(ductus);
    const back = await decodePayload<Ductus>(payload);
    expect(back).toEqual(ductus);
    const queryStyle = `https://x.example/?a=${payload}`;
    expect(await decodeDuctusUrl<Ductus>(queryStyle)).toEqual(ductus);
  });

  it("rejects a URL with no payload", async () => {
    await expect(decodeDuctusUrl("https://gubble.example/")).rejects.toThrow();
  });

  it("this test ductus travels light (size discipline sanity check)", () => {
    expect(ductusByteSize(ductus)).toBeLessThan(DUCTUS_BYTE_BUDGET);
  });
});
