begin;
select * from no_plan();

-- Fixtures: A invites B; S is a stranger; C is a third user who tries A's later invite.
insert into auth.users (id, email) values
  ('14141414-0000-0000-0000-00000000000a', 'a@test.local'),
  ('14141414-0000-0000-0000-00000000000b', 'b@test.local'),
  ('14141414-0000-0000-0000-00000000000c', 'c@test.local'),
  ('14141414-0000-0000-0000-000000000005', 's@test.local');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

create temp table codes (who text primary key, code text);
grant all on codes to authenticated;
create temp table reqs (name text primary key, id uuid);
grant all on reqs to authenticated;

create function pg_temp.cards() returns int language sql as $$
  select count(*)::int from public.profile_cards where id::text like '14141414-%'
$$;

select pg_temp.login('14141414-0000-0000-0000-00000000000a');
insert into codes values ('a1', public.create_invite());

-- ---------------------------------------------------------------------------
-- Redeeming leaves a request, not a couple
-- ---------------------------------------------------------------------------

select pg_temp.login('14141414-0000-0000-0000-00000000000b');
select is(public.redeem_invite_pending('WRONGCODE0'), 'invalid', 'a wrong code is refused');
select is(public.redeem_invite_pending((select code from codes where who = 'a1')), 'pending', 'B redeems A''s invite');
select is((select count(*)::int from public.couples), 0, 'redeeming makes no couple yet');
select is((select count(*)::int from public.link_requests), 1, 'the invitee sees the request');
select is(pg_temp.cards(), 2, 'the invitee sees the inviter''s card while the request is open');
select is(
  public.redeem_invite_pending((select code from codes where who = 'a1')), 'invalid',
  'the invite is used up by the pending redemption'
);
select is(public.confirm_link((select id from public.link_requests)), 'invalid', 'the invitee cannot confirm');

select pg_temp.login('14141414-0000-0000-0000-000000000005');
select is((select count(*)::int from public.link_requests), 0, 'a stranger sees no request');
select is(pg_temp.cards(), 1, 'a stranger sees only themselves');

reset role;
insert into reqs select 'ab', id from public.link_requests where inviter_id = '14141414-0000-0000-0000-00000000000a';
select pg_temp.login('14141414-0000-0000-0000-000000000005');
select is(public.confirm_link((select id from reqs where name = 'ab')), 'invalid', 'a stranger cannot confirm');
select lives_ok($$ select public.decline_link((select id from reqs where name = 'ab')) $$, 'a stranger''s decline runs');

select pg_temp.login('14141414-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.link_requests), 1, 'the stranger''s decline changed nothing');
select is(pg_temp.cards(), 2, 'the inviter sees the invitee''s card while the request is open');
select is((select count(*)::int from public.couples), 0, 'the inviter has no couple before confirming');

-- ---------------------------------------------------------------------------
-- Confirming
-- ---------------------------------------------------------------------------

select is(public.confirm_link((select id from reqs where name = 'ab')), 'linked', 'the inviter confirms');
select is((select count(*)::int from public.couples where ended_at is null), 1, 'the inviter sees the couple');
select is((select count(*)::int from public.couple_members), 2, 'with both members');
select is((select count(*)::int from public.link_requests), 0, 'the request is gone');
select is(public.confirm_link((select id from reqs where name = 'ab')), 'invalid', 'confirming twice changes nothing');

select pg_temp.login('14141414-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.couples where ended_at is null), 1, 'the invitee sees the couple');

-- ---------------------------------------------------------------------------
-- Declining, expiry, and a linked inviter
-- ---------------------------------------------------------------------------

select lives_ok($$ select public.unlink() $$, 'B unlinks');
select pg_temp.login('14141414-0000-0000-0000-00000000000a');
insert into codes values ('a2', public.create_invite());

select pg_temp.login('14141414-0000-0000-0000-00000000000c');
select is(public.redeem_invite_pending((select code from codes where who = 'a2')), 'pending', 'C redeems A''s next invite');
select pg_temp.login('14141414-0000-0000-0000-00000000000a');
select lives_ok($$ select public.decline_link((select id from public.link_requests)) $$, 'the inviter declines');
select is((select count(*)::int from public.link_requests), 0, 'a declined request is gone');
select is(pg_temp.cards(), 1, 'a declined invitee drops out of the inviter''s cards');

insert into codes values ('a3', public.create_invite());
select pg_temp.login('14141414-0000-0000-0000-00000000000c');
select is(public.redeem_invite_pending((select code from codes where who = 'a3')), 'pending', 'C redeems a third invite');
reset role;
update public.link_requests set expires_at = now() - interval '1 minute';
select pg_temp.login('14141414-0000-0000-0000-00000000000a');
select is(public.confirm_link((select id from public.link_requests)), 'expired', 'a lapsed request cannot be confirmed');
select is((select count(*)::int from public.couples where ended_at is null), 0, 'and makes no couple');

insert into codes values ('a4', public.create_invite());
select pg_temp.login('14141414-0000-0000-0000-00000000000c');
select is(public.redeem_invite_pending((select code from codes where who = 'a4')), 'pending', 'C redeems a fourth invite');
-- Meanwhile A links with B through today's redeem_invite.
insert into codes values ('c1', public.create_invite());
select pg_temp.login('14141414-0000-0000-0000-00000000000a');
select lives_ok($$ select public.decline_link(gen_random_uuid()) $$, 'declining an unknown request is harmless');
select pg_temp.login('14141414-0000-0000-0000-00000000000b');
insert into codes values ('b1', public.create_invite());
select pg_temp.login('14141414-0000-0000-0000-00000000000a');
select is(public.redeem_invite((select code from codes where who = 'b1')), 'linked', 'today''s redeem_invite still links at once');
select is(public.confirm_link((select id from public.link_requests)), 'already_linked',
  'a linked inviter cannot confirm another request');
select is(public.redeem_invite_pending((select code from codes where who = 'c1')), 'already_linked',
  'a linked user cannot redeem another invite');

select * from finish();
rollback;
