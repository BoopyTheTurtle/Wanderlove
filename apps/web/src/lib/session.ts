// What this device remembers about linking. The partner itself comes from the server (lib/couples.ts).
const STORAGE_KEY = "wannadoo_link_state";
const PENDING_INVITE_KEY = "wannadoo_pending_invite";
const PENDING_INVITE_KEY_ID = "wannadoo_pending_invite_key";
const OPEN_INVITE_KEY = "wannadoo_open_invite";
// Held the simulated partner before phase 3.
const LEGACY_KEY = "wannadoo_session";

export type LinkState = {
  // The user chose "Walk solo for now", so the app opens on the map instead of the partner screen.
  solo: boolean;
  // The partner last seen on this device; when the server no longer returns them, the app says so once.
  knownPartnerId: string | null;
};

const EMPTY: LinkState = { solo: false, knownPartnerId: null };

type Stored = Record<string, Partial<LinkState>>;

function readAll(): Stored {
  try {
    localStorage.removeItem(LEGACY_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: the app still works, it just forgets the choice.
  }
}

// Keyed by user, so a second account on the same phone starts fresh.
export function loadLinkState(userId: string): LinkState {
  const saved = readAll()[userId] ?? {};
  return { solo: saved.solo ?? false, knownPartnerId: saved.knownPartnerId ?? null };
}

export function saveLinkState(userId: string, change: Partial<LinkState>): LinkState {
  const all = readAll();
  const next = { ...EMPTY, ...all[userId], ...change };
  all[userId] = next;
  writeAll(all);
  return next;
}

// Sign-out forgets the partner but keeps the solo choice, which reveals nothing.
export function forgetPartner(userId: string) {
  saveLinkState(userId, { knownPartnerId: null });
}

// The inviter's key ID from an invite link's fragment (#k=<key_id>), or null. The fragment never reaches the server.
export function inviteKeyIdFromHash(hash: string): string | null {
  const match = hash.match(/[#&]k=([0-9a-f]{16})(?:&|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export type PendingInvite = { code: string; keyId: string | null };

// An invite from a /link/<code>#k=<key_id> URL, kept until sign-in and onboarding are done. The key ID defaults to
// the one in the address bar's fragment, since main.tsx saves the code before it clears the address.
export function savePendingInvite(code: string, keyId: string | null = inviteKeyIdFromHash(window.location.hash)) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code);
    if (keyId) localStorage.setItem(PENDING_INVITE_KEY_ID, keyId);
    else localStorage.removeItem(PENDING_INVITE_KEY_ID);
  } catch {
    // Without storage the invitee can still type the code.
  }
}

export function loadPendingInvite(): PendingInvite | null {
  try {
    const code = localStorage.getItem(PENDING_INVITE_KEY);
    return code ? { code, keyId: localStorage.getItem(PENDING_INVITE_KEY_ID) } : null;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
    localStorage.removeItem(PENDING_INVITE_KEY_ID);
  } catch {
    // Nothing to clear.
  }
}

// The invite this user last created on this device. Reusing it keeps a link already sent working; a new invite
// would cancel it.
export type OpenInvite = { userId: string; code: string; expiresAt: number };

export function loadOpenInvite(userId: string): OpenInvite | null {
  try {
    const saved = JSON.parse(localStorage.getItem(OPEN_INVITE_KEY) ?? "null") as OpenInvite | null;
    return saved?.userId === userId && typeof saved.code === "string" ? saved : null;
  } catch {
    return null;
  }
}

export function saveOpenInvite(invite: OpenInvite) {
  try {
    localStorage.setItem(OPEN_INVITE_KEY, JSON.stringify(invite));
  } catch {
    // Without storage every visit makes a fresh invite, as before.
  }
}

// Called once the invite is used (the user got linked) or on sign-out.
export function forgetOpenInvite() {
  try {
    localStorage.removeItem(OPEN_INVITE_KEY);
  } catch {
    // Nothing to forget.
  }
}
