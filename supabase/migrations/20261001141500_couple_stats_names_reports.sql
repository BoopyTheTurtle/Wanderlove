-- Couple totals and name (mvp-roadmap.md, stage 7, without points) and stop reports (stage 11).
--
-- 1. couple_stats keeps lifetime totals per couple: quests done, photos taken, challenges (stops) done. Triggers count
--    them as they happen, so the photo deletion after a month never lowers them. Only couple runs count: a Just me or
--    solo run has no couple, so the partner learns nothing about it. A stop counts once per run, whoever completed it
--    (abuse-threat-model.md, M2: the couple's progress, never "who completed"). Unlinking clears the row.
-- 2. A couple's name needs both partners' yes, and either clears it alone (G4). set_couple_name records a proposal; the
--    partner's confirm_couple_name, or the same name sent back through set_couple_name, makes it the name. A word filter
--    on the server rejects malformed names and names with a blocked word; private.blocked_words holds the list.
-- 3. stop_reports holds users' reports of a stop as unsafe or unpleasant: the stop's position, rounded to 5 decimals
--    (about a metre), and never a start or path. Clients reach it only through report_stop and reported_places, which
--    returns positions alone. Edgar reviews reports in the dashboard by setting status; a dismissed report drops out.
--
-- Access rules:
--   * couple_stats: members of the active couple read their row; nobody writes it but the triggers.
--   * The name and proposal (private.couple_names): read only through couple_name(), for the active couple. An ex
--     never reads them, and unlink clears them.
--   * stop_reports: no grants at all. report_stop writes, reported_places reads, both for signed-in users.

-- ---------------------------------------------------------------------------
-- Couple totals
-- ---------------------------------------------------------------------------

create table public.couple_stats (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  quests_done int not null default 0 check (quests_done >= 0),
  photos_taken int not null default 0 check (photos_taken >= 0),
  challenges_done int not null default 0 check (challenges_done >= 0),
  updated_at timestamptz not null default now()
);

alter table public.couple_stats enable row level security;
revoke all on public.couple_stats from anon, authenticated;
grant select on public.couple_stats to authenticated;

-- A couple without a row yet has done nothing: the app reads a missing row as zeros.
create policy "couple_stats: read active couple" on public.couple_stats
  for select to authenticated using (couple_id = private.active_couple_id(auth.uid()));

-- Adds to the totals of a run's couple, while the couple lasts. A run without a couple adds nothing.
create function private.count_for_couple(p_run uuid, p_quests int, p_photos int, p_challenges int)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.couple_stats as s (couple_id, quests_done, photos_taken, challenges_done)
  select r.couple_id, p_quests, p_photos, p_challenges
  from public.trail_runs r
  join public.couples c on c.id = r.couple_id and c.ended_at is null
  where r.id = p_run
  on conflict (couple_id) do update set
    quests_done = s.quests_done + excluded.quests_done,
    photos_taken = s.photos_taken + excluded.photos_taken,
    challenges_done = s.challenges_done + excluded.challenges_done,
    updated_at = now()
$$;

-- A run counts once, when it first becomes completed; the trim's rounding of completed_at counts nothing.
create function private.count_quest()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.completed_at is null and new.completed_at is not null and new.couple_id is not null then
    perform private.count_for_couple(new.id, 1, 0, 0);
  end if;
  return null;
end;
$$;

create function private.count_photo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.count_for_couple(new.run_id, 0, 1, 0);
  return null;
end;
$$;

-- stop_completions keys on (run_id, stop_id), so each stop of a run inserts once, whichever member completes it.
create function private.count_challenge()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.count_for_couple(new.run_id, 0, 0, 1);
  return null;
end;
$$;

revoke all on function private.count_for_couple(uuid, int, int, int) from public, anon, authenticated;
revoke all on function private.count_quest() from public, anon, authenticated;
revoke all on function private.count_photo() from public, anon, authenticated;
revoke all on function private.count_challenge() from public, anon, authenticated;

create trigger trail_runs_count_quest
  after update of completed_at on public.trail_runs
  for each row execute function private.count_quest();
create trigger photos_count_photo
  after insert on public.photos
  for each row execute function private.count_photo();
create trigger stop_completions_count_challenge
  after insert on public.stop_completions
  for each row execute function private.count_challenge();

-- Backfill every active couple from its history. Photos the retention job already deleted are gone and cannot count.
insert into public.couple_stats (couple_id, quests_done, photos_taken, challenges_done)
select c.id,
  (select count(*) from public.trail_runs r where r.couple_id = c.id and r.completed_at is not null),
  (select count(*) from public.photos p join public.trail_runs r on r.id = p.run_id where r.couple_id = c.id),
  (select count(*) from public.stop_completions s join public.trail_runs r on r.id = s.run_id where r.couple_id = c.id)
from public.couples c
where c.ended_at is null;

-- ---------------------------------------------------------------------------
-- Couple name: the word filter
-- ---------------------------------------------------------------------------

-- Words no couple name may hold. Edgar extends the list in the dashboard; no migration needed. Entries match
-- case-insensitively, ignoring ё/е, Latvian diacritics, spaces, apostrophes, and hyphens. An entry blocks a name when
-- it equals one of the name's words (or that word without a plural "s"), the whole name with its spaces removed ("s h
-- i t"), or a run of single letters in it. inside_words also blocks it anywhere inside a word: keep that for long
-- entries no innocent word contains, since "cunt" inside "Scunthorpe" is the classic false positive.
create table private.blocked_words (
  word text primary key check (char_length(word) between 2 and 40),
  inside_words boolean not null default false
);

revoke all on private.blocked_words from public, anon, authenticated;

-- STARTER LIST: Edgar must review it before launch. Common profanity, sexual terms, and slurs in English, Latvian
-- (Latin script), and Russian (Cyrillic and Latin transliteration). Short or ambiguous entries match whole words only.
insert into private.blocked_words (word, inside_words) values
  -- English: inside words (long and unambiguous)
  ('fuck', true), ('motherfucker', true), ('faggot', true), ('asshole', true), ('arsehole', true),
  ('bullshit', true), ('shithead', true), ('dipshit', true), ('dickhead', true), ('cocksucker', true),
  ('wanker', true), ('blowjob', true), ('handjob', true), ('dildo', true), ('pedophile', true),
  ('paedophile', true), ('retarded', true), ('raghead', true), ('towelhead', true), ('wetback', true),
  ('hitler', true), ('bitch', true), ('bastard', true), ('whore', true),
  -- English: whole words (rapist sits inside "therapist", pussy inside "pussycat", slut inside "Slutsk")
  ('rapist', false), ('pussy', false), ('slut', false), ('shit', false), ('ass', false), ('arse', false), ('cunt', false), ('cock', false), ('dick', false),
  ('twat', false), ('piss', false), ('cum', false), ('jizz', false), ('tits', false), ('boobs', false),
  ('wank', false), ('prick', false), ('porn', false), ('porno', false), ('rape', false), ('fag', false),
  ('dyke', false), ('tranny', false), ('retard', false), ('nigger', false), ('nigga', false), ('kike', false),
  ('spic', false), ('chink', false), ('gook', false), ('coon', false), ('paki', false), ('beaner', false),
  ('nazi', false), ('kkk', false), ('1488', false), ('pedo', false), ('paedo', false), ('incest', false),
  -- Latvian: inside words
  ('pimpis', true), ('pizdec', true), ('pederasts', true), ('nahuj', true),
  -- Latvian: whole words
  -- (sūds folds to the English "suds", and bļa to "bla", so neither is listed)
  ('pizda', false), ('dirsa', false), ('mauka', false), ('kuce', false), ('pidars', false), ('pists', false),
  ('pisties', false), ('nēģeris', false), ('žīds', false), ('čurka', false),
  -- Russian in Latin transliteration: whole words (huy and hui are also Vietnamese and Chinese names)
  ('khuy', false), ('blyat', false), ('blyad', false), ('suka', false),
  ('mudak', false), ('pidor', false), ('pidoras', false), ('gandon', false), ('zalupa', false), ('ebat', false),
  ('yebat', false), ('nahui', false), ('nahuy', false), ('debil', false), ('shlyukha', false),
  -- Russian in Cyrillic: inside words
  ('пизд', true), ('хуесос', true), ('хуёв', true), ('долбоёб', true), ('уёбок', true), ('пидор', true),
  ('пидар', true), ('залупа', true), ('шлюха', true), ('говно', true), ('мудак', true), ('ебанут', true),
  -- Russian in Cyrillic: whole words (хуй sits inside "страхуй", ебан inside "колебание", жид inside "жидкий")
  ('хуй', false), ('хуи', false), ('хуйня', false), ('нахуй', false), ('бля', false), ('блять', false),
  ('блядь', false), ('сука', false), ('сучка', false), ('ебать', false), ('ебал', false), ('ебан', false),
  ('ебаный', false), ('гондон', false), ('шалава', false), ('дебил', false), ('жопа', false), ('срать', false),
  ('жид', false), ('чурка', false), ('хач', false), ('ниггер', false), ('пидорас', false);

-- Lowercase, composed, with ё as е and Latvian diacritics dropped, so "Sūds" and "suds" compare equal.
create function private.fold_name(p_text text)
returns text
language sql immutable set search_path = ''
as $$
  select translate(lower(normalize(p_text, NFC)), 'ёāčēģīķļņšūž', 'еacegiklnsuz')
$$;

-- True when the name holds a blocked word. Each name is checked as written, with digits read as letters ("sh1t"), and
-- with lookalike letters swapped between Latin and Cyrillic, both with punctuation removed and with it as a space.
create function private.name_is_blocked(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  base text := private.fold_name(p_name);
  spellings text[] := '{}';
  words text[] := '{}';
  compacts text[] := '{}';
  v text;
  t text;
  letters text;
begin
  foreach v in array array[regexp_replace(base, '[''’-]', '', 'g'), regexp_replace(base, '[''’-]', ' ', 'g')] loop
    spellings := spellings
      || v
      || translate(v, '013457', 'oieast')
      || translate(v, 'асеорхукі', 'aceopxyki')
      || translate(v, 'aceopxyk', 'асеорхук');
  end loop;

  foreach v in array spellings loop
    v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
    compacts := compacts || replace(v, ' ', '');
    letters := '';
    foreach t in array string_to_array(v, ' ') loop
      words := words || t;
      if char_length(t) > 3 and right(t, 1) = 's' then
        words := words || left(t, -1);
      end if;
      if char_length(t) = 1 then
        letters := letters || t;
      else
        if char_length(letters) > 1 then
          words := words || letters;
        end if;
        letters := '';
      end if;
    end loop;
    if char_length(letters) > 1 then
      words := words || letters;
    end if;
  end loop;

  return exists (
    select 1
    from private.blocked_words b
    cross join lateral (select regexp_replace(private.fold_name(b.word), '[\s''’-]', '', 'g') as w) e
    where e.w = any (words)
      or e.w = any (compacts)
      or (b.inside_words and exists (select 1 from unnest(compacts) c where strpos(c, e.w) > 0))
  );
end;
$$;

-- Returns the name as stored: composed, trimmed, runs of spaces made one. Raises name_invalid unless it is 2 to 30
-- characters of letters (any script), digits, spaces, apostrophes, and hyphens with at least one letter or digit, and
-- name_blocked when it holds a blocked word.
create function private.clean_couple_name(p_name text)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  cleaned text := btrim(regexp_replace(normalize(coalesce(p_name, ''), NFC), '\s+', ' ', 'g'));
begin
  if char_length(cleaned) not between 2 and 30
     or cleaned !~ '^[[:alpha:][:digit:] ''’-]+$'
     or cleaned !~ '[[:alpha:][:digit:]]' then
    raise exception 'name_invalid' using errcode = 'P0001',
      detail = 'a couple name is 2 to 30 letters, digits, spaces, apostrophes, or hyphens';
  end if;
  if private.name_is_blocked(cleaned) then
    raise exception 'name_blocked' using errcode = 'P0001', detail = 'the name holds a word the filter blocks';
  end if;
  return cleaned;
end;
$$;

revoke all on function private.fold_name(text) from public, anon, authenticated;
revoke all on function private.name_is_blocked(text) from public, anon, authenticated;
revoke all on function private.clean_couple_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Couple name: storage and RPCs
-- ---------------------------------------------------------------------------

-- Its own table rather than columns on couples: members read couples whole (select *), and the name must reach the
-- active couple only, never an ex. Nobody reads or writes it but the RPCs below. A couple with no row has no name and
-- no proposal. proposed_by is null when the proposer's account is gone, which leaves the proposal for neither side to
-- confirm.
create table private.couple_names (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  name text check (char_length(name) between 2 and 30),
  proposal text check (char_length(proposal) between 2 and 30),
  proposed_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.couple_names enable row level security;
revoke all on private.couple_names from public, anon, authenticated;

-- The caller's active couple's name and open proposal. No row when the caller is not linked; name null when the couple
-- has none; proposal null when nobody proposed one. proposed_by_me says which side waits for the other.
create function public.couple_name()
returns table (name text, proposal text, proposed_by_me boolean)
language sql stable security definer set search_path = ''
as $$
  select n.name, n.proposal,
    case when n.proposal is not null then n.proposed_by is not distinct from auth.uid() end
  from public.couples c
  left join private.couple_names n on n.couple_id = c.id
  where c.id = private.active_couple_id(auth.uid())
$$;

-- Proposes a name for the caller's couple, replacing any open proposal from either side. Returns 'proposed', or
-- 'named' when the partner had proposed exactly this name, or the couple already has it. Raises not_linked,
-- name_invalid, or name_blocked.
create function public.set_couple_name(p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  cleaned text;
  n private.couple_names;
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple has a name';
  end if;
  cleaned := private.clean_couple_name(p_name);

  insert into private.couple_names (couple_id) values (couple) on conflict (couple_id) do nothing;
  select * into n from private.couple_names where couple_id = couple for update;
  if n.name is not distinct from cleaned
     or (n.proposal = cleaned and n.proposed_by is distinct from me and n.proposed_by is not null) then
    update private.couple_names set name = cleaned, proposal = null, proposed_by = null, updated_at = now()
    where couple_id = couple;
    return 'named';
  end if;

  update private.couple_names set proposal = cleaned, proposed_by = me, updated_at = now() where couple_id = couple;
  return 'proposed';
end;
$$;

-- Accepts the partner's proposal as the couple's name. Pass the name the caller saw, so a proposal changed in the
-- meantime is not accepted unseen; null accepts whatever is open. Raises not_linked, no_proposal when the partner has
-- no open proposal (or it differs from p_name), or name_blocked when the filter has since grown to block it.
create function public.confirm_couple_name(p_name text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  n private.couple_names;
  cleaned text;
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple has a name';
  end if;

  select * into n from private.couple_names where couple_id = couple for update;
  if n.proposal is null or n.proposed_by is null or n.proposed_by = me
     or (p_name is not null and private.clean_couple_name(p_name) is distinct from n.proposal) then
    raise exception 'no_proposal' using errcode = 'P0001', detail = 'the partner has no open proposal for this name';
  end if;
  cleaned := private.clean_couple_name(n.proposal);

  update private.couple_names set name = cleaned, proposal = null, proposed_by = null, updated_at = now()
  where couple_id = couple;
  return 'named';
end;
$$;

-- Clears the couple's name and any open proposal. Either member may, alone. Raises not_linked.
create function public.clear_couple_name()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple has a name';
  end if;
  delete from private.couple_names where couple_id = couple;
end;
$$;

revoke all on function public.couple_name() from public, anon;
revoke all on function public.set_couple_name(text) from public, anon;
revoke all on function public.confirm_couple_name(text) from public, anon;
revoke all on function public.clear_couple_name() from public, anon;
grant execute on function public.couple_name() to authenticated;
grant execute on function public.set_couple_name(text) to authenticated;
grant execute on function public.confirm_couple_name(text) to authenticated;
grant execute on function public.clear_couple_name() to authenticated;

-- ---------------------------------------------------------------------------
-- unlink: clears the totals and the name
-- ---------------------------------------------------------------------------

-- Unchanged from 20260930170000, except for the last two statements: the couple's totals go, and so do its name and
-- any proposal, which an ex could not read anyway.
create or replace function public.unlink()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
begin
  if couple is null then
    return;
  end if;
  update public.couples set ended_at = now() where id = couple;
  update public.trail_runs set abandoned_at = now()
  where couple_id = couple and completed_at is null and abandoned_at is null;
  delete from public.run_invites i
  using public.trail_runs r
  where r.id = i.run_id and r.couple_id = couple;
  delete from public.couple_stats where couple_id = couple;
  delete from private.couple_names where couple_id = couple;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stop reports
-- ---------------------------------------------------------------------------

-- The reporter stays for Edgar's review and the rate limit; a deleted account leaves its reports unattributed.
create table public.stop_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references public.profiles (id) on delete set null,
  lat numeric(7, 5) not null check (lat between -90 and 90),
  lng numeric(8, 5) not null check (lng between -180 and 180),
  reason text not null check (reason in ('unsafe', 'unpleasant')),
  note text check (char_length(note) <= 280),
  status text not null default 'open' check (status in ('open', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now()
);
create index stop_reports_reporter_time_idx on public.stop_reports (reporter, created_at);
create index stop_reports_status_idx on public.stop_reports (status);

alter table public.stop_reports enable row level security;
revoke all on public.stop_reports from anon, authenticated;

-- Reports a stop, at most 10 times per user in 24 hours. Raises position_invalid, reason_invalid ('unsafe' or
-- 'unpleasant'), note_too_long (over 280 characters), or too_many_reports. A blank note stores as null.
create function public.report_stop(p_lat double precision, p_lng double precision, p_reason text, p_note text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_note text := nullif(btrim(p_note), '');
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'position_invalid' using errcode = 'P0001', detail = 'lat is -90 to 90 and lng -180 to 180';
  end if;
  if p_reason is null or p_reason not in ('unsafe', 'unpleasant') then
    raise exception 'reason_invalid' using errcode = 'P0001', detail = 'p_reason is unsafe or unpleasant';
  end if;
  if char_length(v_note) > 280 then
    raise exception 'note_too_long' using errcode = 'P0001', detail = 'a note holds at most 280 characters';
  end if;

  -- Serialise each user's reports, so parallel calls cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtext('stop_reports:' || me::text));
  if (select count(*) from public.stop_reports
      where reporter = me and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_reports' using errcode = 'P0001', detail = 'at most 10 reports in 24 hours';
  end if;

  insert into public.stop_reports (reporter, lat, lng, reason, note)
  values (me, round(p_lat::numeric, 5), round(p_lng::numeric, 5), p_reason, v_note);
end;
$$;

-- Every reported position still open or confirmed, once each. No reporter, reason, note, or time: the phone downloads
-- the whole list and drops nearby places from new routes, so asking reveals nothing about where it is.
create function public.reported_places()
returns table (lat double precision, lng double precision)
language sql stable security definer set search_path = ''
as $$
  select distinct r.lat::double precision, r.lng::double precision
  from public.stop_reports r
  where r.status in ('open', 'confirmed')
$$;

revoke all on function public.report_stop(double precision, double precision, text, text) from public, anon;
revoke all on function public.reported_places() from public, anon;
grant execute on function public.report_stop(double precision, double precision, text, text) to authenticated;
grant execute on function public.reported_places() to authenticated;
