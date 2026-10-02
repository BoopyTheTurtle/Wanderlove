import { badgeById } from "@wannadoo/core";
import type { BadgeId } from "../lib/badges";
import { useQuestBadges } from "../lib/useQuestBadges";
import type { Run } from "../lib/runs";
import { SparkIcon } from "./Icons";
import "./rhythm-badges.css";

// The quiet note at quest finish for badges this walk just earned (gamification.md, 4.6): no fanfare, no points, and
// nothing about badges still to come. Renders nothing when the walk earned none.
export function BadgeEarnedNote({ badges, solo }: { badges: readonly BadgeId[]; solo: boolean }) {
  const shown = badges.flatMap((id) => badgeById(id) ?? []);
  if (shown.length === 0) return null;
  return (
    <aside className="badge-note" role="status">
      {shown.map((badge) => (
        <p key={badge.id} className="badge-note-row">
          <span className="badge-glyph" aria-hidden="true">
            <SparkIcon size={16} />
          </span>
          <span>
            <strong>{badge.title}</strong>
            <span>{solo ? badge.soloLine : badge.line}</span>
          </span>
        </p>
      ))}
    </aside>
  );
}

// The one-line mount for a completion screen: claims the run's badges once and shows the new ones. Pass run={null}
// for a past run opened from Activity, so opening an old album never claims.
export function QuestBadges({ run, meId }: { run: Run | null; meId: string }) {
  const badges = useQuestBadges(run, meId);
  return <BadgeEarnedNote badges={badges} solo={run?.coupleId == null} />;
}
