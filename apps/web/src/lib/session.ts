// What this device remembers about linking. The partner itself comes from the server (lib/couples.ts).
const STORAGE_KEY = "wannadoo_link_state";
const PENDING_INVITE_KEY = "wannadoo_pending_invite";
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

// An invite code from a /link/<code> URL, kept until sign-in and onboarding are done.
export function savePendingInvite(code: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // Without storage the invitee can still type the code.
  }
}

export function loadPendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to clear.
  }
}
