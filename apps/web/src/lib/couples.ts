import type { Profile } from "@wannadoo/core";
import { partnerProfile } from "./profile";
import { supabase } from "./supabase";

export type PeekStatus = "valid" | "invalid" | "expired" | "self" | "already_linked" | "rate_limited";
export type RedeemStatus = "linked" | Exclude<PeekStatus, "valid">;
export type InvitePeek = { status: PeekStatus; inviterName: string | null };

const CODE_LENGTH = 10;
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;

// Tidies a typed or pasted code: case, spaces and dashes don't matter, and the letters Crockford base32
// leaves out read as the digits they resemble. A pasted invite link works too.
export function normalizeCode(input: string): string {
  const fromLink = input.match(/\/link\/([^/?#\s]+)/);
  return (fromLink ? fromLink[1] : input)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function isCompleteCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

// Groups a code for reading aloud or typing: ABCDE-FGHJK.
export function formatCode(code: string): string {
  return code.length === CODE_LENGTH ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/link/${code}`;
}

// A new single-use code, valid 24 hours. It replaces the caller's earlier open invite.
export async function createInvite(): Promise<string> {
  const { data, error } = await supabase.rpc("create_invite");
  if (error) throw error;
  return data;
}

// Who sent the invite, without using it up.
export async function peekInvite(code: string): Promise<InvitePeek> {
  const { data, error } = await supabase.rpc("peek_invite", { p_code: code });
  if (error) throw error;
  const result = (data ?? {}) as { status?: PeekStatus; inviter_name?: string | null };
  return { status: result.status ?? "invalid", inviterName: result.inviter_name ?? null };
}

export async function redeemInvite(code: string): Promise<RedeemStatus> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });
  if (error) throw error;
  return data as RedeemStatus;
}

// Ends the caller's couple at once; the partner gets no message.
export async function unlink(): Promise<void> {
  const { error } = await supabase.rpc("unlink");
  if (error) throw error;
}

// The caller's active partner, or null when walking solo. RLS limits couples to the caller's own.
export async function loadPartner(myId: string): Promise<Profile | null> {
  const { data: couples, error } = await supabase
    .from("couples")
    .select("id, couple_members(user_id)")
    .is("ended_at", null)
    .limit(1);
  if (error) throw error;
  const partnerId = couples[0]?.couple_members.find((m) => m.user_id !== myId)?.user_id;
  if (!partnerId) return null;

  const { data: card, error: cardError } = await supabase
    .from("profile_cards")
    .select("display_name")
    .eq("id", partnerId)
    .maybeSingle();
  if (cardError) throw cardError;
  return partnerProfile(partnerId, card?.display_name ?? null);
}
