import { supabase } from "./supabase";

// Tester feedback (docs/tester-feedback.md): task votes, one comment per quest, and app reviews. Removable: nothing else
// imports this file, and the server keeps the data in its own schema, reached only through the tester_* functions.

export type TaskVote = -1 | 0 | 1;

export type TesterErrorCode =
  | "task_invalid"
  | "vote_invalid"
  | "quest_ref_invalid"
  | "mode_invalid"
  | "text_empty"
  | "text_too_long"
  | "already_sent"
  | "daily_limit";

const TESTER_ERRORS: readonly TesterErrorCode[] = [
  "task_invalid",
  "vote_invalid",
  "quest_ref_invalid",
  "mode_invalid",
  "text_empty",
  "text_too_long",
  "already_sent",
  "daily_limit",
];

// A refusal the server explains (raise ... errcode P0001).
export class TesterFeedbackError extends Error {
  constructor(readonly code: TesterErrorCode) {
    super(code);
    this.name = "TesterFeedbackError";
  }
}

export function toTesterError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && TESTER_ERRORS.includes(e.message as TesterErrorCode)) {
    return new TesterFeedbackError(e.message as TesterErrorCode);
  }
  return error;
}

// The quest reference a comment carries: hex sha256 of the run id followed by the user id, so it names no run.
export async function questRef(runId: string, userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(runId + userId));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Casts, switches, or (0) clears the caller's vote on a task.
export async function voteTask(taskId: string, vote: TaskVote): Promise<void> {
  const { error } = await supabase.rpc("tester_vote_task", { p_task_id: taskId, p_vote: vote });
  if (error) throw toTesterError(error);
}

// The caller's votes among the given tasks; a task without a vote reads 0.
export async function loadTaskVotes(taskIds: string[]): Promise<Record<string, TaskVote>> {
  const votes: Record<string, TaskVote> = Object.fromEntries(taskIds.map((id) => [id, 0 as TaskVote]));
  if (taskIds.length === 0) return votes;
  const { data, error } = await supabase.rpc("tester_my_task_votes", { p_task_ids: taskIds });
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.vote === 1 || row.vote === -1) votes[row.task_id] = row.vote;
  }
  return votes;
}

export type QuestComment = {
  runId: string;
  userId: string;
  body: string;
  question: string;
  mode: "together" | "solo";
  tasksDone?: number;
  appVersion?: string;
};

// Sends the caller's one comment on a quest; a second for the same quest throws already_sent.
export async function sendQuestComment(comment: QuestComment): Promise<void> {
  const { error } = await supabase.rpc("tester_send_quest_comment", {
    p_quest_ref: await questRef(comment.runId, comment.userId),
    p_body: comment.body,
    p_question: comment.question,
    p_mode: comment.mode,
    p_tasks_done: comment.tasksDone,
    p_app_version: comment.appVersion,
  });
  if (error) throw toTesterError(error);
}

export type AppReview = { overall: string; likes: string; wishes: string };

// Sends a review; blank fields go as nothing, and all blank throws text_empty.
export async function sendAppReview(review: AppReview, appVersion?: string): Promise<void> {
  const field = (text: string) => (text.trim() === "" ? undefined : text);
  const { error } = await supabase.rpc("tester_send_app_review", {
    p_overall: field(review.overall),
    p_likes: field(review.likes),
    p_wishes: field(review.wishes),
    p_app_version: appVersion,
  });
  if (error) throw toTesterError(error);
}
