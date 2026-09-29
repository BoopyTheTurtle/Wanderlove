import { useEffect, useRef, useState } from "react";
import type { Stop } from "@wannadoo/core";
import { drawAlbum, loadAlbumFiles, pickCollage, type AlbumTheme } from "../lib/album";
import { dayStamp, saveFiles, slugify } from "../lib/saveFiles";
import "../album-actions.css";

type Job = "photos" | "album";

type State =
  | { kind: "idle" }
  | { kind: "busy"; job: Job; message: string }
  // The files are ready, but the share sheet needs a fresh tap (see SaveOutcome "needs-tap").
  | { kind: "ready"; job: Job; files: File[]; zipName: string }
  | { kind: "error"; job: Job }
  | { kind: "done"; job: Job; message: string };

function photos(n: number): string {
  return `${n} photo${n === 1 ? "" : "s"}`;
}

// Save all photos and Save album, for a finished trail's complete screen. Both fetch the photos afresh, then hand
// them to the share sheet on phones or download them elsewhere (lib/saveFiles.ts).
export function AlbumActions({
  runId,
  trailName,
  stops,
  date,
  photoCount,
  theme,
}: {
  runId: string;
  trailName: string;
  stops: Stop[];
  // ISO timestamp of the walk, for the album and the file names.
  date: string;
  // Photos on screen now; zero disables both buttons.
  photoCount: number;
  theme: AlbumTheme;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const base = `wannadoo-${slugify(trailName)}-${dayStamp(date)}`;
  const busy = state.kind === "busy";

  function update(next: State) {
    if (alive.current) setState(next);
  }

  async function save(job: Job, files: File[], zipName: string) {
    const outcome = await saveFiles(files, zipName);
    if (outcome === "needs-tap") return update({ kind: "ready", job, files, zipName });
    if (outcome === "cancelled") return update({ kind: "idle" });
    const what = job === "album" ? "Album" : photos(files.length);
    update({
      kind: "done",
      job,
      message:
        outcome === "shared" ? `${what} shared.` : `${what} downloaded${files.length > 1 ? " in one ZIP file" : ""}.`,
    });
  }

  async function start(job: Job) {
    const initial = job === "album" ? "Making your album…" : `Preparing ${photos(photoCount)}…`;
    update({ kind: "busy", job, message: initial });
    try {
      const files = await loadAlbumFiles(runId, stops, (done, total) => {
        if (total === 0) return;
        update({
          kind: "busy",
          job,
          message:
            job === "album"
              ? `Making your album… ${done} of ${total}`
              : `Preparing ${photos(total)}… ${done} of ${total}`,
        });
      });
      if (files.length === 0) return update({ kind: "done", job, message: "No photos to save yet." });
      if (job === "photos")
        return await save(
          job,
          files.map((f) => f.file),
          `${base}.zip`,
        );

      const blob = await drawAlbum({
        title: trailName,
        date,
        stopNames: stops.map((s) => s.name),
        photos: pickCollage(files).map((f) => f.file),
        theme,
      });
      if (alive.current) setPreview(URL.createObjectURL(blob));
      await save(job, [new File([blob], `${base}-album.jpg`, { type: "image/jpeg" })], `${base}-album.jpg`);
    } catch (e) {
      console.error(job === "album" ? "Couldn't make the album" : "Couldn't save the photos", e);
      update({ kind: "error", job });
    }
  }

  async function tap(job: Job) {
    if (state.kind === "ready" && state.job === job) {
      try {
        await save(job, state.files, state.zipName);
      } catch (e) {
        console.error("Couldn't share the files", e);
        update({ kind: "error", job });
      }
      return;
    }
    await start(job);
  }

  function label(job: Job): string {
    if (state.kind === "busy" && state.job === job) return job === "album" ? "Making…" : "Preparing…";
    if (state.kind === "ready" && state.job === job)
      return job === "album" ? "Tap to save album" : "Tap to save photos";
    return job === "album" ? "Save album" : "Save all photos";
  }

  const empty = photoCount === 0;

  return (
    <section className={`album-actions album-actions--${theme}`} aria-label="Save the album">
      <div className="album-actions-row">
        {(["photos", "album"] as const).map((job) => (
          <button
            key={job}
            type="button"
            className={`album-action${state.kind === "ready" && state.job === job ? " album-action--ready" : ""}`}
            disabled={empty || busy}
            onClick={() => void tap(job)}
          >
            {label(job)}
          </button>
        ))}
      </div>
      <p className="album-actions-status" role="status">
        {empty
          ? "Add a photo to save your album."
          : state.kind === "busy" || state.kind === "done"
            ? state.message
            : state.kind === "ready"
              ? "Ready. Tap once more to open the share sheet."
              : ""}
      </p>
      {state.kind === "error" && (
        <p className="album-actions-error" role="alert">
          Couldn&rsquo;t {state.job === "album" ? "make the album" : "prepare the photos"}. Check your connection.{" "}
          <button type="button" className="inline-link" onClick={() => void start(state.job)}>
            Try again
          </button>
        </p>
      )}
      {preview && <img className="album-actions-preview" src={preview} alt={`Album for ${trailName}`} />}
    </section>
  );
}
