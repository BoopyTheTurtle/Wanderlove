-- Consent-first photo sharing (mvp-roadmap.md, stage 7 and its share-consent decision; gamification.md, section 4.8).
--
-- Either partner proposes sharing ONE photo of a finished couple quest that both of them walked. The partner approves
-- or declines on their own phone ("not this time", no reason asked), unless they have granted standing consent, which
-- approves the partner's proposals at once; set_share_consent(false) withdraws it in one call and drops any approved,
-- unshared proposal it covered, so the proposer must ask again. Once approved, the proposer's phone decrypts the photo, hands it to the
-- OS share sheet, and calls confirm_share; only then does the couple earn 20 points.
--
-- The server never sees the photo: photos stay end-to-end encrypted, and a share row holds only the consent state.
-- Nothing tells the proposer how long a proposal has waited, and nothing reminds the partner: the partner gets one
-- share_requested feed item, the proposer one share_answered item.
--
-- Rules:
--   * One share per quest: a quest has at most one proposal waiting, approved, or shared. A declined photo is never
--     proposed again, and a quest takes at most three proposals in all, so a refusal cannot be worn down.
--   * One waiting proposal per proposer at a time, and one share_requested item per proposal (abuse-threat-model.md,
--     X2).
--   * Points: 20 into the run's quest_points (share_points, part of total, so the weekly board counts it with the
--     quest's other points) and into couple_stats.points, at most once per quest and three times per Riga week per
--     couple, counted by the week of the confirmation.
--   * Unlinking deletes the couple's waiting and approved proposals; shared and declined ones stay as the record behind
--     the weekly cap. share_points moves with the relink archive like the rest of quest_points (20261002180000).
--
-- Access rules:
--   * private.photo_shares, private.share_consent: no grants at all. Members of the active couple reach shares of runs
--     they walked only through the RPCs below; each person reads and sets only their own consent. An ex and strangers
--     reach nothing.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table private.photo_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  -- Set null when the photo goes, so the row still counts toward the weekly cap.
  photo_id uuid references public.photos (id) on delete set null,
  proposed_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'shared')),
  auto boolean not null default false,
  points int not null default 0 check (points in (0, 20)),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  shared_at timestamptz
);
create unique index photo_shares_one_per_run_idx on private.photo_shares (run_id)
  where status in ('pending', 'approved', 'shared');
create unique index photo_shares_one_waiting_idx on private.photo_shares (proposed_by) where status = 'pending';
create index photo_shares_couple_idx on private.photo_shares (couple_id, shared_at);
create index photo_shares_photo_idx on private.photo_shares (photo_id);

-- One row per person who has granted standing consent.
create table private.share_consent (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_at timestamptz not null default now()
);

alter table private.photo_shares enable row level security;
alter table private.share_consent enable row level security;
revoke all on private.photo_shares from public, anon, authenticated;
revoke all on private.share_consent from public, anon, authenticated;

-- Share points join the quest's total.
alter table public.quest_points add column share_points int not null default 0 check (share_points in (0, 20));
alter table public.quest_points alter column total
  set expression as (stop_points + photo_points + finish_points + week_bonus + share_points);

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------

-- Whether the caller has granted standing consent.
create function public.share_consent()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from private.share_consent where user_id = auth.uid())
$$;

