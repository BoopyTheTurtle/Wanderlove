import type { ReactNode } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { LockedPhotosNote, PhotoGrid } from "../components/PhotoGrid";
import { BackIcon, CompassIcon, ShareIcon } from "../components/Icons";
import { AddStopPhoto } from "../components/AddStopPhoto";
import { AlbumActions } from "../components/AlbumActions";
import { stopFilePrefix } from "../lib/album";
import { canAddPhotos, completedCount, journeyDay, PHOTOS_REMOVED_NOTE, photosRemoved, runEndedAt } from "../lib/runs";
import { useRun } from "../lib/useRun";
import { useRunPhotos } from "../lib/useRunPhotos";

export function CompleteScreen({
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
  // Opened from Activity rather than at the end of the walk: a quieter header, and the main button goes back there.
  past?: boolean;
  // Back to the map, or to Activity for a past run.
  onLeave: () => void;
}) {
  const loaded = useRun(runId, syncTick);
  const album = useRunPhotos(runId, syncTick);
  const run = loaded.status === "ready" ? loaded.run : null;
  const trail = run?.trail ?? null;
  const leftEarly = run?.abandonedAt != null;
  const endedAt = run ? runEndedAt(run) : null;
  const photosOpen = run !== null && canAddPhotos(run);
  const photos = album.photos;
  const removed = album.status === "ready" && photosRemoved(endedAt, photos.length);
  // The stack shows only photos this phone can display; encrypted ones join as they decrypt.
  const shown = photos.filter((p) => p.src !== null);
  const [left, main, right] = [shown[0], shown[shown.length - 1] ?? shown[0], shown[1] ?? shown[0]];

  async function handleShare() {
    if (!trail) return;
    const shareData = { title: trail.name, text: `We finished the ${trail.name} trail on Wannadoo.` };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // user cancelled share sheet, nothing to do
      }
    }
  }

  if (!run || !trail) {
    return (
      <div className="screen complete-screen">
        <StatusBar light />
        <div className="album-state">
          {loaded.status === "error" ? (
            <>
              <p>Couldn&rsquo;t load your album. Check your connection and try again.</p>
              <button type="button" className="btn-primary light" onClick={loaded.retry}>
                Try again
              </button>
              <button type="button" className="btn-outline-light" onClick={onLeave}>
                {past ? <BackIcon size={16} /> : <CompassIcon size={16} />}{" "}
                {past ? "Back to your journeys" : "Back to the map"}
              </button>
            </>
          ) : (
            <p>Loading your album…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen complete-screen">
      {!past && (
        <div className="confetti">
          {Array.from({ length: 20 }).map((_, i) => (
            <i key={i} />
          ))}
        </div>
      )}
      <StatusBar light />

      <div className="complete-avatar">
        <CoupleAvatar size={64} />
      </div>
      <p className="eyebrow">
        {past && endedAt ? journeyDay(endedAt) : "Trail complete"}
        {leftEarly && " · Left early"}
      </p>
      <h2>{leftEarly ? "Part of the way, together." : "You made it, together."}</h2>
      <p className="complete-wit">
        {leftEarly ? (
          <>
            {completedCount(run)} of {trail.stopCount} stops on {trail.name}.
          </>
        ) : (
          <>
            {trail.stopCount} stops, {trail.durationMinutes} minutes, and a city you&rsquo;ll never walk past the same
            way again.
          </>
        )}
      </p>

      <div className="album-stack">
        {left?.src && <img className="album-back left" src={left.src} alt="" />}
        {right?.src && <img className="album-back right" src={right.src} alt="" />}
        {main?.src && (
          <div className="album-main">
            <img src={main.src} alt="" />
            <span>{trail.name}</span>
          </div>
        )}
      </div>

      <div className="complete-stats">
        <div>
          <strong>{completedCount(run)}</strong>
          <span>Stops</span>
        </div>
        <div>
          <strong>{trail.durationMinutes}m</strong>
          <span>Time</span>
        </div>
        <div>
          <strong>{photos.length}</strong>
          <span>Photos</span>
        </div>
      </div>

      <button type="button" className="btn-primary light" onClick={onLeave}>
        {past ? (
          <>
            <BackIcon size={18} /> Back to your journeys
          </>
        ) : (
          <>
            <CompassIcon size={18} /> View your map
          </>
        )}
      </button>
      {!leftEarly && (
        <button type="button" className="btn-outline-light" onClick={handleShare}>
          <ShareIcon size={16} /> Share the trail
        </button>
      )}

      {notice}

      {!removed && (
        <AlbumActions
          runId={runId}
          trailName={trail.name}
          stops={trail.stops}
          date={endedAt ?? run.startedAt}
          photoCount={album.status === "ready" ? photos.length : 0}
          theme="default"
        />
      )}

      <section className="album-by-stop" aria-label="Photos by stop">
        {album.status === "loading" && <p className="album-note">Loading photos…</p>}
        {album.status === "error" && (
          <p className="album-note">
            Couldn&rsquo;t load the photos.{" "}
            <button type="button" className="inline-link" onClick={album.retry}>
              Try again
            </button>
          </p>
        )}
        {removed && <p className="album-note">{PHOTOS_REMOVED_NOTE}</p>}
        {album.locked && <LockedPhotosNote partnerName={partnerName} className="album-note" />}
        {album.status === "ready" && photosOpen && (
          <p className="album-note">You can add photos for a day after finishing.</p>
        )}
        {album.status === "ready" &&
          trail.stops.map((stop, i) => {
            const here = photos.filter((p) => p.stopId === stop.id);
            if (here.length === 0 && !photosOpen) return null;
            return (
              <div key={stop.id} className="album-stop">
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
                {photosOpen && <AddStopPhoto runId={runId} stopId={stop.id} onAdded={album.add} />}
              </div>
            );
          })}
      </section>
    </div>
  );
}
