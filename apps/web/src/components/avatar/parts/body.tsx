import type { Appearance } from "@wannadoo/core";
import { Clipped } from "../Clipped";
import { CX, HEAD, SHOULDER_LINE, buildOf, type Build } from "../frame";
import type { Tint, Tints } from "../tints";

const TEE = "#f6efe4";
const TEE_SHADE = "#e4d9c8";
const BOTTOM = 530;
// Where the top meets the neck.
const COLLAR_Y = SHOULDER_LINE.y - 18;

function torso(b: Build): string {
  const S = b.shoulders;
  const n = b.neck + 14;
  const y = SHOULDER_LINE.y;
  return [
    `M ${CX - S} ${BOTTOM} L ${CX - S} ${y + 66}`,
    `C ${CX - S} ${y + 24}, ${CX - S + 34} ${y + 6}, ${CX - S + 78} ${y}`,
    `L ${CX - n} ${COLLAR_Y} L ${CX + n} ${COLLAR_Y} L ${CX + S - 78} ${y}`,
    `C ${CX + S - 34} ${y + 6}, ${CX + S} ${y + 24}, ${CX + S} ${y + 66}`,
    `L ${CX + S} ${BOTTOM} Z`,
  ].join(" ");
}

// The soft creases where the arms meet the body.
function armFolds(b: Build, shade: string) {
  return [-1, 1].map((side) => {
    const x = CX + side * (b.shoulders - 52);
    return (
      <path
        key={side}
        d={`M ${x} ${SHOULDER_LINE.y + 26} Q ${x - side * 8} ${SHOULDER_LINE.y + 60} ${x + side * 2} ${BOTTOM} L ${x + side * 12} ${BOTTOM} Q ${x} ${SHOULDER_LINE.y + 60} ${x} ${SHOULDER_LINE.y + 26} Z`}
        fill={shade}
      />
    );
  });
}

// A round neckline: a band in `band`, with the skin of the neck showing inside it.
function crewNeck(b: Build, skin: string, band: string, depth = 24) {
  const n = b.neck;
  return (
    <>
      <path
        d={`M ${CX - n - 12} ${COLLAR_Y} Q ${CX} ${COLLAR_Y + depth * 2 + 20} ${CX + n + 12} ${COLLAR_Y} Z`}
        fill={band}
      />
      <path d={`M ${CX - n} ${COLLAR_Y - 2} Q ${CX} ${COLLAR_Y + depth * 2} ${CX + n} ${COLLAR_Y - 2} Z`} fill={skin} />
    </>
  );
}

// An open front over a tee: the tee's panel, its neckline, and the jacket edges either side.
function openFront(b: Build, t: Tints, edge: Tint, width: number) {
  const n = b.neck;
  return (
    <>
      <path
        d={`M ${CX - n - 10} ${COLLAR_Y} L ${CX + n + 10} ${COLLAR_Y} L ${CX + width} ${BOTTOM} L ${CX - width} ${BOTTOM} Z`}
        fill={TEE}
      />
      {crewNeck(b, t.skin.colour, TEE_SHADE, 18)}
      {[-1, 1].map((side) => (
        <path
          key={side}
          d={`M ${CX + side * (n + 8)} ${COLLAR_Y - 4} L ${CX + side * (n + 26)} ${COLLAR_Y - 2} L ${CX + side * (width + 16)} ${BOTTOM} L ${CX + side * width} ${BOTTOM} Z`}
          fill={edge.colour}
        />
      ))}
    </>
  );
}

function hoodie(b: Build, t: Tints) {
  const n = b.neck;
  const { colour, shade } = t.top;
  const y = COLLAR_Y;
  return (
    <>
      <path d={torso(b)} fill={colour} />
      {armFolds(b, shade)}
      <path d={`M ${CX - n - 4} ${y - 8} L ${CX + n + 4} ${y - 8} L ${CX} ${y + 46} Z`} fill={t.skin.colour} />
      {[-1, 1].map((side) => (
        <g key={side}>
          <path
            d={`M ${CX + side * (n - 2)} ${y - 30} C ${CX + side * (n + 74)} ${y - 26}, ${CX + side * (n + 56)} ${y + 46}, ${CX} ${y + 66} L ${CX} ${y + 44} C ${CX + side * 18} ${y + 32}, ${CX + side * (n + 2)} ${y + 4}, ${CX + side * (n - 2)} ${y - 30} Z`}
            fill={shade}
          />
          <path
            d={`M ${CX + side * (n + 2)} ${y - 26} C ${CX + side * (n + 64)} ${y - 20}, ${CX + side * (n + 46)} ${y + 40}, ${CX} ${y + 58} L ${CX} ${y + 48} C ${CX + side * 22} ${y + 36}, ${CX + side * (n + 12)} ${y + 6}, ${CX + side * (n + 2)} ${y - 26} Z`}
            fill={colour}
          />
          <path
            d={`M ${CX + side * 18} ${y + 52} q ${side * 3} 30 ${side * -1} 56`}
            fill="none"
            stroke={shade}
            strokeWidth={5}
            strokeLinecap="round"
          />
        </g>
      ))}
    </>
  );
}

// The back of the hood, which rises behind the neck.
function hoodBack(b: Build, t: Tints) {
  return <ellipse cx={CX} cy={COLLAR_Y - 10} rx={b.neck + 60} ry={40} fill={t.top.shade} />;
}

