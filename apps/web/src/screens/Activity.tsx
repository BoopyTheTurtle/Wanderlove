import { useEffect, useState } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { BottomNav } from "../components/BottomNav";
import { BadgeShelf } from "../components/BadgeShelf";
import { CameraIcon, ChevronIcon, FlagIcon } from "../components/Icons";
import { useRunKeyLoader } from "../lib/photoKeys";
import { journeyDay, listPastRuns, photosRemoved, type PastRun } from "../lib/runs";
import "../activity.css";

type Loaded = { status: "loading" } | { status: "error" } | { status: "ready"; runs: PastRun[] };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Earned memory badges, then past journeys, newest first; each opens its album. `refreshKey` reloads the list, keeping it on screen meanwhile.
export function Activity({ refreshKey, onOpen }: { refreshKey: number; onOpen: (run: PastRun) => void }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const openKey = useRunKeyLoader();

  useEffect(() => {
    let current = true;
    listPastRuns(openKey).then(
      (runs) => current && setLoaded({ status: "ready", runs }),
      (e: unknown) => {
        console.error("Couldn't load past journeys", e);
        if (current) setLoaded((s) => (s.status === "ready" ? s : { status: "error" }));
      },
    );
    return () => {
      current = false;
    };
  }, [refreshKey, attempt, openKey]);

  return (
    <div className="screen activity-screen with-nav">
      <StatusBar />
      <div className="page-head">
        <div>
          <p className="eyebrow">Together so far</p>
          <h2>Your journeys</h2>
        </div>
      </div>

      <BadgeShelf refreshKey={refreshKey} />

      {loaded.status === "loading" && <p className="activity-note">Loading your journeys…</p>}
      {loaded.status === "error" && (
        <p className="activity-note">
          Couldn&rsquo;t load your journeys.{" "}
          <button
            type="button"
            className="inline-link"
            onClick={() => {
              setLoaded({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      {loaded.status === "ready" && loaded.runs.length === 0 && (
        <p className="activity-note">Your finished quests will gather here.</p>
      )}

      {loaded.status === "ready" && loaded.runs.length > 0 && (
        <ul className="journey-list">
          {loaded.runs.map((run) => (
            <li key={run.id}>
              <button type="button" className="journey-row" onClick={() => onOpen(run)}>
                <span className="journey-row-copy">
                  <small>
                    {journeyDay(run.endedAt)}
                    {run.outcome === "left" && <span className="journey-tag">Left early</span>}
                  </small>
                  <strong>{run.trailName}</strong>
                  <span className="journey-row-meta">
                    <span>
                      <FlagIcon size={13} /> {run.stopsDone}/{run.stopCount} stops
                    </span>
                    <span>
                      <CameraIcon size={13} />{" "}
                      {photosRemoved(run.endedAt, run.photoCount) ? "Photos removed" : plural(run.photoCount, "photo")}
                    </span>
                  </span>
                </span>
                <span className="mode-arrow" aria-hidden="true">
                  <ChevronIcon size={18} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <BottomNav active="activity" />
    </div>
  );
}
