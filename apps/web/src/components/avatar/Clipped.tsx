import { useId, type ReactNode } from "react";

// Draws its children clipped to a path in the avatar frame. Each instance makes its own clip ID, so several avatars
// can share a page.
export function Clipped({ d, children }: { d: string; children: ReactNode }) {
  const id = `clip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}
