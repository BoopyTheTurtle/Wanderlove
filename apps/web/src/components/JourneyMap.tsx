/* eslint-disable react-refresh/only-export-components -- the marker maths sits beside the map so its tests stay with it */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Profile } from "@wannadoo/core";
import { ProfileAvatar } from "./ProfileAvatar";
import "./JourneyMap.css";

// The journey map on Home (docs/mvp-roadmap.md, stage 6): one painted scene with stone markers set into a path, and
// the couple standing on the marker for their progress, one marker per finished quest. After the last marker the walk
// carries on into a fresh copy of the scene, stacked above the old one. No numbers, countdowns, or "next reward" text
// (docs/research/gamification.md, 4.5).

export const JOURNEY_ART = "/journey/journey-map.webp";

// The art is 2:3, portrait.
const SCENE_ASPECT = 1.5;

// The markers' top faces in the art (journey-map-gpt-image-2-2026-09-30T14-50-17-1.png), bottom to top: centre as
// fractions of the scene's width and height, and width as a fraction of the scene's width. The art has nine markers,
// shrinking with distance.
export const JOURNEY_MARKERS: readonly { x: number; y: number; w: number }[] = [
  { x: 0.464, y: 0.866, w: 0.317 },
  { x: 0.495, y: 0.665, w: 0.186 },
  { x: 0.529, y: 0.565, w: 0.146 },
  { x: 0.438, y: 0.479, w: 0.107 },
  { x: 0.475, y: 0.406, w: 0.086 },
  { x: 0.391, y: 0.342, w: 0.073 },
  { x: 0.441, y: 0.306, w: 0.053 },
  { x: 0.38, y: 0.266, w: 0.045 },
  { x: 0.43, y: 0.238, w: 0.029 },
];

const MARKER_COUNT = JOURNEY_MARKERS.length;

// A marker's top face is an ellipse this much flatter than it is wide.
const MARKER_FLATNESS = 0.36;

// The longest walk shown in one go: a bigger jump starts this many markers before the new one.
export const MAX_STEPS = 5;

const STEP_MS = 900;
const FIRST_STEP_DELAY_MS = 700;

// Where on the view the couple stands, from the top, while the scene allows it.
const COUPLE_VIEW_Y = 0.62;

// The marker the couple stands on after this many quests.
export function markerIndex(questsDone: number): number {
  return ((questsDone % MARKER_COUNT) + MARKER_COUNT) % MARKER_COUNT;
}

// Which copy of the scene: the walk moves to a fresh copy after every MARKER_COUNT quests.
export function lapOf(questsDone: number): number {
  return Math.floor(Math.max(0, questsDone) / MARKER_COUNT);
}

// One avatar's diameter in pixels on a marker, for a scene this wide. It follows the marker's perspective size, eased
// so the far markers still show a face.
export function avatarSize(index: number, sceneWidth: number): number {
  const marker = JOURNEY_MARKERS[markerIndex(index)];
  return Math.round(sceneWidth * (0.06 + 0.35 * marker.w));
}

// The walk to show: from the last count this device saw for the couple to the count now. A first visit, a count that
// fell, or reduced motion shows the couple in place at once.
export function walkPlan(seen: number | null, now: number, reducedMotion: boolean): { from: number; to: number } {
  if (seen === null || now <= seen || reducedMotion) return { from: now, to: now };
  return { from: Math.max(seen, now - MAX_STEPS), to: now };
}

// The couple's feet, in pixels from the top of a strip of scene copies whose top copy is topLap.
export function coupleY(questsDone: number, topLap: number, sceneWidth: number): number {
  const sceneHeight = sceneWidth * SCENE_ASPECT;
  return (topLap - lapOf(questsDone)) * sceneHeight + JOURNEY_MARKERS[markerIndex(questsDone)].y * sceneHeight;
}

// How far to move the strip up so the couple stands near COUPLE_VIEW_Y of the view, without showing past its ends.
export function cameraOffset(feetY: number, viewHeight: number, stripHeight: number): number {
  const wanted = viewHeight * COUPLE_VIEW_Y - feetY;
  return Math.min(0, Math.max(viewHeight - stripHeight, wanted));
}

export function journeyLabel(questsDone: number | null, linked: boolean): string {
  if (!linked) return "Your journey: you stand at the start of the path";
  if (questsDone === null) return "Your journey together";
  return `Your journey: ${questsDone} ${questsDone === 1 ? "quest" : "quests"} walked together`;
}

