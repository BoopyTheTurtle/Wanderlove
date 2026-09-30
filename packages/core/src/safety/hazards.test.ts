import { describe, expect, it } from "vitest";
import { buildHazardIndex, checkContainment } from "./hazards";
import { multipolygon, offset, square, way } from "./testFixtures";

describe("containment filter", () => {
  // A lake 400 m across with a 100 m island. The outer ring comes as two member ways, one of them reversed, as
  // Overpass prints a multipolygon relation's members.
  const [sw, se, ne, nw] = square(offset(0, 0), 200);
  const lake = multipolygon(
    [
      { role: "outer", points: [sw, se, ne] },
      { role: "outer", points: [sw, nw, ne] },
      { role: "inner", points: square(offset(0, 0), 50) },
    ],
    { natural: "water" },
  );

  it("drops a point in a multipolygon lake but not one on its island", () => {
    const index = buildHazardIndex([lake]);
    expect(checkContainment(offset(120, 0), index).hazard).toBe("H3-water");
    expect(checkContainment(offset(0, 0), index).hazard).toBeNull();
    expect(checkContainment(offset(300, 0), index).hazard).toBeNull();
  });

  it("drops points on industrial, military, construction, and private land", () => {
    const index = buildHazardIndex([
      way(square(offset(1000, 0), 50), { landuse: "industrial" }),
      way(square(offset(2000, 0), 50), { military: "barracks" }),
      way(square(offset(3000, 0), 50), { landuse: "construction" }),
      way(square(offset(4000, 0), 50), { access: "private", leisure: "garden" }),
      way(square(offset(5000, 0), 50), { access: "private", highway: "service", area: "yes" }),
    ]);
    expect(checkContainment(offset(1000, 0), index).hazard).toBe("H5-closed");
    expect(checkContainment(offset(2000, 0), index).hazard).toBe("H5-closed");
    expect(checkContainment(offset(3000, 0), index).hazard).toBe("H6-construction");
    expect(checkContainment(offset(4000, 0), index).hazard).toBe("H5-closed");
    // A private road area is a way to walk on, not fenced grounds.
    expect(checkContainment(offset(5000, 0), index).hazard).toBeNull();
  });

  it("treats a way clipped by the query box as an area", () => {
    const [a, b, , d] = square(offset(0, 0), 100);
    const index = buildHazardIndex([way([a, b, null, d, a], { landuse: "quarry" })]);
    expect(checkContainment(offset(-50, 0), index).hazard).toBe("H8-quarry");
  });

  it("marks a point in a cemetery quiet without dropping it", () => {
    const index = buildHazardIndex([way(square(offset(0, 0), 100), { landuse: "cemetery" })]);
    expect(checkContainment(offset(0, 0), index)).toEqual({ hazard: null, quiet: true });
    expect(checkContainment(offset(300, 0), index)).toEqual({ hazard: null, quiet: false });
  });

  it("drops a point within 30 m of a cliff unless it is a built platform", () => {
    const index = buildHazardIndex([way([offset(0, -200), offset(0, 200)], { natural: "cliff" })]);
    expect(checkContainment(offset(20, 0), index, { tourism: "viewpoint" }).hazard).toBe("H8-cliff");
    expect(checkContainment(offset(20, 0), index, { man_made: "observation_platform" }).hazard).toBeNull();
    expect(checkContainment(offset(60, 0), index, { tourism: "viewpoint" }).hazard).toBeNull();
  });

  it("drops a point on a pier mapped as a line", () => {
    const index = buildHazardIndex([way([offset(0, 0), offset(150, 0)], { man_made: "pier" })]);
    expect(checkContainment(offset(100, 2), index).hazard).toBe("H3-water");
    expect(checkContainment(offset(100, 40), index).hazard).toBeNull();
  });
});
