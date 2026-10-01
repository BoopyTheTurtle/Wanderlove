// The quest task model (docs/research/task-design-guide.md §4). A quest has five stops with one task each, in the
// fixed arc intro, silly, deep, silly, wrap-up.

export type TaskCategory = "intro" | "silly" | "deep" | "wrapup";

export type TaskTag = "talk" | "move" | "voice" | "quiet" | "energetic" | "outdoors-only" | "seated-ok";

export interface QuestTask {
  // `<category>-<nnn>`; never reused or renumbered, since history keys on it.
  id: string;
  category: TaskCategory;
  title: string;
  prompt: string;
  steps: string[];
  photoHint: string;
  tags: TaskTag[];
  minutes: number;
}

// One past outcome of a task for a couple (or a solo walker). `at` is an ISO timestamp.
export type TaskHistoryEntry = {
  taskId: string;
  outcome: "done" | "skipped";
  at: string;
};
