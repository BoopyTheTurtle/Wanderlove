import type { Trail } from "../trail";
import { trail as sherlock } from "../trail";

// A hand-made quest with its own fixed trail and tasks, offered instead of a generated one.
export type SpecialQuest = {
  id: string;
  trail: Trail;
  // When the quest is offered (a date, a place, a milestone). Not decided yet.
  trigger: null;
};

export const specialQuests: SpecialQuest[] = [{ id: sherlock.id, trail: sherlock, trigger: null }];
