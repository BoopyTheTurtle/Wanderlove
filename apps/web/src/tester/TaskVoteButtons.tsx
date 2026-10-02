import { useState } from "react";
import { TESTER_FEEDBACK_ENABLED } from "../features";
import { castVote } from "./feedbackState";
import type { Vote } from "./feedbackState";
import { ThumbDownIcon, ThumbUpIcon } from "./ThumbIcons";
import "./tester-feedback.css";

// A tester's thumbs up or down on one task. Mounted as the first child of the task card, it sits in the card's top
// right corner, level with the eyebrow, so the title keeps its width.
export function TaskVoteButtons({ vote, onVote }: { vote: Vote; onVote: (next: Vote) => Promise<void> }) {
  const [shown, setShown] = useState<Vote>(vote);
  // A new vote from the caller, such as the tester's saved one arriving, replaces what the buttons show.
  const [given, setGiven] = useState<Vote>(vote);
  if (vote !== given) {
    setGiven(vote);
    setShown(vote);
  }

  if (!TESTER_FEEDBACK_ENABLED) return null;

  return (
    <div className="tester-vote">
      <button
        type="button"
        className="tester-vote-button up"
        aria-label="Good task"
        aria-pressed={shown === 1}
        onClick={() => void castVote(shown, 1, setShown, onVote)}
      >
        <ThumbUpIcon />
      </button>
      <button
        type="button"
        className="tester-vote-button down"
        aria-label="Not for us"
        aria-pressed={shown === -1}
        onClick={() => void castVote(shown, -1, setShown, onVote)}
      >
        <ThumbDownIcon />
      </button>
    </div>
  );
}
