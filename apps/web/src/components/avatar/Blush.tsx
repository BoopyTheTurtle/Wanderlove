import { useId } from "react";

// A rosy cheek that fades out at its edge instead of ending in a hard oval. Each instance makes its own gradient ID,
// so several avatars can share a page.
export function Blush({
  cx,
  cy,
  rx,
  ry,
  colour,
  opacity,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  colour: string;
  opacity: number;
}) {
  const id = `blush${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <radialGradient id={id}>
        <stop offset="0" stopColor={colour} stopOpacity={opacity} />
        <stop offset="0.55" stopColor={colour} stopOpacity={opacity * 0.6} />
        <stop offset="1" stopColor={colour} stopOpacity={0} />
      </radialGradient>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
    </>
  );
}
