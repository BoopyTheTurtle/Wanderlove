import { describe, expect, it } from "vitest";
import { trail } from "../trail";
import { questTaskPool } from "./pool";
import { QUEST_ARC, selectQuestTasks } from "./select";
import { specialQuests } from "./special";
import type { QuestTask, TaskHistoryEntry } from "./types";

// Mulberry32: a small seeded generator, so picks repeat.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = (tasks: QuestTask[]) => tasks.map((t) => t.id);
const entry = (taskId: string, outcome: "done" | "skipped", day: number): TaskHistoryEntry => ({
  taskId,
  outcome,
  at: new Date(Date.UTC(2026, 8, day)).toISOString(),
});
const task = (id: string, category: QuestTask["category"], tags: QuestTask["tags"] = ["talk"]): QuestTask => ({
  id,
  category,
  title: id,
  prompt: id,
  steps: ["a", "b"],
  photoHint: id,
  tags,
  minutes: 3,
});
// A tiny pool with exactly what each test needs.
const tinyPool = (silly: QuestTask[]): QuestTask[] => [
  task("intro-1", "intro"),
  ...silly,
  task("deep-1", "deep"),
  task("wrapup-1", "wrapup"),
];

describe("questTaskPool", () => {
  it("has unique ids that match their category", () => {
    expect(new Set(ids(questTaskPool)).size).toBe(questTaskPool.length);
    for (const t of questTaskPool) expect(t.id.startsWith(`${t.category}-`)).toBe(true);
  });
});

