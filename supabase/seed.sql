-- Local development only: `supabase db reset` runs this; `supabase db push` never does.
-- Three users for the dev switcher and manual testing: Daniel and Emma (a couple to be) and a stranger.
-- They sign in with email codes through the local Mailpit inbox (http://127.0.0.1:54324) or with the
-- dev-only password below.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('wannadoo-dev', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'daniel@wannadoo.test'),
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'emma@wannadoo.test'),
  ('00000000-0000-0000-0000-00000000000c'::uuid, 'stranger@wannadoo.test')
) as u (id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users
where email like '%@wannadoo.test';

-- The sign-up trigger created the profiles; finish onboarding for them.
update public.profiles p
set display_name = v.name, age_confirmed_at = now(), terms_version = 'tester-v2', terms_accepted_at = now()
from (values
  ('00000000-0000-0000-0000-00000000000a'::uuid, 'Daniel'),
  ('00000000-0000-0000-0000-00000000000b'::uuid, 'Emma'),
  ('00000000-0000-0000-0000-00000000000c'::uuid, 'Stranger')
) as v (id, name)
where p.id = v.id;
