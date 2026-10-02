import { useState } from "react";
import type { FormEvent } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { acceptCurrentTerms } from "../lib/profile";
import type { ProfileRow } from "../lib/profile";

// Shown once to a tester who accepted an older tester notice: the same tick box as onboarding, for the new version.
export function TermsUpdate({
  userId,
  onDone,
  onSignOut,
}: {
  userId: string;
  onDone: (row: ProfileRow) => void;
  onSignOut: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await acceptCurrentTerms(userId));
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        <h1>The tester notice has changed</h1>
        <p className="intro">
          It now covers the weekly league and what happens to your couple&rsquo;s data after an unlink.
        </p>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <label className="consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I am 18 or older and have read the updated{" "}
            <a href="/tester-notice" target="_blank" rel="noopener">
              tester notice
            </a>
          </span>
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={!agreed || busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>

      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
