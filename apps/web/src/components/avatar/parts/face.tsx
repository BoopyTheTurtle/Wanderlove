import type { Appearance } from "@wannadoo/core";
import { CX, EYE_LINE, HEAD, HEAD_CENTRE, buildOf, headPath } from "../frame";
import type { Tints } from "../tints";
import { Blush } from "../Blush";

const CHEEK = "#ee7c6a";

export function head(a: Appearance, t: Tints) {
  return <path d={headPath(buildOf(a))} fill={t.skin.colour} />;
}

export function ears(_a: Appearance, t: Tints) {
  const y = EYE_LINE.y + 12;
  return (
    <>
      {[-1, 1].map((side) => {
        const x = CX + side * (HEAD.halfWidth - 2);
        return (
          <g key={side}>
            <ellipse cx={x} cy={y} rx={17} ry={25} fill={t.skin.colour} />
            <ellipse cx={x + side * 4} cy={y + 2} rx={8} ry={14} fill={t.skin.shade} />
          </g>
        );
      })}
    </>
  );
}

export function features(a: Appearance, t: Tints) {
  const { y, dx } = EYE_LINE;
  const brow = [8.5, 7, 5.5][a.face];
  const eyeRy = a.age === 0 ? 12.5 : 11.5;
  const line = t.skin.shade;
  const mouth = a.skin >= 6 ? "#5a2721" : "#b24f43";
  const older = a.age === 2;
  return (
    <>
      {[-1, 1].map((side) => {
        const x = CX + side * dx;
        return (
          <g key={side}>
            <path
              d={`M ${x - 16} ${y - 26} Q ${x} ${y - 36 - (a.face === 2 ? 2 : 0)} ${x + 16} ${y - 27}`}
              fill="none"
              stroke={t.brow}
              strokeWidth={brow}
              strokeLinecap="round"
            />
            <ellipse cx={x} cy={y} rx={9.5} ry={eyeRy} fill={t.eyes.colour} />
            <circle cx={x + 3} cy={y - 4} r={3} fill="#fff" opacity={0.85} />
            <Blush
              cx={x + side * 20}
              cy={y + 34}
              rx={older ? 30 : 27}
              ry={older ? 20 : 18}
              colour={CHEEK}
              opacity={a.skin >= 6 ? 0.3 : 0.32}
            />
            {older && (
              <>
                <path
                  d={`M ${x + side * 26} ${y - 4} q ${side * 6} 5 ${side * 4} 12`}
                  fill="none"
                  stroke={line}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <path
                  d={`M ${x - 9} ${y + 17} Q ${x} ${y + 21} ${x + 9} ${y + 17}`}
                  fill="none"
                  stroke={line}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              </>
            )}
            {a.age > 0 && (
              <path
                d={`M ${CX + side * 40} ${y + 42} Q ${CX + side * 46} ${y + 58} ${CX + side * 36} ${y + 68}`}
                fill="none"
                stroke={line}
                strokeWidth={3.5}
                strokeLinecap="round"
                opacity={older ? 0.85 : 0.4}
              />
            )}
          </g>
        );
      })}
      {older && (
        <path
          d={`M ${CX - 30} ${HEAD.top + 62} Q ${CX} ${HEAD.top + 56} ${CX + 30} ${HEAD.top + 62}`}
          fill="none"
          stroke={line}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.6}
        />
      )}
      <path
        d={`M ${CX + 2} ${y + 10} Q ${CX + 12} ${y + 26} ${CX - 2} ${y + 30}`}
        fill="none"
        stroke={line}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <path
        d={`M ${CX - 18} ${y + 52} Q ${CX} ${y + 66} ${CX + 18} ${y + 52}`}
        fill="none"
        stroke={mouth}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </>
  );
}

// Beard and stubble follow the jaw of each face, so they never float off the chin; a gap around the mouth keeps the
// smile visible.
export function facialHair(a: Appearance, t: Tints) {
  if (a.facialHair === "none") return null;
  const b = buildOf(a);
  const { y } = EYE_LINE;
  const L = CX - HEAD.halfWidth - 1;
  const R = CX + HEAD.halfWidth + 1;
  const chin = HEAD.chin + (a.facialHair === "beard" ? 16 : 3);
  const mouthY = y + 56;
  const d = [
    `M ${L} ${HEAD_CENTRE.y + 8}`,
    `C ${L - b.cheek} ${HEAD_CENTRE.y + 60}, ${CX - b.jaw - 4} ${chin}, ${CX} ${chin}`,
    `C ${CX + b.jaw + 4} ${chin}, ${R + b.cheek} ${HEAD_CENTRE.y + 60}, ${R} ${HEAD_CENTRE.y + 8}`,
    `L ${R - 12} ${HEAD_CENTRE.y + 8}`,
    `C ${R - 12} ${mouthY - 4}, ${CX + 52} ${mouthY - 4}, ${CX + 34} ${mouthY - 10}`,
    `C ${CX + 22} ${mouthY - 20}, ${CX + 8} ${mouthY - 22}, ${CX} ${mouthY - 18}`,
    `C ${CX - 8} ${mouthY - 22}, ${CX - 22} ${mouthY - 20}, ${CX - 34} ${mouthY - 10}`,
    `C ${CX - 52} ${mouthY - 4}, ${L + 12} ${mouthY - 4}, ${L + 12} ${HEAD_CENTRE.y + 8} Z`,
    `M ${CX - 26} ${mouthY - 3} C ${CX - 20} ${mouthY + 18}, ${CX + 20} ${mouthY + 18}, ${CX + 26} ${mouthY - 3}`,
    `C ${CX + 14} ${mouthY - 7}, ${CX - 14} ${mouthY - 7}, ${CX - 26} ${mouthY - 3} Z`,
  ].join(" ");
  if (a.facialHair === "stubble") return <path d={d} fill={t.hair.shade} fillRule="evenodd" opacity={0.3} />;
  return (
    <>
      <path d={d} fill={t.hair.colour} fillRule="evenodd" />
      <path
        d={`M ${CX - 40} ${chin - 18} Q ${CX} ${chin + 2} ${CX + 40} ${chin - 18} Q ${CX} ${chin - 6} ${CX - 40} ${chin - 18} Z`}
        fill={t.hair.shade}
      />
    </>
  );
}
