begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger. Reports are anyone's, so the couple makes no difference to them.
insert into auth.users (id, email) values
  ('20202020-0000-0000-0000-00000000000a', 'a@test.local'),
  ('20202020-0000-0000-0000-00000000000b', 'b@test.local'),
  ('20202020-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('20202020-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('20202020-0000-0000-0000-0000000000cc', '20202020-0000-0000-0000-00000000000a'),
  ('20202020-0000-0000-0000-0000000000cc', '20202020-0000-0000-0000-00000000000b');

-- Other tests' reports would otherwise show up in reported_places.
delete from public.stop_reports;

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

select pg_temp.login('20202020-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.report_stop(56.9496487, 24.1051865, 'unsafe', '  Broken glass under the bench  ') $$,
  'a member reports a stop as unsafe'
);
select lives_ok(
  $$ select public.report_stop(56.9496487, 24.1051865, 'unpleasant') $$,
  'and the same stop again as unpleasant, without a note'
);
select throws_ok($$ select public.report_stop(56.9, 24.1, 'boring') $$, 'P0001', 'reason_invalid',
  'a reason is unsafe or unpleasant');
select throws_ok($$ select public.report_stop(91, 24.1, 'unsafe') $$, 'P0001', 'position_invalid',
  'a latitude past the pole is refused');
select throws_ok($$ select public.report_stop(56.9, null, 'unsafe') $$, 'P0001', 'position_invalid',
  'a position needs both coordinates');
select throws_ok($$ select public.report_stop(56.9, 24.1, 'unsafe', repeat('x', 281)) $$, 'P0001', 'note_too_long',
  'a note holds at most 280 characters');

select throws_ok($$ select * from public.stop_reports $$, '42501', null, 'the reporter cannot read the table');
select throws_ok(
  $$ insert into public.stop_reports (lat, lng, reason) values (1, 1, 'unsafe') $$, '42501', null,
  'nor write it directly'
);
select throws_ok($$ update public.stop_reports set status = 'dismissed' $$, '42501', null, 'nor review reports');
select throws_ok($$ delete from public.stop_reports $$, '42501', null, 'nor delete them');
select throws_ok($$ truncate public.stop_reports $$, '42501', null, 'nor truncate them');

reset role;
select is(
  (select array_agg(format('%s,%s,%s,%s,%s', lat, lng, reason, coalesce(note, '-'), status) order by reason)
   from public.stop_reports where reporter = '20202020-0000-0000-0000-00000000000a'),
  array['56.94965,24.10519,unpleasant,-,open', '56.94965,24.10519,unsafe,Broken glass under the bench,open'],
  'reports store the position rounded to 5 decimals, the reason, the trimmed note, and start open'
);
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.columns
   where table_schema = 'public' and table_name = 'stop_reports'),
  array['created_at', 'id', 'lat', 'lng', 'note', 'reason', 'reporter', 'status'],
  'a report holds the stop''s position and nothing about a start or path'
);

-- ---------------------------------------------------------------------------
-- reported_places: positions only, open and confirmed
-- ---------------------------------------------------------------------------

select pg_temp.login('20202020-0000-0000-0000-000000000005');
select lives_ok($$ select public.report_stop(56.95, 24.11, 'unpleasant', 'smells') $$, 'a stranger reports another stop');
select lives_ok($$ select public.report_stop(56.96, 24.12, 'unsafe') $$, 'and a third');

reset role;
update public.stop_reports set status = 'dismissed' where lat = 56.96;
update public.stop_reports set status = 'confirmed' where lat = 56.95;

select pg_temp.login('20202020-0000-0000-0000-00000000000b');
select is(
  (select array_agg(format('%s,%s', lat, lng) order by lat) from public.reported_places()),
  array['56.94965,24.10519', '56.95,24.11'],
  'the partner gets each open or confirmed place once, and no dismissed one'
);
select is(
  (select array_agg(key order by key) from public.reported_places() p, jsonb_object_keys(to_jsonb(p)) key
   where p.lat = 56.95),
  array['lat', 'lng'],
  'a place says where, never who, why, or when'
);
select pg_temp.login('20202020-0000-0000-0000-000000000005');
select is((select count(*)::int from public.reported_places()), 2, 'a stranger gets the same list');

reset role;
set local role anon;
select throws_ok($$ select * from public.reported_places() $$, '42501', null, 'anon gets no places');
select throws_ok($$ select public.report_stop(1, 1, 'unsafe') $$, '42501', null, 'anon cannot report');
select throws_ok($$ select * from public.stop_reports $$, '42501', null, 'anon cannot read the table');
reset role;

-- ---------------------------------------------------------------------------
-- The rate limit: 10 per user in 24 hours
-- ---------------------------------------------------------------------------

select pg_temp.login('20202020-0000-0000-0000-00000000000a');
select lives_ok(
  $$ select public.report_stop(57 + n / 1000.0, 24, 'unsafe') from generate_series(1, 8) n $$,
  'A files eight more reports, ten in all'
);
select throws_ok($$ select public.report_stop(58, 24, 'unsafe') $$, 'P0001', 'too_many_reports',
  'the eleventh within a day is refused');
select pg_temp.login('20202020-0000-0000-0000-00000000000b');
select lives_ok($$ select public.report_stop(58, 24, 'unsafe') $$, 'another user still reports');

reset role;
update public.stop_reports set created_at = now() - interval '25 hours'
where reporter = '20202020-0000-0000-0000-00000000000a' and lat = 56.94965;
select pg_temp.login('20202020-0000-0000-0000-00000000000a');
select lives_ok($$ select public.report_stop(58, 24, 'unsafe') $$, 'A reports again once older reports age out');

select * from finish();
rollback;
