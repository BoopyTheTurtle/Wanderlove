import { useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { Onboarding } from "./screens/Onboarding";
import { TrailList } from "./screens/TrailList";
import { MapScreen } from "./screens/MapScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { CompleteScreen } from "./screens/CompleteScreen";
import { trail } from "./data/trail";
import { useLivePosition } from "./lib/useLivePosition";
import { loadProgress, saveStopProgress } from "./lib/progress";
import type { Stop } from "./data/trail";

type Route =
  | { name: "onboarding" }
  | { name: "trailList" }
  | { name: "map" }
  | { name: "challenge"; stopId: string }
  | { name: "complete" };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: "onboarding" });
  const [progress, setProgress] = useState(loadProgress());
  const { position, simulated, setSimulatedPosition } = useLivePosition();

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
