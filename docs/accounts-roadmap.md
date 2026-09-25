# Accounts, partners, and albums: roadmap and spec

Status: draft, September 24, 2026. Owner: Edgar.

This document turns Wannadoo from a single-browser demo into an MVP with real accounts. Users sign in with Google or an
emailed link, link to a partner and can later unlink, upload trail photos to the cloud, and save a generated album to
their phone. Supabase provides authentication, the database, and photo storage.

The roadmap runs in eight phases. Every task carries one of three tags:

- **[Agent]**: a coding agent can do it in the repository, start to finish, and open a pull request.
- **[You]**: needs you. Examples: creating accounts, paying, signing contracts, pasting secrets, and making product or
  legal decisions.
- **[Legal]**: a compliance or liability point. The register in section 9 lists each one with a proposed solution.

This spec is not legal advice. It points out where EU law applies, and UK law for UK users, and suggests reasonable
defaults. Have a Latvian lawyer review the items marked for review before public launch.

## 1. Decisions already made

| Decision               | Choice                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Backend                | Supabase: Auth, Postgres, Storage, Edge Functions                                                                      |
| Home jurisdiction      | Latvia. The EU GDPR governs, and the Data State Inspectorate (Datu valsts inspekcija, DVI) supervises                  |
| First users            | Latvia and the rest of the EU. UK users are welcome, and the UK GDPR applies to them alongside                         |
| Data region            | Supabase EU (Frankfurt, `eu-central-1`); data stays in the EU, and the UK treats the EU as adequate for UK users' data |
| Photos after unlinking | Both people keep the photos from their shared trails; neither sees the other's new ones                                |
| Legal entity           | A Latvian company (SIA) is planned. Until it exists, you personally are the data controller                            |
| Sign-in                | Google OAuth and email magic link / one-time code. No passwords                                                        |
| Client                 | The existing web app on Vercel. No native app in this MVP                                                              |

## 2. Scope

**In scope:**

- Sign-in, sign-out, and a profile with display name, username, and avatar
- An 18+ age confirmation and acceptance of the terms at first sign-in
- Linking a partner with an invite link or QR code, and unlinking
- Trail runs saved on the server, visible to both partners on their own phones
- Photo upload, resized and stripped of metadata on the phone before upload
- A generated album image per trail, saved to the phone through the share sheet
- Account deletion and data export in the app
- A privacy policy, terms, and the paperwork behind them

**Out of scope:** a native app, offline or travel mode, live location sharing between partners, public or social
sharing, payments, push notifications, and the First Dates "share location with a friend" feature. Each of these
changes the risk picture, so each gets its own spec.

## 3. Architecture

```
Browser (Vercel, static)                       Supabase (EU)
┌──────────────────────────────┐              ┌──────────────────────────────────┐
│ screens/*                    │              │ Auth: Google, email OTP          │
│   ↓ calls only               │  HTTPS +     │ Postgres + row-level security    │
│ lib/auth.ts                  │  user JWT    │   profiles, couples, invites,    │
│ lib/couples.ts               │ ───────────► │   trail_runs, photos …           │
│ lib/runs.ts                  │              │ Storage: private "photos" bucket │
│ lib/photos.ts                │              │ Edge Functions: delete-account,  │
│ lib/album.ts  (canvas, local)│              │   export-data                    │
└──────────────────────────────┘              └──────────────────────────────────┘
   GPS stays on the phone. Overpass and FOSSGIS calls stay in the browser, as today.
```

Rules for the code:

- Only `apps/web/src/lib/*` imports `@supabase/supabase-js`. Screens call the wrappers, and `packages/core` stays free
  of storage code, as the CLAUDE.md requires.
- The browser holds only the public `anon` key. The `service_role` key lives only in Edge Functions and never reaches
  the repository, Vercel, or the client bundle.
- Every table has row-level security (RLS) turned on with no default access. The database, not the client, decides
  who sees what.
- The schema lives in `supabase/migrations/*.sql` and reaches staging and production only through migrations, never
  through edits in the dashboard.

## 4. Data model

The key idea: **membership of a trail run grants access to its photos. Being a couple does not.** Unlinking ends the
couple, but both people stay members of the runs they walked together, so both keep those photos. New runs after
unlinking have only one member.

