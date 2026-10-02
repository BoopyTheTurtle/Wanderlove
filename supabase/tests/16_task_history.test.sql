begin;
select * from no_plan();

-- Fixtures: A and B are a couple. C later links with A. S is a stranger throughout.
-- Ids sort as S < A < B < C, so the pair (A, B) stores A low and B high.
insert into auth.users (id, email) values
  ('16161616-0000-0000-0000-00000000000a', 'a@test.local'),
  ('16161616-0000-0000-0000-00000000000b', 'b@test.local'),
  ('16161616-0000-0000-0000-00000000000c', 'c@test.local'),
  ('16161616-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('16161616-0000-0000-0000-0000000000ab');
insert into public.couple_members (couple_id, user_id) values
  ('16161616-0000-0000-0000-0000000000ab', '16161616-0000-0000-0000-00000000000a'),
  ('16161616-0000-0000-0000-0000000000ab', '16161616-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Runs a statement as the current user and returns how many rows it touched.
create function pg_temp.affected(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

create function pg_temp.record(p_low text, p_high text, p_task text) returns text language sql as $$
  select format(
    $q$ insert into public.task_history (person_low, person_high, task_id, outcome)
        values ('16161616-0000-0000-0000-%s', '16161616-0000-0000-0000-%s', %L, 'done') $q$,
    p_low, p_high, p_task)
$$;

-- Counts the caller's visible rows for a pair.
create function pg_temp.seen(p_low text, p_high text) returns int language sql as $$
  select count(*)::int from public.task_history
  where person_low = ('16161616-0000-0000-0000-' || p_low)::uuid
    and person_high = ('16161616-0000-0000-0000-' || p_high)::uuid
$$;

-- ---------------------------------------------------------------------------
-- A linked pair records and reads together
-- ---------------------------------------------------------------------------

select pg_temp.login('16161616-0000-0000-0000-00000000000a');
select lives_ok(pg_temp.record('00000000000a', '00000000000b', 'silly-001'), 'a member records a task for the pair');
select lives_ok(pg_temp.record('00000000000a', '00000000000a', 'deep-001'), 'a member records a solo task');
select is(pg_temp.seen('00000000000a', '00000000000b'), 1, 'the member reads the pair''s row');
select isnt((select at from public.task_history where task_id = 'silly-001'), null, 'the server stamps the time');
select throws_ok(
  $$ insert into public.task_history (person_low, person_high, task_id, outcome, at)
     values ('16161616-0000-0000-0000-00000000000a', '16161616-0000-0000-0000-00000000000b', 'silly-002', 'done',
             now() - interval '1 year') $$,
  '42501', null,
  'a member cannot backdate a row'
);
select throws_ok(
  $$ insert into public.task_history (person_low, person_high, task_id, outcome)
     values ('16161616-0000-0000-0000-00000000000b', '16161616-0000-0000-0000-00000000000a', 'silly-002', 'done') $$,
  '23514', null,
  'a pair stores its smaller id first'
);
select throws_ok(
  $$ insert into public.task_history (person_low, person_high, task_id, outcome)
     values ('16161616-0000-0000-0000-00000000000a', '16161616-0000-0000-0000-00000000000b', 'silly-002', 'maybe') $$,
  '23514', null,
  'an outcome is done or skipped'
);
select throws_ok($$ update public.task_history set outcome = 'skipped' $$, '42501', null, 'a member cannot rewrite history');
select throws_ok($$ delete from public.task_history $$, '42501', null, 'a member cannot delete history');
select throws_ok($$ truncate public.task_history $$, '42501', null, 'a member cannot truncate history');

select pg_temp.login('16161616-0000-0000-0000-00000000000b');
select lives_ok(
  $$ insert into public.task_history (person_low, person_high, task_id, outcome)
     values ('16161616-0000-0000-0000-00000000000a', '16161616-0000-0000-0000-00000000000b', 'intro-001', 'skipped') $$,
  'the partner records a task for the pair, from the high side'
);
select is(pg_temp.seen('00000000000a', '00000000000b'), 2, 'the partner reads both of the pair''s rows');
select is(pg_temp.seen('00000000000a', '00000000000a'), 0, 'the partner sees none of the member''s solo rows');
select throws_ok(
  pg_temp.record('00000000000a', '00000000000a', 'deep-002'), '42501', null,
  'the partner cannot record a solo task for the member'
);

-- ---------------------------------------------------------------------------
-- A stranger sees and records nothing
-- ---------------------------------------------------------------------------

select pg_temp.login('16161616-0000-0000-0000-000000000005');
select is((select count(*)::int from public.task_history), 0, 'a stranger sees no history');
select throws_ok(
  pg_temp.record('000000000005', '00000000000a', 'silly-003'), '42501', null,
  'a stranger cannot record a pair with a member'
);
select throws_ok(
  pg_temp.record('00000000000a', '00000000000b', 'silly-003'), '42501', null,
  'a stranger cannot record for a pair they are not in'
);

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select throws_ok($$ select * from public.task_history $$, '42501', null, 'anon cannot read history');

-- ---------------------------------------------------------------------------
-- Unlink, a new partner, and a relink
-- ---------------------------------------------------------------------------

select pg_temp.login('16161616-0000-0000-0000-00000000000a');
select lives_ok($$ select public.unlink() $$, 'A unlinks');
select is(pg_temp.seen('00000000000a', '00000000000b'), 2, 'after the unlink, A still reads the pair''s history');
select throws_ok(
  pg_temp.record('00000000000a', '00000000000b', 'silly-004'), '42501', null,
  'after the unlink, A cannot add to it'
);
select lives_ok(pg_temp.record('00000000000a', '00000000000a', 'deep-003'), 'A still records solo tasks');

select pg_temp.login('16161616-0000-0000-0000-00000000000b');
select is(pg_temp.seen('00000000000a', '00000000000b'), 2, 'after the unlink, B still reads the pair''s history');
select throws_ok(
  pg_temp.record('00000000000a', '00000000000b', 'silly-004'), '42501', null,
  'after the unlink, B cannot add to it'
);

-- A links with C.
reset role;
insert into public.couples (id) values ('16161616-0000-0000-0000-0000000000ac');
insert into public.couple_members (couple_id, user_id) values
  ('16161616-0000-0000-0000-0000000000ac', '16161616-0000-0000-0000-00000000000a'),
  ('16161616-0000-0000-0000-0000000000ac', '16161616-0000-0000-0000-00000000000c');

select pg_temp.login('16161616-0000-0000-0000-00000000000c');
select is(pg_temp.seen('00000000000a', '00000000000c'), 0, 'the new pair starts with no history');
select is((select count(*)::int from public.task_history), 0, 'C sees none of A''s rows with B, nor A''s solo rows');
select lives_ok(pg_temp.record('00000000000a', '00000000000c', 'silly-001'), 'C records a task for the new pair');
select throws_ok(
  pg_temp.record('00000000000a', '00000000000b', 'silly-005'), '42501', null,
  'C cannot record for the old pair'
);

select pg_temp.login('16161616-0000-0000-0000-00000000000a');
select is(pg_temp.seen('00000000000a', '00000000000c'), 1, 'A reads the new pair''s row');
select is(pg_temp.seen('00000000000a', '00000000000b'), 2, 'A still reads the old pair''s rows, kept apart');
select throws_ok(
  pg_temp.record('00000000000a', '00000000000b', 'silly-005'), '42501', null,
  'A cannot record for the old partner while linked to a new one'
);

select pg_temp.login('16161616-0000-0000-0000-00000000000b');
select is(pg_temp.seen('00000000000a', '00000000000c'), 0, 'the ex sees nothing of the new pair');

-- A and B relink.
select pg_temp.login('16161616-0000-0000-0000-00000000000a');
select lives_ok($$ select public.unlink() $$, 'A unlinks from C');
reset role;
insert into public.couples (id) values ('16161616-0000-0000-0000-0000000000ba');
insert into public.couple_members (couple_id, user_id) values
  ('16161616-0000-0000-0000-0000000000ba', '16161616-0000-0000-0000-00000000000a'),
  ('16161616-0000-0000-0000-0000000000ba', '16161616-0000-0000-0000-00000000000b');

select pg_temp.login('16161616-0000-0000-0000-00000000000b');
select is(pg_temp.seen('00000000000a', '00000000000b'), 2, 'the relinked pair finds its old history');
select lives_ok(pg_temp.record('00000000000a', '00000000000b', 'silly-006'), 'the relinked pair records again');
select is(pg_temp.seen('00000000000a', '00000000000b'), 3, 'and reads the new row with the old');
select is(pg_temp.seen('00000000000a', '00000000000a'), 0, 'the relinked partner still sees none of A''s solo rows');

-- ---------------------------------------------------------------------------
-- Rows go with the account
-- ---------------------------------------------------------------------------

reset role;
delete from auth.users where id = '16161616-0000-0000-0000-00000000000c';
select is(
  (select count(*)::int from public.task_history where person_high = '16161616-0000-0000-0000-00000000000c'),
  0,
  'a deleted account takes its pairs'' rows with it'
);

-- ---------------------------------------------------------------------------
-- Mobility: the owner alone reads and writes it
-- ---------------------------------------------------------------------------

select pg_temp.login('16161616-0000-0000-0000-00000000000a');
select is((select mobility from public.profiles where id = auth.uid()), false, 'mobility starts off');
select lives_ok($$ update public.profiles set mobility = true where id = auth.uid() $$, 'the owner turns mobility on');
select is((select mobility from public.profiles where id = auth.uid()), true, 'the setting is stored');

select pg_temp.login('16161616-0000-0000-0000-00000000000b');
select is(
  pg_temp.affected($$ update public.profiles set mobility = false where id = '16161616-0000-0000-0000-00000000000a' $$),
  0,
  'the partner cannot change it'
);
select is(
  (select count(*)::int from public.profiles where id = '16161616-0000-0000-0000-00000000000a'), 0,
  'the partner cannot read it'
);
select throws_ok($$ select mobility from public.profile_cards $$, '42703', null, 'profile_cards does not show it');

select pg_temp.login('16161616-0000-0000-0000-000000000005');
select is(
  pg_temp.affected($$ update public.profiles set mobility = false where id = '16161616-0000-0000-0000-00000000000a' $$),
  0,
  'a stranger cannot change it'
);

reset role;
select is(
  (select mobility from public.profiles where id = '16161616-0000-0000-0000-00000000000a'), true,
  'mobility is still on'
);

select * from finish();
rollback;
