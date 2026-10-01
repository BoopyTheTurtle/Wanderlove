begin;
select * from no_plan();

-- Fixtures: A and B are a couple; S is a stranger, not linked to anyone.
insert into auth.users (id, email) values
  ('19191919-0000-0000-0000-00000000000a', 'a@test.local'),
  ('19191919-0000-0000-0000-00000000000b', 'b@test.local'),
  ('19191919-0000-0000-0000-000000000005', 's@test.local');
insert into public.couples (id) values ('19191919-0000-0000-0000-0000000000cc');
insert into public.couple_members (couple_id, user_id) values
  ('19191919-0000-0000-0000-0000000000cc', '19191919-0000-0000-0000-00000000000a'),
  ('19191919-0000-0000-0000-0000000000cc', '19191919-0000-0000-0000-00000000000b');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- The caller's view through couple_name(), as one text for easy comparison.
create function pg_temp.seen() returns text language sql as $$
  select coalesce((select format('%s|%s|%s', name, proposal, proposed_by_me) from public.couple_name()), 'no row')
$$;

-- ---------------------------------------------------------------------------
-- Propose, confirm, clear
-- ---------------------------------------------------------------------------

select pg_temp.login('19191919-0000-0000-0000-00000000000a');
select is(pg_temp.seen(), '||', 'a linked couple starts without a name or proposal');
select is(public.set_couple_name('  Wild   Ones '), 'proposed', 'A proposes a name');
select is(pg_temp.seen(), '|Wild Ones|t', 'A sees her proposal, trimmed, waiting for B');
select throws_ok($$ select public.confirm_couple_name() $$, 'P0001', 'no_proposal', 'A cannot confirm her own proposal');
select throws_ok($$ select * from private.couple_names $$, '42501', null, 'A cannot read the name off its table');
select is(
  (select array_agg(key order by key) from public.couples c, jsonb_object_keys(to_jsonb(c)) key),
  array['created_at', 'ended_at', 'id'],
  'the couples row holds no name'
);

select pg_temp.login('19191919-0000-0000-0000-00000000000b');
select is(pg_temp.seen(), '|Wild Ones|f', 'the partner sees A''s proposal');
select throws_ok(
  $$ select public.confirm_couple_name('Other Name') $$, 'P0001', 'no_proposal',
  'the partner cannot confirm a name other than the one proposed'
);
select is(public.confirm_couple_name('Wild Ones'), 'named', 'the partner confirms it');
select is(pg_temp.seen(), 'Wild Ones||', 'the name is set and the proposal gone');
select throws_ok($$ update private.couple_names set name = 'Mine' $$, '42501', null,
  'the partner cannot write the name directly');

select pg_temp.login('19191919-0000-0000-0000-00000000000a');
select is(pg_temp.seen(), 'Wild Ones||', 'A reads the agreed name');

-- A new proposal leaves the name until the partner agrees; sending back the same name agrees.
select is(public.set_couple_name('Night Owls'), 'proposed', 'A proposes a new name');
select is(pg_temp.seen(), 'Wild Ones|Night Owls|t', 'the old name stays while the new one waits');
select pg_temp.login('19191919-0000-0000-0000-00000000000b');
select is(public.set_couple_name('Night Owls'), 'named', 'B sends the same name back, which agrees to it');
select is(pg_temp.seen(), 'Night Owls||', 'the new name is set');

-- Either side clears alone.
select is(public.set_couple_name('Ēriks un Маша'), 'proposed', 'B proposes a name in two scripts');
select lives_ok($$ select public.clear_couple_name() $$, 'B clears the name alone');
select is(pg_temp.seen(), '||', 'clearing removes the name and the proposal');
select pg_temp.login('19191919-0000-0000-0000-00000000000a');
select is(pg_temp.seen(), '||', 'A sees it cleared');
select throws_ok($$ select public.confirm_couple_name() $$, 'P0001', 'no_proposal', 'nothing is left to confirm');

-- ---------------------------------------------------------------------------
-- The word filter
-- ---------------------------------------------------------------------------

