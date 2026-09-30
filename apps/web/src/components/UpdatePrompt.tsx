import { useEffect, useState } from "react";
import { BUILD_ID, fetchLiveBuildId, isNewVersion, shouldCheck } from "../lib/appVersion";
import "../update-prompt.css";

// A small banner once a newer build is live, so a phone that kept an old tab open doesn't run stale code for days.
// It checks when the app returns to the foreground, at most once a minute, and never in dev.
export function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV || BUILD_ID === undefined || ready) return;
    let live = true;
    let lastCheckedAt: number | null = null;

    async function check() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!shouldCheck(lastCheckedAt, now)) return;
      lastCheckedAt = now;
      const id = await fetchLiveBuildId();
      if (live && isNewVersion(BUILD_ID, id)) setReady(true);
    }

    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [ready]);

  if (!ready || dismissed) return null;
  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt-text">A new version is ready</span>
      <button type="button" className="update-prompt-reload" onClick={() => window.location.reload()}>
        Reload
      </button>
      <button type="button" className="update-prompt-close" aria-label="Not now" onClick={() => setDismissed(true)}>
        ×
      </button>
    </div>
  );
}
