import { fitWithin } from "@wannadoo/core";
import { supabase } from "./supabase";

const BUCKET = "photos";
// The bucket refuses anything larger (supabase/migrations, `file_size_limit`).
const MAX_BYTES = 5 * 1024 * 1024;
// First try 0.8 (main spec 6.4); step down only when a busy photo still tops 5 MB.
const JPEG_QUALITIES = [0.8, 0.7, 0.6, 0.5, 0.4];
const SIGNED_URL_SECONDS = 60 * 60;

// A photo ready to upload: re-encoded JPEG with no EXIF, at most 2048 px on its long edge.
export type PreparedPhoto = { blob: Blob; width: number; height: number };

export type RunPhoto = {
  id: string;
  runId: string;
  stopId: string;
  uploaderId: string;
  width: number;
  height: number;
  createdAt: string;
  // Signed URL, valid one hour from when it was fetched.
  url: string;
};

type PhotoRow = {
  id: string;
  run_id: string;
  stop_id: string;
  uploader_id: string;
  width: number;
  height: number;
  created_at: string;
  storage_path: string;
};

const PHOTO_COLUMNS = "id, run_id, stop_id, uploader_id, width, height, created_at, storage_path";

function toRunPhoto(row: PhotoRow, url: string): RunPhoto {
  return {
    id: row.id,
    runId: row.run_id,
    stopId: row.stop_id,
    uploaderId: row.uploader_id,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    url,
  };
}

function storagePath(runId: string, photoId: string): string {
  return `${runId}/${photoId}.jpg`;
}

// Decodes with the EXIF rotation applied, so a phone photo taken upright stays upright once redrawn.
async function decode(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Older browsers reject the options bag; an <img> applies EXIF orientation by default.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the photo"))),
      "image/jpeg",
      quality,
    );
  });
}

// Shrinks and re-encodes a camera photo on the phone. Redrawing on a canvas drops all EXIF, GPS included.
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  let image;
  try {
    image = await decode(file);
  } catch {
    throw new Error("That file isn't a photo we can read");
  }
  try {
    const { width, height } = fitWithin(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw the photo");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, 0, 0, width, height);
    for (const quality of JPEG_QUALITIES) {
      const blob = await toJpeg(canvas, quality);
      if (blob.size <= MAX_BYTES) return { blob, width, height };
    }
    throw new Error("The photo is too large to upload");
  } finally {
    image.close();
  }
}

// Stores a prepared photo for a stop of an active run the caller belongs to.
export async function uploadPhoto(runId: string, stopId: string, prepared: PreparedPhoto): Promise<RunPhoto> {
  const id = crypto.randomUUID();
  const path = storagePath(runId, id);
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data: row, error: insertError } = await supabase
    .from("photos")
    .insert({ id, run_id: runId, stop_id: stopId, storage_path: path, width: prepared.width, height: prepared.height })
    .select(PHOTO_COLUMNS)
    .single();
  if (insertError) {
    // Without its row nobody could list the object, so don't leave it behind.
    await supabase.storage.from(BUCKET).remove([path]);
    throw insertError;
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (signError) throw signError;
  return toRunPhoto(row, signed.signedUrl);
}

// Every photo of a run the caller can see, oldest first, each with a signed URL valid one hour.
export async function listRunPhotos(runId: string): Promise<RunPhoto[]> {
  const { data: rows, error } = await supabase
    .from("photos")
    .select(PHOTO_COLUMNS)
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (rows.length === 0) return [];

  const { data: signed, error: signError } = await supabase.storage.from(BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    SIGNED_URL_SECONDS,
  );
  if (signError) throw signError;
  const urls = new Map(signed.map((s) => [s.path, s.signedUrl]));
  // A row whose object is missing gets no URL; skip it rather than show a broken image.
  return rows.flatMap((r) => {
    const url = urls.get(r.storage_path);
    return url ? [toRunPhoto(r, url)] : [];
  });
}

// Deletes one of the caller's own photos; RLS refuses anyone else's, row and object alike.
// The row goes first: once it is gone neither partner lists the photo, so a failure between the two steps leaves at
// worst an unlisted object, never a listed photo whose image is missing. Both steps tolerate an already-deleted
// target, so calling this again finishes a delete that failed halfway.
export async function deletePhoto(photo: Pick<RunPhoto, "id" | "runId">): Promise<void> {
  const path = storagePath(photo.runId, photo.id);
  const { data: rows, error } = await supabase.from("photos").delete().eq("id", photo.id).select("id");
  if (error) throw error;

  const { data: removed, error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
  if (removeError) throw removeError;
  if (rows.length === 0 && removed.length === 0) throw new Error("Photo not found, or not yours to delete");
}
