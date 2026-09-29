import { useCallback, useEffect, useRef, useState } from "react";
import { deletePhoto, listRunPhotos, type RunPhoto } from "./photos";

// Signed URLs last an hour; one fetched longer ago than this gets replaced on the next refresh.
const URL_REUSE_MS = 45 * 60 * 1000;

export type RunPhotos = {
  status: "loading" | "error" | "ready";
  photos: RunPhoto[];
  retry: () => void;
  add: (photo: RunPhoto) => void;
  remove: (photo: RunPhoto) => Promise<void>;
};

// A run's photos from both partners, reloaded whenever `refreshKey` changes (the app bumps it on every sync).
// A photo already on screen keeps its signed URL while that URL is fresh, so a refresh doesn't download it again.
export function useRunPhotos(runId: string, refreshKey: number): RunPhotos {
  const [status, setStatus] = useState<RunPhotos["status"]>("loading");
  const [photos, setPhotos] = useState<RunPhoto[]>([]);
  const [attempt, setAttempt] = useState(0);
  const known = useRef(new Map<string, { url: string; at: number }>());
  // Changes made on this phone while a list was on its way, which that list can't know about yet.
  const request = useRef(0);
  const addedDuring = useRef(new Map<string, number>());
  const removed = useRef(new Set<string>());

  useEffect(() => {
    const id = ++request.current;
    listRunPhotos(runId).then(
      (fresh) => {
        if (id !== request.current) return;
        const now = Date.now();
        const next = fresh
          .filter((p) => !removed.current.has(p.id))
          .map((p) => {
            const seen = known.current.get(p.id);
            if (seen && now - seen.at < URL_REUSE_MS) return { ...p, url: seen.url };
            known.current.set(p.id, { url: p.url, at: now });
            return p;
          });
        setPhotos((current) => {
          const late = current.filter(
            (p) => (addedDuring.current.get(p.id) ?? -1) >= id && !next.some((n) => n.id === p.id),
          );
          return [...next, ...late];
        });
        setStatus("ready");
      },
      (e: unknown) => {
        if (id !== request.current) return;
        console.error("Couldn't load the photos", e);
        // A failed refresh keeps what is already on screen.
        setStatus((s) => (s === "ready" ? s : "error"));
      },
    );
  }, [runId, refreshKey, attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const add = useCallback((photo: RunPhoto) => {
    known.current.set(photo.id, { url: photo.url, at: Date.now() });
    addedDuring.current.set(photo.id, request.current);
    setPhotos((all) => (all.some((p) => p.id === photo.id) ? all : [...all, photo]));
  }, []);

  const remove = useCallback(async (photo: RunPhoto) => {
    await deletePhoto(photo);
    removed.current.add(photo.id);
    known.current.delete(photo.id);
    setPhotos((all) => all.filter((p) => p.id !== photo.id));
  }, []);

  return { status, photos, retry, add, remove };
}
