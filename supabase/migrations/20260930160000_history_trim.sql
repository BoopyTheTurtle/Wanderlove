-- History after a month (abuse-threat-model.md, section 6, decision 4; docs/private-trails.md).
--
-- When a run's photos expire, the purge now also trims the run to what Activity needs: the run row, its stop count,
-- trail name, stop names, and date. Edgar: "keep a history of trails done together regardless". It drops the sealed
-- details, and rounds the run's times, its stop completion times, and its key rows' times down to the day (UTC).
-- A plain run from before sealing loses its coordinates, prompts, area, and description; its stops become "s1".."sN"
-- in trail order, in the snapshot and in its completions alike, since an OSM ID names the exact place.
--
-- Today's app parses every stored stop for a position and a radius, so a trimmed plain stop keeps its radius and reads
-- lat 0, lng 0. Wave 2 recognises a trimmed run by photos_purged_at or by the zero position; a cleanup migration can
-- drop the two keys once no deployed app needs them.
--
-- A run still open when its photos expire (60 days after it started) is abandoned as of 30 days after its start, the
-- moment photos_expire_at already treats as its end; with its details gone it cannot be walked.

-- Records whoever writes a wrap only when the wrap itself changes, so the trim's rounding of created_at keeps
-- wrapped_by. Unchanged otherwise from 20260929220000.
create or replace function private.stamp_wrapped_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.wrapped_key is distinct from old.wrapped_key
     or new.ephemeral_public_key is distinct from old.ephemeral_public_key
     or new.for_key_id is distinct from old.for_key_id then
    new.wrapped_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Each plain run's stop IDs that still need their anonymous "s<position>".
create function private.trim_stop_ids(p_runs uuid[])
returns table (run_id uuid, old_id text, new_id text)
language sql stable set search_path = ''
as $$
  select r.id, s.stop ->> 'id', 's' || s.n
  from public.trail_runs r
  cross join lateral jsonb_array_elements(r.trail_snapshot -> 'stops') with ordinality as s (stop, n)
  where r.id = any (p_runs) and r.trail_snapshot is not null and s.stop ->> 'id' is distinct from 's' || s.n
$$;

revoke all on function private.trim_stop_ids(uuid[]) from public, anon, authenticated;

-- Trims the given runs. Idempotent: a trimmed run comes out unchanged. For the service role, through purge_photos.
create function private.trim_runs(p_runs uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Plain runs: completions and any photo rows still waiting for their file to go take the anonymous stop IDs.
  update public.stop_completions c set stop_id = m.new_id
  from private.trim_stop_ids(p_runs) m
  where c.run_id = m.run_id and c.stop_id = m.old_id;

  update public.photos p set stop_id = m.new_id
  from private.trim_stop_ids(p_runs) m
  where p.run_id = m.run_id and p.stop_id = m.old_id;

  update public.trail_runs r
  set trail_snapshot = jsonb_strip_nulls(jsonb_build_object(
        'kind', r.trail_snapshot -> 'kind',
        'name', r.trail_snapshot -> 'name',
        'curatorPick', r.trail_snapshot -> 'curatorPick',
        'coverImage', r.trail_snapshot -> 'coverImage',
        'durationMinutes', r.trail_snapshot -> 'durationMinutes',
        'stopCount', r.trail_snapshot -> 'stopCount',
        'distanceMeters', r.trail_snapshot -> 'distanceMeters',
        'distanceEstimated', r.trail_snapshot -> 'distanceEstimated'
      )) || jsonb_build_object('stops', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', 's' || s.n,
          'name', coalesce(s.stop -> 'name', '""'),
          'lat', 0,
          'lng', 0,
          'radiusMeters', coalesce(s.stop -> 'radiusMeters', '1'),
          'eyebrow', '',
          'prompt', '',
          'image', ''
        ) order by s.n)
        from jsonb_array_elements(r.trail_snapshot -> 'stops') with ordinality as s (stop, n)
      ), '[]'))
  where r.id = any (p_runs) and r.trail_snapshot is not null;

  update public.trail_runs r
  set details_ciphertext = null,
      details_nonce = null,
      started_at = date_trunc('day', r.started_at, 'UTC'),
      completed_at = date_trunc('day', r.completed_at, 'UTC'),
      abandoned_at = date_trunc('day',
        case when r.completed_at is null and r.abandoned_at is null then r.started_at + interval '30 days'
             else r.abandoned_at end,
        'UTC')
  where r.id = any (p_runs);

  update public.stop_completions c set completed_at = date_trunc('day', c.completed_at, 'UTC')
  where c.run_id = any (p_runs);

  -- A copy of the key held by someone who never joined goes; members' copies keep only the day.
  delete from public.run_keys k
  where k.run_id = any (p_runs) and not private.is_member_of_run(k.run_id, k.user_id);
  update public.run_keys k set created_at = date_trunc('day', k.created_at, 'UTC')
  where k.run_id = any (p_runs);

  delete from public.run_invites i where i.run_id = any (p_runs);
end;
$$;

revoke all on function private.trim_runs(uuid[]) from public, anon, authenticated;

-- Unchanged from 20260930120000, except that every expired run not yet stamped is trimmed first. That set holds only
-- runs whose photos or files are still going, so each call trims little, and trimming twice changes nothing.
create or replace function public.purge_photos(p_photo_ids uuid[])
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

  perform private.trim_runs(array(
    select r.id from public.trail_runs r
    where r.photos_purged_at is null
      and private.photos_expire_at(r.started_at, r.completed_at, r.abandoned_at) <= now()
  ));

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

revoke all on function public.purge_photos(uuid[]) from public, anon, authenticated;
grant execute on function public.purge_photos(uuid[]) to service_role;

-- Runs the purge already stamped get trimmed now.
select private.trim_runs(array(select id from public.trail_runs where photos_purged_at is not null));
