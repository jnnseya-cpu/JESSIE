import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { SESSION_TTL_SECONDS, issueToken, verifyToken } from '../src/auth/token.ts';
import { sniffImage, stripImageMetadata } from '../src/storage/image-bytes.ts';

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

test('a password verifies against its own hash and no other', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('correct horse batterY', hash), false);
});

test('the same password hashes differently every time — salts are per-user', async () => {
  const a = await hashPassword('correct horse battery');
  const b = await hashPassword('correct horse battery');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('correct horse battery', b), true);
});

test('parameters are stored with the hash, so they can be raised later', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
});

test('a short password is refused at hashing time', async () => {
  await assert.rejects(() => hashPassword('short'), RangeError);
});

test('a mangled stored hash fails closed, never open', async () => {
  assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
  assert.equal(await verifyPassword('anything', 'scrypt$16384$8$1$AAAA'), false);
  assert.equal(await verifyPassword('anything', ''), false);
});

/* ------------------------------------------------------------------ *
 * Session tokens
 * ------------------------------------------------------------------ */

const SECRET = 'a'.repeat(48);

test('a token round-trips with its payload intact', () => {
  const token = issueToken({ uid: 'u_1', kind: 'adult', age: 34 }, SECRET);
  const payload = verifyToken(token, SECRET);
  assert.equal(payload?.uid, 'u_1');
  assert.equal(payload?.kind, 'adult');
  assert.equal(payload?.age, 34);
});

