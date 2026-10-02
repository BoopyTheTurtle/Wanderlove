# MVP roadmap: the random quest, the journey map, and play

Status: in progress, October 1, 2026: stages 1 and 1b, 3, 4, and 5 are merged; stage 2 awaits its simulation. Owner: Edgar. Follows the [internal build](internal-build.md), which delivered
accounts, linking, trails, encrypted photos, and saving.

The MVP turns Wannadoo into one repeatable ritual. A couple opens the app, taps the next point on an illustrated
journey map, and gets a fresh quest: a walking loop of about 2 km from where they stand, with five stops and one task
at each. Tasks follow a fixed arc, from a warm opener through play and depth to a light close, and no couple sees the
same task twice. Avatars, points, a weekly leaderboard, and later notifications give the ritual a reason to return.

We build one feature at a time and test each fully, on the local stack and on two phones, before starting the next.
Research and design workflows run first, in parallel, because the build stages depend on what they find.

## 1. Decisions

| Topic                  | Decision (Edgar, September 30)                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route shape            | A loop back to the start; about 2 km of real walking, return included                                                                                                                                                                                         |
| Stops                  | Five, from the user's current position each time                                                                                                                                                                                                              |
| Task arc               | Stop 1 introductory, 2 silly game, 3 deep task, 4 silly game, 5 wrap-up                                                                                                                                                                                       |
| Repeats                | A pair never gets a task it has done; a skipped task may come back once; the same person may get a task again with a new partner                                                                                                                              |
| Tasks and places       | Generic tasks first, doable at any stop; place-aware tasks later (section 5)                                                                                                                                                                                  |
| Photos                 | Each stop still takes a photo or a skip                                                                                                                                                                                                                       |
| Special quests         | Sherlock stays as the first special quest, in a repository of special quests; their triggers come later                                                                                                                                                       |
| Solo mode              | Stays, with nothing built for it; if it breaks something, it goes                                                                                                                                                                                             |
| Avatars                | Male-ish to female-ish, younger to older, hair, clothes, accessories, skin, eyes, randomise; no gender is stored                                                                                                                                              |
| Leaderboard            | Opt-in weekly leagues of about 30 random couples, by couple name only, showing a band ("top third") rather than a rank; nothing on it is reachable                                                                                                            |
| Community listening    | Themes only; no usernames, no quotes, no record of who said what                                                                                                                                                                                              |
| Push notifications     | Specified now, built with the move to a native app                                                                                                                                                                                                            |
| Photo retention        | The server keeps a trail's photos for one month after it ends, then deletes them                                                                                                                                                                              |
| Points                 | Low, per A3: 100 per finished quest, 10 per stop reached, 5 per stored photo, 20 per partner-approved share (one per quest, three a week), 30 for the week's first quest, 50 for a special quest; tasks earn none; best three quests a week count for leagues |
| Special-quest triggers | To be decided; holiday quests are certain; random and milestone triggers are candidates for surprise rewards                                                                                                                                                  |
| Journey map            | Infinite: the path extends as the couple walks                                                                                                                                                                                                                |
| Lifetime stats         | Per couple only: quests done, photos taken, challenges completed, points scored. Unlinking puts them away for 90 days: the same two people relinking get them back, anyone else starts fresh; per-user stats wait until the app supports other kinds of links |
| Task pool              | 30 introductory, 60 silly games (two per quest), 30 deep tasks, 30 wrap-ups                                                                                                                                                                                   |
| Strangers              | No task involves strangers; couples may still ask someone to take a photo on their own                                                                                                                                                                        |
| Off-limits topics      | No chores, no debates about what is fair                                                                                                                                                                                                                      |
| Mobility               | A mobility setting in Profile swaps out tasks that need movement; an adventure level comes later                                                                                                                                                              |
| Share consent          | The partner approves each shared photo by default; a setting grants standing consent, and one tap withdraws it                                                                                                                                                |
| Streaks                | None; a weekly rhythm where an empty week looks neutral                                                                                                                                                                                                       |
| Notifications          | Opt-in, with a friendly nudge to opt in after the first quest; then sparing, as A3 sets out; small relationship reminders between quests belong here                                                                                                          |
| Success measure        | Walks per couple per month, and couples still walking at three and six months; never app opens                                                                                                                                                                |
| Abuse                  | The app neither diagnoses relationships nor points to helplines; it studies how an abuser could misuse it and prevents that within reason (A6)                                                                                                                |
| Long distance          | Out of scope for the MVP; demand gets tested later                                                                                                                                                                                                            |
| Testers                | Mostly Latvia, some elsewhere in the EU, the UK, and the US                                                                                                                                                                                                   |
| Quiet stops            | Churches, memorials, and cemeteries stay, with calm tasks only; a curated exclusion list, fed by user reports, removes sites such as mass graves                                                                                                              |
| After dark             | The app warns and offers a shorter loop; the choice stays with the user                                                                                                                                                                                       |
| Rural roads            | Allowed with a warning, so rural areas still get routes                                                                                                                                                                                                       |
| Weather                | Calendar-based notes now; live weather later                                                                                                                                                                                                                  |
| Legal                  | A lawyer reviews share rewards and liability copy before public launch; points stay low until then                                                                                                                                                            |
| Quest joining          | A partner joins a started quest by choice, and a "Just me" quest stays invisible to the partner                                                                                                                                                               |
| Unlinking              | Quiet: the other phone learns at its next use of the link, nobody sees who ended it, and the photo window closes                                                                                                                                              |
| Linking                | Both sides confirm a link                                                                                                                                                                                                                                     |
| Trail privacy          | Trail details and stop IDs are encrypted with the trail key; after a month the server keeps only an encrypted summary (name, stops, date) and times rounded to the day, so the history of trails done together remains                                        |
| Ex's photos            | Each keeps the photos from shared trails, and "Hide from my album" removes one from view                                                                                                                                                                      |
| Safety reset           | A one-screen safety reset, built with account deletion before public launch                                                                                                                                                                                   |

