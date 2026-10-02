import { useEffect, useState } from "react";
import { TESTER_FEEDBACK_ENABLED } from "../features";
import { BUILD_ID } from "../lib/appVersion";
import { questRef, sendQuestComment } from "../lib/testerFeedback";
import { QuestCommentCard } from "./QuestCommentCard";
import { commentSent, sendComment } from "./commentSender";
import type { QuestCommentContext } from "./commentSender";
import type { QuestMode } from "./questions";

// The quest comment card, wired to the server and to what this phone remembers. Renders nothing until it knows whether
// this tester already commented on this run, so the card never flashes open and shut.
export function QuestComment({
  runId,
  userId,
  mode,
  tasksDone,
}: {
  runId: string;
  userId: string;
  mode: QuestMode;
  tasksDone?: number;
}) {
  const [known, setKnown] = useState<{ ref: string; sent: boolean } | null>(null);
  const ref = `${runId}:${userId}`;

  useEffect(() => {
    if (!TESTER_FEEDBACK_ENABLED) return;
    let live = true;
    void questRef(runId, userId).then((hash) => {
      if (live) setKnown({ ref: `${runId}:${userId}`, sent: commentSent(hash, localStorage) });
    });
    return () => {
      live = false;
    };
  }, [runId, userId]);

  if (!TESTER_FEEDBACK_ENABLED || known?.ref !== ref) return null;

  const context: QuestCommentContext = { runId, userId, mode, tasksDone, appVersion: BUILD_ID };
  return (
    <QuestCommentCard
      key={ref}
      mode={mode}
      alreadySent={known.sent}
      onSend={(body, question) =>
        sendComment(context, body, question, { send: sendQuestComment, questRef, store: localStorage })
      }
    />
  );
}
