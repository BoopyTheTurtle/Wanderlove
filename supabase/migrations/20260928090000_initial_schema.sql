-- Initial schema: accounts-roadmap.md sections 4 and 5.
--
-- Access rule of thumb: membership of a trail run grants access to its photos; being a couple does not.
-- Tables that only RPCs may write get RLS with read policies and no write policies at all.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Helpers used by policies live outside the API-exposed schemas.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  -- Nullable: the internal build collects only a display name; the MVP fills usernames in.
  username extensions.citext unique check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_path text,
  age_confirmed_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null
);

-- "At most one active couple per user" is enforced in redeem_invite, the only writer.
create table public.couple_members (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);
create index couple_members_user_id_idx on public.couple_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null
);
create index invites_inviter_id_idx on public.invites (inviter_id);

-- Failed redemptions, for the attempt limit on redeem_invite.
create table public.invite_attempts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_time_idx on public.invite_attempts (user_id, attempted_at);

create table public.trail_runs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid references public.couples (id) on delete set null, -- null: solo run
  trail_id text not null,
  -- Stops only. The start and path can reveal a home address, so they never reach the server.
  trail_snapshot jsonb not null
    check (jsonb_typeof(trail_snapshot -> 'stops') = 'array')
    check (not (trail_snapshot ? 'start') and not (trail_snapshot ? 'path')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  check (completed_at is null or abandoned_at is null)
);

-- The access list for a run. It survives unlinking, so both people keep past albums.
create table public.trail_run_members (
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (run_id, user_id)
);
create index trail_run_members_user_id_idx on public.trail_run_members (user_id);

create table public.stop_completions (
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  stop_id text not null,
  completed_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (run_id, stop_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.trail_runs (id) on delete cascade,
  stop_id text not null,
  uploader_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_at timestamptz not null default now(),
  check (storage_path = run_id::text || '/' || id::text || '.jpg')
);
create index photos_run_id_idx on public.photos (run_id);

-- "Remove from my album" without deleting the photo for the partner.
create table public.photo_hidden (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  primary key (user_id, photo_id)
);

-- ---------------------------------------------------------------------------
-- Helpers (security definer, so policies can call them without recursing into RLS)
-- ---------------------------------------------------------------------------

create function private.active_couple_id(p_user uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select cm.couple_id
  from public.couple_members cm
  join public.couples c on c.id = cm.couple_id
  where cm.user_id = p_user and c.ended_at is null
  limit 1
$$;

create function private.is_couple_member(p_couple uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members where couple_id = p_couple and user_id = auth.uid()
  )
$$;

create function private.is_run_member(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trail_run_members where run_id = p_run and user_id = auth.uid()
  )
$$;

create function private.is_run_active(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trail_runs
    where id = p_run and completed_at is null and abandoned_at is null
  )
$$;

create function private.run_has_stop(p_run uuid, p_stop text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.trail_runs r, jsonb_array_elements(r.trail_snapshot -> 'stops') s
    where r.id = p_run and s ->> 'id' = p_stop
  )
$$;

-- People whose name and avatar the caller may see: self, the active partner, and fellow run members.
create function private.can_see_profile(p_user uuid)
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
$$;

-- Storage object names look like "<run_id>/<photo_id>.jpg"; anything else maps to null.
create function private.run_id_from_path(p_name text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: created on sign-up, readable by self; others see name and avatar through profile_cards
-- ---------------------------------------------------------------------------

create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create view public.profile_cards
with (security_invoker = false)
as
  select id, display_name, username, avatar_path
  from public.profiles
  where private.can_see_profile(id);

-- ---------------------------------------------------------------------------
-- Row-level security. Default refuse: every table has RLS and anon gets nothing.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.invites enable row level security;
alter table public.invite_attempts enable row level security;
alter table public.trail_runs enable row level security;
alter table public.trail_run_members enable row level security;
alter table public.stop_completions enable row level security;
alter table public.photos enable row level security;
alter table public.photo_hidden enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select on public.profile_cards to authenticated;

-- profiles: consent fields change only through accept_terms.
grant select, update (display_name, username, avatar_path) on public.profiles to authenticated;
create policy "profiles: read self" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- couples and couple_members: members read; RPCs write.
grant select on public.couples, public.couple_members to authenticated;
create policy "couples: read as member" on public.couples
  for select to authenticated using (private.is_couple_member(id));
create policy "couple_members: read as member" on public.couple_members
  for select to authenticated using (private.is_couple_member(couple_id));

-- invites: the inviter reads their own; RPCs write. invite_attempts stays private.
grant select (id, inviter_id, created_at, expires_at, redeemed_at, redeemed_by) on public.invites to authenticated;
create policy "invites: read own" on public.invites
  for select to authenticated using (inviter_id = auth.uid());

-- trail_runs: members read and may complete or abandon; start_run creates.
grant select, update (completed_at, abandoned_at) on public.trail_runs to authenticated;
create policy "trail_runs: read as member" on public.trail_runs
  for select to authenticated using (private.is_run_member(id));
create policy "trail_runs: update as member" on public.trail_runs
  for update to authenticated
  using (private.is_run_member(id) and completed_at is null and abandoned_at is null)
  with check (private.is_run_member(id));

grant select on public.trail_run_members to authenticated;
create policy "trail_run_members: read as member" on public.trail_run_members
  for select to authenticated using (private.is_run_member(run_id));

-- stop_completions: members read; members complete stops that exist on an active run.
grant select, insert (run_id, stop_id) on public.stop_completions to authenticated;
create policy "stop_completions: read as member" on public.stop_completions
  for select to authenticated using (private.is_run_member(run_id));
create policy "stop_completions: insert as member" on public.stop_completions
  for insert to authenticated
  with check (
    completed_by = auth.uid()
    and private.is_run_member(run_id)
    and private.is_run_active(run_id)
    and private.run_has_stop(run_id, stop_id)
  );

-- photos: members read, minus the ones they hid; members upload to active runs; uploaders delete.
grant select, insert (id, run_id, stop_id, storage_path, width, height), delete on public.photos to authenticated;
create policy "photos: read as member" on public.photos
  for select to authenticated
  using (
    private.is_run_member(run_id)
    and not exists (
      select 1 from public.photo_hidden h where h.photo_id = photos.id and h.user_id = auth.uid()
    )
  );
create policy "photos: insert as member" on public.photos
  for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and private.is_run_member(run_id)
    and private.is_run_active(run_id)
    and private.run_has_stop(run_id, stop_id)
  );
create policy "photos: delete own" on public.photos
  for delete to authenticated using (uploader_id = auth.uid());

-- photo_hidden: each user manages their own list, for photos they can reach.
grant select, insert (photo_id), delete on public.photo_hidden to authenticated;
create policy "photo_hidden: read own" on public.photo_hidden
  for select to authenticated using (user_id = auth.uid());
create policy "photo_hidden: insert own" on public.photo_hidden
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.photos p where p.id = photo_id and private.is_run_member(p.run_id))
  );