function jumper(b: Build, t: Tints) {
  const n = b.neck;
  const { colour, shade } = t.top;
  const body = torso(b);
  const ribs = Array.from({ length: 21 }, (_, i) => CX - 200 + i * 20);
  const collar = `M ${CX - n - 10} ${COLLAR_Y - 34} Q ${CX} ${COLLAR_Y - 42} ${CX + n + 10} ${COLLAR_Y - 34} L ${CX + n + 18} ${COLLAR_Y + 8} Q ${CX} ${COLLAR_Y + 26} ${CX - n - 18} ${COLLAR_Y + 8} Z`;
  return (
    <>
      <path d={body} fill={colour} />
      <Clipped d={body}>
        {ribs.map((x) => (
          <path key={x} d={`M ${x} ${COLLAR_Y + 30} L ${x} ${BOTTOM}`} stroke={shade} strokeWidth={4} opacity={0.45} />
        ))}
      </Clipped>
      {armFolds(b, shade)}
      <path d={collar} fill={colour} />
      <Clipped d={collar}>
        {Array.from({ length: 14 }, (_, i) => CX - n - 20 + i * 9).map((x) => (
          <path key={x} d={`M ${x} ${COLLAR_Y - 44} L ${x} ${COLLAR_Y + 30}`} stroke={shade} strokeWidth={3.5} />
        ))}
      </Clipped>
    </>
  );
}

function stripes(b: Build, t: Tints) {
  const body = torso(b);
  const bands = Array.from({ length: 4 }, (_, i) => COLLAR_Y + 26 + i * 30);
  return (
    <>
      <path d={body} fill={TEE} />
      <Clipped d={body}>
        {bands.map((y) => (
          <rect key={y} x={0} y={y} width={512} height={14} fill={t.top.colour} />
        ))}
      </Clipped>
      {armFolds(b, TEE_SHADE)}
      {crewNeck(b, t.skin.colour, t.top.colour)}
    </>
  );
}

function tshirt(b: Build, t: Tints) {
  return (
    <>
      <path d={torso(b)} fill={t.top.colour} />
      {armFolds(b, t.top.shade)}
      {crewNeck(b, t.skin.colour, t.top.shade)}
    </>
  );
}

function denim(b: Build, t: Tints) {
  const { colour, shade } = t.top;
  return (
    <>
      <path d={torso(b)} fill={colour} />
      {armFolds(b, shade)}
      {openFront(b, t, t.top, 26)}
      {[-1, 1].map((side) => (
        <g key={side}>
          <path
            d={`M ${CX + side * (b.neck + 6)} ${COLLAR_Y - 8} L ${CX + side * (b.neck + 48)} ${COLLAR_Y + 4} L ${CX + side * 44} ${COLLAR_Y + 54} L ${CX + side * 30} ${COLLAR_Y + 40} Z`}
            fill={shade}
          />
          <rect x={CX + side * 92 - 24} y={COLLAR_Y + 62} width={48} height={30} rx={8} fill={shade} opacity={0.8} />
          <circle cx={CX + side * 92} cy={COLLAR_Y + 70} r={4} fill="#d6b06b" />
          <circle cx={CX + side * 40} cy={COLLAR_Y + 96} r={4} fill="#d6b06b" />
        </g>
      ))}
    </>
  );
}

function cardigan(b: Build, t: Tints) {
  const { colour, shade } = t.top;
  return (
    <>
      <path d={torso(b)} fill={colour} />
      {armFolds(b, shade)}
      {openFront(b, t, { colour: shade, shade }, 22)}
      {[-1, 1].map((side) => (
        <path
          key={side}
          d={`M ${CX + side * (b.neck + 4)} ${COLLAR_Y - 10} C ${CX + side * (b.neck + 40)} ${COLLAR_Y - 6}, ${CX + side * 46} ${COLLAR_Y + 60}, ${CX + side * 36} ${BOTTOM} L ${CX + side * 22} ${BOTTOM} C ${CX + side * 28} ${COLLAR_Y + 60}, ${CX + side * (b.neck + 14)} ${COLLAR_Y + 6}, ${CX + side * (b.neck + 4)} ${COLLAR_Y - 10} Z`}
          fill={colour}
        />
      ))}
      {[0, 1].map((i) => (
        <circle key={i} cx={CX + 46} cy={COLLAR_Y + 66 + i * 34} r={5} fill={shade} />
      ))}
    </>
  );
}

const tops = { hoodie, jumper, stripes, tshirt, denim, cardigan };

// The neck, with the chin's shadow, and the top over the shoulders.
export function body(a: Appearance, t: Tints) {
  const b = buildOf(a);
  const n = b.neck;
  return (
    <>
      {a.top === "hoodie" && hoodBack(b, t)}
      <rect x={CX - n} y={HEAD.chin - 40} width={n * 2} height={COLLAR_Y - HEAD.chin + 60} fill={t.skin.colour} />
      <path
        d={`M ${CX - n} ${HEAD.chin - 20} L ${CX + n} ${HEAD.chin - 20} L ${CX + n} ${HEAD.chin + 8} Q ${CX} ${HEAD.chin + 30} ${CX - n} ${HEAD.chin + 8} Z`}
        fill={t.skin.shade}
      />
      {tops[a.top](b, t)}
    </>
  );
}
