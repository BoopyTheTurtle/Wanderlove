// The avatar model: the appearance record, the catalog of parts, random avatars, and tolerant parsing.
export type {
  AccessoryId,
  Appearance,
  ColourOption,
  FacialHair,
  HairStyle,
  PartOption,
  ScaleOption,
  TopStyle,
} from "./appearance";
export { DEFAULT_APPEARANCE, accentColour, avatarCatalog, parseAppearance, randomAppearance } from "./appearance";
