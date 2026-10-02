import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "../components/PhoneFrame";
import { BottomNav } from "../components/BottomNav";
import { onForeground } from "../lib/coupleStats";
import {
  LeaderboardError,
  bandLine,
  joinLeaderboard,
  leaveLeaderboard,
  loadLeaderboard,
  loadLeaderboardStatus,
  questsLine,
} from "../lib/leaderboard";
import type { LeaderboardStatus, LeaderboardView } from "../lib/leaderboard";
import "../leaderboard.css";

export type LeaderboardState = LeaderboardView | "loading" | "failed";

// Loads on mount and on returning to the foreground; a failed reload keeps what is on screen.
function useReloading<T>(load: () => Promise<T>, what: string) {
  const [state, setState] = useState<T | "loading" | "failed">("loading");

  const reload = useCallback(async () => {
    try {
      setState(await load());
    } catch (e) {
      console.error(`Couldn't load ${what}`, e);
      setState((s) => (s === "loading" ? "failed" : s));
    }
  }, [load, what]);

  useEffect(() => {
    void reload();
    return onForeground(() => void reload());
  }, [reload]);

  const retry = useCallback(() => {
    setState("loading");
    void reload();
  }, [reload]);

  return { state, reload, retry };
}

// The League tab: this week's league, best first, with the couple's place as a band, never a rank number.
export function Leaderboard({ partnerName, onOpenProfile }: { partnerName: string | null; onOpenProfile: () => void }) {
  const { state, retry } = useReloading(loadLeaderboard, "the league");
  return <LeaderboardScreen state={state} partnerName={partnerName} onRetry={retry} onOpenProfile={onOpenProfile} />;
}

export function LeaderboardScreen({
  state,
  partnerName,
  onRetry,
  onOpenProfile,
}: {
  state: LeaderboardState;
  partnerName: string | null;
  onRetry: () => void;
  onOpenProfile: () => void;
}) {
  const partner = partnerName ?? "your partner";
  const profileButton = (label: string) => (
    <button type="button" className="league-cta" onClick={onOpenProfile}>
      {label}
    </button>
  );

  function body() {
    if (state === "loading") return <p className="league-note">Loading your league…</p>;
    if (state === "failed") {
      return (
        <p className="league-note">
          Couldn&rsquo;t load your league.{" "}
          <button type="button" className="inline-link" onClick={onRetry}>
            Try again
          </button>
        </p>
      );
    }
    switch (state.kind) {
      case "unlinked":
        return (
          <div className="league-card card">
            <p>The weekly league is for couples. Link a partner in Profile to join one together.</p>
            {profileButton("Open Profile")}
          </div>
        );
      case "out":
        return (
          <div className="league-card card">
            <p>
              Each week, see how your points compare with a league of other couples. They see only your couple name and
              weekly points.
            </p>
            <p className="league-small">
              {state.partnerYes
                ? `${partner} has said yes. You join once you say yes too.`
                : "You both say yes in Profile, and either of you can leave at any time."}
            </p>
            {profileButton("Open Profile")}
          </div>
        );
      case "waiting":
        return (
          <div className="league-card card">
            <p>You&rsquo;ve said yes. Your couple joins the league once {partner} says yes too.</p>
          </div>
        );
      case "needsName":
        return (
          <div className="league-card card">
            <p>You&rsquo;re in the league. Your couple shows on it once you have a couple name.</p>
            {profileButton("Name your couple")}
          </div>
        );
      case "league": {
        const { rows, band, quests } = state.league;
        if (rows.length === 0) return <p className="league-note">No couples to show yet this week.</p>;
        const alone = rows.length === 1;
        return (
          <>
            <p className="league-collective">{questsLine(quests)}</p>
            <p className="league-band">
              {alone || !band ? "You’re the only couple in your league so far this week." : bandLine(band)}
            </p>
            <ol className="league-list card" aria-label="This week’s league">
              {rows.map((row, i) => (
                <li key={i} className={row.isMe ? "league-row mine" : "league-row"}>
                  <span className="league-name">
                    {row.name}
                    {row.isMe && <span className="league-you"> (you)</span>}
                  </span>
                  <span className="league-points">
                    {row.points.toLocaleString("en-GB")} <small>pts</small>
                  </span>
                </li>
              ))}
            </ol>
            <p className="league-note">Your best three quests of the week count. Everyone starts again on Monday.</p>
          </>
        );
      }
    }
  }

  return (
    <div className="screen league-screen with-nav">
      <StatusBar />
      <div className="page-head">
        <div>
          <p className="eyebrow">This week</p>
          <h2>Your league</h2>
        </div>
      </div>
      {body()}
      <BottomNav active="league" />
    </div>
  );
}

