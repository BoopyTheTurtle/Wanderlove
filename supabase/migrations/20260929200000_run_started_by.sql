-- Records who started each run, so the partner's phone can say "Daniel started …" and the starter's other devices
-- don't announce their own start as the partner's. Runs from before this migration keep a null.

alter table public.trail_runs
  add column started_by uuid references public.profiles (id) on delete set null;

-- Unchanged from the initial schema except that the new run records the caller in started_by. Members read the column
-- through the existing table-wide select grant; the update grant covers only completed_at and abandoned_at, so nobody
-- can change it afterwards.
create or replace function public.start_run(p_trail_id text, p_snapshot jsonb)
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

  insert into public.trail_runs (couple_id, trail_id, trail_snapshot, started_by)
  values (couple, p_trail_id, p_snapshot, me)
  returning id into run;

  insert into public.trail_run_members (run_id, user_id)
  select run, me
  union
  select run, user_id from public.couple_members where couple_id = couple;

  return run;
end;
$$;
