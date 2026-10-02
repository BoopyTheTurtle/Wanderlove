# Push notifications for the native app

Status: draft, October 2, 2026. Owner: Edgar. Belongs to stage 10 of the [MVP roadmap](mvp-roadmap.md); built with the
move to a native app. Draws on the [gamification research](research/gamification.md) (sections 4.4, 4.9, and 5) and
the [abuse threat model](research/abuse-threat-model.md) (X1 to X3).

Pushes invite a couple out for a walk and then get out of the way. A person turns them on after their first finished
quest, receives at most two a week, and sees nothing on the lock screen that names a partner, a place, or a photo. The
phone writes and schedules every visible notification itself; the server sends only a content-free wake-up and stores
nothing but device tokens.

## 1. Goals and the measure

- Help couples walk more often, by reminding them of walks they planned and inviting them when a week runs empty.
- Carry small, private ideas for closeness between quests, with no score attached.
- Show nothing on a lock screen that could expose a person to someone holding their phone.
- Give a controlling partner no new channel to watch, press, or reach the other.

**The measure is walks per couple per month,** and couples still walking at three and six months, as the roadmap
decides. App opens, notification taps, and delivery rates never count as success, and the app records none of them.
We compare the measure for testers before and after pushes arrive, and read their feedback for any sign of pressure.
If walks stay flat, or testers report pressure, we send fewer pushes, not cleverer ones.

## 2. Push types

Four types exist, each with its own switch. All four are off until the person turns them on (section 4).

| Type             | Sends                                                       | At most      |
| ---------------- | ----------------------------------------------------------- | ------------ |
| Planned walk     | One reminder at the time the couple set for their walk      | One per plan |
| Walk invitation  | An invitation for a stroll in a week without a plan         | One a week   |
| Compliment nudge | An idea for appreciating the partner, private to the reader | One a week   |
| Small reminders  | A small idea for closeness between quests                   | One a week   |

The weekly cap in section 5 binds all four together, so a person never receives every type in the same week.

### 2.1 Planned walk

At the wrap-up of a quest, the couple may pick a day and rough time for the next walk (gamification section 4.4). Each
phone that has this type on schedules one reminder for that moment. The reminder fires once, at the time the couple
set, even inside quiet hours, since the couple chose it.

A missed plan ends quietly. The app sends no follow-up, no "you missed it", and no second reminder; the plan simply
lapses, and the next walk invitation treats the week like any other. Either partner can cancel the plan, and the
reminder then disappears from both phones without a word (section 8.3).

### 2.2 Walk invitation

When a week holds no plan and no walk yet, the phone may send one invitation on a day and in a window its owner chose.
It never mentions how long the couple has gone without walking, and it never fires in the two days after a finished
quest.

### 2.3 Compliment nudge and small reminders

Between quests, the app can suggest a small act: name something the partner did well, ask about the best part of
their day, make tea for two. These belong to the reader alone.

- **Private.** The partner never learns that a nudge arrived, was read, or was acted on.
- **Untracked.** No "Done" button, no count, no point, no badge, no history. The app forgets each idea once shown.
- **Gentle.** One of each a week at most, and none in the two days after a quest.
- **Linked only.** Solo users and people without a partner never receive them.
- **Shown in the app.** The lock screen shows a neutral line; the idea itself appears only when the person opens the
  notification, after the app has checked that the link still stands. An idea about a partner never reaches someone
  whose link has quietly ended.

The compliment nudge and the small reminders have separate switches, so a person can keep one and drop the other.

## 3. In-app feed kinds and push

The in-app feed, built now, records eight kinds of event. **No push fires because of something the partner did.** The
feed keeps every kind; push takes none of them directly.

| Feed kind                | Push                                                                  | Why                                                                                    |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `partner_started_quest`  | Never                                                                 | Pushed, a start becomes a location alert (X1)                                          |
| `partner_finished_quest` | Never                                                                 | Tells one partner when the other walked, and where they likely are (X1)                |
| `badge_earned`           | Never                                                                 | A reward pushed to pull someone back is a lure; the feed shows it at the next open     |
| `league_week_started`    | Never                                                                 | Gamification research allows one feed item per week and no pushes about the league     |
| `walk_planned`           | No push of its own; schedules the planned-walk reminder (section 2.1) | The couple set the time together; the reminder is the only push it earns               |
| `walk_plan_cancelled`    | Never; silently removes the reminder from both phones                 | A cancelled plan needs no announcement, and a pushed cancellation invites blame        |
| `share_requested`        | Never                                                                 | A pushed request turns a question into pressure (X2); a share waits without a deadline |
| `share_answered`         | Never                                                                 | A pushed "no" invites the requester to press again; a "yes" needs no alert             |