export type LeagueSettingsState = LeaderboardStatus | null | "loading" | "failed";
export type LeagueAction = "join" | "leave";

// The opt-in in Profile, for linked users. Both partners say yes; either leaves alone, at once, without confirming.
export function LeagueSettingsSection({ partnerName }: { partnerName: string }) {
  const { state, reload, retry } = useReloading(loadLeaderboardStatus, "the league status");
  const [busy, setBusy] = useState<LeagueAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: LeagueAction, work: () => Promise<unknown>) {
    setBusy(action);
    setError(null);
    try {
      await work();
    } catch (e) {
      console.error(`League: ${action} failed`, e);
      setError(
        e instanceof LeaderboardError
          ? "You’re no longer linked, so there’s no league to join."
          : "Couldn’t save that. Check your connection and try again.",
      );
    }
    await reload();
    setBusy(null);
  }

  return (
    <LeagueSettingsView
      partnerName={partnerName}
      state={state}
      busy={busy}
      error={error}
      onJoin={() => void act("join", joinLeaderboard)}
      onLeave={() => void act("leave", leaveLeaderboard)}
      onRetry={retry}
    />
  );
}

export function LeagueSettingsView({
  partnerName,
  state,
  busy,
  error,
  onJoin,
  onLeave,
  onRetry,
}: {
  partnerName: string;
  state: LeagueSettingsState;
  busy: LeagueAction | null;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onRetry: () => void;
}) {
  // Not linked: no league.
  if (state === null) return null;

  const errorLine = error && (
    <p className="field-error league-settings-error" role="alert">
      {error}
    </p>
  );
  const leaveButton = (
    <button type="button" className="settings-outline" disabled={busy !== null} onClick={onLeave}>
      {busy === "leave" ? "Leaving…" : "Leave"}
    </button>
  );
  const nameNote = <p className="settings-note">Your couple shows in the league only once it has a couple name.</p>;

  function body() {
    if (state === "loading") return <p className="settings-note">Loading…</p>;
    if (state === "failed") {
      return (
        <>
          <p className="settings-note">Couldn&rsquo;t load your league status.</p>
          <button type="button" className="settings-outline" onClick={onRetry}>
            Try again
          </button>
        </>
      );
    }
    const { inLeague, myYes, partnerYes, needsName } = state as LeaderboardStatus;

    if (inLeague) {
      return (
        <>
          <p className="league-settings-status">You&rsquo;re in the weekly league.</p>
          <p className="settings-note">
            Couples in your league see your couple name and weekly points, and nothing else.
          </p>
          {needsName && nameNote}
          {errorLine}
          {leaveButton}
          <p className="settings-note">Either of you can leave at any time, without asking the other.</p>
        </>
      );
    }

    if (myYes) {
      return (
        <>
          <p className="league-settings-status">You&rsquo;ve said yes.</p>
          <p className="settings-note">Your couple joins once {partnerName} says yes too.</p>
          {needsName && nameNote}
          {errorLine}
          {leaveButton}
        </>
      );
    }

    return (
      <>
        <p className="settings-note">
          Each week, see how your points compare with a league of other couples. They see only your couple name and
          weekly points.
        </p>
        <p className="settings-note">
          {partnerYes
            ? `${partnerName} has said yes. You join once you say yes too.`
            : `You join once you and ${partnerName} both say yes. Either of you can leave at any time.`}
        </p>
        {needsName && nameNote}
        {errorLine}
        <button type="button" className="btn-primary" disabled={busy !== null} onClick={onJoin}>
          {busy === "join" ? "Joining…" : "Join the weekly league"}
        </button>
      </>
    );
  }

  return (
    <section className="card settings-card league-settings" aria-labelledby="settings-league-title">
      <p className="card-kicker" id="settings-league-title">
        Weekly league
      </p>
      {body()}
    </section>
  );
}
