import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { TrailList } from "./screens/TrailList";
import { MapScreen } from "./screens/MapScreen";
import type { RouteStatus } from "./screens/MapScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { CompleteScreen } from "./screens/CompleteScreen";
import { SherlockChallengeScreen } from "./screens/SherlockChallengeScreen";
import { SherlockCompleteScreen } from "./screens/SherlockCompleteScreen";
import { WhoAmI } from "./screens/WhoAmI";
import { PartnerLink } from "./screens/PartnerLink";
import { getProfile } from "@wannadoo/core";
import { loadSession, resetSession, saveSession } from "./lib/session";
import type { Session } from "./lib/session";
import { trail as curatedTrail } from "@wannadoo/core";
import type { Stop, Trail } from "@wannadoo/core";
import { useLivePosition } from "./lib/useLivePosition";
import { loadProgress, resetProgress, saveStopProgress } from "./lib/progress";
import { clearActiveRoute, loadActiveRoute, saveActiveRoute } from "./lib/activeRoute";
import { generateRoute, withWalkingPath } from "@wannadoo/core";
import { getStartPosition } from "./lib/startPosition";

type Route =
  | { name: "whoAmI" }
  | { name: "partner" }
  | { name: "trailList" }
  | { name: "map" }
  | { name: "challenge"; stopId: string }
  | { name: "complete" };

// A route shown on the map but not started yet. Never persisted.
type Draft =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; trail: Trail; approximateStart: boolean };

