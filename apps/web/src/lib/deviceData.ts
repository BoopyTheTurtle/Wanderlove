// What sign-out and "Leave this phone clean" remove from this device (abuse threat model, L4 and D1). Everything
// Wannadoo keeps on a phone, and who clears it:
//
//   Local storage
//     wannadoo_walking_paths   { user: { run: path } }  runDevice   run ends, app load (stale), sign-out, clean
//     wannadoo_followed_run    { user: runId }          runDevice   sign-out, clean
//     wannadoo_link_state      { user: { solo, knownPartnerId } }   sign-out forgets the partner; clean forgets all
//     wannadoo_pending_invite(_key)  code + key ID      session     used, sign-out, clean
//     wannadoo_open_invite     { userId, code }         session     used, sign-out, clean
//     wannadoo_partner_keys    { user: { partner: keyId } }  keys   clean
//     wannadoo_invite_key      { user: keyId }          keys        checked, clean
//     wannadoo_recovery_hint_done  [user]               keyStore    clean
//     wannadoo_safety_note     { user: { quests, hidden } }  routeSafety  clean
//     wannadoo_badge_claims    { user: runId[] }        useQuestBadges  clean
//     wannadoo_tester_commented  [hashed quest refs]   tester/commentSender  clean (whole; removed with tester feedback)
//     sb-<project>-auth-token  the Supabase session     supabase-js sign-out, clean
//   IndexedDB wannadoo-keys    { user: device keys }    keyStore    clean (the database goes once empty)
//   Memory                     run keys, place cache    keyStore, core   place cache: sign-out; clean reloads the page
//
// Sign-out keeps the photo keys, the key pins, the solo choice, and the safety-note count: none of them says where
// anyone was, and without the keys the phone would need the recovery code again. Sign-out also drops the place cache
// in memory (App.tsx), since it shows roughly where the user started.
import { forgetDeviceKeys, forgetRecoveryHint } from "./keyStore";
import { forgetSafetyNote } from "./routeSafety";
import { forgetRunDevice } from "./runDevice";
import { clearPendingInvite, forgetLinkState, forgetOpenInvite, forgetPartner } from "./session";

// Owned by lib/keys.ts, which keeps them private.
const PINS_KEY = "wannadoo_partner_keys";
const EXPECTED_KEY = "wannadoo_invite_key";
// Owned by lib/useQuestBadges.ts.
const BADGE_CLAIMS_KEY = "wannadoo_badge_claims";
// Owned by tester/commentSender.ts. Its entries are hashes, not per user, so clean drops the list whole. Delete this
// line with the tester feedback (docs/tester-feedback.md, section 4).
const TESTER_COMMENTED_KEY = "wannadoo_tester_commented";

// Removes one user's entry from a { [userId]: ... } map, and the map once it is empty.
function forgetUserEntry(key: string, userId: string) {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    const all = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : {};
    delete (all as Record<string, unknown>)[userId];
    if (Object.keys(all).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Unreadable: drop it whole rather than leave a pin behind.
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage blocked: nothing is stored either.
    }
  }
}

// Normal sign-out: the user's links and anything that could point to where they walk.
export function clearOnSignOut(userId: string) {
  forgetPartner(userId);
  clearPendingInvite();
  forgetOpenInvite();
  forgetRunDevice(userId);
}

// "Leave this phone clean", after sign-out: everything this phone keeps for the user, keys included.
export async function clearAllForUser(userId: string): Promise<void> {
  clearOnSignOut(userId);
  forgetLinkState(userId);
  forgetUserEntry(PINS_KEY, userId);
  forgetUserEntry(EXPECTED_KEY, userId);
  forgetRecoveryHint(userId);
  forgetSafetyNote(userId);
  forgetUserEntry(BADGE_CLAIMS_KEY, userId);
  try {
    localStorage.removeItem(TESTER_COMMENTED_KEY);
  } catch {
    // Storage blocked: nothing is stored either.
  }
  await forgetDeviceKeys(userId);
}
