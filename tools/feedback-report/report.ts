// Builds the tester feedback report (docs/tester-feedback.md, section 3.3) from the three tester_feedback views and
// the task pool. Pure: main.ts reads the database and writes the file.
import type { QuestTask } from "@wannadoo/core";

// One row of each view, as main.ts selects it (day as text, YYYY-MM-DD).
export type VoteTotal = { task_id: string; ups: number; downs: number; net: number; voters: number };
export type CommentRow = {
  day: string;
  mode: string;
  tasks_done: number | null;
  question: string | null;
  body: string;
};
export type ReviewRow = { day: string; overall: string | null; likes: string | null; wishes: string | null };

export type FeedbackRows = { votes: VoteTotal[]; comments: CommentRow[]; reviews: ReviewRow[] };

const CATEGORY: Record<QuestTask["category"], string> = {
  intro: "Warm-up",
  silly: "Silly game",
  deep: "Deep talk",
  wrapup: "Wrap-up",
};

// Text fit for one table cell: no line breaks, no column breaks.
function cell(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

// A tester's words as a block quote, line breaks kept.
function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

// Every task in the pool with its votes: first the tasks the view shows (three voters or more), worst first, as the
// view orders them; then the rest of the pool. A voted task the pool no longer holds still shows, marked as such.
export function voteSection(votes: VoteTotal[], pool: readonly QuestTask[]): string {
  const byId = new Map(pool.map((task) => [task.id, task]));
  const voted = new Set(votes.map((v) => v.task_id));
  const lines = ["## Task votes", ""];

  if (votes.length === 0) {
    lines.push("No task has three voters yet.", "");
  } else {
    lines.push("| Task | Category | Text | Up | Down | Net | Voters |", "| --- | --- | --- | --: | --: | --: | --: |");
    for (const v of votes) {
      const task = byId.get(v.task_id);
      const text = task ? `**${cell(task.title)}** ${cell(task.prompt)}` : "_Not in the task pool_";
      const category = task ? CATEGORY[task.category] : "";
      lines.push(`| ${v.task_id} | ${category} | ${text} | ${v.ups} | ${v.downs} | ${signed(v.net)} | ${v.voters} |`);
    }
    lines.push("");
  }

  const rest = pool.filter((task) => !voted.has(task.id));
  if (rest.length > 0) {
    lines.push(`### Fewer than three voters (${rest.length})`, "", "| Task | Category | Text |", "| --- | --- | --- |");
    for (const task of rest) {
      lines.push(`| ${task.id} | ${CATEGORY[task.category]} | **${cell(task.title)}** ${cell(task.prompt)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function commentSection(comments: CommentRow[]): string {
  const lines = [`## Quest comments (${comments.length})`, ""];
  if (comments.length === 0) lines.push("None yet.", "");
  for (const c of comments) {
    const done = c.tasks_done === null ? "" : `, ${c.tasks_done} ${c.tasks_done === 1 ? "task" : "tasks"} done`;
    lines.push(`### ${c.day}, ${c.mode}${done}`, "");
    if (c.question) lines.push(`_Prompt: ${cell(c.question)}_`, "");
    lines.push(quote(c.body), "");
  }
  return lines.join("\n");
}

export function reviewSection(reviews: ReviewRow[]): string {
  const lines = [`## App reviews (${reviews.length})`, ""];
  if (reviews.length === 0) lines.push("None yet.", "");
  for (const r of reviews) {
    lines.push(`### ${r.day}`, "");
    const fields: [string, string | null][] = [
      ["The app overall", r.overall],
      ["What you like", r.likes],
      ["What you'd like to see", r.wishes],
    ];
    for (const [label, text] of fields) {
      if (text) lines.push(`**${label}**`, "", quote(text), "");
    }
  }
  return lines.join("\n");
}

// The whole report. `date` is the day it was written, YYYY-MM-DD.
export function buildReport(rows: FeedbackRows, pool: readonly QuestTask[], date: string): string {
  return [
    `# Tester feedback, ${date}`,
    "",
    "Testers' own words: keep this file out of git and delete it when testing ends.",
    "",
    voteSection(rows.votes, pool),
    commentSection(rows.comments),
    reviewSection(rows.reviews),
  ]
    .join("\n")
    .trimEnd()
    .concat("\n");
}
