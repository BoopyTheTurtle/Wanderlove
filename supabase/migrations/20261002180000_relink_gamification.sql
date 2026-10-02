-- Relinking keeps the stage 9 additions as it keeps the totals (20261002120000).
--
-- Unlink now also archives, under the two people, the couple's rhythm goal and its pause, its badges, and each quest's
-- share points; a relink of the same two people within 90 days restores them with the rest. The rhythm itself needs
-- nothing more: it reads quest_points, which the archive already carries.
--
-- Unlink deletes, without archiving, what belongs to the moment: the planned walk, and photo-share proposals still
-- waiting or approved. Shared and declined proposals stay with the old couple as the record behind the weekly cap.
--
-- Access rules: unchanged. private.archived_badges, like the other archive tables, has no grants at all.

alter table private.couple_archives
  add column rhythm_goal text check (rhythm_goal in ('weekly', 'twice_monthly')),
  add column rhythm_paused boolean not null default false;

alter table private.archived_quest_points add column share_points int not null default 0;

create table private.archived_badges (
  user_lo uuid not null,
  user_hi uuid not null,
  badge text not null,
  earned_on date not null,
  primary key (user_lo, user_hi, badge),
  foreign key (user_lo, user_hi) references private.couple_archives (user_lo, user_hi) on delete cascade
);

alter table private.archived_badges enable row level security;
revoke all on private.archived_badges from public, anon, authenticated;

-- Unchanged from 20261002120000, except that quest points carry their share points, and the rhythm goal and badges
-- come back too.
create or replace function private.restore_couple(p_couple uuid, p_lo uuid, p_hi uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a private.couple_archives;
begin
  perform private.purge_couple_archives();

  select * into a from private.couple_archives
  where user_lo = p_lo and user_hi = p_hi and unlinked_at > now() - interval '90 days'
  for update;
  if a.user_lo is null then
    return;
  end if;

  if a.quests_done + a.photos_taken + a.challenges_done + a.points > 0 then
    insert into public.couple_stats as s (couple_id, quests_done, photos_taken, challenges_done, points)
    values (p_couple, a.quests_done, a.photos_taken, a.challenges_done, a.points)
    on conflict (couple_id) do update set
      quests_done = s.quests_done + excluded.quests_done,
      photos_taken = s.photos_taken + excluded.photos_taken,
      challenges_done = s.challenges_done + excluded.challenges_done,
      points = s.points + excluded.points,
      updated_at = now();
  end if;

  insert into public.quest_points (run_id, couple_id, week_start, stop_points, photo_points, finish_points, week_bonus,
    share_points, updated_at)
  select q.run_id, p_couple, q.week_start, q.stop_points, q.photo_points, q.finish_points, q.week_bonus,
    q.share_points, q.updated_at
  from private.archived_quest_points q
  where q.user_lo = p_lo and q.user_hi = p_hi
  on conflict (run_id) do nothing;

  if a.name is not null or a.proposal is not null then
    insert into private.couple_names (couple_id, name, proposal, proposed_by)
    values (p_couple, a.name, a.proposal, case when a.proposal is not null then a.proposed_by end)
    on conflict (couple_id) do nothing;
  end if;

  if a.rhythm_goal is not null then
    insert into private.rhythm_goals (couple_id, goal, paused)
    values (p_couple, a.rhythm_goal, a.rhythm_paused)
    on conflict (couple_id) do nothing;
  end if;

  insert into private.badges (couple_id, badge, earned_on)
  select p_couple, b.badge, b.earned_on
  from private.archived_badges b
  where b.user_lo = p_lo and b.user_hi = p_hi
  on conflict do nothing;

  delete from private.couple_archives where user_lo = p_lo and user_hi = p_hi;
end;
$$;

revoke all on function private.restore_couple(uuid, uuid, uuid) from public, anon, authenticated;

-- Unchanged from 20261002120000, except that it archives the rhythm goal, badges, and share points, and deletes the
-- planned walk, open share proposals, the goal, and the badges with the rest.
create or replace function public.unlink()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  couple uuid := private.active_couple_id(auth.uid());
  lo uuid;
  hi uuid;
begin
  if couple is null then
    return;
  end if;

  select min(m.user_id::text)::uuid, max(m.user_id::text)::uuid into lo, hi
  from public.couple_members m where m.couple_id = couple;
  perform pg_advisory_xact_lock(hashtext(lo::text));
  perform pg_advisory_xact_lock(hashtext(hi::text));
  if exists (select 1 from public.couples where id = couple and ended_at is not null) then
    return;
  end if;

  update public.couples set ended_at = now() where id = couple;
  update public.trail_runs set abandoned_at = now()
  where couple_id = couple and completed_at is null and abandoned_at is null;
  delete from public.run_invites i
  using public.trail_runs r
  where r.id = i.run_id and r.couple_id = couple;

  perform private.purge_couple_archives();
  if lo <> hi then
    delete from private.couple_archives where user_lo = lo and user_hi = hi;
    insert into private.couple_archives (user_lo, user_hi, quests_done, photos_taken, challenges_done, points, name,
      proposal, proposed_by, rhythm_goal, rhythm_paused)
    select lo, hi,
      coalesce(s.quests_done, 0), coalesce(s.photos_taken, 0), coalesce(s.challenges_done, 0), coalesce(s.points, 0),
      n.name, n.proposal, n.proposed_by, g.goal, coalesce(g.paused, false)
    from (select 1) one
    left join public.couple_stats s on s.couple_id = couple
    left join private.couple_names n on n.couple_id = couple
    left join private.rhythm_goals g on g.couple_id = couple;
    insert into private.archived_quest_points (run_id, user_lo, user_hi, week_start, stop_points, photo_points,
      finish_points, week_bonus, share_points, updated_at)
    select q.run_id, lo, hi, q.week_start, q.stop_points, q.photo_points, q.finish_points, q.week_bonus,
      q.share_points, q.updated_at
    from public.quest_points q
    where q.couple_id = couple;
    insert into private.archived_badges (user_lo, user_hi, badge, earned_on)
    select lo, hi, b.badge, b.earned_on
    from private.badges b
    where b.couple_id = couple;
  end if;

  delete from public.couple_stats where couple_id = couple;
  delete from private.couple_names where couple_id = couple;
  delete from public.quest_points where couple_id = couple;
  delete from private.leaderboard_yes where couple_id = couple;
  delete from private.league_seats where couple_id = couple;
  delete from private.rhythm_goals where couple_id = couple;
  delete from private.badges where couple_id = couple;
  delete from private.planned_walks where couple_id = couple;
  delete from private.photo_shares where couple_id = couple and status in ('pending', 'approved');
end;
$$;
