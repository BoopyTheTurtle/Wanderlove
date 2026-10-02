-- Weekly leaderboard (mvp-roadmap.md, stage 8; gamification.md, section 4.7; abuse-threat-model.md, M4).
--
-- Joining: opt-in, and both partners must say yes. join_leaderboard records the caller's yes; once both have said
-- yes the couple is in. Either partner's leave_leaderboard takes the couple out at once and clears both yeses, so
-- returning needs both again. Unlinking does the same. A couple in the league shows on boards only while it has a
-- name: joining without one is allowed (leaderboard_status says needs_name), and clearing the name hides the couple
-- until it is named again.
--
-- Weekly points: the sum of the couple's best three finished quests (quest_points.total, finish_points > 0) whose
-- week_start is the current week, Monday to Sunday in Riga. A new week starts everyone at zero; nothing resets.
--
-- Leagues: about 30 couples, drawn at random each week, with no cron job.
--   * The first my_league call of a week fixes the week's league count: one league per started 30 listed couples
--     (ceil(n / 30), at least 1), so 30 couples share one league and 31 split into two. It stores the count in
--     private.league_weeks and seats every listed couple in private.league_seats: couples ordered by
--     md5(couple id || week) are dealt round-robin into the leagues, which gives each week a fresh draw that no client
--     can steer and leagues whose sizes differ by at most one.
--   * A couple listed later in the week (joined, or named, after the draw) takes a seat in the league with the fewest
--     seats, lowest league number on a tie, at the next my_league call by anyone. The count stays fixed for the week,
--     so a busy week can grow its leagues past 30; the next week's draw evens them out.
--   * A seat lasts the week. Leaving or unlinking deletes it; clearing the name keeps it, so renaming returns the
--     couple to the same league. The first call of a new week deletes every older week's rows.
--   * There is no promotion or demotion.
--
-- What a member sees: my_league() returns their couple's league for the current week and nothing else: each listed
-- couple's name and weekly points, is_me on their own row, their band (top, middle, or bottom third), and the
-- league's finished quests this week for a collective line. No couple or user ids, no avatars, no past weeks, no
-- search, no other league. A couple not listed, or not linked, gets no rows.
--
-- Access rules:
--   * private.leaderboard_yes, private.league_weeks, private.league_seats: no grants at all. Members reach them only
--     through join_leaderboard, leave_leaderboard, leaderboard_status, and my_league, which act on the caller's active
--     couple. Strangers, couples in other leagues, and anon learn nothing.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- One row per partner who said yes. The couple is in the league when both rows exist.
create table private.leaderboard_yes (
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

-- The league count of each week, fixed by the week's first my_league call.
create table private.league_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  league_count int not null check (league_count >= 1),
  created_at timestamptz not null default now()
);

-- Each listed couple's league for the week, numbered from 0.
create table private.league_seats (
  week_start date not null references private.league_weeks (week_start) on delete cascade,
  couple_id uuid not null references public.couples (id) on delete cascade,
  league int not null check (league >= 0),
  primary key (week_start, couple_id)
);
create index league_seats_league_idx on private.league_seats (week_start, league);

alter table private.leaderboard_yes enable row level security;
alter table private.league_weeks enable row level security;
alter table private.league_seats enable row level security;
revoke all on private.leaderboard_yes from public, anon, authenticated;
revoke all on private.league_weeks from public, anon, authenticated;
revoke all on private.league_seats from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- The couples a board may show: active, both partners said yes, and named.
create function private.listed_couples()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select y.couple_id
  from private.leaderboard_yes y
  join public.couples c on c.id = y.couple_id and c.ended_at is null
  join private.couple_names n on n.couple_id = y.couple_id and n.name is not null
  group by y.couple_id
  having count(*) = 2
$$;

-- A couple's points for the week: its best three finished quests.
create function private.weekly_points(p_couple uuid, p_week date)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(t.total), 0)::int
  from (
    select q.total
    from public.quest_points q
    where q.couple_id = p_couple and q.week_start = p_week and q.finish_points > 0
    order by q.total desc
    limit 3
  ) t
$$;

