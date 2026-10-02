-- Quiet unlink (abuse-threat-model.md, section 6, decision 3; misuses P3 and N3).
--
-- An unlink now freezes the couple's past: no member may add a photo to any of the couple's runs, so the 24-hour grace
-- window after a finished trail closes too. And neither side can learn who ended the link: unlink no longer records
-- it, the old records are cleared, and the column is no longer readable. Nothing in the app reads couples.ended_by;
-- a cleanup migration can drop it.

-- Unchanged from 20260929180000, except that a couple's run takes photos only while the couple lasts. Runs without a
-- couple (solo, Just me) are unaffected.
create or replace function private.can_add_photo(p_run uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.trail_runs r
    where r.id = p_run
      and r.abandoned_at is null
      and (r.completed_at is null or r.completed_at > now() - interval '24 hours')
      and (r.couple_id is null or exists (
        select 1 from public.couples c where c.id = r.couple_id and c.ended_at is null
      ))
  )
$$;

-- Unchanged from the initial schema, except that it leaves ended_by empty and drops the couple's open run invitations.
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
end;
$$;

update public.couples set ended_by = null where ended_by is not null;

revoke select on public.couples from authenticated;
grant select (id, created_at, ended_at) on public.couples to authenticated;
