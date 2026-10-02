# Tester feedback: task votes, quest comments, and app reviews

Status: draft, October 2, 2026. Owner: Edgar. Belongs to the [internal build](internal-build.md) and the
[MVP roadmap](mvp-roadmap.md); removed before public launch.

Early testers get three ways to tell us what they think: a vote on each task, a comment box at the end of each quest,
and a review form in Profile. The feature sits beside the app, never inside it: nothing else reads its data, and one
switch plus one migration remove it.

## 1. Goals

- Learn which tasks work and which fall flat, across many quests, without asking testers to write anything.
- Hear testers' own words about a quest while it is fresh, and about the app as a whole.
- Store no more than we need, and show Edgar the feedback without the names behind it.
- Remove the whole feature in an hour, with no change to any other feature's code or data.

## 2. What testers see

### 2.1 Task votes

Each task card on the quest task screen carries two small buttons in its top right corner: thumbs up and thumbs down.
They sit level with the eyebrow line, so the title keeps its width.

- **Look.** Outline icons in `--muted` at about 60 % opacity, 20 px, inside 40 px tap targets. A chosen vote fills
  its icon in a soft tint (`--brand-soft` for up, a muted `--coral` for down) and the other stays outline. No counts, no colour on the
  card itself, no animation beyond a short fade.
- **Behaviour.** A tap casts the vote; a tap on the other icon switches it; a tap on the chosen icon clears it. Votes
  belong to the tester, not the couple, so partners vote apart and never see each other's vote. The tester can vote
  before or after doing the task, and after skipping it.
- **Failure.** A vote that fails to send keeps its state on screen and retries once on the next tap or the next task.
  It never shows an error over the task; voting is never worth interrupting a walk.
- **Accessibility.** Labels "Good task" and "Not for us", each with `aria-pressed`.

### 2.2 Quest comment box

The quest complete screen (and the left-early version) gains a card below the points and above the album:
**"How was this quest?"** with one text area and a **Send** button.

- **Placeholder.** One open question, picked at random each time the screen opens, from the list in section 2.4.
  A small **Another question** link swaps it. The placeholder only prompts; a tester may write about anything.
- **Limits.** Up to 1,000 characters, with a counter from 800. Empty text cannot be sent.
- **After sending.** The card collapses to "Thanks — we read every one." Each tester can send one comment per quest;
  the partner sends their own.
- **Optional, always.** Leaving the screen without writing loses nothing and asks nothing.

### 2.3 App review in Profile

Profile gains a card titled **"Tell us what you think"** directly below **Your quests**, so it sits between Your
quests and Your phones (the conditional **Your album** card follows it when shown).

Three text areas, each optional, each up to 1,000 characters:

| Field                  | Placeholder                                   |
| ---------------------- | --------------------------------------------- |
| The app overall        | What would you tell a friend about Wannadoo?  |
| What you like          | Which part would you miss if we took it away? |
| What you'd like to see | If you could add one thing, what would it be? |

A **Send** button activates once any field holds text. After sending, the fields clear and a note reads "Thanks. Send
another whenever something comes to mind." Testers may send as many reviews as they like.

### 2.4 Placeholder questions for the quest comment

Each question asks about the experience, not the relationship, so testers aren't nudged to write down private matters.

1. Which moment of this quest would you want to repeat?
2. Was there a task you'd swap out? What would you put in its place?
3. When did you forget you were using an app?
4. Did the route feel right for the two of you? What would have made it better?
5. Which task surprised you, and how?
6. Was anything awkward, confusing, or too long?
7. What would make you want to walk another quest this week?
8. If you could change one stop, which would it be and why?
9. How did the pace feel: rushed, relaxed, or somewhere in between?
10. What did you talk about between stops that the app didn't ask about?
11. Was there a moment you nearly gave up? What kept you going?
12. What would you tell the person who wrote these tasks?

The solo ("Just me") version replaces "the two of you" with "you" in question 4 and drops question 10.

## 3. Data

### 3.1 What we store

All three tables live in a separate schema, `tester_feedback`, which the Data API does not expose. The app reaches them
only through four `security definer` functions in `public`, each prefixed `tester_`.

| Table            | Columns                                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `task_votes`     | `user_id`, `task_id`, `vote` (−1 or 1), `day` (date of the last change); primary key (`user_id`, `task_id`)                                 |
| `quest_comments` | `id`, `user_id`, `quest_ref`, `body`, `question` (the placeholder shown), `mode` (`together` or `solo`), `tasks_done`, `app_version`, `day` |
| `app_reviews`    | `id`, `user_id`, `overall`, `likes`, `wishes`, `app_version`, `day`                                                                         |

Dates are rounded to the day, as elsewhere in the app. No table records a run ID, a trail, a stop, a place, a partner,
or a couple: a vote or comment never says where or with whom. `user_id` references `auth.users` with
`on delete cascade`, so deleting an account deletes its feedback.

`user_id` stays because it does three jobs that need it: one vote per tester per task, one comment per tester per quest,
and the right to erase. It never leaves the database: no function returns it, and the reporting views drop it. This
makes the data pseudonymous rather than anonymous in law, and the tester notice says so (section 5).

