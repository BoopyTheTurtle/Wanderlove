// Plain logic behind the tester feedback components (docs/tester-feedback.md), kept apart so tests can drive it
// without a DOM.

export type Vote = -1 | 0 | 1;

export const FEEDBACK_MAX = 1000;
// The comment counter appears once the text reaches this length.
export const COUNTER_FROM = 800;

// A tap on the chosen vote clears it; a tap on the other casts or switches.
export function nextVote(current: Vote, tapped: 1 | -1): Vote {
  return current === tapped ? 0 : tapped;
}

// Shows the next vote at once, then sends it. A failed send keeps what the screen shows and says nothing: voting is
// never worth interrupting a walk.
export async function castVote(
  current: Vote,
  tapped: 1 | -1,
  show: (vote: Vote) => void,
  onVote: (next: Vote) => Promise<void>,
): Promise<void> {
  const next = nextVote(current, tapped);
  show(next);
  try {
    await onVote(next);
  } catch {
    // Kept on screen; the caller retries on its own terms.
  }
}

export type SendStatus = "idle" | "sending" | "sent" | "failed";

// Wraps a send so it goes through at most once: a call while one is in flight, or after one succeeded, does nothing.
// A failure allows another try.
export function onceSender<A extends unknown[]>(
  send: (...args: A) => Promise<void>,
  onStatus: (status: SendStatus) => void,
): (...args: A) => Promise<void> {
  let status: SendStatus = "idle";
  const set = (next: SendStatus) => {
    status = next;
    onStatus(next);
  };
  return async (...args: A) => {
    if (status === "sending" || status === "sent") return;
    set("sending");
    try {
      await send(...args);
      set("sent");
    } catch {
      set("failed");
    }
  };
}

export type ReviewFields = { overall: string; likes: string; wishes: string };

export const EMPTY_REVIEW: ReviewFields = { overall: "", likes: "", wishes: "" };

export function reviewHasText(fields: ReviewFields): boolean {
  return [fields.overall, fields.likes, fields.wishes].some((text) => text.trim() !== "");
}
