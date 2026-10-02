begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('28282828-0000-0000-0000-00000000000a', 'a@test.local'),
  ('28282828-0000-0000-0000-00000000000b', 'b@test.local'),
  ('28282828-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.u(p_suffix text) returns uuid language sql as $$
  select ('28282828-0000-0000-0000-' || lpad(p_suffix, 12, '0'))::uuid
$$;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

insert into public.couples (id) values (pg_temp.u('ab'));
insert into public.couple_members (couple_id, user_id) values (pg_temp.u('ab'), pg_temp.u('a')), (pg_temp.u('ab'), pg_temp.u('b'));

-- A run with photos by A, finished unless p_open, as the owner, so the points triggers run as they would. p_couple
-- null makes a Just me run.
create function pg_temp.run(p_run text, p_couple text, p_open boolean, p_photos text[], variadic p_members text[])
returns void language sql as $$
  insert into public.trail_runs (id, couple_id, trail_id, trail_snapshot)
  values (pg_temp.u(p_run), case when p_couple is not null then pg_temp.u(p_couple) end, 't', '{"stops": []}');
  insert into public.trail_run_members (run_id, user_id) select pg_temp.u(p_run), pg_temp.u(m) from unnest(p_members) m;
  insert into public.photos (id, run_id, stop_id, uploader_id, storage_path, width, height)
  select pg_temp.u(p), pg_temp.u(p_run), 's1', pg_temp.u('a'), pg_temp.u(p_run)::text || '/' || pg_temp.u(p)::text || '.jpg',
    1, 1
  from unnest(p_photos) p;
  update public.trail_runs set completed_at = now() where id = pg_temp.u(p_run) and not p_open;
$$;

select pg_temp.run('c1', 'ab', false, array['e11', 'e12'], 'a', 'b');
select pg_temp.run('c2', 'ab', false, array['e21'], 'a', 'b');
select pg_temp.run('c3', 'ab', false, array['e31'], 'a', 'b');
select pg_temp.run('c4', 'ab', false, array['e41'], 'a', 'b');
select pg_temp.run('c5', 'ab', false, array['e51', 'e52', 'e53', 'e54'], 'a', 'b');
select pg_temp.run('c6', 'ab', false, array['e61'], 'a', 'b');
select pg_temp.run('d1', 'ab', false, array['ed1'], 'a');
select pg_temp.run('d2', 'ab', true, array['ed2'], 'a', 'b');
select pg_temp.run('f1', null, false, array['ef1'], 'a');

-- The caller's share items as "kind:answer", newest first.
create function pg_temp.feed() returns text language sql as $$
  select coalesce(string_agg(format('%s:%s', kind, coalesce(payload ->> 'answer', '-')), ',' order by created_at desc, id desc), '')
  from public.my_feed() where kind in ('share_requested', 'share_answered')
$$;

-- A run's share as the caller sees it: "status|mine|auto|points", or 'none'.
create function pg_temp.share(p_run text) returns text language sql as $$
  select coalesce((select format('%s|%s|%s|%s', status, proposed_by_me, auto, points) from public.run_share(pg_temp.u(p_run))),
    'none')
$$;

create function pg_temp.propose(p_photo text) returns text language sql as $$
  select status from public.propose_share(pg_temp.u(p_photo))
$$;

create function pg_temp.share_id(p_run text) returns uuid language sql as $$
  select share_id from public.run_share(pg_temp.u(p_run))
$$;

create function pg_temp.share_points(p_run text) returns int language sql security definer as $$
  select share_points from public.quest_points where run_id = pg_temp.u(p_run)
$$;

create function pg_temp.points() returns int language sql security definer as $$
  select points from public.couple_stats where couple_id = pg_temp.u('ab')
$$;

-- ---------------------------------------------------------------------------
-- 1. What can be proposed
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select pg_temp.propose('ef1') $$, 'P0001', 'not_couple_quest', 'a Just me photo cannot be shared');
select throws_ok($$ select pg_temp.propose('ed1') $$, 'P0001', 'not_couple_quest',
  'nor one from a quest B never joined');
select throws_ok($$ select pg_temp.propose('ed2') $$, 'P0001', 'run_not_finished', 'nor one from an open quest');
select pg_temp.login(pg_temp.u('5'));
select throws_ok($$ select pg_temp.propose('e11') $$, 'P0001', 'photo_not_found',
  'the stranger cannot propose the couple''s photo');

