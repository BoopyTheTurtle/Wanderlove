import { useCallback, useEffect, useRef, useState } from "react";
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
import { clearPendingInvite, forgetPartner, loadLinkState, loadPendingInvite, saveLinkState } from "./lib/session";
import type { LinkState } from "./lib/session";
import { loadPartner, unlink } from "./lib/couples";
import { trail as curatedTrail } from "@wannadoo/core";
import type { Stop, Trail } from "@wannadoo/core";
import { useLivePosition } from "./lib/useLivePosition";
import { loadProgress, resetProgress, saveStopProgress } from "./lib/progress";
import { clearActiveRoute, loadActiveRoute, saveActiveRoute } from "./lib/activeRoute";
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

// Signing out clears everything this phone keeps for the signed-in user, except the solo choice.
function signOutAndClear(userId: string) {
  clearActiveRoute();
  resetProgress();
  forgetPartner(userId);
  clearPendingInvite();
  signOut().catch((e: unknown) => console.error("Sign-out failed", e));
}

// Gates the app on auth: sign-in, then onboarding, then the trail flow.
export default function App() {
  const auth = useAuth();
  const [testMode, setTestMode] = useState(false);
  const userId = auth.status === "signedIn" ? auth.user.id : null;
  const [loaded, setLoaded] = useState<{ userId: string; state: ProfileState } | null>(null);
  const [attempt, setAttempt] = useState(0);

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
  const [progress, setProgress] = useState(loadProgress());
  const [activeTrail, setActiveTrail] = useState<Trail | null>(loadActiveRoute);
  const [draft, setDraft] = useState<Draft>({ status: "idle" });
  const requestId = useRef(0);
  const { position, simulated, setSimulatedPosition } = useLivePosition();

  const shownTrail = activeTrail ?? (draft.status === "ready" ? draft.trail : null);
  // The Sherlock trail swaps the teal look for the red field-book theme from the map onwards.
  const themeTrail =
    route?.name === "map" ? shownTrail : route?.name === "challenge" || route?.name === "complete" ? activeTrail : null;
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

  function loadCurated() {
    const id = ++requestId.current;
    setDraft({ status: "ready", trail: curatedTrail, approximateStart: false });
    void withWalkingPath(curatedTrail).then((routed) => {
      if (id === requestId.current) setDraft({ status: "ready", trail: routed, approximateStart: false });
    });
  }

  // No started route → every visit to the map gets a fresh one.
  useEffect(() => {
    if (route?.name !== "map" || activeTrail || draft.status !== "idle") return;
    if (SURPRISE_ROUTE_ENABLED) void generateSurprise();
    else loadCurated();
  }, [route?.name, activeTrail, draft.status]);

  // Takes in the partner the server returned. A partner this device knew about who is gone means the other
  // person unlinked: say so once, with no reason (main spec 6.3), and carry on solo.
  const applyPartner = useCallback(
    (next: Profile | null) => {
      const known = loadLinkState(me.id).knownPartnerId;
      if (next && next.id !== known) setLinkState(saveLinkState(me.id, { knownPartnerId: next.id, solo: false }));
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

  // Load on start, and again whenever the app returns to the foreground, so an unlink on the other phone shows.
  useEffect(() => {
    void refreshPartner();
    function onVisible() {
      if (document.visibilityState === "visible") void refreshPartner();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPartner]);

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

  async function handleUnlink() {
    await unlink();
    partnerRequest.current++;
    setLinkState(saveLinkState(me.id, { knownPartnerId: null, solo: true }));
    setPartner(null);
  }

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
    loadCurated();
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

  function handleSignOut() {
    requestId.current++;
    setSimulatedPosition(null);
    onSignOut();
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
          activeTrail={activeTrail && !activeDone ? activeTrail : null}
          onBack={() => setRoute(partner ? { name: "map" } : { name: "partner" })}
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
          onProfile={() => setRoute({ name: "settings" })}
          onSignOut={handleSignOut}
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

      {unlinkedNotice && <UnlinkedNotice onClose={() => setUnlinkedNotice(false)} />}
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
