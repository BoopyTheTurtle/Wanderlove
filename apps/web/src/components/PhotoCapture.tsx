import { useEffect, useRef, useState } from "react";
import { RunKeyPendingError } from "../lib/keys";
import { preparePhoto, RunWithoutKeysError, type PreparedPhoto } from "../lib/photos";
import { useRunKeyLoader } from "../lib/photoKeys";
import { CameraIcon } from "./Icons";
import "../photo-capture.css";

type Status = "idle" | "preparing" | "uploading" | "failed" | "done";

// Takes a photo with the back camera, shrinks it on the phone, previews it, and hands it to `onUpload`.
// A failed upload keeps the prepared photo in memory and offers Retry, so the moment isn't lost (main spec 6.4.3).
// With `runId`, a run started before encryption says so up front instead of offering a camera the server would refuse.
export function PhotoCapture({
  onUpload,
  runId,
  label = "Capture the moment",
  disabled = false,
}: {
  onUpload: (prepared: PreparedPhoto) => Promise<unknown>;
  runId?: string;
  label?: string;
  disabled?: boolean;
}) {
  const withoutKeys = useRunWithoutKeys(runId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The upload found the run has no key, so a retry can't help.
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    if (!prepared) return;
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const busy = status === "preparing" || status === "uploading";

  async function upload(photo: PreparedPhoto) {
    setStatus("uploading");
    setError(null);
    try {
      await onUpload(photo);
      setStatus("done");
    } catch (err) {
      setStatus("failed");
      if (err instanceof RunWithoutKeysError) {
        setRefused(true);
        return;
      }
      setError(
        err instanceof RunKeyPendingError
          ? "This trail’s photos are locked on this phone until your partner confirms your new keys. Your photo is safe here."
          : "Upload failed. Your photo is safe here; try again.",
      );
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the input so choosing the same file again still fires a change.
    e.target.value = "";
    if (!file) return;
    const before = status;
    setStatus("preparing");
    setError(null);
    let photo: PreparedPhoto;
    try {
      photo = await preparePhoto(file);
    } catch (err) {
      // Back to where we were; an earlier photo that failed to upload can still be retried.
      setStatus(before);
      setError(err instanceof Error ? err.message : "Could not read that photo");
      return;
    }
    setPrepared(photo);
    await upload(photo);
  }

  if (withoutKeys || refused) {
    return (
      <div className="photo-capture">
        <p className="photo-capture-error" role="status">
          {new RunWithoutKeysError().message}
        </p>
      </div>
    );
  }

  return (
    <div className="photo-capture">
      {previewUrl && (
        <div className="photo-capture-preview">
          <img src={previewUrl} alt="Your photo" />
          {status === "uploading" && (
            <div className="photo-capture-progress" role="progressbar" aria-label="Uploading photo">
              <span />
            </div>
          )}
        </div>
      )}

      <p className="photo-capture-status" role="status">
        {status === "preparing" && "Preparing photo…"}
        {status === "uploading" && "Uploading…"}
        {status === "done" && "Photo saved"}
      </p>
      {error && (
        <p className="photo-capture-error" role="alert">
          {error}
        </p>
      )}

      {status === "failed" && prepared ? (
        <div className="photo-capture-actions">
          <button type="button" className="btn-primary" disabled={disabled} onClick={() => void upload(prepared)}>
            Retry
          </button>
          <button type="button" className="btn-soft" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn-primary"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <CameraIcon size={18} />
          {busy ? "Saving…" : status === "done" ? "Add another photo" : label}
        </button>
      )}

      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} hidden />
    </div>
  );
}

// True once the run turns out to have no photo key (started before encryption). Any other outcome, a lookup error
// included, leaves the camera up: the upload itself then reports what went wrong.
function useRunWithoutKeys(runId: string | undefined): boolean {
  const loadKey = useRunKeyLoader();
  const [checked, setChecked] = useState<{ runId: string; withoutKeys: boolean } | null>(null);

  useEffect(() => {
    if (!runId) return;
    let live = true;
    loadKey(runId).then(
      (key) => {
        if (live) setChecked({ runId, withoutKeys: key === null });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [loadKey, runId]);

  return checked !== null && checked.runId === runId && checked.withoutKeys;
}
