import { useEffect, useMemo, useRef, useState } from "react";
import { TESTER_FEEDBACK_ENABLED } from "../features";
import { COUNTER_FROM, FEEDBACK_MAX, onceSender } from "./feedbackState";
import type { SendStatus } from "./feedbackState";
import { pickQuestion } from "./questions";
import type { QuestMode } from "./questions";
import "./tester-feedback.css";

export const COMMENT_THANKS = "Thanks — we read every one.";

// One comment per tester per quest, on the quest complete screen. Optional: leaving without writing loses nothing.
export function QuestCommentCard({
  mode,
  onSend,
  alreadySent = false,
}: {
  mode: QuestMode;
  // Sends the trimmed text and the question shown as its placeholder.
  onSend: (body: string, question: string) => Promise<void>;
  alreadySent?: boolean;
}) {
  const [question, setQuestion] = useState(() => pickQuestion(mode));
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const sendRef = useRef(onSend);
  useEffect(() => {
    sendRef.current = onSend;
  }, [onSend]);
  const send = useMemo(() => onceSender((b: string, q: string) => sendRef.current(b, q), setStatus), []);

  if (!TESTER_FEEDBACK_ENABLED) return null;

  if (alreadySent || status === "sent") {
    return (
      <section className="card tester-card tester-comment" aria-label="How was this quest?">
        <p className="tester-thanks" role="status">
          {COMMENT_THANKS}
        </p>
      </section>
    );
  }

  const sending = status === "sending";
  const text = body.trim();

  return (
    <section className="card tester-card tester-comment" aria-labelledby="tester-comment-title">
      <h3 className="tester-title" id="tester-comment-title">
        How was this quest?
      </h3>
      <textarea
        className="tester-textarea"
        aria-labelledby="tester-comment-title"
        value={body}
        placeholder={question}
        maxLength={FEEDBACK_MAX}
        rows={4}
        disabled={sending}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="tester-row">
        <button
          type="button"
          className="tester-link"
          disabled={sending}
          onClick={() => setQuestion((q) => pickQuestion(mode, q))}
        >
          Another question
        </button>
        {body.length >= COUNTER_FROM && (
          <span className="tester-count" aria-live="polite">
            {body.length} / {FEEDBACK_MAX.toLocaleString("en-GB")}
          </span>
        )}
      </div>
      {status === "failed" && (
        <p className="tester-quiet" role="status">
          That didn&rsquo;t send. Check your connection and tap Send again.
        </p>
      )}
      <button
        type="button"
        className="btn-primary tester-send"
        disabled={text === "" || sending}
        onClick={() => void send(text, question)}
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </section>
  );
}
