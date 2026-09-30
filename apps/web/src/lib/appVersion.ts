// Tells a phone that has kept an old build open that a newer one is live. Each build stamps its ID into the bundle
// (vite.config.ts, VITE_BUILD_ID) and publishes the same ID at /version.json, which Vercel serves uncached. The
// UpdatePrompt component fetches that file when the app returns to the foreground and compares.

// The ID of the build this page runs; undefined in dev and tests.
export const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined;

// Returning to the app checks at most this often.
export const CHECK_INTERVAL_MS = 60 * 1000;

// Whether enough time has passed since the last check. `lastCheckedAt` is null before the first one.
export function shouldCheck(lastCheckedAt: number | null, now: number, interval = CHECK_INTERVAL_MS): boolean {
  return lastCheckedAt === null || now - lastCheckedAt >= interval;
}

// The build ID in a parsed /version.json, or null when the body isn't one.
export function readBuildId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// True only when both IDs are known and differ; an unreadable answer never prompts a reload.
export function isNewVersion(current: string | undefined, live: string | null): boolean {
  return current !== undefined && live !== null && live !== current;
}

// The live build's ID, or null when the file can't be fetched or read (offline, say).
export async function fetchLiveBuildId(): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    return readBuildId(await res.json());
  } catch {
    return null;
  }
}
