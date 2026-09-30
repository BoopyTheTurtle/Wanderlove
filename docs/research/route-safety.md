# Route safety review

Status: draft for Edgar's approval, September 30, 2026. Roadmap item A4; feeds stage 2 (route generator v2) and
stage 11 (safety v2).

Wannadoo sends a couple, or a solo walker, on a random 2 km loop that nobody has walked or checked. The generator must
therefore reject what the map can prove unsafe, warn about what it cannot see, and tell users plainly that the route is
a suggestion. This document names the hazards, the OpenStreetMap (OSM) checks that avoid them, what stage 2 can afford
now, the copy the app shows, and the audit that closes stage 2.

## Summary

- **Biggest real risks for this app:** traffic at crossings and along roads without sidewalks, darkness (Riga's sun
  sets before 15:45 in December), and winter ice. Latvia sits near the top of EU tables for both pedestrian road deaths
  and drowning, so traffic and water get the strictest checks.
- **The foot router helps less than it seems.** The FOSSGIS profile blocks motorways, trunk roads, private ways, and
  construction, but it routes along `highway=primary` roads with only a mild penalty, ignores sidewalks, lighting, and
  crossings, and happily includes ferries.
- **Stage 2 can do almost everything client-side** with one enlarged Overpass query (about 350 KB in central Riga) and
  data the router already returns (`annotations=nodes`, `steps=true`, waypoint snap distance). No new service, no key.
- **Later:** user reports, a curated exclusion list, weather through a small server proxy, lighting and crime data.
- **Legal:** the terms and tester notice need a lawyer's review; EU and UK consumer law likely limits how far a
  disclaimer can shift responsibility.

## 1. Hazards

Ratings apply to this app: short loops of about 2 km, mostly urban Latvia, walked by adults who watch the phone between
stops. Likelihood is how often a generated route would meet the hazard without mitigation; severity is the worst
realistic outcome.

| #   | Hazard                                                   | Likelihood | Severity | Why                                                                                                                                                                              |
| --- | -------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | Major roads: crossing away from a crossing               | High       | High     | Stops on both sides of a boulevard are common in Riga; the router crosses wherever the footpath network meets the road. Pedestrians made up 30% of Latvia's road deaths in 2024. |
| H2  | Walking along roads without sidewalks                    | Medium     | High     | Rural Latvia: gravel and tertiary roads at 90 km/h are often the only way. The router treats them as ordinary ways.                                                              |
| H3  | Water: quays, piers, riverbanks, ponds                   | Medium     | High     | Riga sits on the Daugava and its canals; viewpoints cluster on embankments. Latvia leads the EU in drowning deaths.                                                             |
| H4  | Thin ice in winter                                       | Low        | Critical | A task at a frozen pond invites stepping onto it. Rare, but fatal.                                                                                                              |
| H5  | Closed, private, military, or industrial land            | Medium     | Medium   | Freeport of Riga, Sarkandaugava, and old Soviet sites border residential streets. Trespass, guard dogs, heavy vehicles.                                                          |
| H6  | Construction sites                                       | Medium     | Medium   | OSM lags reality by days to months; fenced sites and diverted footpaths are common in Riga summers.                                                                             |
| H7  | Railways                                                 | Low        | Critical | The router crosses only at mapped crossings, but missing or wrong data can create a shortcut over tracks.                                                                       |
| H8  | Quarries, cliffs, steep terrain                          | Low        | High     | Gauja valley sandstone cliffs (Sigulda, Līgatne), quarry lakes, dune edges at the coast.                                                                                        |
| H9  | Forests and remote areas: getting lost, no signal        | Low        | Medium   | Rural starts may route through woodland tracks; a dead phone means no map.                                                                                                      |
| H10 | Darkness and time of day                                 | High       | Medium   | From October to March most evening walks happen in the dark. Latvian rules require reflectors on unlit roads.                                                                   |
| H11 | Weather and season: ice, heat, storms                    | High       | Medium   | Icy pavements from November to March; summer thunderstorms; rare heat waves.                                                                                                     |
| H12 | Poorly lit or isolated places                            | Medium     | Medium   | Parks and riverside paths empty out after dark; a solo walker is more exposed.                                                                                                  |
| H13 | Areas with crime concerns                                | Low        | High     | No open street-level crime data for Latvia; the app cannot judge this today.                                                                                                    |
| H14 | Stops unsuitable for tasks: cemeteries, worship, memorials | High     | Low      | The generator already picks churches and memorials. A silly game at the Freedom Monument or the Brothers' Cemetery offends others and embarrasses the couple.                    |
| H15 | Unreachable stops                                        | Medium     | Low      | A monument on an island or a garden behind a fence: users try to climb or wade to reach the 50 m check-in radius.                                                                |

