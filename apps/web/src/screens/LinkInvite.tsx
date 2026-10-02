import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { HeartIcon } from "../components/Icons";
import { declineLink, isCompleteCode, loadLinkRequests, peekInvite, redeemInvitePending } from "../lib/couples";
import type { InvitePeek, LinkRequest, PeekStatus } from "../lib/couples";
import { checkInviterKey, expectPartnerKey } from "../lib/keys";
import { PairEmoji } from "./PartnerKeyConfirm";
import "../keys.css";

type Problem = Exclude<PeekStatus, "valid">;

const PROBLEMS: Record<Problem, { title: string; body: string }> = {
  invalid: {
    title: "This invite doesn’t work",
    body: "It may have been used already, or the code has a typo. Ask your partner for a new invite.",
  },
  expired: {
    title: "This invite has expired",
    body: "Invites last 24 hours. Ask your partner for a new one.",
  },
  self: {
    title: "That’s your own invite",
    body: "Send it to your partner, and they open it on their phone.",
  },
  already_linked: {
    title: "One of you is already linked",
    body: "You can link with one partner at a time. To link with someone new, unlink first in Settings, under Profile.",
  },
  rate_limited: {
    title: "Too many tries",
    body: "For safety, invites are paused for a while. Try again in an hour.",
  },
};

type State =
  | { status: "checking" }
  | { status: "offline" }
  | { status: "ready"; peek: InvitePeek }
  | { status: "linking"; peek: InvitePeek }
  // Requested, but the check of the inviter's key against the invite's key ID has not finished.
  | { status: "verifyOffline"; peek: InvitePeek }
  | { status: "problem"; problem: Problem }
  | { status: "mismatch"; name: string };

// The accept screen for an invite, from a /link/<code> URL, a scanned QR, or a typed code. "Link" asks the inviter to
// confirm (docs/private-trails.md, section 6). A link or QR carries the inviter's key ID; while the request is open the
// phone checks the inviter's published key against it and withdraws the request on a mismatch (lib/keys.ts).
export function LinkInvite({
  code,
  keyId,
  myId,
  onPending,
  onDone,
}: {
  code: string;
  // The inviter's key ID from the link's fragment; null for a typed code.
  keyId: string | null;
  myId: string;
  // The request is sent and checked: on to waiting for the inviter.
  onPending: () => void;
  // "Not now", or leaving after a problem.
  onDone: () => void;
}) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [error, setError] = useState<string | null>(null);
  const peeked = useRef<string | null>(null);

  const check = useCallback(async () => {
    setState({ status: "checking" });
    if (!isCompleteCode(code)) {
      setState({ status: "problem", problem: "invalid" });
      return;
    }
    try {
      const peek = await peekInvite(code);
      setState(peek.status === "valid" ? { status: "ready", peek } : { status: "problem", problem: peek.status });
    } catch {
      setState({ status: "offline" });
    }
  }, [code]);

  // Once per code: a failed look-up counts toward the attempt limit, so StrictMode's second run must not repeat it.
  useEffect(() => {
    if (peeked.current === code) return;
    peeked.current = code;
    void check();
  }, [code, check]);

  async function link(peek: InvitePeek) {
    setState({ status: "linking", peek });
    setError(null);
    // Recorded first, so a check the app could not finish here still runs once linked (KeyGate).
    expectPartnerKey(myId, keyId);
    let result;
    try {
      result = await redeemInvitePending(code);
    } catch {
      setError("Couldn’t send your request. Check your connection and try again.");
      setState({ status: "ready", peek });
      return;
    }
    if (result !== "pending") {
      expectPartnerKey(myId, null);
      setState({ status: "problem", problem: result });
      return;
    }
    await verify(peek);
  }

  // The inviter's key against the invite's key ID, before the inviter confirms: a mismatch withdraws the request, so
  // nobody is ever linked to the wrong keys.
  async function verify(peek: InvitePeek) {
    setState({ status: "linking", peek });
    setError(null);
    try {
      const request = (await loadLinkRequests(myId)).outgoing;
      if (!request) {
        setState({ status: "problem", problem: "invalid" });
        return;
      }
      if ((await checkInviterKey(myId, request.otherId)) === "mismatch") {
        setState({ status: "mismatch", name: peek.inviterName ?? request.otherName });
        await declineLink(request.id).catch((e: unknown) => console.error("Couldn't withdraw the request", e));
        return;
      }
    } catch (e) {
      console.error("Couldn't check the inviter's keys", e);
      if (keyId) {
        setState({ status: "verifyOffline", peek });
        return;
      }
    }
    onPending();
  }

  if (state.status === "mismatch") {
    return (
      <InviteLayout
        title={`This invite doesn’t match ${state.name}’s keys`}
        body={`Ask ${state.name} to show a new code.`}
      >
        <div className="card auth-card invite-card">
          <button type="button" className="btn-primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </InviteLayout>
    );
  }

  if (state.status === "verifyOffline") {
    const name = state.peek.inviterName ?? "your partner";
    return (
      <InviteLayout
        title={`Couldn’t check ${name}’s keys`}
        body="Your request is sent. Check your connection and try again; the app checks again once you’re linked."
      >
        <div className="card auth-card invite-card">
          <button type="button" className="btn-primary" onClick={() => void verify(state.peek)}>
            Try again
          </button>
          <button type="button" className="btn-soft" onClick={onPending}>
            Continue
          </button>
        </div>
      </InviteLayout>
    );
  }

  if (state.status === "ready" || state.status === "linking") {
    const name = state.peek.inviterName ?? "your partner";
    const busy = state.status === "linking";
    return (
      <InviteLayout
        title={`Link with ${name}?`}
        body={`${name} confirms on their phone. Once linked, you both see the trails you walk together and their photos. If you unlink, you each keep the photos from trails you walked together.`}
        heart
      >
        <div className="card auth-card invite-card">
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn-primary" onClick={() => void link(state.peek)} disabled={busy}>
            {busy ? "Asking…" : "Ask to link"}
          </button>
          <button type="button" className="btn-soft" onClick={onDone} disabled={busy}>
            Not now
          </button>
        </div>
      </InviteLayout>
    );
  }

  if (state.status === "problem") {
    const { title, body } = PROBLEMS[state.problem];
    return (
      <InviteLayout title={title} body={body}>
        <div className="card auth-card invite-card">
          <button type="button" className="btn-primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </InviteLayout>
    );
  }

  if (state.status === "offline") {
    return (
      <InviteLayout title="Couldn’t check the invite" body="Check your connection and try again.">
        <div className="card auth-card invite-card">
          <button type="button" className="btn-primary" onClick={() => void check()}>
            Try again
          </button>
          <button type="button" className="btn-soft" onClick={onDone}>
            Not now
          </button>
        </div>
      </InviteLayout>
    );
  }

  return <InviteLayout title="Checking the invite…" body="One moment." />;
}

