import { accentColour, avatarCatalog, type Appearance } from "@wannadoo/core";

// A varying colour as a main tone and the darker tone the art shades with.
export interface Tint {
  colour: string;
  shade: string;
}

// Every colour an appearance can vary, resolved once. SVG parts paint with these; a raster part takes one of them as
// its `tint` (README.md).
export interface Tints {
  skin: Tint;
  eyes: Tint;
  hair: Tint;
  brow: string;
  top: Tint;
  accent: Tint;
  background: Tint;
}

export function tintsOf(a: Appearance): Tints {
  const c = avatarCatalog;
  const hair = c.hairColour[a.hairColour];
  return {
    skin: c.skin[a.skin],
    eyes: c.eyes[a.eyes],
    hair,
    // Grey and white brows read as missing on light skin, so they take the darker tone.
    brow: a.hairColour >= 6 ? "#8c8780" : hair.shade,
    top: c.topColour[a.topColour],
    accent: accentColour(a),
    background: c.background[a.background],
  };
}
