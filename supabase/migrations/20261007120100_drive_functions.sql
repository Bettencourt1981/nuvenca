-- =============================================================================
-- Nuvenca — write operations (called through supabase.rpc)
-- =============================================================================
-- Every function checks permissions explicitly and raises short error codes
-- that the app maps to translated messages:
--   not_authenticated, not_found, forbidden, invalid_name, quota_exceeded,
--   file_too_large, member_limit_reached, user_not_found, ...

-- -----------------------------------------------------------------------------
-- Internal helpers
-- -----------------------------------------------------------------------------

create function public.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  return v_uid;
end;
$$;

create function public.clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'));
begin
  if char_length(v_name) = 0 or char_length(v_name) > 255 or v_name in ('.', '..') then
    raise exception 'invalid_name';
  end if;
  return v_name;
end;
$$;

-- Resolve where new items go: inside `p_parent_id` (needs editor access) or at
-- the root of `p_workspace_id` (needs workspace membership).
create function public.resolve_target_workspace(p_workspace_id uuid, p_parent_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parent public.files;
begin
  if p_parent_id is not null then
    v_parent := public.assert_file_access(p_parent_id, 3);
    if v_parent.kind <> 'folder' then
      raise exception 'parent_not_folder';
    end if;
    if v_parent.in_trash then
      raise exception 'parent_in_trash';
    end if;
    return v_parent.workspace_id;
  end if;

  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'forbidden';
  end if;
  return p_workspace_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Folders
-- -----------------------------------------------------------------------------

create function public.create_folder(p_workspace_id uuid, p_parent_id uuid, p_name text)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_workspace_id uuid := public.resolve_target_workspace(p_workspace_id, p_parent_id);
  v_file public.files;
begin
  insert into public.files (workspace_id, parent_id, kind, name, created_by, updated_by)
  values (v_workspace_id, p_parent_id, 'folder', public.clean_name(p_name), v_uid, v_uid)
  returning * into v_file;
  return v_file;
end;
$$;

-- -----------------------------------------------------------------------------
-- Uploads
-- -----------------------------------------------------------------------------
-- 1. begin_upload (user): checks permission + plan limits, reserves the rows,
--    returns the storage path. The server then issues a signed upload URL.
-- 2. The browser uploads straight to Storage.
-- 3. complete_upload (server only): records the real size, re-checks quota.

create function public.begin_upload(
  p_workspace_id uuid,
  p_parent_id uuid,
  p_name text,
  p_size_bytes bigint,
  p_mime_type text
)
returns table (file_id uuid, version_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_workspace_id uuid := public.resolve_target_workspace(p_workspace_id, p_parent_id);
  v_workspace public.workspaces;
  v_plan public.plans;
  v_file_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_path text;
begin
  select * into v_workspace from public.workspaces where id = v_workspace_id;
  select * into v_plan from public.plans where id = v_workspace.plan_id;

  if p_size_bytes is null or p_size_bytes < 0 then
    raise exception 'invalid_size';
  end if;
  if p_size_bytes > v_plan.max_file_size_bytes then
    raise exception 'file_too_large';
  end if;
  if v_workspace.storage_used_bytes + p_size_bytes > v_plan.storage_quota_bytes then
    raise exception 'quota_exceeded';
  end if;

  v_path := v_workspace_id || '/' || v_file_id || '/' || v_version_id;

  insert into public.files (id, workspace_id, parent_id, kind, name, mime_type, size_bytes, status, created_by, updated_by)
  values (v_file_id, v_workspace_id, p_parent_id, 'file', public.clean_name(p_name),
          nullif(btrim(coalesce(p_mime_type, '')), ''), p_size_bytes, 'uploading', v_uid, v_uid);

  insert into public.file_versions (id, file_id, workspace_id, version_number, storage_path, size_bytes, mime_type, status, created_by)
  values (v_version_id, v_file_id, v_workspace_id, 1, v_path, p_size_bytes,
          nullif(btrim(coalesce(p_mime_type, '')), ''), 'uploading', v_uid);

  return query select v_file_id, v_version_id, v_path;
end;
$$;

-- Server-side only (service role): mark an uploaded version as ready.
create function public.complete_upload(p_version_id uuid, p_size_bytes bigint, p_mime_type text)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.file_versions;
  v_workspace public.workspaces;
  v_plan public.plans;
  v_file public.files;
begin
  select * into v_version from public.file_versions where id = p_version_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_version.status = 'ready' then
    select * into v_file from public.files where id = v_version.file_id;
    return v_file;
  end if;

  select * into v_workspace from public.workspaces where id = v_version.workspace_id for update;
  select * into v_plan from public.plans where id = v_workspace.plan_id;

  if p_size_bytes > v_plan.max_file_size_bytes then
    raise exception 'file_too_large';
  end if;
  if v_workspace.storage_used_bytes + p_size_bytes > v_plan.storage_quota_bytes then
    raise exception 'quota_exceeded';
  end if;

  update public.file_versions
     set status = 'ready',
         size_bytes = p_size_bytes,
         mime_type = coalesce(nullif(p_mime_type, ''), mime_type)
   where id = p_version_id;

  update public.files
     set status = 'ready',
         size_bytes = p_size_bytes,
         mime_type = coalesce(nullif(p_mime_type, ''), mime_type),
         current_version_id = p_version_id
   where id = v_version.file_id
  returning * into v_file;

  return v_file;
end;
$$;

-- The uploader abandons an upload that has not completed. Returns the storage
-- path so the server can remove any partial object.
create function public.cancel_upload(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_path text;
begin
  select v.storage_path into v_path
    from public.files f
    join public.file_versions v on v.file_id = f.id
   where f.id = p_file_id and f.status = 'uploading' and f.created_by = v_uid
   limit 1;
  if not found then
    raise exception 'not_found';
  end if;
  delete from public.files where id = p_file_id;
  return v_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rename, move, trash, restore, delete
-- -----------------------------------------------------------------------------

create function public.rename_file(p_file_id uuid, p_name text)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_file_access(p_file_id, 3);
begin
  update public.files
     set name = public.clean_name(p_name), updated_by = v_uid
   where id = v_file.id
  returning * into v_file;
  return v_file;
end;
$$;

-- Move items into `p_target_parent_id`, or to the root of their workspace when
-- it is null. Items must stay in the same workspace.
create function public.move_files(p_file_ids uuid[], p_target_parent_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files;
  v_target public.files;
  v_id uuid;
  v_count integer := 0;
begin
  if p_target_parent_id is not null then
    v_target := public.assert_file_access(p_target_parent_id, 3);
    if v_target.kind <> 'folder' or v_target.in_trash then
      raise exception 'invalid_target';
    end if;
  end if;

  foreach v_id in array coalesce(p_file_ids, '{}') loop
    v_file := public.assert_file_access(v_id, 3);
    if v_target.id is null and not public.is_workspace_member(v_file.workspace_id) then
      raise exception 'forbidden';
    end if;
    if v_target.id is not null and v_target.workspace_id <> v_file.workspace_id then
      raise exception 'parent_other_workspace';
    end if;
    if v_file.parent_id is not distinct from p_target_parent_id then
      continue;
    end if;
    update public.files
       set parent_id = p_target_parent_id, updated_by = v_uid
     where id = v_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create function public.trash_files(p_file_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files;
  v_id uuid;
  v_count integer := 0;
begin
  foreach v_id in array coalesce(p_file_ids, '{}') loop
    v_file := public.assert_file_access(v_id, 3);
    if v_file.in_trash then
      continue;
    end if;
    update public.files
       set trashed_at = now(), trashed_by = v_uid, in_trash = true
     where id = v_id;
    update public.files set in_trash = true where v_id = any (ancestor_ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.restore_files(p_file_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_parent_in_trash boolean;
  v_id uuid;
  v_count integer := 0;
begin
  perform public.require_user();
  foreach v_id in array coalesce(p_file_ids, '{}') loop
    v_file := public.assert_file_access(v_id, 3);
    if v_file.trashed_at is null then
      continue;
    end if;

    -- If the original folder is itself in the trash, restore to the root.
    select p.in_trash into v_parent_in_trash from public.files p where p.id = v_file.parent_id;
    if coalesce(v_parent_in_trash, false) then
      if not public.is_workspace_member(v_file.workspace_id) then
        raise exception 'parent_in_trash';
      end if;
      update public.files set parent_id = null where id = v_id;
    end if;

    update public.files
       set trashed_at = null, trashed_by = null, in_trash = false
     where id = v_id;

    -- Un-hide descendants unless something between them and this item is
    -- itself explicitly trashed.
    update public.files d
       set in_trash = exists (
         select 1 from public.files a
          where a.id = any (d.ancestor_ids) and a.trashed_at is not null
       ) or d.trashed_at is not null
     where v_id = any (d.ancestor_ids);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Permanently delete trashed items (and everything below them). Returns the
-- storage paths the server must remove from the bucket.
create function public.delete_files_forever(p_file_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files;
  v_id uuid;
  v_paths text[] := '{}';
begin
  foreach v_id in array coalesce(p_file_ids, '{}') loop
    select * into v_file from public.files where id = v_id;
    if not found then
      continue;
    end if;
    v_file := public.assert_file_access(v_id, 3);
    if v_file.trashed_at is null then
      raise exception 'not_in_trash';
    end if;
    if not public.is_workspace_member(v_file.workspace_id) and v_file.created_by is distinct from v_uid then
      raise exception 'forbidden';
    end if;

    v_paths := v_paths || coalesce((
      select array_agg(v.storage_path)
        from public.file_versions v
        join public.files f on f.id = v.file_id
       where f.id = v_id or v_id = any (f.ancestor_ids)
    ), '{}');

    delete from public.files where id = v_id;
  end loop;
  return v_paths;
end;
$$;

create function public.empty_trash(p_workspace_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  perform public.require_user();
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'forbidden';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids
    from public.files
   where workspace_id = p_workspace_id and trashed_at is not null;
  return public.delete_files_forever(v_ids);
end;
$$;

-- -----------------------------------------------------------------------------
-- Sharing
-- -----------------------------------------------------------------------------

create function public.share_file(p_file_id uuid, p_email text, p_role public.share_role)
returns public.file_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_file_access(p_file_id, 3);
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_share public.file_shares;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;

  -- Link to an existing account only if its email is confirmed.
  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = v_email and u.email_confirmed_at is not null;

  if v_user_id = v_uid then
    raise exception 'cannot_share_with_self';
  end if;

  insert into public.file_shares (file_id, email, user_id, role, created_by)
  values (v_file.id, v_email, v_user_id, p_role, v_uid)
  on conflict (file_id, email) do update set role = excluded.role
  returning * into v_share;

  return v_share;
end;
$$;

create function public.update_share(p_share_id uuid, p_role public.share_role)
returns public.file_shares
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_share public.file_shares;
begin
  perform public.require_user();
  select * into v_share from public.file_shares where id = p_share_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_file_access(v_share.file_id, 3);
  update public.file_shares set role = p_role where id = p_share_id returning * into v_share;
  return v_share;
end;
$$;

-- Editors remove anyone's access; anyone can remove their own.
create function public.remove_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_share public.file_shares;
begin
  select * into v_share from public.file_shares where id = p_share_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_share.user_id is distinct from v_uid then
    perform public.assert_file_access(v_share.file_id, 3);
  end if;
  delete from public.file_shares where id = p_share_id;
end;
$$;

-- People with access, for the share dialog. Visible to anyone who can open the
-- item (like Google Drive's "People with access").
create function public.get_file_access_list(p_file_id uuid)
returns table (
  share_id uuid,
  email text,
  user_id uuid,
  full_name text,
  avatar_url text,
  role public.share_role,
  inherited_from uuid,
  is_pending boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file public.files := public.assert_file_access(p_file_id, 1);
begin
  return query
  select s.id, s.email, s.user_id, p.full_name, p.avatar_url, s.role,
         case when s.file_id = v_file.id then null else s.file_id end,
         s.user_id is null
    from public.file_shares s
    left join public.profiles p on p.id = s.user_id
   where s.file_id = any (v_file.ancestor_ids || v_file.id)
   order by (s.file_id = v_file.id) desc, s.created_at;
end;
$$;

create function public.set_share_link(p_file_id uuid, p_enabled boolean, p_role public.share_role)
returns public.share_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_file_access(p_file_id, 3);
  v_link public.share_links;
begin
  insert into public.share_links (file_id, role, enabled, created_by)
  values (v_file.id, coalesce(p_role, 'viewer'), p_enabled, v_uid)
  on conflict (file_id) do update
    set enabled = excluded.enabled, role = excluded.role
  returning * into v_link;
  return v_link;
end;
$$;

-- Items shared directly with the current user from workspaces they are not a
-- member of. Only the top-most shared item of each tree is returned.
create function public.shared_with_me()
returns setof public.files
language sql
stable
security definer
set search_path = ''
as $$
  select f.*
    from public.files f
   where f.status = 'ready'
     and not f.in_trash
     and not public.is_workspace_member(f.workspace_id)
     and exists (
       select 1 from public.file_shares s
        where s.file_id = f.id and s.user_id = (select auth.uid())
     )
     and not exists (
       select 1 from public.file_shares s
        where s.file_id = any (f.ancestor_ids) and s.user_id = (select auth.uid())
     )
   order by f.kind, f.name;
$$;

-- Display names for a set of users (e.g. owners shown in file lists).
create function public.get_profiles(p_user_ids uuid[])
returns table (id uuid, email text, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.full_name, p.avatar_url
    from public.profiles p
   where p.id = any (p_user_ids) and (select auth.uid()) is not null;
$$;

-- -----------------------------------------------------------------------------
-- Workspaces
-- -----------------------------------------------------------------------------

create function public.create_team_workspace(p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_workspace public.workspaces;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then
    raise exception 'invalid_name';
  end if;
  insert into public.workspaces (name, kind, owner_id)
  values (btrim(p_name), 'team', v_uid)
  returning * into v_workspace;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace.id, v_uid, 'owner');
  return v_workspace;
end;
$$;

create function public.rename_workspace(p_workspace_id uuid, p_name text)
returns public.workspaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  perform public.require_user();
  if public.workspace_role_of(p_workspace_id) is null
     or public.workspace_role_of(p_workspace_id) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 100 then
    raise exception 'invalid_name';
  end if;
  update public.workspaces set name = btrim(p_name)
   where id = p_workspace_id and kind = 'team'
  returning * into v_workspace;
  if not found then
    raise exception 'forbidden';
  end if;
  return v_workspace;
end;
$$;

create function public.add_workspace_member(p_workspace_id uuid, p_email text, p_role public.workspace_role)
returns public.workspace_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
  v_plan public.plans;
  v_user_id uuid;
  v_member public.workspace_members;
begin
  perform public.require_user();
  select * into v_workspace from public.workspaces where id = p_workspace_id;
  if not found or v_workspace.kind <> 'team'
     or coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  if p_role = 'owner' then
    raise exception 'forbidden';
  end if;

  select u.id into v_user_id
    from auth.users u
   where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then
    raise exception 'user_not_found';
  end if;

  select * into v_plan from public.plans where id = v_workspace.plan_id;
  if (select count(*) from public.workspace_members where workspace_id = p_workspace_id) >= v_plan.max_members then
    raise exception 'member_limit_reached';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (p_workspace_id, v_user_id, coalesce(p_role, 'member'))
  on conflict (workspace_id, user_id) do nothing
  returning * into v_member;
  if v_member.user_id is null then
    raise exception 'already_member';
  end if;
  return v_member;
end;
$$;

create function public.update_workspace_member(p_workspace_id uuid, p_user_id uuid, p_role public.workspace_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_user();
  if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') or p_role = 'owner' then
    raise exception 'forbidden';
  end if;
  update public.workspace_members set role = p_role
   where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Owners/admins remove members; members can remove themselves (leave). The
-- owner cannot be removed.
create function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if p_user_id <> v_uid
     and coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  delete from public.workspace_members
   where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create function public.get_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, email text, full_name text, avatar_url text, role public.workspace_role, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'forbidden';
  end if;
  return query
  select m.user_id, p.email, p.full_name, p.avatar_url, m.role, m.created_at
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
   where m.workspace_id = p_workspace_id
   order by m.role, p.email;
end;
$$;

create function public.update_profile(p_full_name text, p_locale text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_profile public.profiles;
begin
  update public.profiles
     set full_name = coalesce(nullif(left(btrim(p_full_name), 120), ''), full_name),
         locale = case when p_locale in ('pt', 'en') then p_locale else locale end
   where id = v_uid
  returning * into v_profile;
  return v_profile;
end;
$$;

-- -----------------------------------------------------------------------------
-- Maintenance (service role / scheduled job only)
-- -----------------------------------------------------------------------------

-- Deletes trash older than each plan's retention and abandoned uploads.
-- Returns the storage paths to remove.
create function public.purge_expired_items()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_paths text[];
begin
  select coalesce(array_agg(f.id), '{}') into v_ids
    from public.files f
    join public.workspaces w on w.id = f.workspace_id
    join public.plans p on p.id = w.plan_id
   where (f.trashed_at is not null and f.trashed_at < now() - make_interval(days => p.trash_retention_days))
      or (f.status = 'uploading' and f.created_at < now() - interval '1 day');

  select coalesce(array_agg(v.storage_path), '{}') into v_paths
    from public.file_versions v
    join public.files f on f.id = v.file_id
   where f.id = any (v_ids) or f.ancestor_ids && v_ids;

  delete from public.files where id = any (v_ids);
  return v_paths;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- Lock everything down, then open exactly what the app calls.

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.file_access_level(uuid),
  public.create_folder(uuid, uuid, text),
  public.begin_upload(uuid, uuid, text, bigint, text),
  public.cancel_upload(uuid),
  public.rename_file(uuid, text),
  public.move_files(uuid[], uuid),
  public.trash_files(uuid[]),
  public.restore_files(uuid[]),
  public.delete_files_forever(uuid[]),
  public.empty_trash(uuid),
  public.share_file(uuid, text, public.share_role),
  public.update_share(uuid, public.share_role),
  public.remove_share(uuid),
  public.get_file_access_list(uuid),
  public.set_share_link(uuid, boolean, public.share_role),
  public.shared_with_me(),
  public.get_profiles(uuid[]),
  public.create_team_workspace(text),
  public.rename_workspace(uuid, text),
  public.add_workspace_member(uuid, text, public.workspace_role),
  public.update_workspace_member(uuid, uuid, public.workspace_role),
  public.remove_workspace_member(uuid, uuid),
  public.get_workspace_members(uuid),
  public.update_profile(text, text)
to authenticated;

-- RLS policies call these helpers as the querying role.
grant execute on function
  public.share_role_level(public.share_role),
  public.is_workspace_member(uuid),
  public.workspace_role_of(uuid),
  public.file_path_access_level(uuid, uuid[])
to authenticated;

grant execute on all functions in schema public to service_role;

-- Clients only read tables (through RLS); stars are the one direct write.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
grant insert, delete on public.file_stars to authenticated;

-- Functions added by later migrations are private unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
