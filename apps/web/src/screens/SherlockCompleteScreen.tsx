import type { ReactNode } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { Confetti } from "../components/Confetti";
import { LockedPhotosNote, PhotoGrid } from "../components/PhotoGrid";
import { BackIcon, ShareIcon, CompassIcon } from "../components/Icons";
import { AddStopPhoto } from "../components/AddStopPhoto";
import { AlbumActions } from "../components/AlbumActions";
import { stopFilePrefix } from "../lib/album";
import { allStopsDone, canAddPhotos, PHOTOS_REMOVED_NOTE, photosRemoved, runEndedAt } from "../lib/runs";
import { useRun } from "../lib/useRun";
import { useRunPhotos } from "../lib/useRunPhotos";

// One clue per stop, in trail order: a private run's stops are "s1".."s5", so clues go by position.
const CLUE_DATA: { word: string; num: number }[] = [
  { word: "TRUE", num: 1 },
  { word: "LOVE", num: 2 },
  { word: "IS BUILT", num: 3 },
  { word: "FROM", num: 4 },
  { word: "SMALL MOMENTS", num: 5 },
];

// The field-book palette: wine, coral, orange, rose and gold.
const CONFETTI_COLORS = ["#8b2e45", "#f2806a", "#e8612c", "#f6dcd3", "#e9b44c"];

export function SherlockCompleteScreen({
  runId,
  meId,
  partnerName,
  syncTick,
  notice,
  past = false,
  onLeave,
}: {
  runId: string;
  meId: string;
  // The partner who shared this run, or null on a solo run.
  partnerName: string | null;
  syncTick: number;
  // A one-time note from the app, such as the recovery code hint; shown below the main buttons.
  notice?: ReactNode;
  // Opened from Activity rather than at the end of the walk: no confetti, and the passport leads back there.
  past?: boolean;
  // Back to the map, or to Activity for a past run.
  onLeave: () => void;
}) {
  const loaded = useRun(runId, syncTick);
  const album = useRunPhotos(runId, syncTick);
  const run = loaded.status === "ready" ? loaded.run : null;
  const allDone = run ? allStopsDone(run) : false;
  const photosOpen = run !== null && canAddPhotos(run);
  const removed = run !== null && album.status === "ready" && photosRemoved(runEndedAt(run), album.photos.length);

  async function handleShare() {
    if (!run) return;
    const shareData = { title: run.trail.name, text: "We solved the Sherlock Holmes mystery in Spīķeri on Wannadoo." };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled
      }
    }
  }

  return (
    <div className="screen sh-complete-screen">
      {allDone && !past && <Confetti colors={CONFETTI_COLORS} />}
      <StatusBar />

      <div className="sh-complete-inner">
        {/* Field book header */}
        <p className="sh-field-eyebrow">Your field book</p>
        <h1 className="sh-field-title">Passport to us</h1>

        {/* Collected curiosities */}
        <section className="sh-passport">
          <div className="sh-passport-head">
            <span className="sh-passport-issue">Case no. 221B · Riga</span>
            <span className="sh-curiosities-label">Our collected curiosities</span>
          </div>
          <div className="sh-stamp-grid">
            {CLUE_DATA.map(({ word, num }, i) => {
              const stopId = run?.trail.stops[i]?.id;
              const done = stopId !== undefined && !!run?.completions[stopId];
              return (
                <div key={num} className={`sh-stamp-cell ${done ? "sh-stamp-cell--done" : "sh-stamp-cell--todo"}`}>
                  <span className="sh-stamp-cell-num">0{num}</span>
                  <span className="sh-stamp-cell-word">{done ? word : "Still out there"}</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="sh-passport-foot" onClick={onLeave}>
            {past ? <BackIcon size={16} /> : <CompassIcon size={16} />}{" "}
            {past ? "Back to our journeys" : "Back to our map"}
          </button>
        </section>

        {/* Revealed message */}
        {allDone && (
          <div className="sh-reveal">
            <p className="sh-reveal-label">The Lost Letter Reveals…</p>
            <blockquote className="sh-reveal-quote">"True love is built from small moments."</blockquote>
            <p className="sh-reveal-sub">
              Not grand gestures. Not perfect days. But thousands of shared laughs, walks, and adventures.
            </p>
          </div>
        )}

        <section className="sh-album" aria-label="Photos by stop">
          <span className="sh-eyebrow-label">Our photos</span>
          {loaded.status === "error" || album.status === "error" ? (
            <p className="sh-album-note">
              Couldn&rsquo;t load your album.{" "}
              <button
                type="button"
                className="inline-link"
                onClick={() => {
                  if (loaded.status === "error") loaded.retry();
                  if (album.status === "error") album.retry();
                }}
              >
                Try again
              </button>
            </p>
          ) : !run || album.status === "loading" ? (
            <p className="sh-album-note">Loading photos…</p>
          ) : album.photos.length === 0 && !photosOpen ? (
            <p className="sh-album-note">{removed ? PHOTOS_REMOVED_NOTE : "No photos on this trail."}</p>
          ) : (
            <>
              {album.locked && <LockedPhotosNote partnerName={partnerName} className="sh-album-note" />}
              {photosOpen && <p className="sh-album-note">You can add photos for a day after finishing.</p>}
              {run.trail.stops.map((stop, i) => {
                const here = album.photos.filter((p) => p.stopId === stop.id);
                if (here.length === 0 && !photosOpen) return null;
                return (
                  <div key={stop.id} className="sh-album-stop">
                    <h3>{stop.name}</h3>
                    {here.length > 0 && (
                      <PhotoGrid
                        photos={here}
                        meId={meId}
                        partnerName={partnerName}
                        onDelete={album.remove}
                        onHide={album.hide}
                        fileNamePrefix={stopFilePrefix(i + 1, stop.name)}
                      />
                    )}
                    {photosOpen && <AddStopPhoto runId={run.id} stopId={stop.id} onAdded={album.add} />}
                  </div>
                );
              })}
              <AlbumActions
                runId={run.id}
                trailName={run.trail.name}
                stops={run.trail.stops}
                date={runEndedAt(run) ?? run.startedAt}
                photoCount={album.photos.length}
                theme="sherlock"
              />
            </>
          )}
        </section>

        {/* Actions */}
        {!run?.abandonedAt && (
          <button type="button" className="sh-btn-ghost" onClick={handleShare}>
            <ShareIcon size={16} /> Share the trail
          </button>
        )}

        {notice}
      </div>
    </div>
  );
}