create policy "photo_hidden: delete own" on public.photo_hidden
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Records the tester notice tick box (or, later, the real terms).
create function public.accept_terms(p_version text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.profiles
  set age_confirmed_at = now(), terms_version = p_version, terms_accepted_at = now()
  where id = auth.uid();
end;
$$;

-- Returns a fresh 10-character code (50 bits). Only its hash is stored; older open invites are dropped.
create function public.create_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford base32
  bytes bytea := extensions.gen_random_bytes(10);
  code text := '';
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if private.active_couple_id(auth.uid()) is not null then
    raise exception 'already linked' using errcode = 'P0001';
  end if;

  for i in 0..9 loop
    code := code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
  end loop;

  delete from public.invites where inviter_id = auth.uid() and redeemed_at is null;
  insert into public.invites (inviter_id, code_hash)
  values (auth.uid(), encode(extensions.digest(code, 'sha256'), 'hex'));
  return code;
end;
$$;

-- Links the caller with the inviter. Returns a status instead of raising, so failed attempts stay recorded:
-- 'linked', 'invalid', 'expired', 'self', 'already_linked', or 'rate_limited'.
create function public.redeem_invite(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.invites;
  new_couple uuid;
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

  -- Serialise linking for both people, in a fixed order, so neither can join two couples at once.
  perform pg_advisory_xact_lock(hashtext(least(me, inv.inviter_id)::text));
  perform pg_advisory_xact_lock(hashtext(greatest(me, inv.inviter_id)::text));

  if private.active_couple_id(me) is not null or private.active_couple_id(inv.inviter_id) is not null then
    return 'already_linked';
  end if;

  insert into public.couples default values returning id into new_couple;
  insert into public.couple_members (couple_id, user_id) values (new_couple, inv.inviter_id), (new_couple, me);
  update public.invites set redeemed_at = now(), redeemed_by = me where id = inv.id;
  return 'linked';
end;
$$;

-- Ends the caller's couple at once, with no approval from the partner. Active shared runs get abandoned;
-- both people stay members of every past run.
create function public.unlink()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    return;
  end if;
  update public.couples set ended_at = now(), ended_by = auth.uid() where id = couple;
  update public.trail_runs set abandoned_at = now()
  where couple_id = couple and completed_at is null and abandoned_at is null;
end;
$$;

-- Starts a run for the caller and their active partner, abandoning any run either still has open.
create function public.start_run(p_trail_id text, p_snapshot jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  run uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  update public.trail_runs r set abandoned_at = now()
  where r.completed_at is null and r.abandoned_at is null
    and exists (
      select 1 from public.trail_run_members m
      where m.run_id = r.id
        and m.user_id in (select user_id from public.couple_members where couple_id = couple union select me)
    );

  insert into public.trail_runs (couple_id, trail_id, trail_snapshot)
  values (couple, p_trail_id, p_snapshot)
  returning id into run;

  insert into public.trail_run_members (run_id, user_id)
  select run, me
  union
  select run, user_id from public.couple_members where couple_id = couple;

  return run;
end;
$$;

revoke all on function public.accept_terms(text) from public, anon;
revoke all on function public.create_invite() from public, anon;
revoke all on function public.redeem_invite(text) from public, anon;
revoke all on function public.unlink() from public, anon;
revoke all on function public.start_run(text, jsonb) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
grant execute on function public.create_invite() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.unlink() to authenticated;
grant execute on function public.start_run(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: a private bucket; objects at "<run_id>/<photo_id>.jpg"
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg']);

create policy "photos bucket: read as run member" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and private.is_run_member(private.run_id_from_path(name)));

create policy "photos bucket: upload to own active run" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and private.is_run_member(private.run_id_from_path(name))
    and private.is_run_active(private.run_id_from_path(name))
  );

create policy "photos bucket: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and owner_id = auth.uid()::text);
