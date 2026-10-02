import { useEffect, useState } from "react";
import { loadBadges } from "../lib/badges";
import type { Badge } from "../lib/badges";
import { onForeground } from "../lib/coupleStats";
import { earnedDay, shelfItems } from "../lib/rhythmBadgesView";
import { SparkIcon } from "./Icons";
import "./rhythm-badges.css";

// Earned memory badges on Activity (gamification.md, 4.6). Only earned ones: the app never lists a locked badge, so
// before the first one the shelf is simply absent. `refreshKey` reloads it, as it does the journeys.
export function BadgeShelf({ refreshKey }: { refreshKey?: number }) {
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    let live = true;
    const load = () =>
      loadBadges().then(
        (loaded) => live && setBadges(loaded),
        // Keeps what it showed; badges are a quiet extra, so a failed load says nothing.
        (e: unknown) => console.error("Couldn't load badges", e),
      );
    void load();
    const off = onForeground(() => void load());
    return () => {
      live = false;
      off();
    };
  }, [refreshKey]);

  return <BadgeShelfView badges={badges} />;
}

export function BadgeShelfView({ badges }: { badges: readonly Badge[] }) {
  const items = shelfItems(badges);
  if (items.length === 0) return null;
  return (
    <section className="badge-shelf" aria-label="Memories">
      <p className="badge-shelf-kicker">Memories</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span className="badge-glyph" aria-hidden="true">
              <SparkIcon size={16} />
            </span>
            <span className="badge-shelf-copy">
              <strong>{item.title}</strong>
              <span>{item.line}</span>
            </span>
            <small>{earnedDay(item.day)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
