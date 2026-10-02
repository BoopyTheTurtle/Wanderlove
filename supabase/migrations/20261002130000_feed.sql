-- The in-app feed (mvp-roadmap.md, stage 10; gamification.md, sections 4.7 and 4.9).
--
-- One row per recipient and event. Only security-definer code writes rows: the league item below, and the badge,
-- planned walk, and share RPCs in later migrations, all through private.feed_push. Clients read and mark their own rows
-- through my_feed, feed_unread_count, and mark_feed_read.
--
-- The feed shows only what the partner sent on purpose, or what the couple earned together: never that the partner
-- started, finished, or reached anything (abuse-threat-model.md, X1). A quest invitation already reaches the partner
-- through run_invites, and a Just me quest makes no item at all.
--
-- Kinds:
--   * badge_earned: the couple earned a memory badge on a quest the recipient walked too (20261002150000).
--   * league_week_started: a new league week began. Made lazily, at the recipient's first feed read in the week, for a
--     couple both of whose yeses predate the week's start (Monday 00:00, Riga), so joining mid-week announces nothing.
--   * walk_planned, walk_plan_cancelled: the partner planned or cancelled the next walk (20261002160000).
--   * share_requested, share_answered: a photo share was proposed to, or answered for, the recipient (20261002170000).
--
-- Payloads stay minimal and never hold a trail name, stop name, place, position, or anything sealed: a check
-- constraint allows only the keys badge, day, slot, week, share_id, and answer.
--
-- Nothing repeats (X2): a planned walk keeps at most one unread walk item per recipient, and a share proposal makes
-- one share_requested item.
--
-- Items older than 90 days go at the recipient's next feed read. An unlink leaves the feed alone.
--
-- Access rules:
--   * private.feed_items: no grants at all. A member reads and marks only their own items, through the RPCs; the
--     partner and strangers reach nothing.

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

create table private.feed_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'badge_earned', 'league_week_started', 'walk_planned', 'walk_plan_cancelled', 'share_requested', 'share_answered'
  )),
  payload jsonb not null default '{}'
    check (jsonb_typeof(payload) = 'object')
    check (payload - array['badge', 'day', 'slot', 'week', 'share_id', 'answer'] = '{}'::jsonb),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index feed_items_user_idx on private.feed_items (user_id, created_at desc);
-- One league_week_started item per person and week.
create unique index feed_items_league_week_idx on private.feed_items (user_id, (payload ->> 'week'))
  where kind = 'league_week_started';

alter table private.feed_items enable row level security;
revoke all on private.feed_items from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- Puts one item in a person's feed. A null recipient adds nothing.
create function private.feed_push(p_user uuid, p_kind text, p_payload jsonb default '{}')
returns void
language sql security definer set search_path = ''
as $$
  insert into private.feed_items (user_id, kind, payload)
  select p_user, p_kind, coalesce(p_payload, '{}')
  where p_user is not null
$$;

-- The other member of a person's active couple, or null.
create function private.partner_of(p_user uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select cm.user_id
  from public.couple_members cm
  where cm.couple_id = private.active_couple_id(p_user) and cm.user_id <> p_user
  limit 1
$$;

-- Adds this week's league_week_started item for a person in the league since before the week began.
create function private.feed_league_week(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(p_user);
  this_week date := private.riga_week(now());
  week_began timestamptz := (private.riga_week(now())::timestamp at time zone 'Europe/Riga');
begin
  if couple is null then
    return;
  end if;
  if (select count(*) from private.leaderboard_yes y where y.couple_id = couple and y.created_at < week_began) < 2 then
    return;
  end if;
  insert into private.feed_items (user_id, kind, payload)
  values (p_user, 'league_week_started', jsonb_build_object('week', this_week))
  on conflict do nothing;
end;
$$;

revoke all on function private.feed_push(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.partner_of(uuid) from public, anon, authenticated;
revoke all on function private.feed_league_week(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- The caller's newest items first, at most p_limit (1 to 100, default 50). Adds this week's league item first, and
-- deletes the caller's items older than 90 days, so it writes and is volatile.
create function public.my_feed(p_limit int default 50)
returns table (id bigint, kind text, payload jsonb, created_at timestamptz, read_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from private.feed_items f where f.user_id = me and f.created_at < now() - interval '90 days';
  perform private.feed_league_week(me);
  return query
    select f.id, f.kind, f.payload, f.created_at, f.read_at
    from private.feed_items f
    where f.user_id = me
    order by f.created_at desc, f.id desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

-- How many of the caller's items are unread. Adds this week's league item first, as my_feed does.
create function public.feed_unread_count()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform private.feed_league_week(me);
  return (
    select count(*)::int from private.feed_items f
    where f.user_id = me and f.read_at is null and f.created_at >= now() - interval '90 days'
  );
end;
$$;

-- Marks the caller's given items read, or all of them when p_ids is null. Other people's ids are ignored. Returns how
-- many items changed.
create function public.mark_feed_read(p_ids bigint[] default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update private.feed_items f set read_at = now()
  where f.user_id = me and f.read_at is null and (p_ids is null or f.id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.my_feed(int) from public, anon;
revoke all on function public.feed_unread_count() from public, anon;
revoke all on function public.mark_feed_read(bigint[]) from public, anon;
grant execute on function public.my_feed(int) to authenticated;
grant execute on function public.feed_unread_count() to authenticated;
grant execute on function public.mark_feed_read(bigint[]) to authenticated;
