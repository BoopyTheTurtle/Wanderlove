import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Profile } from "@wannadoo/core";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { BottomNav } from "../components/BottomNav";
import { formatRecoveryCode } from "../lib/crypto";
import { PairEmoji } from "./PartnerKeyConfirm";
import "../keys.css";
import "../settings.css";

export type SettingsProps = {
  me: Profile;
  email: string;
  // null means walking solo.
  partner: Profile | null;
  // The photo recovery code while this phone holds it unseen; null once the user has seen it.
  recoveryCode: string | null;
  // The user closed the code dialog: the phone forgets the code (security review, finding 3).
  onRecoveryCodeSeen: () => void;
  // Makes a new key pair and code (lib/keys.ts, rotateAccountKeys); the new code then arrives as recoveryCode.
  onNewRecoveryCode: () => Promise<void>;
  // This phone's key ID and the partner's, for the emoji check; the partner's is null while loading or keyless.
  myKeyId: string;
  partnerKeyId: string | null;
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
export function Settings({
  me,
  email,
  partner,
  recoveryCode,
  onRecoveryCodeSeen,
  onNewRecoveryCode,
  myKeyId,
  partnerKeyId,
  onUnlink,
  onLinkPartner,
  onSignOut,
  onExplore,
}: SettingsProps) {
  const [confirming, setConfirming] = useState(false);
  const [codeDialog, setCodeDialog] = useState<"closed" | "show" | "new">("closed");

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
            {partnerKeyId && (
              <div className="settings-key-check">
                <PairEmoji a={myKeyId} b={partnerKeyId} />
                <p className="settings-note">{partner.name}&rsquo;s Profile shows the same four.</p>
              </div>
            )}
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
        <button
          type="button"
          className="settings-notice-link settings-link-button"
          onClick={() => setCodeDialog(recoveryCode ? "show" : "new")}
        >
          {recoveryCode ? "Recovery code" : "Make a new recovery code"}
        </button>
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {partner && confirming && (
        <UnlinkDialog name={partner.name} onUnlink={onUnlink} onClose={() => setConfirming(false)} />
      )}

      {recoveryCode && codeDialog === "show" && (
        <RecoveryCodeDialog
          code={recoveryCode}
          onClose={() => {
            setCodeDialog("closed");
            onRecoveryCodeSeen();
          }}
        />
      )}

      {codeDialog === "new" && (
        <NewCodeDialog
          partnerName={partner?.name ?? null}
          onMake={async () => {
            await onNewRecoveryCode();
            setCodeDialog("show");
          }}
          onClose={() => setCodeDialog("closed")}
        />
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

// Confirms a new recovery code. The private key cannot leave the phone, so a new code means new keys.
function NewCodeDialog({
  partnerName,
  onMake,
  onClose,
}: {
  partnerName: string | null;
  onMake: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    if (busy) return;
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [busy, onClose]);

  async function make() {
    setBusy(true);
    setError(false);
    try {
      await onMake();
    } catch (e) {
      console.error("Couldn't make a new recovery code", e);
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop">
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-code-title"
        aria-describedby="new-code-body"
        aria-busy={busy}
      >
        <h2 id="new-code-title">Make a new recovery code?</h2>
        <p id="new-code-body">
          Your photos stay. Your old code stops working, and any other phone you use will ask for the new one.
          {partnerName && ` ${partnerName} will be asked to confirm your new keys.`}
        </p>
        {error && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t make a new code. Check your connection and try again.
          </p>
        )}
        <div className="settings-dialog-actions">
          <button type="button" className="btn-primary" onClick={() => void make()} disabled={busy}>
            {busy ? "Making…" : "Make new code"}
          </button>
          <button ref={cancelRef} type="button" className="settings-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// The photo recovery code, shown once: it unlocks the photos on a new phone. Closing forgets it on this phone.
function RecoveryCodeDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const formatted = formatRecoveryCode(code);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      opener?.focus();
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code stays selectable.
    }
  }

  return (
    <div className="settings-backdrop">
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-body"
      >
        <h2 id="recovery-title">Recovery code</h2>
        <p id="recovery-body">
          <strong>Write this down. It won&rsquo;t be shown again.</strong> On a new phone, this code unlocks your
          photos. Without it, your partner can share your trails with you again.
        </p>
        <p className="recovery-code" aria-label={formatted}>
          {/* Two lines of three groups, so the code never breaks inside a group */}
          <span>{formatted.slice(0, 14)}</span>
          <span>{formatted.slice(15)}</span>
        </p>
        <div className="settings-dialog-actions">
          <button type="button" className="settings-cancel" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <button ref={closeRef} type="button" className="btn-primary" onClick={onClose}>
            I&rsquo;ve saved it
          </button>
        </div>
      </div>
    </div>
  );
}
