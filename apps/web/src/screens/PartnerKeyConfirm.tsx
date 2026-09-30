import { useState } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import "../keys.css";

// The partner's key changed, or is new to this phone while trails are shared. Trusting it re-shares those trails'
// keys with it; nothing is wrapped for the key until then.
export function PartnerKeyConfirm({
  partnerName,
  reason,
  onTrust,
  onNotNow,
}: {
  partnerName: string;
  reason: "changed" | "new";
  onTrust: () => Promise<void>;
  onNotNow: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleTrust() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      await onTrust();
    } catch (e) {
      console.error("Couldn't share the trails", e);
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen keys-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        <h1>
          {reason === "changed" ? `${partnerName}’s keys changed` : `Confirm ${partnerName}’s keys on this phone`}
        </h1>
        <p className="intro">
          {reason === "changed"
            ? `Most likely ${partnerName} signed in on a new phone. Trust the new keys?`
            : `This phone hasn’t seen ${partnerName}’s keys before. Trust them?`}
        </p>
      </div>

      <div className="card auth-card">
        <p className="keys-note">
          Trusting them shares the trails you walked together, so {partnerName} can see their photos. If you don&rsquo;t
          expect this, ask {partnerName} first.
        </p>
        {error && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t share your trails. Check your connection and try again.
          </p>
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleTrust()}>
          {busy ? "Sharing…" : "Trust them"}
        </button>
        <button type="button" className="btn-soft" disabled={busy} onClick={onNotNow}>
          Not now
        </button>
      </div>
    </div>
  );
}
