-- Run members may add photos for 24 hours after a run finishes, so a partner can still add theirs at the last stop
-- (the run finishes the moment the last stop is done) or later that day. Abandoned runs take no photos, and stop
-- completions still need an open run.

create function private.can_add_photo(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trail_runs
    where id = p_run
      and abandoned_at is null
      and (completed_at is null or completed_at > now() - interval '24 hours')
  )
$$;

revoke all on function private.can_add_photo(uuid) from public, anon;
grant execute on function private.can_add_photo(uuid) to authenticated;

drop policy "photos: insert as member" on public.photos;
create policy "photos: insert as member" on public.photos
  for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and private.is_run_member(run_id)
    and private.can_add_photo(run_id)
    and private.run_has_stop(run_id, stop_id)
  );

drop policy "photos bucket: upload to own active run" on storage.objects;
create policy "photos bucket: upload to own run" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and private.is_run_member(private.run_id_from_path(name))
    and private.can_add_photo(private.run_id_from_path(name))
  );
