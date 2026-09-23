import { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Trail, Stop } from "../data/trail";
import type { LatLng } from "../lib/geo";
import { haversineDistanceMeters, isWithinRadius } from "../lib/geo";
import type { Progress } from "../lib/progress";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { ProfileAvatar } from "../components/ProfileAvatar";
import type { Profile } from "../data/profiles";
import { BottomNav } from "../components/BottomNav";
import { BellIcon, HeartIcon, CameraIcon, FlagIcon, PinIcon, QuestionIcon, SlidersIcon, TrendIcon } from "../components/Icons";

const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const HEART = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

function pinIcon(state: "done" | "current" | "locked", index: number) {
  const inner = state === "done" ? CHECK : state === "current" ? HEART : `<b>${index + 1}</b>`;
  return L.divIcon({
    className: "",
    html: `<div class="map-pin ${state}"><span>${inner}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function liveIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="live-dot"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <svg className="progress-ring" width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`${pct}% complete`}>
      <circle cx="34" cy="34" r={r} className="ring-track" />
      <circle
        cx="34"
        cy="34"
        r={r}
        className="ring-fill"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="38.5" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  );
}

export function MapScreen({
  trail,
  progress,
  position,
  simulated,
  onSimulateArrival,
  onOpenChallenge,
  onViewAlbum,
  onBack,
  me,
  partner,
  onLinkPartner,
  onResetTest,
}: {
  trail: Trail;
  progress: Progress;
  position: LatLng | null;
  simulated: boolean;
  onSimulateArrival: (stop: Stop) => void;
  onOpenChallenge: (stopId: string) => void;
  onViewAlbum: () => void;
  onBack: () => void;
  me: Profile | null;
  partner: Profile | null;
  onLinkPartner: () => void;
  onResetTest: () => void;
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

  const distanceLabel = unlocked
    ? "You've arrived"
    : distance === null
      ? "Locating you…"
      : distance >= 1000
        ? `${(distance / 1000).toFixed(1)} km away`
        : `${distance} m away`;

  return (
    <div className="screen home-screen with-nav">
      <StatusBar />
      <button type="button" className="dev-reset" onClick={onResetTest} title="Clear profile, partner and progress">
        Test{me ? `: ${me.name}` : ""} · Reset
      </button>

      <header className="home-head">
        {partner ? <CoupleAvatar size={42} /> : <ProfileAvatar profile={me} size={42} />}
        <div className="home-title">
          <h1>
            <BrandMark /> Wanderclue
          </h1>
          {partner && me ? (
            <p>
              {me.name} &amp; {partner.name}
            </p>
          ) : (
            <button type="button" className="link-chip" onClick={onLinkPartner}>
              <HeartIcon size={12} /> Link your partner
            </button>
          )}
        </div>
        <button type="button" className="icon-button bare" aria-label="Notifications" title="Notifications — coming soon">
          <BellIcon size={21} />
          <span className="notif-dot" />
        </button>
      </header>

      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="active">
          Map
        </button>
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" title="Tasks — coming soon">
          Tasks
        </button>
        <button type="button" role="tab" aria-selected="false" aria-disabled="true" title="Quizzes — coming soon">
          Quizzes
        </button>
      </div>

      <div className="map-card">
        <MapContainer center={center} zoom={15} zoomControl={false} attributionControl={false} className="leaflet-live-map">
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {trail.stops.map((stop, i) => {
            const state = progress[stop.id] ? "done" : stop.id === currentStop?.id ? "current" : "locked";
            return (
              <Marker key={stop.id} position={[stop.lat, stop.lng]} icon={pinIcon(state, i)}>
                <Popup>{stop.name}</Popup>
              </Marker>
            );
          })}
          {position && <Marker position={[position.lat, position.lng]} icon={liveIcon()} />}
        </MapContainer>
        {simulated && <span className="dev-badge">Simulated position</span>}
        <button type="button" className="map-fab" onClick={onBack} aria-label="Change trail" title="Change trail">
          <SlidersIcon size={18} />
        </button>
        <span className="map-trail-name">{trail.name}</span>
      </div>

      <section className="card next-up">
        <div className="next-copy">
          <p className="card-kicker">
            <FlagIcon size={13} /> {currentStop ? "Next up" : "Trail complete"}
          </p>
          <h3>{currentStop ? currentStop.name : "You made it, together"}</h3>
          <p className="muted-line">
            <PinIcon size={13} />
            {currentStop ? distanceLabel : `${trail.stopCount} stops · ${trail.location}`}
          </p>
        </div>
        <div className="next-side">
          <img
            className="next-thumb"
            src={currentStop ? currentStop.image : trail.coverImage}
            alt=""
          />
          {!currentStop ? (
            <button type="button" className="btn-small" onClick={onViewAlbum}>
              Album
            </button>
          ) : unlocked ? (
            <button type="button" className="btn-small" onClick={() => onOpenChallenge(currentStop.id)}>
              Start
            </button>
          ) : (
            <button type="button" className="btn-small ghost" onClick={() => onSimulateArrival(currentStop)} title="Dev: jump to this stop">
              Simulate
            </button>
          )}
        </div>
      </section>

      <section className="card progress-card">
        <div className="progress-rows">
          <p className="card-kicker">
            <TrendIcon size={13} /> Your progress
          </p>
          <div className="stat-row">
            <span className="stat-icon">
              <CameraIcon size={12} />
            </span>
            <span>Stops completed</span>
            <b>
              {completedCount}
              <small>/{trail.stops.length}</small>
            </b>
          </div>
          <div className="stat-row soon">
            <span className="stat-icon">
              <QuestionIcon size={12} />
            </span>
            <span>Quizzes completed</span>
            <b className="soon-pill">Soon</b>
          </div>
        </div>
        <ProgressRing pct={progressPct} />
      </section>

      <BottomNav />
    </div>
  );
}
