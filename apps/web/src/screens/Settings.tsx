import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Profile } from "@wannadoo/core";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { BottomNav } from "../components/BottomNav";
import "../settings.css";

export type SettingsProps = {
  me: Profile;
  email: string;
  // null means walking solo.
  partner: Profile | null;
  // May reject: the screen then shows an error and keeps the partner.
  onUnlink: () => Promise<void>;
  // Solo only: opens the partner screen.
  onLinkPartner: () => void;
  onSignOut: () => void;
  // Bottom nav back to the map.
  onExplore: () => void;
};

// The Profile tab: who I am, who I explore with, unlinking, and signing out.
// Shows nothing about the partner's activity (accounts roadmap, register C6).
export function Settings({ me, email, partner, onUnlink, onLinkPartner, onSignOut, onExplore }: SettingsProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="screen settings-screen">
      <StatusBar />
      <header className="settings-head">
        <h1>Profile</h1>
      </header>

      <section className="card settings-card settings-me" aria-label="You">
        <ProfileAvatar profile={me} size={56} />
        <div>
          <p className="settings-name">{me.name}</p>
          <p className="settings-email">{email}</p>
        </div>
      </section>

      <section className="card settings-card settings-partner" aria-labelledby="settings-partner-title">
        <p className="card-kicker" id="settings-partner-title">
          Partner
        </p>
        {partner ? (
          <>
            <div className="settings-partner-row">
              <ProfileAvatar profile={partner} size={48} />
              <div>
                <p className="settings-name">{partner.name}</p>
                <p className="settings-note">You&rsquo;re exploring with {partner.name}</p>
              </div>
            </div>
            <button type="button" className="settings-unlink" onClick={() => setConfirming(true)}>
              Unlink
            </button>
          </>
        ) : (
          <>
            <div className="settings-partner-row">
              <ProfileAvatar profile={null} size={48} />
              <p className="settings-name">You&rsquo;re walking solo</p>
            </div>
            <button type="button" className="btn-primary" onClick={onLinkPartner}>
              Link a partner
            </button>
          </>
        )}
      </section>

      <div className="settings-foot">
        <a className="settings-notice-link" href="/tester-notice" target="_blank" rel="noopener">
          Tester notice
        </a>
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {partner && confirming && (
        <UnlinkDialog name={partner.name} onUnlink={onUnlink} onClose={() => setConfirming(false)} />
      )}

      <BottomNav active="profile" onExplore={onExplore} />
    </div>
  );
}

function UnlinkDialog({
  name,
  onUnlink,
  onClose,
}: {
  name: string;
  onUnlink: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const unlinkRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  // The buttons were disabled while unlinking, so focus needs a home again after a failure.
  useEffect(() => {
    if (error) cancelRef.current?.focus();
  }, [error]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onUnlink();
      onClose();
    } catch {
      setError("Couldn't unlink. Check your connection and try again.");
      setBusy(false);
    }
  }

  // Escape cancels wherever focus sits, except while unlinking.
  useEffect(() => {
    if (busy) return;
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [busy, onClose]);

  // Keeps focus on the two buttons.
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      event.preventDefault();
      const next = document.activeElement === cancelRef.current ? unlinkRef.current : cancelRef.current;
      next?.focus();
    }
  }

  return (
    <div className="settings-backdrop" onKeyDown={handleKeyDown}>
      <div
        className="settings-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unlink-title"
        aria-describedby="unlink-body"
        aria-busy={busy}
      >
        <h2 id="unlink-title">Unlink from {name}?</h2>
        <p id="unlink-body">
          You stop sharing new trails. You both keep the photos from trails you walked together. {name} won&rsquo;t get
          a message.
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="settings-dialog-actions">
          <button ref={unlinkRef} type="button" className="settings-danger" onClick={confirm} disabled={busy}>
            {busy ? "Unlinking…" : "Unlink"}
          </button>
          <button ref={cancelRef} type="button" className="settings-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
