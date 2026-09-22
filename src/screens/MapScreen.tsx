import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Trail, Stop } from "../data/trail";
import type { LatLng } from "../lib/geo";
import { haversineDistanceMeters, isWithinRadius } from "../lib/geo";
import type { Progress } from "../lib/progress";

function pinIcon(state: "done" | "current" | "locked") {
  const label = state === "done" ? "✓" : state === "current" ? "!" : "";
  return L.divIcon({
    className: "",
    html: `<div class="map-pin ${state === "current" ? "current" : ""} ${
      state === "done" ? "done" : ""
    } ${state === "locked" ? "locked" : ""}"><span style="transform:rotate(45deg)">${label}</span></div>`,
    iconSize: [31, 31],
    iconAnchor: [15, 30],
  });
}

function liveIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#e0592b;border:3px solid #fdf3e0;box-shadow:0 0 0 6px #e0592b40"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export function MapScreen({
  trail,
  progress,
  position,
  simulated,
  onSimulateArrival,
  onOpenChallenge,
  onBack,
}: {
  trail: Trail;
  progress: Progress;
  position: LatLng | null;
  simulated: boolean;
  onSimulateArrival: (stop: Stop) => void;
  onOpenChallenge: (stopId: string) => void;
  onBack: () => void;
}) {
  const currentStop = trail.stops.find((s) => !progress[s.id]) ?? null;
  const completedCount = trail.stops.filter((s) => progress[s.id]).length;
  const progressPct = Math.round((completedCount / trail.stops.length) * 100);

  const center = useMemo<[number, number]>(() => {
    if (position) return [position.lat, position.lng];
    const first = trail.stops[0];
    return [first.lat, first.lng];
  }, [position, trail.stops]);

  const unlocked =
    currentStop && position ? isWithinRadius(position, currentStop, currentStop.radiusMeters) : false;

  const distance =
    currentStop && position ? Math.round(haversineDistanceMeters(position, currentStop)) : null;

  return (
    <div className="screen map-screen">
      <MapContainer
        center={center}
        zoom={15}
        zoomControl={false}
        attributionControl={false}
        className="leaflet-live-map"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {trail.stops.map((stop) => {
          const state = progress[stop.id] ? "done" : stop.id === currentStop?.id ? "current" : "locked";
          return (
            <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={pinIcon(state)}>
              <Popup>{stop.name}</Popup>
            </Marker>
          );
        })}
        {position && <Marker position={[position.lat, position.lng]} icon={liveIcon()} />}
      </MapContainer>

      {simulated && <span className="dev-badge">Simulated position</span>}

      <div className="map-top">
        <button type="button" className="map-circle" onClick={onBack}>
          {"←"}
        </button>
        <div className="map-title">
          <span>{trail.name}</span>
          <strong>
            {completedCount}/{trail.stops.length} stops
          </strong>
        </div>
        <div className="map-circle" />
      </div>

      {currentStop && (
        <div className="map-progress">
          <div className="progress-kicker">
            <span>Trail progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="progress-line">
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <div className="current-stop">
            <span className="stop-number">{trail.stops.indexOf(currentStop) + 1}</span>
            <div>
              <p>{unlocked ? "You've arrived" : distance !== null ? `${distance}m away` : "Locate to begin"}</p>
              <h3>{currentStop.name}</h3>
            </div>
          </div>
          {unlocked ? (
            <button type="button" className="primary-button" onClick={() => onOpenChallenge(currentStop.id)}>
              Open challenge {"→"}
            </button>
          ) : (
            <button type="button" className="simulate-button" style={{ width: "100%" }} onClick={() => onSimulateArrival(currentStop)}>
              Simulate arrival at this stop
            </button>
          )}
        </div>
      )}
    </div>
  );
}
