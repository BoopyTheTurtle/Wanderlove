-- Photo retention (mvp-roadmap.md, stage 1): the server keeps a trail's photos for one month after it ends, then
-- deletes them. Phones already save the photos and the album, so the journey itself stays: the run, its stops, and its
-- date remain, and photos_purged_at tells the app the photos are gone.
--
-- A run ends when it is completed or abandoned. A run left open for more than 60 days counts as having ended 30 days
-- after it started, so a forgotten trail loses its photos after two months instead of never. Such a run can still take
-- photos while it stays open; the next purge deletes those too.
--
-- Deleting a file needs the Storage API, since removing a row from storage.objects leaves the file behind. So the
-- database only lists what has expired and forgets the rows afterwards; scripts/purge-expired-photos.mjs, run daily by
-- .github/workflows/purge-photos.yml, deletes the files in between. Both functions are for the service role alone.

alter table public.trail_runs add column photos_purged_at timestamptz;

-- When a run's photos expire: 30 days after it ends, or 60 days after it starts if it never ends.
create function private.photos_expire_at(p_started_at timestamptz, p_completed_at timestamptz, p_abandoned_at timestamptz)
returns timestamptz
language sql immutable set search_path = ''
as $$
  select coalesce(p_completed_at, p_abandoned_at, p_started_at + interval '30 days') + interval '30 days'
$$;

revoke all on function private.photos_expire_at(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

-- One batch of expired photos, oldest run first. Each photo row comes with its storage path; a file in the bucket for an
-- expired run with no row (an upload whose row never landed) comes with a null photo_id, so it goes too. The batch
-- stays the same until the files are deleted and purge_photos forgets the rows, so the caller loops until it is empty.
-- p_limit is clamped to 1..1000, the most the Storage API deletes in one call.
create function public.expired_photos(p_limit int default 100)
returns table (photo_id uuid, run_id uuid, storage_path text)
language sql stable security definer set search_path = ''
as $$
  with expired as (
    select r.id, private.photos_expire_at(r.started_at, r.completed_at, r.abandoned_at) as expire_at
    from public.trail_runs r
    where private.photos_expire_at(r.started_at, r.completed_at, r.abandoned_at) <= now()
  ),
  files as (
    select p.id as photo_id, p.run_id, p.storage_path, e.expire_at
    from public.photos p
    join expired e on e.id = p.run_id
    union all
    select null, e.id, o.name, e.expire_at
    from storage.objects o
    join expired e on e.id = private.run_id_from_path(o.name)
    where o.bucket_id = 'photos'
      and not exists (select 1 from public.photos p where p.storage_path = o.name)
  )
  select photo_id, run_id, storage_path
  from files
  order by expire_at, run_id, storage_path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

-- Forgets the given photo rows, once their files are gone, and stamps photos_purged_at on every expired run that has
-- neither rows nor files left (including runs that never had a photo). IDs of photos that have not expired are
-- ignored. Returns the number of rows deleted and of runs stamped. Safe to call again with the same IDs, or with none.
create function public.purge_photos(p_photo_ids uuid[])
returns table (photos_deleted int, runs_purged int)
language plpgsql security definer set search_path = ''
as $$
declare
  n_photos int;
  n_runs int;
begin
  delete from public.photos p
  using public.trail_runs r
  where p.id = any (coalesce(p_photo_ids, '{}'))
    and r.id = p.run_id
    and private.photos_expire_at(r.started_at, r.completed_at, r.abandoned_at) <= now();
  get diagnostics n_photos = row_count;

  update public.trail_runs r
  set photos_purged_at = now()
  where r.photos_purged_at is null
    and private.photos_expire_at(r.started_at, r.completed_at, r.abandoned_at) <= now()
    and not exists (select 1 from public.photos p where p.run_id = r.id)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'photos' and private.run_id_from_path(o.name) = r.id
    );
  get diagnostics n_runs = row_count;

  return query select n_photos, n_runs;
end;
$$;

-- Supabase grants execute on new functions in public to anon and authenticated by default; only the service role
-- keeps it.
revoke all on function public.expired_photos(int) from public, anon, authenticated;
revoke all on function public.purge_photos(uuid[]) from public, anon, authenticated;
grant execute on function public.expired_photos(int) to service_role;
grant execute on function public.purge_photos(uuid[]) to service_role;
