import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
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
  // The code dialog opened: the server records the first viewing.
  onRecoveryCodeShown: () => void;
  // When the current recovery code was first shown, or null if never (or not loaded yet).
  recoveryViewedAt: string | null;
  // Photos this user hid from their album; Show them again brings them all back. May reject.
  hiddenPhotoCount: number;
  onShowHiddenPhotos: () => Promise<void>;
  // True when quests should leave out movement tasks; null while loading. Only this user sees it.
  mobility: boolean | null;
  // Saves the setting; may reject.
  onMobilityChange: (mobility: boolean) => Promise<void>;
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
  // Signs the account out on every other device; may reject.
  onSignOutOthers: () => Promise<void>;
  // Signs out and removes everything Wannadoo keeps on this phone for the user, then reloads; may reject.
  onLeaveClean: () => Promise<void>;
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
  onRecoveryCodeShown,
  recoveryViewedAt,
  hiddenPhotoCount,
  onShowHiddenPhotos,
  mobility,
  onMobilityChange,
  onNewRecoveryCode,
  myKeyId,
  partnerKeyId,
  onUnlink,
  onLinkPartner,
  onSignOut,
  onSignOutOthers,
  onLeaveClean,
  onExplore,
}: SettingsProps) {
  const [confirming, setConfirming] = useState(false);
  const [codeDialog, setCodeDialog] = useState<"closed" | "show" | "new">("closed");
  const [deviceDialog, setDeviceDialog] = useState<"closed" | "others" | "clean">("closed");
  const [othersSignedOut, setOthersSignedOut] = useState(false);
  const [unhiding, setUnhiding] = useState(false);
  const [unhideFailed, setUnhideFailed] = useState(false);
  const [savingMobility, setSavingMobility] = useState(false);
  const [mobilityFailed, setMobilityFailed] = useState(false);

  async function changeMobility(next: boolean) {
    setSavingMobility(true);
    setMobilityFailed(false);
    try {
      await onMobilityChange(next);
    } catch (e) {
      console.error("Couldn't save the mobility setting", e);
      setMobilityFailed(true);
    } finally {
      setSavingMobility(false);
    }
  }

  async function showHidden() {
    setUnhiding(true);
    setUnhideFailed(false);
    try {
      await onShowHiddenPhotos();
    } catch (e) {
      console.error("Couldn't show the hidden photos", e);
      setUnhideFailed(true);
    } finally {
      setUnhiding(false);
    }
  }

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

      <section className="card settings-card settings-devices" aria-labelledby="settings-quests-title">
        <p className="card-kicker" id="settings-quests-title">
          Your quests
        </p>
        <label className="consent">
          <input
            type="checkbox"
            checked={mobility === true}
            disabled={mobility === null || savingMobility}
            onChange={(e) => void changeMobility(e.target.checked)}
          />
          <span>Fewer movement tasks</span>
        </label>
        <p className="settings-note">
          Quests leave out tasks that ask you to move about, like posing or racing. Only you see this.
        </p>
        {mobilityFailed && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t save that. Check your connection and try again.
          </p>
        )}
      </section>

      {hiddenPhotoCount > 0 && (
        <section className="card settings-card settings-devices" aria-labelledby="settings-hidden-title">
          <p className="card-kicker" id="settings-hidden-title">
            Your album
          </p>
          <p className="settings-note">
            {hiddenPhotoCount === 1 ? "1 photo is" : `${hiddenPhotoCount} photos are`} hidden from your album. Nobody
            else&rsquo;s album changed.
          </p>
          <button type="button" className="settings-outline" disabled={unhiding} onClick={() => void showHidden()}>
            {unhiding ? "Showing…" : "Show hidden photos again"}
          </button>
          {unhideFailed && (
            <p className="field-error" role="alert">
              Couldn&rsquo;t show them. Check your connection and try again.
            </p>
          )}
        </section>
      )}

      <section className="card settings-card settings-devices" aria-labelledby="settings-devices-title">
        <p className="card-kicker" id="settings-devices-title">
          Your phones
        </p>
        <button type="button" className="settings-outline" onClick={() => setDeviceDialog("others")}>
          Sign out everywhere else
        </button>
        {othersSignedOut ? (
          <p className="settings-note settings-done" role="status">
            Done. Every other phone and browser is signed out.
          </p>
        ) : (
          <p className="settings-note">For a phone you lost or no longer trust. This one stays signed in.</p>
        )}
        <button type="button" className="settings-outline" onClick={() => setDeviceDialog("clean")}>
          Leave this phone clean
        </button>
        <p className="settings-note">Signs out and removes your keys and trail data from this phone.</p>
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
        {recoveryViewedAt && (
          <p className="settings-viewed">
            Recovery code viewed on{" "}
            {new Date(recoveryViewedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
        <button type="button" className="text-button" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {partner && confirming && (
        <UnlinkDialog name={partner.name} onUnlink={onUnlink} onClose={() => setConfirming(false)} />
      )}

      {deviceDialog === "others" && (
        <ConfirmDialog
          id="sign-out-others"
          title="Sign out everywhere else?"
          body="Every other phone and browser signed in to your account is signed out. One that is open right now may take up to an hour to notice. This phone stays signed in."
          action="Sign out others"
          busyAction="Signing out…"
          error="Couldn't sign out the other devices. Check your connection and try again."
          onConfirm={async () => {
            await onSignOutOthers();
            setOthersSignedOut(true);
          }}
          onClose={() => setDeviceDialog("closed")}
        />
      )}

      {deviceDialog === "clean" && (
        <ConfirmDialog
          id="leave-clean"
          title="Leave this phone clean?"
          body={
            <>
              {recoveryCode && (
                <strong>
                  You haven&rsquo;t saved your recovery code yet. Save it first, from Recovery code below.{" "}
                </strong>
              )}
              This signs you out and removes your photo keys and trail data from this phone. Your trails and photos stay
              in your account. To see your photos here again, sign in with your recovery code, or make new keys and ask{" "}
              {partner?.name ?? "your partner"} to share your trails again.
            </>
          }
          action="Sign out and clean"
          busyAction="Cleaning…"
          error="Couldn't sign out. Check your connection and try again."
          onConfirm={onLeaveClean}
          onClose={() => setDeviceDialog("closed")}
        />
      )}

      {recoveryCode && codeDialog === "show" && (
        <RecoveryCodeDialog
          code={recoveryCode}
          onShown={onRecoveryCodeShown}
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
  return (
    <ConfirmDialog
      id="unlink"
      title={`Unlink from ${name}?`}
      body={`You stop sharing new trails. You both keep the photos from trails you walked together. ${name} won’t get a message.`}
      action="Unlink"
      busyAction="Unlinking…"
      error="Couldn't unlink. Check your connection and try again."
      onConfirm={onUnlink}
      onClose={onClose}
    />
  );
}

// A calm confirmation for an action this screen can't undo: the action in red, Cancel focused first.
function ConfirmDialog({
  id,
  title,
  body,
  action,
  busyAction,
  error: errorText,
  onConfirm,
  onClose,
}: {
  id: string;
  title: string;
  body: ReactNode;
  action: string;
  busyAction: string;
  // Shown when onConfirm rejects.
  error: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  // The buttons were disabled while working, so focus needs a home again after a failure.
  useEffect(() => {
    if (error) cancelRef.current?.focus();
  }, [error]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error(`${action} failed`, e);
      setError(errorText);
      setBusy(false);
    }
  }

  // Escape cancels wherever focus sits, except while working.
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
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current;
      next?.focus();
    }
  }

  return (
    <div className="settings-backdrop" onKeyDown={handleKeyDown}>
      <div
        className="settings-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        aria-busy={busy}
      >
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-body`}>{body}</p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="settings-dialog-actions">
          <button
            ref={confirmRef}
            type="button"
            className="settings-danger"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? busyAction : action}
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
function RecoveryCodeDialog({ code, onShown, onClose }: { code: string; onShown: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const formatted = formatRecoveryCode(code);

  // Once per showing; the server keeps only the first date, so a repeat does no harm.
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    onShown();
  }, [onShown]);

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
