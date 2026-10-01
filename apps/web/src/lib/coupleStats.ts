import { supabase } from "./supabase";

// The couple's lifetime totals and name (docs/mvp-roadmap.md, stage 7, without points). The totals count the couple's
// progress, never which partner did what (abuse-threat-model.md, M2). The name needs both partners' yes, and either
// clears it alone (G4).

export type CoupleTotals = { questsDone: number; photosTaken: number; challengesDone: number };

export const NO_TOTALS: CoupleTotals = { questsDone: 0, photosTaken: 0, challengesDone: 0 };

type TotalsRow = { quests_done: number | null; photos_taken: number | null; challenges_done: number | null };

export function totalsFromRow(row: TotalsRow | null | undefined): CoupleTotals {
  if (!row) return NO_TOTALS;
  return {
    questsDone: row.quests_done ?? 0,
    photosTaken: row.photos_taken ?? 0,
    challengesDone: row.challenges_done ?? 0,
  };
}

// The active couple's totals. RLS shows only the caller's active couple; no row yet means nothing counted.
export async function loadCoupleTotals(): Promise<CoupleTotals> {
  const { data, error } = await supabase
    .from("couple_stats")
    .select("quests_done, photos_taken, challenges_done")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return totalsFromRow(data);
}

// The couple's name and any open proposal. proposedByMe says which side waits: true means the partner has yet to agree.
export type CoupleName = { name: string | null; proposal: string | null; proposedByMe: boolean };

type NameRow = { name: string | null; proposal: string | null; proposed_by_me: boolean | null };

// The generated types call every column non-null; the server returns nulls, so each is checked.
export function coupleNameFromRows(rows: NameRow[] | null | undefined): CoupleName | null {
  const row = rows?.[0];
  if (!row) return null;
  const proposal = row.proposal || null;
  return { name: row.name || null, proposal, proposedByMe: proposal !== null && row.proposed_by_me === true };
}

// null when the caller is not linked.
export async function loadCoupleName(): Promise<CoupleName | null> {
  const { data, error } = await supabase.rpc("couple_name");
  if (error) throw error;
  return coupleNameFromRows(data as NameRow[] | null);
}

export type NameErrorCode = "not_linked" | "name_invalid" | "name_blocked" | "no_proposal";

const NAME_ERRORS: readonly NameErrorCode[] = ["not_linked", "name_invalid", "name_blocked", "no_proposal"];

// A refusal the server explains (raise ... errcode P0001), so the screen can say why.
export class CoupleNameError extends Error {
  constructor(readonly code: NameErrorCode) {
    super(code);
    this.name = "CoupleNameError";
  }
}

// Turns a known refusal into a CoupleNameError; anything else (network, auth) passes through unchanged.
export function toNameError(error: unknown): unknown {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "P0001" && NAME_ERRORS.includes(e.message as NameErrorCode)) {
    return new CoupleNameError(e.message as NameErrorCode);
  }
  return error;
}

// What the screen says for a failed name action.
export function nameErrorMessage(error: unknown): string {
  if (!(error instanceof CoupleNameError)) return "Couldn’t save that. Check your connection and try again.";
  switch (error.code) {
    case "name_invalid":
      return "Use 2 to 30 letters, numbers, spaces, apostrophes or hyphens.";
    case "name_blocked":
      return "That name isn’t allowed. Try another.";
    case "no_proposal":
      return "That suggestion changed. Here’s the latest.";
    case "not_linked":
      return "You’re no longer linked, so there’s no couple name to set.";
  }
}

// Suggests a name. 'named' when the partner had suggested exactly this one, or the couple already has it.
export async function suggestCoupleName(name: string): Promise<"proposed" | "named"> {
  const { data, error } = await supabase.rpc("set_couple_name", { p_name: name });
  if (error) throw toNameError(error);
  return data === "named" ? "named" : "proposed";
}

// Agrees to the partner's suggestion. Pass the suggestion the user saw, so one changed meanwhile isn't accepted unseen.
export async function agreeCoupleName(proposal: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_couple_name", { p_name: proposal });
  if (error) throw toNameError(error);
}

// Removes the name and any suggestion. Either partner may, alone.
export async function clearCoupleName(): Promise<void> {
  const { error } = await supabase.rpc("clear_couple_name");
  if (error) throw toNameError(error);
}

// Drops the open suggestion, from either side, and keeps the current name. clear_couple_name would remove the name
// too, so a named couple sends its name back instead, which the server takes as 'named' and closes the suggestion.
export async function dropSuggestion(current: CoupleName): Promise<void> {
  if (current.name) await suggestCoupleName(current.name);
  else await clearCoupleName();
}

const FOREGROUND_GAP_MS = 2000;

// Calls fn whenever the app returns to the foreground. Returning fires both focus and visibilitychange, so calls
// closer together than two seconds count once. Returns the unsubscribe.
export function onForeground(fn: () => void): () => void {
  let last = 0;
  function onVisible() {
    if (document.visibilityState !== "visible" || Date.now() - last < FOREGROUND_GAP_MS) return;
    last = Date.now();
    fn();
  }
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
