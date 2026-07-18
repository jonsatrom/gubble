// Aesthetic-as-URL (§12 `?a=`, §7.2 size discipline): a ductus travels
// as deflate-compressed base64url in a URL parameter. This is the whole
// platform-independence guarantee made mechanical — aesthetics pass
// hand-to-hand as links, no registry required, no gate possible.
//
// CompressionStream/DecompressionStream are used because they're the one
// compression API that exists natively in browsers, Node 20+, and Web
// Workers alike — core stays framework-free without giving up deflate.
// The minimal ambient declarations below stand in for the DOM lib we
// deliberately don't include (§3: zero DOM assumptions).

interface MinimalReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}
interface MinimalWriter {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface ByteStreamPair {
  readable: { getReader(): MinimalReader };
  writable: { getWriter(): MinimalWriter };
}
declare const CompressionStream: new (format: "deflate") => ByteStreamPair;
declare const DecompressionStream: new (format: "deflate") => ByteStreamPair;

async function pumpThrough(stream: ByteStreamPair, input: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  // The write leg's rejection is deliberately absorbed: when a corrupt
  // payload errors the stream, BOTH legs reject — the reader's throw is
  // the one callers catch, and an unabsorbed writer rejection would
  // detonate as an unhandled rejection AFTER the real error already
  // surfaced. (Found by the doc-url crossing tests, first run: nine
  // green assertions and two live grenades in the corner.) A write-side
  // failure with a healthy read side still surfaces — the output comes
  // up short and JSON.parse refuses it.
  const writing = writer
    .write(input)
    .then(() => writer.close())
    .catch(() => {});
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  await writing;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Hand-rolled base64url. btoa/atob exist in both browsers and Node, but
// they traffic in "binary strings" and need chunking gymnastics for
// large arrays — 20 honest lines beat ambient-declaring two deprecated
// functions and hoping.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2]!;
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    if (b !== undefined) out += B64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    if (c !== undefined) out += B64[c & 63]!;
  }
  return out;
}

function base64urlToBytes(text: string): Uint8Array {
  const lookup = new Map([...B64].map((ch, i) => [ch, i]));
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const n = [...text.slice(i, i + 4)].map((ch) => {
      const v = lookup.get(ch);
      if (v === undefined) throw new Error(`invalid base64url character: ${JSON.stringify(ch)}`);
      return v;
    });
    bytes.push((n[0]! << 2) | (n[1]! >> 4));
    if (n.length > 2) bytes.push(((n[1]! & 15) << 4) | (n[2]! >> 2));
    if (n.length > 3) bytes.push(((n[2]! & 3) << 6) | n[3]!);
  }
  return new Uint8Array(bytes);
}

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(bytes);
}

function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 31) << 6) | (bytes[i + 1]! & 63);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 15) << 12) | ((bytes[i + 1]! & 63) << 6) | (bytes[i + 2]! & 63);
      i += 3;
    } else {
      cp =
        ((b & 7) << 18) | ((bytes[i + 1]! & 63) << 12) | ((bytes[i + 2]! & 63) << 6) | (bytes[i + 3]! & 63);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

/**
 * Encode any JSON-serializable payload (a ductus, a kit, a whole
 * document) into the URL-fragment form: zlib-wrapped deflate,
 * base64url encoded.
 *
 * WHY "deflate" AND NOT "deflate-raw" — a war story, preserved: raw
 * deflate carries no header, so the decompressor has to assume a
 * window size, and a Node-minted payload hit a Chrome inflater that
 * refused it ("invalid distance too far back") — same bytes, decoded
 * fine in Node, dead in the browser. The zlib wrapper costs six bytes
 * and DECLARES its window in the header, which is the whole dispute
 * settled in the format itself. The seed and the ruler freeze
 * together; apparently the envelope needs naming too.
 */
export async function encodePayload(payload: unknown): Promise<string> {
  const compressed = await pumpThrough(new CompressionStream("deflate"), utf8Encode(JSON.stringify(payload)));
  return bytesToBase64url(compressed);
}

/** Reverse of encodePayload. Throws on malformed input — a broken link is a broken link. */
export async function decodePayload<T = unknown>(encoded: string): Promise<T> {
  const decompressed = await pumpThrough(new DecompressionStream("deflate"), base64urlToBytes(encoded));
  return JSON.parse(utf8Decode(decompressed)) as T;
}

/**
 * The aesthetic-as-URL (§8 `gubble link`, §12 `?a=`).
 * [PLACED DEFAULT — §19]: origin defaults to a placeholder until the app
 * exists somewhere real. The payload after `#a=` is the actual artifact;
 * the origin is just the doormat it's standing on.
 */
export async function encodeDuctusUrl(ductus: unknown, origin = "https://gubble.example"): Promise<string> {
  return `${origin}/#a=${await encodePayload(ductus)}`;
}

/** Pull a ductus back out of a share URL (accepts both `#a=` and `?a=`). */
export async function decodeDuctusUrl<T = unknown>(url: string): Promise<T> {
  const match = /[#?&]a=([A-Za-z0-9_-]+)/.exec(url);
  if (!match) throw new Error("no ?a= or #a= payload found in URL");
  return decodePayload<T>(match[1]!);
}

/**
 * The DOCUMENT as URL (§12): the whole event log — header, ops, seeds,
 * everything replay needs — deflated into a fragment. This is the v1
 * promise kept: a performance is a recording, the recording is a link,
 * and nobody's server sits between the two (Directive 5). Modifier
 * params ride alongside: `at` (op index to stop at — with mode=edit
 * this IS fork-at-frame), `f` (frame, freezing a shimmer MID-shimmer),
 * `mode` (view | edit).
 * [PLACED DEFAULTS — §19]: the payload param letter is `g` (the spec's
 * table names k/a/mode/at/f but left the document's own letter
 * unspoken; g for gubble, bikeshed at will). The spec's third mode,
 * `replay`, is DELIBERATELY not emitted or parsed: it belongs to the
 * v2 playback UI, and a mode the software parses but never performs is
 * a lie wearing a query param. It returns when playback does.
 */
export async function encodeDocUrl(
  doc: unknown,
  opts: { origin?: string; at?: number; frame?: number; mode?: "view" | "edit" } = {},
): Promise<string> {
  const origin = opts.origin ?? "https://gubble.example";
  let url = `${origin}/#g=${await encodePayload(doc)}`;
  if (opts.at !== undefined) url += `&at=${opts.at}`;
  if (opts.frame !== undefined) url += `&f=${opts.frame}`;
  if (opts.mode) url += `&mode=${opts.mode}`;
  return url;
}

export interface DecodedDocUrl<T> {
  doc: T;
  at: number | null;
  frame: number | null;
  mode: "view" | "edit" | null;
}

/** Reverse of encodeDocUrl — the document plus its modifier params. */
export async function decodeDocUrl<T = unknown>(url: string): Promise<DecodedDocUrl<T>> {
  const g = /[#?&]g=([A-Za-z0-9_-]+)/.exec(url);
  if (!g) throw new Error("no ?g= or #g= document payload found in URL");
  const at = /[#?&]at=(\d+)/.exec(url);
  const f = /[#?&]f=(\d+)/.exec(url);
  const mode = /[#?&]mode=(view|edit)/.exec(url);
  return {
    doc: await decodePayload<T>(g[1]!),
    at: at ? Number(at[1]) : null,
    frame: f ? Number(f[1]) : null,
    mode: (mode?.[1] as DecodedDocUrl<T>["mode"]) ?? null,
  };
}
