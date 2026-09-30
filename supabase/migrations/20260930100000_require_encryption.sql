-- The server refuses anything unencrypted (photo-encryption.md, task E.6; security-review.md, finding 1).
--
-- Until now start_run without keys started a plain trail, and a plain ".jpg" photo could join any trail, encrypted or
-- not. The current app does neither, but a phone still running a build from before encryption does both: its
-- two-argument start_run call resolves to the four-argument function, and its photos upload as JPEG. From here on a
-- trail needs keys, a photo row needs a nonce and the uploader's copy of the trail key, and the bucket takes only
-- ".bin" objects. Rows and objects already stored stay readable; test data is wiped before launch.

-- ---------------------------------------------------------------------------
-- start_run: keys are required. The signature and defaults stay, so a stale client's call still resolves and gets a
-- clear keys_required error instead of "function not found". Otherwise unchanged from 20260929220000.
-- ---------------------------------------------------------------------------

create or replace function public.start_run(
  p_trail_id text, p_snapshot jsonb, p_keys jsonb default null, p_run_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
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

  members := array(select me union select user_id from public.couple_members where couple_id = couple);

  if jsonb_typeof(p_keys) <> 'array' then
    raise exception 'keys_mismatch' using errcode = 'P0001', detail = 'p_keys must be a JSON array';
  end if;
  if jsonb_array_length(p_keys) <> cardinality(members)
     or (select count(distinct k ->> 'user_id') from jsonb_array_elements(p_keys) k) <> cardinality(members)
     or exists (
       select 1 from jsonb_array_elements(p_keys) k
       where not (k ->> 'user_id' = any (members::text[]))
         or k ->> 'wrapped_key' is null
         or k ->> 'ephemeral_public_key' is null
         or not private.is_current_key((k ->> 'user_id')::uuid, k ->> 'for_key_id')
     ) then
    raise exception 'keys_mismatch' using errcode = 'P0001',
      detail = 'p_keys must hold one wrap per run member, each for the member''s current key';
  end if;

  update public.trail_runs r set abandoned_at = now()
  where r.completed_at is null and r.abandoned_at is null
    and exists (
      select 1 from public.trail_run_members m
      where m.run_id = r.id and m.user_id = any (members)
    );

  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, started_by)
  values (p_run_id, couple, p_trail_id, p_snapshot, me)
  returning id into run;

  insert into public.trail_run_members (run_id, user_id)
  select run, unnest(members);

  insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
  select run, (k ->> 'user_id')::uuid, k ->> 'wrapped_key', k ->> 'ephemeral_public_key', k ->> 'for_key_id'
  from jsonb_array_elements(p_keys) k;

  return run;
end;
$$;

revoke all on function public.start_run(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.start_run(text, jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Photo rows: a nonce (so a ".bin" path, by photos_storage_path_check) and the uploader's own copy of the run key.
-- A member without a copy could only have sealed the photo with a key the partner can't open, or not at all.
-- ---------------------------------------------------------------------------

-- Security definer like the other policy helpers, so the check never depends on run_keys' own read policy.
create function private.holds_run_key(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.run_keys where run_id = p_run and user_id = auth.uid())
$$;

revoke all on function private.holds_run_key(uuid) from public, anon;
grant execute on function private.holds_run_key(uuid) to authenticated;

drop policy "photos: insert as member" on public.photos;
create policy "photos: insert as member" on public.photos
  for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and nonce is not null
    and private.is_run_member(run_id)
    and private.can_add_photo(run_id)
    and private.run_has_stop(run_id, stop_id)
    and private.holds_run_key(run_id)
  );

-- ---------------------------------------------------------------------------
-- Storage: new objects are ".bin" ciphertext only. The read policy is untouched, so stored ".jpg" photos still show.
-- ---------------------------------------------------------------------------

drop policy "photos bucket: upload to own run" on storage.objects;
create policy "photos bucket: upload to own run" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and right(name, 4) = '.bin'
    and private.is_run_member(private.run_id_from_path(name))
    and private.can_add_photo(private.run_id_from_path(name))
  );

update storage.buckets
set allowed_mime_types = array['application/octet-stream']
where id = 'photos';