-- Fixes the week's league count on its first call, deletes older weeks, and seats every listed couple that has no
-- seat yet. See the header for the method.
create function private.seat_couples(p_week date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  k int;
  c uuid;
begin
  -- Most calls find the week drawn and every listed couple seated, and need no lock.
  if exists (select 1 from private.league_weeks where week_start = p_week)
     and not exists (
       select 1 from private.listed_couples() l (couple_id)
       where not exists (select 1 from private.league_seats s where s.week_start = p_week and s.couple_id = l.couple_id)
     ) then
    return;
  end if;

  -- Serialise the draw and the seating, so two first calls cannot draw twice or seat a couple in two leagues.
  perform pg_advisory_xact_lock(hashtext('leaderboard:seats'));

  if not exists (select 1 from private.league_weeks where week_start = p_week) then
    delete from private.league_weeks where week_start < p_week;
    select greatest(1, ceil(count(*) / 30.0))::int into k from private.listed_couples();
    insert into private.league_weeks (week_start, league_count) values (p_week, k);
    insert into private.league_seats (week_start, couple_id, league)
    select p_week, l.couple_id,
      ((row_number() over (order by md5(l.couple_id::text || p_week::text), l.couple_id) - 1) % k)::int
    from private.listed_couples() l (couple_id);
    return;
  end if;

  select w.league_count into k from private.league_weeks w where w.week_start = p_week;
  for c in
    select l.couple_id from private.listed_couples() l (couple_id)
    where not exists (select 1 from private.league_seats s where s.week_start = p_week and s.couple_id = l.couple_id)
    order by md5(l.couple_id::text || p_week::text), l.couple_id
  loop
    insert into private.league_seats (week_start, couple_id, league)
    select p_week, c, g.league
    from generate_series(0, k - 1) g (league)
    order by (select count(*) from private.league_seats s where s.week_start = p_week and s.league = g.league),
      g.league
    limit 1;
  end loop;
end;
$$;

-- The board a couple sees for a week: one row per listed couple in its league, best first, ties by name. Empty when
-- the couple is not listed or has no seat that week. my_band is the couple's band by rank (couples tied on points
-- share a band): the first third of positions is the top third. league_quests counts every finished quest of the
-- league's listed couples that week.
create function private.league_board(p_couple uuid, p_week date)
returns table (couple_name text, weekly_points int, is_me boolean, my_band text, league_quests int)
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select s.league
    from private.league_seats s
    where s.week_start = p_week and s.couple_id = p_couple
      and s.couple_id in (select private.listed_couples())
  ),
  board as (
    select s.couple_id, n.name, private.weekly_points(s.couple_id, p_week) as points
    from private.league_seats s
    join mine on mine.league = s.league
    join private.couple_names n on n.couple_id = s.couple_id
    where s.week_start = p_week and s.couple_id in (select private.listed_couples())
  ),
  ranked as (
    select b.*, rank() over (order by b.points desc) as pos, count(*) over () as size from board b
  ),
  me as (
    select case ((r.pos - 1) * 3 / r.size)
      when 0 then 'top third' when 1 then 'middle third' else 'bottom third' end as band
    from ranked r where r.couple_id = p_couple
  ),
  quests as (
    select count(*)::int as n
    from public.quest_points q
    where q.week_start = p_week and q.finish_points > 0 and q.couple_id in (select b.couple_id from board b)
  )
  select r.name, r.points, r.couple_id = p_couple, me.band, quests.n
  from ranked r cross join me cross join quests
  order by r.points desc, r.name, r.couple_id
$$;

revoke all on function private.listed_couples() from public, anon, authenticated;
revoke all on function private.weekly_points(uuid, date) from public, anon, authenticated;
revoke all on function private.seat_couples(date) from public, anon, authenticated;
revoke all on function private.league_board(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Records the caller's yes. Returns 'joined' once both partners have said yes, else 'waiting'. Raises not_linked.
create function public.join_leaderboard()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple joins the leaderboard';
  end if;
  insert into private.leaderboard_yes (couple_id, user_id) values (couple, me) on conflict do nothing;
  if (select count(*) from private.leaderboard_yes where couple_id = couple) = 2 then
    return 'joined';
  end if;
  return 'waiting';
end;
$$;

-- Takes the caller's couple out at once: both yeses and this week's seat go. Either partner may, alone. Does nothing
-- when the caller is not linked.
create function public.leave_leaderboard()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    return;
  end if;
  delete from private.leaderboard_yes where couple_id = couple;
  delete from private.league_seats where couple_id = couple;
end;
$$;

-- The caller's couple's standing. No row when the caller is not linked. in_league: both partners said yes.
-- needs_name: the couple has no name, so boards do not show it.
create function public.leaderboard_status()
returns table (in_league boolean, my_yes boolean, partner_yes boolean, needs_name boolean)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*) from private.leaderboard_yes y where y.couple_id = c.id) = 2,
    exists (select 1 from private.leaderboard_yes y where y.couple_id = c.id and y.user_id = auth.uid()),
    exists (select 1 from private.leaderboard_yes y where y.couple_id = c.id and y.user_id <> auth.uid()),
    not exists (select 1 from private.couple_names n where n.couple_id = c.id and n.name is not null)
  from public.couples c
  where c.id = private.active_couple_id(auth.uid())
$$;

-- The caller's league this week, best first (see private.league_board). Seats newly listed couples first, so it
-- writes and is volatile.
create function public.my_league()
returns table (couple_name text, weekly_points int, is_me boolean, my_band text, league_quests int)
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
  this_week date := private.riga_week(now());
begin
  if couple is null then
    return;
  end if;
  perform private.seat_couples(this_week);
  return query select * from private.league_board(couple, this_week);
end;
$$;

revoke all on function public.join_leaderboard() from public, anon;
revoke all on function public.leave_leaderboard() from public, anon;
revoke all on function public.leaderboard_status() from public, anon;
revoke all on function public.my_league() from public, anon;
grant execute on function public.join_leaderboard() to authenticated;
grant execute on function public.leave_leaderboard() to authenticated;
grant execute on function public.leaderboard_status() to authenticated;
grant execute on function public.my_league() to authenticated;

-- ---------------------------------------------------------------------------
-- unlink: leaves the leaderboard too
-- ---------------------------------------------------------------------------

-- Unchanged from 20261001150000, except for the last two statements: the couple leaves the leaderboard at once.
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
  delete from private.leaderboard_yes where couple_id = couple;
  delete from private.league_seats where couple_id = couple;
end;
$$;