describe("selectQuestTasks", () => {
  it("returns five tasks in the arc order, the two silly tasks distinct", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const tasks = selectQuestTasks(questTaskPool, [], { random: seeded(seed) });
      expect(tasks.map((t) => t.category)).toEqual(QUEST_ARC);
      expect(tasks[1].id).not.toBe(tasks[3].id);
    }
  });

  it("gives two consecutive quests no shared task once history is updated", () => {
    const random = seeded(7);
    const first = selectQuestTasks(questTaskPool, [], { random });
    const history = first.map((t) => entry(t.id, "done", 1));
    const second = selectQuestTasks(questTaskPool, history, { random });
    expect(ids(second).filter((id) => ids(first).includes(id))).toEqual([]);
  });

  it("never picks a done task while others remain", () => {
    const silly = ids(questTaskPool.filter((t) => t.category === "silly"));
    const left = silly.slice(-2);
    const history = silly.slice(0, -2).map((id) => entry(id, "done", 1));
    for (let seed = 1; seed <= 20; seed++) {
      const tasks = selectQuestTasks(questTaskPool, history, { random: seeded(seed) });
      expect(ids(tasks.filter((t) => t.category === "silly")).sort()).toEqual(left.sort());
    }
  });

  it("brings back a task skipped once, after never-seen tasks", () => {
    const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly"), task("silly-c", "silly")]);
    const history = [entry("silly-a", "skipped", 1)];
    for (let seed = 1; seed <= 20; seed++) {
      const silly = ids(selectQuestTasks(pool, history, { random: seeded(seed) })).filter((id) =>
        id.startsWith("silly"),
      );
      expect(silly.sort()).toEqual(["silly-b", "silly-c"]);
    }
    // With one never-seen task left, the skipped-once task fills the second silly slot.
    const fewer = tinyPool([task("silly-a", "silly"), task("silly-b", "silly")]);
    expect(ids(selectQuestTasks(fewer, history, { random: seeded(1) }))).toEqual([
      "intro-1",
      "silly-b",
      "deep-1",
      "silly-a",
      "wrapup-1",
    ]);
  });

  it("leaves out a task skipped twice, even with a return in between", () => {
    const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly"), task("silly-c", "silly")]);
    const history = [entry("silly-a", "skipped", 1), entry("silly-a", "skipped", 5), entry("silly-b", "skipped", 2)];
    for (let seed = 1; seed <= 20; seed++) {
      const silly = ids(selectQuestTasks(pool, history, { random: seeded(seed) })).filter((id) =>
        id.startsWith("silly"),
      );
      expect(silly).toEqual(["silly-c", "silly-b"]);
    }
  });

  it("leaves out move tasks for low mobility", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const tasks = selectQuestTasks(questTaskPool, [], { mobility: true, random: seeded(seed) });
      for (const t of tasks) expect(t.tags).not.toContain("move");
    }
  });

  it("gives quiet slots calm tasks only", () => {
    const pool: QuestTask[] = [
      task("intro-loud", "intro", ["voice"]),
      task("intro-calm", "intro", ["talk", "quiet"]),
      task("silly-a", "silly", ["voice"]),
      task("silly-b", "silly", ["energetic"]),
      task("deep-loud", "deep", ["energetic"]),
      task("deep-calm", "deep", ["quiet"]),
      task("wrapup-loud", "wrapup", ["voice"]),
      task("wrapup-calm", "wrapup", ["talk"]),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const tasks = selectQuestTasks(pool, [], { quietSlots: [1, 3, 5], random: seeded(seed) });
      expect(ids(tasks)[0]).toBe("intro-calm");
      expect(ids(tasks)[2]).toBe("deep-calm");
      expect(ids(tasks)[4]).toBe("wrapup-calm");
    }
    // The seed pool has calm intro tasks, so slot 1 never gets the hummed soundtrack.
    for (let seed = 1; seed <= 20; seed++) {
      const tasks = selectQuestTasks(questTaskPool, [], { quietSlots: [1], random: seeded(seed) });
      expect(tasks[0].tags).not.toContain("voice");
      expect(tasks[0].tags).not.toContain("energetic");
    }
  });

  describe("when a category runs dry", () => {
    it("reuses the task done longest ago", () => {
      const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly"), task("silly-c", "silly")]);
      const history = [entry("silly-a", "done", 9), entry("silly-b", "done", 2), entry("silly-c", "done", 5)];
      const silly = ids(selectQuestTasks(pool, history, { random: seeded(1) })).filter((id) => id.startsWith("silly"));
      expect(silly).toEqual(["silly-b", "silly-c"]);
    });

    it("prefers a task skipped once over a done one, and a done one over one skipped twice", () => {
      const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly"), task("silly-c", "silly")]);
      const history = [
        entry("silly-a", "skipped", 1),
        entry("silly-a", "skipped", 2),
        entry("silly-b", "done", 1),
        entry("silly-c", "skipped", 3),
      ];
      const silly = ids(selectQuestTasks(pool, history, { random: seeded(1) })).filter((id) => id.startsWith("silly"));
      expect(silly).toEqual(["silly-c", "silly-b"]);
    });

    it("falls back to a twice-skipped task rather than failing", () => {
      const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly")]);
      const history = ["silly-a", "silly-b"].flatMap((id) => [entry(id, "skipped", 1), entry(id, "skipped", 2)]);
      expect(selectQuestTasks(pool, history, { random: seeded(1) })).toHaveLength(5);
    });

    it("relaxes the quiet filter, then the mobility filter, rather than failing", () => {
      const pool = tinyPool([task("silly-a", "silly"), task("silly-b", "silly")]);
      pool[0] = task("intro-1", "intro", ["move", "voice"]);
      const tasks = selectQuestTasks(pool, [], { mobility: true, quietSlots: [1], random: seeded(1) });
      expect(tasks[0].id).toBe("intro-1");
    });

    it("throws when the pool lacks a second silly task", () => {
      const pool = tinyPool([task("silly-a", "silly")]);
      expect(() => selectQuestTasks(pool, [])).toThrow(/silly/);
    });
  });

  it("repeats its picks for the same seed", () => {
    const history = [entry("intro-001", "done", 1), entry("deep-002", "skipped", 2)];
    const a = selectQuestTasks(questTaskPool, history, { random: seeded(42) });
    const b = selectQuestTasks(questTaskPool, history, { random: seeded(42) });
    expect(ids(a)).toEqual(ids(b));
  });
});

describe("specialQuests", () => {
  it("lists the Sherlock trail first", () => {
    expect(specialQuests[0]).toEqual({ id: trail.id, trail, trigger: null });
  });
});
