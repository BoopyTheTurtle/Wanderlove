-- "Recovery code viewed on" (abuse-threat-model.md, misuse K2).
--
-- The phone calls mark_recovery_viewed when it shows the recovery code, and Profile shows the date, so a code someone
-- else read first gives itself away. Only the owner reads the column, through user_keys' read-own policy. Nobody writes
-- it directly: the RPC records the first viewing only and never clears it, and a new recovery code clears it, since
-- nobody has seen that code yet.

alter table public.user_keys add column recovery_viewed_at timestamptz;

create function private.reset_recovery_viewed()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.recovery_blob is distinct from old.recovery_blob then
    new.recovery_viewed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.reset_recovery_viewed() from public, anon, authenticated;

create trigger user_keys_reset_recovery_viewed
  before update on public.user_keys
  for each row execute function private.reset_recovery_viewed();

-- Returns when the current code was first viewed, or null when the account has no recovery code.
create function public.mark_recovery_viewed()
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  viewed timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.user_keys
  set recovery_viewed_at = coalesce(recovery_viewed_at, now())
  where user_id = auth.uid() and recovery_blob is not null
  returning recovery_viewed_at into viewed;
  return viewed;
end;
$$;

revoke all on function public.mark_recovery_viewed() from public, anon;
grant execute on function public.mark_recovery_viewed() to authenticated;
