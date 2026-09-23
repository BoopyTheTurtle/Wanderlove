import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import type { Trail, Stop } from "../data/trail";
import type { LatLng } from "../lib/geo";
import { haversineDistanceMeters, isWithinRadius } from "../lib/geo";
import type { Progress } from "../lib/progress";
import { FALLBACK_START, MAX_ROUTE_METERS } from "../lib/routeGen";
import { BrandMark, StatusBar } from "../components/PhoneFrame";
import { CoupleAvatar } from "../components/CoupleAvatar";
import { ProfileAvatar } from "../components/ProfileAvatar";
import type { Profile } from "../data/profiles";
import { BottomNav } from "../components/BottomNav";
import { BellIcon, HeartIcon, CameraIcon, ClockIcon, FlagIcon, PinIcon, QuestionIcon, SlidersIcon, SparkIcon, TrendIcon } from "../components/Icons";

export type RouteStatus = "loading" | "ready" | "error" | "active";

const CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
const HEART = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;

function pinIcon(state: "done" | "current" | "locked" | "preview", index: number) {
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

function startIcon() {
  return L.divIcon({
    className: "",
    html: `<div class="start-dot"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Re-frames the map whenever a different route is shown.
function FitToRoute({ trail }: { trail: Trail | null }) {
  const map = useMap();
  useEffect(() => {
    if (!trail) return;
    const pts: [number, number][] = trail.path?.length ? trail.path : trail.stops.map((s) => [s.lat, s.lng]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28], maxZoom: 17 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trail?.id, trail?.path?.length]);
  return null;
}

function formatKm(m: number) {
  return `${(m / 1000).toFixed(1)} km`;
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
  status,
  error,
  approximateStart,
  onStartRoute,
  onNewRoute,
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
  trail: Trail | null;
  status: RouteStatus;
  error?: string;
  approximateStart?: boolean;
  onStartRoute: () => void;
  onNewRoute: () => void;
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
  const active = status === "active" && trail !== null;
  const stops = trail?.stops ?? [];
  const currentStop = active ? (stops.find((s) => !progress[s.id]) ?? null) : null;
  const completedCount = active ? stops.filter((s) => progress[s.id]).length : 0;
  const progressPct = stops.length ? Math.round((completedCount / stops.length) * 100) : 0;
  const routeMeta = trail
    ? [
        `${trail.stopCount} stops`,
        trail.distanceMeters ? `${trail.distanceEstimated ? "~" : ""}${formatKm(trail.distanceMeters)}` : null,
        `~${trail.durationMinutes} min`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // Only the initial view; FitToRoute takes over once a route exists.
  const center = useMemo<[number, number]>(() => {
    if (position) return [position.lat, position.lng];
    return [FALLBACK_START.lat, FALLBACK_START.lng];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <BrandMark /> Wannadoo
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
          <FitToRoute trail={trail} />
          {trail?.path && <Polyline positions={trail.path} pathOptions={{ className: "route-line" }} />}
          {trail?.start && <Marker position={[trail.start.lat, trail.start.lng]} icon={startIcon()} />}
          {stops.map((stop, i) => {
            const state = !active ? "preview" : progress[stop.id] ? "done" : stop.id === currentStop?.id ? "current" : "locked";
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
        <span className="map-trail-name">{trail ? trail.name : status === "error" ? "No route" : "Finding a route…"}</span>
      </div>

      {status === "loading" && (
        <section className="card route-card">
          <p className="card-kicker">
            <SparkIcon size={13} /> Surprise route
          </p>
          <h3>Finding a route near you…</h3>
          <p className="muted-line">Picking spots for a loop under {formatKm(MAX_ROUTE_METERS)}</p>
          <span className="loading-bar" aria-hidden="true" />
        </section>
      )}

      {status === "error" && (
        <section className="card route-card">
          <p className="card-kicker">
            <SparkIcon size={13} /> Surprise route
          </p>
          <h3>Couldn&rsquo;t build a route</h3>
          <p className="muted-line">{error}</p>
          <div className="route-actions">
            <button type="button" className="btn-small" onClick={onNewRoute}>
              Try again
            </button>
          </div>
        </section>
      )}

      {status === "ready" && trail && (
        <>
          <section className="card route-card">
            <p className="card-kicker">
              <SparkIcon size={13} /> {trail.kind === "surprise" ? "Your surprise route" : "Curated trail"}
            </p>
            <h3>{trail.name}</h3>
            <p className="muted-line">
              <ClockIcon size={13} /> {routeMeta}
            </p>
            {approximateStart && trail.kind === "surprise" && (
              <p className="route-note">Location unavailable, so this starts in Riga Old Town.</p>
            )}
            <div className="route-actions">
              {trail.kind === "surprise" && (
                <button type="button" className="btn-small ghost" onClick={onNewRoute}>
                  New route
                </button>
              )}
              <button type="button" className="btn-small" onClick={onStartRoute}>
                Start route
              </button>
            </div>
          </section>

          <section className="card stop-list">
            {stops.map((stop, i) => (
              <div key={stop.id} className="stop-row">
                <span className="stop-num">{i + 1}</span>
                <span className="stop-name">{stop.name}</span>
                <span className="stop-kind">{stop.eyebrow.replace(/^Stop \d+\s*—?\s*/, "")}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {active && trail && (
        <>
          <section className="card next-up">
            <div className="next-copy">
              <p className="card-kicker">
                <FlagIcon size={13} /> {currentStop ? "Next up" : "Trail complete"}
              </p>
              <h3>{currentStop ? currentStop.name : "You made it, together"}</h3>
              <p className="muted-line">
                <PinIcon size={13} />
                {currentStop ? distanceLabel : routeMeta}
              </p>
            </div>
            <div className="next-side">
              <img className="next-thumb" src={currentStop ? currentStop.image : trail.coverImage} alt="" />
              {!currentStop ? (
                <>
                  <button type="button" className="btn-small" onClick={onViewAlbum}>
                    Album
                  </button>
                  <button type="button" className="btn-small ghost" onClick={onNewRoute}>
                    New route
                  </button>
                </>
              ) : unlocked ? (
                <button type="button" className="btn-small" onClick={() => onOpenChallenge(currentStop.id)}>
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-small ghost"
                  onClick={() => onSimulateArrival(currentStop)}
                  title="Dev: jump to this stop"
                >
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
                  <small>/{stops.length}</small>
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
        </>
      )}

      <BottomNav />
    </div>
  );
}
