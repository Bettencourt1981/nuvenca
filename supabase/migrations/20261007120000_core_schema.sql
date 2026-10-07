-- =============================================================================
-- Nuvenca — core schema (stage 1: accounts, workspaces, drive, sharing, plans)
-- =============================================================================
--
-- Design notes
-- * Every user gets a personal workspace ("My Drive"). Businesses create team
--   workspaces and add members. Billing attaches to a workspace via its plan.
-- * Files and folders live in one `files` table. `ancestor_ids` stores the
--   materialised path (root first) so permission checks and subtree
--   operations are a single indexed lookup instead of a recursive query.
-- * Binary content lives in the private Storage bucket `files`. The browser
--   never talks to Storage directly with its own credentials: the server
--   hands out short-lived signed URLs after checking permissions here.
-- * Clients may SELECT through RLS but never write tables directly. All
--   writes go through the SECURITY DEFINER functions below, which perform
--   the permission checks explicitly. Errors are raised with machine-readable
--   messages (e.g. 'quota_exceeded') that the app translates.
--
-- Access levels returned by `file_access_level`:
--   0 none · 1 viewer · 2 commenter · 3 editor · 4 workspace member (manager)

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------

create type public.workspace_kind as enum ('personal', 'team');
create type public.workspace_role as enum ('owner', 'admin', 'member');
create type public.share_role as enum ('viewer', 'commenter', 'editor');
create type public.file_kind as enum ('folder', 'file');
create type public.file_status as enum ('uploading', 'ready');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.share_role_level(p_role public.share_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'viewer' then 1
    when 'commenter' then 2
    when 'editor' then 3
  end;
$$;

-- -----------------------------------------------------------------------------
-- Plans & billing (ready for a payment provider such as Stripe)
-- -----------------------------------------------------------------------------

create table public.plans (
  id text primary key,
  name text not null,
  storage_quota_bytes bigint not null check (storage_quota_bytes > 0),
  max_file_size_bytes bigint not null check (max_file_size_bytes > 0),
  -- Maximum number of members in a team workspace on this plan.
  max_members integer not null check (max_members > 0),
  -- Days a trashed item is kept before it is deleted for good.
  trash_retention_days integer not null default 30,
  -- Free-form feature flags, e.g. {"version_history_days": 30}.
  features jsonb not null default '{}'::jsonb,
  price_monthly_cents integer,
  price_yearly_cents integer,
  currency text not null default 'eur',
  -- Shown on the pricing page / available for self-service upgrade.
  is_public boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.plans is
  'Subscription plans. Limits are enforced by the database functions; prices are filled in when billing launches.';

-- Beta: everyone is on `free`. `pro` and `business` are drafts to be priced later.
insert into public.plans
  (id, name, storage_quota_bytes, max_file_size_bytes, max_members, features, is_public, sort_order)
values
  ('free', 'Free', 5::bigint * 1024 * 1024 * 1024, 100::bigint * 1024 * 1024, 5,
   '{"version_history_days": 30}', true, 0),
  ('pro', 'Pro', 200::bigint * 1024 * 1024 * 1024, 2::bigint * 1024 * 1024 * 1024, 1,
   '{"version_history_days": 365}', false, 1),
  ('business', 'Business', 1024::bigint * 1024 * 1024 * 1024, 5::bigint * 1024 * 1024 * 1024, 100,
   '{"version_history_days": 365, "admin_console": true}', false, 2);

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text check (char_length(full_name) <= 120),
  avatar_url text,
  locale text not null default 'pt' check (locale in ('pt', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Workspaces
-- -----------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  kind public.workspace_kind not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Effective plan. A billing webhook updates this; `subscriptions` keeps the
  -- provider details.
  plan_id text not null default 'free' references public.plans (id),
  -- Sum of all ready file versions stored in this workspace.
  storage_used_bytes bigint not null default 0 check (storage_used_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index workspaces_one_personal_per_user
  on public.workspaces (owner_id) where kind = 'personal';

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status public.subscription_status not null,
  -- 'manual' during beta; e.g. 'stripe' later.
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Files & folders
-- -----------------------------------------------------------------------------

create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  parent_id uuid references public.files (id) on delete cascade,
  -- Materialised path: ids of every ancestor folder, root first.
  ancestor_ids uuid[] not null default '{}',
  kind public.file_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  status public.file_status not null default 'ready',
  current_version_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set on the item the user explicitly trashed.
  trashed_at timestamptz,
  trashed_by uuid references auth.users (id) on delete set null,
  -- True for explicitly trashed items and everything below them.
  in_trash boolean not null default false,
  constraint files_folder_shape check (kind = 'file' or (mime_type is null and size_bytes = 0))
);

create index files_children_idx on public.files (parent_id, kind, name) where not in_trash;
create index files_workspace_root_idx on public.files (workspace_id, kind, name)
  where parent_id is null and not in_trash;
create index files_workspace_updated_idx on public.files (workspace_id, updated_at desc);
create index files_trashed_idx on public.files (workspace_id, trashed_at desc) where trashed_at is not null;
create index files_ancestors_idx on public.files using gin (ancestor_ids);
create index files_name_trgm_idx on public.files using gin (name extensions.gin_trgm_ops);

create trigger files_set_updated_at
  before update on public.files
  for each row execute function public.set_updated_at();

create table public.file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  -- Denormalised so storage usage can be accounted without a join.
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  mime_type text,
  status public.file_status not null default 'uploading',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (file_id, version_number)
);

create index file_versions_status_idx on public.file_versions (status, created_at)
  where status = 'uploading';

alter table public.files
  add constraint files_current_version_fkey
  foreign key (current_version_id) references public.file_versions (id) on delete set null;

-- Keep `ancestor_ids` correct and forbid invalid parents (non-folders, other
-- workspaces, cycles).
create function public.files_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.files;
begin
  if tg_op = 'UPDATE' and new.workspace_id <> old.workspace_id then
    raise exception 'cannot_change_workspace';
  end if;

  new.name := btrim(new.name);

  if new.parent_id is null then
    new.ancestor_ids := '{}';
    return new;
  end if;

  select * into v_parent from public.files where id = new.parent_id;
  if not found then
    raise exception 'parent_not_found';
  end if;
  if v_parent.kind <> 'folder' then
    raise exception 'parent_not_folder';
  end if;
  if v_parent.workspace_id <> new.workspace_id then
    raise exception 'parent_other_workspace';
  end if;
  if v_parent.id = new.id or new.id = any (v_parent.ancestor_ids) then
    raise exception 'cannot_move_into_itself';
  end if;

  new.ancestor_ids := v_parent.ancestor_ids || v_parent.id;
  return new;
end;
$$;

create trigger files_before_insert
  before insert on public.files
  for each row execute function public.files_before_write();

create trigger files_before_update_parent
  before update of parent_id, workspace_id, name on public.files
  for each row execute function public.files_before_write();

-- When a folder moves, rewrite the path of everything below it.
create function public.files_after_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is distinct from old.parent_id then
    update public.files d
       set ancestor_ids = new.ancestor_ids || d.ancestor_ids[array_position(d.ancestor_ids, new.id):]
     where new.id = any (d.ancestor_ids);
  end if;
  return null;
end;
$$;

create trigger files_after_move
  after update of parent_id on public.files
  for each row execute function public.files_after_move();

-- Storage usage accounting: only ready versions count.
create function public.file_versions_track_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'ready' then
    update public.workspaces
       set storage_used_bytes = greatest(0, storage_used_bytes - old.size_bytes)
     where id = old.workspace_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'ready' then
    update public.workspaces
       set storage_used_bytes = storage_used_bytes + new.size_bytes
     where id = new.workspace_id;
  end if;
  return null;
end;
$$;

create trigger file_versions_track_usage
  after insert or update of status, size_bytes or delete on public.file_versions
  for each row execute function public.file_versions_track_usage();

-- -----------------------------------------------------------------------------
-- Sharing
-- -----------------------------------------------------------------------------

-- Grants on a file or folder to a person, identified by email. `user_id` is
-- filled in as soon as an account with a confirmed email exists, so people can
-- be invited before they sign up.
create table public.file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.files (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  user_id uuid references auth.users (id) on delete cascade,
  role public.share_role not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, email)
);

create index file_shares_user_idx on public.file_shares (user_id, file_id);
create index file_shares_pending_email_idx on public.file_shares (email) where user_id is null;

create trigger file_shares_set_updated_at
  before update on public.file_shares
  for each row execute function public.set_updated_at();

-- "Anyone with the link" access. One link per file or folder.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null unique references public.files (id) on delete cascade,
  token text not null unique default
    translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  role public.share_role not null default 'viewer',
  enabled boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger share_links_set_updated_at
  before update on public.share_links
  for each row execute function public.set_updated_at();

create table public.file_stars (
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id uuid not null references public.files (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

create index file_stars_file_idx on public.file_stars (file_id);

-- -----------------------------------------------------------------------------
-- Access checks
-- -----------------------------------------------------------------------------

create function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
     where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid())
  );
$$;

create function public.workspace_role_of(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.workspace_members m
   where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid());
$$;

-- Access level for a row, given its workspace and path (ancestors + itself).
create function public.file_path_access_level(p_workspace_id uuid, p_path uuid[])
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then 0
    when public.is_workspace_member(p_workspace_id) then 4
    else coalesce((
      select max(public.share_role_level(s.role))
        from public.file_shares s
       where s.user_id = (select auth.uid()) and s.file_id = any (p_path)
    ), 0)
  end;
$$;

create function public.file_access_level(p_file_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.file_path_access_level(f.workspace_id, f.ancestor_ids || f.id)
      from public.files f where f.id = p_file_id
  ), 0);
$$;

create function public.assert_file_access(p_file_id uuid, p_min_level integer)
returns public.files
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files where id = p_file_id;
  if not found or public.file_path_access_level(v_file.workspace_id, v_file.ancestor_ids || v_file.id) < 1 then
    raise exception 'not_found';
  end if;
  if public.file_path_access_level(v_file.workspace_id, v_file.ancestor_ids || v_file.id) < p_min_level then
    raise exception 'forbidden';
  end if;
  return v_file;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row level security (read paths). Writes go through functions only.
-- -----------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.files enable row level security;
alter table public.file_versions enable row level security;
alter table public.file_shares enable row level security;
alter table public.share_links enable row level security;
alter table public.file_stars enable row level security;

create policy "Plans are public"
  on public.plans for select
  using (true);

create policy "Read own profile and workspace co-members"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1
        from public.workspace_members mine
        join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
       where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );

