# Gamification: what brings people back, what it costs, and what Wannadoo should build

Status: draft for Edgar's approval, September 30, 2026. Roadmap item A3; feeds build stages 7 (points and stats), 8
(leaderboard), 9 (further gamification), and 10 (notifications).

## Summary

Engagement techniques work, but modestly, and most of their effect fades within weeks. Meta-analyses of gamified
learning and physical activity find small to medium effects (Hedges' g about 0.25 to 0.5) that shrink at follow-up.
The mechanisms with the strongest evidence for _durable_ behaviour are the unglamorous ones: a plan tied to a time and
place, a real sense of progress, and an activity people enjoy with someone they like. The mechanisms most associated
with compulsion (variable rewards, punishing streaks, rank-based leaderboards, guilt notifications) have the weakest
evidence of lasting benefit and the clearest evidence of harm.

Wannadoo holds an unusual advantage: the behaviour it wants, walking and talking together, already rewards itself. The
design task is to make that ritual easy to start and pleasant to remember, not to bolt an extrinsic economy onto it.
Three risks specific to couples shape every recommendation below: points that turn intimacy into scorekeeping, one
partner pressuring the other, and pressure to post a partner's photo.

**Recommendations in one line each:**

- Reward the walk, not the task: points for reaching stops and finishing quests; a skipped task costs nothing.
- Replace daily streaks with a weekly rhythm that never shows a broken chain.
- Keep share points modest (below a quest's worth), capped at one per quest, and approved by the partner each time.
- Run the leaderboard as opt-in weekly leagues of about 30 couples, with no demotion and a cap on counted quests.
- Keep push notifications opt-in, at most two a week, never guilt-framed, never about the partner's inactivity.
- Build no loot boxes, random point drops, paid currency, relationship scores, or partner-versus-partner comparison.

## 1. What makes people come back: the evidence

### How to read the ratings

| Rating    | Meaning                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Strong    | Meta-analyses or several pre-registered or large randomised trials agree                                   |
| Moderate  | Several controlled studies or one strong field trial agree; effect sizes known; some boundary conditions   |
| Weak      | Few studies, small samples, mixed results, or replication failures                                        |
| Very weak | Practitioner frameworks, company blog posts, or anecdote; plausible but untested as stated                |

Evidence from labs, classrooms, and health trials transfers imperfectly to a couples' walking app. Every rating below
concerns the mechanism in general; its fit to Wannadoo appears in sections 3 and 4.

### Overview

| Mechanism                               | Evidence it drives return use           | Durable?                        | Key sources                                         |
| --------------------------------------- | --------------------------------------- | ------------------------------- | --------------------------------------------------- |
| Gamification as a package               | Moderate (small to medium effects)      | Fades after the novelty         | Sailer & Homner 2020; Mazeas et al. 2022            |
| Self-determination theory needs         | Strong as theory; moderate in games     | Yes, when needs are met         | Ryan & Deci 2000; Ryan, Rigby & Przybylski 2006     |
| Implementation intentions (planning)    | Strong                                  | Yes                             | Gollwitzer & Sheeran 2006                           |
| Habit formation through repetition      | Moderate                                | Yes, once formed                | Lally et al. 2010                                   |
| Goal gradient and endowed progress      | Moderate                                | Short-term, per goal            | Kivetz, Urminsky & Zheng 2006; Nunes & Drèze 2006   |
| Fresh starts (new week, new month)      | Moderate                                | Short bursts                    | Dai, Milkman & Riis 2014                            |
| Streaks and loss aversion               | Moderate                                | While intact; collapse on break | Silverman & Barasch 2023; Duolingo (industry)       |
| Social comparison and leaderboards      | Mixed: strong in one RCT, harmful in others | Partly                      | Patel et al. 2019; Hanus & Fox 2015                 |
| Badges, collection, completion          | Weak to moderate                        | Mixed                           | Hamari 2017; Mekler et al. 2017                     |
| Variable rewards                        | Strong in animals and gambling; weak for apps | Compulsive, not healthy   | Ferster & Skinner 1957; Zendle & Cairns 2018        |
| Open loops (Zeigarnik)                  | Weak (memory effect fails to replicate) | —                               | Ghibellini & Meier 2025                             |
| Triggers and notifications              | Moderate for short-term action          | Decays within about four weeks  | Klasnja et al. 2019; Kushlev et al. 2016            |
| Fogg model and Hook model               | Very weak (frameworks, not findings)    | —                               | Fogg 2009; Eyal 2014                                |
| Social obligation and reciprocity       | Moderate in general; strong for harm    | Yes, and that is the problem    | Hristova et al. 2022                                |
| Personalisation and tailoring           | Moderate, small effect                  | Yes                             | Noar, Benac & Harris 2007                           |

### Gamification as a package

Gamification works on average, with small to medium effects. Sailer and Homner's meta-analysis of gamified learning
found effects on achievement (g = 0.49), motivation (g = 0.36), and behaviour (g = 0.25), with the behavioural effect
least stable ([Sailer & Homner 2020](https://doi.org/10.1007/s10648-019-09498-w)). For physical activity, a
meta-analysis of 16 randomised trials found g = 0.42, with effects shrinking at follow-up
([Mazeas et al. 2022](https://www.jmir.org/2022/1/e26779)). Reviews repeatedly report a novelty effect: engagement
peaks early and decays ([Koivisto & Hamari 2019](https://doi.org/10.1016/j.ijinfomgt.2018.10.013);
[Hamari, Koivisto & Sarsa 2014](https://doi.org/10.1109/HICSS.2014.377)). **Rating: moderate.** Points and badges
buy a start, not a habit.

### Self-determination theory: competence, autonomy, relatedness

Self-determination theory holds that people sustain activities that satisfy three needs: competence (I am getting
better), autonomy (I chose this), and relatedness (I am connected to others). It rests on decades of research
([Ryan & Deci 2000](https://doi.org/10.1037/0003-066X.55.1.68)). In games, need satisfaction predicts enjoyment and
continued play better than rewards do ([Ryan, Rigby & Przybylski 2006](https://doi.org/10.1007/s11031-006-9051-8)).
**Rating: strong as theory, moderate for games.** Wannadoo's core already feeds all three: the couple chooses to walk,
completes a route and its tasks, and does it together.

### Implementation intentions: planning when and where

People who form an "if it is Saturday morning, we walk from the park gate" plan follow through far more often than
people who only intend to. A meta-analysis of 94 studies found a medium to large effect (d = 0.65)
([Gollwitzer & Sheeran 2006](https://doi.org/10.1016/S0065-2601(06)38002-1)). **Rating: strong.** This is the best-
supported return mechanism in this document, and it needs no points at all.

### Habit formation

Repeating a behaviour in a stable context makes it automatic; in one study, automaticity took a median of 66 days to
plateau, with wide variation, and _missing a single opportunity did not materially affect the process_
([Lally et al. 2010](https://doi.org/10.1002/ejsp.674)). **Rating: moderate** (one well-known study of 96 people, with
consistent later work). The last finding undercuts the logic of punishing streaks: a missed week costs the habit little,
so the app has no reason to make it feel catastrophic.

### Goal gradient and endowed progress

People accelerate as they near a goal. Coffee-card customers bought faster as they approached the free drink
([Kivetz, Urminsky & Zheng 2006](https://doi.org/10.1509/jmkr.43.1.39)), and a car-wash card with two stamps already
given (10 needed) was completed more often than a blank card needing 8
([Nunes & Drèze 2006](https://doi.org/10.1086/500480)). **Rating: moderate** (convincing field studies, few direct
replications). Progress bars within a quest (stop 3 of 5) and along the journey map use this honestly, because the
progress is real.

### Fresh starts

People start new goals more often after temporal landmarks: a new week, month, birthday, or holiday
([Dai, Milkman & Riis 2014](https://doi.org/10.1287/mnsc.2014.1901)). **Rating: moderate.** A weekly reset and
seasonal or holiday quests fit this well.

### Streaks and loss aversion

Streaks motivate while intact. In seven studies, showing people an intact streak in a behaviour log increased their
next engagement more than showing a broken one, independent of their actual behaviour; people treat keeping the
streak as a goal in itself. The damage from a break grew when people blamed themselves and shrank when they could
repair it ([Silverman & Barasch 2023](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)). Duolingo
reports hundreds of streak experiments and credits streaks as its strongest retention feature; it also reports that
users who break a streak retain far worse, and that _leniency_ (streak freezes) raised engagement
([Duolingo blog](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/);
figures are self-reported and unaudited). Loss aversion, the underlying bias, is well established
([Kahneman & Tversky 1979](https://doi.org/10.2307/1914185)), though its size is debated.

**Rating: moderate for the effect; very weak for Duolingo's specific figures.** Streaks work by making a break feel
like a loss, so they convert a missed day into a reason to quit. For a weekly couples' activity, weather, illness, and
one partner's schedule will break any daily chain.

### Social comparison and leaderboards

Competition can drive behaviour hard. In the STEP UP trial (602 adults, 24 weeks), competition-framed gamification
raised daily steps more than support- or collaboration-framed versions, and only the competition arm stayed above
control during follow-up ([Patel et al. 2019](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749761)).
Its competition was among small teams of peers with points reset weekly, not a global ranking.

Rank-based boards can also backfire. A 16-week classroom study found that a leaderboard with badges _lowered_
intrinsic motivation, satisfaction, and exam scores compared with the same course without them
([Hanus & Fox 2015](https://doi.org/10.1016/j.compedu.2014.08.019)). Low-ranked participants disengage, and a
leaderboard can trigger stereotype threat ([Christy & Fox 2014](https://doi.org/10.1016/j.compedu.2014.05.005)).
Points, levels, and leaderboards raise performance on the counted metric without raising intrinsic motivation
([Mekler et al. 2017](https://doi.org/10.1016/j.chb.2015.08.048)). **Rating: mixed.** Small, reset, peer-sized
comparison helps; large global ranks help the top and discourage the rest.

### Badges, collection, and completion

A field experiment in a peer-to-peer trading service found that badges increased user activity
([Hamari 2017](https://doi.org/10.1016/j.chb.2015.03.036)); other studies find no effect or effects only among users
who already care about badges. The drive to complete a set (collections, 100% completion) shows up in game design
practice more than in controlled studies. **Rating: weak to moderate.** Badges that record real experiences (first
walk in the rain) act as memories; badges that demand grinding act as chores.

### Variable rewards

Rewards delivered on an unpredictable schedule produce the highest, most persistent response rates known in
behavioural psychology ([Ferster & Skinner 1957](https://doi.org/10.1037/10627-000)). This is the engine of slot
machines, loot boxes, and pull-to-refresh feeds. Loot-box spending correlates with problem-gambling severity, a
finding replicated across countries ([Zendle & Cairns 2018](https://doi.org/10.1371/journal.pone.0206767)). Direct
evidence that variable rewards _in apps_ cause return use is thin; the claim rests mostly on analogy. **Rating: strong
for the mechanism, weak for app-specific benefit, strong for harm in its gambling-like forms.**

### Open loops: the Zeigarnik effect

The popular claim that people remember and return to unfinished tasks rests on shaky ground. A 2025 meta-analysis
found no general memory advantage for interrupted tasks once Zeigarnik's own 1927 data were set aside; the related
Ovsiankina effect, a tendency to _resume_ interrupted tasks, held up better
([Ghibellini & Meier 2025](https://www.nature.com/articles/s41599-025-05000-w)). **Rating: weak.** A half-finished
quest may invite resumption; designing cliffhangers to nag users rests on folklore.

### Triggers and notifications

Notifications cause short-term action, and the effect wears off. In the HeartSteps micro-randomised trial, walking
suggestions initially doubled steps in the next 30 minutes, but the effect fell about 3% a day and vanished by week
four ([Klasnja et al. 2019](https://academic.oup.com/abm/article/53/6/573/5091257)). Notifications also cost
attention: a week with alerts on produced more inattention and hyperactivity symptoms than a week with alerts off
([Kushlev, Proulx & Dunn 2016](https://dl.acm.org/doi/10.1145/2858036.2858359)). **Rating: moderate.**

Fogg's behaviour model (behaviour needs motivation, ability, and a prompt at once) and Eyal's Hook model (trigger,
action, variable reward, investment) are useful vocabularies, not tested theories
([Fogg 2009](https://doi.org/10.1145/1541948.1541999); Eyal, _Hooked_, 2014). **Rating: very weak as evidence.**
Fogg's point that ability matters most is the useful part: make the walk easy to start.

### Social obligation and reciprocity

People return to apps because someone else waits on them. Snapchat streaks keep teenagers sending daily snaps largely
out of obligation to friends, and they talk about the streak to manage the strain it puts on the friendship
([Hristova et al. 2022](https://www.sciencedirect.com/science/article/pii/S2451958822000069)). Reciprocity is among
the most robust norms in social psychology, which is why it works and why it is easy to abuse. **Rating: moderate for
engagement; strong as a source of pressure.** In a couples' app, the partner _is_ the social obligation, which makes
this mechanism both powerful and delicate.

### Personalisation

Tailored messages outperform generic ones, with a small but reliable effect (r ≈ 0.07 across 57 studies of health
messages) ([Noar, Benac & Harris 2007](https://doi.org/10.1037/0033-2909.133.4.673)). **Rating: moderate, small.**
Wannadoo's route from the couple's own position and its never-repeating tasks already personalise the core loop.

## 2. The case against

### Harms

**Crowding out intrinsic motivation.** Expected, tangible rewards for an activity people already enjoy reduce their
free-choice engagement once the reward stops; unexpected rewards and informative praise do not
([Deci, Koestner & Ryan 1999](https://doi.org/10.1037/0033-2909.125.6.627), a meta-analysis of 128 studies; for the
dissenting reading, [Cameron & Pierce 1994](https://doi.org/10.3102/00346543064003363)). A fine for late day-care
pickups _raised_ lateness because it turned a moral obligation into a price
([Gneezy & Rustichini 2000](https://doi.org/10.1086/468061)). **Rating: strong** for the core effect. The risk is
highest exactly where Wannadoo lives: a walk with someone you love is interesting and meaningful on its own.

**Compulsive use and wellbeing.** Research on problematic smartphone and social media use is mostly correlational,
with small average associations with lower wellbeing
([Orben & Przybylski 2019](https://doi.org/10.1038/s41562-018-0506-1)). The causal case against specific features is
stronger for notifications (Kushlev et al. above) and for gambling-like mechanics (Zendle & Cairns above) than for
gamification in general. **Rating: weak to moderate**, but regulators now act on it regardless (below).

**Streak anxiety.** Streaks create a loss condition, and people describe maintaining them as a duty
([Hristova et al. 2022](https://www.sciencedirect.com/science/article/pii/S2451958822000069)). Broken streaks sap
motivation for the behaviour itself ([Silverman & Barasch 2023](https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414)).

**Leaderboard demotivation.** Low ranks discourage, and a global board leaves almost everyone low
([Hanus & Fox 2015](https://doi.org/10.1016/j.compedu.2014.08.019)).

### Ethics and dark patterns

Design ethics research names the techniques that serve the product at the user's expense. Gray and colleagues
catalogue nagging, obstruction, sneaking, interface interference, and forced action
([Gray et al. 2018](https://doi.org/10.1145/3173574.3174108)); a crawl of 11,000 shopping sites found such patterns on
about one in ten ([Mathur et al. 2019](https://doi.org/10.1145/3359183)). The UK CMA sorts 21 harmful practices into
choice structure, choice information, and choice pressure
([CMA 2022](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1066524/Online_choice_architecture_discussion_paper.pdf)).
The EDPB lists continuous prompting and emotional steering among deceptive patterns that breach the GDPR
([EDPB Guidelines 03/2022](https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf)).
Gamification crosses into these when it creates artificial urgency, shames a user for leaving, or makes switching
features off harder than leaving them on.

### Regulation in the EU and UK

| Instrument                                                          | Status (September 2026)                          | Relevance to Wannadoo                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Unfair Commercial Practices Directive](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(05)) and its 2021 guidance | In force; Latvia's consumer authority (PTAC) enforces | Covers any B2C commercial practice, including design that distorts decisions. The guidance addresses dark patterns and data-driven personalisation. Rewarding users for posts that promote the app may make those posts marketing that needs disclosure (see risk in section 4). |
| [Digital Services Act](https://eur-lex.europa.eu/eli/reg/2022/2065/oj), Article 25                  | In force                                         | Bans deceptive interface design on _online platforms_. Wannadoo shows no user content to the public beyond couple names on the leaderboard, so it likely falls outside; treat Article 25 as the standard to meet anyway.                                  |
| [DSA guidelines on protecting minors](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors), July 2025 | Adopted; not binding                    | Ask platforms to switch off streaks and push notifications by default for minors and to remove engagement-driven persuasive design. Wannadoo is adults-only, but this shows where EU policy on streaks points.                                          |
| European Parliament resolution on addictive design, December 12, 2023 | Adopted; not binding                            | Calls for rules against addictive design and a "right not to be disturbed" (engagement features off by default).                                                                                                                                         |
| [Digital Fairness Act](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act) | Proposal expected Q4 2026; not yet published    | Expected to address dark patterns, addictive design, and gamification and reward mechanics, possibly with addictive features off by default and opt-in. Design for that default now.                                                                    |
| GDPR (EU and UK)                                                    | In force                                         | A shared photo of the partner is the partner's personal data; sharing needs the partner's real consent. Privacy by design (Article 25 GDPR) favours minimal leaderboard data and no location in points.                                                  |
| UK DMCC Act 2024                                                    | CMA direct enforcement since April 6, 2025       | The CMA can now fine up to 10% of global turnover for unfair commercial practices, including manipulative choice architecture, without going to court ([CMA technical note](https://assets.publishing.service.gov.uk/media/67ee863298b3bac1ec299c81/Technical_note.pdf)). |
| [ICO Age Appropriate Design Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/) | In force                         | Applies to services _likely to be accessed_ by under-18s; its nudge standard bars techniques that push children to weaken privacy or extend use. An adults-only service with a credible age check stays outside; a dating-adjacent app with no age check may not. |

Sources on the Digital Fairness Act's scope are commentary on the consultation, not a published text
([Dentons, June 2026](https://www.dentons.com/en/insights/articles/2026/june/9/the-digital-fairness-act-dark-patterns-addictive-designs-and-influencer-marketing)).
Recheck when the proposal appears.

### The specific risk of gamifying a relationship

**Scorekeeping erodes communal bonds.** Close relationships run on communal norms: partners respond to each other's
needs without keeping track. Tracking who contributed what signals an exchange relationship and lowers attraction
between people who expect a communal one ([Clark & Mills 1979](https://doi.org/10.1037/0022-3514.37.1.12)). Points
attached to intimate acts, such as a compliment or a confession at the deep-task stop, invite exactly this tracking.

**The quantified relationship.** Danaher, Nyholm, and Earp examine eight objections to tracking and gamifying
relationships, among them that it undermines the intrinsic value of intimacy, invites surveillance and control, and
favours what is measurable over what matters. They conclude that tracking can support a relationship only when both
partners choose it freely and use it as a means, not a verdict
([Danaher, Nyholm & Earp 2018](https://doi.org/10.1080/15265161.2017.1409823)). **Rating: argument, not data.**

**Pressure on the partner.** Couples rarely share one level of enthusiasm. A points total, streak, or rank gives the
keener partner a lever ("we'll lose our streak") and turns the other's reluctance into a visible failure. In a
controlling relationship, per-user stats and activity notifications can become monitoring tools.

**Sharing pressure.** Heavy points for social posting reward publishing the partner's image. A partner may consent to
avoid conflict; a post outlives the relationship; and the app's end-to-end encryption protects nothing once a photo
sits on Instagram. Sharing also exposes the couple's walking area and routine.

**Couples comparing couples.** A leaderboard invites "other couples do more than us", a comparison with no bearing on
relationship quality and a plausible cost to it.

## 3. Synthesis: healthy engagement versus exploitation

The dividing line is whose goal the mechanism serves. Healthy mechanisms help people do something they already want
(walk together, feel close) and leave them free to stop; exploitative ones make leaving feel like a loss, even when the
user would be better off leaving.

| Serves the couple's own goal                                        | Serves the app's metrics at the couple's expense                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Planning prompts: pick a day and a time                             | Daily streaks that punish a missed day                              |
| Visible, real progress: the journey map, stop 3 of 5, lifetime totals | Artificial urgency: countdowns, expiring rewards                    |
| Memories: the album, "a year ago today" (while photos exist)        | Variable or random rewards, loot boxes, spins                       |
| Weekly rhythm with a fresh start each week                          | Global rank that shames the bottom                                   |
| Small, reset, opt-in comparison among peers                         | Guilt notifications and confirmshaming                               |
| Unexpected celebration (a surprise badge for a rainy walk)          | Expected rewards on intimate acts (points per compliment)           |
| Novel, mildly challenging shared activity (Aron)                    | Social obligation engineered through the partner                    |
| Few, useful, opt-in notifications                                   | Frequent notifications and "your partner is waiting"                |

### Principles for Wannadoo

1. **The walk is the reward.** Points recognise that a walk happened; they never price what happens between the
   partners. No points attach to a task's content, a compliment, or a disclosure.
2. **Skipping is free.** Every task can be skipped without comment (roadmap section 2), so a skip must cost no points,
   break nothing, and leave no mark visible to the partner.
3. **No loss framing.** Show what the couple has done, never what they have lost or missed. Nothing expires, decays,
   or resets downward except the weekly leaderboard, which resets for everyone.
4. **Both partners consent to everything that shows the couple.** Leaderboard membership, each social share, and the
   couple name need both partners' agreement; either can withdraw alone and at once.
5. **Couples, not individuals, are compared, and only by choice.** The app never compares one partner with the other.
   Per-user stats stay private to that user.
6. **Engagement features default off, or on with one tap to disable.** Push notifications and the leaderboard are
   opt-in; nothing is harder to switch off than on. This also anticipates the Digital Fairness Act.
7. **Surprise over schedule.** Celebrate milestones unexpectedly and warmly; avoid announced reward ladders that turn
   the walk into work (Deci, Koestner & Ryan 1999).
8. **Plan, then prompt.** Prefer a prompt the couple asked for (their planned walk) over a prompt the app chose.
9. **Honest progress only.** Endowed progress and progress bars reflect real steps, never invented head starts.
10. **Measure the right outcome.** Track walks per couple per month and couples still walking after 3 and 6 months,
    not daily opens or session length.

## 4. Feature shortlist

Each feature below passes the principles. Evidence ratings come from section 1.

### 4.1 Points that reward the walk

**What:** The point table below. Points feed the couple's lifetime total, the journey map, and the weekly leaderboard.

**Mechanism:** Competence feedback and goal gradient; the lifetime total gives a sense of shared history.

**Evidence:** Moderate for points as feedback; moderate risk of crowding out if points attach to intimate acts.

**Risks and mitigation:** Points could become the goal. Keep amounts round and few, award them for facts the server
confirms, and show them after the walk rather than during tasks, so the walk stays foreground.

#### Proposed point table

| Source                               | Points  | Cap                                    | Why                                                                                                     |
| ------------------------------------ | ------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Finish a quest (reach stop 5)        | 100     | none for the lifetime total            | The behaviour Wannadoo exists for; the largest single award                                             |
| Reach a stop                         | 10      | 5 per quest                            | Rewards walking even when a quest ends early; skipped tasks still earn it                               |
| Store a photo                        | 5       | 5 per quest                            | A server-confirmed fact; small, because a skipped photo must stay free                                  |
| Share a photo (both partners approve) | 20     | 1 per quest, 3 per week                | Rewards sharing without making it worth more than walking                                               |
| First quest of the week              | 30      | once per couple per week               | Weekly rhythm and fresh start, replacing a daily streak                                                 |
| Special or holiday quest             | 50      | per special quest                      | Novelty; aligns with the special-quest registry                                                         |

A typical quest earns 100 + 50 + 25 = 175 points, 205 with a share, and 235 as the week's first. Sharing adds at most
about 10%, far short of the roadmap's "many points"; section 5 explains why, and Edgar decides.

**Recommended rule:** tasks completed count toward the "challenges completed" stat but earn no points, so skipping a
task never costs the couple anything. If Edgar wants task completion to earn points, cap it at 5 per task, so a
skipped task costs little.

**Leaderboard counting:** only a couple's best three quests in a week count toward the weekly board (up to about 700
points). Lifetime totals count everything. The cap rewards a healthy rhythm and removes the incentive to grind five
walks on a Sunday.

### 4.2 Lifetime stats as a shared story

**What:** A couple page with quests done, kilometres walked, photos taken, challenges completed, and points, plus
simple milestones in words ("Your 10th walk together"). Per-user totals appear only to that user.

**Mechanism:** Competence and relatedness; a record of shared history.

**Evidence:** Moderate (self-determination theory; progress feedback).

**Risks and mitigation:** Per-user stats can fuel "I always do more" comparisons or monitoring. The couple's stats are
one number for both, since they walk together; per-user totals matter only across relationships, so show them to their
owner alone and never beside the partner's.

**Fit:** Stage 7 as planned; the totals table already outlives photo deletion.

### 4.3 Weekly rhythm instead of a streak

**What:** A row of this month's weeks, filled when the couple walked that week. Empty weeks stay plain, never red or
cracked. Copy counts up ("5 weeks with a walk this season"), never down. An optional couple goal ("one walk a week" or
"two a month") shows as filled dots.

**Mechanism:** Fresh start, goal gradient, and habit formation, without loss aversion.

**Evidence:** Moderate. Lally et al. found a single miss harmless to habit formation; Silverman and Barasch found
repairable streaks less damaging on a break; Duolingo's own data favour leniency.

**Risks and mitigation:** Even a gentle rhythm can feel like an obligation. Make the goal optional, let either partner
pause it (holiday, illness) with no explanation, and never notify about a missed week.

**Gentle alternatives to punishing streaks, in order of preference:**

1. Cumulative counts: "23 walks together". Nothing to lose.
2. Weekly rhythm: filled weeks, empty weeks neutral, counting up within a season.
3. Seasons: a quarter's count that resets to zero for everyone on a fresh-start date, framed as a new chapter.
4. If Edgar wants a streak: count consecutive _weeks_, not days, with two automatic free passes per season and a
   pause button, and show the longest run rather than a broken one.

**Fit:** Replaces any streak in stage 9; the "first quest of the week" bonus in the point table supports it.

### 4.4 Plan the next walk

**What:** At the wrap-up, the couple can pick a day and rough time for the next walk. The app offers one reminder at
that time, if they want it, and adds nothing if they skip.

**Mechanism:** Implementation intentions; a prompt the users set themselves.

**Evidence:** Strong (Gollwitzer & Sheeran 2006, d = 0.65).

**Risks and mitigation:** A missed plan can feel like failure. Frame it as an invitation, never follow up on a missed
plan, and let either partner cancel it.

**Fit:** The in-app feed in stage 10 shows the planned walk; the native app's push spec delivers the reminder.

### 4.5 The journey map as honest progress

**What:** The planned infinite map, where both avatars advance one point per finished quest, with occasional landmarks
(a lighthouse at walk 10, a village fair at walk 25) that appear as surprises.

**Mechanism:** Goal gradient to the next landmark; unexpected rewards; a visible shared story.

**Evidence:** Moderate for goal gradient; the surprise element follows Deci, Koestner, and Ryan's finding that
unexpected rewards do not undermine intrinsic motivation.

**Risks and mitigation:** An infinite path can feel like a treadmill. Space landmarks further apart as the count grows,
and never show "points to the next reward" countdowns.

**Fit:** Stage 6, reading its position from the stage 7 totals.

### 4.6 Memory badges

**What:** A small set of badges that record experiences, not effort: first walk, first rain walk, first walk after
dark (if safe routing allows), first walk in a new season, a special quest done. They appear unannounced, with no
visible list of locked badges.

**Mechanism:** Collection, used as memory rather than as a checklist.

**Evidence:** Weak to moderate (Hamari 2017).

**Risks and mitigation:** A visible grid of locked badges turns memories into chores; hide unearned ones. Avoid any
badge that needs location history on the server, since runs never store a start or path.

**Fit:** Stage 9; badges award no points, or a small fixed amount.

### 4.7 Opt-in weekly leagues

**What:** The planned global weekly leaderboard, shaped to avoid the demotivation seen in global ranks. The
recommended design:

| Choice          | Recommendation                                                                              | Reason                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Joining         | Opt-in; both partners agree; either can leave alone, at once                                 | Consent; the roadmap's done-when                                                       |
| Group size      | Leagues of about 30 couples, assigned at random each week among couples who walked last week | Peer-sized comparison worked in STEP UP; a global list leaves nearly everyone low     |
| What is shown   | Couple names and weekly points only; the couple's own row highlighted                        | Roadmap's data minimum                                                                 |
| Rank display    | Show names in order, with the couple's position as a band ("top third") rather than "#27 of 30" | Softens low ranks while keeping the game legible                                      |
| Reset           | Monday 00:00 Riga time; everyone starts at zero                                              | Fresh start each week                                                                   |
| Counting        | Best three quests of the week                                                                | Rewards rhythm, not grinding                                                            |
| Promotion       | None in the first version; if added later, promotion only, no demotion                      | Demotion is loss framing                                                               |
| Collective goal | A line above the table: "Couples in your league walked 84 km this week"                     | Relatedness without rank                                                               |
| Notifications   | One in-app feed item when a new week starts; none about rank changes                          | Avoids "you dropped to 12th" pressure                                                  |

**Evidence:** Mixed (Patel et al. 2019 for small reset groups; Hanus & Fox 2015 against large rank boards).

**Risks and mitigation:** Couple names can reveal identity in a small country; the word filter and a notice that the
name is public mitigate this. A global board with few couples at launch makes random leagues sparse; start with one
league and split at 30.

**Fit:** Stage 8. The simplest version satisfying the roadmap (a global weekly top list) remains possible; if Edgar
prefers it, show only the top 20 and the couple's own band.

### 4.8 Consent-first sharing

**What:** After a quest, either partner can propose sharing one photo. The other partner sees that photo and approves
or declines on their own phone, and a decline shows as "not this time", with no reason asked. Points arrive only after
approval and the share sheet completes.

**Mechanism:** Social proof and reach for the app; recognition for the couple.

**Evidence:** No research on sharing points specifically. The pressure risk follows from reciprocity and relationship
power research.

**Risks and mitigation:**

- _Partner pressure:_ per-photo approval, not once per couple as the roadmap currently says; modest points; the
  proposer never sees a timer or reminder on the partner's pending approval.
- _Unconfirmable shares:_ the cap (one per quest, three per week) limits gaming.
- _Incentivised promotion:_ if a post promotes Wannadoo because Wannadoo paid for it in points, EU and UK consumer
  authorities may treat it as marketing that needs disclosure. Options: award points for sharing without requiring
  app branding, keep the reward small, and ask a lawyer before launch. Social platforms' own rules on incentivised
  sharing also need checking.
- _Encryption:_ tell the couple plainly that a shared photo leaves end-to-end encryption.

**Fit:** Stage 7; amends its consent rule.

### 4.9 Notifications that respect attention

**What:** The stage 10 in-app feed plus a later push spec with these rules:

| Rule           | Recommendation                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Consent        | Push is opt-in, asked after the first finished quest, never at install                                      |
| Frequency      | At most two pushes a week in total, including a planned-walk reminder                                       |
| Timing         | The couple picks days and a time window; quiet hours by default from 21:00 to 09:00                         |
| Content        | Invitations ("Sunny Saturday: fancy a stroll?"), never guilt, loss, or urgency                              |
| Partner        | Never "your partner is waiting" or "your partner walked without you"; partner activity stays in the in-app feed |
| Compliment nudge | Private to the recipient; never tracked, never scored, easy to switch off on its own                      |
| Lock screen    | Neutral wording by default ("Time for a walk?"), since the phone may be seen by others                      |
| Variety        | Rotate wording, since HeartSteps saw effects vanish by week four                                            |
| Off switch     | Each notification type switches off separately, in one tap, from the notification itself                   |

**Evidence:** Moderate for short-term effect; moderate for attention costs.

**Fit:** Stage 10 and the native-app push spec.

### 4.10 Occasional novelty

**What:** Special quests (holidays, seasons, a first snow) that arrive as surprises in the registry.

**Mechanism:** Novelty and fresh starts; shared novel activity, the best-tested closeness finding in the roadmap's
research (Aron et al. 2000).

**Evidence:** Moderate ([Aron et al. 2000](https://doi.org/10.1037/0022-3514.78.2.273); Dai, Milkman & Riis 2014).

**Risks and mitigation:** Time-limited quests can create fear of missing out. Keep them available for a generous
window (a holiday quest for two weeks), and never show countdowns.

**Fit:** The special-quest registry and its triggers (roadmap open question 1).

## 5. Features to avoid

| Feature                                                   | Reason                                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Daily streaks with a visible break                        | Loss framing; a couple's schedule breaks daily chains; EU guidance for minors already targets streaks; harms motivation on a break        |
| Loot boxes, spins, mystery rewards, random point drops    | Variable-ratio mechanics tied to problem gambling; no evidence of healthy benefit; regulatory target                                      |
| Paid currency, paid boosts, or buying points              | Turns the leaderboard into pay-to-win and invites gambling and unfair-practice scrutiny                                                    |
| Points per task content (per compliment, per disclosure)  | Crowds out intrinsic motivation where it matters most; turns intimacy into exchange (Clark & Mills)                                        |
| Partner-versus-partner comparison                         | Invites scorekeeping and control inside the couple                                                                                        |
| A relationship score or "health" rating                   | Claims a diagnosis the research cannot support; the roadmap already rules out therapeutic claims                                          |
| Heavy share points ("many points")                        | Rewards publishing the partner's image; pressure to consent; possible undisclosed marketing; defeats encryption                           |
| Guilt or loss notifications ("Don't lose your progress") | Confirmshaming and emotional steering, named dark patterns under EDPB and CMA guidance                                                    |
| Partner-inactivity alerts ("Your partner hasn't walked in a while") | Uses the partner as social obligation; a monitoring tool in a controlling relationship                                          |
| Countdown timers and expiring rewards                     | Artificial urgency, a CMA "choice pressure" practice                                                                                      |
| Global ranks with position numbers for all                | Demotivates the majority (Hanus & Fox)                                                                                                    |
| Clickable leaderboard entries or profiles                 | Already excluded; privacy                                                                                                                  |
| Demotion from leagues                                     | Loss framing                                                                                                                              |
| Visible grids of locked badges                            | Turns memories into chores                                                                                                                |
| Engagement-time metrics as goals                          | Measures the app's gain, not the couple's; walks per month is the right measure                                                           |

## 6. Decisions for Edgar

1. **Share points.** The roadmap says "many points" for sharing. This document recommends 20 per share, capped at one
   per quest and three per week, below a quest's 100. Accept, or set a different ratio.
2. **Share consent.** The roadmap asks consent once per couple; this document recommends approval of each photo by the
   partner on their own phone.
3. **Task points.** Recommended: tasks earn no points (skipping stays free), and count only in the "challenges
   completed" stat. Alternative: 5 points per task.
4. **Streak.** Recommended: no streak; a weekly rhythm with neutral empty weeks. Alternative: a weekly streak with free
   passes and a pause.
5. **Leaderboard shape.** Recommended: random leagues of about 30 couples, bands instead of rank numbers, best three
   quests counted, no demotion. Alternative: one global top-20 list with the couple's band.
6. **Per-user stats.** Recommended: visible only to their owner, never beside the partner's.
7. **Push limits.** Recommended: opt-in after the first quest, at most two a week, quiet hours, no partner-activity
   pushes.
8. **Legal check.** Before launch, ask a lawyer whether points for social shares make those posts marketing that
   needs disclosure under EU and UK law, and recheck the Digital Fairness Act once the Commission publishes it.
9. **Success metric.** Adopt walks per couple per month and 3- and 6-month retention of walking couples as the
   measures gamification must improve.

## Sources

Behavioural psychology and HCI

- Aron, A., et al. (2000). Couples' shared participation in novel and arousing activities and experienced relationship
  quality. _JPSP_, 78(2). <https://doi.org/10.1037/0022-3514.78.2.273>
- Cameron, J., & Pierce, W. D. (1994). Reinforcement, reward, and intrinsic motivation: A meta-analysis. _Review of
  Educational Research_, 64(3). <https://doi.org/10.3102/00346543064003363>
- Christy, K. R., & Fox, J. (2014). Leaderboards in a virtual classroom. _Computers & Education_, 78.
  <https://doi.org/10.1016/j.compedu.2014.05.005>
- Clark, M. S., & Mills, J. (1979). Interpersonal attraction in exchange and communal relationships. _JPSP_, 37(1).
  <https://doi.org/10.1037/0022-3514.37.1.12>
- Dai, H., Milkman, K. L., & Riis, J. (2014). The fresh start effect. _Management Science_, 60(10).
  <https://doi.org/10.1287/mnsc.2014.1901>
- Danaher, J., Nyholm, S., & Earp, B. D. (2018). The quantified relationship. _American Journal of Bioethics_, 18(2).
  <https://doi.org/10.1080/15265161.2017.1409823>
- Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of
  extrinsic rewards on intrinsic motivation. _Psychological Bulletin_, 125(6).
  <https://doi.org/10.1037/0033-2909.125.6.627>
- Eyal, N. (2014). _Hooked: How to Build Habit-Forming Products_. Portfolio.
- Ferster, C. B., & Skinner, B. F. (1957). _Schedules of Reinforcement_. <https://doi.org/10.1037/10627-000>
- Fogg, B. J. (2009). A behavior model for persuasive design. _Persuasive '09_.
  <https://doi.org/10.1145/1541948.1541999>
- Ghibellini, R., & Meier, B. (2025). Interruption, recall and resumption: A meta-analysis of the Zeigarnik and
  Ovsiankina effects. _Humanities and Social Sciences Communications_, 12.
  <https://www.nature.com/articles/s41599-025-05000-w>
- Gneezy, U., & Rustichini, A. (2000). A fine is a price. _Journal of Legal Studies_, 29(1).
  <https://doi.org/10.1086/468061>
- Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: A meta-analysis.
  _Advances in Experimental Social Psychology_, 38. <https://doi.org/10.1016/S0065-2601(06)38002-1>
- Gray, C. M., et al. (2018). The dark (patterns) side of UX design. _CHI '18_.
  <https://doi.org/10.1145/3173574.3174108>
- Hamari, J. (2017). Do badges increase user activity? A field experiment on the effects of gamification. _Computers
  in Human Behavior_, 71. <https://doi.org/10.1016/j.chb.2015.03.036>
- Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? _HICSS 2014_.
  <https://doi.org/10.1109/HICSS.2014.377>
- Hanus, M. D., & Fox, J. (2015). Assessing the effects of gamification in the classroom. _Computers & Education_,
  80. <https://doi.org/10.1016/j.compedu.2014.08.019>
- Hristova, D., et al. (2022). "Why did we lose our Snapchat streak?" Social media gamification and metacommunication.
  _Computers in Human Behavior Reports_, 5. <https://www.sciencedirect.com/science/article/pii/S2451958822000069>
- Kahneman, D., & Tversky, A. (1979). Prospect theory. _Econometrica_, 47(2). <https://doi.org/10.2307/1914185>
- Kivetz, R., Urminsky, O., & Zheng, Y. (2006). The goal-gradient hypothesis resurrected. _Journal of Marketing
  Research_, 43(1). <https://doi.org/10.1509/jmkr.43.1.39>
- Klasnja, P., et al. (2019). Efficacy of contextually tailored suggestions for physical activity: A
  micro-randomized optimization trial of HeartSteps. _Annals of Behavioral Medicine_, 53(6).
  <https://academic.oup.com/abm/article/53/6/573/5091257>
- Koivisto, J., & Hamari, J. (2019). The rise of motivational information systems: A review of gamification research.
  _International Journal of Information Management_, 45. <https://doi.org/10.1016/j.ijinfomgt.2018.10.013>
- Kushlev, K., Proulx, J., & Dunn, E. W. (2016). "Silence your phones": Smartphone notifications increase inattention
  and hyperactivity symptoms. _CHI '16_. <https://dl.acm.org/doi/10.1145/2858036.2858359>
- Lally, P., et al. (2010). How are habits formed? _European Journal of Social Psychology_, 40(6).
  <https://doi.org/10.1002/ejsp.674>
- Mathur, A., et al. (2019). Dark patterns at scale. _CSCW_. <https://doi.org/10.1145/3359183>
- Mazeas, A., et al. (2022). Evaluating the effectiveness of gamification on physical activity: Systematic review and
  meta-analysis of randomized controlled trials. _JMIR_, 24(1). <https://www.jmir.org/2022/1/e26779>
- Mekler, E. D., et al. (2017). Towards understanding the effects of individual gamification elements on intrinsic
  motivation and performance. _Computers in Human Behavior_, 71. <https://doi.org/10.1016/j.chb.2015.08.048>
- Noar, S. M., Benac, C. N., & Harris, M. S. (2007). Does tailoring matter? Meta-analytic review of tailored print
  health behavior change interventions. _Psychological Bulletin_, 133(4). <https://doi.org/10.1037/0033-2909.133.4.673>
- Orben, A., & Przybylski, A. K. (2019). The association between adolescent well-being and digital technology use.
  _Nature Human Behaviour_, 3. <https://doi.org/10.1038/s41562-018-0506-1>
- Patel, M. S., et al. (2019). Effectiveness of behaviorally designed gamification interventions with social
  incentives for increasing physical activity (STEP UP). _JAMA Internal Medicine_, 179(12).
  <https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749761>
- Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social
  development, and well-being. _American Psychologist_, 55(1). <https://doi.org/10.1037/0003-066X.55.1.68>
- Ryan, R. M., Rigby, C. S., & Przybylski, A. (2006). The motivational pull of video games. _Motivation and Emotion_,
  30. <https://doi.org/10.1007/s11031-006-9051-8>
- Sailer, M., & Homner, L. (2020). The gamification of learning: A meta-analysis. _Educational Psychology Review_,
  32. <https://doi.org/10.1007/s10648-019-09498-w>
- Silverman, J., & Barasch, A. (2023). On or off track: How (broken) streaks affect consumer decisions. _Journal of
  Consumer Research_, 49(6). <https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414>
- Zendle, D., & Cairns, P. (2018). Video game loot boxes are linked to problem gambling. _PLoS ONE_, 13(11).
  <https://doi.org/10.1371/journal.pone.0206767>

Industry

- Duolingo. How streaks keep Duolingo learners committed to their language goals.
  <https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/>

Regulation and guidance

- CMA (2022). Online choice architecture: How digital design can harm competition and consumers.
  <https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/1066524/Online_choice_architecture_discussion_paper.pdf>
- CMA (2025). Technical note: unfair commercial practices.
  <https://assets.publishing.service.gov.uk/media/67ee863298b3bac1ec299c81/Technical_note.pdf>
- Dentons (2026). The Digital Fairness Act: dark patterns, addictive designs and influencer marketing.
  <https://www.dentons.com/en/insights/articles/2026/june/9/the-digital-fairness-act-dark-patterns-addictive-designs-and-influencer-marketing>
- EDPB (2023). Guidelines 03/2022 on deceptive design patterns in social media platform interfaces.
  <https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf>
- European Commission (2021). Guidance on the interpretation and application of the Unfair Commercial Practices
  Directive. <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:52021XC1229(05)>
- European Commission (2025). Guidelines on the protection of minors under the Digital Services Act.
  <https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors>
- European Parliament. Legislative train: Digital Fairness Act.
  <https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act>
- ICO. Age appropriate design code.
  <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/>
- Regulation (EU) 2022/2065, the Digital Services Act. <https://eur-lex.europa.eu/eli/reg/2022/2065/oj>
