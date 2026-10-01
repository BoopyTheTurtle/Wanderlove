import { describe, expect, it } from "vitest";
import { classifyGeneric, isQuietTags, tagRejection } from "./filters";

describe("tagRejection", () => {
  it.each([
    [{ historic: "memorial", memorial: "plaque" }, "plaque"],
    [{ historic: "memorial", memorial: "stolperstein" }, "plaque"],
    [{ tourism: "viewpoint", man_made: "pier" }, "H3-water"],
    [{ tourism: "attraction", natural: "beach" }, "H3-water"],
    [{ leisure: "swimming_area" }, "H3-water"],
    [{ leisure: "slipway" }, "H3-water"],
    [{ leisure: "garden", access: "private" }, "H5-closed"],
    [{ tourism: "artwork", landuse: "industrial" }, "H5-closed"],
    [{ historic: "building", abandoned: "yes" }, "H5-closed"],
    [{ historic: "building", disused: "yes" }, "H5-closed"],
    [{ historic: "building", amenity: "school" }, "H5-school"],
    [{ amenity: "fountain", "disused:amenity": "fountain" }, "H6-construction"],
    [{ tourism: "attraction", construction: "yes" }, "H6-construction"],
    [{ tourism: "viewpoint", landuse: "quarry" }, "H8-quarry"],
    [{ historic: "ruins" }, "ruins"],
    [{ historic: "building", building: "ruins" }, "ruins"],
  ])("rejects %o as %s", (tags, reason) => {
    expect(tagRejection(tags)).toBe(reason);
  });

  it.each([
    [{ tourism: "attraction" }],
    [{ historic: "ruins", tourism: "attraction" }],
    [{ historic: "ruins", access: "permissive" }],
    [{ historic: "castle", ruins: "yes", tourism: "attraction" }],
    [{ historic: "memorial", memorial: "statue" }],
  ])("keeps %o", (tags) => {
    expect(tagRejection(tags)).toBeNull();
  });
});

describe("isQuietTags", () => {
  it.each<Record<string, string>>([
    { amenity: "place_of_worship" },
    { historic: "memorial" },
    { historic: "wayside_cross" },
    { historic: "wayside_shrine" },
    { historic: "tomb" },
    { tourism: "artwork", memorial: "statue" },
    { landuse: "cemetery" },
  ])("marks %o quiet", (tags) => {
    expect(isQuietTags(tags)).toBe(true);
  });

  it("leaves ordinary stops alone", () => {
    expect(isQuietTags({ tourism: "attraction" })).toBe(false);
    expect(isQuietTags({ leisure: "park" })).toBe(false);
  });
});

describe("classifyGeneric", () => {
  it("accepts everyday places as fallback points", () => {
    expect(classifyGeneric({ amenity: "bench" })?.label).toBe("Bench");
    expect(classifyGeneric({ tourism: "viewpoint" })?.label).toBe("Viewpoint");
    expect(classifyGeneric({ leisure: "park" })?.label).toBe("Park");
    expect(classifyGeneric({ amenity: "cafe", name: "Kafija" })?.label).toBe("Café");
    expect(classifyGeneric({ shop: "bakery" })?.label).toBe("Bakery");
    expect(classifyGeneric({ natural: "tree", denotation: "natural_monument" })?.label).toBe("Tree");
    expect(classifyGeneric({ tourism: "artwork" })?.label).toBe("Street art");
    expect(classifyGeneric({ leisure: "picnic_table" })?.label).toBe("Picnic spot");
    expect(classifyGeneric({ amenity: "waste_basket" })).toBeNull();
  });
});
