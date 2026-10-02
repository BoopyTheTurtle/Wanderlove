import { useState } from "react";
import { TESTER_FEEDBACK_ENABLED } from "../features";
import { EMPTY_REVIEW, FEEDBACK_MAX, reviewHasText } from "./feedbackState";
import type { ReviewFields } from "./feedbackState";
import "./tester-feedback.css";

export const REVIEW_THANKS = "Thanks. Send another whenever something comes to mind.";

const FIELDS: { key: keyof ReviewFields; label: string; placeholder: string }[] = [
  { key: "overall", label: "The app overall", placeholder: "What would you tell a friend about Wannadoo?" },
  { key: "likes", label: "What you like", placeholder: "Which part would you miss if we took it away?" },
  { key: "wishes", label: "What you’d like to see", placeholder: "If you could add one thing, what would it be?" },
];

// A review of the app as a whole, in Profile. Every field is optional; testers may send as many as they like.
export function AppReviewCard({ onSend }: { onSend: (review: ReviewFields) => Promise<void> }) {
  const [fields, setFields] = useState<ReviewFields>(EMPTY_REVIEW);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (!TESTER_FEEDBACK_ENABLED) return null;

  const sending = status === "sending";

  async function send() {
    if (sending || !reviewHasText(fields)) return;
    setStatus("sending");
    try {
      await onSend({ overall: fields.overall.trim(), likes: fields.likes.trim(), wishes: fields.wishes.trim() });
      setFields(EMPTY_REVIEW);
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section className="card settings-card tester-card tester-review" aria-labelledby="tester-review-title">
      <p className="card-kicker" id="tester-review-title">
        Tell us what you think
      </p>
      {FIELDS.map(({ key, label, placeholder }) => (
        <label key={key} className="tester-field">
          <span>{label}</span>
          <textarea
            className="tester-textarea"
            value={fields[key]}
            placeholder={placeholder}
            maxLength={FEEDBACK_MAX}
            rows={3}
            disabled={sending}
            onChange={(e) => {
              const value = e.target.value;
              setFields((old) => ({ ...old, [key]: value }));
              if (status === "sent") setStatus("idle");
            }}
          />
        </label>
      ))}
      {status === "sent" && (
        <p className="tester-thanks" role="status">
          {REVIEW_THANKS}
        </p>
      )}
      {status === "failed" && (
        <p className="tester-quiet" role="status">
          That didn&rsquo;t send. Check your connection and tap Send again.
        </p>
      )}
      <button
        type="button"
        className="btn-primary tester-send"
        disabled={sending || !reviewHasText(fields)}
        onClick={() => void send()}
      >
        {sending ? "Sending…" : "Send"}
      </button>
      <p className="settings-note tester-email">
        Or email <a href="mailto:support@wannadoo.app">support@wannadoo.app</a>
      </p>
    </section>
  );
}