-- ---------------------------------------------------------------------------
-- 2. Propose, decline, propose another, approve, share
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.propose('e11'), 'pending', 'A proposes a photo; it waits for B');
select is(pg_temp.share('c1'), 'pending|t|f|0', 'A sees it waiting, with no time to count');
select is(pg_temp.feed(), '', 'A gets no feed item, and so no reminder');
select throws_ok($$ select pg_temp.propose('e21') $$, 'P0001', 'share_pending', 'A has one waiting proposal at a time');
select throws_ok($$ select public.confirm_share(pg_temp.share_id('c1')) $$, 'P0001', 'not_approved',
  'nor can A share before B says yes');
select throws_ok($$ select public.answer_share(pg_temp.share_id('c1'), true) $$, 'P0001', 'share_gone',
  'nor approve A''s own proposal');
select is((select count(*)::int from public.pending_share_requests()), 0, 'A has nothing to answer');

select pg_temp.login(pg_temp.u('5'));
select is((select count(*)::int from public.pending_share_requests()), 0, 'the stranger sees no request');
reset role;
create temp table c1_share as select id from private.photo_shares where run_id = pg_temp.u('c1');
grant select on c1_share to authenticated;
select pg_temp.login(pg_temp.u('5'));
select throws_ok($$ select public.answer_share((select id from c1_share), true) $$, 'P0001', 'share_gone',
  'nor can answer it');
select is(pg_temp.share('c1'), 'none', 'nor read it');

select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'share_requested:-', 'B finds one request in the feed');
select is((select format('%s|%s', run_id = pg_temp.u('c1'), photo_id = pg_temp.u('e11')) from public.pending_share_requests()),
  't|t', 'and in the requests list, with the photo to look at');
select is(pg_temp.share('c1'), 'pending|f|f|0', 'B sees A''s proposal');
select is(public.answer_share(pg_temp.share_id('c1'), false), 'declined', 'B says not this time');
select is((select count(*)::int from public.pending_share_requests()), 0, 'and has nothing left to answer');

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), 'share_answered:declined', 'A hears "not this time", with no reason');
select throws_ok($$ select pg_temp.propose('e11') $$, 'P0001', 'photo_declined', 'a declined photo cannot be asked again');
select is(pg_temp.propose('e12'), 'pending', 'A may propose another photo of the quest');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'share_requested:-,share_requested:-', 'one item per proposal');
select is(public.answer_share(pg_temp.share_id('c1'), true), 'approved', 'B approves');
select is(public.answer_share(pg_temp.share_id('c1'), true), 'approved', 'approving twice changes nothing');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.feed(), 'share_answered:approved,share_answered:declined', 'A hears the yes once');
select is(pg_temp.share('c1'), 'approved|t|f|0', 'and sees it approved');

select is(pg_temp.points(), 790,
  'before sharing, seven finished quests, the week''s bonus, and twelve photos come to 790');
select is(public.confirm_share(pg_temp.share_id('c1')), 20, 'A shares through the share sheet and earns 20');
select is(pg_temp.share('c1'), 'shared|t|f|20', 'the share is done');
select is(pg_temp.share_points('c1'), 20, 'the quest''s points hold it');
select is(pg_temp.points(), 810, 'and so does the lifetime total');
select is(public.confirm_share(pg_temp.share_id('c1')), 0, 'confirming twice earns nothing more');
select throws_ok($$ select pg_temp.propose('e11') $$, 'P0001', 'share_exists', 'one share per quest');
select pg_temp.login(pg_temp.u('b'));
select throws_ok($$ select public.confirm_share(pg_temp.share_id('c1')) $$, 'P0001', 'share_gone',
  'B cannot confirm A''s share');
select throws_ok($$ select public.answer_share(pg_temp.share_id('c1'), false) $$, 'P0001', 'share_gone',
  'nor take back a share already made');

-- ---------------------------------------------------------------------------
-- 3. Cancelling, and standing consent
-- ---------------------------------------------------------------------------

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.propose('e21'), 'pending', 'A proposes a photo of the second quest');
select lives_ok($$ select public.cancel_share(pg_temp.share_id('c2')) $$, 'and withdraws it');
select pg_temp.login(pg_temp.u('b'));
select is(pg_temp.feed(), 'share_requested:-,share_requested:-', 'B''s unread request for it goes too');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.share('c2'), 'none', 'it is gone');
select pg_temp.login(pg_temp.u('b'));
select is((select count(*)::int from public.pending_share_requests()), 0, 'B has nothing to answer');

