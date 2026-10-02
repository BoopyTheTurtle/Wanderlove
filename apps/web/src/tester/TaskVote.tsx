import { useEffect, useRef, useState } from "react";
import { TESTER_FEEDBACK_ENABLED } from "../features";
import { loadTaskVotes, voteTask } from "../lib/testerFeedback";
import type { Vote } from "./feedbackState";
import { TaskVoteButtons } from "./TaskVoteButtons";
import { openTaskVote, VoteSender } from "./voteSender";

// One sender for the whole app, so a vote that failed on one task retries on the next.
const sender = new VoteSender(voteTask);

// The tester's saved vote on a task, and a sender for changes. A tap before the saved vote arrives wins over it.
function useTaskVote(taskId: string): { vote: Vote; onVote: (next: Vote) => Promise<void> } {
  const [loaded, setLoaded] = useState<{ taskId: string; vote: Vote } | null>(null);
  const tapped = useRef<string | null>(null);

  useEffect(() => {
    if (!TESTER_FEEDBACK_ENABLED) return;
    let live = true;
    tapped.current = null;
    void openTaskVote(sender, loadTaskVotes, taskId).then((vote) => {
      if (live && vote !== null && tapped.current !== taskId) setLoaded({ taskId, vote });
    });
    return () => {
      live = false;
    };
  }, [taskId]);

  return {
    vote: loaded?.taskId === taskId ? loaded.vote : 0,
    onVote: (next) => {
      tapped.current = taskId;
      return sender.vote(taskId, next);
    },
  };
}

// The vote buttons for one task, wired to the tester's votes. Mounted as the first child of the task card.
export function TaskVote({ taskId }: { taskId: string }) {
  const { vote, onVote } = useTaskVote(taskId);
  return <TaskVoteButtons key={taskId} vote={vote} onVote={onVote} />;
}
