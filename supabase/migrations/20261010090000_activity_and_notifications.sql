-- =============================================================================
-- Nuvenca — activity log and in-app notifications (stage 4)
-- =============================================================================
--
-- `audit_events`: what happened in a workspace (files, sharing, members,
-- plan). Written by triggers, so nothing done through any path is missed.
-- Readable by the workspace's owners and admins (and the owner of a personal
-- workspace). Kept for `plans.features.audit_log_days` (default 90).
--
-- `notifications`: the bell. Written by triggers when something is shared
-- with someone, they join a team, or someone comments on their file or in a
-- thread they took part in. Delivered live through Realtime (RLS applies).

-- -----------------------------------------------------------------------------
-- Who did it
-- -----------------------------------------------------------------------------

-- The acting user: the signed-in user, or (for server/admin operations) the
-- user named in the transaction-local setting `nuvenca.actor_id`.
create function public.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()),
    nullif(current_setting('nuvenca.actor_id', true), '')::uuid
  );
$$;

create function public.display_name_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- Activity log
-- -----------------------------------------------------------------------------

create table public.audit_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Null for automatic actions (e.g. trash emptied after its retention period).
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  action text not null,
  target_id uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_workspace_idx on public.audit_events (workspace_id, id desc);

alter table public.audit_events enable row level security;

create policy "Owners and admins read their workspace's activity"
  on public.audit_events for select to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner', 'admin'));

revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

create function public.log_audit(
  p_workspace_id uuid,
  p_action text,
  p_target_id uuid,
  p_target_name text,
  p_details jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, public.current_actor());
