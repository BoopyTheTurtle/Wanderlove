import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { HeartIcon, ShareIcon } from "../components/Icons";
import { createInvite, formatCode, inviteUrl, isCompleteCode, normalizeCode } from "../lib/couples";
import type { Profile } from "@wannadoo/core";

type Invite = { status: "loading" } | { status: "error" } | { status: "ready"; code: string };

// Shown while walking solo: an invite to share, a field for a partner's code, and the way to walk solo.
export function PartnerLink({
  me,
  onEnterCode,
  onWalkSolo,
  onInviteRefused,
  onSignOut,
}: {
  me: Profile;
  // A typed code, normalised and complete; opens the accept screen.
  onEnterCode: (code: string) => void;
  onWalkSolo: () => void;
  // The server refused to create an invite, most likely because this user got linked meanwhile.
  onInviteRefused: () => void;
  onSignOut: () => void;
}) {
  const [invite, setInvite] = useState<Invite>({ status: "loading" });
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const started = useRef(false);

  const makeInvite = useCallback(async () => {
    setInvite({ status: "loading" });
    setShareNote(null);
    try {
      setInvite({ status: "ready", code: await createInvite() });
    } catch {
      setInvite({ status: "error" });
      onInviteRefused();
    }
  }, [onInviteRefused]);

  // Once per visit: each new invite cancels the previous one, so StrictMode's second run must not make another.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void makeInvite();
  }, [makeInvite]);

  async function share(code: string) {
    const url = inviteUrl(code);
    setShareNote(null);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Wannadoo", text: `Link with ${me.name} on Wannadoo`, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied. Paste it into a message to your partner.");
    } catch {
      setShareNote(url);
    }
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    const code = normalizeCode(typed);
    if (!isCompleteCode(code)) {
      setTypedError("An invite code has 10 letters and numbers.");
      return;
    }
    onEnterCode(code);
  }

  return (
    <div className="screen light-screen partner-screen">
      <div className="adventure-top">
        <img className="adventure-bg" src="/adventure-bg.jpg" alt="" />
        <StatusBar light />

        <div className="partner-copy">
          <h1>Are you ready for an adventure?</h1>
          <h2 className="partner-sub">Invite your partner</h2>
        </div>

        <div className="partner-hero">
          <ProfileAvatar profile={me} size={64} />
          <span className="link-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <ProfileAvatar profile={null} size={64} />
        </div>
      </div>

      <section className="card link-card qr-card" aria-label="Your invite">
        {invite.status === "ready" ? (
          <>
            <div className="qr-frame">
              <QRCodeSVG
                value={inviteUrl(invite.code)}
                size={148}
                fgColor="#1b3431"
                bgColor="transparent"
                level="M"
                title="Invite QR code"
              />
            </div>
            <p className="qr-caption">
              Your partner scans this with their phone&rsquo;s camera, or types the code.
              <b className="invite-code">{formatCode(invite.code)}</b>
            </p>
            <button type="button" className="btn-primary" onClick={() => void share(invite.code)}>
              <ShareIcon size={18} /> Share link
            </button>
            {shareNote && (
              <p className="share-note" role="status">
                {shareNote}
              </p>
            )}
            <p className="hint">The invite works once and expires in 24 hours.</p>
          </>
        ) : invite.status === "error" ? (
          <>
            <p className="qr-caption">Couldn&rsquo;t create an invite. Check your connection and try again.</p>
            <button type="button" className="btn-primary" onClick={() => void makeInvite()}>
              Try again
            </button>
          </>
        ) : (
          <>
            <div className="qr-frame qr-placeholder" aria-hidden="true" />
            <p className="qr-caption">Creating your invite…</p>
          </>
        )}
      </section>

      {entering ? (
        <form className="card link-card code-card" onSubmit={submitCode} noValidate>
          <label className="field">
            <span>Partner&rsquo;s invite code</span>
            <span className={typedError ? "field-input invalid" : "field-input"}>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="ABCDE-12345"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setTypedError(null);
                }}
                aria-invalid={typedError !== null}
                autoFocus
              />
            </span>
          </label>
          {typedError && (
            <p className="field-error" role="alert">
              {typedError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={!typed.trim()}>
            Continue
          </button>
        </form>
      ) : (
        <div className="partner-foot">
          <button type="button" className="text-button" onClick={() => setEntering(true)}>
            Have a code? Enter it
          </button>
        </div>
      )}

      <div className="partner-foot">
        <button type="button" className="text-button" onClick={onWalkSolo}>
          Walk solo for now
        </button>
        <button type="button" className="dev-switch" onClick={onSignOut}>
          {me.name} · Sign out
        </button>
      </div>
    </div>
  );
}

// Shown once a link succeeds, on either phone.
export function LinkedScreen({ me, partner, onContinue }: { me: Profile; partner: Profile; onContinue: () => void }) {
  return (
    <div className="screen light-screen partner-screen">
      <StatusBar />
      <div className="partner-hero linked">
        <ProfileAvatar profile={me} size={84} />
        <span className="link-heart">
          <HeartIcon size={20} filled />
        </span>
        <ProfileAvatar profile={partner} size={84} />
      </div>
      <div className="partner-copy">
        <p className="eyebrow">Linked</p>
        <h1>You&rsquo;re exploring with {partner.name}</h1>
        <p>You both see the trails you walk together and their photos.</p>
      </div>
      <div className="partner-actions">
        <button type="button" className="btn-primary" onClick={onContinue}>
          Let&rsquo;s go
        </button>
      </div>
    </div>
  );
}