## 4. Consent

Push is opt-in, asked once at a moment when it makes sense: after the person's first finished quest, never at install
or sign-up.

1. **The ask.** The quest complete screen, after the album, shows a card: "Want a nudge for your next walk?" with
   **Choose reminders** and **Not now**. When the couple plans a next walk on that screen, the card sits beside the
   plan.
2. **The choice.** **Choose reminders** opens a sheet listing the four types, each with one plain sentence and an
   unticked switch. **Turn on** stays disabled until the person ticks one. The sheet also sets days, window, and
   quiet hours (section 5), with weekends 10:00 to 18:00 and quiet hours 21:00 to 09:00 offered as defaults.
3. **The system prompt.** Only after **Turn on** does the app ask the operating system for permission, so the system
   prompt never appears cold.
4. **Not now.** The app asks once more, after the third finished quest. After that, only Profile offers pushes.
5. **Per person.** Each partner decides on their own phone. Neither learns whether the other said yes, as with the
   league opt-in.

Turning pushes off takes one tap, from the notification or from Profile (section 7). Turning one type off leaves the
others as they were.

## 5. Frequency and timing

| Rule          | Default                                      | Notes                                                              |
| ------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Weekly cap    | Two pushes a week in total, Monday to Sunday | Counts every type; the planned-walk reminder counts too            |
| Days          | Saturday and Sunday                          | Any set of days; the planned-walk reminder ignores it              |
| Window        | 10:00 to 18:00                               | Any span outside quiet hours; the planned-walk reminder ignores it |
| Quiet hours   | 21:00 to 09:00                               | Adjustable; nothing but a planned-walk reminder fires inside them  |
| Spacing       | At least 48 hours between two pushes         | Unless the second is a planned-walk reminder                       |
| After a quest | No invitation or nudge for 48 hours          | The walk just happened                                             |

When the cap would be broken, the planned-walk reminder wins, then the walk invitation, then the compliment nudge, then
the small reminders. A dropped push never queues for later.

**Days, window, and quiet hours belong to each person,** though the roadmap speaks of the couple's choice. The opt-in
sheet offers the couple the same defaults, and partners who set it up together will usually match. A shared setting
would let one partner change the other's notifications, which the threat model rules out as remote control. Times
follow the phone's own time zone.

## 6. What a push says

### 6.1 Lock-screen wording

**Every push shows neutral wording on the lock screen by default.** A phone lies on tables and sits in other hands: a
controlling partner may know the passcode (actor B), and a new partner's name on an ex's old phone, or a compliment
prompt on a shared screen, exposes the person (X3). Neutral wording names no partner, place, photo, quest, or
relationship.

Profile offers a **Show more on the lock screen** switch, off by default. On, the planned-walk reminder and the walk
invitation use the friendlier lines in section 6.4. The compliment nudge and small reminders stay neutral either way:
their content always waits inside the app.

No push ever carries a partner's name, a couple name, a place, a stop, a route, a distance, a photo, or a point total,
in either mode. The operating system still shows the app's name and icon; the opt-in sheet says so, and points to the
system setting that hides previews.

### 6.2 Tone

Pushes invite. They never guilt, threaten loss, count days, or hurry. The partner never appears as a reason to act.

| Never                                 | Because                                 |
| ------------------------------------- | --------------------------------------- |
| "Your partner is waiting"             | Uses the partner as social obligation   |
| "Emma started a quest"                | Partner activity, a location alert (X1) |
| "You haven't walked in 12 days"       | Counts a gap; turns rest into failure   |
| "Don't lose your progress"            | Loss framing, a named dark pattern      |
| "Last chance for this week's points!" | Artificial urgency                      |
| "You missed your planned walk"        | Follows up on a missed plan             |

### 6.3 Rotation

Each type draws from a pool of at least twelve lines, and a phone never repeats a line within eight weeks. Gamification
research found walking prompts lose their effect by the fourth week when they repeat. Pools live in `packages/core`,
beside the task pool, so the copy stays platform-neutral and reviewable in one place. Lines stay short enough for a
lock screen: about 60 characters.

### 6.4 Example lines

Wannadoo's voice is warm, light, and plural: "You made it, together." The examples below show its range.

**Neutral (lock screen, default for every type):**

