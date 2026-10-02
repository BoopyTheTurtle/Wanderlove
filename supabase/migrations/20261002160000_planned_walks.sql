-- Plan the next walk (mvp-roadmap.md, stage 9; gamification.md, section 4.4): an invitation, never a duty.
--
-- A couple has at most one open plan: a day and a rough time ('morning', 'afternoon', or 'evening'). Either partner
-- plans it, replacing any plan before it, and either cancels it; each puts a walk_planned or walk_plan_cancelled item
-- in the partner's feed, replacing any walk item the partner has not read, so changes never pile up (X2). Nothing
-- follows when a plan passes: from the day after its day, my_planned_walk stops returning it, and the next plan or the
-- unlink deletes it. Unlinking deletes the plan; a relink does not bring it back.
--
-- Access rules:
--   * private.planned_walks: no grants at all. Members of the active couple reach their plan only through
--     plan_walk, my_planned_walk, and cancel_planned_walk. An ex and strangers reach nothing.

create table private.planned_walks (
  couple_id uuid primary key references public.couples (id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('morning', 'afternoon', 'evening')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table private.planned_walks enable row level security;
revoke all on private.planned_walks from public, anon, authenticated;

-- Tells the partner of a plan or a cancellation, replacing any walk item they have not read yet, so a run of changes
-- leaves one item (abuse-threat-model.md, X2).
create function private.feed_walk(p_from uuid, p_kind text, p_day date, p_slot text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  partner uuid := private.partner_of(p_from);
begin
  delete from private.feed_items f
  where f.user_id = partner and f.read_at is null and f.kind in ('walk_planned', 'walk_plan_cancelled');
  perform private.feed_push(partner, p_kind, jsonb_build_object('day', p_day, 'slot', p_slot));
end;
$$;

revoke all on function private.feed_walk(uuid, text, date, text) from public, anon, authenticated;

-- Plans the couple's next walk for p_day (today to 60 days ahead, Riga) at p_slot, replacing any plan. Raises
-- not_linked, slot_invalid, or day_invalid.
create function public.plan_walk(p_day date, p_slot text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  today date := (now() at time zone 'Europe/Riga')::date;
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple plans a walk';
  end if;
  if p_slot is null or p_slot not in ('morning', 'afternoon', 'evening') then
    raise exception 'slot_invalid' using errcode = 'P0001', detail = 'p_slot must be morning, afternoon, or evening';
  end if;
  if p_day is null or p_day < today or p_day > today + 60 then
    raise exception 'day_invalid' using errcode = 'P0001', detail = 'p_day must fall within the next 60 days';
  end if;
  insert into private.planned_walks (couple_id, day, slot, created_by) values (couple, p_day, p_slot, me)
  on conflict (couple_id) do update
    set day = excluded.day, slot = excluded.slot, created_by = excluded.created_by, created_at = now();
  perform private.feed_walk(me, 'walk_planned', p_day, p_slot);
end;
$$;

-- The couple's open plan, if its day has not passed. planned_by_me says which side made it.
create function public.my_planned_walk()
returns table (day date, slot text, planned_by_me boolean)
language sql stable security definer set search_path = ''
as $$
  select w.day, w.slot, w.created_by = auth.uid()
  from private.planned_walks w
  where w.couple_id = private.active_couple_id(auth.uid())
    and w.day >= (now() at time zone 'Europe/Riga')::date
$$;

-- Cancels the couple's open plan. Either partner may. Returns false when there was no open plan, which adds nothing to
-- the partner's feed. Raises not_linked.
create function public.cancel_planned_walk()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  couple uuid := private.active_couple_id(auth.uid());
  w private.planned_walks;
begin
  if couple is null then
    raise exception 'not_linked' using errcode = 'P0001', detail = 'only a linked couple plans a walk';
  end if;
  delete from private.planned_walks p where p.couple_id = couple returning * into w;
  if w.couple_id is null or w.day < (now() at time zone 'Europe/Riga')::date then
    return false;
  end if;
  perform private.feed_walk(me, 'walk_plan_cancelled', w.day, w.slot);
  return true;
end;
$$;

revoke all on function public.plan_walk(date, text) from public, anon;
revoke all on function public.my_planned_walk() from public, anon;
revoke all on function public.cancel_planned_walk() from public, anon;
grant execute on function public.plan_walk(date, text) to authenticated;
grant execute on function public.my_planned_walk() to authenticated;
grant execute on function public.cancel_planned_walk() to authenticated;