// localStorage key for the last count this device showed the couple, the same from either partner's side.
export function journeySeenKey(meId: string, partnerId: string): string {
  return `wannadoo_journey_seen_${[meId, partnerId].sort().join("_")}`;
}

export function readSeen(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeSeen(key: string, questsDone: number): void {
  try {
    localStorage.setItem(key, String(questsDone));
  } catch {
    // Private mode or blocked storage: the next visit simply shows no walk.
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

type Walk = { from: number; to: number; shown: number };

// The map. questsDone is null while loading; seenKey is null for a solo user, who stands on the first marker.
export function JourneyMap({
  me,
  partner,
  questsDone,
  seenKey,
}: {
  me: Profile;
  partner: Profile | null;
  questsDone: number | null;
  seenKey: string | null;
}) {
  const [walk, setWalk] = useState<Walk>(() => {
    const start = seenKey ? (readSeen(seenKey) ?? questsDone ?? 0) : 0;
    return { from: start, to: start, shown: start };
  });
  const planned = useRef<{ key: string; questsDone: number; plan: { from: number; to: number } } | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 358, height: 420 });
  const [loaded, setLoaded] = useState(false);

  // Plans a walk once per new count. The ref keeps the plan when StrictMode runs the effect twice, after the first run
  // has already stored the new count.
  useEffect(() => {
    if (!seenKey || questsDone === null) return;
    if (planned.current?.key !== seenKey || planned.current.questsDone !== questsDone) {
      planned.current = {
        key: seenKey,
        questsDone,
        plan: walkPlan(readSeen(seenKey), questsDone, prefersReducedMotion()),
      };
      writeSeen(seenKey, questsDone);
    }
    const { from, to } = planned.current.plan;
    setWalk({ from, to, shown: from });
  }, [seenKey, questsDone]);

  // One step at a time, until the couple reaches the new marker.
  useEffect(() => {
    if (walk.shown >= walk.to) return;
    const t = setTimeout(
      () => setWalk((w) => ({ ...w, shown: Math.min(w.to, w.shown + 1) })),
      walk.shown === walk.from ? FIRST_STEP_DELAY_MS : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [walk]);

  useLayoutEffect(() => {
    const el = view.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const progress = seenKey ? walk.shown : 0;
  const firstLap = seenKey ? lapOf(walk.from) : 0;
  const topLap = seenKey ? lapOf(walk.to) : 0;
  const sceneHeight = size.width * SCENE_ASPECT;
  const laps = Array.from({ length: topLap - firstLap + 1 }, (_, i) => topLap - i);
  const feetY = coupleY(progress, topLap, size.width);
  const offset = cameraOffset(feetY, size.height, sceneHeight * laps.length);
  const marker = JOURNEY_MARKERS[markerIndex(progress)];
  const fullSize = avatarSize(0, size.width);
  const scale = avatarSize(markerIndex(progress), size.width) / fullSize;
  const walking = walk.shown > walk.from && walk.shown <= walk.to && seenKey !== null;

  return (
    <div
      ref={view}
      className={`journey-map${walking ? " walking" : ""}`}
      role="img"
      aria-label={journeyLabel(partner ? questsDone : null, partner !== null)}
    >
      <div className="journey-map-strip" style={{ transform: `translateY(${offset}px)` }} aria-hidden="true">
        {laps.map((lap) => (
          <div key={lap} className="journey-map-scene" style={{ height: sceneHeight }}>
            <img
              className={loaded ? "loaded" : undefined}
              src={JOURNEY_ART}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
            />
            {JOURNEY_MARKERS.map((m, i) =>
              lap < lapOf(progress) || (lap === lapOf(progress) && i < markerIndex(progress)) ? (
                <span
                  key={i}
                  className="journey-map-walked"
                  style={{
                    left: `${m.x * 100}%`,
                    top: `${m.y * 100}%`,
                    width: `${m.w * 100}%`,
                    height: m.w * size.width * MARKER_FLATNESS,
                  }}
                />
              ) : null,
            )}
          </div>
        ))}
        <div className="journey-map-couple" style={{ left: `${marker.x * 100}%`, top: feetY }}>
          <span className="journey-map-pair" style={{ transform: `scale(${scale})` }}>
            <span key={walking ? progress : "still"} className="journey-map-hop">
              <ProfileAvatar profile={me} size={fullSize} />
              {partner && <ProfileAvatar profile={partner} size={fullSize} />}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
