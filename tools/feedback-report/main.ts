// npm run feedback:report: reads the tester_feedback views with SUPABASE_DB_URL and writes out/<date>.md. See
// README.md in this folder. Run by vite-node, which strips the types; report.ts holds the tested logic.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { questTaskPool } from "@wannadoo/core";
import { buildReport } from "./report.ts";
import type { CommentRow, ReviewRow, VoteTotal } from "./report.ts";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "Set SUPABASE_DB_URL to the database connection string, for example the local stack's from `supabase status`.",
  );
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [votes, comments, reviews] = await Promise.all([
    sql<VoteTotal[]>`select task_id, ups, downs, net, voters from tester_feedback.task_vote_totals`,
    sql<CommentRow[]>`select day::text, mode, tasks_done, question, body from tester_feedback.quest_comment_feed`,
    sql<ReviewRow[]>`select day::text, overall, likes, wishes from tester_feedback.app_review_feed`,
  ]);
  const date = new Date().toISOString().slice(0, 10);
  const out = join(dirname(fileURLToPath(import.meta.url)), "out");
  mkdirSync(out, { recursive: true });
  const file = join(out, `${date}.md`);
  writeFileSync(file, buildReport({ votes, comments, reviews }, questTaskPool, date));
  console.log(`Wrote ${file}: ${votes.length} voted tasks, ${comments.length} comments, ${reviews.length} reviews.`);
} finally {
  await sql.end();
}
