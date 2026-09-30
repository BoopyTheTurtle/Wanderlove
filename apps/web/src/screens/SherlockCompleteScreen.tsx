import { StatusBar } from "../components/PhoneFrame";
import { Confetti } from "../components/Confetti";
import { LockedPhotosNote, PhotoGrid } from "../components/PhotoGrid";
import { ShareIcon, CompassIcon } from "../components/Icons";
import { AddStopPhoto } from "../components/AddStopPhoto";
import { AlbumActions } from "../components/AlbumActions";
import { stopFilePrefix } from "../lib/album";
import { allStopsDone, canAddPhotos } from "../lib/runs";
import { useRun } from "../lib/useRun";
import { useRunPhotos } from "../lib/useRunPhotos";

const CLUE_DATA: { id: string; word: string; num: number }[] = [
  { id: "spikeri-promenade-clue1", word: "TRUE", num: 1 },
  { id: "spikeri-warehouses-clue2", word: "LOVE", num: 2 },
  { id: "spikeri-square-clue3", word: "IS BUILT", num: 3 },
  { id: "spikeri-creative-quarter-clue4", word: "FROM", num: 4 },
  { id: "daugava-bench-clue5", word: "SMALL MOMENTS", num: 5 },
];

// The field-book palette: wine, coral, orange, rose and gold.
const CONFETTI_COLORS = ["#8b2e45", "#f2806a", "#e8612c", "#f6dcd3", "#e9b44c"];

export function SherlockCompleteScreen({
  runId,
  meId,
  partnerName,
  syncTick,
  onViewMap,
}: {
  runId: string;
  meId: string;
  // The partner who shared this run, or null on a solo run.
  partnerName: string | null;
  syncTick: number;
  onViewMap: () => void;
}) {
  const loaded = useRun(runId, syncTick);
  const album = useRunPhotos(runId, syncTick);
  const run = loaded.status === "ready" ? loaded.run : null;
  const allDone = run ? allStopsDone(run) : false;
  const photosOpen = run !== null && canAddPhotos(run);

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
      {allDone && <Confetti colors={CONFETTI_COLORS} />}
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
            {CLUE_DATA.map(({ id, word, num }) => {
              const done = !!run?.completions[id];
              return (
                <div key={id} className={`sh-stamp-cell ${done ? "sh-stamp-cell--done" : "sh-stamp-cell--todo"}`}>
                  <span className="sh-stamp-cell-num">0{num}</span>
                  <span className="sh-stamp-cell-word">{done ? word : "Still out there"}</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="sh-passport-foot" onClick={onViewMap}>
            <CompassIcon size={16} /> Back to our map
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
            <p className="sh-album-note">No photos on this trail.</p>
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
                date={run.completedAt ?? run.startedAt}
                photoCount={album.photos.length}
                theme="sherlock"
              />
            </>
          )}
        </section>

        {/* Actions */}
        <button type="button" className="sh-btn-ghost" onClick={handleShare}>
          <ShareIcon size={16} /> Share the trail
        </button>
      </div>
    </div>
  );
}
