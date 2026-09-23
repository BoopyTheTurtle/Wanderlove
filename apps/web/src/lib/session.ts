const STORAGE_KEY = "wannadoo_session";

export type Session = {
  meId: string | null;
  partnerId: string | null;
  skipped: boolean;
};

const EMPTY: Session = { meId: null, partnerId: null, skipped: false };

export function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Session>) } : EMPTY;
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
