/** Max longest edge for remito photos before Drive upload. */
export const REMITO_MAX_EDGE_PX = 1600;

/** Default JPEG quality when re-encoding remito images. */
export const REMITO_JPEG_QUALITY = 0.8;

/** Keep original PNG when decoded byte length is at or below this (tiny icons/stamps). */
export const TINY_PNG_KEEP_BYTES = 32 * 1024;

export interface ResizeDimensions {
  width: number;
  height: number;
  scaled: boolean;
}

/** Compute target size so the longest edge is ≤ maxEdge (pure; unit-testable). */
export function clampMaxEdge(
  width: number,
  height: number,
  maxEdge: number = REMITO_MAX_EDGE_PX
): ResizeDimensions {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) {
    return { width: w, height: h, scaled: false };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scaled: true,
  };
}

/** Prefer JPEG unless the source is a tiny PNG worth keeping lossless. */
export function chooseRemitoOutputMime(
  inputMime: string,
  approxDecodedBytes: number
): 'image/jpeg' | 'image/png' {
  const mime = (inputMime || '').toLowerCase();
  if (mime === 'image/png' && approxDecodedBytes > 0 && approxDecodedBytes <= TINY_PNG_KEEP_BYTES) {
    return 'image/png';
  }
  return 'image/jpeg';
}

/** Rough decoded size from base64 length (no padding edge cases needed for thresholds). */
export function approxDecodedBytesFromBase64(base64: string): number {
  const len = String(base64 || '').replace(/\s/g, '').length;
  if (len === 0) return 0;
  return Math.floor((len * 3) / 4);
}

export interface CompressedRemitoImage {
  base64: string;
  mime: string;
  /** Suggested filename extension without leading dot. */
  ext: string;
  width: number;
  height: number;
  scaled: boolean;
}

function dataUrlToBase64(dataUrl: string): string {
  const parts = dataUrl.split(',');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * Resize/re-encode a remito image (browser Canvas). Falls back to the original
 * payload if Canvas/Image is unavailable or draw fails.
 */
export async function compressRemitoImage(
  base64: string,
  mime: string,
  options?: {
    maxEdge?: number;
    jpegQuality?: number;
  }
): Promise<CompressedRemitoImage> {
  const maxEdge = options?.maxEdge ?? REMITO_MAX_EDGE_PX;
  const jpegQuality = options?.jpegQuality ?? REMITO_JPEG_QUALITY;
  const inputMime = mime || 'image/jpeg';
  const approxBytes = approxDecodedBytesFromBase64(base64);

  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return {
      base64,
      mime: inputMime,
      ext: inputMime.includes('png') ? 'png' : 'jpg',
      width: 0,
      height: 0,
      scaled: false,
    };
  }

  const dataUrl = `data:${inputMime};base64,${base64}`;

  try {
    const img = await loadImage(dataUrl);
    const dims = clampMaxEdge(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);
    const outMime = chooseRemitoOutputMime(inputMime, approxBytes);

    // Skip re-encode when already small enough and MIME stays the same (PNG keep path).
    if (!dims.scaled && outMime === inputMime && outMime === 'image/png') {
      return {
        base64,
        mime: inputMime,
        ext: 'png',
        width: dims.width,
        height: dims.height,
        scaled: false,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('canvas 2d unavailable');
    }
    ctx.drawImage(img, 0, 0, dims.width, dims.height);

    const quality = outMime === 'image/jpeg' ? jpegQuality : undefined;
    const outDataUrl = canvas.toDataURL(outMime, quality);
    const outBase64 = dataUrlToBase64(outDataUrl);
    if (!outBase64) {
      throw new Error('empty compress output');
    }

    return {
      base64: outBase64,
      mime: outMime,
      ext: outMime === 'image/png' ? 'png' : 'jpg',
      width: dims.width,
      height: dims.height,
      scaled: dims.scaled || outMime !== inputMime,
    };
  } catch {
    return {
      base64,
      mime: inputMime,
      ext: inputMime.includes('png') ? 'png' : 'jpg',
      width: 0,
      height: 0,
      scaled: false,
    };
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}
