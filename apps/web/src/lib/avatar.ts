import { createContext, useContext } from "react";
import { parseAppearance } from "@wannadoo/core";
import type { Appearance } from "@wannadoo/core";
import type { Json } from "./database.types";
import { supabase } from "./supabase";

// The avatar's appearance (mvp-roadmap.md, stage 5). The server stores a JSON object under 2 KB, or null when the
// person has not made an avatar yet, and checks nothing else; every value read here goes through parseAppearance,
// which tolerates old and unknown fields, so the renderer only ever sees a valid appearance.

// A partner's card as the app shows it: the name it already loads, plus the appearance.
export type PartnerCard = { displayName: string | null; appearance: Appearance | null };

// Null stays null: it means "no avatar yet", which the app fills in rather than drawing the default.
export function appearanceFrom(value: unknown): Appearance | null {
  return value === null || value === undefined ? null : parseAppearance(value);
}

// The caller's own appearance, or null before they make one.
export async function loadMyAppearance(userId: string): Promise<Appearance | null> {
  const { data, error } = await supabase.from("profiles").select("appearance").eq("id", userId).single();
  if (error) throw error;
  return appearanceFrom(data.appearance);
}

// Saves the caller's appearance; null clears it. The partner's phone reads the new value on its next card load.
export async function saveMyAppearance(userId: string, appearance: Appearance | null): Promise<void> {
  const value: Json | null = appearance ? { ...appearance } : null;
  const { error } = await supabase.from("profiles").update({ appearance: value }).eq("id", userId);
  if (error) throw error;
}

// The partner's card from profile_cards. The appearance reads null unless the caller is linked to them right now, so
// an ex, a fellow member of an old run, or the other side of a link request sees the name but no avatar. Returns null
// when the caller may not see the profile at all.
export async function loadPartnerCard(partnerId: string): Promise<PartnerCard | null> {
  const { data, error } = await supabase
    .from("profile_cards")
    .select("display_name, appearance")
    .eq("id", partnerId)
    .maybeSingle();
  if (error) throw error;
  return data ? { displayName: data.display_name, appearance: appearanceFrom(data.appearance) } : null;
}

// What the app knows of a person's avatar: their appearance, null when they have none (initials stand in), or
// "loading" while it is on its way (a plain circle stands in).
export type AvatarState = Appearance | null | "loading";

// The avatars App.tsx knows, by user ID, so every ProfileAvatar draws one without each screen passing it down.
export const AvatarContext = createContext<Record<string, AvatarState>>({});

// The avatar state for a user; undefined when the app holds none for them, such as a seeded test profile.
export function useAvatarState(userId: string | undefined): AvatarState | undefined {
  const all = useContext(AvatarContext);
  return userId ? all[userId] : undefined;
}
