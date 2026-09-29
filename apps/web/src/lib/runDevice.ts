// What this phone keeps about trail runs. The runs themselves live on the server (lib/runs.ts); the device keeps only
// the walking path it drew for each run, so FOSSGIS isn't asked again on every refresh, and the run it last followed,
// so it can tell whether that run was finished or ended while the app was closed.
const PATHS_KEY = "wannadoo_run_paths";
const FOLLOWED_KEY = "wannadoo_followed_run";
// Before phase 4 the trail and its progress lived on the phone; that demo data is discarded (main spec 4.3).
const LEGACY_KEYS = ["wannadoo_progress", "wannadoo_active_route"];
// Paths of older runs are dropped; nobody redraws a trail from weeks ago.
const MAX_PATHS = 5;

export type WalkingPath = { path: [number, number][]; distanceMeters?: number; savedAt: number };

type Paths = Record<string, WalkingPath>;

function read<T>(key: string): Partial<T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works, it just asks the router again next time.
  }
}

export function dropLegacyTrailData() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // Nothing to drop.
  }
}

export function loadWalkingPath(runId: string): WalkingPath | null {
  const saved = (read<Paths>(PATHS_KEY) as Paths)[runId];
  return saved && Array.isArray(saved.path) && saved.path.length > 1 ? saved : null;
}

export function saveWalkingPath(runId: string, path: [number, number][], distanceMeters?: number) {
  const all = read<Paths>(PATHS_KEY) as Paths;
  all[runId] = { path, distanceMeters, savedAt: Date.now() };
  const newest = Object.entries(all)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, MAX_PATHS);
  write(PATHS_KEY, Object.fromEntries(newest));
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
