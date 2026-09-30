import type { Stop } from "@wannadoo/core";
import { DecryptionError } from "./crypto";
import { listRunPhotos, openStoredPhoto, type RunPhoto } from "./photos";
import type { RunKeyLoader } from "./photoKeys";
import { slugify } from "./saveFiles";

// The run's photos as files to save, and the story-format collage drawn from them (main spec 6.5).

export const ALBUM_WIDTH = 1080;
export const ALBUM_HEIGHT = 1920;
// More photos than this make cells too small to read; the collage picks across stops instead.
export const COLLAGE_MAX = 9;

export type AlbumTheme = "default" | "sherlock";

export type AlbumItem = {
  photo: RunPhoto;
  // 1-based position of the photo's stop on the trail.
  stopNumber: number;
  stopName: string;
  // "01-spikeri-promenade-1.jpg": stop order, stop name, and the photo's place at that stop.
  fileName: string;
};

// "01-spikeri-promenade": the start of a saved photo's file name, from its stop's place and name.
export function stopFilePrefix(stopNumber: number, stopName: string): string {
  return `${String(stopNumber).padStart(2, "0")}-${slugify(stopName)}`;
}

// Sorts photos by stop, then by when they were taken, and names each one for saving.
export function orderAlbum(photos: RunPhoto[], stops: Stop[]): AlbumItem[] {
  const position = new Map(stops.map((s, i) => [s.id, i]));
  const sorted = [...photos].sort((a, b) => {
    const pa = position.get(a.stopId) ?? stops.length;
    const pb = position.get(b.stopId) ?? stops.length;
    return pa - pb || a.createdAt.localeCompare(b.createdAt);
  });
  const perStop = new Map<number, number>();
  return sorted.map((photo) => {
    const index = position.get(photo.stopId) ?? stops.length;
    const nth = (perStop.get(index) ?? 0) + 1;
    perStop.set(index, nth);
    const stopName = stops[index]?.name ?? "Extra";
    const stopNumber = index + 1;
    return {
      photo,
      stopNumber,
      stopName,
      fileName: `${stopFilePrefix(stopNumber, stopName)}-${nth}.jpg`,
    };
  });
}

// Picks up to `max` photos for the collage: the first photo of every stop, then each stop's second, and so on, so
// every stop shows before any stop shows twice. Keeps album order.
export function pickCollage<T extends { stopNumber: number }>(items: T[], max = COLLAGE_MAX): T[] {
  if (items.length <= max) return items;
  const byStop = new Map<number, number[]>();
  items.forEach((item, i) => byStop.set(item.stopNumber, [...(byStop.get(item.stopNumber) ?? []), i]));
  const chosen: number[] = [];
  for (let round = 0; chosen.length < max; round++) {
    for (const indexes of byStop.values()) {
      if (round < indexes.length && chosen.length < max) chosen.push(indexes[round]);
    }
  }
  return chosen.sort((a, b) => a - b).map((i) => items[i]);
}

// How many photos sit in each row of the collage, top to bottom.
export function collageRows(count: number): number[] {
  const rows: Record<number, number[]> = {
    1: [1],
    2: [1, 1],
    3: [1, 2],
    4: [2, 2],
    5: [2, 3],
    6: [3, 3],
    7: [2, 2, 3],
    8: [3, 2, 3],
    9: [3, 3, 3],
  };
  return rows[Math.min(Math.max(count, 0), COLLAGE_MAX)] ?? [];
}

export type Rect = { x: number; y: number; w: number; h: number };

// The cells of the collage inside `box`, row by row, left to right.
export function collageCells(count: number, box: Rect, gap: number): Rect[] {
  const rows = collageRows(count);
  const rowHeight = (box.h - gap * (rows.length - 1)) / rows.length;
  return rows.flatMap((inRow, r) => {
    const width = (box.w - gap * (inRow - 1)) / inRow;
    return Array.from({ length: inRow }, (_, c) => ({
      x: box.x + c * (width + gap),
      y: box.y + r * (rowHeight + gap),
      w: width,
      h: rowHeight,
    }));
  });
}

// ---- Fetching ----------------------------------------------------------------------------------------------------

async function fetchOk(url: string): Promise<Blob | null> {
  const res = await fetch(url);
  return res.ok ? res.blob() : null;
}

// One photo's stored object: plain JPEG or ciphertext. A signed URL lasts an hour, so a refused one gets replaced by a
// fresh listing before giving up.
async function fetchStored(photo: RunPhoto): Promise<Blob> {
  const first = await fetchOk(photo.url);
  if (first) return first;
  const fresh = (await listRunPhotos(photo.runId)).find((p) => p.id === photo.id);
  const second = fresh ? await fetchOk(fresh.url) : null;
  if (!second) throw new Error("Couldn't download the photo");
  return second;
}

