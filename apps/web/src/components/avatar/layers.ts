import type { Appearance } from "@wannadoo/core";
import { createElement, type ReactNode } from "react";
import { ART_TRANSFORM, FRAME } from "./frame";
import { accessories } from "./parts/accessories";
import { body } from "./parts/body";
import { ears, facialHair, features, head } from "./parts/face";
import { backHair, frontHair } from "./parts/hair";
import { tintsOf, type Tints } from "./tints";

// One layer's art, drawn in the shared 512 by 512 frame (README.md). `svg` is SVG content; `href` is a raster image
// placed full-frame, multiplied by `tint` when given, so a greyscale painted part takes the appearance's colour.
// `null` leaves the layer empty.
export type LayerArt = { svg: ReactNode } | { href: string; tint?: string } | null;

export type LayerResolver = (appearance: Appearance) => LayerArt;

// The fixed drawing order, back to front.
export const LAYER_ORDER = [
  "background",
  "backHair",
  "body",
  "head",
  "ears",
  "features",
  "facialHair",
  "frontHair",
  "accessories",
] as const;

export type LayerId = (typeof LAYER_ORDER)[number];

// An SVG part drawn in art space, placed in the frame by ART_TRANSFORM.
const svgLayer =
  (draw: (a: Appearance, t: Tints) => ReactNode): LayerResolver =>
  (a) => {
    const art = draw(a, tintsOf(a));
    return art === null ? null : { svg: createElement("g", { transform: ART_TRANSFORM }, art) };
  };

// The hand-drawn SVG parts.
export const svgLayers: Record<LayerId, LayerResolver> = {
  background: (a) => ({
    svg: createElement("rect", { width: FRAME, height: FRAME, fill: tintsOf(a).background.colour }),
  }),
  backHair: svgLayer(backHair),
  body: svgLayer(body),
  head: svgLayer(head),
  ears: svgLayer(ears),
  features: svgLayer(features),
  facialHair: svgLayer(facialHair),
  frontHair: svgLayer(frontHair),
  accessories: svgLayer(accessories),
};
