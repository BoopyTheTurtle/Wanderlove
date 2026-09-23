import { useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { Onboarding } from "./screens/Onboarding";
import { TrailList } from "./screens/TrailList";
import { MapScreen } from "./screens/MapScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { CompleteScreen } from "./screens/CompleteScreen";
import { WhoAmI } from "./screens/WhoAmI";
import { PartnerLink } from "./screens/PartnerLink";
import { getProfile } from "./data/profiles";
import { loadSession, resetSession, saveSession } from "./lib/session";
import type { Session } from "./lib/session";
import { trail } from "./data/trail";
import { useLivePosition } from "./lib/useLivePosition";
import { loadProgress, resetProgress, saveStopProgress } from "./lib/progress";
import type { Stop } from "./data/trail";

type Route =
  | { name: "whoAmI" }
  | { name: "partner" }
  | { name: "onboarding" }
  | { name: "trailList" }
  | { name: "map" }
  | { name: "challenge"; stopId: string }
  | { name: "complete" };

export default function App() {
  const [session, setSession] = useState<Session>(loadSession);
  const [route, setRoute] = useState<Route>(() => initialRoute(session));
  const me = getProfile(session.meId);
  const partner = getProfile(session.partnerId);
  const [progress, setProgress] = useState(loadProgress());
  const { position, simulated, setSimulatedPosition } = useLivePosition();

  function handleResetTest() {
    resetProgress();
    setProgress({});
    setSimulatedPosition(null);
    setSession(resetSession());
    setRoute({ name: "whoAmI" });
  }

  function handleSelectMode() {
    setRoute({ name: "trailList" });
  }

  function handleSelectTrail() {
    setRoute({ name: "map" });
  }

  function handleSimulateArrival(stop: Stop) {
    setSimulatedPosition({ lat: stop.lat, lng: stop.lng });
  }

  function handleOpenChallenge(stopId: string) {
    setRoute({ name: "challenge", stopId });
  }

  function handleCapture(stopId: string, photoDataUrl: string) {
    const next = saveStopProgress(stopId, photoDataUrl);
    setProgress(next);
    const isLast = trail.stops.every((s) => next[s.id]);
    setRoute(isLast ? { name: "complete" } : { name: "map" });
  }

  return (
    <PhoneFrame>
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
          onContinue={() => setRoute({ name: "onboarding" })}
          onSkip={() => {
            setSession(saveSession({ ...session, partnerId: null, skipped: true }));
            setRoute({ name: "map" });
          }}
          onSwitchProfile={handleResetTest}
        />
      )}

      {route.name === "onboarding" && <Onboarding onSelectMode={handleSelectMode} />}

      {route.name === "trailList" && (
        <TrailList trail={trail} onBack={() => setRoute({ name: "onboarding" })} onSelectTrail={handleSelectTrail} />
      )}

      {route.name === "map" && (
        <MapScreen
          trail={trail}
          progress={progress}
          position={position}
          simulated={simulated}
          onSimulateArrival={handleSimulateArrival}
          onOpenChallenge={handleOpenChallenge}
          onViewAlbum={() => setRoute({ name: "complete" })}
          me={me}
          partner={partner}
          onLinkPartner={() => setRoute({ name: "partner" })}
          onResetTest={handleResetTest}
          onBack={() => setRoute({ name: "trailList" })}
        />
      )}

      {route.name === "challenge" &&
        (() => {
          const stop = trail.stops.find((s) => s.id === route.stopId);
          if (!stop) return null;
          return (
            <ChallengeScreen
              trail={trail}
              stop={stop}
              progress={progress}
              onBack={() => setRoute({ name: "map" })}
              onCapture={handleCapture}
            />
          );
        })()}

      {route.name === "complete" && (
        <CompleteScreen trail={trail} progress={progress} onViewMap={() => setRoute({ name: "map" })} />
      )}
    </PhoneFrame>
  );
}

function initialRoute(session: Session): Route {
  if (!getProfile(session.meId)) return { name: "whoAmI" };
  if (session.partnerId || session.skipped) return { name: "map" };
  return { name: "partner" };
}
