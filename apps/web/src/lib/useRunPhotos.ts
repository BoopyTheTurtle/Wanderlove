import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DecryptionError } from "./crypto";
import { RunKeyPendingError } from "./keys";
import { deletePhoto, listRunPhotos, openStoredPhoto, type RunPhoto } from "./photos";
import { useRunKeyLoader } from "./photoKeys";

// Signed URLs last an hour; one fetched longer ago than this gets replaced on the next refresh.
const URL_REUSE_MS = 45 * 60 * 1000;
// Encrypted photos download and decrypt this many at a time.
const OPEN_AT_ONCE = 3;

// How a photo stands on this phone. A plain photo is always "shown"; an encrypted one is "opening" until decrypted,
// "locked" while this phone's run key waits for the partner's re-share, and "broken" when it won't decrypt.
export type PhotoView = "shown" | "opening" | "locked" | "broken";
export type ShownPhoto = RunPhoto & { view: PhotoView };

export type RunPhotos = {
  status: "loading" | "error" | "ready";
  photos: ShownPhoto[];
  // This phone's copy of the run key was wrapped for its older keys (lib/keys.ts, RunKeyPendingError): encrypted
  // photos stay locked until the partner's phone shares the key again. Rechecked on every refresh.
  locked: boolean;
  retry: () => void;
  // A photo this phone just uploaded; `jpeg` is its prepared JPEG, so an encrypted photo shows without a download.
  add: (photo: RunPhoto, jpeg?: Blob) => void;
  remove: (photo: RunPhoto) => Promise<void>;
};

// A run's photos from both partners, or one stop's with `stopId`, reloaded whenever `refreshKey` changes (the app
// bumps it on every sync). A plain photo already on screen keeps its signed URL while that URL is fresh, so a refresh
// doesn't download it again. An encrypted photo is decrypted once into a blob: URL, kept until the photo goes or the
// hook unmounts.
export function useRunPhotos(runId: string, refreshKey: number, stopId?: string): RunPhotos {
  const loadKey = useRunKeyLoader();
  const [status, setStatus] = useState<RunPhotos["status"]>("loading");
  const [photos, setPhotos] = useState<RunPhoto[]>([]);
  const [attempt, setAttempt] = useState(0);
  const known = useRef(new Map<string, { url: string; at: number }>());
  // Changes made on this phone while a list was on its way, which that list can't know about yet.
  const request = useRef(0);
  const addedDuring = useRef(new Map<string, number>());
  const removed = useRef(new Set<string>());

  // Decrypted photos by ID. The state drives rendering; the ref tracks what to revoke.
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [locked, setLocked] = useState(false);
  const blobUrls = useRef(new Map<string, string>());
  const brokenIds = useRef(new Set<string>());
  const opening = useRef(new Set<string>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const urls = blobUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      setOpened({});
    };
  }, []);

  const keep = useCallback((id: string, jpeg: Blob) => {
    if (!alive.current || blobUrls.current.has(id)) return;
    const url = URL.createObjectURL(jpeg);
    blobUrls.current.set(id, url);
    setOpened((all) => ({ ...all, [id]: url }));
  }, []);

  const markBroken = useCallback((ids: string[]) => {
    for (const id of ids) brokenIds.current.add(id);
    setBroken((all) => Object.fromEntries([...Object.keys(all), ...ids].map((id) => [id, true as const])));
  }, []);

  // Downloads and decrypts the encrypted photos not open yet. A failed download is retried on the next refresh; a
  // photo that fails to decrypt is marked broken and left alone.
  const openMissing = useCallback(
    async (list: RunPhoto[]) => {
      const todo = list.filter(
        (p) =>
          p.nonce !== null && !blobUrls.current.has(p.id) && !opening.current.has(p.id) && !brokenIds.current.has(p.id),
      );
      if (todo.length === 0) return;
      let runKey: CryptoKey | null;
      try {
        runKey = await loadKey(runId);
        setLocked(false);
      } catch (e) {
        if (e instanceof RunKeyPendingError) setLocked(true);
        else if (e instanceof DecryptionError) markBroken(todo.map((p) => p.id));
        else console.error("Couldn't load the trail's photo key", e);
        return;
      }
      for (const p of todo) opening.current.add(p.id);
      let next = 0;
      async function worker() {
        while (next < todo.length) {
          const photo = todo[next++];
          try {
            const res = await fetch(photo.url);
            if (!res.ok) throw new Error(`Photo download failed: ${res.status}`);
            keep(photo.id, await openStoredPhoto(photo, await res.blob(), runKey));
          } catch (e) {
            if (e instanceof DecryptionError) markBroken([photo.id]);
            else console.error("Couldn't download a photo", e);
          } finally {
            opening.current.delete(photo.id);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(OPEN_AT_ONCE, todo.length) }, worker));
    },
    [loadKey, runId, keep, markBroken],
  );

  useEffect(() => {
    const id = ++request.current;
    listRunPhotos(runId).then(
      (fresh) => {
        if (id !== request.current) return;
        const now = Date.now();
        const next = fresh
          .filter((p) => !removed.current.has(p.id) && (stopId === undefined || p.stopId === stopId))
          .map((p) => {
            const seen = known.current.get(p.id);
            if (seen && now - seen.at < URL_REUSE_MS) {
              return { ...p, url: seen.url, src: p.nonce === null ? seen.url : p.src };
            }
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
        void openMissing(next);
      },
      (e: unknown) => {
        if (id !== request.current) return;
        console.error("Couldn't load the photos", e);
        // A failed refresh keeps what is already on screen.
        setStatus((s) => (s === "ready" ? s : "error"));
      },
    );
  }, [runId, refreshKey, attempt, stopId, openMissing]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const add = useCallback(
    (photo: RunPhoto, jpeg?: Blob) => {
      known.current.set(photo.id, { url: photo.url, at: Date.now() });
      addedDuring.current.set(photo.id, request.current);
      if (photo.nonce !== null) {
        if (jpeg) keep(photo.id, jpeg);
        else void openMissing([photo]);
      }
      setPhotos((all) => (all.some((p) => p.id === photo.id) ? all : [...all, photo]));
    },
    [keep, openMissing],
  );

  const remove = useCallback(async (photo: RunPhoto) => {
    await deletePhoto(photo);
    removed.current.add(photo.id);
    known.current.delete(photo.id);
    const url = blobUrls.current.get(photo.id);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrls.current.delete(photo.id);
    }
    setPhotos((all) => all.filter((p) => p.id !== photo.id));
  }, []);

  const shown = useMemo(
    () =>
      photos.map((p): ShownPhoto => {
        if (p.nonce === null) return { ...p, view: "shown" };
        const src = opened[p.id] ?? null;
        const view: PhotoView = src ? "shown" : broken[p.id] ? "broken" : locked ? "locked" : "opening";
        return { ...p, src, view };
      }),
    [photos, opened, broken, locked],
  );

  return { status, photos: shown, locked, retry, add, remove };
}
