# Abuse threat model: how a controlling partner could misuse Wannadoo

Status: draft for Edgar's approval, September 30, 2026. Roadmap item A6; feeds build stages 1, 2, 3, 5 to 8, and 10,
account deletion, and the native app.

## Summary

Wannadoo links two people, shares their walks, and knows where each walk happens. Those are the same ingredients as the
"dual-use" apps that researchers find abusers repurpose most often: apps built for a benign purpose, such as family
location sharing, that work equally well for spying on a partner
([Chatterjee et al. 2018](https://rist.tech.cornell.edu/papers/spyware.pdf)). Abusers rarely need technical skill.
They use ordinary features, a known password, or the phone in their hand
([Freed et al. 2018](https://dl.acm.org/doi/10.1145/3173574.3174241)).

Edgar decided on September 30 that the app will not identify or counsel abusive relationships and shows no helpline
prompts. This document therefore asks one question of every feature: how could one partner use it against the other,
and what stops that within reason?

The internal build already gets much right: live GPS stays on the phone, the run snapshot never holds the start or the
path, photos lose their EXIF and travel end-to-end encrypted, either partner can unlink alone and at once, and the
unlink sends no message. Five gaps matter most:

1. **Live tracking while apart.** When one partner starts a quest, the other's phone joins it within ten seconds and
   watches each stop turn green, with its coordinates and time. Walking together, this is a feature; walking apart, it
   is a live location feed.
2. **The stops give the start away.** Five stops of a 2 km loop sit within about a kilometre of the start, so the
   snapshot locates where the walker stood to within a few streets. The server keeps it, with per-stop times, for good.
3. **A borrowed login shows everything but the photos.** Trail snapshots and stop completions are unencrypted. Anyone
   who signs in to the account, typically by knowing the email password, sees every walk's places and times, the
   current walk live, and a new partner's name. The app offers no list of sessions and no "sign out everywhere".
4. **The ex keeps a window.** After an unlink, the ex still sees the other's current name, avatar, and key changes
   through old shared runs, and can add photos to a trail finished in the last 24 hours.
5. **Unlinking is noticed at once.** The other phone announces "You are no longer linked" within seconds. Leaving is the
   most dangerous time in an abusive relationship, and the app picks the moment of disclosure for the user.

Most fixes are cheap and fit stages already planned. Section 3 lists them by stage; section 6 lists the decisions they
need.

## Method and stance

This model draws on research and practitioner guidance on intimate partner surveillance (IPS) and technology-facilitated
coercive control:

- Cornell Tech's Clinic to End Tech Abuse and its papers: interviews with survivors and professionals
  ([Freed et al. 2017](https://doi.org/10.1145/3134681); [2018](https://dl.acm.org/doi/10.1145/3173574.3174241)),
  the spyware and dual-use ecosystem ([Chatterjee et al. 2018](https://rist.tech.cornell.edu/papers/spyware.pdf)),
  abusers' own forum advice ([Tseng et al. 2020](https://www.usenix.org/conference/usenixsecurity20/presentation/tseng)),
  and clinic findings on account compromise
  ([Havron et al. 2019](https://www.usenix.org/conference/usenixsecurity19/presentation/havron)).
- Threat models built for intimate threats, where the attacker knows the victim, shares their home, and can hold their
  phone ([Levy & Schneier 2020](https://academic.oup.com/cybersecurity/article-abstract/6/1/tyaa006/5849222);
  [Slupska & Tanczer 2021](https://doi.org/10.1108/978-1-83982-848-520211049)).
- Practitioner guidance: [Refuge Tech Safety](https://refugetechsafety.org/what-is-tech-abuse/), NNEDV Safety Net's
  [considerations for app developers](https://www.techsafety.org/considerations-app-developers), the
  [Coalition Against Stalkerware](https://stopstalkerware.org/information-for-tech-companies/), and Apple's
  [Safety Check](https://support.apple.com/guide/personal-safety/safety-check-iphone-ios-16-ips2aad835e1/web) as a
  precedent for a one-screen emergency reset.
- Safety-by-design guidance: IBM's
  [coercive control resistant design](https://www.bcs.org/articles-opinion-and-research/coercive-control-resistant-design/)
  principles, Australia's eSafety [Safety by Design](https://www.esafety.gov.au/industry/safety-by-design), and Ofcom's
  [guidance on a safer life online for women and girls](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/a-safer-life-online-for-women-and-girls)
  (November 2025).
- Law: the EU's [Directive 2024/1385](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401385) makes cyber
  stalking, including monitoring a person's movements through devices without consent, a crime in every member state;
  England and Wales criminalise
  [controlling or coercive behaviour](https://www.legislation.gov.uk/ukpga/2015/9/section/76).

The base rate makes this concrete. About 27% of ever-partnered women aged 15 to 49 report physical or sexual violence
from a partner in their lifetime
([WHO](https://www.who.int/news-room/fact-sheets/detail/violence-against-women)), and controlling behaviour without
violence is commoner still. A couples app with a thousand couples will hold some where one partner controls the other.

Two limits frame the recommendations. First, the app cannot stop a partner who stands beside the phone's owner and
demands to see it; no design survives coercion at arm's length. The goal is narrower: the app must not **add** a
capability the abuser lacked, must not keep data that outlives its purpose, and must let a person leave quickly and
quietly. Second, the recommendations stay within reason for a small team: settings and data rules, not detection or
moderation.

## 1. Threat actors and capabilities

| Actor                                   | Has                                                                                         | Typical goal                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **A. Linked partner, using features**   | Their own account and phone; everything the app shows a partner                              | Know where and when the other goes; press them to walk or share |
| **B. Partner with the other's phone**   | The unlocked phone, or its passcode; minutes alone with it                                   | Read history, view the recovery code, link or unlink, change settings |
| **C. Ex-partner after unlink**          | Their own account; old shared runs, photos, and keys                                         | Keep watching; harass; humiliate with old photos               |
| **D. Someone who knows the login**      | The victim's email password or an open mail session, so they receive the sign-in code        | Sign in as the victim elsewhere and watch silently             |
| **E. Someone who learns the recovery code** | The code, plus D's access to sign in                                                     | Decrypt every photo the account can reach, including with a new partner |
| **F. A coercer**                        | Power over the victim: threats, money, housing, children                                     | Force a link, a relink, a share, or the handing over of codes  |

Actors overlap. The common case in the research is A plus B plus D: a current partner who knows the passcode and the
email password ([Freed et al. 2018](https://dl.acm.org/doi/10.1145/3173574.3174241)). Actor C matters most for safety,
since stalking and violence peak around separation.

## 2. Misuse inventory

Ratings assume a couple where one partner controls the other; they compare items with each other, not with the base
rate. **Likelihood:** how easily an actor from section 1 does it with today's app or the planned one. **Harm:** Low
(annoyance, pressure), Medium (exposure, sustained control, loss of memories), High (physical location or safety at
risk, full account takeover).

### Location

| #   | Misuse                                                                                                                                                                                                                                                                                                  | Actor  | Likelihood | Harm   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------ |
| L1  | **Live progress while apart.** A quest started on one phone opens on the other within 10 seconds ("Daniel started …"). Each stop unlocks only within its radius, so each completion is a timed location fix, visible to the partner within 10 to 15 seconds.                                            | A      | Medium     | High   |
| L2  | **The start from the stops.** The loop starts where the walker stands; its five stops lie within about 1 km, and their centre approximates the start. A walk from a friend's flat, a new address, or a refuge gives that place away.                                                                        | A, C, D | Medium     | High   |
| L3  | **Location history on the server.** `stop_completions` keeps who reached which stop and when; the snapshot keeps each stop's coordinates. Activity keeps both after the photos go, with no end date, and both members, the ex included, read them.                                                         | A, C, D | Medium     | Medium |
| L4  | **Walking paths on the phone.** `wannadoo_run_paths` holds the planned route of the last five runs, starting at the start point. It is not tied to the user and survives sign-out.                                                                                                                       | B      | Low        | Medium |
| L5  | **Photos show places.** EXIF is gone, but a photo of a street corner still locates the walk.                                                                                                                                                                                                                 | A, C   | Low        | Low    |

### Monitoring and "who did what"

| #   | Misuse                                                                                                                                                                                                                              | Actor | Likelihood | Harm   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| M1  | **When they went out.** `started_by`, `started_at`, and the partner-sync notice tell the partner the moment the other sets out, wherever they are.                                                                                       | A     | Medium     | Medium |
| M2  | **Scorekeeping.** Each completion and photo records who did it; a skipped photo or task is visible by its absence. "Why did you skip?" becomes a lever.                                                                            | A     | Medium     | Low    |
| M3  | **The ex keeps a view.** `can_see_profile` lets anyone who ever shared a run see the other's current display name, username, avatar, and key ID. A name change, a new avatar, or a new key (a new phone) all reach the ex.            | C     | Medium     | Medium |
| M4  | **The leaderboard as a tracker.** Weekly points under a known couple name show how often a couple walks; an ex who guesses the new couple's name learns there is one.                                                            | C     | Low        | Medium |

### Coercion through play

| #   | Misuse                                                                                                                                                                                                                     | Actor | Likelihood | Harm   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| G1  | **Pressure to walk.** Points, the weekly rhythm, and the journey map give the keener partner a script: "we'll fall behind", "you broke our week". A3 already removes loss framing.                                             | A, F  | Medium     | Medium |
| G2  | **Pressure to share.** Points for posting a photo reward publishing the partner's image; a partner consents to avoid a row, and the post outlives the relationship and the encryption.                                        | A, F  | Medium     | High   |
| G3  | **Disclosures turned into weapons.** Deep tasks invite appreciation and wishes. Words said at stop 3 can be quoted back later. The app stores no answers today.                                                              | A     | Low        | Medium |
| G4  | **The couple name as degradation or exposure.** One partner picks a demeaning or identifying name that then appears on the leaderboard.                                                                                   | A     | Low        | Low    |
| G5  | **Ending the other's walk.** Leaving a started route ends it for both; starting a new run abandons any run either partner has open.                                                                                         | A     | Low        | Low    |

### Photos

| #   | Misuse                                                                                                                                                                                              | Actor | Likelihood | Harm   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| P1  | **Photos kept and reposted.** Each partner keeps the photos of shared trails, can save them, and can screenshot anything. An ex posts them to shame or threaten.                                       | C     | Medium     | High   |
| P2  | **Photos of you that you can't remove.** A user deletes only their own uploads; photos the partner took of them stay in the partner's album for the server's month and on the partner's phone for good. | C     | Medium     | Medium |
| P3  | **Harassment through the grace window.** Unlinking abandons only the open run. A trail finished in the last 24 hours still takes photos, so an ex can drop new images into the other's album.        | C     | Low        | Medium |
| P4  | **Spoiled keys.** Any member may rewrite the other's copy of a run key (security review, finding 5), so an ex can lock the other out of old trails' photos.                                           | C     | Low        | Low    |

### Accounts, recovery code, and keys

| #   | Misuse                                                                                                                                                                                                                                                             | Actor | Likelihood | Harm   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------- | ------ |
| K1  | **Silent second sign-in.** With the email password, the abuser signs in on their own phone. Without any key they see every run's stops and times, the current walk live, and the partner's name. The victim can't see or end that session; sign-out is local only. | D     | Medium     | High   |
| K2  | **The recovery code read first.** The code shows once, in Profile. Whoever opens it first keeps it, and the owner never sees it; the hint to view it then disappears. With K1's access it decrypts every photo, including a new partner's.                               | B, E  | Low        | High   |
| K3  | **Lock-out by rotation.** With the phone in hand, the abuser taps **Make a new recovery code** and keeps the new one, or clears the browser data and then refuses, as partner, to trust the new keys.                                                                  | B     | Low        | Medium |
| K4  | **Trust by habit.** After K1, the victim's new partner sees "Emma's keys changed, most likely on a new phone. Trust them?" and taps yes. The abuser's phone then receives every shared trail's key.                                                                   | D     | Low        | High   |

### Linking and unlinking

| #   | Misuse                                                                                                                                                                                                                                            | Actor | Likelihood | Harm   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| N1  | **Covert link.** With the victim's phone, the abuser scans their own invite, or redeems an invite the victim sent someone else. The inviter never confirms, so the victim's next quests go to the abuser.                                        | B, D  | Low        | High   |
| N2  | **Forced relinking.** "Link again or else." Nothing in software prevents it; the unlink must stay one tap away.                                                                                                                                | F     | Medium     | Medium |
| N3  | **Unlinking noticed at once.** The other phone shows "You are no longer linked" within 10 seconds, and `couples.ended_by` names who ended it. The abuser learns of the break the moment it happens.                                                | A     | High       | High   |

### Notifications (stage 10 and the native app)

| #   | Misuse                                                                                                                                                                                  | Actor | Likelihood | Harm   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| X1  | **The activity feed as surveillance.** Roadmap stage 10 plans "partner activity" in the feed: "Emma started a quest", "Emma finished stop 3". Pushed, it becomes a location alert.           | A     | Medium     | High   |
| X2  | **Notifications as harassment.** Nudges, compliment prompts, walk invitations, and share requests sent over and over, or at night.                                                          | A, C  | Low        | Medium |
| X3  | **What the lock screen and inbox reveal.** Push text and sign-in emails show that the app is in use, and could show a new partner's name.                                                 | B     | Low        | Medium |

### The phone and the account

| #   | Misuse                                                                                                                                                                                         | Actor | Likelihood | Harm   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------- | ------ |
| D1  | **Reading the phone.** The web app has no lock. Activity, the partner's name, and each trail's map sit one tap away. Sign-out leaves the keys, the partner key pins, and the walking paths behind. | B     | Medium     | Medium |
| D2  | **No way out of the data.** Account deletion and export wait for the MVP; until then a user who wants to vanish must email Edgar.                                                                | all   | Medium     | Medium |
| D3  | **Social engineering support.** An abuser writes to `privacy@` or `support@` posing as the partner, asking whether they use the app, who they linked with, or for their data or deletion.         | D     | Low        | Medium |

## 3. Mitigations

### Design principles

1. **The app assumes both partners stand at the same stop.** A feature that matters only when they are apart, such as
   seeing the other's progress remotely, earns suspicion first.
2. **Location lives on the phone and dies with the walk.** The server holds places only while a walk needs them; it
   never holds a start, a path, or a history of where someone was.
3. **Symmetric and deliberate.** Each partner sees what the other deliberately shares with the couple, and nothing about
   the other alone: no presence, no "last seen", no per-partner scores.
4. **Consent per act.** Every share, the couple name, and the leaderboard need both partners' yes; either withdraws
   alone, at once.
5. **Leaving is quick, quiet, and one-sided.** Either partner unlinks in two taps; the other can't block it, gets no push,
   and learns of it only when they next need the link.
6. **The past freezes at unlink.** An ex keeps the memories they walked, as the link notice promised, and gains nothing
   after that: no new names, avatars, keys, or photos.
7. **An account belongs to one person.** Its owner sees every signed-in device, can end them all, and can delete the
   account.
8. **Discreet by default.** Notifications and emails say "Time for a walk?", never who did what.
9. **Nothing kept that the user didn't choose to keep.** No task answers, recordings, or free-text notes.

### Mitigation per misuse

**Cost:** _Now_ means a small PR or a process rule, worth doing before or soon after hand-out. _Stage_ means it belongs
in the named roadmap stage at little extra cost. _Later_ means real work, after the MVP's core.

| #      | Already in place                                                                                  | Change                                                                                                                                                                                                                                                                                     | Where and cost       |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| L1, M1 | Live GPS never leaves the phone; stops unlock by radius on the phone                               | Joining becomes a choice: "Daniel started a quest. Join?" instead of opening the map. Progress syncs only between phones that joined. Add **Just me** while linked: a run the partner never sees                                                                                             | Stage 3; cheap       |
| L2     | The snapshot never holds `start` or `path`                                                         | The route generator keeps every stop at least about 250 m from the start and never centres the loop on it, so the stops point to a neighbourhood, not a door                                                                                                                                     | Stage 2; cheap       |
| L2, L3, K1 | Photos are end-to-end encrypted                                                              | Encrypt the trail snapshot with the run key, and key completions on opaque stop IDs (an HMAC of the OSM ID under the run key). A signed-in session without keys then sees dates only                                                                                                         | Later; medium        |
| L3     | Activity keeps the entry after photos go                                                           | The one-month job that deletes photos also drops stop coordinates, `completed_by`, and completion times, keeping the date, trail name, stop names, and counts                                                                                                                                  | Stage 1; cheap       |
| L4, D1 | Paths keep only five runs                                                                           | Delete a run's path when the run ends; key paths by user; sign-out clears paths, pins, and the followed run, and offers "also remove this phone's keys" with a warning about the recovery code                                                                                                | Now; cheap           |
| L5     | EXIF and GPS stripped on the phone                                                                  | None beyond per-photo share consent (G2)                                                                                                                                                                                                                                                  | Done                 |
| M2     | Skipping costs no points (A3)                                                                       | Show the couple's progress, never "who completed"; drop per-person attribution from the partner's view                                                                                                                                                                                     | Stage 3; cheap       |
| M3     | The unlink ends new runs                                                                            | After unlink, `can_see_profile`'s shared-runs clause returns the name as it stood at unlink, and no avatar, username, or key ID. Store the name on the run membership at start                                                                                                               | Stage 5; cheap       |
| M4     | Leaderboard planned opt-in, names and points only                                                   | Random leagues (A3), no search, no couple page; unlink removes the couple at once; either partner leaves alone                                                                                                                                                                            | Stage 8; cheap       |
| G1     | A3: weekly rhythm, no streak, no loss framing                                                        | Never show one partner's inactivity to the other; either can pause the weekly goal without explaining                                                                                                                                                                                     | Stages 7, 9; cheap   |
| G2     | Roadmap asks share consent                                                                            | Per-photo approval on the pictured partner's own phone, with no timer and "not this time" as a neutral answer (A3 decision 2); share points below a quest's worth; the prompt says the photo leaves encryption                                                                              | Stage 7; cheap       |
| G3     | Tasks store nothing                                                                                   | Keep it so: no text answers, voice notes, or recordings; add it to section 4                                                                                                                                                                                                              | Rule; free           |
| G4     | Word filter planned                                                                                   | The name needs both partners' yes; either can clear it alone, which also takes the couple off the leaderboard                                                                                                                                                                             | Stage 7; cheap       |
| G5     | Leaving asks for confirmation                                                                         | With explicit joining (L1), leaving ends the run only for the phone that leaves, unless both joined and agree                                                                                                                                                                             | Stage 3; cheap       |
| P1     | Link notice says each keeps shared photos; server deletes photos after a month                        | State plainly at linking and in the tester notice that the partner can save any photo. Beyond that, no technical fix exists for screenshots; the one-month retention limits the server's part                                                                                                | Now; free            |
| P2     | Delete own photo removes it for both                                                                  | Offer "Hide from my album" (`photo_hidden` exists). Whether a user may delete photos of themselves taken by an ex is Edgar's decision (section 6)                                                                                                                                         | Stage 1; cheap       |
| P3     | Unlink abandons the open run                                                                          | `can_add_photo` also requires the run's couple to be active, so an unlink closes the grace window                                                                                                                                                                                         | Now; one migration   |
| P4     | Accepted in the security review                                                                       | After unlink, only the key's owner may rewrite their own copy; re-sharing needs a current link                                                                                                                                                                                            | Stage 1; cheap       |
| K1     | Sign-out is local, so it can't sign the partner out                                                   | Settings lists signed-in devices with their last use and offers **Sign out everywhere else** (`signOut({ scope: "others" })`). Each device shows "New sign-in on another device" once. Later: passkeys                                                                                     | Now; cheap           |
| K2     | The code shows once and then leaves the phone                                                         | Profile shows "Recovery code viewed on September 30" after viewing, so a code seen by someone else shows; **Make a new recovery code** already voids the old one                                                                                                                           | Now; cheap           |
| K3     | The recovery code covers a refused re-share                                                           | Accept; the month-long retention caps the loss                                                                                                                                                                                                                                             | Accept               |
| K4     | Four emoji on the trust prompt                                                                        | The prompt asks the partner to compare emoji with the other's phone in person before trusting, and offers **Not now** as the first button                                                                                                                                                 | Now; cheap           |
| N1     | Invites are single-use and expire in 24 hours                                                         | The inviter confirms too: "Emma used your invite. Link?" Home shows the linked partner's name at all times                                                                                                                                                                                 | Now; cheap to medium |
| N2     | Either partner unlinks alone, at once                                                                 | Keep the unlink two taps from Profile; never say what unlinking loses; no "relink to restore your map" prompt                                                                                                                                                                             | Rule; free           |
| N3     | The unlink sends no message                                                                           | Drop the proactive "You are no longer linked" dialog. The other phone learns only when it next opens the partner screen or starts a quest, as "You're walking solo"; hide `ended_by`                                                                                                        | Now; cheap           |
| X1     | A3: no partner-activity pushes                                                                         | The feed shows only what the partner sent on purpose: a walk invitation, a share proposal. No "started", "finished", or "reached" items                                                                                                                                                    | Stage 10; free       |
| X2     | A3: opt-in push, at most two a week, quiet hours                                                       | Each partner mutes the other's invitations alone, silently; one pending invitation at a time                                                                                                                                                                                              | Stage 10; cheap      |
| X3     | Sign-in email shows only a code                                                                        | Neutral lock-screen text by default; no partner names in pushes or emails                                                                                                                                                                                                                 | Stage 10; free       |
| D1     | Nothing yet                                                                                             | Native app: optional app lock (PIN or biometrics). Web: a **Leave this phone clean** option in Settings (sign out, clear keys, paths, and pins)                                                                                                                                            | Now (web); later (native) |
| D2     | Deletion by email to Edgar within a month                                                               | Account deletion in the app before public launch: profile, keys, own photos, memberships. A one-screen **Safety reset**, after Apple's Safety Check: unlink, sign out everywhere, new recovery code                                                                                       | MVP; medium          |
| D3     | Edgar answers requests by hand                                                                          | Support never confirms whether anyone uses the app or with whom; it answers data requests only after a sign-in code to the account's own email, and sends data only there                                                                                                                  | Now; process         |

### Cheap now, in one list

1. Close the photo grace window on unlink (P3).
2. **Sign out everywhere else** and a device list (K1).
3. "Recovery code viewed on …" in Profile (K2).
4. Drop the proactive unlink dialog and hide `ended_by` (N3).
5. Inviter confirmation on linking (N1).
6. Path cleanup and a **Leave this phone clean** option (L4, D1).
7. Support rules for data requests (D3).

## 4. Features Wannadoo will not build

Check every proposal against this list. A feature on it needs Edgar's explicit decision and an update to this
document.

- **Live location sharing** between partners, or any map of where the partner is now.
- **Location history:** stored starts, paths, heat maps, "places you walk", or any per-person record of where someone was.
- **Geofences and arrival alerts:** "Emma left home", "Emma reached the park".
- **Presence:** online dots, "last seen", "active now", typing indicators, or read receipts.
- **Partner activity alerts:** pushes or feed items about what the partner did, or didn't do, on their own.
- **Partner-versus-partner comparison:** per-person points, scores, ranks, or "who did more".
- **Relationship scores** or health ratings.
- **Recorded answers:** stored text, audio, or video from tasks.
- **Remote control of the other's account:** one partner changing the other's settings, reading their stats, or acting
  for them; any "couple admin".
- **Unlinking that needs both partners,** a cooling-off period, a reason, or a message to the other.
- **Loss on leaving:** anything that tells a user what an unlink will cost them.
- **Silent sessions:** sign-ins the owner can't see or end.
- **Sharing without per-act consent:** auto-posting, default-on sharing, or one consent covering future photos.
- **Discovery:** contact import, search by name or email, public profiles, or clickable leaderboard entries.
- **Revealing notifications:** partner names, places, or photos on the lock screen or in email.
- **"Keep your partner safe" framing:** any feature sold as checking on a partner, the marketing that turns family
  trackers into stalkerware ([Chatterjee et al. 2018](https://rist.tech.cornell.edu/papers/spyware.pdf)).

## 5. Checklist for every new feature

Run these questions on each feature spec and PR that shows one partner anything about the other. Assume one partner
controls the other and knows the other's passcode and email password.

1. **Monitor:** Does it tell one partner where the other is, was, or will be, or when they act? Would a signed-in
   session on another phone see it?
2. **Coerce:** Does it give one partner a number, streak, reward, or request to press the other with? Can the other say
   no without it showing?
3. **Isolate:** Does it make leaving, unlinking, or linking with someone else harder, costlier, or visible?
4. **Punish:** Can one partner use it to spoil, delete, expose, or humiliate the other, now or after a break-up?
5. **After the break-up:** What does the ex see and do with it? Does anything new reach them after the unlink?
6. **With the phone in hand:** What does it show to someone holding the unlocked phone for two minutes?
7. **Data:** What does the server keep, for how long, and who reads it? Would a court order or a leak reveal where
   someone walked?
8. **Consent:** Is every act that shows the couple approved by both, per act, and withdrawable by either alone?
9. **The list:** Does it touch anything in section 4?

A "yes" to 1 to 7 needs a mitigation in the spec before building; a "no" to 8 or a "yes" to 9 goes to Edgar.

## 6. Decisions for Edgar

1. **Joining a quest.** Recommended: explicit join ("Daniel started a quest. Join?") with progress shared only between
   joined phones. Alternative: today's automatic join, accepting L1.
2. **Walking alone while linked.** Recommended: a **Just me** quest the partner never sees. It gives a controlled
   partner room, and a controlling partner no signal beyond silence.
3. **How an unlink shows.** Recommended: no dialog on the other phone; it learns at its next use of the link.
   Alternative: keep the dialog, which is clearer but tells the abuser at once.
4. **Location after the month.** Recommended: the photo-deletion job also strips coordinates and times from the run.
   Activity then shows the date, trail name, and stop names only.
5. **Photos of you taken by an ex.** Recommended: keep the current rule (each keeps shared photos) with "Hide from my
   album", relying on the month's retention. Alternative: after an unlink, let either person delete a shared trail's
   photos from the server for both, at the cost of the other's memories.
6. **Inviter confirmation.** Recommended: both sides confirm a link.
7. **Encrypted snapshots.** Recommended: plan it as a post-MVP item; it closes most of K1 and L3.
8. **Safety reset screen.** Recommended: build it with account deletion before public launch.
