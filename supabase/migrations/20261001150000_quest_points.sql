-- Points (mvp-roadmap.md, stage 7, points part; gamification.md, section 4.1, without sharing and special quests).
--
-- A couple's quest earns points only from facts the database already holds:
--   * reaching a stop (a stop_completions row, task done or skipped): 10, at most 5 stops (50) per quest;
--   * storing a photo (a photos row, whichever member uploaded it): 5, at most 5 photos (25) per quest;
--   * finishing the quest (completed_at first set): 100, once;
--   * the couple's first finished quest of the week: 30 more. Weeks are ISO weeks, Monday to Sunday, in Riga time.
-- Tasks earn nothing, so skipping one costs nothing. Only couple runs earn points: a Just me or solo run has no couple,
-- so the partner learns nothing about it. Points accrue only while the couple lasts.
--
-- Storage:
--   * quest_points holds one row per couple run that has earned anything, so the weekly leaderboard (stage 8) can take
--     each couple's best three quests per week. week_start is the Monday (Riga) of the week the quest finished in; until
--     it finishes, the week its first point came in. Stop and photo points on a run that never finishes stay: they are
--     server-confirmed walking, and they count toward the lifetime total. The leaderboard decides whether unfinished
--     quests count (finish_points = 0 marks them).
--   * couple_stats.points is the lifetime total, kept in step by the same triggers. Deleting a photo lowers neither.
--   * The week comes from the server clock at the moment the run finishes, not from completed_at, which the client
--     writes: a backdated completed_at cannot claim a past week's bonus.
--
-- Access rules:
--   * quest_points: members of the active couple read their couple's rows; nobody writes them but the triggers.
--   * couple_stats.points: as the rest of couple_stats.
--   * Unlink deletes the couple's quest_points, as it already deletes its couple_stats row.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table public.quest_points (
  run_id uuid primary key references public.trail_runs (id) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  stop_points int not null default 0 check (stop_points between 0 and 50),
  photo_points int not null default 0 check (photo_points between 0 and 25),
  finish_points int not null default 0 check (finish_points in (0, 100)),
  week_bonus int not null default 0 check (week_bonus in (0, 30)),
  total int generated always as (stop_points + photo_points + finish_points + week_bonus) stored,
  updated_at timestamptz not null default now()
);
create index quest_points_couple_week_idx on public.quest_points (couple_id, week_start);

alter table public.quest_points enable row level security;
revoke all on public.quest_points from anon, authenticated;
grant select on public.quest_points to authenticated;

create policy "quest_points: read active couple" on public.quest_points
  for select to authenticated using (couple_id = private.active_couple_id(auth.uid()));

alter table public.couple_stats add column points int not null default 0 check (points >= 0);

-- ---------------------------------------------------------------------------
-- Awarding
-- ---------------------------------------------------------------------------

-- The Monday (Riga) of the ISO week holding the given moment.
create function private.riga_week(p_at timestamptz)
returns date
language sql stable set search_path = ''
as $$
  select date_trunc('week', p_at at time zone 'Europe/Riga')::date
$$;

