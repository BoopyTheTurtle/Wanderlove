import type { Appearance, HairStyle } from "@wannadoo/core";
import type { ReactNode } from "react";
import { Clipped } from "../Clipped";
import { CX, FRAME, HAT_LINE } from "../frame";
import type { Tint, Tints } from "../tints";

// A curl: the shade peeks out below and right of the main tone, which gives a bumpy, rounded edge.
function curl(x: number, y: number, r: number, h: Tint) {
  return (
    <g key={`${x},${y}`}>
      <circle cx={x + 3} cy={y + 5} r={r} fill={h.shade} />
      <circle cx={x} cy={y} r={r - 3} fill={h.colour} />
    </g>
  );
}

// Curls along an arc round the head, from `from` to `to` degrees (0 is to the right, 90 straight up).
function curlArc(cy: number, radius: number, from: number, to: number, step: number, r: number, h: Tint) {
  const out: ReactNode[] = [];
  for (let deg = from; deg >= to; deg -= step) {
    const rad = (deg * Math.PI) / 180;
    out.push(curl(CX + radius * Math.cos(rad), cy - radius * Math.sin(rad), r, h));
  }
  return out;
}

// Mirrors a shape drawn for the left side onto the right.
const mirrored = (children: ReactNode) => (
  <>
    {children}
    <g transform={`translate(${FRAME} 0) scale(-1 1)`}>{children}</g>
  </>
);

type Part = (h: Tint) => ReactNode;

const back: Partial<Record<HairStyle, Part>> = {
  curly: (h) => (
    <>
      {curl(150, 250, 24, h)}
      {curl(362, 250, 24, h)}
    </>
  ),
  bob: (h) => (
    <path
      d="M 138 334 C 112 240, 126 118, 200 94 C 232 84, 280 84, 312 94 C 386 118, 400 240, 374 334 C 352 342, 160 342, 138 334 Z"
      fill={h.shade}
    />
  ),
  long: (h) => (
    <path
      d="M 160 160 C 110 240, 124 300, 108 360 C 96 410, 116 440, 100 490 L 100 530 L 412 530 L 412 490 C 396 440, 416 410, 404 360 C 388 300, 402 240, 352 160 Z"
      fill={h.shade}
    />
  ),
  bun: (h) => (
    <>
      {[
        [256, 76, 24],
        [230, 88, 20],
        [282, 88, 20],
        [244, 62, 16],
        [270, 62, 16],
        [256, 98, 20],
      ].map(([x, y, r]) => curl(x, y, r, h))}
      {curl(150, 248, 16, h)}
      {curl(362, 248, 16, h)}
    </>
  ),
  braid: (h) => <path d="M 150 230 C 140 150, 190 96, 256 96 C 322 96, 372 150, 362 230 Z" fill={h.shade} />,
};

