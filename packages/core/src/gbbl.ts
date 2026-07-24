// .gbbl (§4.2): the overflow escape valve. §12 already said it —
// "v1 documents are fully URL-native for modest docs; else the .gbbl
// file travels" — and the size conversation from 2026-07-18 (URLs as
// recordings, hands making them bigger) made that "else" a real path
// people will hit, not a hypothetical. This is that path.
//
// A .gbbl is an ordinary ZIP: header.json + ops.jsonl + thumb.txt.
// STORED, never DEFLATEd — the doc's own bytes are already compact
// (and URL-sharing already owns the compression story via deflate);
// what a .gbbl buys instead is portability and legibility. `unzip -p
// document.gbbl thumb.txt` on a machine that has never heard of gubble
// still shows you the composition — "a package that is also its own
// screenshot," per the spec's own description, verified against a
// REAL system unzip in gbbl.test.ts, not just this file's own decoder
// reading its own encoder's output.
//
// Determinism, extended to packaging: ZIP entries carry a mod-timestamp
// field, and `new Date()` would mean encoding the SAME document twice
// produces byte-DIFFERENT files — a small but real Directive 1 leak.
// Every entry gets the same fixed DOS timestamp (1980-01-01, the "no
// real timestamp" convention several reproducible-build toolchains
// already use) so encodeGbbl is a pure function of its document, always.

import { crc32 } from "./crc32.js";
import { utf8Encode, utf8Decode } from "./url.js";
import { replay } from "./log.js";
import type { GubbleDoc } from "./log.js";

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const DOS_DATE = 0x0021; // 1980-01-01 — fixed, not wall-clock. See file header.
const DOS_TIME = 0x0000;
const STORED = 0; // compression method: none. See file header for why.

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}
function readU16(bytes: Uint8Array, off: number): number {
  return bytes[off]! | (bytes[off + 1]! << 8);
}
function readU32(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) >>> 0;
}
function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const { name, bytes } of entries) {
    const nameBytes = utf8Encode(name);
    const crc = crc32(bytes);
    const size = bytes.length;

    const local = concatBytes([
      u32(LOCAL_SIG),
      u16(20), // version needed to extract
      u16(0), // flags
      u16(STORED),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(size), // compressed size == uncompressed for STORED
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra field length
      nameBytes,
      bytes,
    ]);
    localChunks.push(local);

    centralChunks.push(
      concatBytes([
        u32(CENTRAL_SIG),
        u16(20), // version made by
        u16(20), // version needed
        u16(0),
        u16(STORED),
        u16(DOS_TIME),
        u16(DOS_DATE),
        u32(crc),
        u32(size),
        u32(size),
        u16(nameBytes.length),
        u16(0), // extra field length
        u16(0), // comment length
        u16(0), // disk number start
        u16(0), // internal attrs
        u32(0), // external attrs
        u32(offset), // this entry's local header offset
        nameBytes,
      ]),
    );
    offset += local.length;
  }

  const centralDir = concatBytes(centralChunks);
  const eocd = concatBytes([
    u32(EOCD_SIG),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset), // central directory offset
    u16(0), // comment length
  ]);

  return concatBytes([...localChunks, centralDir, eocd]);
}

function findEOCD(bytes: Uint8Array): number {
  // EOCD is a fixed 22 bytes plus an optional comment; ours never
  // writes one, but search backward a generous window anyway in case
  // some other tool re-saved the file with a short comment attached.
  const searchFloor = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= searchFloor; i--) {
    if (readU32(bytes, i) === EOCD_SIG) return i;
  }
  throw new Error("not a valid .gbbl: no end-of-central-directory record found");
}

function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const eocdOff = findEOCD(bytes);
  const entryCount = readU16(bytes, eocdOff + 10);
  let p = readU32(bytes, eocdOff + 16); // central directory offset

  const files = new Map<string, Uint8Array>();
  for (let i = 0; i < entryCount; i++) {
    if (readU32(bytes, p) !== CENTRAL_SIG) throw new Error("not a valid .gbbl: corrupt central directory");
    const method = readU16(bytes, p + 10);
    const crc = readU32(bytes, p + 16);
    const compSize = readU32(bytes, p + 20);
    const uncompSize = readU32(bytes, p + 24);
    const nameLen = readU16(bytes, p + 28);
    const extraLen = readU16(bytes, p + 30);
    const commentLen = readU16(bytes, p + 32);
    const localOffset = readU32(bytes, p + 42);
    const name = utf8Decode(bytes.slice(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (method !== STORED) {
      throw new Error(`${name}: gubble only reads STORED (uncompressed) .gbbl entries, got method ${method}`);
    }
    if (readU32(bytes, localOffset) !== LOCAL_SIG) throw new Error("not a valid .gbbl: corrupt local file header");
    // Re-read lengths from the LOCAL header, not the central one — they're
    // legally allowed to differ, and the data genuinely starts after
    // whatever the local header says, not the central directory's copy.
    const localNameLen = readU16(bytes, localOffset + 26);
    const localExtraLen = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.slice(dataStart, dataStart + compSize);

    if (data.length !== uncompSize) throw new Error(`${name}: size mismatch — this .gbbl is corrupted`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch — this .gbbl is corrupted, not a stylistic choice`);
    files.set(name, data);
  }
  return files;
}

/**
 * Document → .gbbl bytes. Synchronous — unlike url.ts's encodePayload,
 * there's no CompressionStream here (STORED, not DEFLATEd), so nothing
 * about this needs to be async.
 */
export function encodeGbbl(doc: GubbleDoc): Uint8Array {
  const opsJsonl = doc.ops.length > 0 ? doc.ops.map((op) => JSON.stringify(op)).join("\n") + "\n" : "";
  return buildZip([
    { name: "header.json", bytes: utf8Encode(JSON.stringify(doc.header, null, 2)) },
    { name: "ops.jsonl", bytes: utf8Encode(opsJsonl) },
    // The screenshot the package is (§4.2): plain-text final state, so
    // a text editor or `unzip -p … thumb.txt` shows the composition to
    // someone who has never heard of gubble.
    { name: "thumb.txt", bytes: utf8Encode(replay(doc).toText()) },
  ]);
}

/** .gbbl bytes → document. Throws loudly on anything malformed — a broken package is broken, not sanitized quietly into something else. */
export function decodeGbbl(bytes: Uint8Array): GubbleDoc {
  const files = readZip(bytes);
  const headerBytes = files.get("header.json");
  const opsBytes = files.get("ops.jsonl");
  if (!headerBytes || !opsBytes) {
    throw new Error("not a valid .gbbl: missing header.json or ops.jsonl — a package without a document isn't a package");
  }
  const header = JSON.parse(utf8Decode(headerBytes)) as GubbleDoc["header"];
  const opsText = utf8Decode(opsBytes).trim();
  const ops = opsText.length > 0 ? opsText.split("\n").map((line) => JSON.parse(line)) : [];
  return { header, ops } as GubbleDoc;
}