begin
  -- Skip when the workspace itself is being deleted (cascades).
  if p_workspace_id is null or not exists (select 1 from public.workspaces where id = p_workspace_id) then
    return;
  end if;
  insert into public.audit_events (workspace_id, actor_id, actor_name, action, target_id, target_name, details)
  values (
    p_workspace_id,
    v_actor,
    case when v_actor is null then null else public.display_name_of(v_actor) end,
    p_action,
    p_target_id,
    p_target_name,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

create function public.files_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind jsonb;
begin
  if tg_op = 'INSERT' then
    if new.status = 'ready' then
      perform public.log_audit(new.workspace_id, 'file.created', new.id, new.name,
        jsonb_build_object('kind', new.kind, 'mime', new.mime_type));
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- Items below a deleted folder go with it: only the folder is logged.
    if old.status = 'ready' and (old.trashed_at is not null or not old.in_trash) then
      perform public.log_audit(old.workspace_id, 'file.deleted', old.id, old.name,
        jsonb_build_object('kind', old.kind, 'mime', old.mime_type, 'automatic', public.current_actor() is null));
    end if;
    return null;
  end if;

  v_kind := jsonb_build_object('kind', new.kind, 'mime', new.mime_type);
  if old.status <> 'ready' and new.status = 'ready' then
    -- Uploads are finished by the server: the uploader is the actor.
    perform public.log_audit(new.workspace_id, 'file.uploaded', new.id, new.name,
      v_kind || jsonb_build_object('size', new.size_bytes), new.created_by);
    return null;
  end if;
  if old.status <> 'ready' then
    return null;
  end if;
  if new.name is distinct from old.name then
    perform public.log_audit(new.workspace_id, 'file.renamed', new.id, new.name, v_kind || jsonb_build_object('from', old.name));
  end if;
  if new.parent_id is distinct from old.parent_id then
    perform public.log_audit(new.workspace_id, 'file.moved', new.id, new.name, v_kind || jsonb_build_object(
      'from', (select f.name from public.files f where f.id = old.parent_id),
      'to', (select f.name from public.files f where f.id = new.parent_id)));
  end if;
  if old.trashed_at is null and new.trashed_at is not null then
    perform public.log_audit(new.workspace_id, 'file.trashed', new.id, new.name, v_kind);
  elsif old.trashed_at is not null and new.trashed_at is null then
    perform public.log_audit(new.workspace_id, 'file.restored', new.id, new.name, v_kind);
  end if;
  return null;
end;
$$;

create trigger files_audit
  after insert or update of status, name, parent_id, trashed_at or delete on public.files
  for each row execute function public.files_audit();

create function public.file_shares_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files where id = coalesce(new.file_id, old.file_id);
  if not found then
    return null; -- the file is being deleted
  end if;
  if tg_op = 'INSERT' then
    perform public.log_audit(v_file.workspace_id, 'share.added', v_file.id, v_file.name,
      jsonb_build_object('email', new.email, 'role', new.role, 'kind', v_file.kind));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.log_audit(v_file.workspace_id, 'share.changed', v_file.id, v_file.name,
        jsonb_build_object('email', new.email, 'role', new.role, 'from', old.role, 'kind', v_file.kind));
    end if;
  else
    perform public.log_audit(v_file.workspace_id, 'share.removed', v_file.id, v_file.name,
      jsonb_build_object('email', old.email, 'role', old.role, 'kind', v_file.kind));
  end if;
  return null;
end;
$$;

create trigger file_shares_audit
  after insert or update of role or delete on public.file_shares
  for each row execute function public.file_shares_audit();

create function public.share_links_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  if tg_op = 'UPDATE' and new.enabled is not distinct from old.enabled and new.role is not distinct from old.role then
    return null;
  end if;
  select * into v_file from public.files where id = new.file_id;
  if found then
    perform public.log_audit(v_file.workspace_id, 'link.changed', v_file.id, v_file.name,
      jsonb_build_object('enabled', new.enabled, 'role', new.role, 'kind', v_file.kind));
  end if;
  return null;
end;
$$;

create trigger share_links_audit
  after insert or update on public.share_links
  for each row execute function public.share_links_audit();

create function public.workspace_members_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.workspace_members := coalesce(new, old);
  v_email text := (select p.email from public.profiles p where p.id = v_member.user_id);
begin
  if (select w.kind from public.workspaces w where w.id = v_member.workspace_id) is distinct from 'team' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.role <> 'owner' then
      perform public.log_audit(new.workspace_id, 'member.added', new.user_id, v_email, jsonb_build_object('role', new.role));
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform public.log_audit(new.workspace_id, 'member.role_changed', new.user_id, v_email,
        jsonb_build_object('role', new.role, 'from', old.role));
    end if;
  else
    perform public.log_audit(old.workspace_id, 'member.removed', old.user_id, v_email, jsonb_build_object('role', old.role));
  end if;
  return null;
end;
$$;

create trigger workspace_members_audit
  after insert or update of role or delete on public.workspace_members
  for each row execute function public.workspace_members_audit();

create function public.workspaces_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    perform public.log_audit(new.id, 'workspace.renamed', new.id, new.name, jsonb_build_object('from', old.name));
  end if;
  if new.plan_id is distinct from old.plan_id then
    perform public.log_audit(new.id, 'plan.changed', new.id, new.name, jsonb_build_object('from', old.plan_id, 'to', new.plan_id));
  end if;
  return null;
end;
$$;

create trigger workspaces_audit
  after update of name, plan_id on public.workspaces
  for each row execute function public.workspaces_audit();

-- Downloads go through route handlers, which report them here.
create function public.log_file_download(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  if (select auth.role()) = 'service_role' then
    -- Public link download (no signed-in user).
    select * into v_file from public.files where id = p_file_id;
    if found then
      perform public.log_audit(v_file.workspace_id, 'file.downloaded', v_file.id, v_file.name,
        jsonb_build_object('kind', v_file.kind, 'mime', v_file.mime_type, 'via', 'link'));
    end if;
    return;
  end if;
  v_file := public.assert_file_access(p_file_id, 1);
  perform public.log_audit(v_file.workspace_id, 'file.downloaded', v_file.id, v_file.name,
    jsonb_build_object('kind', v_file.kind, 'mime', v_file.mime_type));
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('file_shared', 'workspace_member', 'comment')),
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  file_id uuid references public.files (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  -- File or team name when it happened.
  subject text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, id desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "People read their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- The bell listens on the private channel `notifications:<user id>`, so it keeps
-- working when Realtime only allows private channels. Rows still go through the
-- notifications RLS policy above.
create policy "Join your own notifications channel"
  on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'notifications:' || (select auth.uid())::text);

-- Access level of a given user (not the caller) to a file.
create function public.user_file_access_level(p_user_id uuid, p_file_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when exists (select 1 from public.workspace_members m where m.workspace_id = f.workspace_id and m.user_id = p_user_id) then 4
      else coalesce((
        select max(public.share_role_level(s.role))
          from public.file_shares s
         where s.user_id = p_user_id and s.file_id = any (f.ancestor_ids || f.id)
      ), 0)
    end
    from public.files f where f.id = p_file_id
  ), 0);
