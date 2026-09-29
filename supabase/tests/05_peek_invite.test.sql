begin;
select * from no_plan();

-- Fixtures: A invites; S is a stranger who later redeems A's code; E invites and then links with F; G's invite
-- expires; C tests the attempt limit; H arrives after A's code is used.
insert into auth.users (id, email) values
  ('55555555-0000-0000-0000-00000000000a', 'a@test.local'),
  ('55555555-0000-0000-0000-000000000001', 's@test.local'),
  ('55555555-0000-0000-0000-00000000000e', 'e@test.local'),
  ('55555555-0000-0000-0000-00000000000f', 'f@test.local'),
  ('55555555-0000-0000-0000-00000000000d', 'g@test.local'),
  ('55555555-0000-0000-0000-00000000000c', 'c@test.local'),
  ('55555555-0000-0000-0000-000000000002', 'h@test.local');
update public.profiles set display_name = 'Alice' where id = '55555555-0000-0000-0000-00000000000a';
update public.profiles set display_name = 'Eve' where id = '55555555-0000-0000-0000-00000000000e';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create function pg_temp.attempts(uid uuid) returns int language sql security definer as $$
  select count(*)::int from public.invite_attempts where user_id = uid;
$$;

create temp table codes (who text primary key, code text);
grant all on codes to authenticated;

select pg_temp.login('55555555-0000-0000-0000-00000000000a');
insert into codes values ('a', public.create_invite());

-- Anon cannot peek
set local role anon;
select throws_ok(
  $$ select public.peek_invite('WRONGCODE0') $$, '42501', null, 'anon cannot execute peek_invite'
);
reset role;

-- A stranger with a valid code sees the inviter's name, and nothing is redeemed
select pg_temp.login('55555555-0000-0000-0000-000000000001');
select is(
  public.peek_invite('  ' || lower((select code from codes where who = 'a')) || ' '),
  '{"status": "valid", "inviter_name": "Alice"}'::jsonb,
  'a stranger with a valid code sees the inviter''s name, with the code normalised'
);
select is(pg_temp.attempts('55555555-0000-0000-0000-000000000001'), 0, 'a valid peek records no attempt');
reset role;
select is(
  (select redeemed_at from public.invites where inviter_id = '55555555-0000-0000-0000-00000000000a'),
  null,
  'peeking leaves the invite unredeemed'
);
-- Counts only this file's users, so couples left in a local database from manual testing don't matter.
select is(
  (select count(*)::int from public.couple_members where user_id::text like '55555555-%'),
  0,
  'peeking creates no couple'
);

-- The inviter peeking their own code
select pg_temp.login('55555555-0000-0000-0000-00000000000a');
select is(
  public.peek_invite((select code from codes where who = 'a')),
  '{"status": "self", "inviter_name": null}'::jsonb,
  'the inviter peeking their own code gets self and no name'
);

-- Already linked: E invites, then links with F by redeeming F's code
select pg_temp.login('55555555-0000-0000-0000-00000000000e');
insert into codes values ('e', public.create_invite());
select pg_temp.login('55555555-0000-0000-0000-00000000000f');
insert into codes values ('f', public.create_invite());
select pg_temp.login('55555555-0000-0000-0000-00000000000e');
select is(public.redeem_invite((select code from codes where who = 'f')), 'linked', 'E and F link');

select is(
  public.peek_invite((select code from codes where who = 'a')),
  '{"status": "already_linked", "inviter_name": null}'::jsonb,
  'a linked caller gets already_linked and no name'
);
select pg_temp.login('55555555-0000-0000-0000-00000000000f');
select is(
  public.peek_invite((select code from codes where who = 'a')),
  '{"status": "already_linked", "inviter_name": null}'::jsonb,
  'the partner of a linked caller gets already_linked too'
);
select pg_temp.login('55555555-0000-0000-0000-000000000001');
select is(
  public.peek_invite((select code from codes where who = 'e')),
  '{"status": "already_linked", "inviter_name": null}'::jsonb,
  'a stranger peeking a linked inviter''s code gets already_linked and no name'
);

-- Invalid and expired codes return no name and record an attempt
select pg_temp.login('55555555-0000-0000-0000-00000000000d');
insert into codes values ('g', public.create_invite());
reset role;
update public.invites set expires_at = now() - interval '1 minute'
where inviter_id = '55555555-0000-0000-0000-00000000000d';

select pg_temp.login('55555555-0000-0000-0000-00000000000c');
select is(
  public.peek_invite('WRONGCODE0'),
  '{"status": "invalid", "inviter_name": null}'::jsonb,
  'an unknown code reads invalid with no name'
);
select is(pg_temp.attempts('55555555-0000-0000-0000-00000000000c'), 1, 'an invalid peek records an attempt');
select is(
  public.peek_invite((select code from codes where who = 'g')),
  '{"status": "expired", "inviter_name": null}'::jsonb,
  'an expired code reads expired with no name'
);
select is(pg_temp.attempts('55555555-0000-0000-0000-00000000000c'), 2, 'an expired peek records an attempt');

-- Attempt limit, shared with redeem_invite: two failed peeks so far, four failed redeems and four more failed
-- peeks reach ten.
select is(
  (select count(*)::int from generate_series(1, 4) where public.redeem_invite('BADCODE000') = 'invalid'),
  4,
  'failed redemptions under the limit report invalid'
);
select is(
  (select count(*)::int from generate_series(1, 4)
   where public.peek_invite('BADCODE000') ->> 'status' = 'invalid'),
  4,
  'failed peeks under the limit report invalid'
);
select is(pg_temp.attempts('55555555-0000-0000-0000-00000000000c'), 10, 'peeks and redemptions share one count');
select is(
  public.peek_invite((select code from codes where who = 'a')),
  '{"status": "rate_limited", "inviter_name": null}'::jsonb,
  'past the limit even a valid code reads rate_limited with no name'
);
select is(
  public.redeem_invite((select code from codes where who = 'a')),
  'rate_limited',
  'failed peeks count against redeem_invite'
);

-- Redemption still works after a peek, and a used code then reads invalid
select pg_temp.login('55555555-0000-0000-0000-000000000001');
select is(public.redeem_invite((select code from codes where who = 'a')), 'linked', 'a peeked code still redeems');
select pg_temp.login('55555555-0000-0000-0000-000000000002');
select is(
  public.peek_invite((select code from codes where who = 'a')),
  '{"status": "invalid", "inviter_name": null}'::jsonb,
  'a redeemed code reads invalid with no name'
);

select * from finish();
rollback;
