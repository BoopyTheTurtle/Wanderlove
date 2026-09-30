import { useState } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { ChevronIcon } from "../components/Icons";
import { PROFILES } from "@wannadoo/core";
import type { Profile } from "@wannadoo/core";
import { authErrorMessage, signInAsDevUser } from "../lib/auth";

const STRANGER: Profile = {
  id: "stranger",
  name: "Stranger",
  username: "stranger",
  email: "stranger@wannadoo.test",
  initials: "S",
  color: "#8a5c5e",
};

// Dev-only switcher: signs in as one of the users seeded in the local Supabase stack.
// App renders it only when isLocalStack is true, so it never reaches production.
export function WhoAmI({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(email: string) {
    setBusy(email);
    setError(null);
    try {
      await signInAsDevUser(email);
      // The auth listener in App moves on from here.
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(null);
    }
  }

  return (
    <div className="screen light-screen whoami">
      <StatusBar />
      <div className="whoami-head">
        <span className="dev-pill">Test mode</span>
        <h2>Who&rsquo;s using this phone?</h2>
        <p>Sign in as a seeded test user on the local stack.</p>
      </div>
      <div className="mode-list">
        {[...PROFILES, STRANGER].map((p) => (
          <button
            key={p.id}
            type="button"
            className="mode-card"
            onClick={() => void pick(p.email)}
            disabled={busy !== null}
          >
            <ProfileAvatar profile={p} size={56} />
            <span className="mode-copy">
              <strong>{p.name}</strong>
              <small>{busy === p.email ? "Signing in…" : p.email}</small>
            </span>
            <span className="mode-arrow">
              <ChevronIcon size={18} />
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="field-error whoami-error" role="alert">
          {error}
        </p>
      )}
      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onBack}>
          Back to email sign-in
        </button>
      </div>
    </div>
  );
}
