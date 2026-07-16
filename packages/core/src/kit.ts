// Kit ↔ URL (§10, §12 `?k=`): the kit is the patch file; the URL is the
// patch file format. Corners travel INLINE for now — corners-by-id
// needs a registry, and the commons is optional-forever (§15), so the
// self-contained form is the canonical one and the id-referencing form
// is a future compression, not a dependency.

import { encodePayload, decodePayload } from "./url.js";
import type { Kit } from "./mixer.js";

export async function encodeKitUrl(kit: Kit, origin = "https://gubble.example"): Promise<string> {
  return `${origin}/#k=${await encodePayload(kit)}`;
}

export async function decodeKitUrl(url: string): Promise<Kit> {
  const match = /[#?&]k=([A-Za-z0-9_-]+)/.exec(url);
  if (!match) throw new Error("no ?k= or #k= kit payload found in URL");
  return decodePayload<Kit>(match[1]!);
}
