import type { Profile } from "@wannadoo/core";
import { partnerProfile } from "./profile";
import { loadOpenInvite, saveOpenInvite } from "./session";
import { supabase } from "./supabase";

export type PeekStatus = "valid" | "invalid" | "expired" | "self" | "already_linked" | "rate_limited";
export type RedeemStatus = "pending" | Exclude<PeekStatus, "valid">;
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

// The invite link. keyId, the inviter's key fingerprint, rides in the fragment, which browsers never send to the
// server; the invitee's phone checks the inviter's published key against it (lib/keys.ts, verifyPartnerKey).
export function inviteUrl(code: string, keyId: string): string {
  return `${window.location.origin}/link/${code}#k=${keyId}`;
}

// A new single-use code, valid 24 hours. It replaces the caller's earlier open invite.
export async function createInvite(): Promise<string> {
  const { data, error } = await supabase.rpc("create_invite");
  if (error) throw error;
  return data;
}

const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000;
// An invite with less time left than this gets replaced rather than shown.
const MIN_REMAINING_MS = 60 * 60 * 1000;

// The invite to show: this device's open one while it has at least an hour left, otherwise a new one.
export async function openInvite(userId: string, fresh = false): Promise<{ code: string; expiresAt: number }> {
  const saved = fresh ? null : loadOpenInvite(userId);
  if (saved && saved.expiresAt - Date.now() > MIN_REMAINING_MS) return saved;
  // Counted from before the request, so the device never thinks a code lives longer than the server does.
  const expiresAt = Date.now() + INVITE_LIFETIME_MS;
  const code = await createInvite();
  saveOpenInvite({ userId, code, expiresAt });
  return { code, expiresAt };
}

// Who sent the invite, without using it up.
export async function peekInvite(code: string): Promise<InvitePeek> {
  const { data, error } = await supabase.rpc("peek_invite", { p_code: code });
  if (error) throw error;
  const result = (data ?? {}) as { status?: PeekStatus; inviter_name?: string | null };
  return { status: result.status ?? "invalid", inviterName: result.inviter_name ?? null };
}

// Uses up the invite and asks the inviter to confirm (docs/private-trails.md, section 6). Nobody is linked until the
// inviter's phone confirms; the request lapses after 24 hours.
export async function redeemInvitePending(code: string): Promise<RedeemStatus> {
  const { data, error } = await supabase.rpc("redeem_invite_pending", { p_code: code });
  if (error) throw error;
  return data as RedeemStatus;
}

// An open link request, seen from either side: `other` is the inviter for the invitee and the invitee for the inviter.
export type LinkRequest = { id: string; otherId: string; otherName: string; expiresAt: string };
export type LinkRequests = { incoming: LinkRequest | null; outgoing: LinkRequest | null };

export const NO_LINK_REQUESTS: LinkRequests = { incoming: null, outgoing: null };

// The caller's open requests: one someone made with the caller's invite (incoming), and the one the caller made with
// someone's invite (outgoing). While a request is open each side reads the other's profile card.
export async function loadLinkRequests(myId: string): Promise<LinkRequests> {
  const { data, error } = await supabase
    .from("link_requests")
    .select("id, inviter_id, invitee_id, expires_at")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  const incoming = data.find((r) => r.inviter_id === myId);
  const outgoing = data.find((r) => r.invitee_id === myId);
  async function side(row: typeof incoming, otherId: string | undefined): Promise<LinkRequest | null> {
    if (!row || !otherId) return null;
    const { data: card, error: cardError } = await supabase
      .from("profile_cards")
      .select("display_name")
      .eq("id", otherId)
      .maybeSingle();
    if (cardError) throw cardError;
    return { id: row.id, otherId, otherName: card?.display_name ?? "Someone", expiresAt: row.expires_at };
  }
  const [inc, out] = await Promise.all([side(incoming, incoming?.invitee_id), side(outgoing, outgoing?.inviter_id)]);
  return { incoming: inc, outgoing: out };
}

export type ConfirmStatus = "linked" | "invalid" | "expired" | "already_linked";

// The inviter's yes: makes the couple.
export async function confirmLink(requestId: string): Promise<ConfirmStatus> {
  const { data, error } = await supabase.rpc("confirm_link", { p_request: requestId });
  if (error) throw error;
  return data as ConfirmStatus;
}

// Either side's no, or the invitee withdrawing. Safe to call twice.
export async function declineLink(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("decline_link", { p_request: requestId });
  if (error) throw error;
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