// One photo's JPEG. An encrypted photo already open on screen comes from its blob: URL; otherwise it downloads and,
// when encrypted, decrypts with the run key. Throws DecryptionError when that fails.
export async function fetchPhotoBlob(photo: RunPhoto, loadKey: RunKeyLoader): Promise<Blob> {
  if (photo.src?.startsWith("blob:")) {
    const local = await fetchOk(photo.src).catch(() => null);
    if (local) return local;
  }
  const stored = await fetchStored(photo);
  return openStoredPhoto(photo, stored, photo.nonce === null ? null : await loadKey(photo.runId));
}

export type AlbumFile = AlbumItem & { file: File };

// Every photo of the run as a named JPEG file, in album order. Lists the photos afresh, so each signed URL has its
// full hour ahead of it. An encrypted photo that fails to decrypt is left out rather than failing the whole album.
// Reports progress after each download.
export async function loadAlbumFiles(
  runId: string,
  stops: Stop[],
  loadKey: RunKeyLoader,
  onProgress?: (done: number, total: number) => void,
): Promise<AlbumFile[]> {
  const items = orderAlbum(await listRunPhotos(runId), stops);
  // Load the key once up front, so a phone still waiting for its key fails fast instead of per photo.
  const runKey = items.some((i) => i.photo.nonce !== null) ? await loadKey(runId) : null;
  const out: (AlbumFile | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  onProgress?.(0, items.length);
  // Three at a time: quick on a phone's connection without flooding it.
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      try {
        const blob = await openStoredPhoto(item.photo, await fetchStored(item.photo), runKey);
        out[i] = {
          ...item,
          file: new File([blob], item.fileName, {
            type: "image/jpeg",
            lastModified: Date.parse(item.photo.createdAt),
          }),
        };
      } catch (e) {
        if (!(e instanceof DecryptionError)) throw e;
        console.error("Left a photo that won't decrypt out of the album", item.photo.id);
      }
      onProgress?.(++done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, worker));
  return out.filter((f): f is AlbumFile => f !== null);
}

// ---- Drawing -----------------------------------------------------------------------------------------------------

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

const THEMES: Record<
  AlbumTheme,
  { eyebrow: string; ink: string; muted: string; paint: (ctx: CanvasRenderingContext2D) => void }
> = {
  // The app's teal gradient, dark enough at the bottom for white text.
  default: {
    eyebrow: "TRAIL COMPLETE",
    ink: "#ffffff",
    muted: "#d4efea",
    paint(ctx) {
      const g = ctx.createLinearGradient(0, 0, ALBUM_WIDTH * 0.4, ALBUM_HEIGHT);
      g.addColorStop(0, "#4fb8aa");
      g.addColorStop(0.55, "#2a9d8f");
      g.addColorStop(1, "#17665d");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ALBUM_WIDTH, ALBUM_HEIGHT);
      const glow = ctx.createRadialGradient(880, 180, 0, 880, 180, 700);
      glow.addColorStop(0, "#ffffff33");
      glow.addColorStop(1, "#ffffff00");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, ALBUM_WIDTH, ALBUM_HEIGHT);
    },
  },
  // The field book: dotted paper in wine and coral.
  sherlock: {
    eyebrow: "OUR FIELD BOOK",
    ink: "#8b2e45",
    muted: "#9a6b6b",
    paint(ctx) {
      ctx.fillStyle = "#fbf0e2";
      ctx.fillRect(0, 0, ALBUM_WIDTH, ALBUM_HEIGHT);
      ctx.fillStyle = "#f2806a33";
      for (let y = 12; y < ALBUM_HEIGHT; y += 28) {
        for (let x = 12; x < ALBUM_WIDTH; x += 28) {
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
};

function roundedPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

// Breaks text into lines no wider than `width`, at most `max` lines; the last one ends in "…" when text remains.
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= width || !line) {
      line = tryLine;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}…`;
  return kept;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Canvas letter spacing is newer than the rest; older browsers just draw without it.
  if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${px}px`;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't draw the album"))), "image/jpeg", 0.9),
  );
}

export type AlbumInput = {
  title: string;
  // ISO timestamp of the walk.
  date: string;
  stopNames: string[];
  // JPEGs in album order; the collage shows at most COLLAGE_MAX of them.
  photos: Blob[];
  theme: AlbumTheme;
};

