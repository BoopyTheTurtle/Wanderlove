-- Private trails, database side (docs/private-trails.md; abuse-threat-model.md, section 6, decisions 1, 2, and 7).
--
-- Three additions, all optional, so the app deployed today keeps working until wave 2 switches to them:
-- 1. Sealed trails. A run may keep its details (stops, places, prompts) encrypted with the run key instead of a plain
--    trail_snapshot, next to a sealed summary (trail name, stop names, date) that outlives the details. Its stops are
--    then the anonymous "s1".."s<stop_count>", so completions and photos name no place.
-- 2. Just me. A run whose only member is the caller, even while linked. The partner never sees it.
-- 3. Joining by choice. A run may invite the partner instead of enrolling them: the partner becomes a member, and so
--    reads the run and adds stops and photos, only by accepting.

-- ---------------------------------------------------------------------------
-- Sealed trails
-- ---------------------------------------------------------------------------

-- A sealed run has no trail_snapshot. Its ciphertexts are base64 AES-GCM output under the run key; the lengths only
-- stop abuse of the table as file storage. The retention purge later drops the details and keeps the summary.
-- trail_id is "private" on a sealed run, since a curated trail's ID names the place it starts.
alter table public.trail_runs
  alter column trail_snapshot drop not null,
  add column details_ciphertext text check (char_length(details_ciphertext) <= 262144),
  add column details_nonce text check (char_length(details_nonce) <= 64),
  add column summary_ciphertext text check (char_length(summary_ciphertext) <= 32768),
  add column summary_nonce text check (char_length(summary_nonce) <= 64),
  add column stop_count int check (stop_count between 1 and 99),
  add constraint trail_runs_sealed_check check (
    (trail_snapshot is null) = (summary_ciphertext is not null)
    and (trail_snapshot is null) = (stop_count is not null)
    and (summary_ciphertext is null) = (summary_nonce is null)
    and (details_ciphertext is null) = (details_nonce is null)
    and (details_ciphertext is null or trail_snapshot is null)
    and (trail_snapshot is not null or trail_id = 'private')
  );

-- A plain run's stops are the IDs in its snapshot; a sealed run's are "s1".."s<stop_count>".
create or replace function private.run_has_stop(p_run uuid, p_stop text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.trail_runs r
    where r.id = p_run
      and case
        when r.trail_snapshot is null then
          p_stop ~ '^s[1-9][0-9]?$' and substr(p_stop, 2)::int <= r.stop_count
        else exists (
          select 1 from jsonb_array_elements(r.trail_snapshot -> 'stops') s where s ->> 'id' = p_stop
        )
      end
  )
$$;

-- ---------------------------------------------------------------------------
-- Joining by choice: run_invites holds the partner's open invitation to a run
-- ---------------------------------------------------------------------------

