# Private trails: database design

Status: database side built September 30, 2026 (safety batch, wave 1, piece D); the app switches over in wave 2.
Owner: Edgar.

This design turns decisions 1 to 7 of the [abuse threat model](research/abuse-threat-model.md) (section 6) into schema.
Five migrations add it, from `20260930150000_private_trails.sql` to `20260930190000_recovery_viewed.sql`. Every
addition is optional: the app deployed today keeps its calls, its plain snapshots, and its OSM stop IDs, and wave 2
moves to the new paths one by one. The last section lists what a cleanup migration can then remove.

## 1. Sealed trails

A sealed run keeps its trail encrypted with the run key, the AES-GCM key the phones already share for photos
([photo encryption](photo-encryption.md), section 2). The server then holds no place, no prompt, and no trail name it
can read. `trail_runs` gains five columns:

| Column                                | Holds                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `details_ciphertext`, `details_nonce` | The whole trail as the phone needs it to walk: stops, places, radii, prompts, images |
| `summary_ciphertext`, `summary_nonce` | What history keeps: trail name, stop names in order, kind. No coordinates            |
| `stop_count`                          | The number of stops, 1 to 99, in plain text                                          |

A sealed run has a null `trail_snapshot` and the `trail_id` `private`; a check constraint holds each sealed run to that
shape, and a plain run to the old one. The snapshot's rule against `start` and `path` stays as it was. The phone binds
each ciphertext to its run and its purpose by passing `"<run_id>:details"` or `"<run_id>:summary"` as AES-GCM
additional data, so nobody can swap one run's details into another. The date needs no sealing: `started_at` already
carries it.

A sealed run's stops are `s1` to `s<stop_count>`, in trail order. `stop_completions` and `photos` key on these IDs, and
`private.run_has_stop` accepts them for a sealed run and nothing else. The phone maps each position back to its place
inside the decrypted details. An `s3` completion tells the server only that a couple reached their third stop, not
where.

**Special quests use the same scheme.** The Sherlock trail is public, so sealing its stops hides little by itself, but
its plain `trail_id` names the neighbourhood where a couple walks. One code path for every run also keeps the album and
Activity simpler. The album recognises Sherlock from the decrypted details instead of `trail_id`.

## 2. Joining by choice

`start_run` gains `p_partner`, with three values:

| Value            | Members at start   | Key copies         | Abandons                           |
| ---------------- | ------------------ | ------------------ | ---------------------------------- |
| `join` (default) | caller and partner | caller and partner | every open run of either, as today |
| `invite`         | caller             | caller and partner | the caller's open runs only        |
| `none` (Just me) | caller             | caller             | the caller's open runs only        |

With `invite`, the partner gets a row in the new `run_invites` table. The starting phone wraps the partner's copy of the
key at start, since it alone holds the key and the partner may accept after it goes offline. The copy opens nothing on
its own: every run, stop, photo, and bucket policy asks for membership, and `accept_run` alone grants it.

- `accept_run(p_run_id)` returns `joined`, or `gone` when the run has ended, the couple has unlinked, or the invitation
  was declined. Joining abandons the invitee's other open runs, so each person walks one run at a time.
- `decline_run(p_run_id)` drops the invitation and the invitee's copy of the key. Calling it twice does no harm.
- Only the invitee reads `run_invites`, and only while the run is open and the couple lasts. The starter sees members
  alone, so an invitation still pending and one declined look the same from their side, and "not this time" stays a
  neutral answer.

## 3. Just me

`p_partner => 'none'` starts a run whose only member is the caller, even while linked. It belongs to no couple, so an
unlink leaves it open and its grace window unchanged. The partner reads no row of it: not the run, its members, its
completions, its key, or an invitation. The partner's profile view changes neither, because `can_see_profile` counts
only shared runs.

Starting a Just me run abandons the caller's own open runs, including a shared one they were walking; the partner then
sees that shared run end, as when the caller leaves it today. It never touches a run the partner walks alone. One gap
stays while the old default lives: a `join` start by the partner abandons the walker's Just me run, because `join`
enrols both people. Wave 2 retires `join`, which closes the gap.

## 4. History after a month

When a run's photos expire, `purge_photos` now also trims the run to its history. Edgar asked to "keep a history of
trails done together regardless", so the run row, its stop count, its summary, and its day remain. The trim:

- drops the sealed details;
- rounds the run's start and end, its completion times, and its key rows' times down to the day, in UTC;
- abandons a run still open when its photos expire, as of 30 days after its start, since it can no longer be walked;
- drops any open invitation, and any key copy held by someone who never joined.

A plain run from before sealing keeps its name, kind, cover, duration, distance, and stop names. It loses its area,
description, coordinates, prompts, eyebrows, and stop images. Its stops become `s1` to `sN` in trail order, in the
snapshot and in its completions alike, since an OSM ID names the exact place. Today's app parses every stored stop for a
position and a radius, so a trimmed stop keeps its radius and reads `lat 0, lng 0`. Wave 2 shows a trimmed run's date
in UTC and treats a run with `photos_purged_at` set as having no map.