```sql
profiles            -- one row per auth user, created by a trigger on sign-up
  id uuid pk → auth.users.id
  display_name text, username citext unique, avatar_path text null
  age_confirmed_at timestamptz, terms_version text, terms_accepted_at timestamptz
  created_at timestamptz

couples
  id uuid pk, created_at timestamptz
  ended_at timestamptz null, ended_by uuid null

couple_members      -- partial unique index: a user belongs to at most one active couple
  couple_id → couples, user_id → profiles, joined_at
  unique (user_id) where couple has ended_at is null   -- enforced by trigger or RPC

invites             -- single-use, short-lived
  id uuid pk, inviter_id → profiles
  code_hash text unique          -- store a SHA-256 hash, never the code itself
  expires_at timestamptz (now + 24 h), redeemed_at null, redeemed_by null

trail_runs
  id uuid pk, couple_id → couples null (null = solo run)
  trail_id text, trail_snapshot jsonb   -- stops only; see "Home location" below
  started_at, completed_at null, abandoned_at null

trail_run_members   -- the access list; survives unlinking
  run_id → trail_runs, user_id → profiles, pk (run_id, user_id)

stop_completions
  run_id → trail_runs, stop_id text (e.g. osm-node-123), completed_by, completed_at
  pk (run_id, stop_id)

photos
  id uuid pk, run_id → trail_runs, stop_id text, uploader_id → profiles
  storage_path text  -- photos/{run_id}/{photo_id}.jpg
  width int, height int, created_at

photo_hidden        -- "remove from my album" without deleting for the partner
  user_id, photo_id, pk (user_id, photo_id)
```

**Home location [Legal].** A generated `Trail` stores `start` and a `path` that begin and end at the user's position,
often their home (`packages/core/src/trail.ts`). Before saving a snapshot, `lib/runs.ts` drops `start` and `path` and
keeps only the stops, which are public places. The map redraws the walking path on the phone when needed.

## 5. Access rules

| Table / bucket                    | Read                                                                                          | Write                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `profiles`                        | Self; your active partner; fellow members of your runs (name and avatar only, through a view) | Self only; `id` and consent fields go through RPC                            |
| `couples`, `couple_members`       | Members of that couple                                                                        | RPCs only: `redeem_invite`, `unlink`                                         |
| `invites`                         | Inviter only                                                                                  | RPC `create_invite` (inviter), `redeem_invite` (security definer)            |
| `trail_runs`, `trail_run_members` | Run members                                                                                   | RPC `start_run` adds you and your active partner; members update status      |
| `stop_completions`                | Run members                                                                                   | Run members, while the run is active                                         |
| `photos`                          | Run members, minus rows in `photo_hidden`                                                     | Insert: run member, `uploader_id = auth.uid()`, run active. Delete: uploader |
| Storage `photos/`                 | Run members, through signed URLs valid for one hour                                           | Upload: run member, to their own run's folder; 5 MB cap; `image/jpeg` only   |

Every rule gets a pgTAP test that signs in as user A, user B, and a stranger, and checks both allowed and refused
access. CI runs these tests on every pull request.

## 6. Flows

### 6.1 Sign-in and onboarding

1. The welcome screen offers **Continue with Google** and **Continue with email**.
2. Email sends a six-digit code and a magic link. The code matters on iOS, where the link can open in a different
   browser than the app.
3. At first sign-in, the user picks a display name and username and ticks two separate boxes: "I am 18 or older" and
   "I agree to the Terms and have read the Privacy Policy" (both linked). The app stores the timestamps and the terms
   version.
4. The session lives in `localStorage` through supabase-js. That counts as strictly necessary storage, so it needs no
   cookie banner.

The `WhoAmI` screen and the test profiles in `packages/core/src/profiles.ts` go away from production. Seeded test users
in the local Supabase replace them for development.

### 6.2 Linking

1. A creates an invite. The app shows a QR code and a share link: `https://<domain>/link/<code>`. The code has 10
   random base32 characters, is valid for 24 hours, and works once.
2. B opens the link or scans the code, signs in if needed, and sees "A wants to link with you" with a plain-language
   notice: "Once linked, you both see the trails you walk together and their photos. If you unlink, you each keep the
   photos from trails you walked together."
