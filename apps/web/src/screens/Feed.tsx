import { useEffect, useState } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { BottomNav } from "../components/BottomNav";
import { BackIcon, CameraIcon, CompassIcon, HeartIcon, LeagueIcon, SparkIcon } from "../components/Icons";
import { DecryptionError } from "../lib/crypto";
import type { FeedItem } from "../lib/feed";
import { RunKeyPendingError } from "../lib/keys";
import { listRunPhotos, openStoredPhoto } from "../lib/photos";
import { useRunKeyLoader } from "../lib/photoKeys";
import { answerShare, loadShareRequests, ShareError } from "../lib/shares";
import type { ShareRequest } from "../lib/shares";
import { feedWhen, itemCopy, openFeed } from "./feedItems";
import type { FeedState, ShareAnswer } from "./feedItems";
import "../feed.css";

// The in-app feed behind the bell on Home (docs/mvp-roadmap.md, stage 10; gamification.md, 4.9). It shows only what
// the couple earned together or what the partner sent on purpose, never that the partner started or finished anything
// (abuse-threat-model.md, X1). The words live in feedItems.ts.

function ItemIcon({ kind }: { kind: FeedItem["kind"] }) {
  if (kind === "badge_earned") return <SparkIcon size={18} />;
  if (kind === "league_week_started") return <LeagueIcon size={18} />;
  if (kind === "walk_planned" || kind === "walk_plan_cancelled") return <CompassIcon size={18} />;
  if (kind === "share_requested") return <CameraIcon size={18} />;
  return <HeartIcon size={18} />;
}

type PhotoView = { status: "opening" } | { status: "shown"; src: string } | { status: "locked" | "missing" };

