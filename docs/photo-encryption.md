# End-to-end encrypted photos: spec

Status: draft for Edgar's decision, September 29, 2026. Owner: Edgar.

Photos today sit in a private Supabase bucket. Row-level security lets only the members of a trail run read them, and
only through signed links that expire after an hour. Anyone with the project's dashboard or database access can still
open them: Edgar as owner, Supabase staff, and whoever steals a backup or the service key. This spec makes the photos
unreadable to all of them. Each phone encrypts a photo before upload with a key that only the couple's phones hold, so
the server stores scrambled bytes and never sees a key it can use.

The design is buildable in about three agent-days. One choice needs Edgar first: how a user gets their photos back on a
new phone (section 5).

## 1. What it protects, and what it does not

**Protects against** anyone who reads the database or the bucket without the couple's keys: a dump of storage, the
dashboard's file browser, Supabase staff, a leaked `service_role` key, a stolen backup, and a mistake in an access
rule (register C11). A breach of encrypted photos may also spare the duty to tell each user (GDPR Art. 34(3)(a)),
though the DVI still hears of it (C14).

**Does not protect against:**

- **The app's own code.** A web app downloads its code from the server on every visit. Whoever controls
  `wannadoo.app` could ship code that copies keys. Encryption stops a reader of the data, not a tampered app. A native
  app with signed releases narrows this later.
- **A compromised or unlocked phone.** The keys live on the phone.
- **The partner.** Both members can see a run's photos by design, and each can save copies.
- **Metadata.** The server still knows who linked with whom, which trail they walked, which public stops they
  completed, when, and how many photos each took. The photos themselves carry no EXIF (phase 4).

## 2. Keys

The browser's Web Crypto API does all the work; no library is needed.

- **Each account has a key pair** (ECDH P-256; every current browser supports it). The phone creates it at first
  sign-in, keeps the private key in IndexedDB as a non-exportable key, and publishes the public key in a new
  `user_keys` table.
- **Each trail run has its own photo key** (AES-256-GCM), made by the phone that starts the run.
- **The run key is wrapped for each member.** For every member, the starting phone derives a one-off shared secret with
  that member's public key (ECDH with a fresh key pair, then HKDF-SHA-256) and uses it to encrypt the run key. A new
  table `run_keys (run_id, user_id, wrapped_key, ephemeral_public_key)` stores one row per member; RLS lets each user
  read only their own rows.

Because a run key belongs to the run rather than the couple, unlinking changes nothing: both people keep the keys to
trails they walked together, exactly as they keep the photos today (main spec, section 1).

## 3. Photos

1. The phone prepares the photo as today: resized, re-encoded, EXIF gone.
2. It encrypts the JPEG with the run key and a fresh 12-byte nonce, and uploads the ciphertext as
   `photos/{run_id}/{photo_id}.bin`. The bucket accepts `application/octet-stream` instead of `image/jpeg`.
3. The `photos` row stores the nonce. Width and height stay readable; they reveal nothing useful and let the album lay
   out before the images arrive.
4. To show a photo, the phone downloads the ciphertext through the signed link, decrypts it, and displays a local
   `blob:` URL. A 400 KB photo decrypts in a few milliseconds.

Saving, the ZIP, and the album image work unchanged, since they run on the phone after decryption.

## 4. The flows that change

- **Starting a trail.** The starting phone reads the partner's public key, which `profile_cards` gains, wraps the run
  key for both members, and stores the wrapped keys in the same step that starts the run. If the partner has no key
  yet (an old account), the start waits until their phone creates one.
- **Joining on the partner's phone.** The phone reads its `run_keys` row and unwraps the run key with its private key.
- **Signing in on a new phone.** The phone has no private key. It runs the recovery flow Edgar chooses in section 5.
- **Account deletion (MVP).** Deleting the account deletes its key rows along with its photos.

## 5. Recovery: Edgar's decision

Whatever holds the private key decides what happens when a phone is lost, replaced, or its browser data is cleared.
Losing every copy of the key loses every photo for good; nobody, Edgar included, can recover them. Three options:

| Option                  | How it works                                                                                                                                                          | For                                         | Against                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Recovery code**    | At first sign-in the app shows a random 24-character code once and asks the user to save it. The server keeps the private key encrypted with a key made from the code | Strong: a random code resists guessing      | People lose codes. One more onboarding step                                                                                                                               |
| **B. Passphrase**       | The user picks a passphrase; the server keeps the private key encrypted with a key derived from it (PBKDF2, 600,000 rounds)                                           | Familiar; the user can remember it          | Weak passphrases fall to anyone holding the database, who can guess offline. Forgotten passphrases lose the photos                                                        |
| **C. Partner re-share** | A new phone creates a fresh key pair. The partner's phone, next time it opens, re-wraps the keys of every shared run for the new public key                           | No secret to keep; works for linked couples | Needs the partner's phone and a current link. Solo runs and runs with an ex are lost. A stolen account could ask the partner's phone for keys unless the partner confirms |

**Recommendation: A and C together.** The recovery code covers everything; the partner re-share covers the common case
(a new phone) without the code, with the partner confirming "Emma signed in on a new phone. Share your trails with it?"
on their phone. B adds little over A and invites weak secrets.

## 6. Existing photos

Test data gets deleted before public launch (internal build, open question 1), so the switch needs no migration of old
photos. From the release on, new runs are encrypted; runs started earlier keep their plain photos until the wipe. The
app tells the two apart by the file extension.

## 7. Build plan

| #   | Task                                                                                                                              | Tag     |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| E.1 | Migration: `user_keys`, `run_keys`, the public key in `profile_cards`, the nonce on `photos`, the bucket's MIME type; pgTAP tests | [Agent] |
| E.2 | `lib/crypto.ts`: key pair, wrap and unwrap, encrypt and decrypt, with unit tests including tampered data                          | [Agent] |
| E.3 | Key setup at first sign-in and the recovery flows from section 5                                                                  | [Agent] |
| E.4 | Encrypt on upload, decrypt for display, in `lib/photos.ts` and the runs flow                                                      | [Agent] |
| E.5 | Check in the dashboard that stored photos no longer open, and that both phones and a recovered phone still show them              | [You]   |

E.1 and E.2 can run in parallel; E.3 and E.4 follow. The tester notice gains one line: photos are encrypted on the
phone, and a lost recovery code means lost photos.

## 8. Open questions for Edgar

1. **Recovery:** A and C, as recommended, or another mix?
2. **Timing:** before inviting the 10–20 testers, or after the test and before public launch? Building it first means
   testers never upload plain photos; building it later keeps the test simpler.
