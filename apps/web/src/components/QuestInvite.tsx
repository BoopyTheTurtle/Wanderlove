import { useState } from "react";
import { CompassIcon } from "./Icons";
import "../quest-invite.css";

// The partner started a Together quest: a calm card that asks, and joins only on "Join" (abuse threat model,
// section 6, decision 1). "Not now" declines, which the partner's phone can't tell from waiting.
export function QuestInvite({
  partnerName,
  onJoin,
  onNotNow,
}: {
  partnerName: string | null;
  onJoin: () => Promise<void>;
  onNotNow: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"join" | "decline" | null>(null);
  const [failed, setFailed] = useState(false);

  async function act(which: "join" | "decline") {
    setBusy(which);
    setFailed(false);
    try {
      await (which === "join" ? onJoin() : onNotNow());
    } catch (e) {
      console.error("Couldn't answer the invitation", e);
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="quest-invite" aria-label="Quest invitation">
      <span className="quest-invite-icon" aria-hidden="true">
        <CompassIcon size={20} />
      </span>
      <p className="quest-invite-text">
        <strong>{partnerName ?? "Your partner"} started a quest</strong>
        <small>Join to walk it together.</small>
      </p>
      <div className="quest-invite-actions">
        <button type="button" className="btn-small" disabled={busy !== null} onClick={() => void act("join")}>
          {busy === "join" ? "Joining…" : "Join"}
        </button>
        <button type="button" className="btn-small ghost" disabled={busy !== null} onClick={() => void act("decline")}>
          Not now
        </button>
      </div>
      {failed && (
        <p className="quest-invite-error" role="alert">
          Couldn&rsquo;t reach Wannadoo. Check your connection and try again.
        </p>
      )}
    </aside>
  );
}
