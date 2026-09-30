import { useState } from "react";
import { fetchPhotoBlob } from "../lib/album";
import type { RunPhoto } from "../lib/photos";
import { saveFiles } from "../lib/saveFiles";
import "../album-actions.css";

// Photos from both partners, each labelled with who took it. Every photo offers Save, to the phone's photos or as a
// download. Only your own photos offer Delete, which removes them for both of you, so it asks first.
export function PhotoGrid({
  photos,
  meId,
  partnerName,
  onDelete,
  fileNamePrefix,
}: {
  photos: RunPhoto[];
  meId: string;
  // The partner who shares this run, or null on a solo run.
  partnerName: string | null;
  onDelete: (photo: RunPhoto) => Promise<void>;
  // Saved photos are named "<prefix>-1.jpg" and on, matching Save all photos (lib/album.ts, `stopFilePrefix`).
  fileNamePrefix?: string;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // A photo fetched but refused the share sheet for want of a fresh tap; the next tap on its Save shares it.
  const [ready, setReady] = useState<{ id: string; file: File } | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);

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

  async function handleSave(photo: RunPhoto, index: number) {
    setSaving(photo.id);
    setSaveFailed(null);
    try {
      let file = ready?.id === photo.id ? ready.file : null;
      if (!file) {
        const name = fileNamePrefix ? `${fileNamePrefix}-${index + 1}.jpg` : `wannadoo-${photo.id.slice(0, 8)}.jpg`;
        file = new File([await fetchPhotoBlob(photo)], name, { type: "image/jpeg" });
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
        return (
          <li key={photo.id} className="photo-tile">
            <img src={photo.url} alt={mine ? "Your photo" : `Photo by ${partnerName ?? "your partner"}`} />
            <span className="photo-tile-foot">
              <span className="photo-tile-by">{mine ? "You" : (partnerName ?? "Partner")}</span>
              <span className="photo-tile-actions">
                <button
                  type="button"
                  className={`photo-tile-save${isReady ? " photo-tile-save--ready" : ""}`}
                  disabled={saving !== null}
                  onClick={() => void handleSave(photo, index)}
                >
                  {saving === photo.id ? "Saving…" : isReady ? "Tap to save" : "Save"}
                </button>
                {mine && (
                  <button
                    type="button"
                    className="photo-tile-delete"
                    disabled={deleting !== null}
                    onClick={() => void handleDelete(photo)}
                  >
                    {deleting === photo.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </span>
            </span>
            {failed === photo.id && (
              <span className="photo-tile-error" role="alert">
                Couldn&rsquo;t delete. Try again.
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
