import type { Appearance } from "@wannadoo/core";
import { useId } from "react";
import { FRAME, MASK } from "./frame";
import { LAYER_ORDER, svgLayers, type LayerArt, type LayerId, type LayerResolver } from "./layers";

// The size from which a faint paper grain is laid over the art; below it the grain would only muddy the colours.
const GRAIN_FROM = 120;

// A colour matrix that multiplies each channel by the tint's, the same as a multiply blend over a greyscale image.
function tintMatrix(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (c / 255).toFixed(4));
  return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
}

function Layer({ id, art, uid }: { id: LayerId; art: Exclude<LayerArt, null>; uid: string }) {
  if ("svg" in art) return <g data-layer={id}>{art.svg}</g>;
  const filter = `${uid}-tint-${id}`;
  return (
    <g data-layer={id}>
      {art.tint && (
        <filter id={filter} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={tintMatrix(art.tint)} />
        </filter>
      )}
      <image
        href={art.href}
        x={0}
        y={0}
        width={FRAME}
        height={FRAME}
        preserveAspectRatio="none"
        filter={art.tint ? `url(#${filter})` : undefined}
      />
    </g>
  );
}

// An avatar: one inline SVG built from the layers in their fixed order and clipped to a circle. `layers` swaps in
// other art for single layers, such as painted raster parts.
export function Avatar({
  appearance,
  size = 64,
  label = "Avatar",
  layers,
}: {
  appearance: Appearance;
  size?: number;
  label?: string;
  layers?: Partial<Record<LayerId, LayerResolver>>;
}) {
  const uid = `av${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${FRAME} ${FRAME}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={`${uid}-mask`}>
          <circle cx={MASK.cx} cy={MASK.cy} r={MASK.r} />
        </clipPath>
        {size >= GRAIN_FROM && (
          <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0.5 -0.1" />
          </filter>
        )}
      </defs>
      <g clipPath={`url(#${uid}-mask)`}>
        {LAYER_ORDER.map((id) => {
          const art = (layers?.[id] ?? svgLayers[id])(appearance);
          return art && <Layer key={id} id={id} art={art} uid={uid} />;
        })}
        {size >= GRAIN_FROM && (
          <rect width={FRAME} height={FRAME} filter={`url(#${uid}-grain)`} opacity={0.35} pointerEvents="none" />
        )}
      </g>
    </svg>
  );
}
