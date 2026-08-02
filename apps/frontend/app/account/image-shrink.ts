/**
 * Client-side photo shrinking.
 *
 * A phone camera produces 3–10MB; base64 adds a third; and the platform
 * refuses request bodies around 4.5MB before they reach the API — the
 * browser reports only "Failed to fetch". Nothing downstream needs that
 * many pixels (the vision model reads a plate perfectly well at 1280px),
 * so the photo is resized here before it travels.
 *
 * A side effect worth having: a canvas re-encode carries no EXIF, so GPS
 * coordinates never leave the phone at all. The server still strips
 * metadata as the guarantee; this just means there is usually nothing
 * left for it to strip.
 */

export interface ShrunkImage {
  mimeType: string;
  dataBase64: string;
}

async function toBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Older WebKit: decode through an <img> instead.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('that file could not be read as an image'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function shrinkImage(file: File, maxEdgePx = 1280, quality = 0.85): Promise<ShrunkImage> {
  const source = await toBitmap(file);
  const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!width || !height) throw new Error('that file could not be read as an image');

  const scale = Math.min(1, maxEdgePx / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('this browser could not process the image');
  // Photos with transparency land on white, not black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('this browser could not process the image');

  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { mimeType: 'image/jpeg', dataBase64: btoa(binary) };
}
