-- Relinking restores a couple's past (mvp-roadmap.md, stage 6: "progress survives a relink").
--
-- Unlink used to delete the couple's totals, points, name, and leaderboard opt-in. It now moves them into an archive
-- keyed by the two people (least and greatest user id) and stamped with the unlink time. When the same two people link
-- again within 90 days, a trigger on couple_members moves the archive onto the new couple and deletes it:
--   * couple_stats: quests done, photos taken, challenges done, points;
--   * quest_points: one row per quest, so the weekly leaderboard keeps this week's quests;
--   * the agreed name and any open proposal;
--   * both partners' leaderboard yes (a couple that had opted in is in again, and either partner leaves alone);
--   * this week's league seat, only when the relink falls in the same Riga week as the unlink.
-- Runs stay with the old couple, as before: their members, photos, and keys never depended on the couple.
--
-- A partner who links with someone else gets nothing from the archive: it belongs to the pair. It waits for that pair
-- until 90 days after the unlink, then goes. Nothing in the repo runs pg_cron, so the purge is opportunistic: every
-- unlink and every link deletes every archive older than 90 days, and a restore checks the age itself, so an expired
-- archive never comes back even before the purge reaches it. Deleting either account deletes the archive with it.
--
-- The archive holds what the couple's members already read, and nothing more: totals, never "who completed" (M2), and
-- no start, path, or position (private-trails.md). The names of the leaderboard yeses are kept only to restore them.
--
-- Access rules:
--   * private.couple_archives, private.archived_quest_points: no grants at all. Nobody reads them, the people they
--     belong to included; only unlink and the link trigger, which run as the owner, touch them.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table private.couple_archives (
  user_lo uuid not null references public.profiles (id) on delete cascade,
  user_hi uuid not null references public.profiles (id) on delete cascade,
  unlinked_at timestamptz not null default now(),
  quests_done int not null default 0,
  photos_taken int not null default 0,
  challenges_done int not null default 0,
  points int not null default 0,
  name text,
  proposal text,
  proposed_by uuid references public.profiles (id) on delete set null,
  yes_lo boolean not null default false,
  yes_hi boolean not null default false,
  seat_week date,
  seat_league int,
  primary key (user_lo, user_hi),
  check (user_lo < user_hi)
);
create index couple_archives_unlinked_at_idx on private.couple_archives (unlinked_at);

create table private.archived_quest_points (
  run_id uuid primary key references public.trail_runs (id) on delete cascade,
  user_lo uuid not null,
  user_hi uuid not null,
  week_start date not null,
  stop_points int not null,
  photo_points int not null,
  finish_points int not null,
  week_bonus int not null,
  updated_at timestamptz not null,
  foreign key (user_lo, user_hi) references private.couple_archives (user_lo, user_hi) on delete cascade
);
create index archived_quest_points_pair_idx on private.archived_quest_points (user_lo, user_hi);

alter table private.couple_archives enable row level security;
alter table private.archived_quest_points enable row level security;
revoke all on private.couple_archives from public, anon, authenticated;
revoke all on private.archived_quest_points from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purge and restore
-- ---------------------------------------------------------------------------

-- Deletes every archive older than 90 days, with its quest points.
create function private.purge_couple_archives()
returns void
language sql security definer set search_path = ''
as $$
  delete from private.couple_archives where unlinked_at <= now() - interval '90 days'
$$;

