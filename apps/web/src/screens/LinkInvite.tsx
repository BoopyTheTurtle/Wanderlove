import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { HeartIcon } from "../components/Icons";
import { isCompleteCode, peekInvite, redeemInvite } from "../lib/couples";
import type { InvitePeek, PeekStatus } from "../lib/couples";

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
  | { status: "problem"; problem: Problem };

// The accept screen for an invite, from a /link/<code> URL or a typed code.
export function LinkInvite({
  code,
  onLinked,
  onDone,
}: {
  code: string;
  // Loads the new partner and moves on; handles its own errors.
  onLinked: () => Promise<void>;
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
    let result;
    try {
      result = await redeemInvite(code);
    } catch {
      setError("Couldn’t link. Check your connection and try again.");
      setState({ status: "ready", peek });
      return;
    }
    if (result === "linked") await onLinked();
    else setState({ status: "problem", problem: result });
  }

  if (state.status === "ready" || state.status === "linking") {
    const name = state.peek.inviterName ?? "your partner";
    const busy = state.status === "linking";
    return (
      <InviteLayout
        title={`Link with ${name}?`}
        body="Once linked, you both see the trails you walk together and their photos. If you unlink, you each keep the photos from trails you walked together."
        heart
      >
        <div className="card auth-card invite-card">
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="btn-primary" onClick={() => void link(state.peek)} disabled={busy}>
            {busy ? "Linking…" : "Link"}
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