- Time for a walk?
- Fancy some fresh air?
- A small idea for today.
- A little something from Wannadoo.

**Planned walk (with Show more on):**

- This is the walk you planned. Shoes on?
- Right on time. A fresh loop is ready when you are.
- The hour you picked is here. Five stops, one stroll.

**Walk invitation (with Show more on):**

- Saturday looks walkable. Fancy a loop?
- Twenty minutes, five stops, one new story.
- The next point on your map is ready when you are.
- A short walk, a silly game, a good chat. Interested?

**Compliment nudge (inside the app only):**

- Tell them one thing they did this week that made your life easier.
- Notice something they're good at, and say it out loud today.
- Remember a moment this month when they made you laugh. Tell them.

**Small reminders (inside the app only):**

- Ask about the best part of their day, and hear the whole answer.
- Make a drink for two and sit down for ten minutes.
- Put your phone away at dinner tonight. This one included.

## 7. One-tap off switches

Each notification carries a **Stop these** action. One tap turns off that type on this phone, with no confirmation
screen and no question about why; the others stay as they were. On Android, each type also has its own notification
channel, so the system's own settings switch types apart. Profile lists the four types with their switches, plus days,
window, quiet hours, and the lock-screen switch.

Turning every type off leaves nothing behind but the device token, which the phone then deletes (section 9).

## 8. Delivery architecture

### 8.1 Local first

The phone builds and schedules every visible notification as a local notification. It knows everything it needs: its
owner's switches, days, and quiet hours; the planned walk; the date of the last finished quest; and the copy pools from
`packages/core`. The server never composes, times, or counts a push, and no payload ever carries words a person reads.

The one gap: a phone learns of its partner's changes only when it next reaches the server. When one partner cancels a
plan, the other phone would still remind. A content-free wake-up closes the gap.

### 8.2 Options for the wake-up

| Option                                         | How                                                                                | For                                               | Against                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A. Local only                                  | No remote push at all; phones refresh the plan at each open                        | No tokens, no server, nothing to leak             | A cancelled plan still reminds the other phone once                                                            |
| B. APNs and FCM directly                       | A Supabase Edge Function sends a silent push through Apple's and Google's services | No third party beyond the platforms; full control | Two credentials to manage (Apple `.p8` key, Firebase service account); more code                               |
| C. Expo push service                           | Expo's service relays to APNs and FCM; fits an Expo or React Native app            | One API for both platforms; little code           | A further processor holds tokens; ties the choice to Expo                                                      |
| D. Engagement platform (OneSignal and similar) | A hosted service schedules, segments, and sends                                    | Dashboards, A/B tests                             | Tracks opens and builds device profiles by design; measures the wrong thing; data leaves for marketing tooling |

**Recommendation: B, with C acceptable if the native app is built with Expo.** D is ruled out: it exists to measure
app opens, which this spec forbids. A stays the fallback if Edgar wants no tokens at all, at the cost of one stray
reminder after a cancellation.

### 8.3 The payload

A wake-up carries no trail, place, name, time, or reason. On iOS it is a background push with
`{"aps": {"content-available": 1}}` and nothing else; on Android, an FCM data message with an empty body and a fixed
collapse key, so several wake-ups fold into one. On waking, the phone asks the server for the current plan through its
normal signed-in call and reschedules its local notifications.

The server sends a wake-up when a plan changes or is cancelled, to the partner's devices only, and at most once a
minute per device. It sends none on unlink: a quiet unlink sends the other phone nothing (threat model principle 5),
and the in-app check in section 2.3 keeps partner ideas from reaching an ex. Apple and Google may delay or drop a
background push; the phone also refreshes at every open, so a lost wake-up costs one stray reminder at most.

### 8.4 Platform notes

- **iOS** allows 64 pending local notifications per app; Wannadoo schedules at most a few weeks ahead and never comes
  close.
- **Android 14** restricts exact alarms. The planned-walk reminder uses an inexact alarm with a window of a few
  minutes, which avoids asking for the exact-alarm permission.
- **Notification actions** (the **Stop these** button) use iOS notification categories and Android notification
  actions, one per type.

## 9. Data stored

The server stores device tokens and nothing else for push. Preferences, schedules, and rotation history stay on the
phone.

