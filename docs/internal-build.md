# Internal build: sign-in, linking, and photos

Status: in progress since September 28, 2026; phases 0 to 5 and the MVP built, two-phone checks and hand-out next (see [Progress](#progress)). Owner: Edgar. Companion to [accounts-roadmap.md](accounts-roadmap.md).

This build puts real accounts in front of the team and a few friendly testers before the full MVP. Testers sign in with
an emailed code, link to a partner, upload photos at each stop, and save the photos and a generated album to their
phone. It uses the main spec's schema and code, so every line carries into the MVP; it skips the public-launch work.

Tags follow the main spec: **[Agent]**, **[You]**, **[Legal]**.

## Progress

Last updated October 2, 2026. Resume from **Next** below.

**Done:**

- **Phase 0.** Supabase project `wannadoo-staging` (ref `zejhqogkxcyyeoalrjff`) runs in Frankfurt, with the Data API on,
  automatic table exposure off, and automatic RLS on. Docker Desktop and the Supabase CLI run locally.
- **Email.** `wannadoo.app` is registered at Porkbun, which forwards `admin@`, `privacy@`, and `support@`. Resend (EU
  region) sends from `hello@wannadoo.app` through Supabase's SMTP settings; SPF, DKIM, and one DMARC record (`p=none`)
  are live. The Magic Link template shows the six-digit code.
- **URLs and keys.** Supabase's redirect URLs cover production, Vercel previews, `wannadoo.app`, and `localhost:5173`.
  Vercel holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Site URL.** Supabase's Site URL is `https://www.wannadoo.app`, and the redirect URLs include it.
- **Domain.** Testers use `https://www.wannadoo.app`; the bare `wannadoo.app` redirects there. Vercel attaches the domain
  to the `chore/repo-structure` branch as a Preview domain, so it serves the latest merge. Switch it back to Production
  once the build reaches `main`. Porkbun's MX and TXT records (forwarding, SPF, DKIM, DMARC) are untouched.
- **Phase 1.** The migration, RLS, RPCs, `photos` bucket, seed, and 70 pgTAP tests are merged into
  `chore/repo-structure`. The tests pass locally, and the migration is deployed to the online project.
- **Deploys.** The `Deploy migrations` workflow runs `supabase db push` on every push to `chore/repo-structure` that
  touches `supabase/migrations`. It reads one secret, `SUPABASE_DB_URL` (session pooler string); the Management API token
  approach was dropped because `supabase link` needed too many permissions.
- **Local env.** `apps/web/.env.local` holds the URL and the `sb_publishable_...` key under `VITE_SUPABASE_ANON_KEY`.
- **Anonymous access.** On September 29, 58 probes with the publishable key hit the online project, and all were
  refused. They covered select, insert, update, and delete on every table and `profile_cards`, all five RPCs, the
  `private` schema, and listing, uploading, deleting, and public URLs in the `photos` bucket.
- **Supabase settings.** Confirmed September 29: the DPA is signed, auth emails per hour sit near 100, email OTP expiry
  is 600 seconds, and the **Confirm signup** template shows `{{ .Token }}`. Resend's DPA has no signing step; it
  applies automatically under Resend's terms. **Email OTP Length** is 6; it was 8 until September 29.
- **Phase 2.** Merged September 29 (PRs 9–12): email-code and magic-link sign-in, onboarding with a display name and the
  tester-notice tick box (`tester-v1`), sign-out on this device, a dev-only switcher for the seeded users, and the
  approved tester notice at `/tester-notice`. Edgar signed in, onboarded, signed out, and signed in again to the same
  account on the online project, in desktop Firefox and on an Android phone.
- **Profile backfill.** Accounts created before the schema reached the online project had no `profiles` row, so the app
  could not load them. Migration `20260929120000_backfill_profiles.sql` fixed that and is deployed.
- **Phase 3.** Merged September 29 (PRs 13–15), built in two waves of parallel agents: `peek_invite` so the invitee
  sees who invited them, a Settings screen behind the Profile tab, and partner linking through Supabase. The partner
  screen shows an invite QR code and share link, a typed-code fallback, and "Walk solo for now"; `/link/<code>`
  survives sign-in; the partner reloads when the app returns to the foreground. Edgar linked an iPhone and a second
  phone by QR on `www.wannadoo.app`, with a new second account, and unlinked them.
- **Phase 4 code.** Merged September 29 (PRs 16–18), in two waves: `lib/runs.ts` with a stop-only snapshot,
  `lib/photos.ts` (2048 px JPEG, EXIF and GPS stripped, orientation kept, signed URLs, delete own), a camera component
  with retry, and the app rewired to them. Photo capture is back, with **Skip photo**; both partners add photos;
  progress syncs on focus and every 15 seconds; the album loads from the server; an unlinked run ends on both phones.
  Verified locally with two sessions; the two-phone test (4.5) is Edgar's.
- **Photo grace window.** PR 19: run members add photos for 24 hours after a trail finishes, so the partner can still
  add theirs at the last stop; the complete screens offer **Add a photo** per stop meanwhile. Deployed.
- **Partner sync.** PR 20, from Edgar's first two-phone test: the phone that scanned the invite never saw its partner
  start a trail, because the app checked only on refocus or during an open trail. It now checks the partner and the
  trail every 10 seconds while in view and opens the map with "Daniel started …". `trail_runs.started_by` records the
  starter, so a user's own start on another device is joined silently. Edgar confirmed saved photos carry no metadata.
- **Scanner, downloads, encryption groundwork.** PRs 21–24, merged September 30: an in-app QR scanner (BarcodeDetector,
  jsQR on iPhones); **Save all photos** (share sheet on phones, a ZIP on desktop), **Save album** (1080 × 1920), and
  **Save** per photo; `lib/crypto.ts` (account keys, recovery code, run keys bound to their run, photo encryption);
  and the encryption schema (`user_keys`, `run_keys`, `start_run` with keys and a phone-chosen run ID,
  `share_run_keys`, `.bin` photos). Deployed.
- **End-to-end encrypted photos.** PRs 25–26, merged September 30. Each phone makes its keys on first open without a
  screen; the recovery code sits under Profile → **Recovery code** (Edgar: showing it at sign-up would scare users). A
  new phone unlocks with the code, or makes new keys and waits for the partner's phone to trust them and re-share past
  trails. New trails wrap a trail key for each member, and the start waits until the partner's phone has keys. Photos
  upload as `.bin` and decrypt on the phone for display, Save, the ZIP, and the album; old `.jpg` runs still work.
  Verified on the local stack with two browser origins (`localhost` and `emma.localhost`). The tester notice gained the
  encryption line. Edgar confirmed on two phones that new photos upload as `.bin` and show on both.
- **Two-phone fixes.** PR 27: a stop the partner completed now offers **On to the next stop** (or **See your album**),
  and Android downloads each photo instead of opening the share sheet; iPhones keep the share sheet. Edgar confirmed
  both on phones.
- **Wine theme.** PR 28: the whole app takes the Sherlock trail's palette (`--teal*` tokens became `--brand*`), with a
  coral-to-wine animated background. The Sherlock trail keeps its paper, stamps, and fonts; other trails can bring their
  own theme through `PhoneFrame`'s `theme`.
- **Encryption verified (E.5).** Edgar checked on September 30 that stored photos don't open in the dashboard, that
  both phones show them, that the recovery code unlocks a cleared phone, and that new keys work once trusted.
- **Security review (6.1).** Run September 30; see [security-review.md](security-review.md). The access rules hold and
  every anonymous probe was refused. PRs 29 and 30 fixed findings 1 to 4: the server refuses unencrypted trails and
  photos (migration deployed), the site sends a Content-Security-Policy and other headers, a banner offers a reload
  when a newer build is live, the recovery code shows once, and linking checks the partner's key through the invite
  and four matching emoji.
- **Invite QR and reuse.** The QR draws dark on white with a four-module quiet zone, and the phone reuses its open invite
  until it is used or has under an hour left, so revisiting the invite screen no longer cancels a link already sent.
- **Parallel work.** The `parallel-build` skill and `feature-builder` agent split complex tasks into draft PRs against
  `chore/repo-structure`; Edgar approves every merge.

**MVP, from September 30:** work continues in [mvp-roadmap.md](mvp-roadmap.md). Stage A research is drafted
(docs/research), Stage 1 is merged (PRs 31 to 33: home, Activity, and the one-month photo deletion), and so is the
safety batch, stage 1b (PRs 34 to 39): private trails, Just me, joining by choice with a waiting screen for the
starter, quiet unlink, confirmed links, and Hide from my album. Stage 2's code is merged (PRs 40 to 44): five-stop loops
of about 2 km with the A4 safety checks, daylight and season notes, the after-sunset warning with a shorter loop, quiet
stops, and a simulation script.

**October 2, afternoon: the rest of the MVP, in two waves of parallel agents (PRs 77 to 85, and this one).**

- **Wave 1:** badge and weekly-rhythm logic in core (PR 77), the push spec (PR 78), the tester feedback components
  behind `TESTER_FEEDBACK_ENABLED` (PR 79), and one backend piece (PR 80): seven migrations for the feed, rhythm,
  badges, planned walks, photo shares, relink, and tester feedback, with pgTAP tests and lib wrappers. Deployed online.
- **Wave 2:** the feed behind the bell (PR 81), the rhythm card and badges (PR 82), tester feedback wired in with
  `npm run feedback:report` (PR 83), and plan-the-next-walk and photo sharing (PR 84). PR 85 placed the cards and
  clears their device keys on **Leave this phone clean**.
- **Decisions:** the rain badge exists but stays off until live weather; the feed never reports a partner starting or
  finishing a quest (threat model X1); a share earns points only through a phone's share sheet, not a desktop
  download. The tester feedback spec is [tester-feedback.md](tester-feedback.md).

**October 1:**

- **Live routes fixed (PR 50).** About half of surprise routes failed with "Couldn't reach the map service": the
  fallback Overpass server (`overpass.private.coffee`) stopped answering, and `overpass-api.de` often answers 504 "too
  busy". Queries now start on `overpass-api.de` or `overpass.openstreetmap.fr` at random, bring in the other after 4 s
  or on failure, and retry once. The French server has no area index, so the query no longer uses `map_to_area`; the
  phone already keeps only service roads inside closed land (H5).
- **Stage 2 simulation and fixes (PR 57 and the failure-reasons PR).** The full 280-start run now gives 268 valid
  loops (Old Town and Purvciems 40/40, Sarkandaugava 37, Ķīpsala 38 in each pass, Līgatne 38 and 37 in January),
  with no check violations; it gave 246 before. The fixes: untagged fast roads give the rural note instead of a
  rejection (open question 3); school and kindergarten grounds are off limits; a start on closed land fails at once
  and says why (open question 4); the first loop guess uses a walk factor of 1.5; the router-call cap is 12; a lone far
  named place no longer blocks every fill; and the unbroken stretch along a pavement-less road as the walk leaves or
  returns to its start gets the rural note. The simulation now starts each route on the nearest way, runs its main
  pass at a fixed midday, and records why a failed start failed. The ice rule stayed: Līgatne's drops come from a real
  village pond. The 12 failures left: three Sarkandaugava starts hemmed in by Tvaika iela and the railway without a
  marked crossing, two Ķīpsala starts on a bridge (both passes), two Līgatne starts whose every loop walks along
  Brīvības iela (tagged `sidewalk=no`), and three Līgatne starts that run out of stops. Results and the new audit
  pack are in `tools/route-sim/out/live4/`.
- **UK and US starts (PR 64).** `--areas abroad` runs 10 starts each in Islington, Capitol Hill, Silver Lake, and Park
  Slope at local midday: 38 of 40 valid. Silver Lake loses two to H1 (few mapped crossings); one London start sat on
  a footway cut off from the network, 51 m from where the route began. Audit pack in `tools/route-sim/out/abroad/`.
- **Stage 8 and the October 2 changes (PRs 66 to 70, 72, 73).** The weekly leaderboard: a database with opt-in,
  random leagues of about 30, and each couple's best three quests; a League tab in place of Messages; and an opt-in
  card in Profile. Both partners say yes, either leaves alone, and neither sees whether the other has said yes. Points
  show on the totals card and after a couple's quest. Edgar chose to keep a couple's past for 90 days after an unlink:
  the same two people relinking get their totals, quest points, and name back, while the leaderboard needs both yeses
  again. Home moved to the "light trail" art, with no markers. The tester notice gained the leaderboard and the 90-day
  archive and moved to `tester-v2`. The migrations deployed online.
- **Stages 6, 7, and 11, built in three waves of parallel agents (PRs 59 to 63, 65).** Couple totals and name with a
  word filter, server-side points, stop reports that new routes avoid, and the journey map Home on Edgar's chosen
  concept. All verified in Chromium at 390 px against the local stack; the two-phone checks are Edgar's.
- **Stage 3, the quest engine (PRs 47 to 49, 51).** Task model and selection in core, a per-pair task history
  (relinking keeps it; Just me records under the player alone), a generic task screen, and the wiring: tasks travel
  sealed in the trail, and a mobility toggle in Profile drops `move` tasks. Edgar checked that relinking keeps history.
- **Stage 4, the task pool (PR 52).** 150 tasks, all signed off by Edgar: 30 introductory, 60 silly, 30 deep, 30
  wrap-up ([docs/tasks/task-pool.md](tasks/task-pool.md)). Deep tasks may touch the need beneath a conflict, in
  positive form only.
- **Stage 5, the avatar creator (PRs 53 to 56).** Layered SVG avatars in the A5 style, Randomise, an optional
  onboarding step (Skip saves a random avatar), Edit avatar in Profile, and avatars on Home and the partner screens.
  Only the owner and the current partner can read an appearance. Painterly raster layers from GPT failed a test:
  the image model redraws the head on every edit, so parts don't stack. The renderer accepts raster layers, so an
  illustrator's or Recraft's parts can replace the SVG later.

**Next:**

1. **[You]** Answer the three open questions in [tester-feedback.md](tester-feedback.md). The notice paragraph is
   signed off and live as `tester-v3`.
2. **[You]** On two phones, the new MVP pieces: the rhythm card and a goal set on one shows on the other; a finished
   quest claims its badges once and shows them in Activity; a planned walk appears in the partner's feed and either
   can cancel it; a photo share is approved, declined, and auto-approved under standing consent, and the real share
   sheet awards 20 points on iPhone and Android; task votes, the quest comment, and the Profile review send.
3. **[You]** Audit the 30 routes in `tools/route-sim/out/live4/audit/checklist.md` and the 24 in
   `tools/route-sim/out/abroad/audit/`, and say whether Līgatne's Brīvības iela really lacks a pavement.
4. **[You]** On two phones: a Together quest shows the same tasks on both; a couple name suggested on one is agreed on
   the other; the light-trail Home, totals, and points match; both join the league and see the same board; an avatar edit shows on the other phone; a new account that skips the
   avatar step gets one.
5. **[You]** On one phone: report a stop, then dismiss the report in the dashboard (online reports affect testers'
   routes); the safety note, the after-sunset card, and the close "Skip photo" and "Skip this task" buttons.
6. **[You]** Still open: the link emoji, viewing the recovery code once, the scanner under the security headers, and
   iPhone **Save**, **Save all photos**, and **Save album** (task 5.4).
7. **[You]** Hand-out (tasks 6.2 and 6.3), once the MVP is ready for more testers, after moving the live site to `main`
   (merge into `main`, point `db-deploy.yml` at it, and switch `www.wannadoo.app` to Production in Vercel).

**Lessons from phase 2:**

- **Check hosted settings against `config.toml`.** The online project sent 8-digit codes while the app and the local
  stack expected 6. When a flow first runs online, compare the dashboard's auth settings with `supabase/config.toml`.
- **A trigger covers only rows created after it.** Accounts older than the schema had no profile. Pair every
  trigger that creates rows with a backfill in the same migration.
- **Test in Firefox and on a phone, not only Chromium.** The agents' browser is Chromium, which hid a grid overflow
  that Firefox and Android Chrome showed.
- **Give each backend its own port.** With both dev servers on 5173, swapping one for the other silently moved Edgar's
  open tab to the local stack, and his codes went to Mailpit. `dev:local` now uses 5174.
- **Parallel agents paid off.** Two agents built sign-in and the tester notice in about ten minutes of wall time; review
  still caught a global sign-out and an empty username. On Windows, `git worktree remove` leaves `node_modules`
  behind; delete the folder with `rm -rf` (the skill says so).
- **The live domain is `www`.** Vercel redirects `wannadoo.app` to `www.wannadoo.app`, so Supabase's Site URL uses
  `www`.

**Lessons from phase 3:**

- **Split along file ownership, in waves.** The database piece and a props-only screen ran in parallel; the wiring
  piece waited for both, so no two agents touched the same file and nothing conflicted.
- **Reload the phone after a deploy.** The first scan failed with "No usable data found" because the phone still showed
  the previous build, whose QR held a `wannadoo://` address no app opens. Before a phone test, reload the site and
  check for a feature only the new build has.
- **Check the spec against the database before building.** The accept screen needed the inviter's name, which RLS
  hides from strangers; finding that during planning turned it into a small first-wave piece instead of a blocker.

**Notes for whoever resumes:**

- A reset database password took several minutes to reach the session pooler; until then every connection failed with
  `password authentication failed`.
- The CI `db` job runs on pull requests and on pushes to `main`; it first ran, and passed, on PR 9.
- `npm run dev` (port 5173) talks to the online project; `npm run dev:local` (port 5174) talks to the local stack.
- The local stack's sign-in email carries only the magic link, not the code. Read codes from Mailpit
  (`http://127.0.0.1:54324`) via the link, or add a local template in `supabase/config.toml`.
- **Run workflow** appears on the `Deploy migrations` page only once the workflow file reaches `main`; until then, re-run
  an earlier run instead.
- GitHub warns that `actions/checkout@v4` and `supabase/setup-cli@v1` target Node 20. The warning is harmless; bump the
  versions once newer releases exist.

## 1. Decisions

| Decision  | Choice                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Users     | The team plus friendly testers you send the URL to, about 10–20 people                                  |
| Sign-in   | Email one-time code and magic link. Any address can sign up; nobody approves accounts                   |
| Backend   | One Supabase project, `wannadoo-staging`, in `eu-central-1`. It becomes staging when the MVP starts     |
| Schema    | Section 4 of the main spec, in full, so the MVP needs no rewrite                                        |
| Downloads | Individual photos and the generated album image, both through the share sheet                           |
| Hosting   | The existing Vercel project; a Vercel preview or production URL is enough                               |
| Email     | Resend (EU) sends from `hello@wannadoo.app`; Porkbun forwards `admin@`, `privacy@`, `support@`          |
| Test data | Wiped before public launch (see open question 1)                                                        |
| Branch    | Work for this build pushes to `chore/repo-structure` (tracks `origin/chore/repo-structure`), not `main` |

## 2. Scope

**In scope:**

- Email-code sign-in for any address, sign-out, and a display name
- One onboarding screen with a single tick box: "I am 18 or older and have read the tester notice"
- Linking by invite link or QR code, and unlinking, as in main spec 6.2 and 6.3
- Trail runs saved on the server, shared between partners (main spec 6.4)
- Photo upload per stop, resized and stripped of EXIF on the phone
- Saving individual photos and the album image to the phone (main spec 6.5)
- Deleting your own photo, which removes it for both partners

**Deferred to the MVP:** Google sign-in, usernames and avatars, hiding a partner's photo, the Albums list
of past runs, in-app export and account deletion, Realtime updates, the privacy policy and terms, the DPIA, the Online
Safety Act assessment, security headers, and Supabase Pro.

## 3. Sign-in

Anyone with the URL signs in with an email address; nobody approves accounts.

1. The welcome screen asks for an email and calls `signInWithOtp({ email })`. Supabase creates the account on first
   sign-in and emails a six-digit code and a magic link.
2. The user types the code or taps the link, then finishes onboarding (section 2).
3. Every address gets the same "Check your email" message, so the screen reveals nobody's membership.

The URL is the only gate. Anyone who finds it can create an account, but they see only their own data and can link
only through an invite code, so strangers reach nobody else's photos. Supabase's built-in auth rate limits stay on.
Before a wider launch, add CAPTCHA on sign-in (Supabase supports Cloudflare Turnstile).

Supabase's built-in email sends only to members of your Supabase organisation, so testers need custom SMTP (task 0.3).

## 4. Tester notice [Legal]

You live in Latvia, so the EU GDPR governs this build, and you are the controller (main spec C1). The Data State
Inspectorate (DVI) supervises you. UK testers bring in the UK GDPR as well; its rules match the EU GDPR closely
enough that one notice covers both, with the ICO named for UK testers. A one-page notice at `/tester-notice` replaces
the privacy policy for this build. It states:

- **Who:** you, by name, and a contact address.
- **What:** email, display name, the stops you complete, your photos, and, once linked, the couple name and points. GPS
  stays on the phone; photos lose their location data before upload.
- **Why:** to test the app. Lawful basis: legitimate interests, since you share the URL only with people you ask to test.
- **Who sees it:** your linked partner sees the trails you walk together and their photos. Supabase (Frankfurt), Vercel,
  and the email provider process the data for you. Overpass, FOSSGIS, and OpenStreetMap receive your position when the
  app builds a route.
- **Weekly leaderboard:** opt-in; the couple joins when both partners say yes, and either partner alone takes it off at
  once. Leagues of about 30 couples, drawn at random each week, see only the couple name and this week's points (the
  best three finished quests). No rank, display names, avatars, locations, or photos; an unnamed couple stays off.
- **After unlinking:** each of you keeps the photos from trails you walked together. You can delete your own photos.
  The couple leaves the leaderboard at once. The server keeps the couple name, points, and totals for 90 days, then
  deletes them; if the same two people link again within 90 days, these move to the new couple, and the leaderboard
  needs both yeses again.
- **How long:** until the test ends. All test data gets deleted before public launch.
- **Your rights:** email you to see or delete your data; you answer within one month.
- **Complaints:** testers can complain to the DVI; UK testers can also go to the ICO.

A controller outside the UK may need a UK representative (UK GDPR Art. 27). The exemption for occasional, low-risk
processing likely covers a small test group; keep UK testers few and confirm the point before launch (main spec C18).

The agent drafts it from the main spec's section 9; you approve it (task 2.4).

## 5. Build plan

### Phase 0: Setup. Your time: about 1.5 hours

| #   | Task                                                                                                          | Tag           |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| 0.1 | Create a Supabase organisation and the `wannadoo-staging` project in `eu-central-1`                           | [You]         |
| 0.2 | Accept the Supabase Data Processing Addendum                                                                  | [You] [Legal] |
| 0.3 | Set up custom SMTP for Supabase: a transactional provider with a verified domain (see open question 2)        | [You]         |
| 0.4 | Install Docker Desktop and the Supabase CLI                                                                   | [You]         |
| 0.5 | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to Vercel, and the GitHub Actions secrets for migrations | [You]         |

### Phase 1: Backend. Agent: 1 day

Main spec phase 1, unchanged: migrations for the full section 4 schema, RLS on every table, the RPCs, pgTAP tests for
every rule in section 5, generated types, and CI. Only the deploy target differs: a workflow pushes migrations to the one
project on every push to `chore/repo-structure`, matching the branch decision in section 1.

**Done when:** `npm run db:test` passes locally and in CI, and a stranger's access is refused in every test.

### Phase 2: Sign-in. Agent: half a day

| #   | Task                                                                                                                 | Tag                               |
| --- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 2.1 | `lib/auth.ts`: email OTP and magic link, sign-out, session listener                                                  | [Agent]                           |
| 2.2 | Welcome and code screens; onboarding asks for a display name and shows the single tick box from section 2, at 390 px | [Agent]                           |
| 2.3 | Replace `lib/session.ts` and `WhoAmI` in production; keep a dev-only switcher that signs in as the seeded users      | [Agent]                           |
| 2.4 | Draft the tester notice from section 4 at `/tester-notice`                                                           | [Agent] drafts, [You] approve     |
| 2.5 | Set the site URL and redirect URLs (Vercel URL, previews, localhost), OTP expiry 10 minutes, and the email templates | [You], agent writes the checklist |

**Done when:** a new address signs in on a phone, finishes onboarding, and signs out, and signing in again reaches the
same account.

### Phase 3: Linking. Agent: 1 day

Main spec phase 3, including the QR code, the `/link/<code>` route, the link notice, instant unlinking, and the attempt
limit on `redeem_invite`. Email lookup goes. Reviewing the spec against the code on September 29 changed the plan:

- **The attempt limit (main spec 3.4) already exists.** Phase 1 built it into `redeem_invite`, with pgTAP tests.
- **The invitee needs the inviter's name before linking.** Main spec 6.2 shows "A wants to link with you", but a
  stranger can read neither the invite nor A's profile. A new RPC, `peek_invite(code)`, returns the inviter's display
  name and the invite's status without redeeming it, and counts failed look-ups toward the same attempt limit.
- **An invite link must survive sign-in.** Someone who opens `/link/<code>` signed out goes through sign-in and
  onboarding first; the app keeps the code on the device until then and drops it from the address bar after use.
- **The phone's camera scans the QR code.** The code holds the `/link/<code>` URL, so any camera app opens it. The
  in-app scanner goes; a field for typing the code stays as a fallback.

| #   | Task                                                                                                                      | Tag     |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| 3.1 | Migration: `peek_invite`, with pgTAP tests for the inviter, the invitee, and a stranger; regenerate types                 | [Agent] |
| 3.2 | `lib/couples.ts`: create invite, peek, redeem, unlink, and the current partner from `profile_cards`                       | [Agent] |
| 3.3 | Rework `PartnerLink.tsx`: invite QR and share link, typed-code fallback, the accept screen, and the `/link/<code>` route  | [Agent] |
| 3.4 | A settings screen behind the **Profile** tab: partner, **Unlink** with the flow from main spec 6.3, and **Sign out**      | [Agent] |
| 3.5 | Replace the stand-in partner (`lib/session.ts`) with the server's; refresh on focus so an unlink shows on the other phone | [Agent] |
| 3.6 | Approve the wording of the link notice and the unlink confirmation                                                        | [You]   |

**Decided September 29:** testers may walk solo. The partner screen offers "Walk solo for now", and Settings keeps
linking available. Edgar approved this wording (3.6):

- **Link notice:** "**Link with {name}?** Once linked, you both see the trails you walk together and their photos. If
  you unlink, you each keep the photos from trails you walked together." Buttons: **Link** / **Not now**.
- **Unlink confirmation:** "**Unlink from {name}?** You stop sharing new trails. You both keep the photos from trails
  you walked together. {name} won't get a message." Buttons: **Unlink** / **Cancel**.

**Done when:** two phones link by QR, both show each other, and either can unlink.

### Phase 4: Runs and photos. Agent: 1.5 days

Main spec tasks 4.1 to 4.4: `lib/runs.ts` with the snapshot stripped of `start` and `path`; `lib/photos.ts` with resize,
re-encode, upload, signed URLs, and delete; `App.tsx` rewired to the wrappers with refresh on focus; unit tests. Skip
`photo_hidden` in the UI; the table stays. Reviewing the spec against the code on September 29 added four points:

- **Photo capture is off.** Commit `742be40` removed it for prototyping; both challenge screens complete a stop with an
  empty photo. Phase 4 brings capture back (`<input type="file" accept="image/*" capture="environment">`).
- **The schema needs no change.** RLS already lets run members start runs through `start_run`, complete stops on active
  runs, upload to `photos/{run_id}/{photo_id}.jpg`, read through signed URLs, and delete their own photos. Several
  photos per stop are allowed; the first completion of a stop wins, so the second phone's insert must ignore the
  duplicate.
- **Photos keep their orientation.** Redrawing on a canvas strips EXIF, including the rotation tag, so the resize must
  decode with `createImageBitmap(file, { imageOrientation: "from-image" })` before drawing.
- **Unlinking abandons the active run** (`unlink()`), so both phones must drop a run that turns abandoned and say so.

| #   | Task                                                                                                                              | Tag     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 4.1 | `lib/runs.ts`: start, load the active run with its completions, complete a stop, finish, abandon; snapshot without `start`/`path` | [Agent] |
| 4.2 | `lib/photos.ts` and a capture component: resize to 2048 px, JPEG 0.8, upload, signed URLs, delete own; retry on failure           | [Agent] |
| 4.3 | Rewire `App.tsx` and the trail screens from `progress.ts` and `activeRoute.ts` to the wrappers; refresh on focus                  | [Agent] |
| 4.4 | Unit tests for the snapshot, the resize maths, and the run state                                                                  | [Agent] |
| 4.5 | Check on two phones that progress syncs, and in an EXIF viewer that a saved photo has no GPS                                      | [You]   |

**Decided September 29:** a stop needs a photo to count as done, with a small **Skip photo** option for moments that
don't suit one. Both partners may add photos at the same stop; the first photo (or skip) completes it, and the other
can still add theirs.

**Done when:** a stop completed on one phone shows on the partner's phone after refocus, and a downloaded photo carries
no GPS data in an EXIF viewer.

### Phase 5: Saving to the phone. Agent: 1 day

| #   | Task                                                                                                                             | Tag     |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 5.1 | `lib/album.ts`: the 1080 × 1920 collage on a canvas, exported as JPEG                                                            | [Agent] |
| 5.2 | `CompleteScreen.tsx`: album preview, **Save album**, and **Save all photos**, through `navigator.share` with a download fallback | [Agent] |
| 5.3 | A **Save** button on each photo at its stop, for saving one photo during the walk                                                | [Agent] |
| 5.4 | Check that "Save Image" lands in the photo library on iOS Safari and Android Chrome                                              | [You]   |

**Done when:** both phones save the album and every photo from a finished trail to their photo libraries.

### Phase 6: Hand-out. Your time: about 1 hour

| #   | Task                                                                                                       | Tag           |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| 6.1 | Run the security review on the diff: RLS, storage policies, and the anon key as the only key in the bundle | [Agent]       |
| 6.2 | Send each tester a short message with the URL and the tester notice                                        | [You]         |
| 6.3 | Keep a deletion log; handle deletion requests from the dashboard and storage within one month              | [You] [Legal] |

**Total:** about 5 agent-days and 3–4 hours of your own time. Custom SMTP and your reviews set the pace.

## 6. What carries into the MVP

Everything built here stays: the schema, RLS, tests, the `lib/*` wrappers, linking, runs, photos, and the album. The MVP
adds Google sign-in, usernames, CAPTCHA, and main spec phases 6 and 7. The staging project stays as staging,
and a new `wannadoo-prod` project starts empty.

The MVP only adds to this build:

- Google sign-in reaches the same `auth.users` rows as email; the schema stays as it is.
- Realtime, the Albums list, `photo_hidden` in the UI, export, and account deletion build on tables that already exist.
- Screens call only `lib/*`, so backend changes stay behind the wrappers.
- The pgTAP tests guard every access rule while features land.

Four rules keep it that way:

1. **`profiles.username` is nullable.** This build collects only a display name; the MVP fills usernames in without a
   migration over live rows.
2. **Consent carries a version.** The tick box stores `age_confirmed_at`, `terms_accepted_at`, and
   `terms_version = 'tester-v1'`. The MVP asks every user whose `terms_version` differs to accept the real terms.
3. **Migrations are the only path to a schema change.** A dashboard edit leaves staging and the repository out of step,
   and the MVP inherits the drift.
4. **Trail content stays in code.** Runs store `trail_id` and a stop-only snapshot, so moving trails into a table later
   adds a table and touches no run.

Test data is the one planned break: section 7, question 1, wipes it before launch for legal reasons, not technical ones.

## 7. Open questions

1. **Test data at launch.** Resolved September 30, 2026: wipe it. Keeping it would mean asking testers to accept the
   real privacy policy and migrating their accounts into production; wiping is simpler and avoids reusing data collected
   under a test notice. Plain photos from before encryption go with it.
2. **Email sender.** Resolved September 28, 2026: `wannadoo.app` bought at Porkbun, and Resend sends through Supabase's
   SMTP settings. The domain carries into the MVP.
3. **Solo testers.** Resolved September 29, 2026: yes. The link screen offers "Walk solo for now".
4. **How long the server keeps photos.** Resolved September 30, 2026: one month after a trail ends; stage 1 of the
   [MVP roadmap](mvp-roadmap.md) builds the deletion job.
