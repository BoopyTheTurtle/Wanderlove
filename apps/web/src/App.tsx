import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "./components/PhoneFrame";
import { TrailList } from "./screens/TrailList";
import { MapScreen } from "./screens/MapScreen";
import type { RouteStatus } from "./screens/MapScreen";
import { ChallengeScreen } from "./screens/ChallengeScreen";
import { CompleteScreen } from "./screens/CompleteScreen";
import { SherlockChallengeScreen } from "./screens/SherlockChallengeScreen";
import { SherlockCompleteScreen } from "./screens/SherlockCompleteScreen";
import { Home } from "./screens/Home";
import { Activity } from "./screens/Activity";
import { NavContext } from "./components/nav";
import type { NavHandlers } from "./components/nav";
import { WhoAmI } from "./screens/WhoAmI";
import { LinkedScreen, PartnerLink } from "./screens/PartnerLink";
import { LinkInvite, LinkRequestDialog, LinkWaiting } from "./screens/LinkInvite";
import { Settings } from "./screens/Settings";
import { SignIn } from "./screens/SignIn";
import { ProfileSetup } from "./screens/ProfileSetup";
import { KeyUnlock } from "./screens/KeyUnlock";
import { PartnerKeyConfirm, PartnerKeyMismatch } from "./screens/PartnerKeyConfirm";
import { BrandMark, StatusBar } from "./components/PhoneFrame";
import type { Profile } from "@wannadoo/core";
import { clearPendingInvite, forgetOpenInvite, loadLinkState, loadPendingInvite, saveLinkState } from "./lib/session";
import type { LinkState } from "./lib/session";
import { confirmLink, declineLink, loadLinkRequests, loadPartner, NO_LINK_REQUESTS, unlink } from "./lib/couples";
import type { LinkRequests } from "./lib/couples";
import { trail as curatedTrail } from "@wannadoo/core";
import type { Stop, Trail } from "@wannadoo/core";
import { useLivePosition } from "./lib/useLivePosition";
import {
  abandonRun,
  acceptRun,
  allStopsDone,
  completeStop,
  declineRun,
  finishRun,
  canAddPhotos,
  isRunActive,
  loadActiveRun,
  loadRun,
  loadRunInvite,
  RunKeysNotReadyError,
  startRun,
} from "./lib/runs";
import type { QuestMode, Run } from "./lib/runs";
import { QuestInvite } from "./components/QuestInvite";
import { uploadPhoto } from "./lib/photos";
import type { PreparedPhoto, RunPhoto } from "./lib/photos";
import {
  dropLegacyTrailData,
  keepWalkingPathOnly,
  loadFollowedRun,
  loadWalkingPath,
  saveFollowedRun,
  saveWalkingPath,
} from "./lib/runDevice";
import { clearAllForUser, clearOnSignOut } from "./lib/deviceData";
import type { WalkingPath } from "./lib/runDevice";
import { generateRoute, withWalkingPath } from "@wannadoo/core";
import { SURPRISE_ROUTE_ENABLED } from "./features";
import { getStartPosition } from "./lib/startPosition";
import { signOut, signOutOtherDevices, useAuth } from "./lib/auth";
import { isOnboarded, loadOwnProfile, toProfile } from "./lib/profile";
import type { ProfileRow } from "./lib/profile";
import { isLocalStack } from "./lib/supabase";
import {
  KeysAlreadyExistError,
  checkPartnerKey,
  loadKeyState,
  loadRecoveryViewedAt,
  markRecoveryViewed,
  partnerKeyIdForCheck,
  prepareAccountKeys,
  rotateAccountKeys,
  saveAccountKeys,
  trustPartnerKey,
  unlinkMismatchedPartner,
  verifyPartnerKey,
} from "./lib/keys";
import type { PartnerKeyCheck } from "./lib/keys";
import { forgetRecoveryCode, markRecoveryHintDone, recoveryHintDone } from "./lib/keyStore";
import type { DeviceKeys } from "./lib/keyStore";
import { RunKeyContext, runKeyLoader, useRunKeyLoader } from "./lib/photoKeys";
import type { ReactNode } from "react";

type ProfileState = { status: "loading" } | { status: "error" } | { status: "ready"; row: ProfileRow };

// How often the invite screen checks whether the partner has linked, since that phone keeps focus meanwhile.
const INVITE_POLL_MS = 4000;
// How often the app checks the partner and the trail while it is in view, so a trail the partner starts, their
// progress, and a link or unlink show up without refocusing. Partners often keep both phones open side by side.
const SYNC_POLL_MS = 10000;
// How often the app checks whether the partner's photo keys changed while it is in view.
const PARTNER_KEY_POLL_MS = 60000;