-- Grants (true) or withdraws (false) the caller's standing consent. Withdrawing drops the partner's approved, unshared
-- proposals that consent approved; the partner may propose again and wait for an answer.
create function public.set_share_consent(p_on boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce(p_on, false) then
    insert into private.share_consent (user_id) values (me) on conflict do nothing;
    return;
  end if;
  delete from private.share_consent where user_id = me;
  delete from private.photo_shares s
  where s.status = 'approved' and s.auto and s.proposed_by <> me
    and s.couple_id = private.active_couple_id(me);
end;
$$;

-- ---------------------------------------------------------------------------
-- Proposing and answering
-- ---------------------------------------------------------------------------

-- Proposes sharing one photo. Returns the share and its status: 'pending', or 'approved' when the partner's standing
-- consent approved it. Raises photo_not_found (no such photo, or not one the caller can see), not_couple_quest (the
-- run is not a couple quest of the caller's active couple that both partners walked), run_not_finished, share_exists
-- (the quest already has a proposal waiting, approved, or shared), share_pending (the caller already has a proposal
-- waiting elsewhere), photo_declined, or too_many_proposals.
create function public.propose_share(p_photo_id uuid)
returns table (share_id uuid, status text)
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  partner uuid := private.partner_of(auth.uid());
  ph public.photos;
  r public.trail_runs;
  consent boolean;
  s private.photo_shares;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into ph from public.photos where id = p_photo_id;
  if ph.id is null or not private.is_member_of_run(ph.run_id, me) then
    raise exception 'photo_not_found' using errcode = 'P0001', detail = 'no such photo on a run the caller walked';
  end if;
  select * into r from public.trail_runs where id = ph.run_id for update;
  if couple is null or r.couple_id is distinct from couple or not private.is_member_of_run(r.id, partner) then
    raise exception 'not_couple_quest' using errcode = 'P0001',
      detail = 'only a quest both partners of the active couple walked can be shared';
  end if;
  if r.completed_at is null then
    raise exception 'run_not_finished' using errcode = 'P0001', detail = 'only a finished quest can be shared';
  end if;
  if exists (select 1 from private.photo_shares x where x.run_id = r.id and x.status in ('pending', 'approved', 'shared'))
  then
    raise exception 'share_exists' using errcode = 'P0001', detail = 'one photo per quest';
  end if;
  if exists (select 1 from private.photo_shares x where x.proposed_by = me and x.status = 'pending') then
    raise exception 'share_pending' using errcode = 'P0001', detail = 'one waiting proposal at a time';
  end if;
  if exists (select 1 from private.photo_shares x where x.photo_id = p_photo_id and x.status = 'declined') then
    raise exception 'photo_declined' using errcode = 'P0001', detail = 'the partner said not this time';
  end if;
  if (select count(*) from private.photo_shares x where x.run_id = r.id) >= 3 then
    raise exception 'too_many_proposals' using errcode = 'P0001', detail = 'a quest takes at most three proposals';
  end if;

  consent := exists (select 1 from private.share_consent c where c.user_id = partner);
  insert into private.photo_shares (run_id, couple_id, photo_id, proposed_by, status, auto, answered_at)
  values (r.id, couple, p_photo_id, me, case when consent then 'approved' else 'pending' end, consent,
    case when consent then now() end)
  returning * into s;

  perform private.feed_push(partner, 'share_requested',
    case when consent then jsonb_build_object('share_id', s.id, 'answer', 'approved')
         else jsonb_build_object('share_id', s.id) end);
  return query select s.id, s.status;
end;
$$;

-- Answers a proposal made to the caller: approve or decline ("not this time"). Declining also takes back an approval
-- the photo has not yet been shared under. Returns the new status. Raises share_gone when the share is not the
-- caller's to answer, or is already shared or declined, or the couple has ended.
create function public.answer_share(p_share_id uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s private.photo_shares;
  answer text := case when coalesce(p_approve, false) then 'approved' else 'declined' end;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into s from private.photo_shares x where x.id = p_share_id for update;
  if s.id is null or s.proposed_by = me or s.couple_id is distinct from private.active_couple_id(me)
     or s.status not in ('pending', 'approved') then
    raise exception 'share_gone' using errcode = 'P0001', detail = 'there is no open proposal to answer';
  end if;
  if s.status = answer then
    return answer;
  end if;
  update private.photo_shares set status = answer, auto = false, answered_at = now() where id = s.id;
  perform private.feed_push(s.proposed_by, 'share_answered', jsonb_build_object('share_id', s.id, 'answer', answer));
  return answer;
end;
$$;

-- Withdraws the caller's own proposal before it is shared, with the partner's request item if still unread. Safe to
-- call twice.
create function public.cancel_share(p_share_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  s private.photo_shares;
begin
  delete from private.photo_shares x
  where x.id = p_share_id and x.proposed_by = auth.uid() and x.status in ('pending', 'approved')
  returning * into s;
  if s.id is not null then
    delete from private.feed_items f
    where f.kind = 'share_requested' and f.read_at is null and f.payload ->> 'share_id' = s.id::text;
  end if;
end;
$$;

-- Records that the proposer's share sheet completed, and awards the points. Returns the points this call awarded: 20,
-- or 0 when the quest already earned its share points, the couple has had three this week, or the share was already
-- confirmed. Raises share_gone when the share is not the caller's or the couple has ended, and not_approved while the
-- partner has not approved it.
create function public.confirm_share(p_share_id uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s private.photo_shares;
  this_week date := private.riga_week(now());
  q public.quest_points;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into s from private.photo_shares x where x.id = p_share_id and x.proposed_by = me;
  if s.id is null or s.couple_id is distinct from private.active_couple_id(me) then
    raise exception 'share_gone' using errcode = 'P0001', detail = 'there is no share of the caller''s to confirm';
  end if;

  -- Serialise with the other awards, so two confirmations at once cannot both pass the weekly cap.
  perform pg_advisory_xact_lock(hashtext('quest_points:' || s.couple_id::text));
  select * into s from private.photo_shares x where x.id = p_share_id for update;
  if s.status = 'shared' then
    return 0;
  end if;
  if s.status <> 'approved' then
    raise exception 'not_approved' using errcode = 'P0001', detail = 'the partner has not approved this share';
  end if;

  update private.photo_shares set status = 'shared', shared_at = now() where id = s.id;

  select * into q from public.quest_points where run_id = s.run_id for update;
  if q.run_id is null or q.couple_id <> s.couple_id or q.share_points > 0
     or (select count(*) from private.photo_shares x
         where x.couple_id = s.couple_id and x.points > 0 and private.riga_week(x.shared_at) = this_week) >= 3 then
    return 0;
  end if;

  update private.photo_shares set points = 20 where id = s.id;
  update public.quest_points set share_points = 20, updated_at = now() where run_id = s.run_id;
  insert into public.couple_stats as cs (couple_id, points)
  values (s.couple_id, 20)
  on conflict (couple_id) do update set points = cs.points + excluded.points, updated_at = now();
  return 20;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- Proposals waiting for the caller's answer, oldest first.
create function public.pending_share_requests()
returns table (share_id uuid, run_id uuid, photo_id uuid)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.run_id, s.photo_id
  from private.photo_shares s
  where s.status = 'pending' and s.proposed_by <> auth.uid()
    and s.couple_id = private.active_couple_id(auth.uid())
    and private.is_member_of_run(s.run_id, auth.uid())
  order by s.created_at, s.id
$$;

-- A quest's proposal as either partner sees it, while the couple lasts: the one waiting, approved, or shared, else the
-- latest declined. No row when the quest has none, or the caller did not walk it. Carries no time, so the proposer
-- sees no timer.
create function public.run_share(p_run_id uuid)
returns table (share_id uuid, photo_id uuid, status text, proposed_by_me boolean, auto boolean, points int)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.photo_id, s.status, s.proposed_by = auth.uid(), s.auto, s.points
  from private.photo_shares s
  where s.run_id = p_run_id
    and s.couple_id = private.active_couple_id(auth.uid())
    and private.is_member_of_run(s.run_id, auth.uid())
  order by s.status <> 'declined' desc, s.created_at desc, s.id
  limit 1
$$;

revoke all on function public.share_consent() from public, anon;
revoke all on function public.set_share_consent(boolean) from public, anon;
revoke all on function public.propose_share(uuid) from public, anon;
revoke all on function public.answer_share(uuid, boolean) from public, anon;
revoke all on function public.cancel_share(uuid) from public, anon;
revoke all on function public.confirm_share(uuid) from public, anon;
revoke all on function public.pending_share_requests() from public, anon;
revoke all on function public.run_share(uuid) from public, anon;
grant execute on function public.share_consent() to authenticated;
grant execute on function public.set_share_consent(boolean) to authenticated;
grant execute on function public.propose_share(uuid) to authenticated;
grant execute on function public.answer_share(uuid, boolean) to authenticated;
grant execute on function public.cancel_share(uuid) to authenticated;
grant execute on function public.confirm_share(uuid) to authenticated;
grant execute on function public.pending_share_requests() to authenticated;
grant execute on function public.run_share(uuid) to authenticated;
