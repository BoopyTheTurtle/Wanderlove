import type { QuestTask, TaskCategory, TaskHistoryEntry, TaskTag } from "./types";

// The quest arc: one task per stop, slots 1 to 5.
export const QUEST_ARC: readonly TaskCategory[] = ["intro", "silly", "deep", "silly", "wrapup"];

// Tags a quiet slot (a place of remembrance, route-safety.md H14) refuses.
const LOUD_TAGS: readonly TaskTag[] = ["energetic", "voice"];

export type SelectQuestOptions = {
  // Low mobility: leave out tasks tagged `move`.
  mobility?: boolean;
  // Slots (1-based, so 1, 3, or 5) whose stop is quiet: calm tasks only.
  quietSlots?: number[];
  // A source of numbers in [0, 1); Math.random by default. Inject a seeded one for repeatable picks.
  random?: () => number;
};

// How a task stands in the history. Lower tiers are preferred.
type Standing = { tier: number; lastDone: number };

const NEVER_SEEN = 0;
const SKIPPED_ONCE = 1;
const DONE = 2;
const SKIPPED_TWICE = 3;

function standings(history: TaskHistoryEntry[]): Map<string, Standing> {
  const counts = new Map<string, { skips: number; lastDone: number | null }>();
  for (const entry of history) {
    const c = counts.get(entry.taskId) ?? { skips: 0, lastDone: null };
    if (entry.outcome === "skipped") c.skips += 1;
    else {
      const at = Date.parse(entry.at);
      const t = Number.isNaN(at) ? 0 : at;
      c.lastDone = c.lastDone === null ? t : Math.max(c.lastDone, t);
    }
    counts.set(entry.taskId, c);
  }
  const result = new Map<string, Standing>();
  for (const [id, c] of counts) {
    if (c.lastDone !== null) result.set(id, { tier: DONE, lastDone: c.lastDone });
    else result.set(id, { tier: c.skips >= 2 ? SKIPPED_TWICE : SKIPPED_ONCE, lastDone: 0 });
  }
  return result;
}

// Picks the five tasks for a quest, in QUEST_ARC order, with the two silly tasks distinct.
//
// Each slot draws from its category's tasks that pass the slot's filters (no `move` for low mobility; no `energetic`
// or `voice` on a quiet slot) and are not already in this quest. Among those, it takes the first non-empty tier:
//   1. tasks never seen;
//   2. tasks skipped once (and never done);
//   3. tasks done before, the one done longest ago first (ties drawn at random);
//   4. tasks skipped twice or more, as a last resort, so a small pool never fails.
// Tiers 1 and 2 hold the normal candidates; 3 and 4 only fill in when they run dry. If the filters leave nothing at
// all, the slot drops the quiet filter, then the mobility filter, since a task the couple can skip beats no task.
// It throws only when the pool has no unused task of the category.
export function selectQuestTasks(
  pool: QuestTask[],
  history: TaskHistoryEntry[],
  options: SelectQuestOptions = {},
): QuestTask[] {
  const random = options.random ?? Math.random;
  const quietSlots = new Set(options.quietSlots ?? []);
  const standing = standings(history);
  const chosen: QuestTask[] = [];

  QUEST_ARC.forEach((category, index) => {
    const slot = index + 1;
    const unused = pool.filter((t) => t.category === category && !chosen.includes(t));
    const calm = (t: QuestTask) => !t.tags.some((tag) => LOUD_TAGS.includes(tag));
    const still = (t: QuestTask) => !t.tags.includes("move");
    const quiet = quietSlots.has(slot);

    const attempts: ((t: QuestTask) => boolean)[] = [
      (t) => (!quiet || calm(t)) && (!options.mobility || still(t)),
      (t) => !options.mobility || still(t),
      () => true,
    ];
    for (const passes of attempts) {
      const pick = pickBest(unused.filter(passes), standing, random);
      if (pick) {
        chosen.push(pick);
        return;
      }
    }
    throw new Error(`The task pool has no unused ${category} task for slot ${slot}.`);
  });

  return chosen;
}

function pickBest(
  candidates: QuestTask[],
  standing: Map<string, Standing>,
  random: () => number,
): QuestTask | undefined {
  if (candidates.length === 0) return undefined;
  const of = (t: QuestTask) => standing.get(t.id) ?? { tier: NEVER_SEEN, lastDone: 0 };
  const best = Math.min(...candidates.map((t) => of(t).tier));
  let tier = candidates.filter((t) => of(t).tier === best);
  if (best === DONE) {
    const oldest = Math.min(...tier.map((t) => of(t).lastDone));
    tier = tier.filter((t) => of(t).lastDone === oldest);
  }
  return tier[Math.min(tier.length - 1, Math.floor(random() * tier.length))];
}
