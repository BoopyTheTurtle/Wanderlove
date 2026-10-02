import { useCallback, useEffect, useRef, useState } from "react";
import { weeklyRhythm } from "@wannadoo/core";
import type { Rhythm } from "@wannadoo/core";
import { loadRhythm, loadRhythmGoal, pauseRhythmGoal, setRhythmGoal } from "../lib/rhythm";
import type { GoalKind, RhythmDay, RhythmGoal } from "../lib/rhythm";
import { onForeground } from "../lib/coupleStats";
import { GOAL_LABELS, monthTitle, weekLabel, weekName } from "../lib/rhythmBadgesView";
import "./rhythm-badges.css";

// The weekly rhythm (gamification.md, 4.3): this month's weeks, filled when you walked, with a count that only goes up.
// No streak: an empty week stays plain, nothing counts down, and nothing is ever called missed. A couple may set a goal
// and either partner may pause it, no reason asked. Linked, the weeks come from the couple's quests; solo, from the
// user's own, with no goal.

// Enough weeks to reach back to the start of the season (at most 13 weeks) and the start of the month.
const RHYTHM_WEEKS = 16;

type Loaded = { days: RhythmDay[]; goal: RhythmGoal | null };

export function RhythmCard({ linked, refreshKey }: { linked: boolean; refreshKey?: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);

  const reload = useCallback(async () => {
    const id = ++request.current;
    try {
      const [days, goal] = await Promise.all([loadRhythm(RHYTHM_WEEKS), linked ? loadRhythmGoal() : null]);
      if (id === request.current) setLoaded({ days, goal });
    } catch (e) {
      // Keeps what it showed; with nothing yet, the card stays away rather than showing an empty month.
      console.error("Couldn't load the weekly rhythm", e);
    }
  }, [linked]);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload, refreshKey]);

  async function change(action: () => Promise<void>) {
    setSaving(true);
    setFailed(false);
    try {
      await action();
      await reload();
    } catch (e) {
      console.error("Couldn't change the rhythm goal", e);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;
  const rhythm = weeklyRhythm({
    walks: loaded.days.filter((d) => d.quests > 0).map((d) => d.day),
    now: new Date(),
    goal: loaded.goal?.goal ?? null,
    paused: loaded.goal?.paused ?? false,
  });
  return (
    <RhythmCardView
      rhythm={rhythm}
      goal={linked ? loaded.goal : undefined}
      saving={saving}
      failed={failed}
      onSetGoal={(goal) => void change(() => setRhythmGoal(goal))}
      onPause={(paused) => void change(() => pauseRhythmGoal(paused))}
    />
  );
}

export function RhythmCardView({
  rhythm,
  goal,
  saving = false,
  failed = false,
  onSetGoal,
  onPause,
}: {
  rhythm: Rhythm;
  // undefined: solo, so no goal controls; null: linked without a goal.
  goal: RhythmGoal | null | undefined;
  saving?: boolean;
  failed?: boolean;
  onSetGoal: (goal: GoalKind | null) => void;
  onPause: (paused: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="rhythm-card" aria-label="Your weekly rhythm">
      <div className="rhythm-head">
        <p className="rhythm-kicker">{monthTitle(rhythm.weeks)}</p>
        {goal !== undefined && !editing && (
          <button type="button" className="rhythm-link" onClick={() => setEditing(true)}>
            {goal ? "Goal" : "Set a goal"}
          </button>
        )}
      </div>

      <ol className="rhythm-weeks">
        {rhythm.weeks.map((week) => (
          <li
            key={week.start}
            className={`rhythm-week${week.filled ? " filled" : ""}${week.current ? " current" : ""}${week.upcoming ? " upcoming" : ""}`}
            aria-label={weekName(week)}
          >
            <span className="rhythm-mark" aria-hidden="true" />
            <small aria-hidden="true">{weekLabel(week.start)}</small>
          </li>
        ))}
      </ol>

      <p className="rhythm-line">{rhythm.seasonLine ?? "Each week you walk fills in here."}</p>

      {goal && !editing && (
        <p className="rhythm-goal">
          <span>{GOAL_LABELS[goal.goal]}</span>
          {rhythm.goalProgress ? (
            <span className="rhythm-dots" aria-label={dotsName(rhythm.goalProgress.dots)}>
              {rhythm.goalProgress.dots.map((done, i) => (
                <span key={i} className={`rhythm-dot${done ? " done" : ""}`} aria-hidden="true" />
              ))}
            </span>
          ) : (
            <span className="rhythm-paused">Paused</span>
          )}
        </p>
      )}

      {goal !== undefined && editing && (
        <div className="rhythm-goal-edit">
          <div className="rhythm-choices" role="group" aria-label="Goal">
            {(Object.keys(GOAL_LABELS) as GoalKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`rhythm-choice${goal?.goal === kind ? " chosen" : ""}`}
                aria-pressed={goal?.goal === kind}
                disabled={saving}
                onClick={() => {
                  if (goal?.goal !== kind || goal.paused) onSetGoal(kind);
                  setEditing(false);
                }}
              >
                {GOAL_LABELS[kind]}
              </button>
            ))}
            <button
              type="button"
              className={`rhythm-choice${goal ? "" : " chosen"}`}
              aria-pressed={!goal}
              disabled={saving}
              onClick={() => {
                if (goal) onSetGoal(null);
                setEditing(false);
              }}
            >
              No goal
            </button>
          </div>
          <div className="rhythm-edit-foot">
            {goal && (
              <button
                type="button"
                className="rhythm-link"
                disabled={saving}
                onClick={() => {
                  onPause(!goal.paused);
                  setEditing(false);
                }}
              >
                {goal.paused ? "Resume goal" : "Pause goal"}
              </button>
            )}
            <button type="button" className="rhythm-link" onClick={() => setEditing(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {failed && <p className="rhythm-error">Couldn&rsquo;t save that. Try again in a moment.</p>}
    </section>
  );
}

function dotsName(dots: readonly boolean[]): string {
  const done = dots.filter(Boolean).length;
  return `${done} of ${dots.length} so far`;
}