-- The partner's copy of the run key goes into run_keys at start, since only the starting phone holds the key; it opens
-- nothing until the partner joins, because every run, photo, and completion policy asks for membership.
create table public.run_invites (
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
create index run_invites_user_id_idx on public.run_invites (user_id);

-- True while the caller may still join the run: it is open, and it belongs to the caller's active couple.
create function private.can_join_run(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.trail_runs r
    join public.couples c on c.id = r.couple_id and c.ended_at is null
    join public.couple_members cm on cm.couple_id = c.id and cm.user_id = auth.uid()
    where r.id = p_run and r.completed_at is null and r.abandoned_at is null
  )
$$;

revoke all on function private.can_join_run(uuid) from public, anon;
grant execute on function private.can_join_run(uuid) to authenticated;

alter table public.run_invites enable row level security;
revoke all on public.run_invites from anon, authenticated;

-- Only the invitee reads an invitation, and only while they can still accept it. The starter sees members alone, so
-- "not yet" and "not this time" look the same from their side. accept_run and decline_run write.
grant select on public.run_invites to authenticated;
create policy "run_invites: read own open" on public.run_invites
  for select to authenticated using (user_id = auth.uid() and private.can_join_run(run_id));

-- ---------------------------------------------------------------------------
-- start_run: the sealed details, and who else the run is for
-- ---------------------------------------------------------------------------
--
-- p_partner picks what happens to the active partner:
--   'join'   (default, today's behaviour) the partner becomes a member at once. The start abandons every open run of
--            either person.
--   'invite' the partner gets an invitation and their copy of the key; accept_run makes them a member. The start
--            abandons only the caller's open runs.
--   'none'   Just me: the caller is the only member and holds the only key, and the run belongs to no couple, so an
--            unlink leaves it alone. The start abandons only the caller's open runs.
-- Without an active partner all three start a solo run. p_keys holds one wrap per key holder: the caller, plus the
-- partner for 'join' and 'invite'.
--
-- A sealed run passes p_snapshot null, and p_trail_id 'private', with all five sealed parameters; a plain run passes
-- p_snapshot and none of them. Keys and p_run_id stay required, as since 20260930100000, and the sealed details are
-- bound to the run ID by the client (docs/private-trails.md).

drop function public.start_run(text, jsonb, jsonb, uuid);

create function public.start_run(
  p_trail_id text,
  p_snapshot jsonb,
  p_keys jsonb default null,
  p_run_id uuid default null,
  p_partner text default 'join',
  p_details text default null,
  p_details_nonce text default null,
  p_summary text default null,
  p_summary_nonce text default null,
  p_stop_count int default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  partner uuid;
  holders uuid[];
  members uuid[];
  run uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if p_keys is null then
    raise exception 'keys_required' using errcode = 'P0001',
      detail = 'every run is encrypted; this app is out of date, so reload it';
  end if;
  if p_run_id is null then
    raise exception 'run_id_required' using errcode = 'P0001',
      detail = 'an encrypted run needs the client-chosen p_run_id its keys were wrapped for';
  end if;
  if p_partner is null or p_partner not in ('join', 'invite', 'none') then
    raise exception 'partner_mode_invalid' using errcode = 'P0001',
      detail = 'p_partner must be join, invite, or none';
  end if;
  if p_snapshot is null then
    if p_details is null or p_details_nonce is null or p_summary is null or p_summary_nonce is null
       or p_stop_count is null or p_trail_id is distinct from 'private' then
      raise exception 'details_mismatch' using errcode = 'P0001',
        detail = 'a sealed run needs p_trail_id private and all of p_details, p_details_nonce, p_summary, '
          'p_summary_nonce, and p_stop_count';
    end if;
  elsif num_nonnulls(p_details, p_details_nonce, p_summary, p_summary_nonce, p_stop_count) > 0 then
    raise exception 'details_mismatch' using errcode = 'P0001',
      detail = 'a run has either a plain p_snapshot or sealed details, never both';
  end if;

  if p_partner = 'none' then
    couple := null;
  end if;
  partner := (select user_id from public.couple_members where couple_id = couple and user_id <> me limit 1);
  holders := array_remove(array[me, partner], null);
  members := case when p_partner = 'join' then holders else array[me] end;

  if jsonb_typeof(p_keys) <> 'array' then
    raise exception 'keys_mismatch' using errcode = 'P0001', detail = 'p_keys must be a JSON array';
  end if;
  if jsonb_array_length(p_keys) <> cardinality(holders)
     or (select count(distinct k ->> 'user_id') from jsonb_array_elements(p_keys) k) <> cardinality(holders)
     or exists (
       select 1 from jsonb_array_elements(p_keys) k
       where not (k ->> 'user_id' = any (holders::text[]))
         or k ->> 'wrapped_key' is null
         or k ->> 'ephemeral_public_key' is null
         or not private.is_current_key((k ->> 'user_id')::uuid, k ->> 'for_key_id')
     ) then
    raise exception 'keys_mismatch' using errcode = 'P0001',
      detail = 'p_keys must hold one wrap per key holder, each for the holder''s current key';
  end if;

  update public.trail_runs r set abandoned_at = now()
  where r.completed_at is null and r.abandoned_at is null
    and exists (
      select 1 from public.trail_run_members m
      where m.run_id = r.id and m.user_id = any (members)
    );

  insert into public.trail_runs (
    id, couple_id, trail_id, trail_snapshot, started_by,
    details_ciphertext, details_nonce, summary_ciphertext, summary_nonce, stop_count
  )
  values (
    p_run_id, couple, p_trail_id, p_snapshot, me,
    p_details, p_details_nonce, p_summary, p_summary_nonce, p_stop_count
  )
  returning id into run;

  insert into public.trail_run_members (run_id, user_id)
  select run, unnest(members);

  insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
  select run, (k ->> 'user_id')::uuid, k ->> 'wrapped_key', k ->> 'ephemeral_public_key', k ->> 'for_key_id'
  from jsonb_array_elements(p_keys) k;

  if p_partner = 'invite' and partner is not null then
    insert into public.run_invites (run_id, user_id) values (run, partner);
  end if;

  return run;
end;
$$;

revoke all on function public.start_run(text, jsonb, jsonb, uuid, text, text, text, text, text, int) from public, anon;
grant execute on function public.start_run(text, jsonb, jsonb, uuid, text, text, text, text, text, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- accept_run and decline_run
-- ---------------------------------------------------------------------------

-- Joins a run the partner invited the caller to. Returns 'joined', or 'gone' when there is no open invitation: the run
-- has ended, the couple has unlinked, or the invitation was declined. Joining abandons the caller's other open runs,
-- so each person walks one run at a time; the starter's side of the run is untouched.
create function public.accept_run(p_run_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  perform 1 from public.trail_runs where id = p_run_id for update;
  if not exists (select 1 from public.run_invites where run_id = p_run_id and user_id = me)
     or not private.can_join_run(p_run_id) then
    return 'gone';
  end if;

  update public.trail_runs r set abandoned_at = now()
  where r.id <> p_run_id and r.completed_at is null and r.abandoned_at is null
    and exists (select 1 from public.trail_run_members m where m.run_id = r.id and m.user_id = me);

  insert into public.trail_run_members (run_id, user_id) values (p_run_id, me);
  delete from public.run_invites where run_id = p_run_id and user_id = me;
  return 'joined';
end;
$$;

-- Turns an invitation down, or withdraws from one that has lapsed. The caller's copy of the key goes with it, unless
-- the caller is already a member. Safe to call twice.
create function public.decline_run(p_run_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.run_invites where run_id = p_run_id and user_id = me;
  delete from public.run_keys k
  where k.run_id = p_run_id and k.user_id = me and not private.is_member_of_run(p_run_id, me);
end;
$$;

revoke all on function public.accept_run(uuid) from public, anon;
revoke all on function public.decline_run(uuid) from public, anon;
grant execute on function public.accept_run(uuid) to authenticated;
grant execute on function public.decline_run(uuid) to authenticated;
