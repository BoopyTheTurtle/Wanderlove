-- End-to-end encrypted photos, database side (photo-encryption.md, task E.1; recovery options A and C).
--
-- Each account publishes an ECDH P-256 public key in user_keys, next to its private key encrypted with a key made
-- from the recovery code (option A). Each run gets an AES-GCM key that the starting phone wraps once per member into
-- run_keys; a member's phone may rewrap it for the partner's new key (option C, partner re-share). Encrypted photos
-- are stored as "<run_id>/<photo_id>.bin" with their nonce on the photos row. The server never holds a usable key.

-- ---------------------------------------------------------------------------
-- user_keys: one key pair per account. Only the owner reads the row, since it holds the recovery blob.
-- ---------------------------------------------------------------------------

create table public.user_keys (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  public_key text not null, -- base64 raw P-256 public key
  key_id text not null, -- short fingerprint of public_key, computed by the client
  -- The private key encrypted with a key derived from the recovery code. All three or none: a phone that replaced its
  -- key pair without the code (option C) may not have made a new code yet.
  recovery_blob text,
  recovery_salt text,
  recovery_iv text,
  updated_at timestamptz not null default now(),
  check ((recovery_blob is null) = (recovery_salt is null) and (recovery_blob is null) = (recovery_iv is null))
);

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_keys_touch
  before update on public.user_keys
  for each row execute function private.touch_updated_at();

alter table public.user_keys enable row level security;

-- New tables inherit Supabase's default grants (everything, truncate included, for anon too); start from none.
revoke all on public.user_keys from anon, authenticated;

-- A new phone without the recovery code replaces the key pair (option C), so the owner may update every field.
grant select, insert (user_id, public_key, key_id, recovery_blob, recovery_salt, recovery_iv),
  update (public_key, key_id, recovery_blob, recovery_salt, recovery_iv) on public.user_keys to authenticated;
create policy "user_keys: read own" on public.user_keys
  for select to authenticated using (user_id = auth.uid());
create policy "user_keys: insert own" on public.user_keys
  for insert to authenticated with check (user_id = auth.uid());
create policy "user_keys: update own" on public.user_keys
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- profile_cards gains the public key, so self, the active partner, and fellow run members can wrap for each other.
-- Columns are appended, so the view keeps its grants; the filter is unchanged.
-- ---------------------------------------------------------------------------

create or replace view public.profile_cards
with (security_invoker = false)
as
  select p.id, p.display_name, p.username, p.avatar_path, k.public_key, k.key_id
  from public.profiles p
  left join public.user_keys k on k.user_id = p.id
  where private.can_see_profile(p.id);

grant select on public.profile_cards to authenticated;

-- ---------------------------------------------------------------------------
-- run_keys: the run's photo key, wrapped once per member. Each member reads only their own row.
-- ---------------------------------------------------------------------------

