import type { Appearance } from "@wannadoo/core";
import { Clipped } from "../Clipped";
import { CX, EYE_LINE, HAT_LINE, HEAD, SHOULDER_LINE, buildOf } from "../frame";
import type { Tints } from "../tints";

const GOLD = "#e0aa3e";
const FRAME_COLOUR = "#3b2a24";

function scarf(a: Appearance, t: Tints) {
  const n = buildOf(a).neck;
  const { colour, shade } = t.accent;
  const y = SHOULDER_LINE.y - 36;
  return (
    <>
      <path
        d={`M ${CX - 34} ${y + 40} C ${CX - 46} ${y + 80}, ${CX - 44} ${y + 120}, ${CX - 52} ${y + 150} L ${CX - 6} ${y + 150} C ${CX - 4} ${y + 120}, ${CX - 2} ${y + 80}, ${CX + 4} ${y + 44} Z`}
        fill={shade}
      />
      <path
        d={`M ${CX - n - 30} ${y + 4} C ${CX - n - 34} ${y + 50}, ${CX - 40} ${y + 70}, ${CX} ${y + 70} C ${CX + 40} ${y + 70}, ${CX + n + 34} ${y + 50}, ${CX + n + 30} ${y + 4} C ${CX + n + 10} ${y - 10}, ${CX + n} ${y + 20}, ${CX} ${y + 24} C ${CX - n} ${y + 20}, ${CX - n - 10} ${y - 10}, ${CX - n - 30} ${y + 4} Z`}
        fill={colour}
      />
      <path
        d={`M ${CX - n - 26} ${y + 30} C ${CX - 40} ${y + 56}, ${CX + 40} ${y + 56}, ${CX + n + 26} ${y + 30}`}
        fill="none"
        stroke={shade}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${CX - 30} ${y + 52} C ${CX - 46} ${y + 70}, ${CX - 34} ${y + 92}, ${CX - 18} ${y + 92} C ${CX - 4} ${y + 88}, ${CX + 2} ${y + 66}, ${CX - 10} ${y + 54} Z`}
        fill={colour}
      />
    </>
  );
}

function beanie(_a: Appearance, t: Tints) {
  const { colour, shade } = t.accent;
  const cuff = HAT_LINE.y;
  const dome = `M 142 ${cuff + 8} C 136 104, 190 66, 256 66 C 322 66, 376 104, 370 ${cuff + 8} Z`;
  return (
    <>
      <path d={dome} fill={colour} />
      <Clipped d={dome}>
        {Array.from({ length: 13 }, (_, i) => CX - 108 + i * 18).map((x) => (
          <path
            key={x}
            d={`M ${x} ${cuff} Q ${x + (x - CX) * 0.1} ${cuff - 50} ${CX + (x - CX) * 0.3} ${cuff - 90}`}
            fill="none"
            stroke={shade}
            strokeWidth={4}
            opacity={0.45}
          />
        ))}
      </Clipped>
      <rect x={134} y={cuff - 10} width={244} height={44} rx={20} fill={shade} />
      <rect x={142} y={cuff - 5} width={228} height={12} rx={6} fill={colour} opacity={0.35} />
    </>
  );
}

function glasses() {
  const { y, dx } = EYE_LINE;
  const r = 27;
  return (
    <g fill="none" stroke={FRAME_COLOUR} strokeWidth={5} strokeLinecap="round">
      {[-1, 1].map((side) => (
        <circle key={side} cx={CX + side * dx} cy={y} r={r} fill="#ffffff" fillOpacity={0.12} />
      ))}
      <path d={`M ${CX - dx + r} ${y - 4} Q ${CX} ${y - 14} ${CX + dx - r} ${y - 4}`} />
      <path d={`M ${CX - dx - r} ${y - 4} L ${CX - HEAD.halfWidth + 2} ${y - 8}`} />
      <path d={`M ${CX + dx + r} ${y - 4} L ${CX + HEAD.halfWidth - 2} ${y - 8}`} />
    </g>
  );
}

function earrings() {
  const y = EYE_LINE.y + 40;
  return (
    <>
      {[-1, 1].map((side) => (
        <circle
          key={side}
          cx={CX + side * (HEAD.halfWidth + 2)}
          cy={y}
          r={8}
          fill="none"
          stroke={GOLD}
          strokeWidth={4.5}
        />
      ))}
    </>
  );
}

// Drawn from the body outwards, so the scarf sits under the hat's brim and the glasses on top.
export function accessories(a: Appearance, t: Tints) {
  const has = (id: Appearance["accessories"][number]) => a.accessories.includes(id);
  if (a.accessories.length === 0) return null;
  return (
    <>
      {has("earrings") && earrings()}
      {has("scarf") && scarf(a, t)}
      {has("beanie") && beanie(a, t)}
      {has("glasses") && glasses()}
    </>
  );
}