select is(public.share_consent(), false, 'B starts without standing consent');
select lives_ok($$ select public.set_share_consent(true) $$, 'B grants standing consent');
select is(public.share_consent(), true, 'and sees it');
select pg_temp.login(pg_temp.u('a'));
select is(public.share_consent(), false, 'A''s own consent is A''s own');
select is(pg_temp.propose('e21'), 'approved', 'B''s consent approves A''s proposal at once');
select is(pg_temp.share('c2'), 'approved|t|t|0', 'marked as approved by consent');
select pg_temp.login(pg_temp.u('b'));
select is((select feed from (select pg_temp.feed() as feed) f), 'share_requested:approved,share_requested:-,share_requested:-',
  'B still hears of it, already approved');
select pg_temp.login(pg_temp.u('a'));
select is(public.confirm_share(pg_temp.share_id('c2')), 20, 'the second share earns 20');

select is(pg_temp.propose('e31'), 'approved', 'a third proposal is approved by consent too');
reset role;
create temp table c3_share as select id from private.photo_shares where run_id = pg_temp.u('c3');
grant select on c3_share to authenticated;
select pg_temp.login(pg_temp.u('b'));
select lives_ok($$ select public.set_share_consent(false) $$, 'B withdraws consent in one call');
select is(pg_temp.share('c3'), 'none', 'which drops the approval A has not used yet');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select public.confirm_share((select id from c3_share)) $$, 'P0001', 'share_gone',
  'so nothing is left to confirm');
select is(pg_temp.propose('e31'), 'pending', 'A may ask again, and now waits');
select pg_temp.login(pg_temp.u('b'));
select is(public.answer_share(pg_temp.share_id('c3'), true), 'approved', 'B approves by hand');
select pg_temp.login(pg_temp.u('a'));
select is(public.confirm_share(pg_temp.share_id('c3')), 20, 'the third share this week earns 20');

-- ---------------------------------------------------------------------------
-- 4. Caps: three a week, three proposals a quest
-- ---------------------------------------------------------------------------

select is(pg_temp.propose('e41'), 'pending', 'A proposes a fourth');
select pg_temp.login(pg_temp.u('b'));
select is(public.answer_share(pg_temp.share_id('c4'), true), 'approved', 'B approves it');
select pg_temp.login(pg_temp.u('a'));
select is(public.confirm_share(pg_temp.share_id('c4')), 0, 'a fourth share in a week earns nothing');
select is(pg_temp.share('c4'), 'shared|t|f|0', 'though it counts as shared');
select is(pg_temp.share_points('c4'), 0, 'the quest''s points stay as they were');
select is(pg_temp.points(), 850, 'and the total holds three shares');
reset role;
select is(private.weekly_points(pg_temp.u('ab'), private.riga_week(now())), (100 + 30 + 10 + 20) + 2 * (100 + 5 + 20),
  'the weekly board counts share points inside the best three quests');

select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.propose('e51'), 'pending', 'on the fifth quest, A proposes');
select pg_temp.login(pg_temp.u('b'));
select is(public.answer_share(pg_temp.share_id('c5'), false), 'declined', 'B declines');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.propose('e52'), 'pending', 'A proposes another');
select pg_temp.login(pg_temp.u('b'));
select is(public.answer_share(pg_temp.share_id('c5'), false), 'declined', 'B declines again');
select pg_temp.login(pg_temp.u('a'));
select is(pg_temp.propose('e53'), 'pending', 'A proposes a third');
select pg_temp.login(pg_temp.u('b'));
select is(public.answer_share(pg_temp.share_id('c5'), true), 'approved', 'B approves, then thinks again');
select is(public.answer_share(pg_temp.share_id('c5'), false), 'declined', 'and declines before A shares');
select pg_temp.login(pg_temp.u('a'));
select throws_ok($$ select public.confirm_share(pg_temp.share_id('c5')) $$, 'P0001', 'not_approved',
  'so A cannot share it');
select throws_ok($$ select pg_temp.propose('e54') $$, 'P0001', 'too_many_proposals',
  'a quest takes three proposals at most, so a no is not worn down');

-- ---------------------------------------------------------------------------
-- 5. The tables
-- ---------------------------------------------------------------------------

select throws_ok($$ select * from private.photo_shares $$, '42501', null, 'a member cannot read shares directly');
select throws_ok($$ select * from private.share_consent $$, '42501', null, 'nor consents');
select throws_ok($$ update private.photo_shares set status = 'approved' $$, '42501', null, 'nor approve by hand');
select pg_temp.login(pg_temp.u('5'));
select throws_ok($$ select * from private.photo_shares $$, '42501', null, 'nor can the stranger');

reset role;
set local role anon;
select throws_ok($$ select * from public.propose_share('28282828-0000-0000-0000-000000000e61') $$, '42501', null,
  'anon cannot propose');
select throws_ok($$ select public.set_share_consent(true) $$, '42501', null, 'nor grant consent');

select * from finish();
rollback;
