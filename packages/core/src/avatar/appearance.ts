// The avatar appearance record (roadmap stage 5): the chosen parts, and nothing else. It holds no gender; `face` runs
// from more angular to softer features and build, and every part is open to every face.

export type HairStyle = "bald" | "receding" | "buzz" | "short" | "tousled" | "curly" | "bob" | "long" | "bun" | "braid";

export type FacialHair = "none" | "stubble" | "beard";

export type TopStyle = "hoodie" | "jumper" | "denim" | "stripes" | "tshirt" | "cardigan";

export type AccessoryId = "glasses" | "beanie" | "earrings" | "scarf";

export interface Appearance {
  // 0 angular features and a broader build, 1 in between, 2 softer features and a narrower build.
  face: number;
  // 0 younger, 1 middle, 2 older.
  age: number;
  // Index into avatarCatalog.skin, light to deep.
  skin: number;
  // Index into avatarCatalog.eyes.
  eyes: number;
  hair: HairStyle;
  // Index into avatarCatalog.hairColour.
  hairColour: number;
  facialHair: FacialHair;
  top: TopStyle;
  // Index into avatarCatalog.topColour.
  topColour: number;
  // In catalog order, without repeats.
  accessories: AccessoryId[];
  // Index into avatarCatalog.background.
  background: number;
}

// A step on a scale, such as face or age.
export interface ScaleOption {
  id: number;
  label: string;
}

// A colour choice: `colour` is the main tone, `shade` the darker tone the art uses for gentle shading.
export interface ColourOption {
  id: number;
  label: string;
  colour: string;
  shade: string;
}

export interface PartOption<Id extends string> {
  id: Id;
  label: string;
}

export const avatarCatalog = {
  face: [
    { id: 0, label: "Angular" },
    { id: 1, label: "In between" },
    { id: 2, label: "Soft" },
  ],
  age: [
    { id: 0, label: "Younger" },
    { id: 1, label: "Middle" },
    { id: 2, label: "Older" },
  ],
  skin: [
    { id: 0, label: "Porcelain", colour: "#fbe1d1", shade: "#efc4ae" },
    { id: 1, label: "Fair", colour: "#f7d2b6", shade: "#e9b494" },
    { id: 2, label: "Light", colour: "#f2c39f", shade: "#e1a57e" },
    { id: 3, label: "Warm beige", colour: "#e4ae82", shade: "#d09165" },
    { id: 4, label: "Olive", colour: "#d1a070", shade: "#b98557" },
    { id: 5, label: "Tan", colour: "#bf8557", shade: "#a66b42" },
    { id: 6, label: "Brown", colour: "#9b6142", shade: "#814b30" },
    { id: 7, label: "Deep", colour: "#6f4531", shade: "#583423" },
  ],
  eyes: [
    { id: 0, label: "Dark brown", colour: "#2a1c17", shade: "#170f0c" },
    { id: 1, label: "Brown", colour: "#4b2f20", shade: "#2e1c13" },
    { id: 2, label: "Hazel", colour: "#5c4824", shade: "#3a2d16" },
    { id: 3, label: "Green", colour: "#2f4d36", shade: "#1d3122" },
    { id: 4, label: "Blue", colour: "#2f4f72", shade: "#1d3249" },
    { id: 5, label: "Grey", colour: "#4b5560", shade: "#2f363d" },
  ],
  hair: [
    { id: "bald", label: "Bald" },
    { id: "receding", label: "Receding" },
    { id: "buzz", label: "Buzz cut" },
    { id: "short", label: "Short" },
    { id: "tousled", label: "Tousled" },
    { id: "curly", label: "Curly" },
    { id: "bob", label: "Bob with fringe" },
    { id: "long", label: "Long" },
    { id: "bun", label: "Curly bun" },
    { id: "braid", label: "Side braid" },
  ],
  hairColour: [
    { id: 0, label: "Black", colour: "#3a2c28", shade: "#231a18" },
    { id: 1, label: "Dark brown", colour: "#5c3b27", shade: "#432a1b" },
    { id: 2, label: "Brown", colour: "#8a5a38", shade: "#6c4329" },
    { id: 3, label: "Auburn", colour: "#9c4a2c", shade: "#7a3720" },
    { id: 4, label: "Ginger", colour: "#cf7a3e", shade: "#ae5f2b" },
    { id: 5, label: "Blonde", colour: "#e3ba6a", shade: "#c9994b" },
    { id: 6, label: "Grey", colour: "#bab6b1", shade: "#96918b" },
    { id: 7, label: "White", colour: "#efebe5", shade: "#d2cbc2" },
  ],
  facialHair: [
    { id: "none", label: "None" },
    { id: "stubble", label: "Stubble" },
    { id: "beard", label: "Beard" },
  ],
  top: [
    { id: "hoodie", label: "Hoodie" },
    { id: "jumper", label: "Knit jumper" },
    { id: "denim", label: "Denim jacket" },
    { id: "stripes", label: "Striped shirt" },
    { id: "tshirt", label: "T-shirt" },
    { id: "cardigan", label: "Cardigan" },
  ],
  topColour: [
    { id: 0, label: "Sage", colour: "#8fa17c", shade: "#768868" },
    { id: 1, label: "Cream", colour: "#f2e6cf", shade: "#ddcdaf" },
    { id: 2, label: "Denim blue", colour: "#7f9fc4", shade: "#6586ac" },
    { id: 3, label: "Navy", colour: "#34405e", shade: "#262f47" },
    { id: 4, label: "Coral", colour: "#e98a70", shade: "#d0705a" },
    { id: 5, label: "Wine", colour: "#8b3a4e", shade: "#6f2b3c" },
    { id: 6, label: "Mustard", colour: "#d8a443", shade: "#bb8a2f" },
    { id: 7, label: "Forest", colour: "#55704f", shade: "#42593e" },
  ],
  accessories: [
    { id: "glasses", label: "Round glasses" },
    { id: "beanie", label: "Beanie" },
    { id: "earrings", label: "Earrings" },
    { id: "scarf", label: "Scarf" },
  ],
  background: [
    { id: 0, label: "Dusty rose", colour: "#f6dcd3", shade: "#ecc8bc" },
    { id: 1, label: "Coral", colour: "#f2806a", shade: "#e36b55" },
    { id: 2, label: "Soft wine", colour: "#a85d6e", shade: "#94495b" },
    { id: 3, label: "Peach", colour: "#f7c4a7", shade: "#ecae8c" },
    { id: 4, label: "Mauve", colour: "#d6a6b0", shade: "#c48f9b" },
  ],
} satisfies {
  face: ScaleOption[];
  age: ScaleOption[];
  skin: ColourOption[];
  eyes: ColourOption[];
  hair: PartOption<HairStyle>[];
  hairColour: ColourOption[];
  facialHair: PartOption<FacialHair>[];
  top: PartOption<TopStyle>[];
  topColour: ColourOption[];
  accessories: PartOption<AccessoryId>[];
  background: ColourOption[];
};

