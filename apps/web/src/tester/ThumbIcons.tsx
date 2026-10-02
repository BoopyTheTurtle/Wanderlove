// Thumb icons for the task votes, in the line style of components/Icons.tsx. They live here so that deleting the
// tester folder deletes them too. The outline path takes the fill when its vote is chosen.

type ThumbProps = { size?: number };

function Thumb({ size = 20, outline, stem }: ThumbProps & { outline: string; stem: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="tester-thumb-fill" d={outline} />
      <path d={stem} fill="none" />
    </svg>
  );
}

export const ThumbUpIcon = (p: ThumbProps) => (
  <Thumb
    {...p}
    outline="M7 10v12H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7"
    stem="M7 10v12"
  />
);

export const ThumbDownIcon = (p: ThumbProps) => (
  <Thumb
    {...p}
    outline="M17 14V2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H17"
    stem="M17 14V2"
  />
);
