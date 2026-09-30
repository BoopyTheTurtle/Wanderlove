// What this phone keeps about trail runs. The runs themselves live on the server (lib/runs.ts); the device keeps only
// the walking path it drew for the open run, so FOSSGIS isn't asked again on every refresh, and the run it last
// followed, so it can tell whether that run was finished or ended while the app was closed.
//
// A walking path starts at the start point, which may be a home (abuse threat model, L4 and D1). So paths are kept
// per user, only while their run is open, never longer than MAX_PATH_AGE_MS, and sign-out removes them.
const PATHS_KEY = "wannadoo_walking_paths";
const FOLLOWED_KEY = "wannadoo_followed_run";
// Before phase 4 the trail and its progress lived on the phone; that demo data is discarded (main spec 4.3). Paths
// under wannadoo_run_paths were kept for any five runs, tied to no user.
const LEGACY_KEYS = ["wannadoo_progress", "wannadoo_active_route", "wannadoo_run_paths"];
// A walk takes an afternoon; a path older than this belongs to a run nobody is walking any more.
export const MAX_PATH_AGE_MS = 2 * 24 * 60 * 60 * 1000;

export type WalkingPath = { path: [number, number][]; distanceMeters?: number; savedAt: number };

// { [userId]: { [runId]: WalkingPath } }
type Paths = Record<string, Record<string, WalkingPath>>;

function read<T>(key: string): Partial<T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

// Writes the map, or removes the key once it is empty, so a phone without Wannadoo data holds no Wannadoo keys.
function write(key: string, value: Record<string, unknown>) {
  try {
    if (Object.keys(value).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, it just asks the router again next time.
  }
}

function isWalkingPath(value: unknown): value is WalkingPath {
  const p = value as Partial<WalkingPath> | null;
  return !!p && Array.isArray(p.path) && p.path.length > 1 && typeof p.savedAt === "number";
}

// Every stored path that is well formed and younger than MAX_PATH_AGE_MS, by user.
function readPaths(now: number): Paths {
  const fresh: Paths = {};
  for (const [userId, runs] of Object.entries(read<Paths>(PATHS_KEY))) {
    if (!runs || typeof runs !== "object") continue;
    const kept = Object.entries(runs).filter(([, p]) => isWalkingPath(p) && now - p.savedAt < MAX_PATH_AGE_MS);
    if (kept.length > 0) fresh[userId] = Object.fromEntries(kept);
  }
  return fresh;
}

function writePaths(paths: Paths) {
  write(PATHS_KEY, paths);
}

// On app load: drops the demo-era data and every user's paths that have outlived any walk.
export function dropLegacyTrailData(now = Date.now()) {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Nothing to drop.
  }
  writePaths(readPaths(now));
}

export function loadWalkingPath(userId: string, runId: string, now = Date.now()): WalkingPath | null {
  return readPaths(now)[userId]?.[runId] ?? null;
}

// Saving a path for one run drops the user's paths for any other: only one run is open at a time.
export function saveWalkingPath(
  userId: string,
  runId: string,
  path: [number, number][],
  distanceMeters?: number,
  now = Date.now(),
) {
  const all = readPaths(now);
  all[userId] = { [runId]: { path, distanceMeters, savedAt: now } };
  writePaths(all);
}

// Keeps the user's path for the open run, if any, and drops the rest: runs that ended, on this phone or the
// partner's, or no longer exist. Called with every run the server returns.
export function keepWalkingPathOnly(userId: string, openRunId: string | null, now = Date.now()) {
  const stored = read<Paths>(PATHS_KEY);
  const all = readPaths(now);
  const mine = all[userId] ?? {};
  const kept = openRunId && mine[openRunId] ? { [openRunId]: mine[openRunId] } : null;
  if (kept) all[userId] = kept;
  else delete all[userId];
  // Skip the write when nothing changed; the app calls this on every sync.
  if (JSON.stringify(all) !== JSON.stringify(stored)) writePaths(all);
}

// Keyed by user, so a second account on the same phone follows its own runs.
export function loadFollowedRun(userId: string): string | null {
  const id = (read<Record<string, string>>(FOLLOWED_KEY) as Record<string, string>)[userId];
  return typeof id === "string" ? id : null;
}

export function saveFollowedRun(userId: string, runId: string | null) {
  const all = read<Record<string, string>>(FOLLOWED_KEY) as Record<string, string>;
  if (all[userId] === (runId ?? undefined)) return;
  if (runId) all[userId] = runId;
  else delete all[userId];
  write(FOLLOWED_KEY, all);
}

// Sign-out: this phone forgets the user's walking paths and the run it followed for them.
export function forgetRunDevice(userId: string) {
  const all = readPaths(Date.now());
  delete all[userId];
  writePaths(all);
  saveFollowedRun(userId, null);
}