create table public.run_keys (
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  wrapped_key text not null,
  ephemeral_public_key text not null,
  for_key_id text not null, -- the recipient's key_id at wrap time; a mismatch with user_keys means a stale wrap
  wrapped_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
create index run_keys_user_id_idx on public.run_keys (user_id);

-- Whoever writes a wrap is recorded as its wrapper, whichever path the write takes.
create function private.stamp_wrapped_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.wrapped_by := auth.uid();
  return new;
end;
$$;

create trigger run_keys_stamp
  before insert or update on public.run_keys
  for each row execute function private.stamp_wrapped_by();

create function private.is_member_of_run(p_run uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.trail_run_members where run_id = p_run and user_id = p_user)
$$;

-- True when p_key_id is the user's current key, so nobody stores a wrap for a key the recipient no longer holds.
create function private.is_current_key(p_user uuid, p_key_id text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_keys where user_id = p_user and key_id = p_key_id)
$$;

revoke all on function private.touch_updated_at() from public, anon;
revoke all on function private.stamp_wrapped_by() from public, anon;
revoke all on function private.is_member_of_run(uuid, uuid) from public, anon;
revoke all on function private.is_current_key(uuid, text) from public, anon;
grant execute on function private.is_member_of_run(uuid, uuid) to authenticated;
grant execute on function private.is_current_key(uuid, text) to authenticated;

alter table public.run_keys enable row level security;
revoke all on public.run_keys from anon, authenticated;

-- A run member may write the wrap for any member of that run: the starter wraps for the partner, and a partner's
-- phone rewraps for the other's new key (option C). No delete: rows go with the run or the account.
grant select, insert (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id),
  update (wrapped_key, ephemeral_public_key, for_key_id) on public.run_keys to authenticated;
create policy "run_keys: read own" on public.run_keys
  for select to authenticated using (user_id = auth.uid());
create policy "run_keys: insert as member" on public.run_keys
  for insert to authenticated
  with check (
    private.is_run_member(run_id)
    and private.is_member_of_run(run_id, user_id)
    and private.is_current_key(user_id, for_key_id)
  );
create policy "run_keys: update as member" on public.run_keys
  for update to authenticated
  using (private.is_run_member(run_id))
  with check (
    private.is_run_member(run_id)
    and private.is_member_of_run(run_id, user_id)
    and private.is_current_key(user_id, for_key_id)
  );

-- Rewraps run keys for other members. A plain UPDATE of the partner's row matches nothing, because the read policy
-- hides that row from the caller; this RPC upserts instead, under the same rules as the policies above.
-- p_keys: [{run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id}, ...]. All rows are written, or none.
create function public.share_run_keys(p_keys jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'keys_mismatch' using errcode = 'P0001', detail = 'p_keys must be a JSON array';
  end if;

  for k in select * from jsonb_array_elements(p_keys) loop
    if not private.is_run_member((k ->> 'run_id')::uuid)
       or not private.is_member_of_run((k ->> 'run_id')::uuid, (k ->> 'user_id')::uuid) then
      raise exception 'not a member of this run' using errcode = '42501';
    end if;
    if not private.is_current_key((k ->> 'user_id')::uuid, k ->> 'for_key_id') then
      raise exception 'keys_mismatch' using errcode = 'P0001', detail = 'for_key_id is not the recipient''s current key';
    end if;

    insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
    values ((k ->> 'run_id')::uuid, (k ->> 'user_id')::uuid, k ->> 'wrapped_key', k ->> 'ephemeral_public_key',
            k ->> 'for_key_id')
    on conflict (run_id, user_id) do update
    set wrapped_key = excluded.wrapped_key,
        ephemeral_public_key = excluded.ephemeral_public_key,
        for_key_id = excluded.for_key_id;
  end loop;
end;
$$;

revoke all on function public.share_run_keys(jsonb) from public, anon;
grant execute on function public.share_run_keys(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- start_run gains the wrapped keys. Unchanged otherwise (still records started_by). With p_keys null the run is a
-- plain, unencrypted one, as before. With p_keys, the array must hold exactly one wrap per member (the caller and the
-- active partner), each for the member's current key; otherwise it raises keys_mismatch, so the client can refetch
-- the partner's card and retry. Wraps are bound to the run ID (lib/crypto.ts uses it as AES-GCM additional data), so an
-- encrypted start must also pass p_run_id, the ID the phone chose before wrapping; a reused ID fails on the primary key.
-- Without keys, p_run_id is optional and the server picks the ID as before.
-- ---------------------------------------------------------------------------

drop function public.start_run(text, jsonb);

create function public.start_run(
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

  members := array(select me union select user_id from public.couple_members where couple_id = couple);

  if p_keys is not null then
    if p_run_id is null then
      raise exception 'run_id_required' using errcode = 'P0001',
        detail = 'an encrypted run needs the client-chosen p_run_id its keys were wrapped for';
    end if;
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
  end if;

  update public.trail_runs r set abandoned_at = now()
  where r.completed_at is null and r.abandoned_at is null
    and exists (
      select 1 from public.trail_run_members m
      where m.run_id = r.id and m.user_id = any (members)
    );

  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot, started_by)
  values (coalesce(p_run_id, gen_random_uuid()), couple, p_trail_id, p_snapshot, me)
  returning id into run;

  insert into public.trail_run_members (run_id, user_id)
  select run, unnest(members);

  if p_keys is not null then
    insert into public.run_keys (run_id, user_id, wrapped_key, ephemeral_public_key, for_key_id)
    select run, (k ->> 'user_id')::uuid, k ->> 'wrapped_key', k ->> 'ephemeral_public_key', k ->> 'for_key_id'
    from jsonb_array_elements(p_keys) k;
  end if;

  return run;
end;
$$;

revoke all on function public.start_run(text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.start_run(text, jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Photos: an encrypted photo is "<run_id>/<photo_id>.bin" with its AES-GCM nonce on the row; a row without a nonce
-- is a legacy plain JPEG at ".jpg".
-- ---------------------------------------------------------------------------

alter table public.photos add column nonce text;

alter table public.photos drop constraint photos_check;
alter table public.photos add constraint photos_storage_path_check
  check (storage_path = run_id::text || '/' || id::text || case when nonce is null then '.jpg' else '.bin' end);

grant insert (nonce) on public.photos to authenticated;

create or replace function private.run_id_from_path(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|bin)$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'application/octet-stream']
where id = 'photos';
