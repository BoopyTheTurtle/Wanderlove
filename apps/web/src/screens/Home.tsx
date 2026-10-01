import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Profile } from "@wannadoo/core";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { BottomNav } from "../components/BottomNav";
import { CoupleTotalsCard } from "../components/CoupleTotals";
import { JourneyMap, journeySeenKey } from "../components/JourneyMap";
import { BellIcon, CompassIcon, HeartIcon } from "../components/Icons";
import { loadCoupleTotals, onForeground } from "../lib/coupleStats";
import type { QuestMode } from "../lib/runs";
import "../home.css";

// Where the couple rests between quests: the journey map (docs/mvp-roadmap.md, stage 6), with the pair on the marker
// for their finished quests, and under it the quest point that opens a quest. While linked, a new quest asks who it is for:
// Together invites the partner, Just me stays off their phone (abuse threat model, section 6, decisions 1 and 2).
export function Home({
  me,
  partner,
  openQuest,
  invite,
  onStartQuest,
  onLinkPartner,
}: {
  me: Profile;
  partner: Profile | null;
  // The trail of the quest under way, or null when there is none.
  openQuest: string | null;
  // The partner's invitation to their quest, shown above the path.
  invite?: ReactNode;
  // mode is absent when continuing, or when walking solo.
  onStartQuest: (mode?: QuestMode) => void;
  onLinkPartner: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  const questsDone = useQuestsDone(partner?.id ?? null);

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
          aria-label="Notifications"
          title="Notifications — coming soon"
        >
          <BellIcon size={21} />
          <span className="notif-dot" />
        </button>
      </header>

      {invite}

      {partner && <CoupleTotalsCard key={partner.id} />}

      <JourneyMap
        key={`journey-${partner?.id ?? "solo"}`}
        me={me}
        partner={partner}
        questsDone={questsDone}
        seenKey={partner ? journeySeenKey(me.id, partner.id) : null}
      />

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

// The couple's finished quests, loaded on mount and on returning to the foreground; null while loading or solo.
function useQuestsDone(partnerId: string | null): number | null {
  const [loaded, setLoaded] = useState<{ partnerId: string; questsDone: number } | null>(null);

  useEffect(() => {
    if (!partnerId) return;
    let live = true;
    const load = () =>
      loadCoupleTotals().then(
        (totals) => {
          if (live) setLoaded({ partnerId, questsDone: totals.questsDone });
        },
        // Keeps the last count; the next foreground tries again.
        (e: unknown) => console.error("Couldn't load the couple's quests", e),
      );
    void load();
    const off = onForeground(() => void load());
    return () => {
      live = false;
      off();
    };
  }, [partnerId]);

  return loaded && loaded.partnerId === partnerId ? loaded.questsDone : null;
}