const SHERLOCK_ID = "sherlock-holmes-spikeri";

// Signing out clears what this phone keeps about the signed-in user's links and walks, except the solo choice and the
// photo keys (lib/deviceData.ts). Trail runs live on the server.
function signOutAndClear(userId: string) {
  clearOnSignOut(userId);
  signOut().catch((e: unknown) => console.error("Sign-out failed", e));
}

// "Leave this phone clean": signs out, then removes everything this phone keeps for the user, keys included. The
// reload drops what only memory held, such as run keys and the place cache. Throws when the sign-out fails, and then
// clears nothing.
async function signOutAndLeaveClean(userId: string) {
  await signOut();
  try {
    await clearAllForUser(userId);
  } catch (e) {
    console.error("Couldn't clear this phone", e);
  }
  window.location.replace("/");
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

  // Keyed by user, so switching accounts starts the key check and the trail flow afresh.
  return (
    <KeyGate key={auth.user.id} userId={auth.user.id} onSignOut={() => signOutAndClear(auth.user.id)}>
      {(keys, setKeys) => (
        <RunKeyProvider userId={auth.user.id} keys={keys}>
          <SignedInApp
            me={toProfile(profile.row, auth.user.email ?? "")}
            keys={keys}
            onKeysChange={setKeys}
            onSignOut={() => signOutAndClear(auth.user.id)}
          />
        </RunKeyProvider>
      )}
    </KeyGate>
  );
}

// Every screen below reaches run photo keys through this (lib/photoKeys.ts), so the device keys stay here.
function RunKeyProvider({ userId, keys, children }: { userId: string; keys: DeviceKeys; children: ReactNode }) {
  const load = useMemo(() => runKeyLoader(userId, keys), [userId, keys]);
  return <RunKeyContext.Provider value={load}>{children}</RunKeyContext.Provider>;
}

type KeyGateState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "unlock"; canUseCode: boolean; replaced: boolean }
  | { status: "ready"; keys: DeviceKeys };

type PartnerKeyPrompt = Extract<PartnerKeyCheck, { status: "confirm" }>;

// Loads this device's keys, making and publishing a pair when the account has none. Shared while in flight, so a
// double mount doesn't make two pairs; a pair another phone stored first sends this one to unlock.
const keyLoads = new Map<string, Promise<KeyGateState>>();

function loadOrCreateKeys(userId: string): Promise<KeyGateState> {
  const inFlight = keyLoads.get(userId);
  if (inFlight) return inFlight;
  const load = (async (): Promise<KeyGateState> => {
    const state = await loadKeyState(userId);
    if (state.status !== "setup") return state;
    try {
      return { status: "ready", keys: await saveAccountKeys(userId, await prepareAccountKeys(), { replace: false }) };
    } catch (e) {
      if (!(e instanceof KeysAlreadyExistError)) throw e;
      const again = await loadKeyState(userId);
      if (again.status === "setup") throw e;
      return again;
    }
  })().finally(() => keyLoads.delete(userId));
  keyLoads.set(userId, load);
  return load;
}

