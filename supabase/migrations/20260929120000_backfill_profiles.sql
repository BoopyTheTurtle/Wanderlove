-- Accounts created before the initial schema reached the online project have no profile, because the sign-up
-- trigger fires only on new rows. Give every existing account its profile, and make sure the trigger exists.

insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
