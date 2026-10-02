import { describe, expect, it } from "vitest";
import type { QuestTask } from "@wannadoo/core";
import { buildReport, commentSection, reviewSection, voteSection } from "./report";
import type { FeedbackRows } from "./report";

function task(id: string, category: QuestTask["category"], title: string, prompt: string): QuestTask {
  return { id, category, title, prompt, steps: [], photoHint: "", tags: [], minutes: 2 };
}

const pool = [
  task("intro-001", "intro", "Name this walk", "Give today's walk the name of a film."),
  task("silly-002", "silly", "Statues", "Freeze | like a statue."),
  task("deep-003", "deep", "Small wins", "Name a small win\nfrom this week."),
];

// Rows as the views return them: votes worst first, comments and reviews newest first.
const rows: FeedbackRows = {
  votes: [
    { task_id: "silly-002", ups: 1, downs: 3, net: -2, voters: 4 },
    { task_id: "gone-009", ups: 2, downs: 1, net: 1, voters: 3 },
    { task_id: "intro-001", ups: 5, downs: 0, net: 5, voters: 5 },
  ],
  comments: [
    {
      day: "2026-10-02",
      mode: "together",
      tasks_done: 5,
      question: "Which task surprised you, and how?",
      body: "The statues one.\n\nWe laughed a lot.",
    },
    { day: "2026-10-01", mode: "solo", tasks_done: 1, question: null, body: "Short walk." },
  ],
  reviews: [{ day: "2026-10-02", overall: "Lovely", likes: null, wishes: "Dark mode" }],
};

describe("voteSection", () => {
  it("joins each voted task with its category and text, in the view's order", () => {
    const md = voteSection(rows.votes, pool);
    const lines = md.split("\n");
    const statues = lines.findIndex((l) => l.startsWith("| silly-002 "));
    const name = lines.findIndex((l) => l.startsWith("| intro-001 "));
    expect(statues).toBeGreaterThan(0);
    expect(statues).toBeLessThan(name);
    expect(lines[statues]).toBe("| silly-002 | Silly game | **Statues** Freeze \\| like a statue. | 1 | 3 | -2 | 4 |");
    expect(lines[name]).toBe(
      "| intro-001 | Warm-up | **Name this walk** Give today's walk the name of a film. | 5 | 0 | +5 | 5 |",
    );
  });

  it("marks a voted task the pool no longer holds", () => {
    expect(voteSection(rows.votes, pool)).toContain("| gone-009 |  | _Not in the task pool_ | 2 | 1 | +1 | 3 |");
  });

  it("lists the rest of the pool, on one line each", () => {
    const md = voteSection(rows.votes, pool);
    expect(md).toContain("### Fewer than three voters (1)");
    expect(md).toContain("| deep-003 | Deep talk | **Small wins** Name a small win from this week. |");
  });

  it("says so when no task has three voters", () => {
    const md = voteSection([], pool);
    expect(md).toContain("No task has three voters yet.");
    expect(md).toContain("### Fewer than three voters (3)");
  });
});

describe("commentSection", () => {
  it("shows each comment with its day, mode, tasks done, prompt, and words", () => {
    const md = commentSection(rows.comments);
    expect(md).toContain("## Quest comments (2)");
    expect(md).toContain("### 2026-10-02, together, 5 tasks done");
    expect(md).toContain("_Prompt: Which task surprised you, and how?_");
    expect(md).toContain("> The statues one.\n>\n> We laughed a lot.");
    expect(md).toContain("### 2026-10-01, solo, 1 task done\n\n> Short walk.");
  });
});

describe("reviewSection", () => {
  it("shows only the fields a tester filled", () => {
    const md = reviewSection(rows.reviews);
    expect(md).toContain("**The app overall**\n\n> Lovely");
    expect(md).toContain("**What you'd like to see**\n\n> Dark mode");
    expect(md).not.toContain("What you like");
  });
});

describe("buildReport", () => {
  it("writes the votes, then the comments, then the reviews", () => {
    const md = buildReport(rows, pool, "2026-10-02");
    expect(md.startsWith("# Tester feedback, 2026-10-02\n")).toBe(true);
    expect(md.indexOf("## Task votes")).toBeLessThan(md.indexOf("## Quest comments"));
    expect(md.indexOf("## Quest comments")).toBeLessThan(md.indexOf("## App reviews"));
    expect(md.endsWith("> Dark mode\n")).toBe(true);
  });

  it("reads well with no feedback at all", () => {
    const md = buildReport({ votes: [], comments: [], reviews: [] }, [], "2026-10-02");
    expect(md).toContain("No task has three voters yet.");
    expect(md).toContain("## Quest comments (0)\n\nNone yet.");
    expect(md).toContain("## App reviews (0)\n\nNone yet.");
  });
});
