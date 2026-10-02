-- Tester feedback: task votes, quest comments, and app reviews (docs/tester-feedback.md, section 3).
--
-- Removable by design: everything lives in schema tester_feedback, which the Data API does not expose, and the app
-- reaches it only through the four tester_* functions below. Nothing else in the database reads or references it.
-- Removal: drop schema tester_feedback cascade, drop the four functions, and delete
-- supabase/tests/tester_feedback.test.sql (tester-feedback.md, section 4).
--
-- No table records a run, trail, stop, place, partner, or couple. user_id stays for one vote per task, one comment per
-- quest, and erasure; no function returns it and no view shows it. Deleting an account deletes its feedback.
--
-- Access rules:
--   * The tables and views: no grants at all, and no usage on the schema. Edgar reads the views in the dashboard.
--   * tester_vote_task, tester_my_task_votes, tester_send_quest_comment, tester_send_app_review: authenticated only.
--     Each acts for the caller alone; a tester reads only their own votes.

create schema tester_feedback;
revoke all on schema tester_feedback from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table tester_feedback.task_votes (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null check (task_id ~ '^[a-z]+-\d{3}$'),
  vote smallint not null check (vote in (-1, 1)),
  day date not null default (now() at time zone 'Europe/Riga')::date,
  primary key (user_id, task_id)
);

create table tester_feedback.quest_comments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  quest_ref text not null check (quest_ref ~ '^[0-9a-f]{64}$'),
  body text not null check (char_length(body) between 1 and 1000),
  question text check (char_length(question) <= 300),
  mode text not null check (mode in ('together', 'solo')),
  tasks_done int check (tasks_done between 0 and 99),
  app_version text check (char_length(app_version) <= 64),
  day date not null default (now() at time zone 'Europe/Riga')::date
);
create unique index quest_comments_one_per_quest_idx on tester_feedback.quest_comments (user_id, quest_ref);

create table tester_feedback.app_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  overall text check (char_length(overall) <= 1000),
  likes text check (char_length(likes) <= 1000),
  wishes text check (char_length(wishes) <= 1000),
  app_version text check (char_length(app_version) <= 64),
  day date not null default (now() at time zone 'Europe/Riga')::date,
  check (num_nonnulls(overall, likes, wishes) > 0)
);
create index app_reviews_user_day_idx on tester_feedback.app_reviews (user_id, day);
create index quest_comments_user_day_idx on tester_feedback.quest_comments (user_id, day);

alter table tester_feedback.task_votes enable row level security;
alter table tester_feedback.quest_comments enable row level security;
alter table tester_feedback.app_reviews enable row level security;
revoke all on tester_feedback.task_votes from public, anon, authenticated;
revoke all on tester_feedback.quest_comments from public, anon, authenticated;
revoke all on tester_feedback.app_reviews from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Views for Edgar, none showing user_id
-- ---------------------------------------------------------------------------

-- Tasks with at least three voters, so no tester is picked out from a pair of votes.
create view tester_feedback.task_vote_totals as
  select v.task_id,
    count(*) filter (where v.vote = 1)::int as ups,
    count(*) filter (where v.vote = -1)::int as downs,
    sum(v.vote)::int as net,
    count(*)::int as voters
  from tester_feedback.task_votes v
  group by v.task_id
  having count(*) >= 3
  order by net, v.task_id;

create view tester_feedback.quest_comment_feed as
  select c.day, c.mode, c.tasks_done, c.question, c.body
  from tester_feedback.quest_comments c
  order by c.day desc, c.id desc;

create view tester_feedback.app_review_feed as
  select r.day, r.overall, r.likes, r.wishes
  from tester_feedback.app_reviews r
  order by r.day desc, r.id desc;

revoke all on tester_feedback.task_vote_totals from public, anon, authenticated;
revoke all on tester_feedback.quest_comment_feed from public, anon, authenticated;
revoke all on tester_feedback.app_review_feed from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- Trims text; empty becomes null. Raises text_too_long past 1,000 characters.
create function tester_feedback.clean(p_text text, p_max int default 1000)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  t text := nullif(btrim(p_text), '');
begin
  if char_length(t) > p_max then
    raise exception 'text_too_long' using errcode = 'P0001', detail = format('at most %s characters', p_max);
  end if;
  return t;
end;
$$;

