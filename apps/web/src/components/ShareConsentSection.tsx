import { useCallback, useEffect, useState } from "react";
import { onForeground } from "../lib/coupleStats";
import { loadShareConsent, setShareConsent } from "../lib/shares";
import "./plan-share.css";

export type ConsentState = boolean | "loading" | "failed";

// Standing consent in Profile (mvp-roadmap.md, Share consent): off by default, so the partner asks for each photo.
// Turning it on approves the partner's proposals at once; one tap withdraws it, and drops any approval it gave that
// the partner hasn't shared yet.
export function ShareConsentSection({ partnerName }: { partnerName: string }) {
  const [state, setState] = useState<ConsentState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await loadShareConsent());
    } catch (e) {
      console.error("Couldn't load share consent", e);
      setState((s) => (s === "loading" ? "failed" : s));
    }
  }, []);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload]);

  async function set(on: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setShareConsent(on);
    } catch (e) {
      console.error("Couldn't save share consent", e);
      setError("Couldn’t save that. Check your connection and try again.");
    }
    await reload();
    setBusy(false);
  }

  return (
    <ShareConsentView
      partnerName={partnerName}
      state={state}
      busy={busy}
      error={error}
      onSet={(on) => void set(on)}
      onRetry={() => {
        setState("loading");
        void reload();
      }}
    />
  );
}

export function ShareConsentView({
  partnerName,
  state,
  busy,
  error,
  onSet,
  onRetry,
}: {
  partnerName: string;
  state: ConsentState;
  busy: boolean;
  error: string | null;
  onSet: (on: boolean) => void;
  onRetry: () => void;
}) {
  function body() {
    if (state === "loading") return <p className="settings-note">Loading…</p>;
    if (state === "failed") {
      return (
        <>
          <p className="settings-note">Couldn&rsquo;t load your sharing choice.</p>
          <button type="button" className="settings-outline" onClick={onRetry}>
            Try again
          </button>
        </>
      );
    }
    return (
      <>
        <label className="consent">
          <input type="checkbox" checked={state} disabled={busy} onChange={(e) => onSet(e.target.checked)} />
          <span>Let {partnerName} share our photos without asking each time</span>
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <p className="settings-note">
          {state
            ? `On. A photo ${partnerName} picks is approved at once. Turning it off takes back any yes that hasn’t been shared yet.`
            : `Off. ${partnerName} asks you about each photo before it leaves the app.`}
        </p>
      </>
    );
  }

  return (
    <section className="card settings-card share-consent" aria-labelledby="settings-share-consent-title">
      <p className="card-kicker" id="settings-share-consent-title">
        Sharing photos
      </p>
      {body()}
    </section>
  );
}