function hoursLeft(expiresAt: string): string {
  const hours = Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000));
  return hours === 1 ? "about an hour" : `${hours} hours`;
}

// The invitee's phone after "Ask to link", until the inviter confirms. `request` is undefined while loading and null
// once the request has closed: declined, withdrawn, or lapsed. The reason stays unsaid.
export function LinkWaiting({
  request,
  myKeyId,
  inviterKeyId,
  onCancel,
  onDone,
}: {
  request: LinkRequest | null | undefined;
  myKeyId: string;
  inviterKeyId: string | null;
  onCancel: (request: LinkRequest) => Promise<void>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (request === undefined) return <InviteLayout title="Checking your request…" body="One moment." />;

  if (request === null) {
    return (
      <InviteLayout
        title="Your request has closed"
        body="Nobody was linked. If you still want to link, ask for a new invite."
      >
        <div className="card auth-card invite-card">
          <button type="button" className="btn-primary" onClick={onDone}>
            Continue
          </button>
        </div>
      </InviteLayout>
    );
  }

  async function cancel(r: LinkRequest) {
    setBusy(true);
    setFailed(false);
    try {
      await onCancel(r);
    } catch (e) {
      console.error("Couldn't withdraw the request", e);
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <InviteLayout
      title={`Waiting for ${request.otherName}`}
      body={`${request.otherName} confirms on their phone. The request lapses in ${hoursLeft(request.expiresAt)}.`}
      heart
    >
      <div className="card auth-card invite-card">
        {inviterKeyId && (
          <>
            <p className="key-check-lead">Check that {request.otherName}&rsquo;s phone shows the same four:</p>
            <PairEmoji a={myKeyId} b={inviterKeyId} />
          </>
        )}
        {failed && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t withdraw the request. Check your connection and try again.
          </p>
        )}
        <button type="button" className="btn-soft" disabled={busy} onClick={() => void cancel(request)}>
          {busy ? "Withdrawing…" : "Withdraw request"}
        </button>
      </div>
    </InviteLayout>
  );
}

// The inviter's phone: someone used the invite. Nobody is linked until Confirm; the emoji let both compare keys.
export function LinkRequestDialog({
  request,
  myKeyId,
  inviteeKeyId,
  onConfirm,
  onDecline,
}: {
  request: LinkRequest;
  myKeyId: string;
  inviteeKeyId: string | null;
  onConfirm: () => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (e) {
      console.error("Couldn't answer the link request", e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notice-backdrop">
      <div
        className="notice-dialog link-request"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="link-request-title"
      >
        <h2 id="link-request-title">{request.otherName} used your invite</h2>
        <p className="link-request-body">
          Link with {request.otherName}? You&rsquo;ll both see the trails you walk together and their photos.
        </p>
        {inviteeKeyId && (
          <div className="link-request-keys">
            <p className="key-check-lead">{request.otherName}&rsquo;s phone shows these four:</p>
            <PairEmoji a={myKeyId} b={inviteeKeyId} />
          </div>
        )}
        {failed && (
          <p className="field-error" role="alert">
            Couldn&rsquo;t reach Wannadoo. Check your connection and try again.
          </p>
        )}
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void act(onConfirm)}>
          Confirm
        </button>
        <button type="button" className="btn-soft" disabled={busy} onClick={() => void act(onDecline)}>
          Decline
        </button>
      </div>
    </div>
  );
}

function InviteLayout({
  title,
  body,
  heart,
  children,
}: {
  title: string;
  body: string;
  heart?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="screen auth-screen invite-screen">
      <StatusBar />
      <div className="onboarding-head">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        {heart && (
          <span className="invite-heart" aria-hidden="true">
            <HeartIcon size={26} filled />
          </span>
        )}
        <h1>{title}</h1>
        <p className="intro">{body}</p>
      </div>
      {children}
    </div>
  );
}
