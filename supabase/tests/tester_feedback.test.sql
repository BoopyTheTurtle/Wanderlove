begin;
select * from no_plan();

-- Fixtures: testers A and B are a couple; S is a stranger. V1 to V3 are further voters for the three-voter threshold.
insert into auth.users (id, email) values
  ('7e57e570-0000-0000-0000-00000000000a', 'a@test.local'),
  ('7e57e570-0000-0000-0000-00000000000b', 'b@test.local'),
  ('7e57e570-0000-0000-0000-000000000005', 's@test.local'),
  ('7e57e570-0000-0000-0000-000000000001', 'v1@test.local'),
  ('7e57e570-0000-0000-0000-000000000002', 'v2@test.local'),
  ('7e57e570-0000-0000-0000-000000000003', 'v3@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('7e57e570-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab'));
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b'));

create function pg_temp.votes(variadic p_tasks text[]) returns text language sql as $$
  select coalesce(string_agg(format('%s:%s', task_id, vote), ',' order by task_id), '')
  from public.tester_my_task_votes(p_tasks)
$$;

-- A hex sha256, as the phone sends for a quest.
create function pg_temp.ref(p_seed text) returns text language sql as $$
  select encode(sha256(convert_to(p_seed, 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- 1. Votes: cast, switch, clear; each reads only their own
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select lives_ok($$ select public.tester_vote_task('intro-001', 1) $$, 'A votes a task up');
select lives_ok($$ select public.tester_vote_task('silly-002', -1) $$, 'and another down');
select is(pg_temp.votes('intro-001', 'silly-002', 'deep-003'), 'intro-001:1,silly-002:-1', 'A reads both votes');
select lives_ok($$ select public.tester_vote_task('intro-001', -1) $$, 'A switches a vote');
select is(pg_temp.votes('intro-001'), 'intro-001:-1', 'and the switch holds');
select lives_ok($$ select public.tester_vote_task('intro-001', 0) $$, 'A clears it');
select is(pg_temp.votes('intro-001', 'silly-002'), 'silly-002:-1', 'and it is gone');
select lives_ok($$ select public.tester_vote_task('intro-001', 0) $$, 'clearing twice is fine');
select throws_ok($$ select public.tester_vote_task('Intro 1', 1) $$, 'P0001', 'task_invalid', 'a malformed task id is refused');
select throws_ok($$ select public.tester_vote_task('intro-001', 2) $$, 'P0001', 'vote_invalid', 'so is a vote of 2');

select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.votes('intro-001', 'silly-002'), '', 'B, the partner, never sees A''s votes');
select lives_ok($$ select public.tester_vote_task('silly-002', 1) $$, 'B votes apart');
select pg_temp.login(pg_temp.u('5'));
select is(pg_temp.votes('intro-001', 'silly-002'), '', 'the stranger sees no one''s votes');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.votes('silly-002'), 'silly-002:-1', 'B''s vote leaves A''s alone');

-- ---------------------------------------------------------------------------
-- 2. Comments: one per quest, trimmed, within limits
-- ---------------------------------------------------------------------------

select lives_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q1'), '  Loved stop two.  ',
  'Which moment would you repeat?', 'together', 5, '0.1.0') $$, 'A comments on a quest');
select throws_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q1'), 'Again', null, 'together') $$,
  'P0001', 'already_sent', 'a second comment on the same quest is refused');
select throws_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q2'), '   ') $$,
  'P0001', 'text_empty', 'an empty comment is refused');
select throws_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q2'), repeat('x', 1001)) $$,
  'P0001', 'text_too_long', 'so is one over 1,000 characters');
select lives_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q2'), repeat('x', 1000), null, 'solo') $$,
  '1,000 characters is fine');
select throws_ok($$ select public.tester_send_quest_comment('run-123', 'Hi') $$,
  'P0001', 'quest_ref_invalid', 'a quest reference that is not a hash is refused');
select throws_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q3'), 'Hi', null, 'duo') $$,
  'P0001', 'mode_invalid', 'so is an unknown mode');
select pg_temp.login(pg_temp.u('b'));
select lives_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q1'), 'Mine too') $$,
  'B sends B''s own comment on a quest of the same reference');

-- ---------------------------------------------------------------------------
-- 3. Reviews
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select public.tester_send_app_review(' ', null, '') $$, 'P0001', 'text_empty',
  'a review with every field empty is refused');
