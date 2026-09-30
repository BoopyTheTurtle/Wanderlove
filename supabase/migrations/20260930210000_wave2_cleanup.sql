-- Cleanup after wave 2 (docs/private-trails.md, section 9). The app now starts only sealed runs, invites or goes
-- alone instead of enrolling the partner, and links through redeem_invite_pending, so the old paths go:
-- 1. start_run's 'join' mode, and plain snapshots for new runs. p_partner no longer defaults to 'join': a call must
--    say 'invite' or 'none'. p_snapshot stays in the signature, and must be null.
-- 2. redeem_invite, which linked without the inviter's confirmation.
-- 3. couples.ended_by, cleared and unreadable since 20260930170000.
--
-- Legacy plain runs still exist until the test-data wipe, so private.run_has_stop keeps its plain branch, the check
-- constraint keeps the plain shape, and the trim keeps its lat 0 / lng 0 placeholders.
--
-- Deploy the wave 2 app first: an older app still calls the four-argument start_run and redeem_invite.

-- ---------------------------------------------------------------------------
-- start_run: sealed runs only, 'invite' or 'none'
-- ---------------------------------------------------------------------------

drop function public.start_run(text, jsonb, jsonb, uuid, text, text, text, text, text, int);

-- Unchanged from 20260930150000, except that 'join' and plain snapshots are gone, so members are always the caller
-- alone and only the caller's open runs are abandoned.
create function public.start_run(
  p_trail_id text,
  p_snapshot jsonb,
  p_keys jsonb default null,
  p_run_id uuid default null,
  p_partner text default null,
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
  if p_partner is null or p_partner not in ('invite', 'none') then
    raise exception 'partner_mode_invalid' using errcode = 'P0001',
      detail = 'p_partner must be invite or none; this app is out of date, so reload it';
  end if;
  if p_snapshot is not null then
    raise exception 'details_required' using errcode = 'P0001',
      detail = 'a new run is sealed: pass p_snapshot null with sealed details; this app is out of date, so reload it';
  end if;
  if p_details is null or p_details_nonce is null or p_summary is null or p_summary_nonce is null
     or p_stop_count is null or p_trail_id is distinct from 'private' then
    raise exception 'details_mismatch' using errcode = 'P0001',
      detail = 'a sealed run needs p_trail_id private and all of p_details, p_details_nonce, p_summary, '
        'p_summary_nonce, and p_stop_count';
  end if;

  if p_partner = 'none' then
    couple := null;
  end if;
  partner := (select user_id from public.couple_members where couple_id = couple and user_id <> me limit 1);
  holders := array_remove(array[me, partner], null);

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
    and exists (select 1 from public.trail_run_members m where m.run_id = r.id and m.user_id = me);

  insert into public.trail_runs (
    id, couple_id, trail_id, trail_snapshot, started_by,
    details_ciphertext, details_nonce, summary_ciphertext, summary_nonce, stop_count
  )
  values (
    p_run_id, couple, p_trail_id, null, me,
    p_details, p_details_nonce, p_summary, p_summary_nonce, p_stop_count
  )
  returning id into run;

  insert into public.trail_run_members (run_id, user_id) values (run, me);

  insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
  select run, (k ->> 'user_id')::uuid, k ->> 'wrapped_key', k ->> 'ephemeral_public_key', k ->> 'for_key_id'
  from jsonb_array_elements(p_keys) k;

  if partner is not null then
    insert into public.run_invites (run_id, user_id) values (run, partner);
  end if;

  return run;
end;
$$;

revoke all on function public.start_run(text, jsonb, jsonb, uuid, text, text, text, text, text, int) from public, anon;
grant execute on function public.start_run(text, jsonb, jsonb, uuid, text, text, text, text, text, int)
  to authenticated;

-- ---------------------------------------------------------------------------
-- redeem_invite and couples.ended_by
-- ---------------------------------------------------------------------------

drop function public.redeem_invite(text);

alter table public.couples drop column ended_by;
