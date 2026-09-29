import { describe, expect, it, vi } from "vitest";
import { trail } from "@wannadoo/core";
import { collageCells, collageRows, orderAlbum, pickCollage, stopFilePrefix } from "./album";
import type { RunPhoto } from "./photos";

// The helpers under test are pure; the client module only needs env vars that tests don't have.
vi.mock("./supabase", () => ({ supabase: {} }));

const [first, second] = trail.stops;

function photo(id: string, stopId: string, createdAt: string): RunPhoto {
  return { id, runId: "run-1", stopId, uploaderId: "u", width: 10, height: 10, createdAt, url: `https://x/${id}` };
}

describe("orderAlbum", () => {
  it("orders by stop, then by time, and names files by stop", () => {
    const items = orderAlbum(
      [
        photo("c", second.id, "2026-09-29T10:05:00Z"),
        photo("b", first.id, "2026-09-29T10:02:00Z"),
        photo("a", first.id, "2026-09-29T10:01:00Z"),
        photo("z", "gone-stop", "2026-09-29T09:00:00Z"),
      ],
      trail.stops,
    );
    expect(items.map((i) => i.photo.id)).toEqual(["a", "b", "c", "z"]);
    expect(items[0].fileName).toBe(`${stopFilePrefix(1, first.name)}-1.jpg`);
    expect(items[1].fileName).toBe(`${stopFilePrefix(1, first.name)}-2.jpg`);
    expect(items[2].fileName).toBe(`${stopFilePrefix(2, second.name)}-1.jpg`);
    expect(new Set(items.map((i) => i.fileName)).size).toBe(4);
  });

  it("prefixes with the padded stop number", () => {
    expect(stopFilePrefix(1, "Spīķeri promenade")).toBe("01-spikeri-promenade");
  });
});

describe("pickCollage", () => {
  const items = (stops: number[]) => stops.map((stopNumber, i) => ({ stopNumber, i }));

  it("keeps everything up to the limit", () => {
    expect(pickCollage(items([1, 1, 2]), 9)).toHaveLength(3);
  });

  it("shows every stop before any stop twice, in album order", () => {
    const picked = pickCollage(items([1, 1, 1, 1, 2, 3, 3, 4]), 5);
    expect(picked.map((p) => p.i)).toEqual([0, 1, 4, 5, 7]);
  });
});

describe("collage layout", () => {
  it("uses every photo up to nine", () => {
    for (let n = 1; n <= 9; n++) expect(collageRows(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it("fills the box edge to edge", () => {
    const box = { x: 72, y: 400, w: 936, h: 1100 };
    const cells = collageCells(5, box, 24);
    expect(cells).toHaveLength(5);
    const right = Math.max(...cells.map((c) => c.x + c.w));
    const bottom = Math.max(...cells.map((c) => c.y + c.h));
    expect(right).toBeCloseTo(box.x + box.w);
    expect(bottom).toBeCloseTo(box.y + box.h);
    expect(cells[0]).toMatchObject({ x: 72, y: 400 });
  });
});
