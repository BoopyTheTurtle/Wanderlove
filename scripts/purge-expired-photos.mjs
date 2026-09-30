// Deletes the photos of trails that ended more than a month ago (docs/mvp-roadmap.md, stage 1; migration
// 20260930120000_photo_retention.sql). Run daily by .github/workflows/purge-photos.yml.
//
// Usage: node scripts/purge-expired-photos.mjs [--dry-run]
// Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment and never prints them. Logs counts only.
//
// Each batch goes in this order: list expired photos (expired_photos), delete their files through the Storage API,
// then forget their rows and stamp emptied runs (purge_photos). A failure stops the run at any point without harm: rows
// whose files are already gone come back in the next batch, the Storage API deletes a missing file without complaint,
// and purge_photos ignores rows it has already forgotten. So the next run finishes the job.

const BUCKET = "photos";
const BATCH = 100;
const DRY_RUN_LIMIT = 1000; // the most expired_photos returns in one call

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== "--dry-run");
if (unknown.length > 0) {
  console.error("Usage: node scripts/purge-expired-photos.mjs [--dry-run]");
  process.exit(2);
}
const dryRun = args.includes("--dry-run");

// Tolerates a URL pasted with a trailing slash or with the REST path, e.g. ".../rest/v1/".
const url = process.env.SUPABASE_URL?.trim()
  .replace(/\/+$/, "")
  .replace(/\/rest\/v1$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const missing = [!url && "SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
if (missing.length > 0) {
  console.error(`Missing environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

// Error bodies from PostgREST and Storage carry a message and no secrets; cap them anyway, since they can echo input.
async function call(method, path, body) {
  const res = await fetch(`${url}${path}`, { method, headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const json = JSON.parse(text);
      message = json.message ?? json.error ?? text;
    } catch {
      // keep the raw text
    }
    throw new Error(`${method} ${path.split("?")[0]} failed with ${res.status}: ${String(message).slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : null;
}

const expiredPhotos = (limit) => call("POST", "/rest/v1/rpc/expired_photos", { p_limit: limit });
const purgePhotos = (ids) => call("POST", "/rest/v1/rpc/purge_photos", { p_photo_ids: ids });
const deleteFiles = (paths) => call("DELETE", `/storage/v1/object/${BUCKET}`, { prefixes: paths });

function summarise(batch) {
  const rows = batch.filter((p) => p.photo_id).length;
  return { rows, orphans: batch.length - rows, runs: new Set(batch.map((p) => p.run_id)).size };
}

async function report() {
  const batch = await expiredPhotos(DRY_RUN_LIMIT);
  const { rows, orphans, runs } = summarise(batch);
  const more = batch.length === DRY_RUN_LIMIT ? " (the limit; there may be more)" : "";
  console.log(
    `Dry run: ${batch.length} expired files${more}: ${rows} with photo rows, ${orphans} without, in ${runs} runs.`,
  );
  console.log("Nothing was deleted.");
}

async function purge() {
  const seen = new Set();
  let files = 0;
  let rows = 0;
  let runs = 0;
  for (;;) {
    const batch = await expiredPhotos(BATCH);
    if (batch.length === 0) break;

    // A path that comes back after its batch was purged means the purge made no progress; stop instead of looping.
    if (batch.some((p) => seen.has(p.storage_path))) {
      throw new Error("An expired file came back after it was purged; stopping to avoid a loop.");
    }
    batch.forEach((p) => seen.add(p.storage_path));

    // The Storage API answers 200 with the objects it removed and skips missing ones, so after a 200 every path in
    // the batch is gone.
    const removed = await deleteFiles(batch.map((p) => p.storage_path));
    files += Array.isArray(removed) ? removed.length : 0;

    const ids = batch.map((p) => p.photo_id).filter(Boolean);
    const [result] = await purgePhotos(ids);
    rows += result?.photos_deleted ?? 0;
    runs += result?.runs_purged ?? 0;
  }

  // Stamps expired runs that never had a photo; a no-op when the loop above already covered everything.
  const [result] = await purgePhotos([]);
  runs += result?.runs_purged ?? 0;

  console.log(`Deleted ${files} files and ${rows} photo rows; marked ${runs} runs as purged.`);
}

// exitCode rather than exit(): exiting while fetch still closes its sockets crashes Node on Windows.
try {
  await (dryRun ? report() : purge());
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