$$;

create function public.notify(
  p_user_id uuid,
  p_kind text,
  p_actor uuid,
  p_file_id uuid,
  p_workspace_id uuid,
  p_subject text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id is not distinct from p_actor then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_id, actor_name, file_id, workspace_id, subject, data)
  values (p_user_id, p_kind, p_actor, public.display_name_of(p_actor), p_file_id, p_workspace_id, p_subject, coalesce(p_data, '{}'));
end;
$$;

create function public.file_shares_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  -- New share with an existing account, or an invitation claimed at sign-up.
  if new.user_id is null or (tg_op = 'UPDATE' and old.user_id is not null) then
    return null;
  end if;
  select * into v_file from public.files where id = new.file_id;
  if found and v_file.status = 'ready' then
    perform public.notify(new.user_id, 'file_shared', new.created_by, v_file.id, v_file.workspace_id, v_file.name,
      jsonb_build_object('role', new.role, 'kind', v_file.kind, 'mime', v_file.mime_type));
  end if;
  return null;
end;
$$;

create trigger file_shares_notify
  after insert or update of user_id on public.file_shares
  for each row execute function public.file_shares_notify();

create function public.workspace_members_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace public.workspaces;
begin
  select * into v_workspace from public.workspaces where id = new.workspace_id;
  if v_workspace.kind = 'team' and new.role <> 'owner' then
    perform public.notify(new.user_id, 'workspace_member', public.current_actor(), null, v_workspace.id, v_workspace.name,
      jsonb_build_object('role', new.role));
  end if;
  return null;
end;
$$;

create trigger workspace_members_notify
  after insert on public.workspace_members
  for each row execute function public.workspace_members_notify();

-- A comment notifies the file's owner and everyone who took part in the
-- thread, if they can still open the file.
create function public.document_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
  v_thread uuid := coalesce(new.parent_id, new.id);
  v_user uuid;
begin
  select * into v_file from public.files where id = new.file_id;
  if not found then
    return null;
  end if;
  for v_user in
    select distinct u from (
      select v_file.created_by as u
      union all
      select c.created_by from public.document_comments c where c.id = v_thread or c.parent_id = v_thread
    ) recipients
    where u is not null and u is distinct from new.created_by
  loop
    if public.user_file_access_level(v_user, v_file.id) >= 1 then
      perform public.notify(v_user, 'comment', new.created_by, v_file.id, v_file.workspace_id, v_file.name,
        jsonb_build_object('excerpt', left(new.body, 160), 'reply', new.parent_id is not null, 'mime', v_file.mime_type,
                           'thread', v_thread));
    end if;
  end loop;
  return null;
end;
$$;

create trigger document_comments_notify
  after insert on public.document_comments
  for each row execute function public.document_comments_notify();

create function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = public.require_user()
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Retention (daily cleanup job)
-- -----------------------------------------------------------------------------

alter table public.plans alter column features set default '{"audit_log_days": 90}'::jsonb;
update public.plans set features = features || jsonb_build_object('audit_log_days',
  case id when 'free' then 30 else 365 end);

create function public.prune_activity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events integer;
  v_notifications integer;
begin
  delete from public.audit_events e
   using public.workspaces w, public.plans p
   where w.id = e.workspace_id and p.id = w.plan_id
     and e.created_at < now() - make_interval(days => coalesce((p.features ->> 'audit_log_days')::int, 90));
  get diagnostics v_events = row_count;
  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics v_notifications = row_count;
  return jsonb_build_object('audit_events', v_events, 'notifications', v_notifications);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function public.current_actor() from public, anon;
revoke execute on function public.display_name_of(uuid) from public, anon, authenticated;
revoke execute on function public.log_audit(uuid, text, uuid, text, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.user_file_access_level(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.prune_activity() from public, anon, authenticated;
revoke execute on function public.log_file_download(uuid) from public, anon;
revoke execute on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.current_actor() to authenticated, service_role;
grant execute on function public.log_file_download(uuid) to authenticated, service_role;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.prune_activity() to service_role;