export default function App() {
  const [session, setSession] = useState<Session>(loadSession);
  const [route, setRoute] = useState<Route>(() => initialRoute(session));
  const me = getProfile(session.meId);
  const partner = getProfile(session.partnerId);
  const [progress, setProgress] = useState(loadProgress());
  const [activeTrail, setActiveTrail] = useState<Trail | null>(loadActiveRoute);
  const [draft, setDraft] = useState<Draft>({ status: "idle" });
  const requestId = useRef(0);
  const { position, simulated, setSimulatedPosition } = useLivePosition();

  const shownTrail = activeTrail ?? (draft.status === "ready" ? draft.trail : null);
  // The Sherlock trail swaps the teal look for the red field-book theme from the map onwards.
  const themeTrail =
    route.name === "map" ? shownTrail : route.name === "challenge" || route.name === "complete" ? activeTrail : null;
  const theme = themeTrail?.id === "sherlock-holmes-spikeri" ? "sherlock" : undefined;
  const mapStatus: RouteStatus = activeTrail ? "active" : draft.status === "idle" ? "loading" : draft.status;
  const activeDone = activeTrail ? activeTrail.stops.every((s) => progress[s.id]) : false;

  async function generateSurprise() {
    const id = ++requestId.current;
    setDraft({ status: "loading" });
    try {
      const start = await getStartPosition();
      const result = await generateRoute(start.position, start.approximate);
      if (id === requestId.current) setDraft({ status: "ready", ...result });
    } catch (e) {
      if (id === requestId.current) setDraft({ status: "error", error: (e as Error).message });
    }
  }

  // No started route → every visit to the map gets a fresh one.
  useEffect(() => {
    if (route.name === "map" && !activeTrail && draft.status === "idle") void generateSurprise();
  }, [route.name, activeTrail, draft.status]);

  // Leaving a started route loses its progress, so check first.
  function confirmAbandon(): boolean {
    if (!activeTrail || activeDone) return true;
    return window.confirm(`Leave “${activeTrail.name}”? Your progress on it will be lost.`);
  }

  function clearStarted() {
    clearActiveRoute();
    setActiveTrail(null);
    resetProgress();
    setProgress({});
    setSimulatedPosition(null);
  }

  function handleSelectSurprise() {
    if (!confirmAbandon()) return;
    clearStarted();
    void generateSurprise();
    setRoute({ name: "map" });
  }

  function handleSelectCurated() {
    if (!confirmAbandon()) return;
    clearStarted();
    const id = ++requestId.current;
    setDraft({ status: "ready", trail: curatedTrail, approximateStart: false });
    void withWalkingPath(curatedTrail).then((routed) => {
      if (id === requestId.current) setDraft({ status: "ready", trail: routed, approximateStart: false });
    });
    setRoute({ name: "map" });
  }

  function handleStartRoute() {
    if (draft.status !== "ready") return;
    resetProgress();
    setProgress({});
    setSimulatedPosition(null);
    saveActiveRoute(draft.trail);
    setActiveTrail(draft.trail);
    setDraft({ status: "idle" });
  }

  function handleNewRoute() {
    if (!confirmAbandon()) return;
    clearStarted();
    void generateSurprise();
  }

  function handleResetTest() {
    clearStarted();
    requestId.current++;
    setDraft({ status: "idle" });
    setSession(resetSession());
    setRoute({ name: "whoAmI" });
  }

  function handleSimulateArrival(stop: Stop) {
    setSimulatedPosition({ lat: stop.lat, lng: stop.lng });
  }

  function handleCapture(stopId: string, photoDataUrl: string) {
    if (!activeTrail) return;
    const next = saveStopProgress(stopId, photoDataUrl);
    setProgress(next);
    const isLast = activeTrail.stops.every((s) => next[s.id]);
    setRoute(isLast ? { name: "complete" } : { name: "map" });
  }

  return (
    <PhoneFrame theme={theme}>
      {route.name === "whoAmI" && (
        <WhoAmI
          onPick={(meId) => {
            setSession(saveSession({ meId, partnerId: null, skipped: false }));
            setRoute({ name: "partner" });
          }}
        />
      )}

      {route.name === "partner" && me && (
        <PartnerLink
          me={me}
          onLinked={(partnerId) => setSession(saveSession({ ...session, partnerId, skipped: false }))}
          onContinue={() => setRoute({ name: "trailList" })}
          onSkip={() => {
            setSession(saveSession({ ...session, partnerId: null, skipped: true }));
            setRoute({ name: "map" });
          }}
          onSwitchProfile={handleResetTest}
        />
      )}

      {route.name === "trailList" && (
        <TrailList
          curated={curatedTrail}
          activeTrail={activeTrail && !activeDone ? activeTrail : null}
          onBack={() => setRoute({ name: "partner" })}
          onContinue={() => setRoute({ name: "map" })}
          onSelectSurprise={handleSelectSurprise}
          onSelectCurated={handleSelectCurated}
        />
      )}

      {route.name === "map" && (
        <MapScreen
          trail={shownTrail}
          status={mapStatus}
          error={draft.status === "error" ? draft.error : undefined}
          approximateStart={draft.status === "ready" ? draft.approximateStart : false}
          onStartRoute={handleStartRoute}
          onNewRoute={handleNewRoute}
          progress={progress}
          position={position}
          simulated={simulated}
          onSimulateArrival={handleSimulateArrival}
          onOpenChallenge={(stopId) => setRoute({ name: "challenge", stopId })}
          onViewAlbum={() => setRoute({ name: "complete" })}
          me={me}
          partner={partner}
          onLinkPartner={() => setRoute({ name: "partner" })}
          onResetTest={handleResetTest}
          onBack={() => setRoute({ name: "trailList" })}
        />
      )}

      {route.name === "challenge" &&
        activeTrail &&
        (() => {
          const stop = activeTrail.stops.find((s) => s.id === route.stopId);
          if (!stop) return null;
          if (activeTrail.id === "sherlock-holmes-spikeri") {
            return (
              <SherlockChallengeScreen
                trail={activeTrail}
                stop={stop}
                progress={progress}
                me={me}
                partner={partner}
                onBack={() => setRoute({ name: "map" })}
                onCapture={handleCapture}
              />
            );
          }
          return (
            <ChallengeScreen
              trail={activeTrail}
              stop={stop}
              progress={progress}
              onBack={() => setRoute({ name: "map" })}
              onCapture={handleCapture}
            />
          );
        })()}

      {route.name === "complete" &&
        activeTrail &&
        (activeTrail.id === "sherlock-holmes-spikeri" ? (
          <SherlockCompleteScreen trail={activeTrail} progress={progress} onViewMap={() => setRoute({ name: "map" })} />
        ) : (
          <CompleteScreen trail={activeTrail} progress={progress} onViewMap={() => setRoute({ name: "map" })} />
        ))}
    </PhoneFrame>
  );
}

function initialRoute(session: Session): Route {
  if (!getProfile(session.meId)) return { name: "whoAmI" };
  if (session.partnerId || session.skipped) return { name: "map" };
  return { name: "partner" };
}
