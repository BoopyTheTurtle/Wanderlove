import { useState } from "react";
import type { RunPhoto } from "../lib/photos";

// Photos from both partners, each labelled with who took it. Only your own photos offer Delete, which removes them
// for both of you, so it asks first.
export function PhotoGrid({
  photos,
  meId,
  partnerName,
  onDelete,
}: {
  photos: RunPhoto[];
  meId: string;
  // The partner who shares this run, or null on a solo run.
  partnerName: string | null;
  onDelete: (photo: RunPhoto) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

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

  return (
    <ul className="photo-grid">
      {photos.map((photo) => {
        const mine = photo.uploaderId === meId;
        return (
          <li key={photo.id} className="photo-tile">
            <img src={photo.url} alt={mine ? "Your photo" : `Photo by ${partnerName ?? "your partner"}`} />
            <span className="photo-tile-foot">
              <span className="photo-tile-by">{mine ? "You" : (partnerName ?? "Partner")}</span>
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
            {failed === photo.id && (
              <span className="photo-tile-error" role="alert">
                Couldn&rsquo;t delete. Try again.
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
