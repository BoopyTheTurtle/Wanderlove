-- Both sides confirm a link (abuse-threat-model.md, section 6, decision 6; misuse N1).
--
-- redeem_invite links at once, so whoever holds the invitee's phone can link it to anyone whose code they have. The
-- new path adds a step: redeem_invite_pending uses up the invite and leaves a link request, and only the inviter's
-- confirm_link makes the couple. Either side may decline; an unconfirmed request lapses after 24 hours. While a
-- request is open, each side sees the other's profile card, so the inviter's phone can ask "Emma used your invite.
-- Link?" and check her key. redeem_invite stays for today's app; wave 2 switches to the new path.

create table public.link_requests (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (inviter_id <> invitee_id)
);
create index link_requests_inviter_id_idx on public.link_requests (inviter_id);
-- One open request per invitee: a new redemption replaces the old one.
create unique index link_requests_invitee_id_idx on public.link_requests (invitee_id);

alter table public.link_requests enable row level security;
revoke all on public.link_requests from anon, authenticated;

-- Both sides read the request; the RPCs below write.
grant select on public.link_requests to authenticated;
create policy "link_requests: read own" on public.link_requests
  for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- Unchanged from the initial schema, except for the last clause: the other side of an open link request.
create or replace function private.can_see_profile(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user = auth.uid()
    or p_user in (
      select cm.user_id from public.couple_members cm
      where cm.couple_id = private.active_couple_id(auth.uid())
    )
    or exists (
      select 1
      from public.trail_run_members mine
      join public.trail_run_members theirs on theirs.run_id = mine.run_id
      where mine.user_id = auth.uid() and theirs.user_id = p_user
    )
    or exists (
      select 1 from public.link_requests l
      where l.expires_at > now()
        and ((l.inviter_id = auth.uid() and l.invitee_id = p_user)
          or (l.invitee_id = auth.uid() and l.inviter_id = p_user))
    )
$$;

-- Uses up an invite and asks the inviter to confirm. Statuses as redeem_invite's, with 'pending' in place of
-- 'linked': 'pending', 'invalid', 'expired', 'self', 'already_linked', or 'rate_limited'. Failed attempts share the
-- same limit.
create function public.redeem_invite_pending(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if (select count(*) from public.invite_attempts
      where user_id = me and attempted_at > now() - interval '1 hour') >= 10 then
    return 'rate_limited';
  end if;

  select * into inv from public.invites
  where code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
  for update;

  if inv.id is null or inv.redeemed_at is not null then
    insert into public.invite_attempts (user_id) values (me);
    return 'invalid';
  end if;
  if inv.expires_at < now() then
    insert into public.invite_attempts (user_id) values (me);
    return 'expired';
  end if;
  if inv.inviter_id = me then
    return 'self';
  end if;
  if private.active_couple_id(me) is not null or private.active_couple_id(inv.inviter_id) is not null then
    return 'already_linked';
  end if;

  update public.invites set redeemed_at = now(), redeemed_by = me where id = inv.id;
  delete from public.link_requests where invitee_id = me;
  insert into public.link_requests (inviter_id, invitee_id) values (inv.inviter_id, me);
  return 'pending';
end;
$$;

-- The inviter confirms a request. Returns 'linked', 'invalid' (no such request for this inviter, or declined),
-- 'expired', or 'already_linked'. A confirmed or refused request is gone afterwards.
create function public.confirm_link(p_request uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  req public.link_requests;
  new_couple uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into req from public.link_requests where id = p_request and inviter_id = me for update;
  if req.id is null then
    return 'invalid';
  end if;
  if req.expires_at <= now() then
    delete from public.link_requests where id = req.id;
    return 'expired';
  end if;

  -- Serialise linking for both people, in a fixed order, as redeem_invite does.
  perform pg_advisory_xact_lock(hashtext(least(me, req.invitee_id)::text));
  perform pg_advisory_xact_lock(hashtext(greatest(me, req.invitee_id)::text));

  if private.active_couple_id(me) is not null or private.active_couple_id(req.invitee_id) is not null then
    delete from public.link_requests where id = req.id;
    return 'already_linked';
  end if;

  insert into public.couples default values returning id into new_couple;
  insert into public.couple_members (couple_id, user_id) values (new_couple, me), (new_couple, req.invitee_id);
  -- Neither person may now link elsewhere, so every open request involving either goes.
  delete from public.link_requests
  where inviter_id in (me, req.invitee_id) or invitee_id in (me, req.invitee_id);
  return 'linked';
end;
$$;

-- Either side turns a request down; the invitee can withdraw it the same way. Safe to call twice.
create function public.decline_link(p_request uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.link_requests
  where id = p_request and (inviter_id = auth.uid() or invitee_id = auth.uid());
end;
$$;

revoke all on function public.redeem_invite_pending(text) from public, anon;
revoke all on function public.confirm_link(uuid) from public, anon;
revoke all on function public.decline_link(uuid) from public, anon;
grant execute on function public.redeem_invite_pending(text) to authenticated;
grant execute on function public.confirm_link(uuid) to authenticated;
grant execute on function public.decline_link(uuid) to authenticated;
