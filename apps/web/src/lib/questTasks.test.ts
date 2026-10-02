import { describe, expect, it } from "vitest";
import { QUEST_ARC, questTaskPool } from "@wannadoo/core";
import type { Stop, TaskHistoryEntry, Trail } from "@wannadoo/core";
import { historyPartnerFor, openTaskIds, questTaskFor, sealTaskIds, withQuestTasks } from "./questTasks";
import { fromRunDetails, toRunDetails } from "./runSnapshot";

// Mulberry32, so picks repeat.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stop = (n: number, quiet = false): Stop => ({
  id: `osm-node-${n}`,
  name: `Place ${n}`,
  lat: 56.9 + n / 1000,
  lng: 24.1,
  radiusMeters: 60,
  eyebrow: `Stop ${n}`,
  prompt: "A plain prompt",
  image: "",
  ...(quiet ? { quiet: true } : {}),
});

const surprise = (quiet: number[] = []): Trail => ({
  id: "surprise-1",
  kind: "surprise",
  name: "Surprise route",
  location: "Near you",
  description: "",
  durationMinutes: 60,
  stopCount: 5,
  coverImage: "",
  stops: [1, 2, 3, 4, 5].map((n) => stop(n, quiet.includes(n))),
});

const task = (s: Stop) => {
  const found = questTaskFor(s);
  if (!found) throw new Error(`No task on ${s.id}`);
  return found;
};

describe("withQuestTasks", () => {
  it("gives the five stops one task each, in the quest arc", () => {
    const trail = withQuestTasks(surprise(), [], false, seeded(1));
    expect(trail.stops.map((s) => task(s).category)).toEqual(QUEST_ARC);
  });

  it("gives a pair's next quest no task from the one they finished", () => {
    const random = seeded(3);
    const first = withQuestTasks(surprise(), [], false, random);
    const history: TaskHistoryEntry[] = first.stops.map((s) => ({
      taskId: s.taskId!,
      outcome: "done",
      at: "2026-10-01T10:00:00Z",
    }));
    const second = withQuestTasks(surprise(), history, false, random);
    const before = new Set(first.stops.map((s) => s.taskId));
    expect(second.stops.filter((s) => before.has(s.taskId))).toEqual([]);
  });

  it("leaves out movement tasks with the mobility setting on", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const trail = withQuestTasks(surprise(), [], true, seeded(seed));
      for (const s of trail.stops) expect(task(s).tags).not.toContain("move");
    }
  });

  it("gives quiet stops calm tasks", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const trail = withQuestTasks(surprise([1, 3, 5]), [], false, seeded(seed));
      for (const i of [0, 2, 4]) {
        expect(task(trail.stops[i]).tags).not.toContain("voice");
        expect(task(trail.stops[i]).tags).not.toContain("energetic");
      }
    }
  });

  it("leaves extra stops without a task", () => {
    const six = { ...surprise(), stops: [...surprise().stops, stop(6)] };
    const trail = withQuestTasks(six, [], false, seeded(1));
    expect(trail.stops[5].taskId).toBeUndefined();
  });
});

describe("questTaskFor", () => {
  it("finds a pool task and ignores stops without a known one", () => {
    expect(questTaskFor({ ...stop(1), taskId: questTaskPool[0].id })).toBe(questTaskPool[0]);
    expect(questTaskFor(stop(1))).toBeNull();
    expect(questTaskFor({ ...stop(1), taskId: "silly-999" })).toBeNull();
  });
});

describe("historyPartnerFor", () => {
  it("records a couple's run for the pair and a Just me or solo run for the walker alone", () => {
    expect(historyPartnerFor("couple-1", "partner-1")).toBe("partner-1");
    expect(historyPartnerFor(null, "partner-1")).toBeNull();
    expect(historyPartnerFor(null, null)).toBeNull();
  });

  it("records nothing for a couple's run once the partner is gone", () => {
    expect(historyPartnerFor("couple-1", null)).toBeUndefined();
  });
});

describe("sealed task IDs", () => {
  it("survive the sealed details, by stop position, without a start or path", () => {
    const trail = {
      ...withQuestTasks(surprise([2]), [], false, seeded(5)),
      start: { lat: 56.9, lng: 24.1 },
      path: [[56.9, 24.1]] as [number, number][],
    };
    const details = JSON.parse(JSON.stringify(sealTaskIds(toRunDetails(trail), trail))) as unknown;
    const opened = openTaskIds(fromRunDetails(details), details);
    expect(opened.stops.map((s) => s.taskId)).toEqual(trail.stops.map((s) => s.taskId));
    expect(opened.stops.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(opened.stops[1].quiet).toBe(true);
    expect(details).not.toHaveProperty("start");
    expect(details).not.toHaveProperty("path");
  });

  it("leave a trail without tasks, such as Sherlock or a legacy run, as it was", () => {
    const trail = surprise();
    const details = sealTaskIds(toRunDetails(trail), trail);
    expect(details.stops.some((s) => "taskId" in s)).toBe(false);
    const opened = openTaskIds(fromRunDetails(details), details);
    expect(opened.stops.every((s) => s.taskId === undefined)).toBe(true);
  });

  it("ignore a malformed task ID", () => {
    const trail = surprise();
    const details = toRunDetails(trail);
    const tampered = { ...details, stops: details.stops.map((s) => ({ ...s, taskId: 7 })) };
    expect(openTaskIds(fromRunDetails(tampered), tampered).stops[0].taskId).toBeUndefined();
  });
});