H15 is not in the brief, but it causes H3 and H5 in practice: a stop that cannot be reached on foot tempts people off
the path.

## 2. Mitigations

### 2.1 What the foot router already does

`generateRoute` calls `routing.openstreetmap.de/routed-foot`, an OSRM server run by FOSSGIS. It uses FOSSGIS's own
[`foot.lua`](https://github.com/fossgis-routing-server/cbf-routing-profiles/blob/master/foot.lua), which differs from
[upstream OSRM's foot profile](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/foot.lua)
([about page](https://routing.openstreetmap.de/about.html)). Read from the source:

| The profile...                                                                                                      | Effect on safety                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Has no speed for `motorway` or `trunk`                                                                              | Never walks along them unless `foot=yes`. **Helps H1, H2.**                                                    |
| Weights `primary` 0.7, `secondary` 0.8, `tertiary` 0.9, `residential` 1.0, `footway`/`path`/`pedestrian` 1.2       | Prefers footways, but walks along a primary road when the detour exceeds roughly 40%. **Partial for H2.**       |
| Blocks `access`/`foot` = `no`, `private`, `agricultural`, `forestry`, `emergency`, `customers`, `delivery`, `destination` | Keeps the path off tagged private ways. **Helps H5**, only where tagged.                                  |
| Has an empty `construction_whitelist`; avoids `impassable` and `proposed`                                           | Skips `highway=construction`. **Helps H6**, only where mapped.                                                 |
| Routes railways only as `railway=platform`; crossings happen where footways meet tracks at a node                   | **Helps H7** when the data is right.                                                                           |
| Blocks `sac_scale` of `mountain_hiking` and harder; slows `hiking`                                                  | **Helps H8** on mapped trails.                                                                                 |
| Blocks barriers except gates, stiles, bollards, kerbs, and similar                                                  | Stops at walls and fences.                                                                                     |
| Routes `route=ferry` with weight 0.3                                                                                | **Adds a hazard:** a loop may include a river ferry (the Gauja has several). The app must reject these.        |
| Has no handling of `sidewalk=*`, `foot=use_sidepath`, `lit`, `crossing`, or `ford`                                  | Walks the carriageway of a road whose sidewalk is mapped separately or absent; crosses anywhere; ignores light. |

Upstream OSRM now blocks `foot=use_sidepath` and carriageways tagged `sidewalk=separate`; the FOSSGIS profile does
neither. The FOSSGIS data refreshes about every two days.

In short, the router keeps walkers off motorways and tagged private or construction ways. Everything about crossings,
sidewalks, light, water edges, and stop placement falls to Wannadoo.

### 2.2 The checks, in pipeline order

Stage 2 adds three layers around the current generator. Each is cheap and uses data already fetched.

1. **Candidate filter (tags on the stop itself).** Drop a candidate before it enters `buildLoop`.
2. **Containment filter (areas around the stop).** Drop a candidate that lies inside a hazard area.
3. **Route check (the routed path).** After routing, inspect the path; drop the offending stop and reroute, within the
   rate-limit budget of section 3.

Stops that pass but need respect get a `quiet` flag rather than removal (H14).

### 2.3 Per-hazard mitigations

**H1, major-road crossings.** Check the routed path, not the straight line between stops. Request the route with
`annotations=nodes`, which returns the OSM node IDs along the path (tested against the FOSSGIS server). Fetch major
roads (`highway` = `motorway|trunk|primary|secondary` and their `_link`s) with `out tags geom`, and the crossing nodes
on them. Where the path passes a node on a major road without continuing along that road, the walker crosses it. Accept
the crossing when the node carries `highway=crossing`, `highway=traffic_signals`, `crossing=*` (except `crossing=no`),
or `railway=crossing`; when the path passes over or under on a way tagged `bridge=*` or `tunnel=*`; or when the path
uses a `footway=crossing` way. Otherwise drop the stop that forces the crossing and reroute. Tertiary roads cross
freely in stage 2; they are usually 50 km/h two-lane streets.

Caveat, found while testing: OSRM prints node IDs above 10¹⁰ in floating-point form with ten significant digits, so
`13544555853` arrives as `1.354455585e+10`. IDs that high belong to nodes created since about 2021. Match those by
coordinates instead: request `overview=full&geometries=geojson` and treat a path vertex within 1 m of a crossing node
as that node.

**H2, roads without sidewalks.** Using the same node matching, find stretches where consecutive path nodes follow one
road way. Reject the route when it walks along:

- any way tagged `sidewalk=no|none`, `sidewalk:both=no`, or `foot=use_sidepath`, if its class is `tertiary` or above;
- any `primary`, `secondary`, or `trunk` way without a `sidewalk` tag for more than 100 m, unless `maxspeed` ≤ 50;
- any road with `maxspeed` > 50 for more than 300 m in total (rural gravel roads), unless no alternative exists, in
  which case flag the route and show the rural-road note (section 4).

To test tertiary and lower roads, the Overpass query must fetch them too; in stage 2, fetch them only when the start
lies outside a settlement (fewer than about 50 `building=*` within 300 m), where the payload stays small.

**H3, water.** Exclude candidates tagged `man_made=pier|breakwater|groyne`, `leisure=slipway`, `natural=beach`,
`leisure=swimming_area`, and anything inside `natural=water`, `water=*`, or `waterway=riverbank` areas (islands carry
their own polygons as inner rings, so point-in-polygon handles them). Riverside viewpoints stay, since the embankment
is the attraction; the route check keeps the path off piers. Reject any route whose OSRM steps include `mode: "ferry"`
(request `steps=true`), and any path node on a way tagged `ford=yes` or a node tagged `ford=yes`.

**H4, thin ice.** From November through March, drop candidates within 30 m of `natural=water` (ponds and lakes, which
freeze first), keep river embankments, and show the ice note. Tasks must never ask users to go onto water or ice; the
task guide (A1) should carry this rule.

**H5, closed, private, military, and industrial land.** Drop a candidate that carries or sits inside an area tagged:

- `landuse=industrial|military|railway|quarry|landfill|brownfield|construction`
- `military=*`, `aeroway=aerodrome`, `power=plant|substation`, `man_made=wastewater_plant|works`
- `access=private|no` on an area without `highway` or `building` (fenced grounds, private estates)
- on the candidate itself: `access=private|no`, `abandoned=yes`, `disused=yes`, `building=ruins`, `ruins=yes`

Keep `historic=ruins` only when also tagged `tourism=attraction` or `access=yes|permissive`; unmanaged ruins (common
Soviet leftovers) can collapse. For the path, reject routes that use `highway=service` or `track` inside an industrial,
military, quarry, or railway area; public streets through industrial zones stay allowed.

**H6, construction.** The router already skips `highway=construction`. Add the `landuse=construction` containment check
above, and drop candidates tagged `construction=*` or `disused:*`. OSM misses most short-lived sites, so the pre-quest
note tells users to skip a blocked stop, and stage 11 lets them report it.

**H7, railways.** Accept a path crossing a `railway=rail|light_rail|tram` way only at a node tagged
`railway=crossing|level_crossing`, or on a bridge or tunnel. Trams cross streets constantly in Riga; treat tram tracks
as part of the street they run in and skip this check for them in stage 2. Drop candidates inside `landuse=railway`.

**H8, quarries, cliffs, steep terrain.** Drop candidates within 30 m of a `natural=cliff` line and inside
`landuse=quarry`. A cliff-top viewpoint (Gauja valley) stays only when tagged `man_made=tower` or
`man_made=observation_platform`, which implies a built, railed platform. Reject paths that use `sac_scale` values above `hiking` (the router already blocks them).
OSM holds no slope data; the loop's short length keeps steep sections rare.

**H9, forests and remote areas.** Reject routes where more than half the path runs on `highway=track` or `path`
inside `landuse=forest` or `natural=wood`, unless the path follows a marked route (`route=hiking` relation). The loop
length caps the exposure. The app should cache the map tiles and route before the start, so a lost signal leaves the
line visible; that is a client feature, flagged here for stage 2 or later.

**H10, darkness.** Compute sunrise, sunset, and civil dusk on the phone (section 2.4). Before a quest:

- if the walk (the route's `durationMinutes`) ends after sunset, show the after-sunset warning;
- after civil dusk, prefer streets: drop candidates inside `leisure=park` or `natural=wood` unless the candidate or
  its park is tagged `lit=yes`;
- never block the quest; the couple decides.

**H11, weather and season.** Stage 2 uses the calendar only: from November to March the pre-quest note adds ice and
cold; from June to August it adds heat and thunderstorms. Live weather needs an API (section 2.5) and belongs later.

**H12, poorly lit or isolated places.** After dark, the H10 rule applies. OSM's `lit` tag covers some Riga streets and
few paths, so treat a missing tag as unknown, never as dark or lit. Solo walkers face more risk; a later option is a
"share my route" link to a trusted contact.

**H13, crime.** Stage 2 does nothing automatic, and should not guess from neighbourhood names or proxies such as
nightlife density; that would stigmatise areas on thin evidence. Latvia publishes crime statistics only at municipal
level. The UK publishes street-level data ([data.police.uk](https://data.police.uk/docs/)), useful when the app
launches there. User reports (stage 11) cover the gap.

**H14, stops unsuitable for tasks.** Mark as `quiet` any stop tagged `amenity=place_of_worship`, `historic=memorial`,
`historic=wayside_cross|wayside_shrine`, `memorial=*`, `historic=tomb`, or lying inside `landuse=cemetery` or
`amenity=grave_yard`. The quest engine (stage 3) then gives quiet stops only introductory, deep, or wrap-up tasks
(slots 1, 3, 5), never a silly game, and adds a respect line to the stop card. Stage 2 orders the loop so quiet stops
land on slots 1, 3, or 5, and allows at most two quiet stops per route. Keep the current exclusion of plaques and
stolpersteine. Sites of mass killing and mass graves (Rumbula, Biķernieki, Salaspils) deserve silence rather than a
task; OSM has no reliable tag for them, so they go on a curated exclusion list, seeded during the stage 2 audit.

**H15, unreachable stops.** OSRM returns each waypoint's snap distance (`waypoints[i].distance`, metres from the
requested point to the nearest routable way). Drop a stop whose snap distance exceeds 40 m: the user cannot reach its
50 m check-in radius on a path. This one check also catches most stops on private land, islands, and fenced sites.

### 2.4 Sunset and daylight on the phone

The standard [sunrise equation](https://en.wikipedia.org/wiki/Sunrise_equation) needs no API and fits in
`packages/core`. The version below gives sunrise and sunset (altitude −0.833°) and civil dusk (−6°). Tested for Riga,
it gives sunset 15:43 on December 21 and 22:21 on June 21 (local time), matching published tables within a minute; the
[NOAA solar calculator](https://gml.noaa.gov/grad/solcalc/) serves as a reference. [SunCalc](https://github.com/mourner/suncalc)
is an established 2 KB library with the same maths, if a dependency is preferred.

```ts
const RAD = Math.PI / 180;

// Sun times for the solar day nearest `now`. altitude: -0.833 for sunrise/sunset, -6 for civil twilight.
export function sunTimes(now: Date, lat: number, lng: number, altitude = -0.833):
  { rise: Date; set: Date } | "always-up" | "always-down" {
  const jd = now.getTime() / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545 + lng / 360);
  const jStar = n - lng / 360; // mean solar noon
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.sin(altitude * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosH < -1) return "always-up";
  if (cosH > 1) return "always-down";
  const h = Math.acos(cosH) / RAD / 360;
  const toDate = (j: number) => new Date((j - 2440587.5) * 86400000);
  return { rise: toDate(transit - h), set: toDate(transit + h) };
}
```

Use it as: dark now if `now < rise || now > set`; the warning shows when `now + durationMinutes > set`. The polar cases
never occur in Latvia but will in northern Scandinavia. Use the start position, which the app already has; the
calculation stays on the phone, so no location leaves it.

### 2.5 Weather options

Every live option needs a network call; none needs a paid plan to start.

| Option                                                                                             | Key      | Cost and terms                                                                                                          | Fit                                                           |
| -------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Calendar only (month → note)                                                                       | None     | Free                                                                                                                    | Stage 2                                                       |
| [MET Norway Locationforecast](https://api.met.no/doc/TermsOfService)                                | None     | Free, commercial use allowed, CC BY 4.0; requires an identifying User-Agent, so call it from a Supabase Edge Function that caches per area | Later; best free choice                                   |
| [Open-Meteo](https://open-meteo.com/en/terms)                                                       | None     | Free only for non-commercial use (10,000 calls a day); paid plan otherwise; CC BY 4.0                                     | Testing only, unless Wannadoo stays non-commercial          |
| [MeteoAlarm](https://meteoalarm.org/) warnings (fed by LVĢMC in Latvia)                             | Feed     | Public warning feeds; check reuse terms before use                                                                      | Later: show official warnings (storm, ice, heat) before a quest |

A later rule set: warn on temperature below −10 °C or above 28 °C, on freezing rain or a sub-zero temperature after
rain, on thunderstorm probability above 30% during the walk, and on any official orange or red warning.

### 2.6 Overpass query

One request replaces today's candidate query; it adds the hazard areas, major roads, and crossing nodes. Tested in
central Riga on September 30, 2026: HTTP 200, 353 KB, 113 crossing nodes, 19 trunk and 125 primary way segments. Clip
area geometry to the box with `geom(<bbox>)`, or the Daugava's relation returns kilometres of shoreline.

```
[out:json][timeout:25][bbox:{{S}},{{W}},{{N}},{{E}}];

// Stop candidates (today's query, unchanged)
(
  nwr[name][tourism~"^(attraction|viewpoint|artwork|museum|gallery)$"];
  nwr[name][historic~"^(monument|memorial|castle|church|ruins|building)$"];
  nwr[name][amenity~"^(place_of_worship|fountain|marketplace)$"];
  nwr[name][leisure~"^(park|garden)$"];
)->.cands;
.cands out tags center 400;

// Areas a stop must not sit in (H3, H5, H6, H8, H14)
(
  wr[landuse~"^(industrial|military|construction|railway|quarry|landfill|brownfield|cemetery)$"];
  wr[military];
  wr[aeroway=aerodrome];
  wr[power~"^(plant|substation)$"];
  wr[man_made~"^(wastewater_plant|works|pier|breakwater|groyne)$"];
  wr[access~"^(private|no)$"][!highway][!building];
  wr[amenity=grave_yard];
  wr[natural=water];
  way[natural=cliff];
)->.hazard;
.hazard out tags geom({{S}},{{W}},{{N}},{{E}});

// Major roads and the places to cross them (H1, H2)
way[highway~"^(motorway|trunk|primary|secondary)(_link)?$"]->.major;
.major out tags geom;
(
  node(w.major)[highway~"^(crossing|traffic_signals)$"];
  node(w.major)[crossing][crossing!=no];
  node(w.major)[railway~"^(crossing|level_crossing)$"];
)->.x;
.x out skel;
```

Two notes from testing. Overpass answers HTTP 406 to requests without a User-Agent header; browsers send one, but
scripts for the audit must set it. Multipolygon relations arrive as member ways; the client must assemble rings before
point-in-polygon, which [osmtogeojson](https://github.com/tyrasd/osmtogeojson) does in plain JavaScript suitable for
`packages/core`.

## 3. Now versus later

### Stage 2 (cheap, client-side)

| Mitigation                                                          | Cost                                         |
| ------------------------------------------------------------------- | -------------------------------------------- |
| Candidate tag filter (H3, H5, H6, H8)                               | None; tags already fetched                   |
| Containment filter against hazard areas                             | Larger Overpass response; one request still  |
| Snap-distance check (H15)                                           | None; router already returns it              |
| Ferry and ford rejection                                            | `steps=true` on existing router calls        |
| Major-road crossing and sidewalk check (H1, H2)                     | `annotations=nodes`; major roads in the query |
| `quiet` flag and slot ordering (H14)                                | None                                         |
| Sunset, dusk, and seasonal notes (H10, H11)                         | None                                         |
| Pre-quest safety note and terms copy                                | None                                         |

**Rate limits.** The FOSSGIS router allows one request per second and forbids heavy use
([policy](https://routing.openstreetmap.de/about.html)); the public Overpass instance tolerates about 10,000 queries
and 1 GB a day per user ([Overpass commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)). Safety
rejections cause reroutes, so stage 2 must:

- queue router calls at one per second at most;
- cap router calls per generation at eight, then fail with "Couldn't find a safe loop here";
- keep the 250 m place cache, now covering hazards and roads too;
- run the 200 simulated starts of the done-when test slowly (one start every few seconds), from a script that sets a
  User-Agent and spreads Overpass load across the two endpoints the generator already uses.

At scale, Wannadoo will outgrow both public services and should run its own OSRM and Overpass instances or pay a
provider; that decision belongs to launch, not stage 2.

### Later

| Mitigation                                                                           | Needs                                                   | Stage             |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------- |
| User reports of unsafe or unpleasant stops; reported stops drop out until reviewed   | A table, RLS, a review screen                           | 11                |
| Curated exclusion list (stop IDs and areas Edgar or reviewers block)                 | The same table, seeded by the stage 2 audit             | 11                |
| Live weather and official warnings                                                   | Edge Function proxy to MET Norway, MeteoAlarm terms     | 11 or native app  |
| Lighting beyond OSM `lit`: satellite night lights (VIIRS) or municipal lighting data | External data, preprocessing                            | Later             |
| Crime data                                                                            | Street-level open data (UK has it; Latvia does not)     | Per country       |
| Offline route and map cache                                                           | Service worker or native app                            | Native app        |
| Share-my-route for solo walkers                                                       | A link with expiry, no stored path                      | Later             |

### OSM data quality

OSM coverage varies by place and by tag, and every check above inherits its gaps:

- **Missing tags look safe.** An untagged private yard, an unmapped building site, or a road without `sidewalk` all
  pass. The checks reduce risk; they never prove safety.
- **Crossing nodes are patchy.** Some real crossings lack a tag, so the H1 check will reject some safe routes. That
  errs in the right direction; watch the rejection rate in the simulation.
- **Sidewalk tagging is sparse in Latvia.** Treat an untagged major road as risky, as H2 does.
- **Freshness differs.** Overpass reflects edits within minutes; the router's graph lags about two days; reality leads
  both by weeks for construction and seasonal closures.
- **Vandalism and errors happen.** A bad edit can open a private road. The snap and containment checks limit the damage.
- **Licence.** OSM data is ODbL; the app must show "© OpenStreetMap contributors" and, per FOSSGIS policy, attribution
  for the router.

## 4. Copy

Final wording goes through the task-design tone (A1). Drafts:

**Before every quest** (one screen, dismissable, a "don't show again" option after three quests):

> **Your route is a suggestion.** We picked these stops from the map, and nobody has walked this loop. Watch for
> traffic and cross at crossings. Skip any stop that looks closed, private, unsafe, or just wrong; skipping costs
> nothing. You know the street better than the map does.

**Added in winter (November to March):**

> Pavements and steps may be icy. Stay off frozen ponds and rivers, whatever the task says.

**Added on a rural route (H2 flag):**

> Part of this loop follows a road without a pavement. Walk facing traffic, single file, and wear a reflector after
> dark.

**After-sunset warning** (walk ends after sunset; the times are computed):

> **It gets dark at 16:42.** This walk takes about 50 minutes and will end after sunset. Stick to lit streets, wear a
> reflector (Latvian rules require one on unlit roads), and skip any stop that feels too quiet. Want a shorter loop?

Buttons: **Walk anyway**, **Shorter loop**, **Maybe tomorrow**.

**On a quiet stop card:**

> This is a place of remembrance. Keep it quiet here, and let the photo wait if people are grieving or praying.

**Terms of use and tester notice (needs legal review).** The notice should say, in substance:

- Routes are generated automatically from OpenStreetMap, an open map maintained by volunteers, and may be wrong,
  incomplete, or out of date.
- Nobody checks routes in person. The app does not know about traffic, weather, closures, or local conditions.
- Users decide where to walk and follow traffic rules and local signs; the route never overrides them.
- Users should not use the app while crossing a road and should stop walking to read the phone.
- The app is in testing; features may change or fail.

Flag for the lawyer: our understanding is that EU consumer law (the [Unfair Contract Terms Directive
93/13/EEC](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31993L0013), Annex point 1(a)) and the UK's
[Consumer Rights Act 2015, section 65](https://www.legislation.gov.uk/ukpga/2015/15/section/65) prevent a business from
excluding liability for death or personal injury caused by its negligence. If so, the notice informs and warns; it
does not transfer responsibility, and the filtering in this document is part of reasonable care. A lawyer must confirm
this for Latvia, the EU, and the UK before launch, and review the wording above.

## 5. Stage 2 test plan

Stage 2 is done when 200 simulated starts produce valid five-stop loops within the limit, and a manual audit of 30 of
them finds no unsafe stop.

### Start points

Use five areas, each with a hazard it stresses. Coordinates are approximate; pick exact start points on a public street
and record them in the test script. Draw 40 simulated starts per area by jittering each point randomly within 300 m
(discard any jittered start not on a public way, using the router's snap distance).

| Area                     | Start (lat, lng)     | Stresses                                                                                   |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------ |
| Central Riga, Old Town   | 56.9496, 24.1052     | Dense stops, churches and memorials (H14), 11. novembra krastmala and Krasta iela (H1)     |
| Residential suburb, Purvciems | 56.9570, 24.1990 | Wide boulevards between housing blocks (H1), few named stops, fallback points             |
| Industrial edge, Sarkandaugava | 57.0015, 24.1195 | Freeport land, rail yards, private grounds (H5, H7)                                    |
| Riverside, Ķīpsala       | 56.9540, 24.0830     | Daugava embankments, piers, the Vanšu bridge approaches (H1, H3)                          |
| Rural village, Līgatne   | 57.2330, 25.0380     | Gauja sandstone cliffs, forest tracks, a river ferry, roads without pavements (H2, H8, H9) |

Run a second pass of the rural and riverside sets with the date set to January (ice rules) and a start time of 17:00
(darkness rules).

### Automated checks on all 200

The script records, per start: success or the failure message, stop count, routed distance, router calls used, and
every rejection with its reason (H-number). It fails the stage if any route has fewer than five stops, exceeds the
distance limit, uses a ferry, or has a stop with snap distance above 40 m. It reports the rejection rate per area; a
rate above 50% means the filters are too strict or the data too sparse there.

### Manual audit of 30

Pick six routes per area at random. For each, open the path and stops on openstreetmap.org and in satellite imagery
(and street-level imagery where available), and answer:

**Stops**

- [ ] Each stop is on or beside a public way, reachable without climbing, wading, or passing a gate or fence.
- [ ] No stop sits on private, military, industrial, railway, construction, quarry, or fenced land.
- [ ] No stop sits on a pier, breakwater, beach edge, or in water; in the January set, none within 30 m of a pond or lake.
- [ ] No stop sits within 30 m of a cliff edge or quarry.
- [ ] Every church, memorial, and cemetery stop carries the quiet flag and sits on slot 1, 3, or 5.
- [ ] No stop is a mass-grave or execution site.
- [ ] No stop is an unmanaged ruin or abandoned building.

**Path**

- [ ] Every crossing of a primary, secondary, or trunk road happens at a marked crossing, signals, a bridge, or a
      tunnel.
- [ ] The path never walks along a primary or secondary road without a pavement or a separate footway.
- [ ] Every railway crossing is a level crossing, bridge, or underpass.
- [ ] No ferry, ford, or stepping stones.
- [ ] No service road or track through industrial or military land.
- [ ] In the rural set, any stretch along a road without pavement is under 300 m or carries the rural note.
- [ ] Total length ≤ 2.1 km (2 km plus 100 m slack) and the loop returns to the start.

**Context**

- [ ] The 17:00 January runs show the after-sunset warning with the right time.
- [ ] The January runs show the ice note.
- [ ] Nothing about the route would make Edgar hesitate to send his own family on it.

Record each failure with the start, stop ID, and reason. A failure caused by wrong OSM data counts as a failure; fix
it by adding the stop or area to the curated exclusion list (seeded now, used in stage 11), and, where the data is
plainly wrong, by correcting OSM. The audit passes at zero unsafe stops and zero unsafe crossings across all 30.

## Sources

- FOSSGIS foot profile: [cbf-routing-profiles/foot.lua](https://github.com/fossgis-routing-server/cbf-routing-profiles/blob/master/foot.lua);
  upstream: [osrm-backend/profiles/foot.lua](https://github.com/Project-OSRM/osrm-backend/blob/master/profiles/foot.lua);
  service and usage policy: [routing.openstreetmap.de/about](https://routing.openstreetmap.de/about.html)
- OSRM route service (`annotations`, `steps`, waypoint `distance`):
  [OSRM API docs](https://project-osrm.org/docs/v5.24.0/api/#route-service)
- Overpass usage limits: [Overpass API by Example, commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
- OSM tags: [access](https://wiki.openstreetmap.org/wiki/Key:access),
  [sidewalk](https://wiki.openstreetmap.org/wiki/Key:sidewalk),
  [crossing](https://wiki.openstreetmap.org/wiki/Key:crossing), [lit](https://wiki.openstreetmap.org/wiki/Key:lit),
  [landuse](https://wiki.openstreetmap.org/wiki/Key:landuse), [memorial](https://wiki.openstreetmap.org/wiki/Key:memorial)
- Latvian pedestrian deaths: [ERSO country overview 2024, Latvia](https://road-safety.transport.ec.europa.eu/document/download/00c3efea-8f20-4d47-a5f2-147e8fe63333_en?filename=erso-country-overview-2024-latvia.pdf);
  [ETSC PIN report](https://etsc.eu/17th-annual-road-safety-performance-index-pin-report/)
- Latvian drowning deaths: [LSM, August 5, 2025](https://eng.lsm.lv/article/society/society/05.08.2025-latvia-retains-its-drowning-deaths-reputation-despite-some-improvement.a609090/);
  [Eurostat accidents and injuries](https://ec.europa.eu/eurostat/statistics-explained/SEPDF/cache/37381.pdf?v=7591249582301162)
- Reflector rules: [LSM, dark road dangers](https://eng.lsm.lv/article/society/society/dark-road-dangers-call-for-mandatory-reflective-vests.a95523/);
  [LSM, October 29, 2025](https://eng.lsm.lv/article/society/society/29.10.2025-shine-bright-this-dark-winter-in-latvia.a620222/)
- Sun position: [Sunrise equation](https://en.wikipedia.org/wiki/Sunrise_equation); [NOAA solar calculator](https://gml.noaa.gov/grad/solcalc/);
  [SunCalc](https://github.com/mourner/suncalc)
- Weather: [MET Norway terms](https://api.met.no/doc/TermsOfService); [Open-Meteo terms](https://open-meteo.com/en/terms);
  [MeteoAlarm](https://meteoalarm.org/)
- Crime data: [data.police.uk](https://data.police.uk/docs/)
