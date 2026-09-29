// Stand-in partner state on this device. Phase 3 replaces it with real linking through Supabase.
const STORAGE_KEY = "wannadoo_session";

export type Session = {
  partnerId: string | null;
  skipped: boolean;
};

const EMPTY: Session = { partnerId: null, skipped: false };

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Partial<Session>;
    return { partnerId: saved.partnerId ?? null, skipped: saved.skipped ?? false };
  } catch {
    return EMPTY;
  }
}

export function saveSession(session: Session): Session {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function resetSession(): Session {
  localStorage.removeItem(STORAGE_KEY);
  return EMPTY;
}
