import { useState } from "react";
import type { ReactNode } from "react";
import type { Profile } from "@wannadoo/core";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { BottomNav } from "../components/BottomNav";
import { CoupleTotalsCard } from "../components/CoupleTotals";
import { JourneyMap } from "../components/JourneyMap";
import { BellIcon, CompassIcon, HeartIcon } from "../components/Icons";
import { useCoupleTotals } from "../lib/coupleStats";
import type { QuestMode } from "../lib/runs";
import "../home.css";

// Where the couple rests between quests: the journey scene (docs/mvp-roadmap.md, stage 6) behind the screen, with the
// pair on the path, and in its sky the quest point that opens a quest. While linked, a new quest asks who it is for:
// Together invites the partner, Just me stays off their phone (abuse threat model, section 6, decisions 1 and 2).
export function Home({
  me,
  partner,
  openQuest,
  invite,
  cards,
  feedUnread = 0,
  onStartQuest,
  onLinkPartner,
  onOpenFeed,
}: {
  me: Profile;
  partner: Profile | null;
  // The trail of the quest under way, or null when there is none.
  openQuest: string | null;
  // The partner's invitation to their quest, shown above the path.
  invite?: ReactNode;
  // Cards shown under the couple's totals, such as the weekly rhythm or a planned walk.
  cards?: ReactNode;
  // Unread feed items; any lights a quiet dot on the bell, with no number.
  feedUnread?: number;
  // mode is absent when continuing, or when walking solo.
  onStartQuest: (mode?: QuestMode) => void;
  onLinkPartner: () => void;
  onOpenFeed?: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  // One load for the totals card and the scene's label.
  const totals = useCoupleTotals(partner?.id ?? null);

  function handleQuestPoint() {
    if (partner && !openQuest) setChoosing((c) => !c);
    else onStartQuest();
  }

  return (
    <div className="screen journey-screen journey-home with-nav">
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
          aria-label={feedUnread > 0 ? "Notifications, something new" : "Notifications"}
          onClick={onOpenFeed}
        >
          <BellIcon size={21} />
          {feedUnread > 0 && <span className="notif-dot" />}
        </button>
      </header>

      {invite}

      {partner && <CoupleTotalsCard key={partner.id} totals={totals} />}

      {cards}

      <JourneyMap me={me} partner={partner} questsDone={totals?.questsDone ?? null} />

      <div className="journey-point">
        <button
          type="button"
          className="quest-point"
          onClick={handleQuestPoint}
          aria-expanded={partner && !openQuest ? choosing : undefined}
        >
          <span className="quest-point-dot" aria-hidden="true">
            <CompassIcon size={30} />
          </span>
          <strong>{openQuest ? "Continue your quest" : "Start a quest"}</strong>
          <small>{openQuest ?? "A fresh walk from where you are"}</small>
        </button>
        {partner && !openQuest && choosing && (
          <div className="quest-choice" role="group" aria-label="Who is this quest for?">
            <button type="button" className="quest-choice-option" onClick={() => onStartQuest("together")}>
              <strong>Together</strong>
              <small>{partner.name} gets an invitation to join</small>
            </button>
            <button type="button" className="quest-choice-option" onClick={() => onStartQuest("alone")}>
              <strong>Just me</strong>
              <small>Only you see this quest</small>
            </button>
          </div>
        )}
      </div>

      <BottomNav active="explore" />
    </div>
  );
}