## 2. What the research gives the task pool

[Closeness_research.md](research/Closeness_research.md) sets the ground rules, and its own critique sets the limits.
Three findings survive scrutiny well enough to design around: novelty that is a little challenging and fun (Aron, the
most experimentally tested), responding with genuine enthusiasm to good news (Gable), and the thread running through
the large pooled studies, _perceived_ responsiveness and appreciation (Joel et al., Birnbaum and Reis). Most named
techniques are shakier than their fame: the 36 questions were studied on strangers, the synchrony effect may be
placebo, and Gottman's headline numbers lack independent replication.

That maps onto the arc:

- **Introductory:** light, reciprocal, playful disclosure. Both answer; turns alternate; nothing heavy.
- **Silly game:** novelty and mild challenge that the couple does as a team, ideally slightly out of their comfort
  zone, never at a stranger's expense.
- **Deep task:** appreciation and responsiveness. Tell, notice, thank, ask a follow-up. Escalation stays gentle: the
  second stop's laughter buys the third stop's openness.
- **Wrap-up:** active-constructive reflection on the walk itself, ending on something that went right.

Four cautions follow from the critique. Tasks invite; they never diagnose, and the app claims no therapeutic effect.
Every task can be skipped without comment. If deep tasks broach potential conflict topics, they do so gently, since the research shows conflicts often hide
"are you there for me?". Then the silly games allow showing that you are there for the other person, no matter what, through tough and through goofy. And the pool favours real attention over technique: a question works when it reflects listening, not as a trick.

The five interviews and the date-activities list in [docs/research](research/) are further inputs to task writing.

## 3. Stage A: research and workflows

These run in parallel and change no app code. Each ends in a short document Edgar approves.

| #   | Output                                                                                                                                                                                                                                                         | Feeds   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A1  | **Task design guide:** section 2 expanded into rules, tone, and ten worked examples per category, drawn from the closeness research, the interviews, and the date activities                                                                                   | Stage 4 |
| A2  | **Community listening:** recurring problems and opinions about feeling disconnected, gathered by reading public threads (Reddit and other forums) through web search, recorded as themes with rough frequency only. No scraper, no usernames, no stored quotes | A1, 10  |
| A3  | **Gamification research:** what research says makes apps and games compulsive, the case against those techniques, a synthesis, and a shortlist of features that pass it                                                                                        | 7, 8, 9 |
| A4  | **Safety review:** what can go wrong on a random walk (traffic, closed or private land, water, construction, industrial zones, darkness, weather) and which OpenStreetMap tags and checks avoid it                                                             | Stage 2 |
| A6  | **Abuse threat model:** how a controlling or abusive partner could misuse the app (location, activity data, photos, keys, linking, points, notifications) and what prevents it within reason, with a checklist for every new feature                           | All     |
| A5  | **Graphics workflow:** Edgar compares the OpenAI API route with the manual ChatGPT route (section 6); then a style guide, an asset folder layout, and the pipeline from concept art to SVG parts                                                               | 5, 6    |

