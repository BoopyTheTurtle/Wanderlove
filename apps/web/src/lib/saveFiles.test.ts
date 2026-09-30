import { afterEach, describe, expect, it, vi } from "vitest";
import { crc32, dayStamp, makeZip, saveFiles, slugify } from "./saveFiles";

const bytes = (text: string) => new TextEncoder().encode(text);

// Reads a ZIP back through its end record and central directory, the way unzip tools do.
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  expect(at + centralSize).toBe(end);

  const entries = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    expect(view.getUint32(localOffset + 14, true)).toBe(crc);
    const localName = view.getUint16(localOffset + 26, true);
    const extra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localName + extra;
    entries.push({ name, method, crc, data: zip.slice(start, start + size) });
    at += 46 + nameLength;
  }
  return entries;
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for no bytes", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("makeZip", () => {
  it("writes stored entries a reader can list and extract", () => {
    const files = [
      { name: "01-spikeri-promenade-1.jpg", data: bytes("first photo") },
      { name: "02-warehouses-1.jpg", data: new Uint8Array([0xff, 0xd8, 0x00, 0xff, 0xd9]) },
    ];
    const entries = readZip(makeZip(files, new Date(2026, 8, 29, 14, 30, 10)));
    expect(entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
    entries.forEach((entry, i) => {
      expect(entry.method).toBe(0);
      expect(entry.data).toEqual(files[i].data);
      expect(entry.crc).toBe(crc32(files[i].data));
    });
  });

  it("writes an empty archive as just the end record", () => {
    expect(makeZip([]).length).toBe(22);
  });
});

describe("file names", () => {
  it("slugifies stop names to ASCII", () => {
    expect(slugify("Spīķeri promenade")).toBe("spikeri-promenade");
    expect(slugify("  Café — 'Rīga'!  ")).toBe("cafe-riga");
    expect(slugify("***")).toBe("photo");
  });

  it("stamps the local day", () => {
    expect(dayStamp(new Date(2026, 8, 3, 23, 50).toISOString())).toBe("2026-09-03");
  });
});

describe("saveFiles", () => {
  afterEach(() => vi.unstubAllGlobals());

  const photo = () => new File([bytes("jpeg")], "01-a-1.jpg", { type: "image/jpeg" });

  function phone(share: (data: ShareData) => Promise<void>) {
    vi.stubGlobal("navigator", { share, canShare: () => true });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
  }

  it("hands the files to the share sheet on a phone", async () => {
    const share = vi.fn(async () => {});
    phone(share);
    const files = [photo(), photo()];
    expect(await saveFiles(files, "x.zip")).toBe("shared");
    expect(share).toHaveBeenCalledWith({ files });
  });

  it("reports a cancelled share sheet", async () => {
    phone(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    expect(await saveFiles([photo()], "x.zip")).toBe("cancelled");
  });

  it("asks for another tap when the share sheet wants a fresh gesture", async () => {
    phone(async () => {
      throw new DOMException("no gesture", "NotAllowedError");
    });
    expect(await saveFiles([photo()], "x.zip")).toBe("needs-tap");
  });

  it("downloads one ZIP where files can't be shared", async () => {
    const clicked: { download: string; href: string }[] = [];
    let zipped: Blob | null = null;
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {
      createElement: () => {
        const a = { href: "", download: "", rel: "", click: () => clicked.push(a), remove: () => {} };
        return a;
      },
      body: { appendChild: () => {} },
    });
    vi.stubGlobal("URL", {
      createObjectURL: (blob: Blob) => {
        zipped = blob;
        return "blob:zip";
      },
      revokeObjectURL: () => {},
    });
    vi.useFakeTimers();
    try {
      expect(await saveFiles([photo(), new File([bytes("b")], "02-b-1.jpg")], "trail.zip")).toBe("downloaded");
    } finally {
      vi.useRealTimers();
    }
    expect(clicked).toEqual([expect.objectContaining({ download: "trail.zip", href: "blob:zip" })]);
    const entries = readZip(new Uint8Array(await zipped!.arrayBuffer()));
    expect(entries.map((e) => e.name)).toEqual(["01-a-1.jpg", "02-b-1.jpg"]);
  });
});