-- Adds a run's new stops and photos, or its finish, to its quest_points row and to the couple's lifetime total, within
-- the caps. A run without a couple, or whose couple has ended, earns nothing.
--
-- Not yet awarded: sharing a photo (20, needs both partners' approval, which the app does not record yet) and special
-- quests (50, sealed on the phone, so the server cannot confirm one). Each would get its own column here (share_points,
-- special_points, added to total) and its own trigger on the table that records the confirmed fact, calling this
-- function with a new argument.
create function private.award_points(p_run uuid, p_stops int, p_photos int, p_finish boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid;
  this_week date := private.riga_week(now());
  q public.quest_points;
  v_stop int;
  v_photo int;
  v_finish int;
  v_bonus int;
  v_week date;
  gained int;
begin
  select r.couple_id into couple
  from public.trail_runs r
  join public.couples c on c.id = r.couple_id and c.ended_at is null
  where r.id = p_run;
  if couple is null then
    return;
  end if;

  -- Serialise each couple's awards, so two quests finishing at once cannot both take the week's bonus.
  perform pg_advisory_xact_lock(hashtext('quest_points:' || couple::text));

  insert into public.quest_points (run_id, couple_id, week_start)
  values (p_run, couple, this_week)
  on conflict (run_id) do nothing;
  select * into q from public.quest_points where run_id = p_run for update;

  v_stop := least(50, q.stop_points + 10 * p_stops);
  v_photo := least(25, q.photo_points + 5 * p_photos);
  v_finish := q.finish_points;
  v_bonus := q.week_bonus;
  v_week := q.week_start;
  if p_finish and q.finish_points = 0 then
    v_finish := 100;
    v_week := this_week;
    if not exists (
      select 1 from public.quest_points o
      where o.couple_id = couple and o.week_start = this_week and o.finish_points > 0 and o.run_id <> p_run
    ) then
      v_bonus := 30;
    end if;
  end if;

  gained := (v_stop - q.stop_points) + (v_photo - q.photo_points) + (v_finish - q.finish_points)
    + (v_bonus - q.week_bonus);
  if gained = 0 then
    return;
  end if;

  update public.quest_points
  set stop_points = v_stop, photo_points = v_photo, finish_points = v_finish, week_bonus = v_bonus,
      week_start = v_week, updated_at = now()
  where run_id = p_run;

  insert into public.couple_stats as s (couple_id, points)
  values (couple, gained)
  on conflict (couple_id) do update set points = s.points + excluded.points, updated_at = now();
end;
$$;

-- A run finishes once, when completed_at is first set; the trim's rounding of completed_at earns nothing, and
-- award_points pays the finish only once even if completed_at were cleared and set again.
create function private.points_for_quest()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.completed_at is null and new.completed_at is not null and new.couple_id is not null then
    perform private.award_points(new.id, 0, 0, true);
  end if;
  return null;
end;
$$;

create function private.points_for_stop()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.award_points(new.run_id, 1, 0, false);
  return null;
end;
$$;

create function private.points_for_photo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.award_points(new.run_id, 0, 1, false);
  return null;
end;
$$;

revoke all on function private.riga_week(timestamptz) from public, anon, authenticated;
revoke all on function private.award_points(uuid, int, int, boolean) from public, anon, authenticated;
revoke all on function private.points_for_quest() from public, anon, authenticated;
revoke all on function private.points_for_stop() from public, anon, authenticated;
revoke all on function private.points_for_photo() from public, anon, authenticated;

create trigger trail_runs_points_for_quest
  after update of completed_at on public.trail_runs
  for each row execute function private.points_for_quest();
create trigger stop_completions_points_for_stop
  after insert on public.stop_completions
  for each row execute function private.points_for_stop();
create trigger photos_points_for_photo
  after insert on public.photos
  for each row execute function private.points_for_photo();

-- ---------------------------------------------------------------------------
-- unlink: clears the points too
-- ---------------------------------------------------------------------------

-- Unchanged from 20261001141500, except for the last statement: the couple's quest points go with its totals.
create or replace function public.unlink()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    return;
  end if;
  update public.couples set ended_at = now() where id = couple;
  update public.trail_runs set abandoned_at = now()
  where couple_id = couple and completed_at is null and abandoned_at is null;
  delete from public.run_invites i
  using public.trail_runs r
  where r.id = i.run_id and r.couple_id = couple;
  delete from public.couple_stats where couple_id = couple;
  delete from private.couple_names where couple_id = couple;
  delete from public.quest_points where couple_id = couple;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------

-- Every active couple's runs, from history. Photos the retention job already deleted are gone and cannot count. A
-- finished run's week comes from completed_at here, the only record of when it finished; a trimmed run's completed_at
-- is rounded down to the day (UTC), which stays in the same Riga day. An unfinished run takes its start's week.
insert into public.quest_points (run_id, couple_id, week_start, stop_points, photo_points, finish_points, week_bonus)
select h.id, h.couple_id, h.week_start, h.stop_points, h.photo_points, h.finish_points,
  case when h.finished and row_number() over (
    partition by h.couple_id, h.week_start, h.finished order by h.completed_at, h.id
  ) = 1 then 30 else 0 end
from (
  select r.id, r.couple_id, r.completed_at, r.completed_at is not null as finished,
    private.riga_week(coalesce(r.completed_at, r.started_at)) as week_start,
    least(50, 10 * (select count(*) from public.stop_completions s where s.run_id = r.id))::int as stop_points,
    least(25, 5 * (select count(*) from public.photos p where p.run_id = r.id))::int as photo_points,
    case when r.completed_at is not null then 100 else 0 end as finish_points
  from public.trail_runs r
  join public.couples c on c.id = r.couple_id and c.ended_at is null
) h
where h.finished or h.stop_points > 0 or h.photo_points > 0;

insert into public.couple_stats as s (couple_id, points)
select q.couple_id, sum(q.total)::int
from public.quest_points q
group by q.couple_id
on conflict (couple_id) do update set points = excluded.points;
