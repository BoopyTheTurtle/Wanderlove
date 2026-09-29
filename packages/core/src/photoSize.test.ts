import { describe, expect, it } from "vitest";
import { fitWithin, MAX_PHOTO_EDGE } from "./photoSize";

describe("fitWithin", () => {
  it("leaves a photo that already fits untouched", () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(2048, 1536)).toEqual({ width: 2048, height: 1536 });
  });

  it("never upscales a small photo", () => {
    expect(fitWithin(10, 20)).toEqual({ width: 10, height: 20 });
  });

  it("scales a landscape photo to the long edge", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
  });

  it("scales a portrait photo to the long edge", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  });

  it("keeps a square square", () => {
    expect(fitWithin(5000, 5000)).toEqual({ width: 2048, height: 2048 });
  });

  it("rounds to whole pixels", () => {
    expect(fitWithin(4000, 3001)).toEqual({ width: 2048, height: 1537 });
  });

  it("never rounds a thin side to zero", () => {
    expect(fitWithin(100_000, 10)).toEqual({ width: 2048, height: 1 });
  });

  it("honours a custom limit", () => {
    expect(fitWithin(800, 600, 400)).toEqual({ width: 400, height: 300 });
  });

  it("defaults to 2048", () => {
    expect(MAX_PHOTO_EDGE).toBe(2048);
  });

  it("rejects dimensions that are not positive", () => {
    expect(() => fitWithin(0, 10)).toThrow(RangeError);
    expect(() => fitWithin(10, Number.NaN)).toThrow(RangeError);
  });
});
