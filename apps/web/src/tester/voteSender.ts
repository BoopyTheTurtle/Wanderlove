import type { Vote } from "./feedbackState";

// Sending task votes (docs/tester-feedback.md, section 2.1). A vote that fails to send stays on screen and goes again
// once, on the next tap or the next task; a second failure drops it quietly.

export type SendVote = (taskId: string, vote: Vote) => Promise<void>;
export type LoadVotes = (taskIds: string[]) => Promise<Record<string, Vote>>;

export class VoteSender {
  private pending: { taskId: string; vote: Vote } | null = null;

  constructor(private readonly send: SendVote) {}

  // Retries the waiting vote first, unless this one replaces it, then sends this one. Never throws.
  async vote(taskId: string, vote: Vote): Promise<void> {
    await this.retry(taskId);
    try {
      await this.send(taskId, vote);
    } catch {
      this.pending = { taskId, vote };
    }
  }

  // Sends the vote that failed, once. `replacedFor` names a task whose new vote supersedes a waiting one.
  async retry(replacedFor?: string): Promise<void> {
    const waiting = this.pending;
    this.pending = null;
    if (!waiting || waiting.taskId === replacedFor) return;
    try {
      await this.send(waiting.taskId, waiting.vote);
    } catch {
      // Tried twice: voting is never worth interrupting a walk.
    }
  }

  // The vote still waiting to send for a task, if any.
  waiting(taskId: string): Vote | undefined {
    return this.pending?.taskId === taskId ? this.pending.vote : undefined;
  }
}

// What a task card shows on opening: a vote still waiting to send wins over the saved one. Opening a task is the
// "next task" that retries a waiting vote, so the retry goes first and the saved vote reads after it. Null when the
// saved vote can't be read; the buttons then start empty.
export async function openTaskVote(sender: VoteSender, load: LoadVotes, taskId: string): Promise<Vote | null> {
  const waiting = sender.waiting(taskId);
  await sender.retry();
  try {
    const saved = (await load([taskId]))[taskId] ?? 0;
    return waiting ?? saved;
  } catch {
    return waiting ?? null;
  }
}
