import { useCallback, useEffect, useRef, useState } from "react";
import { slugify } from "../lib/saveFiles";
import { ShareError, cancelShare, confirmShare, loadRunShare, proposeShare } from "../lib/shares";
import type { RunShare } from "../lib/shares";
import type { ShownPhoto } from "../lib/useRunPhotos";
import { ShareIcon } from "./Icons";
import { pointsLine, sharePhotoFile, shareRefusal, shareStage } from "./planShare";
import type { ShareStage } from "./planShare";
import "./plan-share.css";

// Consent-first sharing on a finished Together quest's complete screen (gamification.md, 4.8; mvp-roadmap.md, Share
// consent). Either partner proposes one photo; the partner answers in their feed, or standing consent approves it at
// once. Once approved, the proposer's phone hands the decrypted photo to the share sheet and then confirms, which earns
// the points. The proposer sees no timer and gets no reminder; a decline reads "Not this time" and nothing more.

type LoadState = RunShare | null | "loading" | "failed";
export type ShareAction = "propose" | "cancel" | "share";

export function ShareProposal({
  runId,
  trailName,
  partnerName,
  photos,
  syncTick,
  onPointsEarned,
}: {
  runId: string;
  trailName: string;
  partnerName: string;
  // The quest's photos from both partners; only the ones this phone has opened can be picked or shared.
  photos: ShownPhoto[];
  syncTick: number;
  onPointsEarned: () => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickAgain, setPickAgain] = useState(false);
  const [busy, setBusy] = useState<ShareAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const file = useRef<{ photoId: string; file: File } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const share = await loadRunShare(runId);
      if (alive.current) setState(share);
    } catch (e) {
      console.error("Couldn't load the quest's share", e);
      if (alive.current) setState((s) => (s === "loading" ? "failed" : s));
    }
  }, [runId]);

  // Each sync reloads, so an answer from the partner shows up without a timer or a poll of our own.
  useEffect(() => {
    void reload();
  }, [reload, syncTick]);

  const share = typeof state === "object" ? state : null;
  const stage = typeof state === "object" ? shareStage(share, pickAgain) : null;
  const approvedPhoto =
    stage?.kind === "approved" ? (photos.find((p) => p.id === stage.photoId && p.src !== null) ?? null) : null;

  // Prepare the approved photo ahead of the tap: iOS opens the share sheet only right after one.
  useEffect(() => {
    if (!approvedPhoto?.src || file.current?.photoId === approvedPhoto.id) return;
    const { id, src } = approvedPhoto;
    void fetch(src)
      .then((res) => res.blob())
      .then((blob) => {
        file.current = {
          photoId: id,
          file: new File([blob], `wannadoo-${slugify(trailName)}.jpg`, { type: "image/jpeg" }),
        };
      })
      .catch((e: unknown) => console.error("Couldn't prepare the photo to share", e));
  }, [approvedPhoto, trailName]);

  async function act(action: ShareAction, work: () => Promise<void>) {
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (e) {
      if (!(e instanceof ShareError)) console.error(`Share: ${action} failed`, e);
      if (alive.current) setError(shareRefusal(e, partnerName));
    }
    await reload();
    if (alive.current) setBusy(null);
  }

  function propose() {
    if (!picked) return;
    void act("propose", async () => {
      await proposeShare(picked);
      setPicked(null);
      setPickAgain(false);
    });
  }

  function cancel() {
    if (stage?.kind !== "waiting" && stage?.kind !== "approved") return;
    const { shareId } = stage;
    void act("cancel", () => cancelShare(shareId));
  }

  function shareNow() {
    if (stage?.kind !== "approved") return;
    const { shareId, photoId } = stage;
    void act("share", async () => {
      const ready = file.current?.photoId === photoId ? file.current.file : null;
      if (!ready) throw new Error("The photo isn't ready to share yet");
      const outcome = await sharePhotoFile(ready);
      setNeedsTap(outcome === "needs-tap");
      // A download is not a share: points come only when a phone's share sheet completes (Edgar, October 2).
      setDownloaded(outcome === "downloaded");
      if (outcome !== "shared") return;
      const points = await confirmShare(shareId);
      if (alive.current) setEarned(points);
      if (points > 0) onPointsEarned();
    });
  }

  return (
    <ShareProposalView
      partnerName={partnerName}
      stage={state === "failed" ? "failed" : stage}
      photos={photos}
      picked={picked}
      busy={busy}
      error={error}
      earned={earned}
      needsTap={needsTap}
      downloaded={downloaded}
      photoReady={approvedPhoto !== null}
      onPick={setPicked}
      onPropose={propose}
      onCancel={cancel}
      onShare={shareNow}
      onPickAgain={() => {
        setPickAgain(true);
        setError(null);
      }}
      onRetry={() => {
        setState("loading");
        void reload();
      }}
    />
  );
}

