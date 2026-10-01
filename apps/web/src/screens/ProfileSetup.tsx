import { useState } from "react";
import type { FormEvent } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { randomAppearance } from "@wannadoo/core";
import type { Appearance } from "@wannadoo/core";
import { completeOnboarding } from "../lib/profile";
import type { ProfileRow } from "../lib/profile";
import { saveMyAppearance } from "../lib/avatar";
import { AvatarCreator } from "./AvatarCreator";

const MAX_NAME = 40;

// One-time onboarding: a display name and the tester-notice tick box, then an optional avatar. Skipping the avatar
// saves a random one, so nobody goes without; a skip that fails to save is filled in by App.tsx on the next load.
export function ProfileSetup({
  userId,
  onDone,
  onSignOut,
}: {
  userId: string;
  onDone: (row: ProfileRow) => void;
  onSignOut: () => void;
}) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The saved profile once the name step is done; the avatar step follows.
  const [saved, setSaved] = useState<ProfileRow | null>(null);
  const [firstLook] = useState(() => randomAppearance());

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= MAX_NAME && agreed;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSaved(await completeOnboarding(userId, trimmed));
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (saved) {
    const finish = async (appearance: Appearance) => {
      await saveMyAppearance(userId, appearance);
      onDone({ ...saved, appearance: { ...appearance } });
    };
    return (
      <AvatarCreator
        initial={firstLook}
        title="Make your avatar"
        intro="Your partner sees it next to your name."
        onSave={finish}
        onSkip={() =>
          finish(randomAppearance()).catch((e: unknown) => {
            console.error("Couldn't save a random avatar", e);
            onDone(saved);
          })
        }
      />
    );
  }

  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        <h1>Welcome aboard</h1>
        <p className="intro">What should your partner call you?</p>
      </div>

      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Display name</span>
          <span className="field-input">
            <input
              type="text"
              autoComplete="given-name"
              maxLength={MAX_NAME}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </span>
        </label>

        <label className="consent">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I am 18 or older and have read the{" "}
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
        <button type="submit" className="btn-primary" disabled={!valid || busy}>
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