3. B taps **Link**. The `redeem_invite` RPC checks the hash, expiry, and single use, confirms neither person is already
   linked, and creates the couple.

Looking someone up by email goes away, because it reveals whether a given person uses a couples app **[Legal]**.
Usernames stay only as a display name; nobody can search for them.

### 6.3 Unlinking

1. Either partner taps **Unlink** in settings and confirms once. No approval from the other person, no waiting period.
2. `unlink()` sets `ended_at`. Any active run gets marked abandoned; both stay members of it.
3. The other partner sees "You are no longer linked" the next time they open the app. The app sends no email or push
   message and gives no reason **[Legal]**.
4. Both keep their past albums. Each can hide individual photos from their own album. An uploader can delete a photo
   they took, which removes it for both.

### 6.4 Trail run and photos

1. Starting a trail calls `start_run`, which saves the stop-only snapshot and adds both partners as members.
2. At a stop, the chosen photo gets redrawn on a canvas, scaled to at most 2048 px on the long edge, and saved as a
   JPEG at quality 0.8, about 300–600 KB. Redrawing strips EXIF data, including GPS and camera serial numbers
   **[Legal]**.
3. The phone uploads to `photos/{run_id}/{photo_id}.jpg`, then inserts the `photos` and `stop_completions` rows.
   If the upload fails, the app keeps the photo in memory and offers **Retry**.
4. The partner's phone picks up the change when the app regains focus. Live updates through Supabase Realtime are an
   optional extra (phase 4b).

### 6.5 Album and saving to the phone

1. The completion screen loads the run's photos through signed URLs.
2. `lib/album.ts` draws a collage on a canvas: title, date, stop names, and photos, 1080 × 1920 pixels (story format),
   then exports a JPEG blob. This happens entirely on the phone.
3. **Save** calls `navigator.share({ files: [albumFile] })` when `navigator.canShare` accepts it. On iOS and Android
   the share sheet offers "Save Image", which puts it in the photo library. Otherwise the app falls back to a
   download link.
4. **Save all photos** shares the individual JPEGs the same way.

### 6.6 Account deletion and data export

- **Delete account** (settings, confirmed twice) calls the `delete-account` Edge Function. It unlinks the user, deletes
  the photos they uploaded (from storage and the database), removes them from run membership, deletes the profile, and
  deletes the auth user. Photos the partner uploaded stay with the partner **[Legal]**.
- **Download my data** calls `export-data`, which returns a ZIP with a JSON file of the profile, couples, runs, and
  completions, plus the user's own uploaded photos.

## 7. Roadmap

Time estimates assume agents write the code and you review each pull request. "Your time" counts hands-on hours; the
elapsed time depends on how quickly you review and on how long outside providers take.

### Phase 0: Accounts and foundations. Your time: about 3 hours

Set every account up so it can move to the company later: register with a role address on your own domain (for
example `admin@<domain>`), not a personal Gmail, and use each service's organisation feature where it has one.

