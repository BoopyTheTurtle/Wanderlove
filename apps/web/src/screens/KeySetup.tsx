import { useState } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { formatRecoveryCode } from "../lib/crypto";
import { KeysAlreadyExistError, saveAccountKeys } from "../lib/keys";
import type { PendingKeys } from "../lib/keys";
import type { DeviceKeys } from "../lib/keyStore";
import "../keys.css";

// Shows the recovery code once. Nothing is stored until the user confirms they saved it, so leaving early just
// means a fresh code next time.
export function KeySetup({
  userId,
  pending,
  replace,
  onDone,
  onConflict,
  onSignOut,
}: {
  userId: string;
  pending: PendingKeys;
  // Option C: a fresh pair replaces the account's earlier one.
  replace: boolean;
  onDone: (keys: DeviceKeys) => void;
  // Another phone stored the account's keys meanwhile.
  onConflict: () => void;
  onSignOut: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = formatRecoveryCode(pending.recoveryCode);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code stays selectable.
    }
  }

  async function handleContinue() {
    if (!saved || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await saveAccountKeys(userId, pending, { replace }));
    } catch (e) {
      if (e instanceof KeysAlreadyExistError) {
        onConflict();
        return;
      }
      console.error("Couldn't save the keys", e);
      setError("Couldn't save your keys. Check your connection and try again.");
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
        <h1>{replace ? "Your new recovery code" : "Save your recovery code"}</h1>
        <p className="intro">
          Your photos are encrypted on your phone. This code unlocks them on a new phone. Nobody else can recover it,
          Wannadoo included.
        </p>
      </div>

      <div className="card auth-card">
        <p className="recovery-code" aria-label="Recovery code">
          {code}
        </p>
        <button type="button" className="btn-soft keys-copy" onClick={() => void handleCopy()}>
          {copied ? "Copied" : "Copy code"}
        </button>
        <p className="keys-note">
          Keep it in a password manager or write it down. You will see it only this once.
          {replace && " Your earlier code no longer works."}
        </p>

        <label className="consent">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I&rsquo;ve saved my recovery code</span>
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary" disabled={!saved || busy} onClick={() => void handleContinue()}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>

      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