-- Moves the pair's archive, if one is younger than 90 days, onto the new couple, then deletes it. The new couple has
-- nothing yet, so the inserts never meet a row; they add on conflict all the same.
create function private.restore_couple(p_couple uuid, p_lo uuid, p_hi uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a private.couple_archives;
begin
  perform private.purge_couple_archives();

  select * into a from private.couple_archives
  where user_lo = p_lo and user_hi = p_hi and unlinked_at > now() - interval '90 days'
  for update;
  if a.user_lo is null then
    return;
  end if;

  if a.quests_done + a.photos_taken + a.challenges_done + a.points > 0 then
    insert into public.couple_stats as s (couple_id, quests_done, photos_taken, challenges_done, points)
    values (p_couple, a.quests_done, a.photos_taken, a.challenges_done, a.points)
    on conflict (couple_id) do update set
      quests_done = s.quests_done + excluded.quests_done,
      photos_taken = s.photos_taken + excluded.photos_taken,
      challenges_done = s.challenges_done + excluded.challenges_done,
      points = s.points + excluded.points,
      updated_at = now();
  end if;

  insert into public.quest_points (run_id, couple_id, week_start, stop_points, photo_points, finish_points, week_bonus,
    updated_at)
  select q.run_id, p_couple, q.week_start, q.stop_points, q.photo_points, q.finish_points, q.week_bonus, q.updated_at
  from private.archived_quest_points q
  where q.user_lo = p_lo and q.user_hi = p_hi
  on conflict (run_id) do nothing;

  if a.name is not null or a.proposal is not null then
    insert into private.couple_names (couple_id, name, proposal, proposed_by)
    values (p_couple, a.name, a.proposal, case when a.proposal is not null then a.proposed_by end)
    on conflict (couple_id) do nothing;
  end if;

  insert into private.leaderboard_yes (couple_id, user_id)
  select p_couple, y.user_id
  from (values (p_lo, a.yes_lo), (p_hi, a.yes_hi)) y (user_id, said_yes)
  where y.said_yes
  on conflict do nothing;

  if a.seat_week = private.riga_week(now())
     and exists (select 1 from private.league_weeks w where w.week_start = a.seat_week) then
    insert into private.league_seats (week_start, couple_id, league)
    values (a.seat_week, p_couple, a.seat_league)
    on conflict do nothing;
  end if;

  delete from private.couple_archives where user_lo = p_lo and user_hi = p_hi;
end;
$$;

-- Runs once per statement that adds couple members, so a couple inserted with both members in one statement restores
-- once. Each new couple with two members, still active, gets its pair's archive.
create function private.restore_on_link()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  for c in
    select m.couple_id, min(m.user_id::text)::uuid as lo, max(m.user_id::text)::uuid as hi
    from public.couple_members m
    join public.couples k on k.id = m.couple_id and k.ended_at is null
    where m.couple_id in (select distinct n.couple_id from added n)
    group by m.couple_id
    having count(*) = 2
  loop
    perform private.restore_couple(c.couple_id, c.lo, c.hi);
  end loop;
  return null;
end;
$$;

revoke all on function private.purge_couple_archives() from public, anon, authenticated;
revoke all on function private.restore_couple(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.restore_on_link() from public, anon, authenticated;

create trigger couple_members_restore_on_link
  after insert on public.couple_members
  referencing new table as added
  for each statement execute function private.restore_on_link();

-- ---------------------------------------------------------------------------
-- unlink: archives instead of deleting
-- ---------------------------------------------------------------------------

-- Unchanged from 20261001160000, except that the couple's totals, points, name, opt-in, and this week's seat go into
-- the pair's archive before they are deleted, and that it locks the two people as linking does, so two unlinks at once
-- archive once.
create or replace function public.unlink()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
  lo uuid;
  hi uuid;
  this_week date := private.riga_week(now());
begin
  if couple is null then
    return;
  end if;

  select min(m.user_id::text)::uuid, max(m.user_id::text)::uuid into lo, hi
  from public.couple_members m where m.couple_id = couple;
  perform pg_advisory_xact_lock(hashtext(lo::text));
  perform pg_advisory_xact_lock(hashtext(hi::text));
  if exists (select 1 from public.couples where id = couple and ended_at is not null) then
    return;
  end if;

  update public.couples set ended_at = now() where id = couple;
  update public.trail_runs set abandoned_at = now()
  where couple_id = couple and completed_at is null and abandoned_at is null;
  delete from public.run_invites i
  using public.trail_runs r
  where r.id = i.run_id and r.couple_id = couple;

  perform private.purge_couple_archives();
  if lo <> hi then
    delete from private.couple_archives where user_lo = lo and user_hi = hi;
    insert into private.couple_archives (user_lo, user_hi, quests_done, photos_taken, challenges_done, points, name,
      proposal, proposed_by, yes_lo, yes_hi, seat_week, seat_league)
    select lo, hi,
      coalesce(s.quests_done, 0), coalesce(s.photos_taken, 0), coalesce(s.challenges_done, 0), coalesce(s.points, 0),
      n.name, n.proposal, n.proposed_by,
      exists (select 1 from private.leaderboard_yes y where y.couple_id = couple and y.user_id = lo),
      exists (select 1 from private.leaderboard_yes y where y.couple_id = couple and y.user_id = hi),
      seat.week_start, seat.league
    from (select 1) one
    left join public.couple_stats s on s.couple_id = couple
    left join private.couple_names n on n.couple_id = couple
    left join private.league_seats seat on seat.couple_id = couple and seat.week_start = this_week;
    insert into private.archived_quest_points (run_id, user_lo, user_hi, week_start, stop_points, photo_points,
      finish_points, week_bonus, updated_at)
    select q.run_id, lo, hi, q.week_start, q.stop_points, q.photo_points, q.finish_points, q.week_bonus, q.updated_at
    from public.quest_points q
    where q.couple_id = couple;
  end if;

  delete from public.couple_stats where couple_id = couple;
  delete from private.couple_names where couple_id = couple;
  delete from public.quest_points where couple_id = couple;
  delete from private.leaderboard_yes where couple_id = couple;
  delete from private.league_seats where couple_id = couple;
end;
$$;
