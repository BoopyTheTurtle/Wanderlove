import { TesterFeedbackError } from "../lib/testerFeedback";
import type { QuestComment } from "../lib/testerFeedback";
import type { QuestMode } from "./questions";

// The quest comment's plumbing (docs/tester-feedback.md, section 2.2): one comment per tester per quest. The phone
// remembers the quest reference (a hash that names no run) of each comment it sent, so the card stays collapsed when
// the screen opens again.

// Local storage: an array of quest references, newest last.
export const COMMENTED_KEY = "wannadoo_tester_commented";
// Enough to cover every quest a tester reopens; older ones fall off, and the server still refuses a second comment.
const KEEP = 100;

type Store = Pick<Storage, "getItem" | "setItem">;

function readSent(store: Store): string[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(COMMENTED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((ref): ref is string => typeof ref === "string") : [];
  } catch {
    return [];
  }
}

export function commentSent(ref: string, store: Store): boolean {
  return readSent(store).includes(ref);
}

export function rememberComment(ref: string, store: Store): void {
  const sent = readSent(store).filter((r) => r !== ref);
  sent.push(ref);
  try {
    store.setItem(COMMENTED_KEY, JSON.stringify(sent.slice(-KEEP)));
  } catch {
    // Storage full or blocked: the server still allows one comment per quest.
  }
}

export type QuestCommentContext = {
  runId: string;
  userId: string;
  mode: QuestMode;
  tasksDone?: number;
  appVersion?: string;
};

export type CommentDeps = {
  send: (comment: QuestComment) => Promise<void>;
  questRef: (runId: string, userId: string) => Promise<string>;
  store: Store;
};

// Sends the comment and remembers the quest. A comment the server already holds (sent from this phone before the
// device forgot, or a retry after a lost answer) counts as sent. Any other failure throws, so the card offers Send
// again.
export async function sendComment(
  context: QuestCommentContext,
  body: string,
  question: string,
  deps: CommentDeps,
): Promise<void> {
  try {
    await deps.send({ ...context, body, question });
  } catch (error) {
    if (!(error instanceof TesterFeedbackError && error.code === "already_sent")) throw error;
  }
  rememberComment(await deps.questRef(context.runId, context.userId), deps.store);
}