The trim runs inside `purge_photos` on every expired run not yet stamped, so the daily job needs no change. It is
idempotent, and the migration trims the runs the purge had already stamped. `expired_photos` and `purge_photos` stay
callable by the service role alone.

## 5. Quiet unlink

`private.can_add_photo` now refuses any run of a couple that has ended, so an unlink also closes the 24-hour photo
window on trails the couple just finished. Runs without a couple, solo and Just me, keep their window.

`unlink` no longer records who ended the link. The migration clears every stored `couples.ended_by` and withdraws read
access to the column; members read `id`, `created_at`, and `ended_at` only. Nothing in the app read the column. The
"You are no longer linked" dialog lives in the app, and wave 2 removes it.

## 6. Both sides confirm a link

The new path adds the inviter's confirmation to linking:

1. The invitee calls `redeem_invite_pending(p_code)`. It runs the same checks, attempt limit, and statuses as
   `redeem_invite`, but returns `pending` instead of `linked`. It uses up the invite and writes a `link_requests` row,
   which lapses after 24 hours. Each invitee has at most one open request.
2. The inviter's phone reads the request and asks "Emma used your invite. Link?" While the request is open, each side
   sees the other's profile card, so the inviter can also check the invitee's key.
3. `confirm_link(p_request)` makes the couple and returns `linked`, or `invalid`, `expired`, or `already_linked`. Only
   the inviter may confirm.
4. `decline_link(p_request)` lets either side drop the request.

`redeem_invite` still links at once for today's app.

## 7. Recovery code viewed on

`user_keys.recovery_viewed_at` records when the current recovery code was first shown. The phone calls
`mark_recovery_viewed()` as it shows the code, and Profile shows the date. Only the owner reads the column, and nobody
writes it directly: the function records the first viewing and never clears it, and a new recovery code clears it,
since nobody has seen that code yet. A code someone else read first therefore shows a date its owner doesn't
recognise.

## 8. Call shapes for wave 2

| Task                | Today's call (still works)                            | Wave 2's call                                                                                                             |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Start a shared run  | `start_run(p_trail_id, p_snapshot, p_keys, p_run_id)` | `start_run('private', null, p_keys, p_run_id, p_partner => 'invite', p_details…, p_summary…, p_stop_count)`               |
| Start alone, linked | none                                                  | the same with `p_partner => 'none'` and the caller's wrap only                                                            |
| Join a run          | automatic                                             | read `run_invites`, then `accept_run(p_run_id)` or `decline_run(p_run_id)`                                                |
| Complete a stop     | upsert `stop_completions` with the OSM stop ID        | the same with `s<position>`                                                                                               |
| Read a run          | `trail_snapshot`                                      | `details_ciphertext` and `summary_ciphertext`, decrypted with the run key; `summary` alone once `photos_purged_at` is set |
| Link                | `redeem_invite(p_code)`                               | `redeem_invite_pending(p_code)`, then the inviter's `confirm_link` or either side's `decline_link`                        |
| Unlink              | `unlink()`                                            | unchanged; drop the "no longer linked" dialog                                                                             |
| Show recovery code  | nothing recorded                                      | `mark_recovery_viewed()`, and read `recovery_viewed_at`                                                                   |

Wave 2 needs one more change in `lib/keys.ts`: the partner re-share must skip runs the caller holds a key copy for but
has not joined, since `share_run_keys` refuses a non-member.

## 9. Cleanup after wave 2

Once every phone runs wave 2, a cleanup migration can remove:

- `start_run`'s `join` mode, then its default, and plain snapshots for new runs (`p_snapshot` must be null);
- `redeem_invite`, once no deployed app calls it;
- the column `couples.ended_by`;
- `private.run_has_stop`'s branch for plain snapshots, once the last plain run is trimmed (about a month after the
  switch) and every trimmed run carries `s` IDs; the check constraint's plain shape could then go too, if old runs are
  migrated to sealed summaries or dropped;
- the `lat 0, lng 0` placeholders in trimmed snapshots.

## 10. Decisions for Edgar

1. **`trail_id` on sealed runs.** The schema forces `private`, so the server can't tell a Sherlock walk from a
   generated one. If points for special quests (roadmap stage 7) need the server to confirm which quest a couple
   finished, relax the check for curated trails.
2. **Who completed a stop.** The threat model (L3, M2) also suggests dropping `completed_by` at the month's trim.
   Nothing here does it, since today's app reads the column. It is a small addition to `private.trim_runs` once wave
   2 stops showing "who completed".
3. **What an invitation shows.** The invitee reads only that the partner started a run. Showing the trail name before
   joining needs the sealed summary readable by the invitee: a small policy change.
4. **Stale key rewrites after unlink (P4).** An ex can still rewrite the other's copy of a shared run's key through
   `share_run_keys`. The threat model rates it low; closing it takes one more check in that function.
5. **Dates in UTC.** The trim keeps the walk's day in UTC, so a Riga walk that started between midnight and 03:00
   local time moves to the day before. Rounding to local days would need each couple's time zone on the server.