| #   | Task                                                                                                                                                                                                                | Tag           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0.1 | Buy the domain; set up a mailbox or forwarding for `admin@`, `privacy@`, `support@`                                                                                                                                 | [You]         |
| 0.2 | Create a Supabase organisation with two projects, `wannadoo-staging` and `wannadoo-prod`, both in `eu-central-1`. Store the database passwords in a password manager                                                | [You]         |
| 0.3 | Accept the Supabase Data Processing Addendum (dashboard → Organization → Legal Documents)                                                                                                                           | [You] [Legal] |
| 0.4 | Create a Google Cloud project, configure the OAuth consent screen (app name, support email, privacy policy URL, authorised domain), and create a Web OAuth client with the Supabase callback URLs for both projects | [You]         |
| 0.5 | Sign up for a transactional email provider with EU data handling (for example Resend or Postmark), verify the domain (SPF, DKIM, DMARC records), accept its DPA                                                     | [You] [Legal] |
| 0.6 | Move the Vercel project into a Vercel team; accept Vercel's DPA; add the custom domain                                                                                                                              | [You] [Legal] |
| 0.7 | Install Docker Desktop and the Supabase CLI on your machine, for local development                                                                                                                                  | [You]         |
| 0.8 | Paste secrets where the agent asks: Vercel env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` per environment; GitHub Actions secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, project refs             | [You]         |

**Done when:** both projects exist in the EU, Google sign-in and SMTP are configured in both, and the DPAs are signed.

### Phase 1: Backend skeleton. Agent: 1 day

| #   | Task                                                                                                                                                           | Tag     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1.1 | `supabase init`; add `supabase/config.toml`, a seed file with three test users (A, B, stranger), and npm scripts `db:start`, `db:reset`, `db:test`, `db:types` | [Agent] |
| 1.2 | Write the migrations for section 4, with RLS on every table and the RPCs from section 5                                                                        | [Agent] |
| 1.3 | Write pgTAP tests for every access rule in section 5                                                                                                           | [Agent] |
| 1.4 | Generate TypeScript types into `apps/web/src/lib/database.types.ts`                                                                                            | [Agent] |
| 1.5 | CI: start local Supabase, run `supabase test db`. A deploy workflow pushes migrations to staging on merge to `main` and to production on a manual trigger      | [Agent] |
| 1.6 | Review the schema and the unlink/deletion rules against this spec                                                                                              | [You]   |

**Done when:** `npm run db:test` passes locally and in CI, and a stranger's access is refused in every test.

### Phase 2: Sign-in. Agent: 1–1.5 days

| #   | Task                                                                                                                                                                                       | Tag                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| 2.1 | `lib/auth.ts`: Google, email OTP, sign-out, session listener                                                                                                                               | [Agent]                           |
| 2.2 | Welcome, email-code, and onboarding screens (name, username, 18+ box, terms box), at 390 px                                                                                                | [Agent]                           |
| 2.3 | Replace `lib/session.ts` and the `WhoAmI` screen; keep a dev-only profile switcher that signs in as seeded users against local Supabase                                                    | [Agent]                           |
| 2.4 | Configure the Supabase auth settings: site URL, redirect URLs (production, staging, Vercel previews, localhost), OTP expiry 10 minutes, custom SMTP, email templates carrying the app name | [You], agent writes the checklist |
| 2.5 | Test Google and email sign-in on your own iPhone and an Android phone, on staging                                                                                                          | [You]                             |

**Done when:** a new user can sign in both ways on a phone, finish onboarding, and sign out.

### Phase 3: Linking and unlinking. Agent: 1 day

| #   | Task                                                                                                                                              | Tag     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 3.1 | `lib/couples.ts`: create invite, redeem, unlink, current partner                                                                                  | [Agent] |
| 3.2 | Rework `PartnerLink.tsx`: invite QR and share link, the accept screen with the notice from 6.2, and the `/link/<code>` route. Remove email lookup | [Agent] |
| 3.3 | Unlink in a new settings screen, with the flow from 6.3                                                                                           | [Agent] |
| 3.4 | Rate limit: `redeem_invite` refuses after 10 failed attempts per user per hour                                                                    | [Agent] |
| 3.5 | Approve the wording of the link notice and the unlink confirmation                                                                                | [You]   |

**Done when:** two phones link by QR, both show each other, either can unlink, and the tests in 1.3 still pass.

### Phase 4: Trail runs and photos on the server. Agent: 1.5–2 days

| #   | Task                                                                                                                                                | Tag     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 4.1 | `lib/runs.ts`: start, load active run, complete stop, abandon. Strip `start` and `path` before saving                                               | [Agent] |
| 4.2 | `lib/photos.ts`: resize and re-encode, upload, signed URLs, hide, delete                                                                            | [Agent] |
| 4.3 | Rewire `App.tsx` from `progress.ts` and `activeRoute.ts` to the new wrappers; refresh on focus. Existing demo data in `localStorage` gets discarded | [Agent] |
| 4.4 | Unit tests for the snapshot stripping and the resize function                                                                                       | [Agent] |
| 4.5 | (4b, optional) Realtime subscription so the partner's phone updates within seconds                                                                  | [Agent] |

**Done when:** a stop completed on one phone shows on the partner's phone, photos load from storage, and a downloaded
photo carries no GPS data (check with an EXIF viewer).

### Phase 5: Album and saving. Agent: 1 day

| #   | Task                                                                                                              | Tag     |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| 5.1 | `lib/album.ts`: collage layout on canvas, JPEG export                                                             | [Agent] |
| 5.2 | Rework `CompleteScreen.tsx`: album preview, **Save album**, **Save all photos**, share-sheet fallback to download | [Agent] |
| 5.3 | An "Albums" list of past runs, including runs from a previous partner                                             | [Agent] |
| 5.4 | Check that "Save Image" puts the album in the photo library on iOS Safari and Android Chrome                      | [You]   |

### Phase 6: Privacy features and paperwork. Agent: 1 day. Your time: 1–2 days, plus lawyer

| #   | Task                                                                                                                                                                                                        | Tag                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 6.1 | `delete-account` and `export-data` Edge Functions, settings screen entries, and tests                                                                                                                       | [Agent]                           |
| 6.2 | A scheduled job (pg_cron) that deletes expired invites and abandoned sign-ups older than 30 days                                                                                                            | [Agent]                           |
| 6.3 | Draft the privacy policy, terms of use, and record of processing from section 9, and publish them at `/privacy` and `/terms`                                                                                | [Agent] drafts, [You] approve     |
| 6.4 | Draft a short data protection impact assessment (DPIA) from the register in section 9                                                                                                                       | [Agent] drafts, [You] own         |
| 6.5 | Draft the DSA hosting-service measures: a "report a problem" contact, notice-and-action, and a contact point in the terms. Add the UK Online Safety Act risk assessment only if UK users become significant | [Agent] drafts, [You] own [Legal] |
| 6.6 | Keep the record of processing (6.3) ready for the DVI. Latvia requires no controller registration and charges no fee                                                                                        | [You] [Legal]                     |
| 6.7 | Have a Latvian lawyer review the privacy policy, terms, DPIA, and the open legal questions in section 10                                                                                                    | [You] [Legal]                     |

### Phase 7: Hardening and launch. Agent: 1 day. Your time: half a day, then the beta

| #   | Task                                                                                                                                                                                   | Tag                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 7.1 | Security review of the diff: RLS, storage policies, secrets in the bundle, open redirects in auth URLs                                                                                 | [Agent]                   |
| 7.2 | Security headers in `vercel.json`: Content-Security-Policy, `Referrer-Policy: no-referrer` (keeps invite codes out of referrers), `Permissions-Policy`                                 | [Agent]                   |
| 7.3 | Write the incident runbook: who decides, how to rotate keys, the 72-hour notification clock                                                                                            | [Agent] drafts, [You] own |
| 7.4 | Upgrade the production project to Supabase Pro for daily backups and to stop the free tier's inactivity pause. Turn on leaked-password and MFA protection for your own dashboard login | [You]                     |
| 7.5 | Publish the Google OAuth consent screen (out of "Testing", which caps you at 100 users)                                                                                                | [You]                     |
| 7.6 | Closed beta with 5–10 couples you know; collect bugs                                                                                                                                   | [You]                     |
| 7.7 | Incorporate the Latvian company (SIA), then transfer the organisations, domain, and contracts to it before public launch                                                               | [You] [Legal]             |

**Total:** about 8–10 agent-days of code and review, and about 4–6 days of your own time spread over 3–5 weeks. The
Google consent screen, the lawyer, and incorporation set the pace; the code does not.

## 8. Costs

Check current prices before buying; these reflect roughly what the services charge today.

| Item                                                                                                      | Cost                                                                                                                 | When       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| Domain                                                                                                    | about €10–15 a year                                                                                                  | Phase 0    |
| Supabase staging and early production                                                                     | Free tier                                                                                                            | Phases 0–6 |
| Supabase Pro for production                                                                               | about $25 a month                                                                                                    | Phase 7    |
| Transactional email                                                                                       | Free tier covers a beta                                                                                              | Phase 0    |
| Google Cloud OAuth                                                                                        | Free                                                                                                                 | Phase 0    |
| Vercel                                                                                                    | Hobby is free, but its terms forbid commercial use; move to Pro (about $20 per member a month) before charging money | Phase 7    |
| DVI registration                                                                                          | none; Latvia charges no fee                                                                                          | Phase 6    |
| Lawyer review                                                                                             | a few hundred to low thousands of euros, depending on scope                                                          | Phase 6    |
| Optional: Supabase custom domain, so Google's consent screen shows your domain instead of `*.supabase.co` | about $10 a month                                                                                                    | Any time   |

## 9. Compliance and security register

Each row names where the issue arises, the risk, the proposed solution, and who acts.

| ID  | Issue                                                    | Where                                    | Risk                                                                                                                                                                                            | Solution                                                                                                                                                                                                                                                                                                                         | Owner                     |
| --- | -------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| C1  | **Controller before incorporation**                      | Everything                               | Until the company exists, you are personally the data controller and personally liable for breaches and claims                                                                                  | Run only a closed beta until the company exists (7.7). Open accounts on role addresses so they transfer. Get the terms' liability cap reviewed                                                                                                                                                                                   | You                       |
| C2  | **Lawful basis and transparency**                        | Onboarding, all processing               | Processing without a stated basis or notice breaches Articles 6 and 13                                                                                                                          | Contract (Art. 6(1)(b)) for accounts, linking, runs, and photos. Legitimate interests for security logs. A privacy policy covering each purpose, processor, region, and retention period. Consent only where section C4 requires it                                                                                              | Agent drafts, you approve |
| C3  | **Processors and transfers**                             | Supabase, Vercel, email provider, Google | Using processors without contracts; transfers outside the UK/EU                                                                                                                                 | Sign each DPA (0.3, 0.5, 0.6). Data sits in Frankfurt. Supabase and Vercel are US companies, so their DPAs rely on the EU SCCs, the UK addendum, and the EU–US Data Privacy Framework; name them in the privacy policy. Google acts as a separate controller for "Sign in with Google"                                           | You                       |
| C4  | **Relationships can reveal sexual orientation**          | Linking                                  | Two linked accounts may reveal sexual orientation, a special category under Art. 9                                                                                                              | Collect no gender or orientation. Never use couple data to profile, advertise, or segment. Ask the lawyer whether explicit consent at linking is needed; the link notice in 6.2 can carry a consent sentence at no cost                                                                                                          | You, lawyer               |
| C5  | **Location data**                                        | Route generation, snapshots, photos      | Start points reveal homes; EXIF GPS in photos; the current position goes to Overpass, FOSSGIS, and OSM tile servers                                                                             | Keep GPS on the phone. Strip `start` and `path` from snapshots (4.1). Strip EXIF (4.2). Disclose the three map services in the privacy policy. Store no location history beyond completed public stops                                                                                                                           | Agent                     |
| C6  | **Abusive or controlling partners**                      | Linking, unlinking                       | A partner uses the app to monitor the other                                                                                                                                                     | Unlink is instant and one-sided, with no notification content (6.3). No live location sharing in this MVP. No "last seen" or activity timestamps shown to the partner. Linking needs the invitee's explicit tap                                                                                                                  | Agent                     |
| C7  | **Photos of an ex after unlinking**                      | Unlinking, deletion                      | A person may want photos of themselves removed from an ex's album; the right to erasure (Art. 17) can conflict with the partner's copy                                                          | Tell both people at linking (6.2). Uploaders can delete their own photos everywhere. Account deletion removes the user's uploads. For photos the ex took, handle erasure requests by email to `privacy@` within one month, weighing both parties' rights; write the procedure into the privacy policy. Ask the lawyer to confirm | You, lawyer               |
| C8  | **Bystanders in photos**                                 | Photo upload                             | Strangers appear in the background of photos                                                                                                                                                    | Photos stay private to run members and never become public. The terms forbid uploading content that infringes others' rights                                                                                                                                                                                                     | Agent drafts terms        |
| C9  | **Children**                                             | Sign-up                                  | Under-18 users bring higher duties under GDPR Art. 8 and the DSA's protection of minors, plus the UK Children's Code for UK users; the First Dates mode makes minors a safeguarding risk        | 18+ gate with its own tick box; the terms state the age limit; close accounts reported as under 18. Ask the lawyer whether self-declaration suffices for a couples app                                                                                                                                                           | Agent, you                |
| C10 | **Digital Services Act (EU) and Online Safety Act (UK)** | Photo sharing between partners           | Sharing photos between users makes Wannadoo a hosting service under the DSA, supervised by Latvia's Digital Services Coordinator, and a user-to-user service under the OSA once it has UK users | Add a report contact, a notice-and-action procedure, and a contact point in the terms (6.5). Ask the lawyer which DSA exemptions for micro and small enterprises apply. Complete Ofcom's illegal-content and children's access assessments if UK users become significant                                                        | You, lawyer               |
| C11 | **Broken access control**                                | Database, storage                        | A policy mistake exposes one couple's photos to another user; this is the most likely serious breach                                                                                            | RLS on every table, default refuse. Private bucket with short-lived signed URLs. pgTAP tests for every rule in CI (1.3). Only Edge Functions hold the `service_role` key. A security review before launch (7.1)                                                                                                                  | Agent                     |
| C12 | **Account enumeration and invite guessing**              | Linking, sign-in                         | Searching by email reveals who uses the app; weak invite codes get guessed                                                                                                                      | Remove email lookup. 50-bit single-use codes that expire in 24 hours, stored hashed, with attempt limits (3.4). Supabase's built-in auth rate limits stay on                                                                                                                                                                     | Agent                     |
| C13 | **Sign-in security**                                     | Auth                                     | Account takeover through a stolen email link or a misconfigured redirect                                                                                                                        | No passwords. OTPs expire in 10 minutes. An exact allow-list of redirect URLs. DMARC on the email domain to stop spoofing. MFA on every admin account (Supabase, Vercel, Google Cloud, GitHub, domain registrar)                                                                                                                 | You                       |
| C14 | **Breach response**                                      | Operations                               | GDPR requires telling the DVI within 72 hours of a qualifying breach, and sometimes telling users                                                                                               | The runbook (7.3): contacts, key rotation steps, a DVI reporting template (and the ICO's, if UK users are affected), a breach log                                                                                                                                                                                                | You                       |
| C15 | **Retention and backups**                                | Database, storage                        | Keeping data longer than needed; deleted data lingering in backups                                                                                                                              | Delete expired invites and abandoned sign-ups after 30 days (6.2). Deleted accounts go at once; backups roll off within 7 days on Pro. State both periods in the privacy policy                                                                                                                                                  | Agent                     |
| C16 | **Data subject rights**                                  | Settings, support                        | Access, portability, and erasure requests must be answered within one month                                                                                                                     | In-app export and deletion (6.1). Everything else goes to `privacy@`, logged, and answered within 30 days                                                                                                                                                                                                                        | Agent, you                |
| C17 | **Cookies and device storage**                           | Browser                                  | Latvia's Information Society Services Law, the local ePrivacy rule, requires consent for non-essential device storage; PECR does the same for UK users                                          | The auth session is strictly necessary and needs no banner. Add no analytics or tracking in this MVP; if you add them later, choose a cookieless tool and update the policy                                                                                                                                                      | You                       |
| C18 | **Regulator and UK representative**                      | Company                                  | The DVI supervises you; a controller outside the UK serving UK users may need a UK representative under UK GDPR Art. 27                                                                         | Keep the record of processing ready (6.6). Ask the lawyer whether the location and relationship data rule out the Art. 27 exemption for occasional, low-risk processing; appoint a UK representative if they do                                                                                                                  | You, lawyer               |

## 10. Open questions

1. **When will the Latvian company (SIA) exist?** Until it does, you are personally the controller (C1). Afterwards the
   company becomes the controller, still supervised by the DVI, and the accounts transfer to it (7.7).
2. **Lawyer questions:** explicit consent at linking (C4); erasure of photos held by an ex (C7); whether a
   self-declared age check suffices (C9); which DSA duties apply at this size, and when UK users trigger the OSA (C10); the Art. 27
   representative (C18).
3. **Solo users:** the app lets people skip linking today. Keep solo runs? The model supports them at no extra cost.
4. **Photo retention:** keep photos indefinitely while the account exists, or delete after a period of inactivity
   (for example, two years without a sign-in, with an email warning first)? Storage cost and C15 both favour an
   inactivity limit.