// Photo keys come before the rest of the app (photo-encryption.md, sections 4 and 5): a new account gets its keys
// quietly, with the recovery code in Settings; a phone without keys unlocks with the code or starts fresh for the
// partner to re-share; and a partner key that changed waits for the user's trust. The app stays mounted, hidden,
// while that last question is open.
function KeyGate({
  userId,
  onSignOut,
  children,
}: {
  userId: string;
  onSignOut: () => void;
  // setKeys takes this device's keys after they change in the app (the recovery code seen, or a new pair).
  children: (keys: DeviceKeys, setKeys: (keys: DeviceKeys) => void) => ReactNode;
}) {
  const [gate, setGate] = useState<KeyGateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [prompt, setPrompt] = useState<PartnerKeyPrompt | null>(null);
  // The partner's key differs from the key ID their invite carried, and the accept screen didn't unlink.
  const [mismatch, setMismatch] = useState<string | null>(null);
  // A key the user answered "Not now" for; asked again on the next app open.
  const dismissedKeyId = useRef<string | null>(null);
  const checkRequest = useRef(0);

  useEffect(() => {
    let active = true;
    loadOrCreateKeys(userId).then(
      (state) => active && setGate(state),
      (e: unknown) => {
        console.error("Couldn't load the photo keys", e);
        if (active) setGate({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  function reload() {
    setGate({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  // Option C: a fresh pair replaces the account's earlier one; its new code shows once in Settings.
  function startFresh() {
    setGate({ status: "loading" });
    prepareAccountKeys()
      .then((pending) => saveAccountKeys(userId, pending, { replace: true }))
      .then(
        (keys) => setGate({ status: "ready", keys }),
        (e: unknown) => {
          console.error("Couldn't make new keys", e);
          setGate({ status: "error" });
        },
      );
  }

  const keys = gate.status === "ready" ? gate.keys : null;

  const checkPartner = useCallback(async () => {
    const id = ++checkRequest.current;
    try {
      const invite = await verifyPartnerKey(userId);
      const result = await checkPartnerKey(userId);
      if (id !== checkRequest.current) return;
      setMismatch(invite.status === "mismatch" ? invite.partnerName : null);
      setPrompt(result.status === "confirm" && result.key.keyId !== dismissedKeyId.current ? result : null);
    } catch (e) {
      console.error("Couldn't check the partner's keys", e);
    }
  }, [userId]);

  // On open, on returning to the foreground, and now and then while in view.
  useEffect(() => {
    if (!keys) return;
    void checkPartner();
    function onVisible() {
      if (document.visibilityState === "visible") void checkPartner();
    }
    const timer = window.setInterval(onVisible, PARTNER_KEY_POLL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [keys, checkPartner]);

  if (gate.status === "loading")
    return (
      <PhoneFrame>
        <LoadingScreen />
      </PhoneFrame>
    );
  if (gate.status === "error")
    return (
      <PhoneFrame>
        <LoadingScreen
          error
          message="Couldn’t load your photo keys. Check your connection and try again."
          onRetry={reload}
          onSignOut={onSignOut}
        />
      </PhoneFrame>
    );
  if (gate.status === "unlock")
    return (
      <PhoneFrame>
        <KeyUnlock
          userId={userId}
          canUseCode={gate.canUseCode}
          replaced={gate.replaced}
          onUnlocked={(ready) => setGate({ status: "ready", keys: ready })}
          onStartFresh={startFresh}
          onSignOut={onSignOut}
        />
      </PhoneFrame>
    );

  const readyKeys = gate.keys;
  const setKeys = (next: DeviceKeys) => setGate({ status: "ready", keys: next });
  return (
    <>
      {mismatch !== null && (
        <PhoneFrame>
          <PartnerKeyMismatch
            partnerName={mismatch}
            onUnlink={async () => {
              checkRequest.current++;
              await unlinkMismatchedPartner(userId);
              setMismatch(null);
            }}
          />
        </PhoneFrame>
      )}
      {prompt && mismatch === null && (
        <PhoneFrame>
          <PartnerKeyConfirm
            key={prompt.key.keyId}
            partnerName={prompt.partnerName}
            reason={prompt.reason}
            myKeyId={readyKeys.keyId}
            partnerKeyId={prompt.key.keyId}
            onTrust={async () => {
              checkRequest.current++;
              await trustPartnerKey(userId, readyKeys, prompt.key);
              setPrompt(null);
            }}
            onNotNow={() => {
              checkRequest.current++;
              dismissedKeyId.current = prompt.key.keyId;
              setPrompt(null);
            }}
          />
        </PhoneFrame>
      )}
      <div className="key-gate-app" hidden={prompt !== null || mismatch !== null}>
        {children(readyKeys, setKeys)}
      </div>
    </>
  );
}

// What the map says when a start fails. A start waits for the partner's keys, so photos never upload unencrypted.
function startErrorMessage(e: unknown, partnerName: string): string {
  if (e instanceof RunKeysNotReadyError) {
    if (e.reason === "partner-without-keys") {
      return `${partnerName} needs to open Wannadoo once on their phone before you start, so your photos stay private.`;
    }
    if (e.reason === "partner-unconfirmed") {
      return `${partnerName}’s keys changed. Reopen Wannadoo to confirm them, then start.`;
    }
  }
  return "Couldn’t start the route. Check your connection and try again.";
}

function LoadingScreen({
  error,
  message = "Couldn’t load your profile. Check your connection and try again.",
  onRetry,
  onSignOut,
}: {
  error?: boolean;
  message?: string;
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
            <p className="intro">{message}</p>
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
  | { name: "home" }
  | { name: "activity" }
  // A past run's album, opened from Activity.
  | { name: "album"; runId: string; trailId: string }
  | { name: "partner" }
  // keyId: the inviter's key ID from a link or QR; null for a typed code.
  | { name: "accept"; code: string; keyId: string | null }
  // The invitee's phone while the inviter has yet to confirm.
  | { name: "waiting" }
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

function SignedInApp({
  me,
  keys,
  onKeysChange,
  onSignOut,
}: {
  me: Profile;
  // This device's photo keys: an encrypted start wraps the run key for them.
  keys: DeviceKeys;
  onKeysChange: (keys: DeviceKeys) => void;
  onSignOut: () => void;
}) {
  // Held until the user has seen it once in Profile (security review, finding 3).
  const recoveryCode = keys.recoveryCode ?? null;
  // A calm one-time hint after a finished trail, while the code waits unseen; dismissed per device.
  const [hintDone, setHintDone] = useState(() => recoveryHintDone(me.id));
  // The partner's key ID for the emoji check on the linked screen and in Profile.
  const [partnerKeyId, setPartnerKeyId] = useState<string | null>(null);
  const [recoveryViewedAt, setRecoveryViewedAt] = useState<string | null>(null);
  const loadRunKey = useRunKeyLoader();
  const [linkState, setLinkState] = useState<LinkState>(() => loadLinkState(me.id));
  const [partner, setPartner] = useState<Profile | null>(null);
  // Open link requests while unlinked (docs/private-trails.md, section 6); null until first loaded.
  const [linkRequests, setLinkRequests] = useState<LinkRequests | null>(null);
  // The other side's key ID for the emoji check on a link request.
  const [requestKeyId, setRequestKeyId] = useState<string | null>(null);
  // Null until the partner first loads, since that decides where the app opens.
  const [route, setRoute] = useState<Route | null>(null);
  const partnerRequest = useRef(0);
  // The started run from the server: open, or finished and waiting for the album. Null when there is none.
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  const [runSync, setRunSync] = useState<"loading" | "error" | "ready">("loading");
  // Bumped on every sync, so screens showing photos reload them too.
  const [syncTick, setSyncTick] = useState(0);
  const runRequest = useRef(0);
  const [endedNotice, setEndedNotice] = useState(false);
  // The partner's invitation to their Together quest; this phone joins only when the user says so.
  const [runInvite, setRunInvite] = useState<{ runId: string } | null>(null);
  const inviteRequest = useRef(0);
  // Who the next quest is for, chosen on Home while linked.
  const [questMode, setQuestMode] = useState<QuestMode>("together");
  const [starting, setStarting] = useState(false);
  // Why the last start failed, shown on the map; null when it didn't.
  const [startError, setStartError] = useState<string | null>(null);
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
  const cachedPath = useMemo(() => (runId ? loadWalkingPath(me.id, runId) : null), [me.id, runId]);
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
  const runPartnerName = run?.coupleId ? (partner?.name ?? null) : null;

  const shownTrail = runTrail ?? (runSync === "ready" && draft.status === "ready" ? draft.trail : null);
  // The Sherlock trail swaps the plain wine look for the field-book theme from the map onwards.
  const themeTrail =
    route?.name === "map" ? shownTrail : route?.name === "challenge" || route?.name === "complete" ? runTrail : null;
  const themeTrailId = route?.name === "album" ? route.trailId : themeTrail?.id;
  const theme = themeTrailId === SHERLOCK_ID ? "sherlock" : undefined;
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
    setStartError(null);
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
    setStartError(null);
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
  // partner unlinked or started another trail): say so once and go back to the trail list. A partner's run arrives
  // only once this user joined it, so nothing here opens the map by itself.
  const applyRun = useCallback(
    (next: Run | null, ended: boolean) => {
      // A stop or album of one run makes no sense once another run takes its place.
      const switched = runRef.current?.id !== next?.id;
      runRef.current = next;
      setRun(next);
      saveFollowedRun(me.id, next?.id ?? null);
      // A walking path can start at a home: the phone keeps it only while its run is open (abuse threat model, L4).
      keepWalkingPathOnly(me.id, next && isRunActive(next) ? next.id : null);
      setRunSync("ready");
      setSyncTick((t) => t + 1);
      if (ended) {
        setEndedNotice(true);
        setSimulatedPosition(null);
      }
      setRoute((r) => {
        if (r === null) return r;
        const onTrail = r.name === "map" || r.name === "challenge" || r.name === "complete";
        if (ended && onTrail) return { name: "home" };
        if (switched && (r.name === "challenge" || r.name === "complete")) return { name: "map" };
        return r;
      });
    },
    [me.id, setSimulatedPosition],
  );

  // The partner's open invitation, if any. A Just me quest never has one, so it never shows here.
  const refreshInvite = useCallback(async () => {
    const id = ++inviteRequest.current;
    try {
      const next = await loadRunInvite();
      if (id === inviteRequest.current) setRunInvite(next);
    } catch (e) {
      console.error("Couldn't check for invitations", e);
    }
  }, []);

  // Loads the open run, which may be one the partner started. When the run this phone followed is no longer open,
  // its fate decides what happens: finished keeps it for the album, abandoned drops it with a notice and goes home.
  const refreshRun = useCallback(async (): Promise<void> => {
    const id = ++runRequest.current;
    try {
      const active = await loadActiveRun(loadRunKey);
      const heldId = runRef.current?.id ?? loadFollowedRun(me.id);
      let next = active;
      let ended = false;
      if (heldId && heldId !== active?.id) {
        const held = await loadRun(heldId, loadRunKey);
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
  }, [me.id, applyRun, loadRunKey]);

  // Draws the walking path for an open run once per device; the snapshot has none, and the foot router rate-limits.
  // A run that ended keeps no path.
  useEffect(() => {
    if (!run || !isRunActive(run) || walkingPath || routing.current.has(run.id)) return;
    const id = run.id;
    routing.current.add(id);
    withWalkingPath(run.trail).then(
      (routed) => {
        const path = routed.path;
        if (!path) return;
        const current = runRef.current;
        if (current?.id !== id || !isRunActive(current)) return;
        saveWalkingPath(me.id, id, path, routed.distanceMeters);
        setRoutedPaths((all) => ({
          ...all,
          [id]: { path, distanceMeters: routed.distanceMeters, savedAt: Date.now() },
        }));
      },
      (e: unknown) => console.error("Couldn't draw the walking path", e),
    );
  }, [run, walkingPath, me.id]);

  // Takes in the partner the server returned. A partner this device knew about who is gone means the other person
  // unlinked: the app quietly carries on solo, with no dialog (abuse threat model, section 6, decision 3). The unlinked
  // state shows the next time the link matters, on Home and in Profile.
  const applyPartner = useCallback(
    (next: Profile | null) => {
      const known = loadLinkState(me.id).knownPartnerId;
      if (next && next.id !== known) {
        setLinkState(saveLinkState(me.id, { knownPartnerId: next.id, solo: false }));
        // Linking used up or outdated the open invite; the next visit to the invite screen needs a fresh one.
        forgetOpenInvite();
      }
      if (!next && known) setLinkState(saveLinkState(me.id, { knownPartnerId: null, solo: true }));
      setPartner(next);
      setRoute((r) => {
        if (r === null) return firstRoute(next, loadLinkState(me.id));
        if (next && (r.name === "partner" || r.name === "waiting")) return { name: "linked" };
        if (!next && r.name === "linked") return { name: "home" };
        return r;
      });
    },
    [me.id],
  );

  // Stale answers lose to newer requests and to an unlink on this phone. While unlinked it also loads link requests: an
  // invitee who asked to link waits on its own screen, and an inviter gets the question.
  const refreshPartner = useCallback(async () => {
    const id = ++partnerRequest.current;
    try {
      const next = await loadPartner(me.id);
      const requests = next ? NO_LINK_REQUESTS : await loadLinkRequests(me.id);
      if (id !== partnerRequest.current) return;
      applyPartner(next);
      setLinkRequests(requests);
      if (requests.outgoing) setRoute((r) => (r?.name === "partner" ? { name: "waiting" } : r));
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
    void refreshInvite();
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      void refreshPartner();
      void refreshRun();
      void refreshInvite();
    }
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshPartner, refreshRun, refreshInvite]);

  // While the app is in view, check now and then for the partner, the trail, open or not, and an invitation.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshPartner();
      void refreshRun();
      void refreshInvite();
    }, SYNC_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshPartner, refreshRun, refreshInvite]);

  // Entering the map or a stop shows the latest progress.
  const trailScreen = route?.name === "map" ? "map" : route?.name === "challenge" ? `stop:${route.stopId}` : null;
  useEffect(() => {
    if (trailScreen) void refreshRun();
  }, [trailScreen, refreshRun]);

  // The inviting phone stays in the foreground while the partner scans, and the invitee's while it waits for the
  // confirmation, so both check now and then.
  const onInviteScreen = route?.name === "partner" || route?.name === "waiting";
  useEffect(() => {
    if (!onInviteScreen) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPartner();
    }, INVITE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [onInviteScreen, refreshPartner]);

  // The emoji check needs the partner's key ID on the linked screen and in Profile.
  const showsKeyCheck = route?.name === "linked" || route?.name === "settings";
  const partnerId = partner?.id ?? null;
  useEffect(() => {
    if (!showsKeyCheck || !partnerId) return;
    let active = true;
    partnerKeyIdForCheck(me.id, partnerId).then(
      (id) => active && setPartnerKeyId(id),
      (e: unknown) => console.error("Couldn't load the partner's key", e),
    );
    return () => {
      active = false;
    };
  }, [showsKeyCheck, partnerId, me.id]);

  // The other side of a link request, for the emoji check: the invitee on the inviter's question, the inviter while
  // this phone waits.
  const requestOtherId =
    linkRequests?.incoming?.otherId ?? (route?.name === "waiting" ? (linkRequests?.outgoing?.otherId ?? null) : null);
  useEffect(() => {
    if (!requestOtherId) return;
    let active = true;
    partnerKeyIdForCheck(me.id, requestOtherId).then(
      (id) => active && setRequestKeyId(id),
      (e: unknown) => console.error("Couldn't load the other side's key", e),
    );
    return () => {
      active = false;
      setRequestKeyId(null);
    };
  }, [requestOtherId, me.id]);

  async function handleConfirmLink() {
    const request = linkRequests?.incoming;
    if (!request) return;
    const status = await confirmLink(request.id);
    if (status === "linked") await handleLinked();
    else await refreshPartner();
  }

  async function handleDeclineLink() {
    const request = linkRequests?.incoming;
    if (!request) return;
    await declineLink(request.id);
    await refreshPartner();
  }

  function handlePending() {
    clearPendingInvite();
    setRoute({ name: "waiting" });
    void refreshPartner();
  }

  // Profile shows when the current recovery code was first viewed.
  const onProfile = route?.name === "settings";
  useEffect(() => {
    if (!onProfile) return;
    let active = true;
    loadRecoveryViewedAt(me.id).then(
      (at) => active && setRecoveryViewedAt(at),
      (e: unknown) => console.error("Couldn't load when the recovery code was viewed", e),
    );
    return () => {
      active = false;
    };
  }, [onProfile, me.id, keys]);

  const handleRecoveryCodeShown = useCallback(() => {
    markRecoveryViewed().then(
      (at) => setRecoveryViewedAt(at),
      (e: unknown) => console.error("Couldn't record the recovery code viewing", e),
    );
  }, []);

  function handleRecoveryCodeSeen() {
    markRecoveryHintDone(me.id);
    setHintDone(true);
    forgetRecoveryCode(me.id).then(
      (next) => next && onKeysChange(next),
      (e: unknown) => console.error("Couldn't forget the recovery code", e),
    );
  }

  async function handleNewRecoveryCode() {
    onKeysChange(await rotateAccountKeys(me.id, keys));
  }

  function dismissHint() {
    markRecoveryHintDone(me.id);
    setHintDone(true);
  }

  const recoveryHint =
    recoveryCode && !hintDone ? (
      <RecoveryHint
        onOpen={() => {
          dismissHint();
          setRoute({ name: "settings" });
        }}
        onDismiss={dismissHint}
      />
    ) : null;

  // Where the app rests: home, unless the user has neither a partner nor chosen to walk solo.
  function homeRoute(): Route {
    return partner || linkState.solo ? { name: "home" } : { name: "partner" };
  }

  function handleWalkSolo() {
    setLinkState(saveLinkState(me.id, { solo: true }));
    setRoute({ name: "home" });
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
      setRoute(next ? { name: "linked" } : { name: "home" });
    } catch (e) {
      console.error("Couldn't load the partner", e);
      setRoute({ name: "home" });
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
    setStartError(null);
    runRequest.current++;
    try {
      const { run: started } = await startRun(trail, { id: me.id, keys }, partner ? questMode : "alone");
      // This phone already drew the path for the draft, so it needn't ask the router again.
      if (trail.path) {
        saveWalkingPath(me.id, started.id, trail.path, trail.distanceMeters);
        const saved = { path: trail.path, distanceMeters: trail.distanceMeters, savedAt: Date.now() };
        setRoutedPaths((all) => ({ ...all, [started.id]: saved }));
      }
      setSimulatedPosition(null);
      applyRun(started, false);
      setDraft({ status: "idle" });
    } catch (e) {
      console.error("Couldn't start the route", e);
      setStartError(startErrorMessage(e, partner?.name ?? "your partner"));
    } finally {
      setStarting(false);
    }
  }

  // Home's quest point: back to the open quest, or on to a new one, for both of you or just this user. A finished run
  // this phone still holds for its album makes way, so the map shows a fresh draft; its album stays in Activity.
  function handleStartQuest(mode?: QuestMode) {
    if (mode) setQuestMode(mode);
    const current = runRef.current;
    if (current && !isRunActive(current)) {
      runRequest.current++;
      applyRun(null, false);
      setSimulatedPosition(null);
    }
    if (draft.status === "error") setDraft({ status: "idle" });
    setRoute({ name: "map" });
  }

  // Joins the partner's quest. Joining ends this user's own open quest, so it asks first when that one has progress.
  async function handleJoinInvite() {
    const invite = runInvite;
    if (!invite) return;
    const current = runRef.current;
    if (
      current &&
      isRunActive(current) &&
      !allStopsDone(current) &&
      !window.confirm(`Join ${partner?.name ?? "your partner"}’s quest? You’ll leave “${current.trail.name}”.`)
    ) {
      return;
    }
    inviteRequest.current++;
    const result = await acceptRun(invite.runId);
    setRunInvite(null);
    if (result === "gone") {
      setEndedNotice(true);
      return;
    }
    // The quest this phone followed ended by joining, not elsewhere, so it goes without the "trail has ended" notice.
    runRequest.current++;
    applyRun(null, false);
    setDraft({ status: "idle" });
    setSimulatedPosition(null);
    await refreshRun();
    setRoute({ name: "map" });
  }

  async function handleDeclineInvite() {
    const invite = runInvite;
    if (!invite) return;
    inviteRequest.current++;
    await declineRun(invite.runId);
    setRunInvite(null);
  }

  const inviteCard =
    runInvite && partner ? (
      <QuestInvite partnerName={partner.name} onJoin={handleJoinInvite} onNotNow={handleDeclineInvite} />
    ) : null;

  const nav = useMemo<NavHandlers>(
    () => ({
      explore: () => setRoute({ name: "home" }),
      activity: () => setRoute({ name: "activity" }),
      profile: () => setRoute({ name: "settings" }),
    }),
    [],
  );

  async function handleNewRoute() {
    if (!confirmAbandon() || !(await leaveRun())) return;
    void generateSurprise();
  }

  // Stops in-flight loads first, so none writes the run back to this phone after sign-out cleared it.
  function stopForSignOut() {
    requestId.current++;
    runRequest.current++;
    runRef.current = null;
    setSimulatedPosition(null);
  }

  function handleSignOut() {
    stopForSignOut();
    onSignOut();
  }

  async function handleLeaveClean() {
    const held = runRef.current;
    stopForSignOut();
    try {
      await signOutAndLeaveClean(me.id);
    } catch (e) {
      runRef.current = held;
      throw e;
    }
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
    const fresh = (await loadRun(current.id, loadRunKey).catch(() => null)) ?? {
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
      photo = await uploadPhoto(current.id, stopId, prepared, await loadRunKey(current.id));
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
    <NavFrame nav={nav} theme={theme}>
      {route.name === "home" && (
        <Home
          me={me}
          partner={partner}
          openQuest={run && isRunActive(run) ? run.trail.name : null}
          invite={inviteCard}
          onStartQuest={handleStartQuest}
          onLinkPartner={() => setRoute({ name: "partner" })}
        />
      )}

      {route.name === "activity" && (
        <Activity
          refreshKey={syncTick}
          onOpen={(past) => setRoute({ name: "album", runId: past.id, trailId: past.trailId })}
        />
      )}

      {route.name === "partner" && (
        <PartnerLink
          me={me}
          keyId={keys.keyId}
          onEnterCode={(code, keyId) => setRoute({ name: "accept", code, keyId })}
          onWalkSolo={handleWalkSolo}
          onInviteRefused={refreshPartner}
          onSignOut={handleSignOut}
        />
      )}

      {route.name === "accept" && (
        <LinkInvite
          key={route.code}
          code={route.code}
          keyId={route.keyId}
          myId={me.id}
          onPending={handlePending}
          onDone={handleInviteDone}
        />
      )}

      {route.name === "waiting" && (
        <LinkWaiting
          request={linkRequests === null ? undefined : linkRequests.outgoing}
          myKeyId={keys.keyId}
          inviterKeyId={requestKeyId}
          onCancel={async (request) => {
            await declineLink(request.id);
            setRoute(homeRoute());
            await refreshPartner();
          }}
          onDone={() => setRoute(homeRoute())}
        />
      )}

      {route.name === "linked" && partner && (
        <LinkedScreen
          me={me}
          partner={partner}
          myKeyId={keys.keyId}
          partnerKeyId={partnerKeyId}
          onContinue={() => setRoute({ name: "home" })}
        />
      )}

      {route.name === "settings" && (
        <Settings
          me={me}
          email={me.email}
          partner={partner}
          recoveryCode={recoveryCode}
          onRecoveryCodeSeen={handleRecoveryCodeSeen}
          onRecoveryCodeShown={handleRecoveryCodeShown}
          recoveryViewedAt={recoveryViewedAt}
          onNewRecoveryCode={handleNewRecoveryCode}
          myKeyId={keys.keyId}
          partnerKeyId={partner ? partnerKeyId : null}
          onUnlink={handleUnlink}
          onLinkPartner={() => setRoute({ name: "partner" })}
          onSignOut={handleSignOut}
          onSignOutOthers={signOutOtherDevices}
          onLeaveClean={handleLeaveClean}
          onExplore={() => setRoute({ name: "home" })}
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
          startLabel={partner ? (questMode === "alone" ? "Start just me" : "Start together") : "Start route"}
          notice={run ? null : inviteCard}
          starting={starting}
          startError={startError}
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
          onHome={() => setRoute({ name: "home" })}
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
            onContinue: () => setRoute(allStopsDone(run) ? { name: "complete" } : { name: "map" }),
            continueLabel: allStopsDone(run) ? "See your album" : "On to the next stop",
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
            notice={recoveryHint}
            onLeave={() => setRoute({ name: "map" })}
          />
        ) : (
          <CompleteScreen
            runId={run.id}
            meId={me.id}
            partnerName={runPartnerName}
            syncTick={syncTick}
            notice={recoveryHint}
            onLeave={() => setRoute({ name: "map" })}
          />
        ))}

      {route.name === "album" &&
        (route.trailId === SHERLOCK_ID ? (
          <SherlockCompleteScreen
            key={route.runId}
            runId={route.runId}
            meId={me.id}
            partnerName={partner?.name ?? null}
            syncTick={syncTick}
            past
            onLeave={() => setRoute({ name: "activity" })}
          />
        ) : (
          <CompleteScreen
            key={route.runId}
            runId={route.runId}
            meId={me.id}
            partnerName={partner?.name ?? null}
            syncTick={syncTick}
            past
            onLeave={() => setRoute({ name: "activity" })}
          />
        ))}

      {linkRequests?.incoming && !partner && (
        <LinkRequestDialog
          key={linkRequests.incoming.id}
          request={linkRequests.incoming}
          myKeyId={keys.keyId}
          inviteeKeyId={requestKeyId}
          onConfirm={handleConfirmLink}
          onDecline={handleDeclineLink}
        />
      )}

      {endedNotice && <TrailEndedNotice onClose={() => setEndedNotice(false)} />}
    </NavFrame>
  );
}

// The phone frame, with the bottom nav's destinations for every screen inside it.
function NavFrame({ nav, theme, children }: { nav: NavHandlers; theme?: string; children: ReactNode }) {
  return (
    <NavContext.Provider value={nav}>
      <PhoneFrame theme={theme}>{children}</PhoneFrame>
    </NavContext.Provider>
  );
}

// A pending invite from a /link/<code> URL comes first; then home, unless the user has yet to choose between linking
// and walking solo.
function firstRoute(partner: Profile | null, state: LinkState): Route {
  const pending = loadPendingInvite();
  if (pending) return { name: "accept", code: pending.code, keyId: pending.keyId };
  if (partner || state.solo || state.knownPartnerId) return { name: "home" };
  return { name: "partner" };
}

// After a finished trail, while the recovery code waits unseen: a quiet pointer to Profile, shown until dismissed.
function RecoveryHint({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <aside className="recovery-hint" aria-label="Recovery code">
      <p>Keep your photos safe on a new phone: get your recovery code in Profile.</p>
      <div className="recovery-hint-actions">
        <button type="button" className="inline-link" onClick={onOpen}>
          Open Profile
        </button>
        <button type="button" className="inline-link" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}

// The run this phone followed was abandoned on the other phone. One line, no reason.
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
