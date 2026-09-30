// Getting files off the phone: the share sheet where it takes files ("Save Image" puts them in the photo library),
// a plain download elsewhere, and a ZIP when a download holds several files.

// How a save ended. "needs-tap" means the browser refused the share sheet because too long passed since the tap
// (iOS Safari allows little time after an async wait); the caller asks for one more tap and saves again.
export type SaveOutcome = "shared" | "downloaded" | "cancelled" | "needs-tap";

// ---- CRC-32 and a store-only ZIP writer -----------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

// MS-DOS date and time, local time, two-second resolution.
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// Packs files into a ZIP without compression: the entries are JPEGs, which don't shrink. No ZIP64, so the whole
// archive must stay under 4 GB and 65,535 entries, far above a trail's photos.
export function makeZip(entries: ZipEntry[], modified = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(modified);
  // Bit 11: file names are UTF-8.
  const flags = 0x0800;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true); // method: stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // Extra field, comment, disk number, internal and external attributes stay zero.
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// ---- File names --------------------------------------------------------------------------------------------------

// "Spīķeri promenade" → "spikeri-promenade": ASCII only, so every phone and unzip tool keeps the name intact.
export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/, "") || "photo"
  );
}

// "2026-09-29" in the phone's own time zone.
export function dayStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---- Share or download -------------------------------------------------------------------------------------------

// The share sheet only where it means "save to the phone". Desktop Chrome on Windows and macOS also shares files,
// but its sheet offers apps rather than a save, so a mouse-driven screen downloads instead.
export function canShareFiles(files: File[]): boolean {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  if (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(pointer: coarse)").matches) {
    return false;
  }
  try {
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start reading the blob before it goes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Shares the files where the phone can save them; otherwise downloads the one file, or all of them as `zipName`.
export async function saveFiles(files: File[], zipName: string): Promise<SaveOutcome> {
  if (files.length === 0) throw new Error("Nothing to save");
  if (canShareFiles(files)) {
    try {
      await navigator.share({ files });
      return "shared";
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "needs-tap";
      throw e;
    }
  }
  if (files.length === 1) {
    downloadBlob(files[0], files[0].name);
  } else {
    const entries = await Promise.all(
      files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
    );
    downloadBlob(new Blob([makeZip(entries)], { type: "application/zip" }), zipName);
  }
  return "downloaded";
}
