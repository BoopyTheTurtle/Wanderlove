import { useCallback, useEffect, useState } from "react";
import { PlanError, WALK_SLOTS, cancelPlannedWalk, loadPlannedWalk, planWalk } from "../lib/plannedWalks";
import type { PlannedWalk, WalkSlot } from "../lib/plannedWalks";
import { SLOT_LABEL, dayLabel, nextDays, planErrorMessage, planSummary, rigaToday } from "./planShare";
import "./plan-share.css";

// Plan the next walk, on a Together quest's complete screen (gamification.md, 4.4): an invitation, never a duty. The
// couple picks a day in the next two weeks and a rough time, or skips; either partner cancels the plan. The app never
// follows up on a plan, kept or missed.

export type PlanState = PlannedWalk | null | "loading" | "failed";
export type PlanAction = "plan" | "cancel";

export function PlanNextWalk({ partnerName, syncTick }: { partnerName: string; syncTick: number }) {
  const [state, setState] = useState<PlanState>("loading");
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<WalkSlot | null>(null);
  const [busy, setBusy] = useState<PlanAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [today] = useState(() => rigaToday());

  const reload = useCallback(async () => {
    try {
      setState(await loadPlannedWalk());
    } catch (e) {
      console.error("Couldn't load the planned walk", e);
      setState((s) => (s === "loading" ? "failed" : s));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, syncTick]);

  async function act(action: PlanAction, work: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await work();
      setDay(null);
      setSlot(null);
    } catch (e) {
      if (!(e instanceof PlanError)) console.error(`Planned walk: ${action} failed`, e);
      setError(planErrorMessage(e));
    }
    await reload();
    setBusy(null);
  }

  if (skipped) return null;

  return (
    <PlanNextWalkView
      partnerName={partnerName}
      state={state}
      today={today}
      day={day}
      slot={slot}
      busy={busy}
      error={error}
      onDay={setDay}
      onSlot={setSlot}
      onPlan={() => day && slot && void act("plan", () => planWalk(day, slot))}
      onCancel={() => void act("cancel", cancelPlannedWalk)}
      onSkip={() => setSkipped(true)}
    />
  );
}

export function PlanNextWalkView({
  partnerName,
  state,
  today,
  day,
  slot,
  busy,
  error,
  onDay,
  onSlot,
  onPlan,
  onCancel,
  onSkip,
}: {
  partnerName: string;
  state: PlanState;
  today: string;
  day: string | null;
  slot: WalkSlot | null;
  busy: PlanAction | null;
  error: string | null;
  onDay: (day: string) => void;
  onSlot: (slot: WalkSlot) => void;
  onPlan: () => void;
  onCancel: () => void;
  onSkip: () => void;
}) {
  // While loading, and when the plan won't load, the card stays out of the way: it is only an invitation.
  if (state === "loading" || state === "failed") return null;

  const errorLine = error && (
    <p className="plan-share-error" role="alert">
      {error}
    </p>
  );

  if (state) {
    return (
      <section className="plan-share-card" aria-labelledby="plan-next-title">
        <p className="plan-share-kicker" id="plan-next-title">
          Your next walk
        </p>
        <p className="plan-share-lead">{planSummary(state, today)}</p>
        <p className="plan-share-note">
          {state.plannedByMe ? `You planned it. ${partnerName} can see it too.` : `${partnerName} planned it.`}
        </p>
        {errorLine}
        <button type="button" className="plan-share-outline" disabled={busy !== null} onClick={onCancel}>
          {busy === "cancel" ? "Cancelling…" : "Cancel the plan"}
        </button>
      </section>
    );
  }

  return (
    <section className="plan-share-card" aria-labelledby="plan-next-title">
      <p className="plan-share-kicker" id="plan-next-title">
        Fancy another walk?
      </p>
      <p className="plan-share-note">
        Pick a day and a time if you like. {partnerName} sees it, and either of you can cancel it.
      </p>
      <div className="plan-days" role="group" aria-label="Day">
        {nextDays(today).map((d) => (
          <button
            key={d}
            type="button"
            className="plan-chip"
            aria-pressed={day === d}
            disabled={busy !== null}
            onClick={() => onDay(d)}
          >
            {dayLabel(d, today)}
          </button>
        ))}
      </div>
      <div className="plan-slots" role="group" aria-label="Time of day">
        {WALK_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            className="plan-chip"
            aria-pressed={slot === s}
            disabled={busy !== null}
            onClick={() => onSlot(s)}
          >
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>
      {errorLine}
      <div className="plan-share-actions">
        <button type="button" className="plan-share-solid" disabled={!day || !slot || busy !== null} onClick={onPlan}>
          {busy === "plan" ? "Planning…" : "Plan it"}
        </button>
        <button type="button" className="plan-share-outline" disabled={busy !== null} onClick={onSkip}>
          Not now
        </button>
      </div>
    </section>
  );
}
