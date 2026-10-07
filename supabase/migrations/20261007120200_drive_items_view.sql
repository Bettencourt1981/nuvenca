-- =============================================================================
-- Nuvenca — read model for file lists
-- =============================================================================

-- Name shown for a user in file lists ("Owner" column). Only callable by
-- signed-in users; ids are not guessable and only come from rows they can see.
create function public.profile_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), p.email)
    from public.profiles p
   where p.id = p_user_id and (select auth.uid()) is not null;
$$;

-- Files plus what the list UI needs: the caller's access level, whether they
-- starred it, and the owner's name. `security_invoker` makes RLS on `files`
-- apply to the caller.
create view public.drive_items
with (security_invoker = true)
as
select
  f.id,
  f.workspace_id,
  f.parent_id,
  f.ancestor_ids,
  f.kind,
  f.name,
  f.mime_type,
  f.size_bytes,
  f.status,
  f.created_by,
  f.created_at,
  f.updated_at,
  f.trashed_at,
  f.in_trash,
  public.file_path_access_level(f.workspace_id, f.ancestor_ids || f.id) as access_level,
  exists (
    select 1 from public.file_stars s
     where s.file_id = f.id and s.user_id = (select auth.uid())
  ) as starred,
  public.profile_display_name(f.created_by) as owner_name
from public.files f;

revoke all on public.drive_items from anon;
revoke insert, update, delete, truncate on public.drive_items from authenticated;
grant select on public.drive_items to authenticated;

grant execute on function public.profile_display_name(uuid) to authenticated;