const front: Partial<Record<HairStyle, Part>> = {
  receding: (h) =>
    mirrored(
      <>
        <path
          d="M 148 238 C 142 214, 146 190, 158 172 C 166 190, 170 212, 176 232 C 166 232, 156 234, 148 238 Z"
          fill={h.colour}
        />
        <path d="M 154 232 C 152 214, 154 198, 160 186 C 162 202, 164 216, 168 230 Z" fill={h.shade} />
      </>,
    ),
  buzz: (h) => (
    <>
      <path
        d="M 152 226 C 146 146, 190 100, 256 100 C 322 100, 366 146, 360 226 L 352 224 C 350 196, 340 178, 326 168 Q 256 154 186 168 C 172 178, 162 196, 160 224 Z"
        fill={h.colour}
        opacity={0.9}
      />
      <path d="M 186 168 Q 256 154 326 168 Q 256 162 186 168 Z" fill={h.shade} />
    </>
  ),
  short: (h) => (
    <>
      <path
        d="M 146 238 C 134 150, 180 86, 256 86 C 336 86, 380 150, 366 238 L 354 238 C 354 208, 346 188, 334 176 C 300 190, 250 186, 220 166 C 206 180, 190 186, 176 186 C 166 200, 160 218, 158 238 Z"
        fill={h.colour}
      />
      <path d="M 220 166 C 252 142, 306 136, 340 156 C 304 150, 262 154, 220 166 Z" fill={h.shade} />
      <path d="M 176 186 C 172 150, 196 118, 232 108 C 206 128, 190 156, 176 186 Z" fill={h.shade} />
    </>
  ),
  tousled: (h) => (
    <>
      <path
        d="M 146 242 C 130 200, 132 150, 156 124 C 148 102, 170 82, 196 88 C 204 64, 238 60, 254 76 C 270 56, 306 62, 314 84 C 338 80, 362 100, 358 126 C 382 150, 380 202, 366 242 L 354 242 C 354 214, 348 196, 338 184 C 330 196, 318 200, 304 196 C 310 186, 308 176, 304 170 C 290 188, 268 194, 246 190 C 252 182, 252 174, 248 168 C 234 186, 210 192, 188 186 C 194 178, 194 172, 190 166 C 176 184, 166 206, 162 242 Z"
        fill={h.colour}
      />
      <path d="M 196 88 C 216 96, 228 110, 232 128 C 218 114, 206 104, 186 100 Z" fill={h.shade} />
      <path d="M 314 84 C 300 100, 296 116, 300 134 C 288 116, 286 100, 296 84 Z" fill={h.shade} />
      <path d="M 156 124 C 172 128, 182 140, 186 156 C 172 146, 164 140, 150 140 Z" fill={h.shade} />
    </>
  ),
  curly: (h) => (
    <>
      <path
        d="M 156 232 C 148 140, 196 98, 256 98 C 316 98, 364 140, 356 232 L 342 222 C 332 184, 300 172, 256 172 C 212 172, 180 184, 170 222 Z"
        fill={h.colour}
      />
      {curlArc(206, 102, 200, -20, 20, 30, h)}
      {[
        [178, 196],
        [204, 176],
        [236, 168],
        [270, 168],
        [302, 174],
        [330, 192],
      ].map(([x, y]) => curl(x, y, 18, h))}
    </>
  ),
  bob: (h) => (
    <>
      <path
        d="M 140 330 C 126 230, 140 120, 210 96 C 240 86, 290 88, 320 100 C 380 128, 388 230, 372 330 C 362 338, 350 338, 342 332 C 348 280, 350 232, 346 202 C 340 192, 330 194, 322 196 C 290 202, 222 202, 190 196 C 180 194, 170 194, 166 202 C 162 232, 164 280, 170 332 C 160 338, 150 338, 140 330 Z"
        fill={h.colour}
      />
      <path d="M 214 196 C 216 160, 236 128, 266 114 C 248 136, 236 164, 232 198 Z" fill={h.shade} />
      <path d="M 150 300 C 142 250, 146 200, 160 168 C 156 214, 156 260, 162 318 Z" fill={h.shade} />
    </>
  ),
  long: (h) =>
    mirrored(
      <>
        <path
          d="M 258 94 C 196 90, 148 130, 144 212 C 140 260, 150 290, 140 330 C 130 370, 150 400, 138 440 C 130 466, 146 482, 172 490 C 168 466, 182 446, 176 420 C 170 390, 186 366, 178 336 C 170 300, 176 262, 174 222 C 178 176, 214 134, 258 112 Z"
          fill={h.colour}
        />
        <path
          d="M 158 240 C 166 280, 150 310, 158 350 C 164 380, 150 410, 156 450 C 166 420, 170 390, 165 350 C 160 320, 172 290, 164 240 Z"
          fill={h.shade}
        />
      </>,
    ),
  bun: (h) => (
    <>
      <path
        d="M 150 238 C 140 150, 188 94, 256 94 C 324 94, 372 150, 362 238 L 350 236 C 350 196, 330 160, 300 150 C 270 142, 242 142, 212 150 C 182 160, 164 196, 162 236 Z"
        fill={h.colour}
      />
      <path d="M 212 150 C 230 128, 262 118, 296 124 C 268 128, 240 136, 212 150 Z" fill={h.shade} />
    </>
  ),
  braid: (h) => (
    <>
      <path
        d="M 146 246 C 136 150, 186 88, 256 88 C 330 88, 378 150, 364 240 L 352 238 C 350 200, 336 176, 316 166 C 280 160, 234 170, 204 188 C 184 200, 166 220, 160 250 Z"
        fill={h.colour}
      />
      <path d="M 204 188 C 230 160, 280 150, 330 162 C 290 160, 246 168, 204 188 Z" fill={h.shade} />
      <path d="M 168 244 C 184 300, 194 380, 196 462 L 166 462 C 164 380, 154 300, 138 252 Z" fill={h.colour} />
      {[262, 286, 310, 334, 358, 382, 406, 430].map((y, i) => {
        const x = 158 + i * 3.6;
        return (
          <path
            key={y}
            d={`M ${x - 15} ${y} Q ${x} ${y + 14} ${x + 15} ${y - 2}`}
            fill="none"
            stroke={h.shade}
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      })}
      <path d="M 170 466 C 162 488, 168 506, 180 516 C 186 504, 194 486, 192 466 Z" fill={h.colour} />
      <rect x={166} y={456} width={30} height={12} rx={6} fill={h.shade} />
    </>
  ),
};

const hatted = (a: Appearance) => a.accessories.includes("beanie");
const belowHat = `M 0 ${HAT_LINE.y} H ${FRAME} V ${FRAME} H 0 Z`;

function underHat(a: Appearance, art: ReactNode) {
  return hatted(a) ? <Clipped d={belowHat}>{art}</Clipped> : art;
}

// Hair behind the head and shoulders. A beanie hides what sits above its cuff, so a bun gives way to it.
export function backHair(a: Appearance, t: Tints) {
  const part = back[a.hair];
  if (!part || (a.hair === "bun" && hatted(a))) return null;
  return underHat(a, part(t.hair));
}

// Hair over the forehead and in front of the ears.
export function frontHair(a: Appearance, t: Tints) {
  const part = front[a.hair];
  return part ? underHat(a, part(t.hair)) : null;
}
