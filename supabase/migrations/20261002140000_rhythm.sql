-- Weekly rhythm (mvp-roadmap.md, stage 9; gamification.md, section 4.3): filled weeks instead of a streak.
--
-- my_rhythm returns the days on which the caller's quests finished, over the last p_weeks weeks (Monday to Sunday,
-- Riga). It reads only what the database already holds, the finish time of a run, rounded to the Riga day: no new
-- location data.
--   * Linked: the couple's finished quests, from quest_points (finish_points > 0). quest_points moves with a relink
--     within 90 days (20261002120000), so the rhythm does too. The caller's Just me quests stay out, so the partner
--     never learns of them.
--   * Not linked: the caller's own finished runs without a couple (solo and Just me).
-- A trimmed run's completed_at is rounded down to the UTC day, which falls on the same Riga day.
--
-- The couple goal is optional: 'weekly' (one walk a week) or 'twice_monthly' (two walks a month). Either partner sets,
-- clears, pauses, or resumes it alone, with no reason asked and no feed item. A paused goal tells the app to show
-- nothing as missed. The goal goes into the relink archive with the totals (20261002180000).
--
-- Access rules:
--   * private.rhythm_goals: no grants at all. Members of the active couple read and write their goal only through
--     rhythm_goal, set_rhythm_goal, and pause_rhythm_goal. An ex and strangers reach nothing.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table private.rhythm_goals (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  goal text not null check (goal in ('weekly', 'twice_monthly')),
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table private.rhythm_goals enable row level security;
revoke all on private.rhythm_goals from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- One row per Riga day with a finished quest, oldest first, from the Monday p_weeks - 1 weeks before this one
-- (p_weeks 1 to 104, default 26). quests counts the quests finished that day.
create function public.my_rhythm(p_weeks int default 26)
returns table (day date, quests int)
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  since date := private.riga_week(now()) - 7 * (greatest(1, least(coalesce(p_weeks, 26), 104)) - 1);
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if couple is not null then
    return query
      select (r.completed_at at time zone 'Europe/Riga')::date as d, count(*)::int
      from public.quest_points q
      join public.trail_runs r on r.id = q.run_id
      where q.couple_id = couple and q.finish_points > 0 and r.completed_at is not null
        and (r.completed_at at time zone 'Europe/Riga')::date >= since
      group by d
      order by d;
  else
    return query
      select (r.completed_at at time zone 'Europe/Riga')::date as d, count(*)::int
      from public.trail_runs r
      join public.trail_run_members m on m.run_id = r.id and m.user_id = me
      where r.couple_id is null and r.completed_at is not null
        and (r.completed_at at time zone 'Europe/Riga')::date >= since
      group by d
      order by d;
  end if;
end;
$$;

-- The couple's goal. No row when the caller is not linked or the couple has no goal.
create function public.rhythm_goal()
returns table (goal text, paused boolean)
language sql stable security definer set search_path = ''
as $$
  select g.goal, g.paused
  from private.rhythm_goals g
  where g.couple_id = private.active_couple_id(auth.uid())
$$;

-- Sets the couple's goal, 'weekly' or 'twice_monthly', unpaused; null clears it. Raises not_linked or goal_invalid.
create function public.set_rhythm_goal(p_goal text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple has a rhythm goal';
  end if;
  if p_goal is null then
    delete from private.rhythm_goals where couple_id = couple;
    return;
  end if;
  if p_goal not in ('weekly', 'twice_monthly') then
    raise exception 'goal_invalid' using errcode = 'P0001', detail = 'p_goal must be weekly, twice_monthly, or null';
  end if;
  insert into private.rhythm_goals (couple_id, goal) values (couple, p_goal)
  on conflict (couple_id) do update set goal = excluded.goal, paused = false, updated_at = now();
end;
$$;

-- Pauses or resumes the couple's goal. Does nothing without a goal. Raises not_linked.
create function public.pause_rhythm_goal(p_paused boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple has a rhythm goal';
  end if;
  update private.rhythm_goals set paused = coalesce(p_paused, false), updated_at = now() where couple_id = couple;
end;
$$;

revoke all on function public.my_rhythm(int) from public, anon;
revoke all on function public.rhythm_goal() from public, anon;
revoke all on function public.set_rhythm_goal(text) from public, anon;
revoke all on function public.pause_rhythm_goal(boolean) from public, anon;
grant execute on function public.my_rhythm(int) to authenticated;
grant execute on function public.rhythm_goal() to authenticated;
grant execute on function public.set_rhythm_goal(text) to authenticated;
grant execute on function public.pause_rhythm_goal(boolean) to authenticated;
