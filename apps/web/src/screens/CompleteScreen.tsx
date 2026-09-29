import { StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { PhotoGrid } from "../components/PhotoGrid";
import { CompassIcon, ShareIcon } from "../components/Icons";
import { AddStopPhoto } from "../components/AddStopPhoto";
import { canAddPhotos } from "../lib/runs";
import { useRun } from "../lib/useRun";
import { useRunPhotos } from "../lib/useRunPhotos";

export function CompleteScreen({
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
  const trail = loaded.status === "ready" ? loaded.run.trail : null;
  const photosOpen = loaded.status === "ready" && canAddPhotos(loaded.run);
  const photos = album.photos;
  const [left, main, right] = [photos[0], photos[photos.length - 1] ?? photos[0], photos[1] ?? photos[0]];

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

  if (!trail) {
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
              <button type="button" className="btn-outline-light" onClick={onViewMap}>
                <CompassIcon size={16} /> Back to the map
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
      <div className="confetti">
        {Array.from({ length: 20 }).map((_, i) => (
          <i key={i} />
        ))}
      </div>
      <StatusBar light />

      <div className="complete-avatar">
        <CoupleAvatar size={64} />
      </div>
      <p className="eyebrow">Trail complete</p>
      <h2>You made it, together.</h2>
      <p className="complete-wit">
        {trail.stopCount} stops, {trail.durationMinutes} minutes, and a city you&rsquo;ll never walk past the same way
        again.
      </p>

      <div className="album-stack">
        {left && <img className="album-back left" src={left.url} alt="" />}
        {right && <img className="album-back right" src={right.url} alt="" />}
        {main && (
          <div className="album-main">
            <img src={main.url} alt="" />
            <span>{trail.name}</span>
          </div>
        )}
      </div>

      <div className="complete-stats">
        <div>
          <strong>{trail.stopCount}</strong>
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

      <button type="button" className="btn-primary light" onClick={onViewMap}>
        <CompassIcon size={18} /> View your map
      </button>
      <button type="button" className="btn-outline-light" onClick={handleShare}>
        <ShareIcon size={16} /> Share the trail
      </button>

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
        {album.status === "ready" && photosOpen && (
          <p className="album-note">You can add photos for a day after finishing.</p>
        )}
        {album.status === "ready" &&
          trail.stops.map((stop) => {
            const here = photos.filter((p) => p.stopId === stop.id);
            if (here.length === 0 && !photosOpen) return null;
            return (
              <div key={stop.id} className="album-stop">
                <h3>{stop.name}</h3>
                {here.length > 0 && (
                  <PhotoGrid photos={here} meId={meId} partnerName={partnerName} onDelete={album.remove} />
                )}
                {photosOpen && <AddStopPhoto runId={runId} stopId={stop.id} onAdded={album.add} />}
              </div>
            );
          })}
      </section>
    </div>
  );
}
