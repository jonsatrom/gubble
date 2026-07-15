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
declare const CompressionStream: new (format: "deflate-raw") => ByteStreamPair;
declare const DecompressionStream: new (format: "deflate-raw") => ByteStreamPair;

async function pumpThrough(stream: ByteStreamPair, input: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  const writing = writer.write(input).then(() => writer.close());
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
 * Encode any JSON-serializable payload (a ductus, later a kit) into the
 * URL-fragment form: deflate-raw compressed, base64url encoded.
 */
export async function encodePayload(payload: unknown): Promise<string> {
  const compressed = await pumpThrough(new CompressionStream("deflate-raw"), utf8Encode(JSON.stringify(payload)));
  return bytesToBase64url(compressed);
}

/** Reverse of encodePayload. Throws on malformed input — a broken link is a broken link. */
export async function decodePayload<T = unknown>(encoded: string): Promise<T> {
  const decompressed = await pumpThrough(new DecompressionStream("deflate-raw"), base64urlToBytes(encoded));
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
