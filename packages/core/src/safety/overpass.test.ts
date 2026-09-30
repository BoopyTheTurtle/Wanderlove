import { describe, expect, it } from "vitest";
import { OVERPASS_SECTIONS, overpassQuery, splitSections } from "./overpass";
import { START, node, overpassResponse, way } from "./testFixtures";

// Nothing here reaches Overpass; these checks guard the query's shape against edits that break the section split.
describe("overpassQuery", () => {
  const query = overpassQuery(START, 900);

  it("is one request with a count marker after every section", () => {
    expect(query.match(/\[out:json\]/g)).toHaveLength(1);
    expect(query.match(/ out count;/g)).toHaveLength(OVERPASS_SECTIONS.length);
  });

  it("balances its brackets and ends every statement", () => {
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
    ]) {
      expect(query.split(open).length).toBe(query.split(close).length);
    }
    for (const line of query.split("\n").slice(1)) {
      if (line.trim() !== "(") expect(line.trim()).toMatch(/;$/);
    }
  });

  it("fetches parks, woods, railway tracks and crossings, and service roads on closed land", () => {
    expect(query).toContain("wr[leisure=park];");
    expect(query).toContain("wr[natural=wood];");
    expect(query).toContain('way[railway~"^(rail|light_rail)$"]->.rails;');
    expect(query).toContain('node(w.rails)[railway~"^(crossing|level_crossing)$"]->.railX;');
    expect(query).toContain(".closedLand map_to_area->.closedAreas;");
    expect(query).toContain('way[highway~"^(service|track)$"](area.closedAreas)->.closedService;');
  });
});

describe("splitSections", () => {
  it("splits a response at its count markers", () => {
    const rail = way([START, START], { railway: "rail" });
    const sections = splitSections(overpassResponse({ rails: [rail], railCrossings: [node(START)] }).elements)!;
    expect(Object.keys(sections)).toEqual([...OVERPASS_SECTIONS]);
    expect(sections.rails).toEqual([rail]);
    expect(sections.railCrossings).toHaveLength(1);
    expect(sections.candidates).toEqual([]);
  });

  it("rejects a response cut short", () => {
    const { elements } = overpassResponse({});
    expect(splitSections(elements.slice(0, -1))).toBeNull();
  });
});
