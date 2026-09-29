-- Lets a signed-in invitee see who invited them before linking, without redeeming the invite.
-- The invitee can read neither the invite nor the inviter's profile, so the accept screen needs this RPC.
--
-- Returns {"status": ..., "inviter_name": ...}. Statuses mirror redeem_invite, with 'valid' in place of 'linked'.
-- The name comes back only for 'valid', so dead or foreign codes leak nothing. Failed look-ups share
-- redeem_invite's attempt limit, so peeking cannot get round it (accounts-roadmap.md, register C12).
create function public.peek_invite(p_code text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  inviter_name text;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if (select count(*) from public.invite_attempts
      where user_id = me and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited', 'inviter_name', null);
  end if;

  select * into inv from public.invites
  where code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');

  if inv.id is null or inv.redeemed_at is not null then
    insert into public.invite_attempts (user_id) values (me);
    return jsonb_build_object('status', 'invalid', 'inviter_name', null);
  end if;
  if inv.expires_at < now() then
    insert into public.invite_attempts (user_id) values (me);
    return jsonb_build_object('status', 'expired', 'inviter_name', null);
  end if;
  if inv.inviter_id = me then
    return jsonb_build_object('status', 'self', 'inviter_name', null);
  end if;
  if private.active_couple_id(me) is not null or private.active_couple_id(inv.inviter_id) is not null then
    return jsonb_build_object('status', 'already_linked', 'inviter_name', null);
  end if;

  select p.display_name into inviter_name from public.profiles p where p.id = inv.inviter_id;
  return jsonb_build_object('status', 'valid', 'inviter_name', inviter_name);
end;
$$;

revoke all on function public.peek_invite(text) from public, anon;
grant execute on function public.peek_invite(text) to authenticated;