-- Raises daily_limit once the caller has sent 20 comments and reviews together today (Riga).
create function tester_feedback.check_daily_limit(p_user uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Riga')::date;
begin
  if (select count(*) from tester_feedback.quest_comments where user_id = p_user and day = today)
     + (select count(*) from tester_feedback.app_reviews where user_id = p_user and day = today) >= 20 then
    raise exception 'daily_limit' using errcode = 'P0001', detail = 'at most 20 comments and reviews a day';
  end if;
end;
$$;

revoke all on function tester_feedback.clean(text, int) from public, anon, authenticated;
revoke all on function tester_feedback.check_daily_limit(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The four functions the app calls
-- ---------------------------------------------------------------------------

-- Casts, switches, or (p_vote 0) clears the caller's vote on a task. Raises task_invalid or vote_invalid.
create function public.tester_vote_task(p_task_id text, p_vote int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_task_id is null or p_task_id !~ '^[a-z]+-\d{3}$' then
    raise exception 'task_invalid' using errcode = 'P0001', detail = 'p_task_id must look like intro-001';
  end if;
  if p_vote is null or p_vote not in (-1, 0, 1) then
    raise exception 'vote_invalid' using errcode = 'P0001', detail = 'p_vote must be -1, 0, or 1';
  end if;
  if p_vote = 0 then
    delete from tester_feedback.task_votes where user_id = me and task_id = p_task_id;
    return;
  end if;
  insert into tester_feedback.task_votes (user_id, task_id, vote) values (me, p_task_id, p_vote)
  on conflict (user_id, task_id) do update
    set vote = excluded.vote, day = (now() at time zone 'Europe/Riga')::date;
end;
$$;

-- The caller's votes among the given tasks. Tasks without a vote have no row.
create function public.tester_my_task_votes(p_task_ids text[])
returns table (task_id text, vote int)
language sql stable security definer set search_path = ''
as $$
  select v.task_id, v.vote::int
  from tester_feedback.task_votes v
  where v.user_id = auth.uid() and v.task_id = any (coalesce(p_task_ids, '{}'))
$$;

-- Sends the caller's one comment on a quest. p_quest_ref is the hex sha256 of the run id followed by the user id,
-- computed on the phone. Raises quest_ref_invalid, mode_invalid, text_empty, text_too_long, already_sent, or
-- daily_limit.
create function public.tester_send_quest_comment(
  p_quest_ref text,
  p_body text,
  p_question text default null,
  p_mode text default 'together',
  p_tasks_done int default null,
  p_app_version text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  body text := tester_feedback.clean(p_body);
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_quest_ref is null or p_quest_ref !~ '^[0-9a-f]{64}$' then
    raise exception 'quest_ref_invalid' using errcode = 'P0001', detail = 'p_quest_ref must be a hex sha256';
  end if;
  if p_mode is null or p_mode not in ('together', 'solo') then
    raise exception 'mode_invalid' using errcode = 'P0001', detail = 'p_mode must be together or solo';
  end if;
  if body is null then
    raise exception 'text_empty' using errcode = 'P0001', detail = 'a comment needs text';
  end if;
  perform tester_feedback.check_daily_limit(me);
  if exists (select 1 from tester_feedback.quest_comments c where c.user_id = me and c.quest_ref = p_quest_ref) then
    raise exception 'already_sent' using errcode = 'P0001', detail = 'one comment per quest';
  end if;
  insert into tester_feedback.quest_comments (user_id, quest_ref, body, question, mode, tasks_done, app_version)
  values (me, p_quest_ref, body, tester_feedback.clean(p_question, 300), p_mode,
    case when p_tasks_done between 0 and 99 then p_tasks_done end, tester_feedback.clean(p_app_version, 64));
end;
$$;

-- Sends a review. Each field is optional, but not all three. Raises text_empty, text_too_long, or daily_limit.
create function public.tester_send_app_review(
  p_overall text default null,
  p_likes text default null,
  p_wishes text default null,
  p_app_version text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  overall text := tester_feedback.clean(p_overall);
  likes text := tester_feedback.clean(p_likes);
  wishes text := tester_feedback.clean(p_wishes);
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if num_nonnulls(overall, likes, wishes) = 0 then
    raise exception 'text_empty' using errcode = 'P0001', detail = 'a review needs text in at least one field';
  end if;
  perform tester_feedback.check_daily_limit(me);
  insert into tester_feedback.app_reviews (user_id, overall, likes, wishes, app_version)
  values (me, overall, likes, wishes, tester_feedback.clean(p_app_version, 64));
end;
$$;

revoke all on function public.tester_vote_task(text, int) from public, anon;
revoke all on function public.tester_my_task_votes(text[]) from public, anon;
revoke all on function public.tester_send_quest_comment(text, text, text, text, int, text) from public, anon;
revoke all on function public.tester_send_app_review(text, text, text, text) from public, anon;
grant execute on function public.tester_vote_task(text, int) to authenticated;
grant execute on function public.tester_my_task_votes(text[]) to authenticated;
grant execute on function public.tester_send_quest_comment(text, text, text, text, int, text) to authenticated;
grant execute on function public.tester_send_app_review(text, text, text, text) to authenticated;
