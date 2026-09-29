import { useState } from "react";
import type { PreparedPhoto, RunPhoto } from "../lib/photos";
import { useRunPhotos } from "../lib/useRunPhotos";
import { PhotoCapture } from "./PhotoCapture";
import { PhotoGrid } from "./PhotoGrid";

// The photo part of a stop. Until the stop is done, a photo (or Skip photo) completes it. Once it is done, by
// either partner, the stop shows everyone's photos and still lets each of you add yours while the run is open.
export function StopPhotos({
  runId,
  stopId,
  syncTick,
  done,
  canAdd,
  locked = false,
  meId,
  partnerName,
  onUpload,
  onSkip,
}: {
  runId: string;
  stopId: string;
  syncTick: number;
  done: boolean;
  // False once the run has ended: the server takes no more photos.
  canAdd: boolean;
  // The stop's task isn't solved yet, so the camera stays shut.
  locked?: boolean;
  meId: string;
  partnerName: string | null;
  onUpload: (prepared: PreparedPhoto) => Promise<RunPhoto>;
  onSkip: () => Promise<void>;
}) {
  const photos = useRunPhotos(runId, syncTick);
  const here = photos.photos.filter((p) => p.stopId === stopId);
  const [skipping, setSkipping] = useState(false);
  const [skipFailed, setSkipFailed] = useState(false);
  // Remounts the camera after each saved photo, so it offers a fresh one instead of the preview the grid shows.
  const [captureKey, setCaptureKey] = useState(0);

  async function upload(prepared: PreparedPhoto) {
    const photo = await onUpload(prepared);
    photos.add(photo);
    setCaptureKey((k) => k + 1);
  }

  async function skip() {
    setSkipping(true);
    setSkipFailed(false);
    try {
      await onSkip();
    } catch {
      setSkipFailed(true);
      setSkipping(false);
    }
  }

  if (!done) {
    return (
      <div className="stop-photos">
        <PhotoCapture key={captureKey} onUpload={upload} disabled={locked || skipping} />
        <button type="button" className="skip-photo" disabled={locked || skipping} onClick={() => void skip()}>
          {skipping ? "Saving…" : "Skip photo"}
        </button>
        {skipFailed && (
          <p className="photo-capture-error" role="alert">
            Couldn&rsquo;t save the stop. Check your connection and try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="stop-photos">
      <p className="stop-photos-title">Photos at this stop</p>
      {photos.status === "loading" && <p className="stop-photos-note">Loading photos…</p>}
      {photos.status === "error" && (
        <p className="stop-photos-note">
          Couldn&rsquo;t load the photos.{" "}
          <button type="button" className="inline-link" onClick={photos.retry}>
            Try again
          </button>
        </p>
      )}
      {photos.status === "ready" && here.length === 0 && <p className="stop-photos-note">No photos here yet.</p>}
      {here.length > 0 && <PhotoGrid photos={here} meId={meId} partnerName={partnerName} onDelete={photos.remove} />}
      {canAdd && <PhotoCapture key={captureKey} onUpload={upload} label="Add a photo" />}
    </div>
  );
}
