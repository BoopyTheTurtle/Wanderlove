import type { Trail } from "../data/trail";

// The route a couple has started. Unstarted routes are never saved, so a fresh one
// is generated each visit.
const STORAGE_KEY = "wannadoo_active_route";

export function loadActiveRoute(): Trail | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Trail) : null;
  } catch {
    return null;
  }
}

export function saveActiveRoute(trail: Trail): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trail));
}

export function clearActiveRoute(): void {
  localStorage.removeItem(STORAGE_KEY);
}
