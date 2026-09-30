import { useState } from "react";
import type { FormEvent } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { WrongRecoveryCodeError, isCompleteRecoveryCode } from "../lib/crypto";
import { unlockWithRecoveryCode } from "../lib/keys";
import type { DeviceKeys } from "../lib/keyStore";
import "../keys.css";

// A phone without this account's keys: enter the recovery code (option A), or start fresh and let the partner's
// phone share the trails again (option C).
export function KeyUnlock({
  userId,
  canUseCode,
  replaced,
  onUnlocked,
  onStartFresh,
  onSignOut,
}: {
  userId: string;
  canUseCode: boolean;
  replaced: boolean;
  onUnlocked: (keys: DeviceKeys) => void;
  onStartFresh: () => void;
  onSignOut: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(!canUseCode);

  const complete = isCompleteRecoveryCode(code);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      onUnlocked(await unlockWithRecoveryCode(userId, code));
    } catch (e) {
      if (e instanceof WrongRecoveryCodeError) setError("That code doesn’t match. Check it and try again.");
      else {
        console.error("Couldn't unlock the keys", e);
        setError("Couldn't unlock your photos. Check your connection and try again.");
      }
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
        <h1>Unlock your photos</h1>
        <p className="intro">
          {replaced
            ? "Your keys changed on another phone. Enter the recovery code from Profile on that phone."
            : "This phone doesn’t hold your photo keys yet. Enter the recovery code from Profile on your other phone."}
        </p>
      </div>

      {canUseCode && (
        <form className="card auth-card" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Recovery code</span>
            <span className={error ? "field-input invalid" : "field-input"}>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                autoFocus
              />
            </span>
          </label>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={!complete || busy}>
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      )}

      <div className="card auth-card keys-fresh">
        {confirmFresh ? (
          <>
            <p className="keys-note">
              {canUseCode ? "Without the code, this" : "This"} phone makes new keys and a new recovery code. Your
              partner&rsquo;s phone asks them to trust your new keys, then shares the trails you walked together. Trails
              you walked alone or with someone else stay locked.
            </p>
            <button type="button" className="btn-primary" onClick={onStartFresh}>
              Make new keys
            </button>
            {canUseCode && (
              <button type="button" className="btn-soft" onClick={() => setConfirmFresh(false)}>
                Back
              </button>
            )}
          </>
        ) : (
          <button type="button" className="btn-soft keys-lost" onClick={() => setConfirmFresh(true)}>
            I don&rsquo;t have the code
          </button>
        )}
      </div>

      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
