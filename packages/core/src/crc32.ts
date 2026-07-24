// CRC-32 (IEEE 802.3 / ISO-HDLC polynomial) — the checksum ZIP entries
// carry. Hand-rolled rather than a dependency, same call as FNV-1a in
// hash.ts: this is a ~15-line, decades-stable algorithm; pulling a
// package for it would be more supply chain than the checksum itself.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** Standard CRC-32. crc32(utf8 "123456789") === 0xcbf43926 — the universal check value, tested. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