// Draws the 1080 × 1920 story-format album and returns it as a JPEG. Photos arrive as blobs and are decoded with
// createImageBitmap, never loaded from their URLs, so the canvas stays untainted and exports.
export async function drawAlbum({ title, date, stopNames, photos, theme }: AlbumInput): Promise<Blob> {
  if (photos.length === 0) throw new Error("The album has no photos");
  const t = THEMES[theme];
  const canvas = document.createElement("canvas");
  canvas.width = ALBUM_WIDTH;
  canvas.height = ALBUM_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the album");

  try {
    await Promise.all([document.fonts.load(`800 88px ${FONT}`), document.fonts.load(`600 36px ${FONT}`)]);
  } catch {
    // The fallback font draws fine.
  }

  const margin = 72;
  const inner = ALBUM_WIDTH - margin * 2;
  t.paint(ctx);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // Header: eyebrow, trail name (up to two lines), date.
  ctx.fillStyle = t.muted;
  ctx.font = `800 28px ${FONT}`;
  setSpacing(ctx, 6);
  ctx.fillText(t.eyebrow, margin, 150);
  setSpacing(ctx, 0);

  let titleSize = 92;
  let titleLines: string[] = [];
  for (; titleSize >= 60; titleSize -= 8) {
    ctx.font = `800 ${titleSize}px ${FONT}`;
    titleLines = wrap(ctx, title, inner, 2);
    if (!titleLines[titleLines.length - 1].endsWith("…")) break;
  }
  ctx.fillStyle = t.ink;
  let y = 150 + titleSize * 1.15;
  for (const line of titleLines) {
    ctx.fillText(line, margin, y);
    y += titleSize * 1.08;
  }
  const when = new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  ctx.fillStyle = t.muted;
  ctx.font = `600 36px ${FONT}`;
  y += 4;
  ctx.fillText(when, margin, y);
  const photosTop = y + 56;

  // Footer, laid out from the bottom up: the brand, the stop names, their label.
  ctx.font = `600 34px ${FONT}`;
  const stopLines = wrap(ctx, stopNames.join("  ·  "), inner, 3);
  const brandY = ALBUM_HEIGHT - 72;
  const stopsBottom = brandY - 70;
  const stopsTop = stopsBottom - (stopLines.length - 1) * 46;
  const labelY = stopsTop - 50;
  ctx.fillStyle = t.ink;
  stopLines.forEach((line, i) => ctx.fillText(line, margin, stopsTop + i * 46));
  ctx.fillStyle = t.muted;
  ctx.font = `800 26px ${FONT}`;
  setSpacing(ctx, 6);
  ctx.fillText(`${stopNames.length} STOPS`, margin, labelY);
  ctx.fillText("MADE WITH WANNADOO", margin, brandY);
  setSpacing(ctx, 0);

  // The photos, cover-cropped into framed cells. Decoded one at a time and closed at once, to spare phone memory.
  const shown = photos.slice(0, COLLAGE_MAX);
  const box = { x: margin, y: photosTop, w: inner, h: labelY - 70 - photosTop };
  const cells = collageCells(shown.length, box, 24);
  for (let i = 0; i < shown.length; i++) {
    const cell = cells[i];
    const frame = theme === "sherlock" ? 8 : 10;
    ctx.save();
    if (theme === "sherlock") {
      ctx.fillStyle = "#f2806a";
      roundedPath(ctx, { ...cell, x: cell.x + 10, y: cell.y + 10 }, 22);
      ctx.fill();
      ctx.fillStyle = "#fff8ef";
    } else {
      ctx.shadowColor = "#0b3b3540";
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = "#ffffff";
    }
    roundedPath(ctx, cell, 22);
    ctx.fill();
    ctx.restore();
    if (theme === "sherlock") {
      ctx.strokeStyle = "#8b2e45";
      ctx.lineWidth = 3;
      roundedPath(ctx, cell, 22);
      ctx.stroke();
    }

    const pic = { x: cell.x + frame, y: cell.y + frame, w: cell.w - frame * 2, h: cell.h - frame * 2 };
    const bitmap = await createImageBitmap(shown[i]);
    try {
      const scale = Math.max(pic.w / bitmap.width, pic.h / bitmap.height);
      const sw = pic.w / scale;
      const sh = pic.h / scale;
      ctx.save();
      roundedPath(ctx, pic, 14);
      ctx.clip();
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, pic.x, pic.y, pic.w, pic.h);
      ctx.restore();
    } finally {
      bitmap.close();
    }
  }

  return toJpeg(canvas);
}