// One photo of a proposal, decrypted on this phone. The photo never leaves the phone in the clear.
function SharePhoto({ runId, photoId }: { runId: string; photoId: string }) {
  const loadKey = useRunKeyLoader();
  const [view, setView] = useState<PhotoView>({ status: "opening" });

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    (async () => {
      const photo = (await listRunPhotos(runId)).find((ph) => ph.id === photoId);
      if (!photo) return setView({ status: "missing" });
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error(`Photo download failed: ${res.status}`);
      const jpeg = await openStoredPhoto(photo, await res.blob(), photo.nonce === null ? null : await loadKey(runId));
      if (!alive) return;
      url = URL.createObjectURL(jpeg);
      setView({ status: "shown", src: url });
    })().catch((e: unknown) => {
      if (!alive) return;
      if (e instanceof RunKeyPendingError) setView({ status: "locked" });
      else {
        if (!(e instanceof DecryptionError)) console.error("Couldn't open the photo", e);
        setView({ status: "missing" });
      }
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [runId, photoId, loadKey]);

  if (view.status === "shown") return <img className="feed-photo" src={view.src} alt="The photo to share" />;
  return (
    <div className="feed-photo feed-photo-wait">
      {view.status === "opening" && "Opening the photo…"}
      {view.status === "locked" && "This photo opens once your partner’s phone has shared its key again."}
      {view.status === "missing" && "This photo can’t be shown on this phone."}
    </div>
  );
}

export function FeedView({
  state,
  partnerName,
  requests,
  answers,
  busy,
  failed = null,
  onAnswer,
  onRetry,
  onBack,
}: {
  state: FeedState;
  partnerName: string | null;
  // Open proposals waiting for this user's answer, by share ID.
  requests: Record<string, ShareRequest>;
  answers: Record<string, ShareAnswer>;
  // The share being answered right now, and one whose answer failed to save.
  busy: string | null;
  failed?: string | null;
  onAnswer: (shareId: string, approve: boolean) => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const name = partnerName ?? "Your partner";

  return (
    <div className="screen feed-screen with-nav">
      <StatusBar />
      <header className="feed-head">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Back to Home">
          <BackIcon />
        </button>
        <h2>Notifications</h2>
      </header>

      {state.status === "loading" && <p className="feed-note">Loading…</p>}
      {state.status === "error" && (
        <p className="feed-note">
          Couldn&rsquo;t load your notifications.{" "}
          <button type="button" className="inline-link" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <p className="feed-note">All quiet. New memories and plans for a walk will show up here.</p>
      )}

      {state.status === "ready" && state.items.length > 0 && (
        <ul className="feed-list">
          {state.items.map((item) => {
            const shareId = item.payload.shareId;
            const request = shareId ? requests[shareId] : undefined;
            const answer = shareId ? answers[shareId] : undefined;
            const copy = itemCopy(item, name, request, answer);
            const asking = item.kind === "share_requested" && request && !answer;
            return (
              <li key={item.id} className={`feed-item${item.readAt === null ? " is-new" : ""}`}>
                <span className="feed-icon" aria-hidden="true">
                  <ItemIcon kind={item.kind} />
                </span>
                <div className="feed-copy">
                  <small>
                    {feedWhen(item.createdAt)}
                    {item.readAt === null && <span className="feed-new">New</span>}
                  </small>
                  <strong>{copy.title}</strong>
                  <p>{copy.line}</p>
                  {asking && shareId && (
                    <>
                      {request.photoId && <SharePhoto runId={request.runId} photoId={request.photoId} />}
                      <div className="feed-actions">
                        <button
                          type="button"
                          className="btn-small"
                          disabled={busy !== null}
                          onClick={() => onAnswer(shareId, true)}
                        >
                          {busy === shareId ? "Saving…" : "Share it"}
                        </button>
                        <button
                          type="button"
                          className="btn-small ghost"
                          disabled={busy !== null}
                          onClick={() => onAnswer(shareId, false)}
                        >
                          Not this time
                        </button>
                      </div>
                      {failed === shareId && <p className="feed-error">Couldn&rsquo;t save that. Try again.</p>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BottomNav active="explore" onExplore={onBack} />
    </div>
  );
}

// The feed screen. Opening it marks what it shows as read; `onRead` lets the app refresh the bell.
export function Feed({
  partnerName,
  onBack,
  onRead,
}: {
  partnerName: string | null;
  onBack: () => void;
  onRead: () => void;
}) {
  const [state, setState] = useState<FeedState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [requests, setRequests] = useState<Record<string, ShareRequest>>({});
  const [answers, setAnswers] = useState<Record<string, ShareAnswer>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    openFeed().then(
      (items) => {
        if (!alive) return;
        setState({ status: "ready", items });
        onRead();
      },
      (e: unknown) => {
        console.error("Couldn't load the feed", e);
        if (alive) setState({ status: "error" });
      },
    );
    loadShareRequests().then(
      (list) => alive && setRequests(Object.fromEntries(list.map((r) => [r.shareId, r]))),
      (e: unknown) => console.error("Couldn't load share requests", e),
    );
    return () => {
      alive = false;
    };
    // onRead is a fresh function on every App render; the feed loads once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function handleAnswer(shareId: string, approve: boolean) {
    setBusy(shareId);
    setFailed(null);
    try {
      const status = await answerShare(shareId, approve);
      setAnswers((a) => ({ ...a, [shareId]: status === "declined" ? "declined" : "approved" }));
    } catch (e) {
      if (e instanceof ShareError && e.code === "share_gone") setAnswers((a) => ({ ...a, [shareId]: "gone" }));
      else {
        console.error("Couldn't answer the share", e);
        setFailed(shareId);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <FeedView
      state={state}
      partnerName={partnerName}
      requests={requests}
      answers={answers}
      busy={busy}
      failed={failed}
      onAnswer={(id, approve) => void handleAnswer(id, approve)}
      onRetry={() => {
        setState({ status: "loading" });
        setAttempt((n) => n + 1);
      }}
      onBack={onBack}
    />
  );
}