create policy "Members read their workspaces"
  on public.workspaces for select to authenticated
  using (public.is_workspace_member(id));

create policy "Members read the member list"
  on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Owners and admins read the subscription"
  on public.subscriptions for select to authenticated
  using (public.workspace_role_of(workspace_id) in ('owner', 'admin'));

create policy "Read accessible files"
  on public.files for select to authenticated
  using (public.file_path_access_level(workspace_id, ancestor_ids || id) > 0);

create policy "Read versions of accessible files"
  on public.file_versions for select to authenticated
  using (exists (select 1 from public.files f where f.id = file_versions.file_id));

create policy "Read shares of files you can edit, and your own"
  on public.file_shares for select to authenticated
  using (user_id = (select auth.uid()) or public.file_access_level(file_id) >= 3);

create policy "Editors read the link settings"
  on public.share_links for select to authenticated
  using (public.file_access_level(file_id) >= 3);

create policy "Manage own stars"
  on public.file_stars for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Star accessible files"
  on public.file_stars for insert to authenticated
  with check (user_id = (select auth.uid()) and public.file_access_level(file_id) > 0);

create policy "Unstar"
  on public.file_stars for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Account lifecycle
-- -----------------------------------------------------------------------------

-- Attach pending email invitations to the account once its email is confirmed.
create function public.claim_pending_shares(p_user_id uuid, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.file_shares
     set user_id = p_user_id
   where user_id is null and email = lower(btrim(p_email));
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (id, email, full_name, avatar_url, locale)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    new.raw_user_meta_data ->> 'avatar_url',
    case when v_locale in ('pt', 'en') then v_locale else 'pt' end
  );

  insert into public.workspaces (name, kind, owner_id)
  values ('Personal', 'personal', new.id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  if new.email_confirmed_at is not null then
    perform public.claim_pending_shares(new.id, new.email);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or new.email is distinct from old.email) then
    perform public.claim_pending_shares(new.id, new.email);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.handle_user_updated();

-- -----------------------------------------------------------------------------
-- Storage bucket (private; accessed only through server-issued signed URLs)
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;
