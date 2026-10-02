import { PROFILES } from "@wannadoo/core";
import type { Profile } from "@wannadoo/core";
import type { Database } from "./database.types";
import { supabase } from "./supabase";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

// The tester notice version the onboarding tick box accepts.
export const TERMS_VERSION = "tester-v3";

const COLORS = ["#8b2e45", "#ff7a8a", "#e9a23b", "#5b8def", "#9b6bd6", "#3fae6b"];

export async function loadOwnProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

// Mobility: true means the person prefers tasks without movement, so quests leave out tasks tagged `move`. Only the
// owner reads and writes it; the partner never sees it.
export async function loadMobility(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("mobility").eq("id", userId).single();
  if (error) throw error;
  return data.mobility;
}

export async function saveMobility(userId: string, mobility: boolean): Promise<void> {
  const { error } = await supabase.from("profiles").update({ mobility }).eq("id", userId);
  if (error) throw error;
}

export function isOnboarded(row: ProfileRow): boolean {
  return Boolean(row.display_name && row.terms_accepted_at);
}

// An onboarded tester who accepted an older notice sees the current one once before going on.
export function needsTermsUpdate(row: ProfileRow): boolean {
  return isOnboarded(row) && row.terms_version !== TERMS_VERSION;
}

export async function acceptCurrentTerms(userId: string): Promise<ProfileRow> {
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) throw error;
  return loadOwnProfile(userId);
}

export async function completeOnboarding(userId: string, displayName: string): Promise<ProfileRow> {
  const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", userId);
  if (error) throw error;
  const { error: termsError } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (termsError) throw termsError;
  return loadOwnProfile(userId);
}

// Maps a profiles row to the app's Profile. Test users keep their illustrated avatars.
export function toProfile(row: ProfileRow, email: string): Profile {
  const name = row.display_name ?? email.split("@")[0];
  const test = PROFILES.find((p) => p.email.toLowerCase() === email.toLowerCase());
  return {
    id: row.id,
    name,
    username: row.username ?? test?.username ?? "",
    email,
    initials: initials(name),
    color: test?.color ?? colorFor(row.id),
    avatar: test?.avatar,
  };
}

// A partner as the app shows them: name and initials on a colour. Partners carry no email, so no test avatar.
export function partnerProfile(id: string, displayName: string | null): Profile {
  const name = displayName ?? "Your partner";
  return { id, name, username: "", email: "", initials: initials(name), color: colorFor(id) };
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? "?");
  return letters.toUpperCase();
}

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}