select throws_ok($$ select public.set_couple_name('A') $$, 'P0001', 'name_invalid', 'one character is too short');
select throws_ok(
  $$ select public.set_couple_name(repeat('a', 31)) $$, 'P0001', 'name_invalid', 'thirty-one characters are too long'
);
select throws_ok($$ select public.set_couple_name('   ') $$, 'P0001', 'name_invalid', 'blank is no name');
select throws_ok($$ select public.set_couple_name(null) $$, 'P0001', 'name_invalid', 'null is no name');
select throws_ok($$ select public.set_couple_name('--') $$, 'P0001', 'name_invalid', 'a name needs a letter or digit');
select throws_ok($$ select public.set_couple_name('Us & Them') $$, 'P0001', 'name_invalid', 'no symbols');
select throws_ok($$ select public.set_couple_name('we_two') $$, 'P0001', 'name_invalid', 'no underscores');
select throws_ok($$ select public.set_couple_name('Us 😀') $$, 'P0001', 'name_invalid', 'no emoji');
select throws_ok($$ select public.set_couple_name('Fuckers') $$, 'P0001', 'name_blocked', 'a blocked word');
select throws_ok($$ select public.set_couple_name('s h i t') $$, 'P0001', 'name_blocked', 'a blocked word spaced out');
select throws_ok($$ select public.set_couple_name('Big S-H-I-T') $$, 'P0001', 'name_blocked',
  'a blocked word hyphenated');
select throws_ok($$ select public.set_couple_name('Sh1t Happens') $$, 'P0001', 'name_blocked',
  'a blocked word with a digit for a letter');
select throws_ok($$ select public.set_couple_name('ХУЙ') $$, 'P0001', 'name_blocked', 'a Cyrillic blocked word');
select throws_ok($$ select public.set_couple_name('Cyka') $$, 'P0001', 'name_blocked',
  'a Cyrillic word in Latin lookalikes');
select throws_ok($$ select public.set_couple_name('Pimpis') $$, 'P0001', 'name_blocked', 'a Latvian blocked word');
select is(pg_temp.seen(), '||', 'no rejected name became a proposal');

select is(public.set_couple_name('Scunthorpe Fans'), 'proposed', 'a blocked word inside a town''s name passes');
select is(public.set_couple_name('The Therapists'), 'proposed', 'a blocked word inside another word passes');
select is(public.set_couple_name('Страхуй'), 'proposed', 'a short Cyrillic entry inside a word passes');
select is(public.set_couple_name('O''Brien-Kalniņa 2'), 'proposed', 'apostrophes, hyphens, and digits pass');

-- The filter grows after a proposal: confirming re-checks it.
reset role;
insert into private.blocked_words (word) values ('kalnina');
select pg_temp.login('19191919-0000-0000-0000-00000000000b');
select throws_ok($$ select public.confirm_couple_name() $$, 'P0001', 'name_blocked',
  'a proposal the grown filter blocks cannot be confirmed');

-- ---------------------------------------------------------------------------
-- Strangers, anon, and the unlink
-- ---------------------------------------------------------------------------

select pg_temp.login('19191919-0000-0000-0000-000000000005');
select is(pg_temp.seen(), 'no row', 'a stranger sees no couple name');
select throws_ok($$ select public.set_couple_name('Lone Wolf') $$, 'P0001', 'not_linked', 'a stranger cannot propose');
select throws_ok($$ select public.confirm_couple_name() $$, 'P0001', 'not_linked', 'nor confirm');
select throws_ok($$ select public.clear_couple_name() $$, 'P0001', 'not_linked', 'nor clear');
select throws_ok($$ select private.name_is_blocked('x') $$, '42501', null, 'a user cannot probe the filter directly');
select throws_ok($$ select * from private.blocked_words $$, '42501', null, 'nor read the blocked words');

reset role;
set local role anon;
select throws_ok($$ select * from public.couple_name() $$, '42501', null, 'anon cannot read a name');
select throws_ok($$ select public.set_couple_name('Anon Team') $$, '42501', null, 'anon cannot propose one');
reset role;

select pg_temp.login('19191919-0000-0000-0000-00000000000a');
select is(public.set_couple_name('Wild Ones'), 'proposed', 'A proposes again');
select pg_temp.login('19191919-0000-0000-0000-00000000000b');
select is(public.confirm_couple_name(), 'named', 'B confirms');
select lives_ok($$ select public.unlink() $$, 'B unlinks');
select is(pg_temp.seen(), 'no row', 'B no longer sees the name');
select pg_temp.login('19191919-0000-0000-0000-00000000000a');
select is(pg_temp.seen(), 'no row', 'nor does A');
select throws_ok($$ select public.set_couple_name('Solo Act') $$, 'P0001', 'not_linked', 'nor can A name the old couple');
reset role;
select is(
  (select count(*)::int from private.couple_names where couple_id = '19191919-0000-0000-0000-0000000000cc'),
  0, 'the unlink clears the name and any proposal'
);

select * from finish();
rollback;
