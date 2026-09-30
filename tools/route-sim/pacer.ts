// A fetch wrapper that keeps the simulation inside the public services' limits (route-safety.md §3):
// - the FOSSGIS router gets at most one request every ROUTER_GAP_MS, counting the script's own nearest-way lookups
//   as well as the generator's route calls (the generator's own queue only sees its route calls);
// - Overpass queries are spaced by OVERPASS_GAP_MS, and every other start swaps the two Overpass endpoints the
//   generator tries, so the load spreads across both;
// - every request carries the script's User-Agent, which Overpass requires from scripts.
import { USER_AGENT, sleep } from "./lib.ts";

export const ROUTER_HOST = "routing.openstreetmap.de";
export const ROUTER_GAP_MS = 1100;
export const OVERPASS_GAP_MS = 3000;
// The two endpoints routeGen.ts tries, in its order. If that list changes, the swap below simply stops matching.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CallKind = "route" | "nearest" | "overpass" | "other";
export type CallLog = { kind: CallKind; url: string; at: number; userAgent: string | null };

// Runs callers one after another, starting each at least `gapMs` after the previous one started.
function spacer(gapMs: number) {
  let last = -Infinity;
  let chain: Promise<void> = Promise.resolve();
  return (): Promise<void> => {
    const turn = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = turn;
    return turn;
  };
}

export function kindOf(url: string): CallKind {
  if (url.includes(ROUTER_HOST) && url.includes("/nearest/")) return "nearest";
  if (url.includes(ROUTER_HOST)) return "route";
  if (url.includes("/api/interpreter")) return "overpass";
  return "other";
}

export function createPacer(base: FetchLike, startGapMs: number) {
  const routerTurn = spacer(ROUTER_GAP_MS);
  const overpassTurn = spacer(OVERPASS_GAP_MS);
  const startTurn = spacer(startGapMs);
  const log: CallLog[] = [];
  let swapOverpass = false;

  const pacedFetch: FetchLike = async (input, init) => {
    let url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const kind = kindOf(url);
    if (kind === "overpass" && swapOverpass) {
      const i = OVERPASS_ENDPOINTS.indexOf(url);
      if (i >= 0) url = OVERPASS_ENDPOINTS[1 - i];
    }
    if (kind === "route" || kind === "nearest") await routerTurn();
    if (kind === "overpass") await overpassTurn();
    const headers = new Headers(init?.headers);
    if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);
    log.push({ kind, url, at: Date.now(), userAgent: headers.get("User-Agent") });
    return base(url, { ...init, headers });
  };

  return {
    fetch: pacedFetch,
    log,
    // Waits for the next start's turn (one start every `startGapMs`) and picks its Overpass endpoint order.
    async beginStart(swap: boolean): Promise<void> {
      await startTurn();
      swapOverpass = swap;
    },
    count(kind: CallKind, since = 0): number {
      return log.slice(since).filter((c) => c.kind === kind).length;
    },
  };
}

export type Pacer = ReturnType<typeof createPacer>;
