# Internal build: sign-in, linking, and photos

Status: draft, September 25, 2026. Owner: Edgar. Companion to [accounts-roadmap.md](accounts-roadmap.md).

This build puts real accounts in front of the team and a few friendly testers before the full MVP. Testers sign in with
an emailed code, link to a partner, upload photos at each stop, and save the photos and a generated album to their
phone. It uses the main spec's schema and code, so every line carries into the MVP; it skips the public-launch work.

Tags follow the main spec: **[Agent]**, **[You]**, **[Legal]**.

## 1. Decisions

| Decision  | Choice                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Users     | The team plus friendly testers you send the URL to, about 10–20 people                                  |
| Sign-in   | Email one-time code and magic link. Any address can sign up; nobody approves accounts                   |
| Backend   | One Supabase project, `wannadoo-staging`, in `eu-central-1`. It becomes staging when the MVP starts     |
| Schema    | Section 4 of the main spec, in full, so the MVP needs no rewrite                                        |
| Downloads | Individual photos and the generated album image, both through the share sheet                           |
| Hosting   | The existing Vercel project; a Vercel preview or production URL is enough                               |
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
- **What:** email, display name, the stops you complete, and your photos. GPS stays on the phone; photos lose their
  location data before upload.
- **Why:** to test the app. Lawful basis: legitimate interests, since you share the URL only with people you ask to test.
- **Who sees it:** your linked partner sees the trails you walk together and their photos. Supabase (Frankfurt), Vercel,
  and the email provider process the data for you. Overpass, FOSSGIS, and OpenStreetMap receive your position when the
  app builds a route.
- **After unlinking:** each of you keeps the photos from trails you walked together. You can delete your own photos.
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
every rule in section 5, generated types, and CI. Only the deploy target differs: migrations go to the one project on
merge to `main`.

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

Main spec phase 3, unchanged, including the QR code, the `/link/<code>` route, the link notice, instant unlinking, and
the attempt limit on `redeem_invite`. Email lookup goes.

**Done when:** two phones link by QR, both show each other, and either can unlink.

### Phase 4: Runs and photos. Agent: 1.5 days

Main spec tasks 4.1 to 4.4: `lib/runs.ts` with the snapshot stripped of `start` and `path`; `lib/photos.ts` with resize,
re-encode, upload, signed URLs, and delete; `App.tsx` rewired to the wrappers with refresh on focus; unit tests. Skip
`photo_hidden` in the UI; the table stays.

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

## 7. Open questions

1. **Test data at launch.** This spec wipes it. Keeping it means asking testers to accept the real privacy policy and
   migrating their accounts into production; wiping is simpler and avoids reusing data collected under a test notice.
2. **Email sender.** Buying the domain now (main spec 0.1) lets the email provider send from it, and the MVP needs it
   anyway. A Gmail account with an app password also works as Supabase's SMTP for a handful of testers, but it lands in
   spam more often and gets thrown away later.
3. **Solo testers.** Can a tester walk without linking? The schema supports it at no cost; the UI only needs a skip
   button on the link screen.
