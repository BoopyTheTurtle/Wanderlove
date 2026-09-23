import { FALLBACK_START } from "@wannadoo/core";
import type { LatLng } from "@wannadoo/core";

type StartPosition = { position: LatLng; approximate: boolean };

// One-shot location for route generation; falls back to Riga Old Town when denied or unavailable.
export function getStartPosition(timeoutMs = 7000): Promise<StartPosition> {
  const fallback: StartPosition = { position: FALLBACK_START, approximate: true };
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(fallback);
    // The API's own timeout only starts once permission is granted, so an unanswered
    // permission prompt would otherwise hang route generation forever.
    const timer = setTimeout(() => resolve(fallback), timeoutMs + 1000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ position: { lat: pos.coords.latitude, lng: pos.coords.longitude }, approximate: false });
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}
