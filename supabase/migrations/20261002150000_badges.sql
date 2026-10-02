-- Memory badges (mvp-roadmap.md, stage 9; gamification.md, section 4.6): experiences, not effort.
--
-- Fixed ids: first-walk, first-rain-walk, first-after-dark, season-spring, season-summer, season-autumn,
-- season-winter, special-quest. Each is earned at most once per owner:
--   * a couple run's badges belong to its couple, and move with a relink within 90 days as the totals do
--     (20261002180000);
--   * a run without a couple (solo or Just me) earns for its player alone, as task history keys a Just me quest, so the
--     partner never sees it.
-- Badges award no points.
--
-- The phone calls claim_badges(run, badges) when a quest finishes. The server checks that the run is finished and that
-- the caller is a member of it (and, for a couple run, of that couple, still active), then:
--   * first-walk: awarded by the server on every claim, asked for or not, since any finished run is a walk;
--   * season-*: the season comes from the server's date in Riga, meteorological and northern: March to May spring,
--     June to August summer, September to November autumn, December to February winter. A claim for another season
--     earns nothing;
--   * first-after-dark and special-quest: the phone's word is taken, since the sealed run hides what the server would
--     need to check;
--   * first-rain-walk: always refused until live weather exists (Edgar, October 2).
-- A couple badge puts a badge_earned item in the partner's feed when the partner walked that quest too; the claimer
-- sees the badge on their own screen. A badge from a quest the partner did not join, and a solo badge, make no feed
-- item, since either would tell the partner that a walk happened (abuse-threat-model.md, X1).
--
-- Access rules:
--   * private.badges: no grants at all. my_badges lists the caller's active couple's badges and the caller's own solo
--     badges; an ex, a partner (for solo badges), and strangers reach nothing.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table private.badges (
  id bigint generated always as identity primary key,
  couple_id uuid references public.couples (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  badge text not null check (badge in (
    'first-walk', 'first-rain-walk', 'first-after-dark', 'season-spring', 'season-summer', 'season-autumn',
    'season-winter', 'special-quest'
  )),
  earned_on date not null,
  check ((couple_id is null) <> (user_id is null))
);
create unique index badges_couple_idx on private.badges (couple_id, badge) where couple_id is not null;
create unique index badges_user_idx on private.badges (user_id, badge) where user_id is not null;

alter table private.badges enable row level security;
revoke all on private.badges from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- The season badge for a moment, by the month in Riga.
create function private.season_badge(p_at timestamptz)
returns text
language sql stable set search_path = ''
as $$
  select case
    when m in (3, 4, 5) then 'season-spring'
    when m in (6, 7, 8) then 'season-summer'
    when m in (9, 10, 11) then 'season-autumn'
    else 'season-winter'
  end
  from (select extract(month from p_at at time zone 'Europe/Riga')::int as m) s
$$;

revoke all on function private.season_badge(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Claims badges for a finished run the caller walked. Returns the badges newly earned, in the order of the fixed list;
-- one already earned, refused, or for another season is left out. Raises badge_unknown for an id outside the list,
-- run_not_finished for a run that is open or abandoned, and not_member when the caller is not a member of the run, or
-- the run's couple is not the caller's active couple.
create function public.claim_badges(p_run uuid, p_badges text[] default '{}')
returns text[]
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  run public.trail_runs;
  owner_couple uuid;
  owner_user uuid;
  today date := (now() at time zone 'Europe/Riga')::date;
  wanted text[];
  earned text[] := '{}';
  b text;
  all_badges constant text[] := array[
    'first-walk', 'first-rain-walk', 'first-after-dark', 'season-spring', 'season-summer', 'season-autumn',
    'season-winter', 'special-quest'
  ];
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_badges, '{}')) x where not (x = any (all_badges))) then
    raise exception 'badge_unknown' using errcode = 'P0001', detail = 'p_badges holds an id outside the fixed list';
  end if;

  select * into run from public.trail_runs where id = p_run;
  if run.id is null or not private.is_member_of_run(p_run, me) then
    raise exception 'not_member' using errcode = 'P0001', detail = 'the caller did not walk this run';
  end if;
  if run.completed_at is null then
    raise exception 'run_not_finished' using errcode = 'P0001', detail = 'badges come with a finished run';
  end if;
  if run.couple_id is not null then
    if run.couple_id is distinct from private.active_couple_id(me) then
      raise exception 'not_member' using errcode = 'P0001', detail = 'the run belongs to a couple that has ended';
    end if;
    owner_couple := run.couple_id;
    perform pg_advisory_xact_lock(hashtext('badges:' || owner_couple::text));
  else
    owner_user := me;
  end if;

  -- first-walk always; the current season only; the phone's word for the two it alone can know.
  wanted := array['first-walk'];
  foreach b in array coalesce(p_badges, '{}') loop
    if b = private.season_badge(now()) or b in ('first-after-dark', 'special-quest') then
      wanted := wanted || b;
    end if;
  end loop;

  foreach b in array all_badges loop
    if b = any (wanted) then
      insert into private.badges (couple_id, user_id, badge, earned_on)
      values (owner_couple, owner_user, b, today)
      on conflict do nothing;
      if found then
        earned := earned || b;
        if owner_couple is not null and private.is_member_of_run(p_run, private.partner_of(me)) then
          perform private.feed_push(private.partner_of(me), 'badge_earned', jsonb_build_object('badge', b));
        end if;
      end if;
    end if;
  end loop;
  return earned;
end;
$$;

-- The caller's badges, oldest first: the active couple's (scope 'couple') and the caller's own solo ones ('solo').
create function public.my_badges()
returns table (badge text, earned_on date, scope text)
language sql stable security definer set search_path = ''
as $$
  select b.badge, b.earned_on, case when b.couple_id is null then 'solo' else 'couple' end
  from private.badges b
  where b.couple_id = private.active_couple_id(auth.uid()) or b.user_id = auth.uid()
  order by b.earned_on, b.id
$$;

revoke all on function public.claim_badges(uuid, text[]) from public, anon;
revoke all on function public.my_badges() from public, anon;
grant execute on function public.claim_badges(uuid, text[]) to authenticated;
grant execute on function public.my_badges() to authenticated;
