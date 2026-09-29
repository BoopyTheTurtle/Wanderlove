import { PROFILES } from "@wannadoo/core";
import type { Profile } from "@wannadoo/core";
import type { Database } from "./database.types";
import { supabase } from "./supabase";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

// The tester notice version the onboarding tick box accepts.
export const TERMS_VERSION = "tester-v1";

const COLORS = ["#2a9d8f", "#ff7a8a", "#e9a23b", "#5b8def", "#9b6bd6", "#3fae6b"];

export async function loadOwnProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export function isOnboarded(row: ProfileRow): boolean {
  return Boolean(row.display_name && row.terms_accepted_at);
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
