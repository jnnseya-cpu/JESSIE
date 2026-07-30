/**
 * Byte-level image handling: sniff real dimensions, strip metadata.
 *
 * Two jobs, both done on the actual bytes rather than trusting the client:
 *
 * 1. **Dimensions.** The upload check used to take the client's word for
 *    width and height. These parsers read them from the file itself, so a
 *    2-pixel image cannot claim to be 800.
 *
 * 2. **Metadata stripping.** The privacy promise is that EXIF — above all
 *    GPS — never reaches storage. This removes the metadata segments from
 *    JPEG, PNG and WebP without re-encoding a single pixel, so quality is
 *    untouched and no image decoder (with its attack surface) ever runs.
 *
 * Plain functions, no parameter properties — imported directly by the test
 * suite under Node's type-stripping mode.
 */

export interface SniffedImage {
  format: 'jpeg' | 'png' | 'webp' | null;
  widthPx: number;
  heightPx: number;
}

/* ---------------- sniffing ---------------- */

export function sniffImage(bytes: Buffer): SniffedImage {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return sniffJpeg(bytes);
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) return sniffPng(bytes);
  if (
    bytes.length > 30 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return sniffWebp(bytes);
  }
  return { format: null, widthPx: 0, heightPx: 0 };
}

function sniffJpeg(bytes: Buffer): SniffedImage {
  // Walk the marker chain to a Start-Of-Frame, which carries dimensions.
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return { format: 'jpeg', widthPx: 0, heightPx: 0 };
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0..SOF15, excluding DHT(C4), JPG(C8), DAC(CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return {
        format: 'jpeg',
        heightPx: bytes.readUInt16BE(offset + 5),
        widthPx: bytes.readUInt16BE(offset + 7),
      };
    }
    if (marker === 0xda) break; // scan data — no SOF found before it
    offset += 2 + length;
  }
  return { format: 'jpeg', widthPx: 0, heightPx: 0 };
}

function sniffPng(bytes: Buffer): SniffedImage {
  // IHDR is required to be the first chunk: width at 16, height at 20.
  return { format: 'png', widthPx: bytes.readUInt32BE(16), heightPx: bytes.readUInt32BE(20) };
}

function sniffWebp(bytes: Buffer): SniffedImage {
  const kind = bytes.toString('latin1', 12, 16);
  if (kind === 'VP8X') {
    // 24-bit little-endian, minus one.
    const w = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const h = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { format: 'webp', widthPx: w, heightPx: h };
  }
  if (kind === 'VP8 ') {
    const w = bytes.readUInt16LE(26) & 0x3fff;
    const h = bytes.readUInt16LE(28) & 0x3fff;
    return { format: 'webp', widthPx: w, heightPx: h };
  }
  if (kind === 'VP8L') {
    const b = bytes.readUInt32LE(21);
    return { format: 'webp', widthPx: 1 + (b & 0x3fff), heightPx: 1 + ((b >> 14) & 0x3fff) };
  }
  return { format: 'webp', widthPx: 0, heightPx: 0 };
}

/* ---------------- stripping ---------------- */

export function stripImageMetadata(bytes: Buffer): Buffer {
  const sniffed = sniffImage(bytes);
  switch (sniffed.format) {
    case 'jpeg':
      return stripJpeg(bytes);
    case 'png':
      return stripPng(bytes);
    case 'webp':
      return stripWebp(bytes);
    default:
      throw new RangeError('not a recognised image format');
  }
}

/**
 * JPEG: drop APP1 (EXIF and XMP — GPS lives here), APP13 (IPTC) and COM
 * (free-text comments). Keep APP0 (JFIF) and APP2 (ICC colour profile) —
 * removing ICC visibly shifts colours, and it carries nothing personal.
 */
function stripJpeg(bytes: Buffer): Buffer {
  const kept: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) {
      // Start of scan: everything from here is pixel data. Keep it all.
      kept.push(bytes.subarray(offset));
      return Buffer.concat(kept);
    }
    const length = bytes.readUInt16BE(offset + 2);
    const segment = bytes.subarray(offset, offset + 2 + length);
    const drop = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!drop) kept.push(segment);
    offset += 2 + length;
  }
  return Buffer.concat(kept);
}

/** PNG chunks that stay. Everything else — tEXt, eXIf, tIME — goes. */
const PNG_KEEP = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP',
  'sBIT', 'bKGD', 'pHYs', 'acTL', 'fcTL', 'fdAT',
]);

function stripPng(bytes: Buffer): Buffer {
  const kept: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset, offset + 12 + length);
    if (PNG_KEEP.has(type)) kept.push(chunk);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return Buffer.concat(kept);
}

/**
 * WebP: drop EXIF and XMP chunks from the RIFF container, clear their
 * presence flags in VP8X, and rewrite the RIFF size.
 */
function stripWebp(bytes: Buffer): Buffer {
  const kept: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('latin1', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const padded = length + (length % 2); // chunks are 2-byte aligned
    const chunk = Buffer.from(bytes.subarray(offset, offset + 8 + padded));
    if (type !== 'EXIF' && type !== 'XMP ') {
      if (type === 'VP8X' && chunk.length >= 9) {
        chunk[8] = chunk[8]! & ~0x0c; // clear the EXIF (0x08) and XMP (0x04) bits
      }
      kept.push(chunk);
    }
    offset += 8 + padded;
  }
  const body = Buffer.concat(kept);
  const header = Buffer.from(bytes.subarray(0, 12));
  header.writeUInt32LE(4 + body.length, 4);
  return Buffer.concat([header, body]);
}
