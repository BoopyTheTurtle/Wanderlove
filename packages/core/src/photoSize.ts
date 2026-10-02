// Photos go up at most this many pixels on their long edge (main spec 6.4).
export const MAX_PHOTO_EDGE = 2048;

// Integer dimensions that fit `width` × `height` within `max` on the long edge, keeping the aspect ratio.
// Never upscales, and never rounds a side down to zero.
export function fitWithin(width: number, height: number, max = MAX_PHOTO_EDGE): { width: number; height: number } {
  if (!(width > 0 && height > 0 && max > 0)) throw new RangeError("fitWithin needs positive dimensions");
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.min(max, Math.round(width * scale))),
    height: Math.max(1, Math.min(max, Math.round(height * scale))),
  };
}
