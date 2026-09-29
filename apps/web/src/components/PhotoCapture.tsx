import { useEffect, useRef, useState } from "react";
import { preparePhoto, type PreparedPhoto } from "../lib/photos";
import { CameraIcon } from "./Icons";
import "../photo-capture.css";

type Status = "idle" | "preparing" | "uploading" | "failed" | "done";

// Takes a photo with the back camera, shrinks it on the phone, previews it, and hands it to `onUpload`.
// A failed upload keeps the prepared photo in memory and offers Retry, so the moment isn't lost (main spec 6.4.3).
export function PhotoCapture({
  onUpload,
  label = "Capture the moment",
  disabled = false,
}: {
  onUpload: (prepared: PreparedPhoto) => Promise<unknown>;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setStatus("failed");
      setError("Upload failed. Your photo is safe here; try again.");
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
