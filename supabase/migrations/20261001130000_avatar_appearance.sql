-- The avatar's appearance (mvp-roadmap.md, stage 5: avatar creator).
--
-- The profile stores the avatar as a small JSON object the client builds and parses (@wannadoo/core, parseAppearance).
-- Null means no avatar chosen yet. The server checks only the shape: a JSON object under 2 KB. It stores no gender.
--
-- Access rules:
--   * The owner reads it (profiles: read self) and writes it (profiles: update self, through the column grant).
--   * The partner the owner is linked to right now reads it through profile_cards, so an edit reaches the other phone.
--   * Everyone else profile_cards shows a row to (a fellow member of an old run, either side of an open link request)
--     reads null, and so does an ex-partner after the unlink: run membership outlives the couple, so the view gates
--     the column on private.is_partner rather than on the row filter.
--   * mobility stays owner-only; profile_cards gains appearance and nothing else.

alter table public.profiles
  add column appearance jsonb
  constraint profiles_appearance_shape check (
    jsonb_typeof(appearance) = 'object' and pg_column_size(appearance) < 2048
  );

grant update (appearance) on public.profiles to authenticated;

-- Unchanged from 20260929220000, except for the appended appearance column. Appending keeps the view's grants.
create or replace view public.profile_cards
with (security_invoker = false)
as
  select p.id, p.display_name, p.username, p.avatar_path, k.public_key, k.key_id,
    case when p.id = auth.uid() or private.is_partner(p.id) then p.appearance end as appearance
  from public.profiles p
  left join public.user_keys k on k.user_id = p.id
  where private.can_see_profile(p.id);

grant select on public.profile_cards to authenticated;
