-- Task history and the mobility setting (mvp-roadmap.md, stage 3: quest engine).
--
-- The quest engine skips tasks a pair has done before, so the server keeps one row per task done or skipped, keyed
-- on the two people rather than on the couple row. A relink of the same two people therefore finds its old history,
-- and either of them with a new partner starts fresh. A "Just me" quest records under its player alone
-- (person_low = person_high), so the partner never sees it (private-trails.md; abuse-threat-model.md).
--
-- Access rules:
--   * Read: either person of the pair, at any time, linked or not. They did those tasks together, and rows stop
--     growing at the unlink, so reading after it reveals nothing new. A solo row reads only for its player.
--   * Insert: a row for yourself alone, or for you and the partner you are linked to right now. The server stamps the
--     time; the client cannot backdate.
--   * No update or delete: the history is append-only. Deleting an account cascades its rows away.
-- The rows hold no trail, place, or photo, and nothing trims them: they outlive the one-month photo deletion and the
-- trail trim, which stage 3 relies on to keep tasks fresh.

create table public.task_history (
  id bigint generated always as identity primary key,
  person_low uuid not null references public.profiles (id) on delete cascade,
  person_high uuid not null references public.profiles (id) on delete cascade,
  task_id text not null check (char_length(task_id) between 1 and 64),
  outcome text not null check (outcome in ('done', 'skipped')),
  at timestamptz not null default now(),
  -- An unordered pair: the smaller id comes first. Equal ids mark a solo quest.
  check (person_low <= person_high)
);
create index task_history_pair_idx on public.task_history (person_low, person_high);
create index task_history_person_high_idx on public.task_history (person_high);

-- True when p_user is the other member of the caller's active couple.
create function private.is_partner(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user is distinct from auth.uid() and exists (
    select 1 from public.couple_members cm
    where cm.couple_id = private.active_couple_id(auth.uid()) and cm.user_id = p_user
  )
$$;

revoke all on function private.is_partner(uuid) from public, anon;
grant execute on function private.is_partner(uuid) to authenticated;

alter table public.task_history enable row level security;
revoke all on public.task_history from anon, authenticated;
grant select, insert (person_low, person_high, task_id, outcome) on public.task_history to authenticated;

create policy "task_history: read own pairs" on public.task_history
  for select to authenticated
  using (auth.uid() in (person_low, person_high));

create policy "task_history: insert for self or current partner" on public.task_history
  for insert to authenticated
  with check (
    (person_low = auth.uid() and person_high = auth.uid())
    or (person_low = auth.uid() and private.is_partner(person_high))
    or (person_high = auth.uid() and private.is_partner(person_low))
  );

-- Mobility: true means the person prefers tasks without movement, so the quest engine leaves out tasks tagged `move`.
-- Only the owner reads it (profiles: read self) and writes it (profiles: update self, through the column grant);
-- profile_cards does not expose it to the partner.
alter table public.profiles add column mobility boolean not null default false;
grant update (mobility) on public.profiles to authenticated;
