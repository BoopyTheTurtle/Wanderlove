# MVP roadmap: the random quest, the journey map, and play

Status: draft, September 30, 2026. Owner: Edgar. Follows the [internal build](internal-build.md), which delivered
accounts, linking, trails, encrypted photos, and saving.

The MVP turns Wannadoo into one repeatable ritual. A couple opens the app, taps the next point on an illustrated
journey map, and gets a fresh quest: a walking loop of about 2 km from where they stand, with five stops and one task
at each. Tasks follow a fixed arc, from a warm opener through play and depth to a light close, and no couple sees the
same task twice. Avatars, points, a weekly leaderboard, and later notifications give the ritual a reason to return.

We build one feature at a time and test each fully, on the local stack and on two phones, before starting the next.
Research and design workflows run first, in parallel, because the build stages depend on what they find.

## 1. Decisions

| Topic                  | Decision (Edgar, September 30)                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Route shape            | A loop back to the start; about 2 km of real walking, return included                                            |
| Stops                  | Five, from the user's current position each time                                                                 |
| Task arc               | Stop 1 introductory, 2 silly game, 3 deep task, 4 silly game, 5 wrap-up                                          |
| Repeats                | A pair never gets a task it has done; the same person may get it again with a new partner                        |
| Tasks and places       | Generic tasks first, doable at any stop; place-aware tasks later (section 5)                                     |
| Photos                 | Each stop still takes a photo or a skip                                                                          |
| Special quests         | Sherlock stays as the first special quest, in a repository of special quests; their triggers come later          |
| Solo mode              | Stays, with nothing built for it; if it breaks something, it goes                                                |
| Avatars                | Male-ish to female-ish, younger to older, hair, clothes, accessories, skin, eyes, randomise; no gender is stored |
| Leaderboard            | Global and weekly, by couple name only, with no profile reachable from it                                        |
| Community listening    | Themes only; no usernames, no quotes, no record of who said what                                                 |
| Push notifications     | Specified now, built with the move to a native app                                                               |
| Photo retention        | The server keeps a trail's photos for one month after it ends, then deletes them                                 |
| Points                 | Earned for finishing quests, for uploading photos, and many for sharing photos to social media; more to follow   |
| Special-quest triggers | To be decided; holiday quests are certain                                                                        |
| Journey map            | Infinite: the path extends as the couple walks                                                                   |
| Lifetime stats         | Each couple and each user keeps totals of quests done, photos taken, challenges completed, and points scored     |

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
| A5  | **Graphics workflow:** Edgar compares the OpenAI API route with the manual ChatGPT route (section 6); then a style guide, an asset folder layout, and the pipeline from concept art to SVG parts                                                               | 5, 6    |

A2 reads rather than scrapes: Reddit's terms restrict automated collection and commercial reuse, and themes need no
more than careful reading.

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

### 2. Route generator v2

Adapt `generateRoute`: exactly five stops, a loop of at most about 2 km by the foot router (the return included),
always from the user's position. Where too few named places exist, fall back to safe generic points such as benches,
viewpoints, and park paths. Apply A4's filters: skip ways without pedestrian access, private and construction land,
industrial areas, and stops across major roads without a crossing; flag a start after sunset.

**Done when:** 200 simulated starts across Riga and a rural test area all produce five-stop loops within the limit,
and a manual audit of 30 of them finds no unsafe stop.

### 3. Quest engine

The task data model in code (id, category, text, needs-photo, tags), a server-side history of tasks done keyed on the
two people rather than on the link (so a relink keeps it and a new partner resets it), and selection in the
1-2-3-2-4 order that skips done tasks. A generic quest screen per category replaces the Sherlock-specific flow for
random quests. Special quests move into a registry, with Sherlock as the first entry and a trigger field left empty
for later. The stage ships with about five tasks per category, enough to test the mechanics.

**Done when:** two consecutive quests for one pair share no task; a relinked pair still avoids its old tasks; a new
pair with one of the same people can get them; Sherlock still runs as a special quest.

### 4. Task pool

Written from A1 and A2: 30 to 50 tasks per category, each reviewed by Edgar for tone, consent, and public safety.

**Done when:** Edgar signs off every task, and a test couple walks three quests without a task feeling awkward in
public.

### 5. Avatar creator

Layered SVG parts in the A5 style: body from male-ish to female-ish and younger to older, skin, eyes, hair, clothes,
and accessories, plus **Randomise**. It appears as an optional onboarding step (a skip assigns a random avatar) and in
Profile for later edits. The profile stores only the chosen parts, a small appearance record.

**Done when:** every part combination renders cleanly at every size the app uses, a skipped step leaves a random
avatar, and edits sync to the partner's phone.

### 6. Journey map home

The illustrated map from A5, where village, countryside, and city meet, with a path of points that never ends: the
path is drawn from repeating tiles, so it extends as the couple walks. Both avatars stand at the couple's current
point and move one point per finished quest; the next point opens a quest. The street map stays inside the quest.

**Done when:** progress survives a relink, matches on both phones, and the map reads well at 390 px.

### 7. Couple name, stats, and points

The couple chooses a name, checked against a word filter. The server keeps lifetime totals per couple and per user:
quests done, photos taken, challenges completed, and points scored. The totals live in their own table, because the
photos themselves go after a month and the counts must outlive them; the journey map's position reads from them.

Points come from finished quests, uploaded photos, and, weighted heavily, photos shared to social media; A3 sets the
amounts and adds further sources later. The server awards points only for what it can confirm: a finished quest and a
stored photo are facts in the database. A share is weaker evidence, since the phone reports only that the share sheet
completed, not what the user posted, so share points get a cap per trail. A shared photo usually shows the partner,
so the share step asks both partners' consent once per couple; points for sharing must never pressure a partner into
being posted.

**Done when:** the totals match the history on both phones, survive the photo deletion, and can't be raised from the
client beyond the share cap.

### 8. Weekly leaderboard

A global weekly table of couple names and points. Joining is opt-in; nothing on it links anywhere; the query returns
names and points only. The tester notice gains a paragraph first.

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
2. **Point amounts** and further point sources, from A3.
