// Candidate tag filter and quiet flag (route-safety.md §2.3). Each check reads only the tags on the stop itself; the
// areas around it are hazards.ts's job.

export type Tags = Record<string, string>;
export type Kind = { label: string; weight: number };

const WATER_EDGE = /^(pier|breakwater|groyne)$/;
const CLOSED_LANDUSE = /^(industrial|military|railway|landfill|brownfield)$/;

// Why a candidate must never become a stop, or null when its own tags raise nothing.
// The reason names the hazard from route-safety.md, so a simulation can count rejections per hazard.
export function tagRejection(tags: Tags): string | null {
  if (tags.memorial === "plaque" || tags.memorial === "stolperstein" || tags.artwork_type === "plaque") return "plaque";

  // H3, water: piers, slipways, beaches, bathing spots, fords, and the water itself.
  if (WATER_EDGE.test(tags.man_made ?? "")) return "H3-water";
  if (tags.leisure === "slipway" || tags.leisure === "swimming_area") return "H3-water";
  if (tags.natural === "beach" || tags.natural === "water" || tags.waterway === "riverbank") return "H3-water";
  if (tags.ford === "yes") return "H3-water";

  // H5, closed, private, military, and industrial land.
  if (tags.access === "private" || tags.access === "no") return "H5-closed";
  if (CLOSED_LANDUSE.test(tags.landuse ?? "") || tags.military || tags.aeroway === "aerodrome") return "H5-closed";
  if (tags.power === "plant" || tags.power === "substation") return "H5-closed";
  if (tags.man_made === "wastewater_plant" || tags.man_made === "works") return "H5-closed";
  if (tags.abandoned === "yes" || tags.disused === "yes") return "H5-closed";

  // H6, construction: a building site or anything under a disused:* lifecycle prefix.
  if (tags.landuse === "construction" || tags.construction) return "H6-construction";
  if (Object.keys(tags).some((k) => k.startsWith("disused:"))) return "H6-construction";

  // H8, quarries.
  if (tags.landuse === "quarry") return "H8-quarry";

  // Ruins stay only when managed: signposted as an attraction or open to the public. Unmanaged ruins (common Soviet
  // leftovers) can collapse. The same rule covers castle ruins tagged ruins=yes, so Sigulda's castle stays.
  const ruined = tags.historic === "ruins" || tags.building === "ruins" || tags.ruins === "yes";
  const managed = tags.tourism === "attraction" || tags.access === "yes" || tags.access === "permissive";
  if (ruined && !managed) return "ruins";

  return null;
}

// H14: places of remembrance and worship, where a silly game would offend. Containment in a cemetery is checked in
// hazards.ts, since it depends on the area around the stop.
export function isQuietTags(tags: Tags): boolean {
  return (
    tags.amenity === "place_of_worship" ||
    tags.historic === "memorial" ||
    tags.historic === "wayside_cross" ||
    tags.historic === "wayside_shrine" ||
    tags.historic === "tomb" ||
    tags.memorial !== undefined ||
    tags.landuse === "cemetery" ||
    tags.amenity === "grave_yard"
  );
}

// A named place worth a stop, weighted so landmarks come up more often than artworks.
export function classifyNamed(tags: Tags): Kind | null {
  if (tags.tourism === "viewpoint") return { label: "Viewpoint", weight: 4 };
  if (tags.tourism === "attraction") return { label: "Landmark", weight: 4 };
  if (tags.historic === "castle") return { label: "Castle", weight: 4 };
  if (tags.historic === "monument") return { label: "Monument", weight: 3 };
  if (tags.amenity === "place_of_worship" || tags.historic === "church") {
    const church = !tags.religion || tags.religion === "christian" || tags.historic === "church";
    return { label: church ? "Church" : "Place of worship", weight: 3 };
  }
  if (tags.leisure === "park" || tags.leisure === "garden") return { label: "Park", weight: 3 };
  if (tags.amenity === "fountain") return { label: "Fountain", weight: 2 };
  if (tags.tourism === "artwork") return { label: "Artwork", weight: 2 };
  if (tags.tourism === "museum" || tags.tourism === "gallery") return { label: "Museum", weight: 2 };
  if (tags.amenity === "marketplace") return { label: "Market", weight: 2 };
  if (tags.historic === "ruins" || tags.historic === "building") return { label: "Historic spot", weight: 2 };
  if (tags.historic === "memorial") return { label: "Memorial", weight: 1 };
  return null;
}

// An everyday point for areas with few named sights: a viewpoint, a park, a café or bakery, street art, a notable tree,
// or somewhere to sit, drink, or read the local board.
export function classifyGeneric(tags: Tags): Kind | null {
  if (tags.tourism === "viewpoint") return { label: "Viewpoint", weight: 3 };
  if (tags.leisure === "park") return { label: "Park", weight: 2 };
  if (tags.amenity === "cafe") return { label: "Café", weight: 2 };
  if (tags.amenity === "ice_cream") return { label: "Ice cream", weight: 2 };
  if (tags.shop === "bakery") return { label: "Bakery", weight: 2 };
  if (tags.amenity === "library") return { label: "Library", weight: 2 };
  if (tags.tourism === "artwork") return { label: "Street art", weight: 2 };
  if (tags.natural === "tree") return { label: "Tree", weight: 2 };
  if (tags.leisure === "picnic_table") return { label: "Picnic spot", weight: 1 };
  if (tags.amenity === "drinking_water") return { label: "Drinking fountain", weight: 1 };
  if (tags.amenity === "shelter") return { label: "Shelter", weight: 1 };
  if (tags.tourism === "information") return { label: "Notice board", weight: 1 };
  if (tags.amenity === "bench") return { label: "Bench", weight: 1 };
  return null;
}