A2 reads rather than scrapes: Reddit's terms restrict automated collection and commercial reuse, and themes need no
more than careful reading. Reddit refused page reads, so its threads appear only through search summaries; Edgar
accepted the gap for now.

**Status, September 30:** A1 to A4 are drafted in [docs/research](research/) and Edgar has decided their questions
(section 1). A5 runs on the OpenAI API route: `tools/images/generate.mjs` with prompts in `docs/design/prompts/`; the
avatar sheet's style is approved and the journey map is on its third concept. A6 is drafted too, and Edgar has decided its questions (section 1).

**Status, October 1:** A1 is in use: the 150-task pool written to it is signed off. A5 changed course for avatars:
painterly parts from the image model failed a layering test (the model redraws the head on every edit, so parts
don't stack), and Edgar approved hand-written SVG parts instead. The journey map concept still waits for a decision.

**Stage 1 merged September 30** (PRs 31 to 33): home and Activity, and the one-month photo deletion, which runs daily
from `main` because GitHub schedules only the default branch.

**Stage 1b merged September 30** (PRs 34 to 39), including the starter's "Waiting for Emma to join…" screen after a
Together start.

**Stage 2 code merged September 30** (PRs 40 to 44). Its done-when still needs the live run of the 200 simulated starts
(`tools/route-sim`) and Edgar's audit of 30 routes; the cloud agents can't reach Overpass or the foot router.

## 4. Build stages

Each stage lists its done-when. A stage merges only after the local stack, the pgTAP tests where the schema changes,
and a two-phone check pass.

### 1. Navigation skeleton

Remove the Map, Tasks, and Quizzes tabs; keep the notification bell. Home becomes a placeholder journey screen with a
single "Start a quest" point, which opens today's quest flow. The **Activity** tab lists past journeys together, newest
first, each opening its photos and album while the server holds them.

Photos older than a month go: a scheduled job deletes a trail's photos one month after it ends, through the Storage
API, since removing rows from `storage.objects` leaves the files behind. Activity keeps the journey's entry, its stops,
and its date after the photos go, and says so.

**Done when:** a couple starts a quest from home, finishes it, and finds it in Activity with its photos on both phones;
and on the local stack, a trail aged past a month loses its photos, rows and files alike, while its Activity entry
stays.

### 1b. Safety batch

The fixes Edgar approved from the [abuse threat model](research/abuse-threat-model.md), before the random route. Wave
1 builds all database changes (encrypted trail details with anonymous stop IDs, the monthly stripping that keeps a
summary, "Just me" quests, joining by choice, a quiet unlink that closes the photo window, confirmed links, and the
recovery code's viewed date) beside the phone-only fixes (walking paths cleared when a trail ends, "Leave this phone
clean", "Sign out everywhere else"). Wave 2 wires the app to the database changes and adds "Hide from my album".
Supabase gives the app no list of signed-in devices, so it offers only "Sign out everywhere else"; old test trails
stay unencrypted until the wipe.

**Done when:** on two phones, a quest started by one reaches the other only as an invitation, a "Just me" quest never
shows on the partner's phone, an unlink raises no alert on the other phone, a link needs both confirmations, and the
server holds no readable place or stop ID for a new trail.

**Status, October 1:** merged (PRs 34 to 39). The two-phone checks of linking and the recovery code are open.

### 2. Route generator v2

Adapt `generateRoute`: exactly five stops, a loop of at most about 2 km by the foot router (the return included),
always from the user's position. Where too few named places exist, fall back to safe generic points such as benches,
viewpoints, and park paths. Apply A4's filters: skip ways without pedestrian access, private and construction land,
industrial areas, and stops across major roads without a crossing; flag a start after sunset.

**Done when:** 200 simulated starts across the five test areas in [route-safety.md](research/route-safety.md), plus a few in
the UK and the US where testers live, all produce five-stop loops within the limit,
and a manual audit of 30 of them finds no unsafe stop.

**Status, October 1:** code merged (PRs 40 to 44, 50, 57). The full simulation gives 268 valid loops from 280
starts with no check violations; the 12 failures sit at hemmed-in or bridge starts and along Līgatne's pavement-less
main street ([internal-build.md](internal-build.md), Progress). Edgar's audit of 30 routes and the UK and US starts are
open.

### 3. Quest engine

The task data model in code (id, category, text, needs-photo, tags), a server-side history of tasks done keyed on the
two people rather than on the link (so a relink keeps it and a new partner resets it), and selection in the
1-2-3-2-4 order that skips done tasks. A skipped task may return once. The Profile's mobility setting
filters out tasks tagged `move`. A generic quest screen per category replaces the Sherlock-specific flow for
random quests. Special quests move into a registry, with Sherlock as the first entry and a trigger field left empty
for later. The stage ships with about five tasks per category, enough to test the mechanics.

**Status, October 1:** merged (PRs 47 to 49, 51). Tasks travel sealed inside the trail, history keys on the pair of
people, and a "Just me" quest records under its player alone. Edgar checked that relinking keeps history; the
two-phone check of consecutive quests is open.

**Done when:** two consecutive quests for one pair share no task; a relinked pair still avoids its old tasks; a new
pair with one of the same people can get them; Sherlock still runs as a special quest.

### 4. Task pool

Written from A1 and A2: 30 to 50 tasks per category, each reviewed by Edgar for tone, consent, and public safety.

**Done when:** Edgar signs off every task, and a test couple walks three quests without a task feeling awkward in
public.

**Status, October 1:** 150 tasks signed off and merged (PR 52, [task-pool.md](tasks/task-pool.md)). The guide now
lets a deep task touch the need beneath a conflict, in positive form only. The three test walks are open.

### 5. Avatar creator

Layered SVG parts in the A5 style: body from male-ish to female-ish and younger to older, skin, eyes, hair, clothes,
and accessories, plus **Randomise**. It appears as an optional onboarding step (a skip assigns a random avatar) and in
Profile for later edits. The profile stores only the chosen parts, a small appearance record.

**Done when:** every part combination renders cleanly at every size the app uses, a skipped step leaves a random
avatar, and edits sync to the partner's phone.

**Status, October 1:** merged (PRs 53 to 56). Only the owner and the current partner can read an appearance; an ex
can't. The local stack passed all three checks; the two-phone check is open. The renderer also accepts raster layers
in the same 512 px frame, so an illustrator's parts can replace the SVG later
([components/avatar/README.md](../apps/web/src/components/avatar/README.md)).

### 6. Journey map home

The illustrated map from A5, where village, countryside, and city meet, with a path of points that never ends: the
path is drawn from repeating tiles, so it extends as the couple walks. Both avatars stand at the couple's current
point and move one point per finished quest; the next point opens a quest. The street map stays inside the quest.

**Done when:** progress survives a relink, matches on both phones, and the map reads well at 390 px.

**Status, October 1:** merged (PR 65). Edgar picked the third concept (rich detail, markers set into the path). The art
has nine markers; the couple stands on marker `quests_done mod 9` and a fresh copy of the scene follows every nine
quests, until tiling art replaces the copy. Progress survives a relink within 90 days (see stage 7).

### 7. Couple name, stats, and points

The couple chooses a name, checked against a word filter. The server keeps lifetime totals per couple:
quests done, photos taken, challenges completed, and points scored. The totals live in their own table, because the
photos themselves go after a month and the counts must outlive them; the journey map's position reads from them.

Unlinking hides the couple's totals, points, quest points, name, and leaderboard opt-in in an archive keyed by the two
people, which nobody can read, the two included. If the same two people link again within 90 days, the new couple gets
it all back, and this week's league seat too when the relink falls in the same week; the archive then goes. A partner
who links with someone else gets nothing from it. After 90 days the archive is deleted: each link and unlink purges
expired archives, since nothing runs on a schedule in the database, and a restore never takes an expired one. Deleting
either account deletes it at once. Migration `20261002120000_relink_restore.sql` holds the rules.

Points come from finished quests, uploaded photos, and, weighted heavily, photos shared to social media; A3 sets the
amounts and adds further sources later. The server awards points only for what it can confirm: a finished quest and a
stored photo are facts in the database. A share is weaker evidence, since the phone reports only that the share sheet
completed, not what the user posted, so share points get a cap per trail. A shared photo usually shows the partner,
so the partner approves each share on their own phone, unless they have granted standing consent in settings, which
one tap withdraws; points for sharing must never pressure a partner into being posted.

**Done when:** the totals match the history on both phones, survive the photo deletion, and can't be raised from the
client beyond the share cap.

**Status, October 1:** merged without sharing (PRs 60, 61, 63). Totals, the couple name (both partners agree, either
clears it, a server-side word filter with a starter list Edgar reviewed), and points from A3's table: 10 per stop and
5 per photo (5 of each per quest), 100 per finished quest, 30 for the week's first. Only Together runs count. Share
points wait for the share flow; special-quest points wait for a way to confirm a sealed special quest.

### 8. Weekly leaderboard

Opt-in weekly leagues of about 30 randomly drawn couples, showing couple names and a band ("top third") rather than a
rank. Nothing on it links anywhere; the query returns names and bands only. The tester notice gains a paragraph first.

**Done when:** a stranger's view reveals nothing beyond the names and points shown, and opting out removes a couple at
once.

### 9. Further gamification

The features from A3's shortlist that survive its synthesis, one at a time.

### 10. Notifications

The bell becomes an in-app feed now: partner activity, a new week on the leaderboard, a gentle nudge. A separate spec
covers push notifications for the native app, with reminders to go for a stroll or to compliment a partner, informed
by A2 and A3.

### 11. Safety v2

Users can report a stop as unsafe or unpleasant; reported stops drop out of new routes until reviewed.

**Status, October 1:** merged (PRs 59, 60, 62). A report sends that stop's position, a reason, and an optional note;
phones download every open or confirmed report and drop places within 30 m. Edgar reviews reports in the dashboard.

## 5. Later: place-aware tasks

A task may later name a kind of place: a bench, water, a bridge, a building. Stops already carry their OpenStreetMap
tags, so matching a task to a stop needs only tags on the task. The harder question is the setting: OpenStreetMap
carries no single urban or rural flag. Three machine-readable signals combine well:

- **Landuse around the stop:** `landuse=residential`, `commercial`, or `retail` suggests town; `farmland`, `meadow`,
  or `forest` suggests country.
- **Building density:** the count of `building=*` within about 300 m, from the same Overpass query that finds stops.
- **The nearest settlement:** the nearest `place=city`, `town`, `village`, or `hamlet` node and its distance.

For a coarser, authoritative check, the EU's Degree of Urbanisation (GHSL and Eurostat's local-unit classification)
labels every area as city, town, or rural as open data. A first version can use building density alone and test it
against the EU labels.

## 6. Graphics: two routes to compare

**Manual (ChatGPT).** Edgar generates images in ChatGPT from a shared style prompt and saves them to
`docs/design/incoming/`, named `<asset>-v<n>.png`. Claude reviews them, picks up the chosen ones, and builds the app
assets. No key and no cost beyond a ChatGPT plan.

**API (OpenAI).** Claude runs a local script that calls OpenAI's image model with the style guide and saves each
result to the same folder, so variations come in batches and every prompt is recorded next to its image. Setup:

1. Create an account at platform.openai.com and add a small prepaid credit (a few dollars covers testing).
2. Under Settings, set a monthly budget limit, so a runaway script can't overspend.
3. Image models may require organisation verification under Settings → Organization; complete it if prompted.
4. Under API keys, create a project key. Copy it once; OpenAI won't show it again.
5. Store it as a Windows user environment variable named `OPENAI_API_KEY` (System Properties → Environment Variables),
   or in a `.env.local` file that git ignores. Never paste it into chat or commit it.
6. Check the pricing page for the current image model; cost per image depends on size and quality.

Either route produces raster images. That suits the journey map and concept art. The avatar creator needs layered
SVG parts so that every combination stays consistent, so its concepts get redrawn as vectors, which Claude can write
directly from the chosen style.

## 7. Open questions

1. **Special-quest triggers:** holidays are certain; season, place, milestone, or a date the couple sets remain open.
2. **Point amounts:** decided October 1: A3's table (section 4.1 of gamification.md). Further sources stay open.
3. **Rural roads in the generator:** decided October 1. Untagged fast roads give the rural warning instead of
   rejecting the loop; roads tagged without a sidewalk stay rejected, except the stretch a walk needs to leave its start.
4. **Starts in closed land:** decided October 1. A start on industrial, military, private, railway, quarry, or
   building-site land fails at once with a message saying why, and doesn't count against stage 2's done-when.
