import { useState } from "react";
import { uploadPhoto, type RunPhoto } from "../lib/photos";
import { useRunKeyLoader } from "../lib/photoKeys";
import { PhotoCapture } from "./PhotoCapture";

// "Add a photo" for a stop of a finished run, while the grace window is open (lib/runs.ts, `canAddPhotos`).
export function AddStopPhoto({
  runId,
  stopId,
  onAdded,
}: {
  runId: string;
  stopId: string;
  // `jpeg` is the prepared photo, so an encrypted one shows without downloading it again.
  onAdded: (photo: RunPhoto, jpeg: Blob) => void;
}) {
  const loadKey = useRunKeyLoader();
  // Remounts the camera after each saved photo, so it offers a fresh one instead of the preview the album shows.
  const [key, setKey] = useState(0);
  return (
    <PhotoCapture
      key={key}
      label="Add a photo"
      onUpload={async (prepared) => {
        onAdded(await uploadPhoto(runId, stopId, prepared, await loadKey(runId)), prepared.blob);
        setKey((k) => k + 1);
      }}
    />
  );
}
