-- =============================================================================
-- Nuvenca — native documents and spreadsheets (stage 2)
-- =============================================================================
--
-- Native files are rows in `files` with a Nuvenca MIME type:
--   application/vnd.nuvenca.document     (rich-text documents)
--   application/vnd.nuvenca.spreadsheet  (spreadsheets)
-- Their content is a Yjs CRDT document, so several people can edit at once:
--   * `document_states`  — the merged state (compacted periodically)
--   * `document_updates` — incremental edits appended by editors' browsers
--   * `document_versions`— named / automatic snapshots for version history
--   * `document_comments`— comment threads anchored to text or cells
-- Live edits travel over Supabase Realtime on the private topic `file:<id>`;
-- the policies at the end restrict that channel to people with access.
-- Binary payloads cross the API as base64 text.

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create function public.is_native_mime(p_mime text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mime in ('application/vnd.nuvenca.document', 'application/vnd.nuvenca.spreadsheet');
$$;

create function public.b64(p_data bytea)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(encode(p_data, 'base64'), E'\n', '');
$$;

create function public.unb64(p_text text)
returns bytea
language plpgsql
immutable
set search_path = ''
as $$
begin
  return decode(coalesce(p_text, ''), 'base64');
exception when others then
  raise exception 'invalid_payload';
end;
$$;

-- Load a native file the caller can access at `p_min_level` or above.
create function public.assert_native_file(p_file_id uuid, p_min_level integer)
returns public.files
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file public.files := public.assert_file_access(p_file_id, p_min_level);
begin
  if not public.is_native_mime(v_file.mime_type) then
    raise exception 'not_native';
  end if;
  if v_file.in_trash then
    raise exception 'not_found';
  end if;
  return v_file;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.document_states (
  file_id uuid primary key references public.files (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  state bytea not null,
  -- Incremented on every compaction (optimistic concurrency).
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.document_updates (
  id bigint generated always as identity primary key,
  file_id uuid not null references public.files (id) on delete cascade,
  payload bytea not null check (octet_length(payload) between 1 and 2097152),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_updates_file_idx on public.document_updates (file_id, id);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  state bytea not null,
  label text check (char_length(label) <= 100),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_versions_file_idx on public.document_versions (file_id, created_at desc);

create table public.document_comments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  -- Replies point at the first comment of the thread.
  parent_id uuid references public.document_comments (id) on delete cascade,
  -- Where the thread is attached: Yjs relative positions for documents,
  -- {sheet,row,col} ids for spreadsheets. Only set on the first comment.
  anchor jsonb,
  quote text check (char_length(quote) <= 500),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index document_comments_file_idx on public.document_comments (file_id, created_at);

create trigger document_comments_set_updated_at
  before update on public.document_comments
  for each row execute function public.set_updated_at();

-- Images and other media embedded in documents live in Storage, like uploads.
create table public.document_assets (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  status public.file_status not null default 'uploading',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_assets_file_idx on public.document_assets (file_id);

-- Same accounting as file versions (same column names).
create trigger document_assets_track_usage
  after insert or update of status, size_bytes or delete on public.document_assets
  for each row execute function public.file_versions_track_usage();

-- Native content counts towards the workspace's storage, like uploads do.
create function public.document_bytes_track_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delta bigint := 0;
  v_workspace uuid := coalesce(new.workspace_id, old.workspace_id);
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_delta := v_delta - octet_length(old.state);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_delta := v_delta + octet_length(new.state);
  end if;
  if v_delta <> 0 then
    update public.workspaces
       set storage_used_bytes = greatest(0, storage_used_bytes + v_delta)
     where id = v_workspace;
  end if;
  if tg_table_name = 'document_states' and tg_op in ('INSERT', 'UPDATE') then
    update public.files set size_bytes = octet_length(new.state) where id = new.file_id;
  end if;
  return null;
end;
$$;

create trigger document_states_track_usage
  after insert or update of state or delete on public.document_states
  for each row execute function public.document_bytes_track_usage();

create trigger document_versions_track_usage
  after insert or delete on public.document_versions
  for each row execute function public.document_bytes_track_usage();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table public.document_states enable row level security;
alter table public.document_updates enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_comments enable row level security;
alter table public.document_assets enable row level security;

create policy "Read assets of accessible files"
  on public.document_assets for select to authenticated
  using (status = 'ready' and public.file_access_level(file_id) >= 1);

-- Content is read through `load_document`; comments are read directly (and
-- streamed with Realtime postgres_changes) by commenters and above.
create policy "Commenters read comments"
  on public.document_comments for select to authenticated
  using (public.file_access_level(file_id) >= 2);

alter publication supabase_realtime add table public.document_comments;

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Create a document or spreadsheet, optionally with initial content (e.g. an
-- imported .docx/.xlsx converted in the browser).
create function public.create_native_file(
  p_workspace_id uuid,
  p_parent_id uuid,
  p_name text,
  p_type text,
  p_state text
)
returns public.files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_workspace_id uuid := public.resolve_target_workspace(p_workspace_id, p_parent_id);
  v_state bytea := public.unb64(p_state);
  v_workspace public.workspaces;
  v_plan public.plans;
  v_file public.files;
begin
  if p_type not in ('document', 'spreadsheet') then
    raise exception 'invalid_type';
  end if;
  select * into v_workspace from public.workspaces where id = v_workspace_id;
  select * into v_plan from public.plans where id = v_workspace.plan_id;
  if octet_length(v_state) > v_plan.max_file_size_bytes then
    raise exception 'file_too_large';
  end if;
  if v_workspace.storage_used_bytes + octet_length(v_state) > v_plan.storage_quota_bytes then
    raise exception 'quota_exceeded';
  end if;

  insert into public.files (workspace_id, parent_id, kind, name, mime_type, status, created_by, updated_by)
  values (v_workspace_id, p_parent_id, 'file', public.clean_name(p_name),
          'application/vnd.nuvenca.' || p_type, 'ready', v_uid, v_uid)
  returning * into v_file;

  insert into public.document_states (file_id, workspace_id, state)
  values (v_file.id, v_workspace_id, v_state);

  select * into v_file from public.files where id = v_file.id;
  return v_file;
end;
$$;

-- Everything a client needs to open a native file.
create function public.load_document(p_file_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file public.files := public.assert_native_file(p_file_id, 1);
  v_state public.document_states;
begin
  select * into v_state from public.document_states where file_id = v_file.id;
  return jsonb_build_object(
    'file_id', v_file.id,
    'access_level', public.file_access_level(v_file.id),
    'revision', coalesce(v_state.revision, 0),
    'state', public.b64(coalesce(v_state.state, ''::bytea)),
    'updates', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'payload', public.b64(u.payload)) order by u.id)
        from public.document_updates u
       where u.file_id = v_file.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Persist an incremental edit. Called straight from editors' browsers.
create function public.append_document_update(p_file_id uuid, p_payload text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_native_file(p_file_id, 3);
  v_id bigint;
begin
  insert into public.document_updates (file_id, payload, created_by)
  values (v_file.id, public.unb64(p_payload), v_uid)
  returning id into v_id;

  -- Bump "last modified" at most every 30 seconds.
  if v_file.updated_at < now() - interval '30 seconds' or v_file.updated_by is distinct from v_uid then
    update public.files set updated_by = v_uid where id = v_file.id;
  end if;
  return v_id;
end;
$$;

-- Replace the merged state and drop the updates folded into it. Server only:
-- the merge itself happens in Node (Yjs), this applies it atomically.
create function public.compact_document(
  p_file_id uuid,
  p_state text,
  p_expected_revision bigint,
  p_last_update_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.document_states
     set state = public.unb64(p_state),
         revision = revision + 1,
         updated_at = now()
   where file_id = p_file_id and revision = p_expected_revision;
  if not found then
    return false;
  end if;
  delete from public.document_updates where file_id = p_file_id and id <= p_last_update_id;
  return true;
end;
$$;

-- Version history ------------------------------------------------------------

create function public.create_document_version(p_file_id uuid, p_state text, p_label text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_native_file(p_file_id, 3);
  v_id uuid;
begin
  insert into public.document_versions (file_id, workspace_id, state, label, created_by)
  values (v_file.id, v_file.workspace_id, public.unb64(p_state), nullif(left(btrim(coalesce(p_label, '')), 100), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.list_document_versions(p_file_id uuid)
returns table (id uuid, label text, created_at timestamptz, created_by uuid, author_name text, size_bytes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file public.files := public.assert_native_file(p_file_id, 3);
begin
  return query
  select v.id, v.label, v.created_at, v.created_by, public.profile_display_name(v.created_by), octet_length(v.state)
    from public.document_versions v
   where v.file_id = v_file.id
   order by v.created_at desc
   limit 200;
end;
$$;

create function public.get_document_version(p_version_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_version public.document_versions;
begin
  select * into v_version from public.document_versions where id = p_version_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_native_file(v_version.file_id, 3);
  return public.b64(v_version.state);
end;
$$;

create function public.label_document_version(p_version_id uuid, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.document_versions;
begin
  select * into v_version from public.document_versions where id = p_version_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_native_file(v_version.file_id, 3);
  update public.document_versions
     set label = nullif(left(btrim(coalesce(p_label, '')), 100), '')
   where id = p_version_id;
end;
$$;

-- Comments -------------------------------------------------------------------

create function public.add_comment(
  p_file_id uuid,
  p_parent_id uuid,
  p_anchor jsonb,
  p_quote text,
  p_body text
)
returns public.document_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_native_file(p_file_id, 2);
  v_parent public.document_comments;
  v_comment public.document_comments;
begin
  if p_parent_id is not null then
    select * into v_parent from public.document_comments where id = p_parent_id and file_id = v_file.id;
    if not found or v_parent.parent_id is not null then
      raise exception 'not_found';
    end if;
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_comment';
  end if;

  insert into public.document_comments (file_id, parent_id, anchor, quote, body, created_by)
  values (v_file.id, p_parent_id,
          case when p_parent_id is null then p_anchor end,
          case when p_parent_id is null then left(p_quote, 500) end,
          btrim(p_body), v_uid)
  returning * into v_comment;

  -- Replying re-opens a resolved thread.
  if p_parent_id is not null then
    update public.document_comments set resolved_at = null, resolved_by = null where id = p_parent_id;
  end if;
  return v_comment;
end;
$$;

create function public.edit_comment(p_comment_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_comment public.document_comments;
begin
  select * into v_comment from public.document_comments where id = p_comment_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_native_file(v_comment.file_id, 2);
  if v_comment.created_by is distinct from v_uid then
    raise exception 'forbidden';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_comment';
  end if;
  update public.document_comments set body = btrim(p_body) where id = p_comment_id;
end;
$$;

-- Authors delete their own comments; editors delete any.
create function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_comment public.document_comments;
begin
  select * into v_comment from public.document_comments where id = p_comment_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_native_file(v_comment.file_id, case when v_comment.created_by = v_uid then 2 else 3 end);
  delete from public.document_comments where id = p_comment_id;
end;
$$;

create function public.resolve_comment(p_comment_id uuid, p_resolved boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_comment public.document_comments;
begin
  select * into v_comment from public.document_comments where id = p_comment_id and parent_id is null;
  if not found then
    raise exception 'not_found';
  end if;
  perform public.assert_native_file(v_comment.file_id, 2);
  update public.document_comments
     set resolved_at = case when p_resolved then now() end,
         resolved_by = case when p_resolved then v_uid end
   where id = p_comment_id;
end;
$$;

-- Assets ---------------------------------------------------------------------

create function public.begin_asset_upload(p_file_id uuid, p_size_bytes bigint, p_mime_type text)
returns table (asset_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_file public.files := public.assert_native_file(p_file_id, 3);
  v_workspace public.workspaces;
  v_plan public.plans;
  v_id uuid := gen_random_uuid();
  v_path text;
begin
  if coalesce(p_mime_type, '') !~ '^image/(png|jpeg|gif|webp|svg\+xml|bmp)$' then
    raise exception 'unsupported_type';
  end if;
  select * into v_workspace from public.workspaces where id = v_file.workspace_id;
  select * into v_plan from public.plans where id = v_workspace.plan_id;
  if p_size_bytes is null or p_size_bytes <= 0 then
    raise exception 'invalid_size';
  end if;
  if p_size_bytes > least(v_plan.max_file_size_bytes, 20 * 1024 * 1024) then
    raise exception 'file_too_large';
  end if;
  if v_workspace.storage_used_bytes + p_size_bytes > v_plan.storage_quota_bytes then
    raise exception 'quota_exceeded';
  end if;
  v_path := v_file.workspace_id || '/' || v_file.id || '/assets/' || v_id;
  insert into public.document_assets (id, file_id, workspace_id, storage_path, mime_type, size_bytes, created_by)
  values (v_id, v_file.id, v_file.workspace_id, v_path, p_mime_type, p_size_bytes, v_uid);
  return query select v_id, v_path;
end;
$$;

-- Server only: record the size Storage measured.
create function public.complete_asset_upload(p_asset_id uuid, p_size_bytes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.document_assets;
  v_workspace public.workspaces;
  v_plan public.plans;
begin
  select * into v_asset from public.document_assets where id = p_asset_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_asset.status = 'ready' then
    return;
  end if;
  select * into v_workspace from public.workspaces where id = v_asset.workspace_id for update;
  select * into v_plan from public.plans where id = v_workspace.plan_id;
  if p_size_bytes > least(v_plan.max_file_size_bytes, 20 * 1024 * 1024) then
    raise exception 'file_too_large';
  end if;
  if v_workspace.storage_used_bytes + p_size_bytes > v_plan.storage_quota_bytes then
    raise exception 'quota_exceeded';
  end if;
  update public.document_assets set status = 'ready', size_bytes = p_size_bytes where id = p_asset_id;
end;
$$;

-- Deleting for good must also remove embedded assets from Storage.
create or replace function public.delete_files_forever(p_file_ids uuid[])
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
    ), '{}') || coalesce((
      select array_agg(a.storage_path)
        from public.document_assets a
        join public.files f on f.id = a.file_id
       where f.id = v_id or v_id = any (f.ancestor_ids)
    ), '{}');

    delete from public.files where id = v_id;
  end loop;
  return v_paths;
end;
$$;

-- Daily cleanup: expired trash, abandoned uploads, old version history.
create or replace function public.purge_expired_items()
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

  v_paths := v_paths || coalesce((
    select array_agg(a.storage_path)
      from public.document_assets a
      join public.files f on f.id = a.file_id
     where f.id = any (v_ids) or f.ancestor_ids && v_ids
        or (a.status = 'uploading' and a.created_at < now() - interval '1 day')
  ), '{}');

  delete from public.document_assets where status = 'uploading' and created_at < now() - interval '1 day';
  delete from public.files where id = any (v_ids);

  delete from public.document_versions dv
   using public.workspaces w, public.plans p
   where w.id = dv.workspace_id and p.id = w.plan_id
     and dv.label is null
     and dv.created_at < now() - make_interval(days => coalesce((p.features ->> 'version_history_days')::int, 30));

  return v_paths;
end;
$$;

-- Signed-in people who open an "anyone with the link can comment/edit" link
-- join the file with that role (like being invited), so they can use the
-- editor. Returns the file id.
create function public.join_via_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_link public.share_links;
  v_file public.files;
  v_email text;
begin
  select * into v_link from public.share_links
   where token = p_token and enabled and (expires_at is null or expires_at > now());
  if not found then
    raise exception 'not_found';
  end if;
  select * into v_file from public.files where id = v_link.file_id and not in_trash;
  if not found then
    raise exception 'not_found';
  end if;
  if public.file_access_level(v_file.id) >= public.share_role_level(v_link.role) then
    return v_file.id;
  end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  insert into public.file_shares (file_id, email, user_id, role, created_by)
  values (v_file.id, v_email, v_uid, v_link.role, v_link.created_by)
  on conflict (file_id, email) do update
    set role = excluded.role, user_id = excluded.user_id
    where public.share_role_level(public.file_shares.role) < public.share_role_level(excluded.role);
  return v_file.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Realtime authorisation: topic `file:<uuid>`
-- -----------------------------------------------------------------------------
-- Everyone who can open the file receives live edits and shares presence;
-- only editors may broadcast edits (Yjs updates and cursors).

create function public.realtime_file_access(p_topic text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~ '^file:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.file_access_level(substr(p_topic, 6)::uuid)
    else 0
  end;
$$;

create policy "Receive live edits for accessible files"
  on realtime.messages for select to authenticated
  using (public.realtime_file_access((select realtime.topic())) >= 1);

create policy "Editors broadcast, everyone with access shares presence"
  on realtime.messages for insert to authenticated
  with check (
    case realtime.messages.extension
      when 'broadcast' then public.realtime_file_access((select realtime.topic())) >= 3
      when 'presence' then public.realtime_file_access((select realtime.topic())) >= 1
      else false
    end
  );

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, and a per-schema
-- default privilege cannot take that back. Make future functions private
-- globally, revoke everything created above, then open what the app calls.

alter default privileges revoke execute on functions from public;

revoke execute on function
  public.is_native_mime(text),
  public.b64(bytea),
  public.unb64(text),
  public.assert_native_file(uuid, integer),
  public.document_bytes_track_usage(),
  public.create_native_file(uuid, uuid, text, text, text),
  public.load_document(uuid),
  public.append_document_update(uuid, text),
  public.compact_document(uuid, text, bigint, bigint),
  public.create_document_version(uuid, text, text),
  public.list_document_versions(uuid),
  public.get_document_version(uuid),
  public.label_document_version(uuid, text),
  public.add_comment(uuid, uuid, jsonb, text, text),
  public.edit_comment(uuid, text),
  public.delete_comment(uuid),
  public.resolve_comment(uuid, boolean),
  public.realtime_file_access(text),
  public.begin_asset_upload(uuid, bigint, text),
  public.complete_asset_upload(uuid, bigint),
  public.join_via_link(text)
from public, anon, authenticated;

-- Created by an earlier migration before PUBLIC was revoked globally.
revoke execute on function public.profile_display_name(uuid) from public, anon;

grant execute on function
  public.create_native_file(uuid, uuid, text, text, text),
  public.load_document(uuid),
  public.append_document_update(uuid, text),
  public.create_document_version(uuid, text, text),
  public.list_document_versions(uuid),
  public.get_document_version(uuid),
  public.label_document_version(uuid, text),
  public.add_comment(uuid, uuid, jsonb, text, text),
  public.edit_comment(uuid, text),
  public.delete_comment(uuid),
  public.resolve_comment(uuid, boolean),
  public.realtime_file_access(text),
  public.begin_asset_upload(uuid, bigint, text),
  public.join_via_link(text)
to authenticated;

grant execute on all functions in schema public to service_role;

revoke insert, update, delete, truncate on
  public.document_states, public.document_updates, public.document_versions, public.document_comments,
  public.document_assets
from anon, authenticated;
