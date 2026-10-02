import type { Appearance } from "@wannadoo/core";

// The shared frame every avatar layer draws in (README.md): a 512 by 512 square, so a painted part made at 512 px
// drops in full-frame without any offset.
export const FRAME = 512;

// The circle mask that clips every layer.
export const MASK = { cx: 256, cy: 256, r: 256 } as const;

// The SVG parts are drawn in an art space with the head at a comfortable working size, then scaled up about
// ART_PIVOT so the figure fills the circle like the style sheet's. Raster parts ignore this: they are full-frame.
export const ART_SCALE = 1.14;
const ART_PIVOT = { x: 256, y: 300 };
export const ART_TRANSFORM = `translate(${ART_PIVOT.x} ${ART_PIVOT.y}) scale(${ART_SCALE}) translate(${-ART_PIVOT.x} ${-ART_PIVOT.y})`;

const frameY = (y: number) => Math.round(ART_PIVOT.y + (y - ART_PIVOT.y) * ART_SCALE);
const frameDx = (dx: number) => Math.round(dx * ART_SCALE);

// Art-space geometry, shared by the SVG parts.
export const CX = 256;
// The middle of the skull from crown to chin.
export const HEAD_CENTRE = { x: CX, y: 222 } as const;
// The head's fixed outline: crown, the widest point of the skull (half-width), and chin.
export const HEAD = { top: 108, halfWidth: 100, chin: 334 } as const;
// The height of both pupils, and each eye's distance from the centre line.
export const EYE_LINE = { y: 240, dx: 44 } as const;
// The top of the shoulders.
export const SHOULDER_LINE = { y: 412 } as const;
// The bottom edge of a hat's dome: hair above it hides under the hat.
export const HAT_LINE = { y: 150 } as const;

// The anchors of the layer contract, in frame coordinates. Painted parts line up on these.
export const ANCHORS = {
  headCentre: { x: CX, y: frameY(HEAD_CENTRE.y) },
  crown: { y: frameY(HEAD.top) },
  chin: { y: frameY(HEAD.chin) },
  headHalfWidth: frameDx(HEAD.halfWidth),
  eyeLine: { y: frameY(EYE_LINE.y), left: CX - frameDx(EYE_LINE.dx), right: CX + frameDx(EYE_LINE.dx) },
  shoulderLine: { y: frameY(SHOULDER_LINE.y) },
  hatLine: { y: frameY(HAT_LINE.y) },
  mask: MASK,
} as const;

// The variable proportions within the fixed anchors: face sets the jaw, neck and shoulders; age fills out the cheeks.
export interface Build {
  // Half-width of the jaw's turn towards the chin; larger reads squarer.
  jaw: number;
  // How far the lower cheeks swell beyond the skull's half-width.
  cheek: number;
  // Half-width of the neck.
  neck: number;
  // Half-width of the shoulders.
  shoulders: number;
}

export function buildOf(a: Appearance): Build {
  return {
    jaw: [76, 64, 52][a.face],
    cheek: [2, 3, 8][a.age],
    neck: [40, 35, 30][a.face],
    shoulders: [184, 170, 156][a.face],
  };
}

// The head's outline for a build, from the crown clockwise.
export function headPath(b: Build): string {
  const { top, halfWidth: w, chin } = HEAD;
  const L = CX - w;
  const R = CX + w;
  return [
    `M ${CX} ${top}`,
    `C ${CX + 60} ${top}, ${R} ${top + 42}, ${R} ${HEAD_CENTRE.y}`,
    `C ${R + b.cheek} ${HEAD_CENTRE.y + 52}, ${CX + b.jaw} ${chin}, ${CX} ${chin}`,
    `C ${CX - b.jaw} ${chin}, ${L - b.cheek} ${HEAD_CENTRE.y + 52}, ${L} ${HEAD_CENTRE.y}`,
    `C ${L} ${top + 42}, ${CX - 60} ${top}, ${CX} ${top} Z`,
  ].join(" ");
}
