import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { TrailList } from "./screens/TrailList";
import { MapScreen } from "./screens/MapScreen";
import type { RouteStatus } from "./screens/MapScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { CompleteScreen } from "./screens/CompleteScreen";
import { SherlockChallengeScreen } from "./screens/SherlockChallengeScreen";
import { SherlockCompleteScreen } from "./screens/SherlockCompleteScreen";
import { WhoAmI } from "./screens/WhoAmI";
import { LinkedScreen, PartnerLink } from "./screens/PartnerLink";
import { LinkInvite } from "./screens/LinkInvite";
import { Settings } from "./screens/Settings";
import { SignIn } from "./screens/SignIn";
import { ProfileSetup } from "./screens/ProfileSetup";
import { BrandMark, StatusBar } from "./components/PhoneFrame";
import type { Profile } from "@wannadoo/core";
import {
  clearPendingInvite,
  forgetOpenInvite,
  forgetPartner,
  loadLinkState,
  loadPendingInvite,
  saveLinkState,
} from "./lib/session";
import type { LinkState } from "./lib/session";
import { loadPartner, unlink } from "./lib/couples";
import { trail as curatedTrail } from "@wannadoo/core";
import type { Stop, Trail } from "@wannadoo/core";
import { useLivePosition } from "./lib/useLivePosition";
import {
  abandonRun,
  allStopsDone,
  completeStop,
  finishRun,
  canAddPhotos,
  isRunActive,
  loadActiveRun,
  loadRun,
  startRun,
} from "./lib/runs";
import type { Run } from "./lib/runs";
import { uploadPhoto } from "./lib/photos";
import type { PreparedPhoto, RunPhoto } from "./lib/photos";
import {
  dropLegacyTrailData,
  loadFollowedRun,
  loadWalkingPath,
  saveFollowedRun,
  saveWalkingPath,
} from "./lib/runDevice";
import type { WalkingPath } from "./lib/runDevice";
import { generateRoute, withWalkingPath } from "@wannadoo/core";
import { SURPRISE_ROUTE_ENABLED } from "./features";
import { getStartPosition } from "./lib/startPosition";
import { signOut, useAuth } from "./lib/auth";
import { isOnboarded, loadOwnProfile, toProfile } from "./lib/profile";
import type { ProfileRow } from "./lib/profile";
import { isLocalStack } from "./lib/supabase";

type ProfileState = { status: "loading" } | { status: "error" } | { status: "ready"; row: ProfileRow };

// How often the invite screen checks whether the partner has linked, since that phone keeps focus meanwhile.
const INVITE_POLL_MS = 4000;
// How often an open run checks for the partner's progress while the app is in view, so partners walking together
// stay in step without refocusing.
const RUN_POLL_MS = 15000;

const SHERLOCK_ID = "sherlock-holmes-spikeri";

// Signing out clears what this phone keeps about the signed-in user's links, except the solo choice. Trail runs live
// on the server.
function signOutAndClear(userId: string) {
  forgetPartner(userId);
  clearPendingInvite();
  forgetOpenInvite();
  signOut().catch((e: unknown) => console.error("Sign-out failed", e));
}

