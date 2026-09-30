import type { Profile } from "@wannadoo/core";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { BottomNav } from "../components/BottomNav";
import { BellIcon, CompassIcon, HeartIcon } from "../components/Icons";
import "../home.css";

// Where the couple rests between quests. A placeholder for the illustrated journey map (docs/mvp-roadmap.md, stage 6):
// the pair stands on one point of a path, and that point opens a quest.
export function Home({
  me,
  partner,
  openQuest,
  onStartQuest,
  onLinkPartner,
}: {
  me: Profile;
  partner: Profile | null;
  // The trail of the quest under way, or null when there is none.
  openQuest: string | null;
  onStartQuest: () => void;
  onLinkPartner: () => void;
}) {
  return (
    <div className="screen journey-screen with-nav">
      <StatusBar />

      <header className="home-head">
        <span aria-hidden="true" />
        <div className="home-title">
          <h1>
            <BrandMark /> Wannadoo
          </h1>
          {partner ? (
            <p>
              {me.name} &amp; {partner.name}
            </p>
          ) : (
            <button type="button" className="link-chip" onClick={onLinkPartner}>
              <HeartIcon size={12} /> Link your partner
            </button>
          )}
        </div>
        <button
          type="button"
          className="icon-button bare"
          aria-label="Notifications"
          title="Notifications — coming soon"
        >
          <BellIcon size={21} />
          <span className="notif-dot" />
        </button>
      </header>

      <section className="journey" aria-label="Your journey">
        <svg className="journey-path" viewBox="0 0 350 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M175 440 C 60 400, 60 300, 175 220 S 290 60, 175 0" />
          <circle cx="89" cy="345" r="7" className="journey-dot past" />
          <circle cx="261" cy="103" r="7" className="journey-dot ahead" />
          <circle cx="219" cy="28" r="6" className="journey-dot ahead far" />
        </svg>

        <div className="journey-point">
          <span className="journey-pair">
            <ProfileAvatar profile={me} size={52} />
            {partner && <ProfileAvatar profile={partner} size={52} />}
          </span>
          <button type="button" className="quest-point" onClick={onStartQuest}>
            <span className="quest-point-dot" aria-hidden="true">
              <CompassIcon size={30} />
            </span>
            <strong>{openQuest ? "Continue your quest" : "Start a quest"}</strong>
            <small>{openQuest ?? "A fresh walk from where you are"}</small>
          </button>
        </div>
      </section>

      <BottomNav active="explore" />
    </div>
  );
}
