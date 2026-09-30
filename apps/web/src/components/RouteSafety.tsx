import { SAFETY_NOTE } from "../lib/routeSafety";
import type { SunsetWarning } from "../lib/routeSafety";
import { ClockIcon, FlagIcon } from "./Icons";
import "../route-safety.css";

// The calm note before a surprise route (route-safety.md, section 4). It sits on the map above Start and never blocks
// it: "Got it" folds it away for this route, and "Don't show again" appears once the user has walked a few.
export function SafetyNote({
  lines,
  canHide,
  onDismiss,
  onHide,
}: {
  // The season and rural lines under the main note.
  lines: string[];
  canHide: boolean;
  onDismiss: () => void;
  onHide: () => void;
}) {
  return (
    <section className="card safety-note" aria-label="Before you go">
      <p className="card-kicker">
        <FlagIcon size={13} /> Before you go
      </p>
      <h3>{SAFETY_NOTE.title}</h3>
      <p>{SAFETY_NOTE.body}</p>
      {lines.map((line) => (
        <p key={line} className="safety-extra">
          {line}
        </p>
      ))}
      <div className="route-actions">
        {canHide && (
          <button type="button" className="btn-small ghost" onClick={onHide}>
            Don&rsquo;t show again
          </button>
        )}
        <button type="button" className="btn-small ghost" onClick={onDismiss}>
          Got it
        </button>
      </div>
    </section>
  );
}

// The after-sunset warning. Every button leaves the choice with the user; Start stays available below it.
export function SunsetWarningCard({
  warning,
  canShorten,
  busy,
  onWalkAnyway,
  onShorter,
  onTomorrow,
}: {
  warning: SunsetWarning;
  // False once the route is already the shorter loop.
  canShorten: boolean;
  busy: boolean;
  onWalkAnyway: () => void;
  onShorter: () => void;
  onTomorrow: () => void;
}) {
  return (
    <section className="card sunset-warning" role="status">
      <p className="card-kicker">
        <ClockIcon size={13} /> After sunset
      </p>
      <h3>{warning.title}</h3>
      <p>
        {warning.body}
        {canShorten && " Want a shorter loop?"}
      </p>
      <div className="sunset-actions">
        <button type="button" className="btn-small" onClick={onWalkAnyway} disabled={busy}>
          Walk anyway
        </button>
        {canShorten && (
          <button type="button" className="btn-small ghost" onClick={onShorter} disabled={busy}>
            Shorter loop
          </button>
        )}
        <button type="button" className="btn-small ghost" onClick={onTomorrow} disabled={busy}>
          Maybe tomorrow
        </button>
      </div>
    </section>
  );
}