| Data                                                  | Where                        | Kept until                                                                                                           |
| ----------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Device token                                          | Server, `push_devices`       | Sign-out, every type turned off, a token rejected by Apple or Google, 60 days without a refresh, or account deletion |
| Switches, days, window, quiet hours, lock-screen mode | Phone                        | Sign-out, **Leave this phone clean**, or uninstall                                                                   |
| Scheduled notifications and rotation history          | Phone                        | Each notification's firing; history after eight weeks                                                                |
| Planned walk (day and time)                           | Server, with the in-app feed | The plan's time passes or a partner cancels it                                                                       |

`push_devices` holds `user_id`, a random `device_id` the phone generates, `platform` (`ios` or `android`), `token`, and
`refreshed_on` (a date, rounded to the day as elsewhere). `user_id` references `auth.users` with `on delete cascade`.
The migration revokes Supabase's default grants on the table, as the repository's convention requires. A person
registers and deletes only their own devices through two `security definer` functions; nobody reads the table through
the Data API, and the partner can't learn whether the other has a device registered. The daily purge job that deletes
old photos also deletes tokens unrefreshed for 60 days.

**Nothing records a push.** No table, log, or analytics event stores a send, a delivery, an open, a tap, or a **Stop
these**. A court order or a leak reveals at most that a person once allowed reminders on a phone.

## 10. Abuse check

The threat model's checklist (section 5), run against this spec:

| Question                  | Answer                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Monitor                | No push reports the partner's acts, place, or timing; the server learns nothing from pushes                       |
| 2. Coerce                 | No push carries a request from the partner; compliment nudges are untracked, so nobody can demand proof           |
| 3. Isolate                | Unlinking sends nothing; partner ideas stop at the next open                                                      |
| 4. Punish                 | A partner can't trigger, repeat, or time a push; only a plan change sends a silent wake-up, at most once a minute |
| 5. After the break-up     | The ex's phone receives no wake-up and no idea about the former partner                                           |
| 6. With the phone in hand | Neutral lock-screen lines; settings show only this phone's own choices                                            |
| 7. Data                   | Tokens only, deleted on sign-out and after 60 days idle; no push history                                          |
| 8. Consent                | Each person opts in alone, per type, and leaves in one tap                                                        |
| 9. The list               | Touches "Revealing notifications" and "Partner activity alerts", and avoids both                                  |

## 11. EU and UK consent notes [Legal]

- **Lawful basis.** Consent (GDPR Article 6(1)(a)) fits best: the person chooses each type, and withdrawing is as easy
  as giving. Unticked switches keep the consent valid; a pre-ticked box would not be.
- **The token on the device.** Reading and storing a push token touches the ePrivacy Directive's Article 5(3) and the
  UK's PECR regulation 6. Storage the person asked for is strictly necessary for the service they requested, and the
  opt-in comes first anyway.
- **Not marketing.** Pushes remind people of their own walks and never promote offers, features, or partners. Kept
  that way, they stay outside the direct-marketing rules; a lawyer should confirm before public launch.
- **Transfers.** Apple and Google receive the token and the empty payload, mostly in the US, under the EU-US Data
  Privacy Framework and the UK extension. Empty payloads keep the transferred data to the token alone.
- **Off by default.** The expected Digital Fairness Act and the Parliament's call for a "right not to be disturbed"
  point to engagement features off until chosen. This design already meets that default.
- **Notices.** The privacy notice, and the tester notice while testing lasts, gain a paragraph on push and a version
  bump. Proposed text:

> **Reminders.** If you turn on reminders, we store a code from your phone's maker that lets us wake the app, and
> delete it when you sign out or turn reminders off. Reminders are written and timed on your phone; we never send
> names, places, or photos, and we never record whether you opened one.

Latvia's Data State Inspectorate supervises the processing; the UK's ICO covers UK testers.

## 12. Open questions

1. **Delivery option.** B (direct APNs and FCM) or C (Expo), which depends on how the native app gets built; or A, with
   no tokens at all and one stray reminder per cancelled plan?
2. **Per-person or couple timing.** This spec gives each partner their own days, window, and quiet hours. Should the
   wrap-up let a couple agree on one set, copied to both phones but owned separately?
3. **Re-asking.** One more ask after the third quest, then only Profile. Is one re-ask too many, or too few?
4. **Measuring the effect.** Comparing testers before and after launch is weak evidence. Should the server keep a
   per-person "reminders on" flag, with no history, so walks can be compared between people with and without?
5. **Language.** Testers live mostly in Latvia. Do the copy pools need Latvian before launch, and who writes it in
   Wannadoo's voice?
6. **Share requests.** This spec never pushes a share request. If testers forget pending requests for weeks, should a
   neutral, opt-in line ("A little something from Wannadoo") cover them, within the cap?
