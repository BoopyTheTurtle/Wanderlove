import { useState } from "react";
import { fetchPhotoBlob } from "../lib/album";
import { useRunKeyLoader } from "../lib/photoKeys";
import type { RunPhoto } from "../lib/photos";
import { saveFiles } from "../lib/saveFiles";
import type { PhotoView, ShownPhoto } from "../lib/useRunPhotos";
import "../album-actions.css";

const PLACEHOLDER: Record<Exclude<PhotoView, "shown">, string> = {
  opening: "Opening…",
  locked: "Locked",
  broken: "Can’t open this photo",
};

// Said where a trail's encrypted photos wait for this phone's run key (lib/useRunPhotos.ts, `locked`).
export function LockedPhotosNote({ partnerName, className }: { partnerName: string | null; className: string }) {
  return (
    <p className={className}>
      {partnerName
        ? `Photos unlock once ${partnerName} confirms your new keys on their phone.`
        : "This trail’s photos were locked with your earlier keys, so this phone can’t open them."}
    </p>
  );
}

// Photos from both partners, each labelled with who took it. Every photo offers Save, to the phone's photos or as a
// download. Only your own photos offer Delete, which removes them for both of you, so it asks first. Someone else's
// photos offer Hide, which drops them from your album alone; Profile brings hidden photos back. An encrypted photo
// shows a placeholder until this phone has decrypted it.
export function PhotoGrid({
  photos,
  meId,
  partnerName,
  onDelete,
  onHide,
  fileNamePrefix,
}: {
  photos: ShownPhoto[];
  meId: string;
  // The partner who shares this run, or null on a solo run.
  partnerName: string | null;
  onDelete: (photo: RunPhoto) => Promise<void>;
  onHide: (photo: RunPhoto) => Promise<void>;
  // Saved photos are named "<prefix>-1.jpg" and on, matching Save all photos (lib/album.ts, `stopFilePrefix`).
  fileNamePrefix?: string;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // A photo fetched but refused the share sheet for want of a fresh tap; the next tap on its Save shares it.
  const [ready, setReady] = useState<{ id: string; file: File } | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const loadKey = useRunKeyLoader();

  async function handleDelete(photo: RunPhoto) {
    const question = partnerName ? `Delete this photo? It disappears for ${partnerName} too.` : "Delete this photo?";
    if (!window.confirm(question)) return;
    setDeleting(photo.id);
    setFailed(null);
    try {
      await onDelete(photo);
    } catch (e) {
      console.error("Couldn't delete the photo", e);
      setFailed(photo.id);
    } finally {
      setDeleting(null);
    }
  }

  async function handleHide(photo: RunPhoto) {
    if (
      !window.confirm("Hide this photo from your album? It isn’t deleted. You can show hidden photos again in Profile.")
    )
      return;
    setDeleting(photo.id);
    setFailed(null);
    try {
      await onHide(photo);
    } catch (e) {
      console.error("Couldn't hide the photo", e);
      setFailed(photo.id);
    } finally {
      setDeleting(null);
    }
  }

  async function handleSave(photo: RunPhoto, index: number) {
    setSaving(photo.id);
    setSaveFailed(null);
    try {
      let file = ready?.id === photo.id ? ready.file : null;
      if (!file) {
        const name = fileNamePrefix ? `${fileNamePrefix}-${index + 1}.jpg` : `wannadoo-${photo.id.slice(0, 8)}.jpg`;
        file = new File([await fetchPhotoBlob(photo, loadKey)], name, { type: "image/jpeg" });
      }
      const outcome = await saveFiles([file], file.name);
      setReady(outcome === "needs-tap" ? { id: photo.id, file } : null);
    } catch (e) {
      console.error("Couldn't save the photo", e);
      setSaveFailed(photo.id);
    } finally {
      setSaving(null);
    }
  }

  return (
    <ul className="photo-grid">
      {photos.map((photo, index) => {
        const mine = photo.uploaderId === meId;
        const isReady = ready?.id === photo.id;
        const alt = mine ? "Your photo" : `Photo by ${partnerName ?? "your partner"}`;
        return (
          <li key={photo.id} className="photo-tile">
            {photo.view === "shown" && photo.src ? (
              <img src={photo.src} alt={alt} />
            ) : (
              <span
                className={`photo-tile-placeholder photo-tile-placeholder--${photo.view}`}
                role="img"
                aria-label={alt}
              >
                {PLACEHOLDER[photo.view === "shown" ? "opening" : photo.view]}
              </span>
            )}
            <span className="photo-tile-foot">
              <span className="photo-tile-by">{mine ? "You" : (partnerName ?? "Partner")}</span>
              <span className="photo-tile-actions">
                <button
                  type="button"
                  className={`photo-tile-save${isReady ? " photo-tile-save--ready" : ""}`}
                  disabled={saving !== null || photo.view !== "shown"}
                  onClick={() => void handleSave(photo, index)}
                >
                  {saving === photo.id ? "Saving…" : isReady ? "Tap to save" : "Save"}
                </button>
                {mine ? (
                  <button
                    type="button"
                    className="photo-tile-delete"
                    disabled={deleting !== null}
                    onClick={() => void handleDelete(photo)}
                  >
                    {deleting === photo.id ? "Deleting…" : "Delete"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="photo-tile-delete"
                    disabled={deleting !== null}
                    onClick={() => void handleHide(photo)}
                  >
                    {deleting === photo.id ? "Hiding…" : "Hide"}
                  </button>
                )}
              </span>
            </span>
            {failed === photo.id && (
              <span className="photo-tile-error" role="alert">
                Couldn&rsquo;t {mine ? "delete" : "hide"}. Try again.
              </span>
            )}
            {saveFailed === photo.id && (
              <span className="photo-tile-error" role="alert">
                Couldn&rsquo;t save. Try again.
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