export const DEFAULT_APPEARANCE: Appearance = {
  face: 1,
  age: 1,
  skin: 2,
  eyes: 0,
  hair: "short",
  hairColour: 2,
  facialHair: "none",
  top: "jumper",
  topColour: 0,
  accessories: [],
  background: 0,
};

// The colour that beanies and scarves take: a fixed step round the top colours, so they contrast with the top.
export function accentColour(appearance: Appearance): ColourOption {
  const colours = avatarCatalog.topColour;
  return colours[(appearance.topColour + 4) % colours.length];
}

type Random = () => number;

const pick = <T>(items: readonly T[], random: Random): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

const indexIn = (items: readonly unknown[], random: Random) => pick([...items.keys()], random);

// A random avatar for a skipped onboarding step or the Randomise button. Older faces lean towards grey and white hair,
// and facial hair stays the exception; every other part is equally likely.
export function randomAppearance(random: Random = Math.random): Appearance {
  const c = avatarCatalog;
  const age = indexIn(c.age, random);
  const greyIds = [6, 7];
  const hairColour =
    age === 2 && random() < 0.6 ? pick(greyIds, random) : pick([0, 1, 2, 3, 4, 5].concat(age === 0 ? [] : [6]), random);
  const roll = random();
  const facialHair: FacialHair = roll < 0.65 ? "none" : roll < 0.82 ? "stubble" : "beard";
  return {
    face: indexIn(c.face, random),
    age,
    skin: indexIn(c.skin, random),
    eyes: indexIn(c.eyes, random),
    hair: pick(c.hair, random).id,
    hairColour,
    facialHair,
    top: pick(c.top, random).id,
    topColour: indexIn(c.topColour, random),
    accessories: c.accessories.filter(() => random() < 0.22).map((a) => a.id),
    background: indexIn(c.background, random),
  };
}

function index(value: unknown, count: number, fallback: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(count - 1, Math.max(0, Math.round(n)));
}

function oneOf<Id extends string>(value: unknown, options: readonly PartOption<Id>[], fallback: Id): Id {
  return options.find((o) => o.id === value)?.id ?? fallback;
}

// Reads an appearance from untrusted data, such as a profile row from the server or an older app version's record. It
// never throws: a missing or unknown field takes its default, a number out of range is clamped, extra keys are
// dropped. A JSON string is parsed first.
export function parseAppearance(json: unknown): Appearance {
  let data: unknown = json;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  const raw = (data !== null && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<
    string,
    unknown
  >;
  const c = avatarCatalog;
  const d = DEFAULT_APPEARANCE;
  const wanted = Array.isArray(raw.accessories) ? raw.accessories : [];
  return {
    face: index(raw.face, c.face.length, d.face),
    age: index(raw.age, c.age.length, d.age),
    skin: index(raw.skin, c.skin.length, d.skin),
    eyes: index(raw.eyes, c.eyes.length, d.eyes),
    hair: oneOf(raw.hair, c.hair, d.hair),
    hairColour: index(raw.hairColour, c.hairColour.length, d.hairColour),
    facialHair: oneOf(raw.facialHair, c.facialHair, d.facialHair),
    top: oneOf(raw.top, c.top, d.top),
    topColour: index(raw.topColour, c.topColour.length, d.topColour),
    accessories: c.accessories.filter((a) => wanted.includes(a.id)).map((a) => a.id),
    background: index(raw.background, c.background.length, d.background),
  };
}
