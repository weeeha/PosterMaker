/**
 * Read true pixel dimensions out of encoded image bytes.
 *
 * This exists because image models don't report what they actually produced,
 * and the previous code invented dimensions from the requested aspect ratio.
 * Invented dimensions make every downstream print-resolution check a lie, so
 * we decode the real ones from the file header.
 */

export interface PixelSize {
  width: number;
  height: number;
}

export function decodeImageSize(bytes: Uint8Array): PixelSize | null {
  return pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
}

function dv(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** PNG: 8-byte signature, then IHDR with width/height as big-endian uint32. */
function pngSize(b: Uint8Array): PixelSize | null {
  if (b.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, i) => b[i] === v)) return null;
  const view = dv(b);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG: walk the marker segments to the Start-Of-Frame, which carries the
 * dimensions. Height comes before width in SOF, which is easy to get backwards.
 */
function jpegSize(b: Uint8Array): PixelSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = dv(b);
  let off = 2;
  while (off + 3 < b.length) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = b[off + 1];
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = view.getUint16(off + 2);
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (off + 9 >= b.length) return null;
      return { height: view.getUint16(off + 5), width: view.getUint16(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

/** WebP: RIFF container; handles the VP8, VP8L and VP8X chunk variants. */
function webpSize(b: Uint8Array): PixelSize | null {
  if (b.length < 30) return null;
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  const view = dv(b);
  if (chunk === "VP8X") {
    // 24-bit little-endian, stored as (dimension - 1).
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { width: w, height: h };
  }
  if (chunk === "VP8 ") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >> 14) & 0x3fff),
    };
  }
  return null;
}