test('a tampered payload does not verify', () => {
  const token = issueToken({ uid: 'u_1', kind: 'adult', age: 34 }, SECRET);
  const [body, sig] = token.split('.');
  const forged = JSON.parse(Buffer.from(body!, 'base64url').toString());
  forged.kind = 'platform_staff'; // the escalation that must be impossible
  const forgedToken = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${sig}`;
  assert.equal(verifyToken(forgedToken, SECRET), null);
});

test('a token signed with a different secret does not verify', () => {
  const token = issueToken({ uid: 'u_1', kind: 'adult', age: 34 }, 'b'.repeat(48));
  assert.equal(verifyToken(token, SECRET), null);
});

test('an expired token does not verify, and expiry is thirty days', () => {
  const issuedAt = 1_760_000_000;
  const token = issueToken({ uid: 'u_1', kind: 'adult', age: 34 }, SECRET, issuedAt);
  assert.ok(verifyToken(token, SECRET, issuedAt + SESSION_TTL_SECONDS - 1));
  assert.equal(verifyToken(token, SECRET, issuedAt + SESSION_TTL_SECONDS + 1), null);
});

test('garbage, empty and secretless verification all fail closed', () => {
  assert.equal(verifyToken('nonsense', SECRET), null);
  assert.equal(verifyToken('', SECRET), null);
  assert.equal(verifyToken('a.b.c', SECRET), null);
  const token = issueToken({ uid: 'u_1', kind: 'adult', age: 34 }, SECRET);
  assert.equal(verifyToken(token, ''), null);
});

/* ------------------------------------------------------------------ *
 * Image bytes — sniffing
 * ------------------------------------------------------------------ */

/** A synthetic JPEG: SOI, EXIF APP1, JFIF APP0, SOF0 with real dims, SOS, EOI. */
function jpegWithExif(width: number, height: number): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const exifBody = Buffer.concat([
    Buffer.from('Exif\0\0II*\0', 'latin1'),
    Buffer.from('GPSLATITUDE-51.5074', 'latin1'), // the payload that must not survive
  ]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => { const b = Buffer.alloc(2); b.writeUInt16BE(exifBody.length + 2); return b; })(),
    exifBody,
  ]);
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0', 'latin1'),
    Buffer.alloc(9),
  ]);
  const sof = Buffer.alloc(2 + 2 + 15);
  sof[0] = 0xff; sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const scan = Buffer.from([0x12, 0x34, 0x56]);
  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, app1, app0, sof, sos, scan, eoi]);
}

/** A synthetic PNG: signature, IHDR with real dims, a tEXt chunk, IDAT, IEND. */
function pngWithText(width: number, height: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Author\0Somebody Identifiable', 'latin1')),
    chunk('IDAT', Buffer.from([1, 2, 3, 4])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A synthetic WebP: RIFF, VP8X with EXIF flag and dims, EXIF chunk, VP8 stub. */
function webpWithExif(width: number, height: number): Buffer {
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 'latin1');
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = 0x08; // EXIF present
  vp8x.writeUIntLE(width - 1, 12, 3);
  vp8x.writeUIntLE(height - 1, 15, 3);
  const exifData = Buffer.from('II*\0GPS-HERE', 'latin1');
  const exif = Buffer.alloc(8 + exifData.length + (exifData.length % 2));
  exif.write('EXIF', 0, 'latin1');
  exif.writeUInt32LE(exifData.length, 4);
  exifData.copy(exif, 8);
  const vp8Data = Buffer.from([0, 1, 2, 3, 4, 5]);
  const vp8 = Buffer.alloc(8 + vp8Data.length);
  vp8.write('VP8 ', 0, 'latin1');
  vp8.writeUInt32LE(vp8Data.length, 4);
  vp8Data.copy(vp8, 8);
  const body = Buffer.concat([vp8x, exif, vp8]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

test('dimensions come from the bytes, not the client', () => {
  assert.deepEqual(sniffImage(jpegWithExif(300, 200)), { format: 'jpeg', widthPx: 300, heightPx: 200 });
  assert.deepEqual(sniffImage(pngWithText(640, 480)), { format: 'png', widthPx: 640, heightPx: 480 });
  assert.deepEqual(sniffImage(webpWithExif(512, 512)), { format: 'webp', widthPx: 512, heightPx: 512 });
});

test('a non-image is not mistaken for one', () => {
  assert.equal(sniffImage(Buffer.from('<svg onload=alert(1)>')).format, null);
  assert.equal(sniffImage(Buffer.from('%PDF-1.4')).format, null);
  assert.equal(sniffImage(Buffer.alloc(0)).format, null);
});

/* ------------------------------------------------------------------ *
 * Image bytes — stripping
 * ------------------------------------------------------------------ */

test('JPEG stripping removes the EXIF segment and keeps the pixels', () => {
  const original = jpegWithExif(300, 200);
  assert.ok(original.includes(Buffer.from('GPSLATITUDE', 'latin1')), 'fixture must carry GPS');

  const stripped = stripImageMetadata(original);
  assert.ok(!stripped.includes(Buffer.from('GPSLATITUDE', 'latin1')), 'GPS survived');
  assert.ok(!stripped.includes(Buffer.from('Exif\0\0', 'latin1')), 'EXIF header survived');
  // The scan data and dimensions are untouched.
  assert.ok(stripped.includes(Buffer.from([0x12, 0x34, 0x56])), 'pixel data lost');
  assert.deepEqual(sniffImage(stripped), { format: 'jpeg', widthPx: 300, heightPx: 200 });
});

test('PNG stripping removes text chunks and keeps the image chunks', () => {
  const original = pngWithText(640, 480);
  const stripped = stripImageMetadata(original);
  assert.ok(!stripped.includes(Buffer.from('Somebody Identifiable', 'latin1')));
  assert.ok(!stripped.includes(Buffer.from('tEXt', 'latin1')));
  assert.deepEqual(sniffImage(stripped), { format: 'png', widthPx: 640, heightPx: 480 });
  assert.ok(stripped.includes(Buffer.from('IDAT', 'latin1')));
  assert.ok(stripped.includes(Buffer.from('IEND', 'latin1')));
});

test('WebP stripping removes the EXIF chunk and clears its flag', () => {
  const original = webpWithExif(512, 512);
  const stripped = stripImageMetadata(original);
  assert.ok(!stripped.includes(Buffer.from('GPS-HERE', 'latin1')));
  assert.ok(!stripped.includes(Buffer.from('EXIF', 'latin1')));
  const vp8x = stripped.indexOf(Buffer.from('VP8X', 'latin1'));
  assert.equal(stripped[vp8x + 8]! & 0x0c, 0, 'the EXIF/XMP flags must be cleared');
  assert.deepEqual(sniffImage(stripped), { format: 'webp', widthPx: 512, heightPx: 512 });
  // The RIFF size must match the new, smaller body.
  assert.equal(stripped.readUInt32LE(4), stripped.length - 8);
});

test('stripping a non-image throws rather than storing it', () => {
  assert.throws(() => stripImageMetadata(Buffer.from('plain text')), RangeError);
});