A comment's one-per-quest rule needs a quest reference that names no run. The phone sends a hash of the run ID and the
user ID (`sha256(run_id || user_id)`); the server stores it in `quest_comments.quest_ref` with a unique index on
(`user_id`, `quest_ref`). The hash cannot be turned back into the run.

### 3.2 Functions

| Function                                  | Does                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tester_vote_task(p_task_id, p_vote)`     | Upserts the caller's vote; `p_vote` of 0 deletes it. Checks `p_task_id` against the pattern `^[a-z]+-\d{3}$` |
| `tester_my_task_votes(p_task_ids text[])` | Returns the caller's votes for the given tasks, so the card shows its state                                  |
| `tester_send_quest_comment(...)`          | Inserts one comment; refuses a second for the same `quest_ref`                                               |
| `tester_send_app_review(...)`             | Inserts one review; refuses one with every field empty                                                       |

Each function requires a signed-in caller, trims text, enforces the 1,000-character limit, and refuses more than 20
comments or reviews per tester per day. A migration revokes the default grants on every table, as the repository's
convention requires, and grants `execute` on the four functions to `authenticated` only.

### 3.3 Reading the results

Edgar reads feedback in the Supabase dashboard through three views in `tester_feedback`, none of which show `user_id`:

- `task_vote_totals`: `task_id`, `ups`, `downs`, `net`, `voters`, ordered by `net`.
- `quest_comment_feed`: `day`, `mode`, `tasks_done`, `question`, `body`, newest first.
- `app_review_feed`: `day`, `overall`, `likes`, `wishes`, newest first.

`task_vote_totals` hides any task with fewer than three voters, so a tester can't be picked out from a pair of votes.

The database knows task IDs, not task text. A script, `npm run feedback:report`, joins `task_vote_totals` with the task
pool in `@wannadoo/core` and writes `tools/feedback-report/out/<date>.md`: every task with its category, text, and
votes, plus the comments and reviews below. It reads with the `SUPABASE_DB_URL` connection string from the
environment, and `out/` is git-ignored, since it holds testers' words.

## 4. Keeping it removable

Five rules keep the feature separate:

1. **One switch.** `TESTER_FEEDBACK_ENABLED` in `apps/web/src/features.ts` gates every mount point. Off, the app
   renders exactly as it does today.
2. **One folder.** Components live in `apps/web/src/tester/` with their own `tester-feedback.css`; the backend wrapper
   is `apps/web/src/lib/testerFeedback.ts`, since only `lib/*` may import supabase-js.
3. **Three mount points,** each a single line: the vote buttons in `QuestTaskScreen`, the comment card in
   `CompleteScreen`, and the review card in `Settings`. Each component takes plain props and returns `null` when the
   switch is off.
4. **Nothing reads it.** No other table, function, view, point, stat, or screen depends on the feedback tables, and
   `packages/core` stays untouched. Votes never affect task selection.
5. **One schema.** Every table, view, and index sits in `tester_feedback`; every function carries the `tester_` prefix.

**Removal checklist:**

1. Export the last report with `npm run feedback:report`.
2. Set the switch off, delete `apps/web/src/tester/`, `lib/testerFeedback.ts`, the three mount lines, and
   `tools/feedback-report`.
3. Add a migration that drops schema `tester_feedback` with `cascade` and the four `tester_` functions, and delete the
   matching pgTAP file.
4. Remove the feedback paragraph from the tester notice and bump its version.
5. Run `npm run check`.

## 5. Tester notice [Legal]

Collecting feedback is new processing, so the notice needs a paragraph and a version bump to `tester-v3`, which the
update gate from PR 76 shows to every current tester. Proposed text:

> **Feedback.** If you vote on a task or write to us, we store your vote or words with your account, the app version,
> and the day, but never the trail, place, or partner. We read feedback without names, and a task's votes stay hidden
> until three testers have voted on it. Deleting your account deletes your feedback. We delete all feedback when
> testing ends.

## 6. Tests

- **pgTAP** (`supabase/tests/tester_feedback.test.sql`): a tester votes, switches, and clears a vote; reads only their
  own votes; a stranger can't read another tester's votes; nobody can select from the tables or views through the
  Data API; a second comment for the same quest fails; the length and daily limits hold; an account deletion cascades.
- **Vitest:** the vote buttons cycle through up, down, and none; a failed send keeps the state; the comment card sends
  once and collapses; the review form stays disabled while empty; every component renders nothing with the switch off.
- **By hand at 390 px:** the vote buttons sit clear of the title on the longest task; the comment card and review card
  read well on the gradient and in Profile.

## 7. Open questions

1. **Votes when skipped.** Should a vote on a skipped task count apart from one on a done task? Recording `skipped`
   adds a column and a little linkage; the per-pair task history already counts skips.
2. **Reply to testers.** Should Edgar be able to answer a comment? That needs the user ID in his view, which this spec
   rules out. A visible "Email us at support@wannadoo.app" line under the review card covers it for now.
3. **End of testing.** When does the feedback get deleted: at public launch, or after a fixed period such as three
   months?
