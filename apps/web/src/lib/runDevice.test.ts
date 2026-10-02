import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PATH_AGE_MS,
  dropLegacyTrailData,
  forgetRunDevice,
  keepWalkingPathOnly,
  loadFollowedRun,
  loadWalkingPath,
  saveFollowedRun,
  saveWalkingPath,
} from "./runDevice";
import { memoryStorage } from "./memoryStorage";

const PATH: [number, number][] = [
  [56.95, 24.1],
  [56.96, 24.11],
];
const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("walking paths", () => {
  it("keeps a path per user", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, NOW);
    expect(loadWalkingPath("daniel", "run-1", NOW)?.path).toEqual(PATH);
    expect(loadWalkingPath("emma", "run-1", NOW)).toBeNull();
  });

  it("keeps only the newest run's path for a user", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, NOW);
    saveWalkingPath("daniel", "run-2", PATH, 2600, NOW + 1);
    expect(loadWalkingPath("daniel", "run-1", NOW + 1)).toBeNull();
    expect(loadWalkingPath("daniel", "run-2", NOW + 1)).not.toBeNull();
  });

  it("drops the path once its run is no longer open", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, NOW);
    saveWalkingPath("emma", "run-9", PATH, 2600, NOW);
    keepWalkingPathOnly("daniel", "run-1", NOW);
    expect(loadWalkingPath("daniel", "run-1", NOW)).not.toBeNull();
    keepWalkingPathOnly("daniel", null, NOW);
    expect(loadWalkingPath("daniel", "run-1", NOW)).toBeNull();
    // Another user's path waits for their own sign-in.
    expect(loadWalkingPath("emma", "run-9", NOW)).not.toBeNull();
  });

  it("drops the path when another run takes its place", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, NOW);
    keepWalkingPathOnly("daniel", "run-2", NOW);
    expect(loadWalkingPath("daniel", "run-1", NOW)).toBeNull();
    expect(localStorage.getItem("wannadoo_walking_paths")).toBeNull();
  });

  it("ignores and drops paths older than any walk", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, NOW);
    saveWalkingPath("emma", "run-9", PATH, 2600, NOW + MAX_PATH_AGE_MS / 2);
    const later = NOW + MAX_PATH_AGE_MS;
    expect(loadWalkingPath("daniel", "run-1", later)).toBeNull();
    dropLegacyTrailData(later);
    expect(JSON.parse(localStorage.getItem("wannadoo_walking_paths") ?? "{}")).toEqual({
      emma: { "run-9": expect.any(Object) },
    });
  });

  it("drops the unkeyed paths and the demo data of earlier versions on load", () => {
    localStorage.setItem("wannadoo_run_paths", JSON.stringify({ "run-1": { path: PATH, savedAt: NOW } }));
    localStorage.setItem("wannadoo_progress", "{}");
    localStorage.setItem("wannadoo_active_route", "{}");
    dropLegacyTrailData(NOW);
    expect(localStorage.length).toBe(0);
  });

  it("survives garbage in storage", () => {
    localStorage.setItem("wannadoo_walking_paths", JSON.stringify({ daniel: { "run-1": { path: "x" } }, emma: 3 }));
    expect(loadWalkingPath("daniel", "run-1", NOW)).toBeNull();
    dropLegacyTrailData(NOW);
    expect(localStorage.getItem("wannadoo_walking_paths")).toBeNull();
  });
});

describe("forgetRunDevice", () => {
  it("removes the user's paths and followed run, and nobody else's", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, Date.now());
    saveWalkingPath("emma", "run-9", PATH, 2600, Date.now());
    saveFollowedRun("daniel", "run-1");
    saveFollowedRun("emma", "run-9");
    forgetRunDevice("daniel");
    expect(loadWalkingPath("daniel", "run-1")).toBeNull();
    expect(loadFollowedRun("daniel")).toBeNull();
    expect(loadWalkingPath("emma", "run-9")).not.toBeNull();
    expect(loadFollowedRun("emma")).toBe("run-9");
  });

  it("leaves no key behind for the last user", () => {
    saveWalkingPath("daniel", "run-1", PATH, 2600, Date.now());
    saveFollowedRun("daniel", "run-1");
    forgetRunDevice("daniel");
    expect(localStorage.length).toBe(0);
  });
});
