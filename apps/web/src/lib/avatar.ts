import type { Json } from "./database.types";
import { supabase } from "./supabase";

// The avatar's appearance (mvp-roadmap.md, stage 5). The server stores a JSON object under 2 KB, or null when the
// person has not made an avatar yet, and checks nothing else; these functions hand back the raw value.
// TODO(stage 5 wiring): parse every value read here with parseAppearance from @wannadoo/core, which tolerates old and
// unknown fields, and pass only its output to the avatar renderer.

export type AppearanceObject = { [key: string]: Json | undefined };

// A partner's card as the app shows it: the name it already loads, plus the appearance.
export type PartnerCard = { displayName: string | null; appearance: unknown };

// The caller's own appearance, or null before they make one.
export async function loadMyAppearance(userId: string): Promise<unknown> {
  const { data, error } = await supabase.from("profiles").select("appearance").eq("id", userId).single();
  if (error) throw error;
  return data.appearance;
}

// Saves the caller's appearance; null clears it. The partner's phone reads the new value on its next card load.
export async function saveMyAppearance(userId: string, appearance: AppearanceObject | null): Promise<void> {
  const { error } = await supabase.from("profiles").update({ appearance }).eq("id", userId);
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
  return data ? { displayName: data.display_name, appearance: data.appearance } : null;
}