select lives_ok($$ select public.tester_send_app_review(null, 'The map', null, '0.1.0') $$, 'one field is enough');
select lives_ok($$ select public.tester_send_app_review('Good', 'The map', 'More tasks') $$, 'and another review');
select throws_ok($$ select public.tester_send_app_review(repeat('x', 1001)) $$, 'P0001', 'text_too_long',
  'a field over 1,000 characters is refused');

-- A has sent two comments and two reviews today: sixteen more reach the limit of twenty.
select lives_ok($$ select public.tester_send_app_review('r' || g) from generate_series(1, 16) g $$, 'sixteen more pass');
select throws_ok($$ select public.tester_send_app_review('one too many') $$, 'P0001', 'daily_limit',
  'the twenty-first today is refused');
select throws_ok($$ select public.tester_send_quest_comment(pg_temp.ref('q9'), 'Hi') $$, 'P0001', 'daily_limit',
  'comments count toward the same limit');

-- ---------------------------------------------------------------------------
-- 4. Nobody reads the tables or views through the API
-- ---------------------------------------------------------------------------

select throws_ok($$ select * from tester_feedback.task_votes $$, '42501', null, 'a tester cannot read votes directly');
select throws_ok($$ select * from tester_feedback.quest_comments $$, '42501', null, 'nor comments');
select throws_ok($$ select * from tester_feedback.app_reviews $$, '42501', null, 'nor reviews');
select throws_ok($$ select * from tester_feedback.task_vote_totals $$, '42501', null, 'nor the totals view');
select throws_ok($$ select * from tester_feedback.quest_comment_feed $$, '42501', null, 'nor the comment view');
select throws_ok($$ select * from tester_feedback.app_review_feed $$, '42501', null, 'nor the review view');
select throws_ok(
  $$ insert into tester_feedback.task_votes (user_id, task_id, vote) values ('7e57e570-0000-0000-0000-00000000000b', 'intro-001', 1) $$,
  '42501', null, 'nor write a vote for someone else'
);
reset role;
set local role anon;
select throws_ok($$ select public.tester_vote_task('intro-001', 1) $$, '42501', null, 'anon cannot vote');
select throws_ok($$ select * from public.tester_my_task_votes(array['intro-001']) $$, '42501', null, 'nor read votes');
select throws_ok($$ select public.tester_send_quest_comment('x', 'y') $$, '42501', null, 'nor comment');
select throws_ok($$ select public.tester_send_app_review('x') $$, '42501', null, 'nor review');
reset role;

-- ---------------------------------------------------------------------------
-- 5. The views: no user ids, and votes hidden below three voters
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = 'tester_feedback.task_vote_totals'::regclass and attnum > 0),
  array['task_id', 'ups', 'downs', 'net', 'voters'], 'the totals view holds no user id');
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = 'tester_feedback.quest_comment_feed'::regclass and attnum > 0),
  array['day', 'mode', 'tasks_done', 'question', 'body'], 'nor the comment view');
select is(
  (select array_agg(attname::text order by attnum) from pg_attribute
   where attrelid = 'tester_feedback.app_review_feed'::regclass and attnum > 0),
  array['day', 'overall', 'likes', 'wishes'], 'nor the review view');

select is((select count(*)::int from tester_feedback.task_vote_totals where task_id = 'silly-002'), 0,
  'a task with two voters stays hidden');
select pg_temp.login(pg_temp.u('1'));
select public.tester_vote_task('silly-002', 1);
reset role;
select is((select format('%s/%s/%s/%s', ups, downs, net, voters) from tester_feedback.task_vote_totals
  where task_id = 'silly-002'), '2/1/1/3', 'with a third voter it shows, without names');
select is((select body from tester_feedback.quest_comment_feed where body like 'Loved%'), 'Loved stop two.',
  'comments are stored trimmed');

-- ---------------------------------------------------------------------------
-- 6. Deleting an account deletes its feedback
-- ---------------------------------------------------------------------------

delete from auth.users where id = pg_temp.u('a');
select is((select count(*)::int from tester_feedback.task_votes where user_id = pg_temp.u('a')), 0, 'A''s votes go');
select is((select count(*)::int from tester_feedback.quest_comments where user_id = pg_temp.u('a')), 0, 'A''s comments go');
select is((select count(*)::int from tester_feedback.app_reviews where user_id = pg_temp.u('a')), 0, 'A''s reviews go');
select is((select count(*)::int from tester_feedback.quest_comments where user_id = pg_temp.u('b')), 1, 'B''s stay');

select * from finish();
rollback;