export function ShareProposalView({
  partnerName,
  stage,
  photos,
  picked,
  busy,
  error,
  earned,
  needsTap,
  downloaded = false,
  photoReady,
  onPick,
  onPropose,
  onCancel,
  onShare,
  onPickAgain,
  onRetry,
}: {
  partnerName: string;
  // Null while loading.
  stage: ShareStage | "failed" | null;
  photos: ShownPhoto[];
  picked: string | null;
  busy: ShareAction | null;
  error: string | null;
  // Points the confirmation on this screen just returned.
  earned: number | null;
  needsTap: boolean;
  // The photo saved to a computer with no share sheet; no points for that.
  downloaded?: boolean;
  // The approved photo has opened on this phone.
  photoReady: boolean;
  onPick: (photoId: string) => void;
  onPropose: () => void;
  onCancel: () => void;
  onShare: () => void;
  onPickAgain: () => void;
  onRetry: () => void;
}) {
  if (stage === null) return null;

  const errorLine = error && (
    <p className="plan-share-error" role="alert">
      {error}
    </p>
  );

  function body() {
    if (stage === null) return null;
    if (stage === "failed") {
      return (
        <>
          <p className="plan-share-note">Couldn&rsquo;t check this quest&rsquo;s share.</p>
          <button type="button" className="plan-share-outline" onClick={onRetry}>
            Try again
          </button>
        </>
      );
    }

    switch (stage.kind) {
      case "pick": {
        const choices = photos.filter((p) => p.src !== null && p.id !== stage.excludePhotoId);
        if (choices.length === 0) {
          return <p className="plan-share-note">Add a photo of the walk, and you can ask to share it.</p>;
        }
        return (
          <>
            <p className="plan-share-note">
              Pick one photo. {partnerName} sees it and says yes or not this time before anything leaves the app.
            </p>
            <div className="share-photos" role="radiogroup" aria-label="Photo to share">
              {choices.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={picked === p.id}
                  aria-label={`Photo ${i + 1} of ${choices.length}`}
                  className="share-photo"
                  disabled={busy !== null}
                  onClick={() => onPick(p.id)}
                >
                  <img src={p.src!} alt="" />
                </button>
              ))}
            </div>
            <p className="plan-share-note plan-share-warning">
              A shared photo leaves end-to-end encryption: once it&rsquo;s posted, Wannadoo can no longer keep it
              private.
            </p>
            {errorLine}
            <button type="button" className="plan-share-solid" disabled={!picked || busy !== null} onClick={onPropose}>
              {busy === "propose" ? "Asking…" : `Ask ${partnerName}`}
            </button>
          </>
        );
      }
      case "waiting":
        return (
          <>
            <p className="plan-share-lead">Waiting for {partnerName}</p>
            <p className="plan-share-note">
              They&rsquo;ll answer when they&rsquo;re ready. Nothing is shared until then.
            </p>
            {errorLine}
            <button type="button" className="plan-share-outline" disabled={busy !== null} onClick={onCancel}>
              {busy === "cancel" ? "Withdrawing…" : "Withdraw"}
            </button>
          </>
        );
      case "approved":
        return (
          <>
            <p className="plan-share-lead">
              {stage.auto ? `${partnerName} lets you share` : `${partnerName} said yes`}
            </p>
            <p className="plan-share-note">
              {needsTap
                ? "Ready. Tap once more to open the share sheet."
                : downloaded
                  ? "Saved to this computer. Points come when you share from a phone."
                  : "Share it wherever you like."}
            </p>
            {errorLine}
            <button
              type="button"
              className="plan-share-solid"
              disabled={!photoReady || busy !== null}
              onClick={onShare}
            >
              <ShareIcon size={16} /> {busy === "share" ? "Sharing…" : photoReady ? "Share the photo" : "Opening…"}
            </button>
            <button type="button" className="plan-share-outline" disabled={busy !== null} onClick={onCancel}>
              {busy === "cancel" ? "Withdrawing…" : "Don’t share after all"}
            </button>
          </>
        );
      case "declined":
        return (
          <>
            <p className="plan-share-lead">Not this time</p>
            {errorLine}
            <button type="button" className="plan-share-outline" onClick={onPickAgain}>
              Pick a different photo
            </button>
          </>
        );
      case "shared":
        return (
          <p className="plan-share-lead" role="status">
            {earned !== null
              ? pointsLine(earned)
              : stage.points > 0
                ? `Shared. It earned ${stage.points} points together.`
                : "Shared."}
          </p>
        );
      case "partner-asked":
        return (
          <p className="plan-share-note">
            {partnerName} asked to share a photo of this walk. You can answer in your feed.
          </p>
        );
      case "partner-approved":
        return <p className="plan-share-note">You said yes. {partnerName} can share the photo now.</p>;
    }
  }

  return (
    <section className="plan-share-card" aria-labelledby="share-proposal-title">
      <p className="plan-share-kicker" id="share-proposal-title">
        Share a photo
      </p>
      {body()}
    </section>
  );
}
