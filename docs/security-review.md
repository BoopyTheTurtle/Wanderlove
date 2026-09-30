# Security review before hand-out

Task 6.1 of the [internal build](internal-build.md), run September 30, 2026 against `chore/repo-structure` at
`9358356`. It covers the access rules, the storage rules, the key and photo database functions, the shipped bundle,
and the end-to-end photo encryption from [photo-encryption.md](photo-encryption.md).

The access rules hold. The one gap that matters lets an unencrypted photo reach the server, which the encryption spec
promised testers would never happen; a small migration closes it before hand-out. Four smaller findings can wait for
the MVP.

## What passed

- **Database tests.** All 154 pgTAP tests pass on a fresh local stack, across the eight suites from profiles to photo
  encryption. Each access rule is tested for the member, the partner, and a stranger.
- **Anonymous access, online.** With the publishable key, the online project refused every probe on the tables and
  functions added since the September 29 probes: reading, inserting, updating, and deleting `user_keys` and `run_keys`;
  the public keys in `profile_cards`; `share_run_keys` and the four-argument `start_run`; the `nonce` column on
  `photos`; uploading a `.bin` to the bucket; and the `private` schema. Listing the bucket returns an empty list.
- **Key rules.** Only the owner reads their `user_keys` row, which holds the sealed private key. Each member reads only
  their own copy of a trail key. A copy can be written only for a member of that trail, and only for that member's
  current key. The phone checks a partner's published fingerprint against the key itself before trusting it.
- **The bundle.** The live app ships the publishable key and nothing else; the `sb_secret_` text in it is a check
  inside supabase-js, not a key.
- **Stored photos.** Edgar confirmed on September 30 that new photos are `.bin` files that no viewer opens, that both
  phones show them, that the recovery code unlocks a cleared phone, and that new keys work once the partner trusts
  them.

## Findings

### 1. An unencrypted photo can still reach the server (medium: fix before hand-out)

The database accepts an unencrypted trail from any caller, and a plain `.jpg` photo in any trail, encrypted or not. A
local test signed in as Daniel confirmed both: `start_run` without keys started a trail, and a `.jpg` row joined a
trail that had keys. The current app never does either, but a phone still running a build from before September 30
does both, because the old two-argument `start_run` call resolves to the new function. If one partner opens a stale
tab, their photos upload in the clear, into a trail the other partner believes is encrypted.

**Fix:** a migration that makes `start_run` require keys, and a photo insert rule that demands a nonce (a `.bin` path)
whenever the trail has keys. Test data gets wiped before launch, so older plain trails need no exception beyond the
existing rows. pgTAP tests cover the member, the partner, and a stranger.

### 2. No security headers (low: fix with finding 1)

`www.wannadoo.app` sends no Content-Security-Policy, no framing rule, and no `nosniff`. Encryption rests on the app's
own code (spec section 1), so a script injected into the page could use the keys. React escapes all output and the code
contains no raw HTML, so no injection is known; a policy limits the damage if one appears. **Fix:** headers in
`vercel.json` that allow scripts only from the site, connections only to Supabase, Overpass, FOSSGIS, and the map
tiles, and no framing.

### 3. The stored recovery code weakens the device key (low: accept for testing)

The phone keeps its private key in a form no script can export. Since PR 25 it also keeps the recovery code, so Profile
can show it (Edgar's call: the code should not confront new users). A script running in the page could now read the
code, fetch the sealed key, and carry the private key away for good, instead of using it only while the page runs.
This needs an injected script first, which finding 2 makes harder. **Option for the MVP:** Profile makes a new code
on request and reseals the key with it, so no code is ever stored; the catch is that each viewing replaces the
previous code.

### 4. The first partner key is trusted without a check (low: MVP)

A phone trusts the partner's key silently the first time it sees it, if the couple has no encrypted trails yet. Someone
who controls the database, the threat the encryption exists for, could publish their own key as the partner's before
that moment and read every later trail. Key changes prompt "Trust them?", but most people will tap yes. **Option for
the MVP:** put the inviter's key fingerprint in the invite QR, so linking also verifies the key.

### 5. A trail member can spoil the other's key copy or fill storage (low: accept)

Any member of a trail may rewrite the other member's copy of its key, a rule that re-sharing needs. A partner, or an
ex-partner on an old trail, could write a broken copy and lock the other out of that trail's photos. Members may also
upload files with no photo row while the trail accepts photos. Both need a hostile partner, who can see the photos
anyway. Accept for testing.

## Storage

The bucket caps each file at 5 MB, but a phone photo at 2048 px and JPEG quality 0.8 should weigh roughly 0.5 to 1 MB; nobody has measured the online bucket yet.
Taking 1 MB per photo and 10 to 15 photos per trail gives about 15 MB per couple per trail. Supabase's free plan holds
1 GB of files, about 70 trails; the Pro plan holds 100 GB. Ten test couples fit comfortably, and the wipe before launch
empties the bucket. At launch, a retention rule belongs in the spec: users already save photos and the album to their
phones, so the server could delete a trail's photos some weeks after it ends. Deleting files needs a scheduled job that
calls the Storage API, since removing rows from `storage.objects` leaves the files behind.