// Gates the app on auth: sign-in, then onboarding, then the trail flow.
export default function App() {
  const auth = useAuth();
  const [testMode, setTestMode] = useState(false);
  const userId = auth.status === "signedIn" ? auth.user.id : null;
  const [loaded, setLoaded] = useState<{ userId: string; state: ProfileState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => dropLegacyTrailData(), []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadOwnProfile(userId).then(
      (row) => active && setLoaded({ userId, state: { status: "ready", row } }),
      () => active && setLoaded({ userId, state: { status: "error" } }),
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  if (auth.status === "loading")
    return (
      <PhoneFrame>
        <LoadingScreen />
      </PhoneFrame>
    );

  if (auth.status === "signedOut") {
    return (
      <PhoneFrame>
        {testMode && isLocalStack ? (
          <WhoAmI onBack={() => setTestMode(false)} />
        ) : (
          <SignIn onTestMode={() => setTestMode(true)} />
        )}
      </PhoneFrame>
    );
  }

  const profile: ProfileState = loaded?.userId === auth.user.id ? loaded.state : { status: "loading" };
  if (profile.status === "loading")
    return (
      <PhoneFrame>
        <LoadingScreen />
      </PhoneFrame>
    );
  if (profile.status === "error") {
    return (
      <PhoneFrame>
        <LoadingScreen error onRetry={() => setAttempt((n) => n + 1)} onSignOut={() => signOutAndClear(auth.user.id)} />
      </PhoneFrame>
    );
  }
  if (!isOnboarded(profile.row)) {
    return (
      <PhoneFrame>
        <ProfileSetup
          userId={auth.user.id}
          onDone={(row) => setLoaded({ userId: auth.user.id, state: { status: "ready", row } })}
          onSignOut={() => signOutAndClear(auth.user.id)}
        />
      </PhoneFrame>
    );
  }

  // Keyed by user, so switching accounts starts the trail flow afresh.
  return (
    <SignedInApp
      key={auth.user.id}
      me={toProfile(profile.row, auth.user.email ?? "")}
      onSignOut={() => signOutAndClear(auth.user.id)}
    />
  );
}

function LoadingScreen({
  error,
  onRetry,
  onSignOut,
}: {
  error?: boolean;
  onRetry?: () => void;
  onSignOut?: () => void;
}) {
  return (
    <div className="screen auth-screen">
      <StatusBar />
      <div className="onboarding-head auth-loading">
        <p className="wordmark">
          <BrandMark /> Wannadoo
        </p>
        {error ? (
          <>
            <p className="intro">Couldn&rsquo;t load your profile. Check your connection and try again.</p>
            <div className="auth-links">
              <button type="button" className="text-button" onClick={onRetry}>
                Try again
              </button>
              <button type="button" className="text-button" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <p className="intro">Loading…</p>
        )}
      </div>
    </div>
  );
}

type Route =
  | { name: "partner" }
  | { name: "accept"; code: string }
  | { name: "linked" }
  | { name: "settings" }
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

function SignedInApp({ me, onSignOut }: { me: Profile; onSignOut: () => void }) {
  const [linkState, setLinkState] = useState<LinkState>(() => loadLinkState(me.id));
  const [partner, setPartner] = useState<Profile | null>(null);
  // Null until the partner first loads, since that decides where the app opens.
  const [route, setRoute] = useState<Route | null>(null);
  const [unlinkedNotice, setUnlinkedNotice] = useState(false);
  const partnerRequest = useRef(0);
  // The started run from the server: open, or finished and waiting for the album. Null when there is none.
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const [runSync, setRunSync] = useState<"loading" | "error" | "ready">("loading");
  // Bumped on every sync, so screens showing photos reload them too.
  const [syncTick, setSyncTick] = useState(0);
  const runRequest = useRef(0);
  const [endedNotice, setEndedNotice] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  // Walking paths drawn on this phone, per run; the server keeps stops only.
  const [routedPaths, setRoutedPaths] = useState<Record<string, WalkingPath>>({});
  const routing = useRef(new Set<string>());
  const finishing = useRef(new Set<string>());
  // A photo that uploaded but whose stop failed to save; Retry then only saves the stop.
  const uploaded = useRef(new WeakMap<PreparedPhoto, RunPhoto>());
  const [draft, setDraft] = useState<Draft>({ status: "idle" });
  const requestId = useRef(0);
  const { position, simulated, setSimulatedPosition } = useLivePosition();

  const runId = run?.id ?? null;
  const cachedPath = useMemo(() => (runId ? loadWalkingPath(runId) : null), [runId]);
  const walkingPath = runId ? (routedPaths[runId] ?? cachedPath) : null;
  const runTrail = useMemo<Trail | null>(() => {
    if (!run) return null;
    if (!walkingPath) return run.trail;
    return {
      ...run.trail,
      path: walkingPath.path,
      distanceMeters: walkingPath.distanceMeters ?? run.trail.distanceMeters,
    };
  }, [run, walkingPath]);
  const runOpen = run !== null && isRunActive(run);
  const runPartnerName = run?.coupleId ? (partner?.name ?? null) : null;

  const shownTrail = runTrail ?? (runSync === "ready" && draft.status === "ready" ? draft.trail : null);
  // The Sherlock trail swaps the teal look for the red field-book theme from the map onwards.
  const themeTrail =
    route?.name === "map" ? shownTrail : route?.name === "challenge" || route?.name === "complete" ? runTrail : null;
  const theme = themeTrail?.id === SHERLOCK_ID ? "sherlock" : undefined;
  const mapStatus: RouteStatus = run
    ? "active"
    : runSync === "loading"
      ? "syncing"
      : runSync === "error"
        ? "syncError"
        : draft.status === "idle"
          ? "loading"
          : draft.status;
  const activeDone = run ? !isRunActive(run) || allStopsDone(run) : false;

  async function generateSurprise() {
    const id = ++requestId.current;
    setStartFailed(false);
    setDraft({ status: "loading" });
    try {
      const start = await getStartPosition();
      const result = await generateRoute(start.position, start.approximate);
      if (id === requestId.current) setDraft({ status: "ready", ...result });
    } catch (e) {
      if (id === requestId.current) setDraft({ status: "error", error: (e as Error).message });
    }
  }

  function loadCurated() {
    const id = ++requestId.current;
    setStartFailed(false);
    setDraft({ status: "ready", trail: curatedTrail, approximateStart: false });
    void withWalkingPath(curatedTrail).then((routed) => {
      if (id === requestId.current) setDraft({ status: "ready", trail: routed, approximateStart: false });
    });
  }

  // No started route → every visit to the map gets a fresh one, once the server has said there is none.
  const noRun = runSync === "ready" && !run;
  useEffect(() => {
    if (route?.name !== "map" || !noRun || draft.status !== "idle") return;
    if (SURPRISE_ROUTE_ENABLED) void generateSurprise();
    else loadCurated();
  }, [route?.name, noRun, draft.status]);

  // Takes in the run the server returned. `ended` means the run this phone followed was abandoned elsewhere (the
  // partner unlinked or started another trail): say so once and go back to the trail list.
  const applyRun = useCallback(
    (next: Run | null, ended: boolean) => {
      // A stop or album of one run makes no sense once another run takes its place.
      const switched = runRef.current?.id !== next?.id;
      runRef.current = next;
      setRun(next);
      saveFollowedRun(me.id, next?.id ?? null);
      setRunSync("ready");
      setSyncTick((t) => t + 1);
      if (ended) {
        setEndedNotice(true);
        setSimulatedPosition(null);
      }
      setRoute((r) => {
        if (r === null) return r;
        const onTrail = r.name === "map" || r.name === "challenge" || r.name === "complete";
        if (ended && onTrail) return { name: "trailList" };
        if (switched && (r.name === "challenge" || r.name === "complete")) return { name: "map" };
        return r;
      });
    },
    [me.id, setSimulatedPosition],
  );

  // Loads the open run, which may be one the partner started. When the run this phone followed is no longer open,
  // its fate decides what happens: finished keeps it for the album, abandoned drops it with a notice.
  const refreshRun = useCallback(async (): Promise<void> => {
    const id = ++runRequest.current;
    try {
      const active = await loadActiveRun();
      const heldId = runRef.current?.id ?? loadFollowedRun(me.id);
      let next = active;
      let ended = false;
      if (heldId && heldId !== active?.id) {
        const held = await loadRun(heldId);
        if (held && isRunActive(held)) next = held;
        else if (held?.completedAt) next = active ?? held;
        else if (held?.abandonedAt) ended = true;
      }
      if (id !== runRequest.current) return;
      applyRun(next, ended);
      // The phone that saved the last stop finishes the run; this catches a finish that failed there.
      if (next && isRunActive(next) && allStopsDone(next) && !finishing.current.has(next.id)) {
        finishing.current.add(next.id);
        try {
          await finishRun(next.id);
          await refreshRun();
        } catch (e) {
          console.error("Couldn't finish the trail", e);
          finishing.current.delete(next.id);
        }
      }
    } catch (e) {
      console.error("Couldn't load the trail", e);
      if (id === runRequest.current) setRunSync((s) => (s === "ready" ? s : "error"));
    }
  }, [me.id, applyRun]);

  // Draws the walking path for a run once per device; the snapshot has none, and the foot router rate-limits.
  useEffect(() => {
    if (!run || walkingPath || routing.current.has(run.id)) return;
    const id = run.id;
    routing.current.add(id);
    withWalkingPath(run.trail).then(
      (routed) => {
        const path = routed.path;
        if (!path) return;
        saveWalkingPath(id, path, routed.distanceMeters);
        setRoutedPaths((all) => ({
          ...all,
          [id]: { path, distanceMeters: routed.distanceMeters, savedAt: Date.now() },
        }));
      },
      (e: unknown) => console.error("Couldn't draw the walking path", e),
    );
  }, [run, walkingPath]);

  // Takes in the partner the server returned. A partner this device knew about who is gone means the other
  // person unlinked: say so once, with no reason (main spec 6.3), and carry on solo.
  const applyPartner = useCallback(
    (next: Profile | null) => {
      const known = loadLinkState(me.id).knownPartnerId;
      if (next && next.id !== known) {
        setLinkState(saveLinkState(me.id, { knownPartnerId: next.id, solo: false }));
        // Linking used up or outdated the open invite; the next visit to the invite screen needs a fresh one.
        forgetOpenInvite();
      }
      if (!next && known) {
        setLinkState(saveLinkState(me.id, { knownPartnerId: null, solo: true }));
        setUnlinkedNotice(true);
      }
      setPartner(next);
      setRoute((r) => {
        if (r === null) return firstRoute(next, loadLinkState(me.id));
        if (next && r.name === "partner") return { name: "linked" };
        if (!next && r.name === "linked") return { name: "map" };
        return r;
      });
    },
    [me.id],
  );

  // Stale answers lose to newer requests and to an unlink on this phone.
  const refreshPartner = useCallback(async () => {
    const id = ++partnerRequest.current;
    try {
      const next = await loadPartner(me.id);
      if (id === partnerRequest.current) applyPartner(next);
    } catch (e) {
      console.error("Couldn't load the partner", e);
      // Offline at launch: open where this device would, and keep the partner it knew.
      if (id === partnerRequest.current) setRoute((r) => r ?? firstRoute(null, loadLinkState(me.id)));
    }
  }, [me.id, applyPartner]);

  // Load on start, and again whenever the app returns to the foreground, so an unlink or the partner's progress on
  // the other phone shows.
  useEffect(() => {
    void refreshPartner();
    void refreshRun();
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshPartner();
      void refreshRun();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPartner, refreshRun]);

  // While a run is open, check now and then for the partner's progress.
  useEffect(() => {
    if (!runOpen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshRun();
    }, RUN_POLL_MS);
    return () => window.clearInterval(timer);
  }, [runOpen, refreshRun]);

  // Entering the map or a stop shows the latest progress.
  const trailScreen = route?.name === "map" ? "map" : route?.name === "challenge" ? `stop:${route.stopId}` : null;
  useEffect(() => {
    if (trailScreen) void refreshRun();
  }, [trailScreen, refreshRun]);

  // The inviting phone stays in the foreground while the partner scans, so it checks now and then.
  const onInviteScreen = route?.name === "partner";
  useEffect(() => {
    if (!onInviteScreen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPartner();
    }, INVITE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [onInviteScreen, refreshPartner]);

  // Where the app rests: the map, unless the user has neither a partner nor chosen to walk solo.
  function homeRoute(): Route {
    return partner || linkState.solo ? { name: "map" } : { name: "partner" };
  }

  function handleWalkSolo() {
    setLinkState(saveLinkState(me.id, { solo: true }));
    setRoute({ name: "map" });
  }

  function handleInviteDone() {
    clearPendingInvite();
    setRoute(homeRoute());
  }

  async function handleLinked() {
    clearPendingInvite();
    const id = ++partnerRequest.current;
    try {
      const next = await loadPartner(me.id);
      if (id !== partnerRequest.current) return;
      applyPartner(next);
      setRoute(next ? { name: "linked" } : { name: "map" });
    } catch (e) {
      console.error("Couldn't load the partner", e);
      setRoute({ name: "map" });
    }
  }

  // Unlinking abandons the couple's open run (unlink()); the refresh drops it here with the notice.
  async function handleUnlink() {
    await unlink();
    partnerRequest.current++;
    setLinkState(saveLinkState(me.id, { knownPartnerId: null, solo: true }));
    setPartner(null);
    void refreshRun();
  }

  // Leaving a started route ends it for both partners, so check first.
  function confirmAbandon(): boolean {
    if (!run || activeDone) return true;
    return window.confirm(`Leave “${run.trail.name}”? Your progress on it will be lost.`);
  }

  // Ends the open run on the server and forgets the run on this phone. False when the server couldn't be reached.
  async function leaveRun(): Promise<boolean> {
    const current = runRef.current;
    runRequest.current++;
    if (current && isRunActive(current)) {
      try {
        await abandonRun(current.id);
      } catch (e) {
        console.error("Couldn't leave the trail", e);
        window.alert("Couldn’t leave the trail. Check your connection and try again.");
        return false;
      }
    }
    runRequest.current++;
    applyRun(null, false);
    setSimulatedPosition(null);
    return true;
  }

  async function handleSelectSurprise() {
    if (!confirmAbandon() || !(await leaveRun())) return;
    void generateSurprise();
    setRoute({ name: "map" });
  }

  async function handleSelectCurated() {
    if (!confirmAbandon() || !(await leaveRun())) return;
    loadCurated();
    setRoute({ name: "map" });
  }

  // Starting a run on the server also abandons any run either partner still had open.
  async function handleStartRoute() {
    if (draft.status !== "ready" || starting) return;
    const trail = draft.trail;
    setStarting(true);
    setStartFailed(false);
    runRequest.current++;
    try {
      const started = await startRun(trail);
      // This phone already drew the path for the draft, so it needn't ask the router again.
      if (trail.path) {
        saveWalkingPath(started.id, trail.path, trail.distanceMeters);
        const saved = { path: trail.path, distanceMeters: trail.distanceMeters, savedAt: Date.now() };
        setRoutedPaths((all) => ({ ...all, [started.id]: saved }));
      }
      setSimulatedPosition(null);
      applyRun(started, false);
      setDraft({ status: "idle" });
    } catch (e) {
      console.error("Couldn't start the route", e);
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  }

  async function handleNewRoute() {
    if (!confirmAbandon() || !(await leaveRun())) return;
    void generateSurprise();
  }

  function handleSignOut() {
    requestId.current++;
    runRequest.current++;
    setSimulatedPosition(null);
    onSignOut();
  }

  function handleSimulateArrival(stop: Stop) {
    setSimulatedPosition({ lat: stop.lat, lng: stop.lng });
  }

  // The first photo or skip completes a stop (a partner's earlier completion stands). Then back to the map, or on to
  // the album once every stop is done.
  async function completeAndMoveOn(stopId: string) {
    const current = runRef.current;
    if (!current) throw new Error("No trail is running");
    try {
      await completeStop(current.id, stopId);
    } catch (e) {
      // Most likely the run ended on the other phone; the refresh says so.
      void refreshRun();
      throw e;
    }
    runRequest.current++;
    const fresh = (await loadRun(current.id).catch(() => null)) ?? {
      ...current,
      completions: { ...current.completions, [stopId]: { by: me.id, at: new Date().toISOString() } },
    };
    if (isRunActive(fresh) && allStopsDone(fresh)) {
      finishing.current.add(fresh.id);
      try {
        await finishRun(fresh.id);
        applyRun({ ...fresh, completedAt: new Date().toISOString() }, false);
      } catch (e) {
        // The stops are saved; the next refresh finishes the run.
        console.error("Couldn't finish the trail", e);
        finishing.current.delete(fresh.id);
        applyRun(fresh, false);
      }
      setRoute({ name: "complete" });
      return;
    }
    applyRun(fresh, false);
    setRoute({ name: "map" });
  }

  async function handleStopPhoto(stopId: string, prepared: PreparedPhoto): Promise<RunPhoto> {
    const current = runRef.current;
    if (!current) throw new Error("No trail is running");
    let photo = uploaded.current.get(prepared);
    if (!photo) {
      photo = await uploadPhoto(current.id, stopId, prepared);
      uploaded.current.set(prepared, photo);
    }
    // A photo at a stop that is already done just joins the others.
    if (!(stopId in current.completions)) await completeAndMoveOn(stopId);
    return photo;
  }

  if (route === null)
    return (
      <PhoneFrame>
        <LoadingScreen />
      </PhoneFrame>
    );

  return (
    <PhoneFrame theme={theme}>
      {route.name === "partner" && (
        <PartnerLink
          me={me}
          onEnterCode={(code) => setRoute({ name: "accept", code })}
          onWalkSolo={handleWalkSolo}
          onInviteRefused={refreshPartner}
          onSignOut={handleSignOut}
        />
      )}

      {route.name === "accept" && (
        <LinkInvite key={route.code} code={route.code} onLinked={handleLinked} onDone={handleInviteDone} />
      )}

      {route.name === "linked" && partner && (
        <LinkedScreen me={me} partner={partner} onContinue={() => setRoute({ name: "trailList" })} />
      )}

      {route.name === "settings" && (
        <Settings
          me={me}
          email={me.email}
          partner={partner}
          onUnlink={handleUnlink}
          onLinkPartner={() => setRoute({ name: "partner" })}
          onSignOut={handleSignOut}
          onExplore={() => setRoute({ name: "map" })}
        />
      )}

      {route.name === "trailList" && (
        <TrailList
          curated={curatedTrail}
          activeTrail={runTrail && !activeDone ? runTrail : null}
          onBack={() => setRoute(partner ? { name: "map" } : { name: "partner" })}
          onContinue={() => setRoute({ name: "map" })}
          onSelectSurprise={() => void handleSelectSurprise()}
          onSelectCurated={() => void handleSelectCurated()}
        />
      )}

      {route.name === "map" && (
        <MapScreen
          trail={shownTrail}
          status={mapStatus}
          error={draft.status === "error" ? draft.error : undefined}
          approximateStart={draft.status === "ready" ? draft.approximateStart : false}
          onStartRoute={() => void handleStartRoute()}
          starting={starting}
          startFailed={startFailed}
          onNewRoute={() => void handleNewRoute()}
          onRetrySync={() => {
            setRunSync("loading");
            void refreshRun();
          }}
          completions={run?.completions ?? {}}
          position={position}
          simulated={simulated}
          onSimulateArrival={handleSimulateArrival}
          onOpenChallenge={(stopId) => setRoute({ name: "challenge", stopId })}
          onViewAlbum={() => setRoute({ name: "complete" })}
          me={me}
          partner={partner}
          onLinkPartner={() => setRoute({ name: "partner" })}
          onProfile={() => setRoute({ name: "settings" })}
          onSignOut={handleSignOut}
          onBack={() => setRoute({ name: "trailList" })}
        />
      )}

      {route.name === "challenge" &&
        run &&
        runTrail &&
        (() => {
          const stop = runTrail.stops.find((s) => s.id === route.stopId);
          if (!stop) return null;
          const shared = {
            trail: runTrail,
            stop,
            runId: run.id,
            canAddPhotos: canAddPhotos(run),
            completions: run.completions,
            syncTick,
            onBack: () => setRoute({ name: "map" }),
            onUpload: (prepared: PreparedPhoto) => handleStopPhoto(stop.id, prepared),
            onSkip: () => completeAndMoveOn(stop.id),
          };
          if (runTrail.id === SHERLOCK_ID) {
            return (
              <SherlockChallengeScreen
                key={stop.id}
                {...shared}
                me={me}
                partner={partner}
                runPartnerName={runPartnerName}
              />
            );
          }
          return <ChallengeScreen key={stop.id} {...shared} meId={me.id} partnerName={runPartnerName} />;
        })()}

      {route.name === "complete" &&
        run &&
        (run.trail.id === SHERLOCK_ID ? (
          <SherlockCompleteScreen
            runId={run.id}
            meId={me.id}
            partnerName={runPartnerName}
            syncTick={syncTick}
            onViewMap={() => setRoute({ name: "map" })}
          />
        ) : (
          <CompleteScreen
            runId={run.id}
            meId={me.id}
            partnerName={runPartnerName}
            syncTick={syncTick}
            onViewMap={() => setRoute({ name: "map" })}
          />
        ))}

      {unlinkedNotice ? (
        <UnlinkedNotice onClose={() => setUnlinkedNotice(false)} />
      ) : (
        endedNotice && <TrailEndedNotice onClose={() => setEndedNotice(false)} />
      )}
    </PhoneFrame>
  );
}

// A pending invite from a /link/<code> URL comes first; then the map, unless the user has yet to choose between
// linking and walking solo.
function firstRoute(partner: Profile | null, state: LinkState): Route {
  const pending = loadPendingInvite();
  if (pending) return { name: "accept", code: pending };
  if (partner || state.solo || state.knownPartnerId) return { name: "map" };
  return { name: "partner" };
}

// Main spec 6.3: the message and nothing else.
function UnlinkedNotice({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div className="notice-backdrop">
      <div className="notice-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unlinked-title">
        <h2 id="unlinked-title">You are no longer linked</h2>
        <button ref={closeRef} type="button" className="btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}

// The run this phone followed was abandoned on the other phone. One line, no reason, like the unlink notice.
function TrailEndedNotice({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <div className="notice-backdrop">
      <div className="notice-dialog" role="alertdialog" aria-modal="true" aria-labelledby="trail-ended-title">
        <h2 id="trail-ended-title">This trail has ended.</h2>
        <button ref={closeRef} type="button" className="btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
