import { QUEST_ARC, questTaskPool, selectQuestTasks } from "@wannadoo/core";
import type { QuestTask, Stop, TaskHistoryEntry, Trail } from "@wannadoo/core";

// Gives each stop of a surprise trail its quest task, in the arc intro, silly, deep, silly, wrap-up. Quiet stops get
// calm tasks; `mobility` leaves out tasks tagged `move`. The task IDs then travel inside the sealed trail, so the
// partner's phone shows the same tasks and the server never learns which stop got which. Throws only when the pool
// runs out of a category.
export function withQuestTasks(
  trail: Trail,
  history: TaskHistoryEntry[],
  mobility: boolean,
  random?: () => number,
): Trail {
  const quietSlots = trail.stops.flatMap((stop, i) => (stop.quiet && i < QUEST_ARC.length ? [i + 1] : []));
  const tasks = selectQuestTasks(questTaskPool, history, { mobility, quietSlots, random });
  return {
    ...trail,
    stops: trail.stops.map((stop, i) => (tasks[i] ? { ...stop, taskId: tasks[i].id } : stop)),
  };
}

// A stop's task, or null for a stop without one: legacy runs, Sherlock, and IDs this version of the app doesn't know.
export function questTaskFor(stop: Stop): QuestTask | null {
  if (!stop.taskId) return null;
  return questTaskPool.find((task) => task.id === stop.taskId) ?? null;
}

// Whom a task outcome on this run is recorded with: the partner on a couple's run, nobody (null) on a solo or Just me
// run, or undefined when it can't be recorded, as on a couple's run after an unlink. A Just me run has no couple, so
// its tasks never reach the pair's history.
export function historyPartnerFor(coupleId: string | null, partnerId: string | null): string | null | undefined {
  if (!coupleId) return null;
  return partnerId ?? undefined;
}

// ---- Sealed details ----------------------------------------------------------------------------------------------
// runSnapshot.ts copies a fixed list of stop fields, shared with legacy plain snapshots, so the task IDs join the
// sealed details here, by stop position, and come back out the same way.

type WithStops = { stops: Stop[] };

export function sealTaskIds<T extends WithStops>(details: T, trail: Trail): T {
  return {
    ...details,
    stops: details.stops.map((stop, i) => {
      const taskId = trail.stops[i]?.taskId;
      return taskId ? { ...stop, taskId } : stop;
    }),
  };
}

export function openTaskIds(trail: Trail, json: unknown): Trail {
  const raw = typeof json === "object" && json !== null ? (json as { stops?: unknown }).stops : undefined;
  if (!Array.isArray(raw)) return trail;
  return {
    ...trail,
    stops: trail.stops.map((stop, i) => {
      const entry: unknown = raw[i];
      const taskId = typeof entry === "object" && entry !== null ? (entry as { taskId?: unknown }).taskId : undefined;
      return typeof taskId === "string" && taskId !== "" ? { ...stop, taskId } : stop;
    }),
  };
}
