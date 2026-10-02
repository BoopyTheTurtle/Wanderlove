/* eslint-disable react-refresh/only-export-components -- the label sits beside the scene so its tests stay with it */
import type { Profile } from "@wannadoo/core";
import { HeartIcon } from "./Icons";
import { ProfileAvatar } from "./ProfileAvatar";
import "./JourneyMap.css";

// The journey on Home (docs/mvp-roadmap.md, stage 6): one painted scene behind the whole screen, a path that glows
// ahead of the couple up to the horizon, and the couple standing on it hand in hand. No markers, numbers, countdowns,
// or "next reward" text (docs/research/gamification.md, 4.5); the totals card above carries the numbers.

export const JOURNEY_ART = "/journey/home-light-trail.webp";

// Where the couple's feet rest in the art (home-light-trail-bg-a-1.png), as fractions of its width and height: on the
// plain path in the lower third, just behind where it starts to glow.
export const COUPLE_SPOT = { x: 0.5, y: 0.8 };

const AVATAR_SIZE = 64;

export function journeyLabel(questsDone: number | null, linked: boolean): string {
  if (!linked) return "Your journey: you stand at the start of the path";
  if (questsDone === null) return "Your journey together";
  return `Your journey: ${questsDone} ${questsDone === 1 ? "quest" : "quests"} walked together`;
}

// The scene. questsDone is null while loading and only feeds the label; a solo user stands alone.
export function JourneyMap({
  me,
  partner,
  questsDone,
}: {
  me: Profile;
  partner: Profile | null;
  questsDone: number | null;
}) {
  return (
    <div className="journey-scene" role="img" aria-label={journeyLabel(partner ? questsDone : null, partner !== null)}>
      <div className="journey-scene-art" aria-hidden="true">
        <img src={JOURNEY_ART} alt="" decoding="async" />
        <div className="journey-couple" style={{ left: `${COUPLE_SPOT.x * 100}%`, top: `${COUPLE_SPOT.y * 100}%` }}>
          <span className="journey-couple-pair">
            <ProfileAvatar profile={me} size={AVATAR_SIZE} />
            {partner && (
              <>
                <span className="journey-couple-hands">
                  <HeartIcon size={12} filled />
                </span>
                <ProfileAvatar profile={partner} size={AVATAR_SIZE} />
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
