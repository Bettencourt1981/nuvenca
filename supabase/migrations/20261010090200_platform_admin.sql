-- =============================================================================
-- Nuvenca — platform admin console (stage 4)
-- =============================================================================
--
-- Read models and actions for the people who run Nuvenca (PLATFORM_ADMIN_EMAILS).
-- Server only: the app checks the admin's identity, then calls these with the
-- secret key. Nothing here is callable from browsers.

create function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'teams', (select count(*) from public.workspaces where kind = 'team'),
    'files', (select count(*) from public.files where kind = 'file' and status = 'ready'),
    'native_files', (select count(*) from public.files where status = 'ready' and public.is_native_mime(mime_type)),
    'storage_bytes', (select coalesce(sum(storage_used_bytes), 0) from public.workspaces),
    'plans', (select coalesce(jsonb_object_agg(plan_id, n), '{}'::jsonb)
                from (select plan_id, count(*) n from public.workspaces group by plan_id) p),
    'subscriptions', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                        from (select status::text, count(*) n from public.subscriptions where provider = 'stripe' group by status) s),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', n) order by day), '[]'::jsonb)
                  from (select date_trunc('day', created_at)::date as day, count(*) n
                          from auth.users where created_at > now() - interval '30 days' group by 1) d)
  );
$$;

create function public.admin_list_workspaces(p_query text, p_limit integer, p_offset integer)
returns table (
  id uuid,
  name text,
  kind public.workspace_kind,
  owner_email text,
  owner_name text,
  plan_id text,
  members bigint,
  storage_used_bytes bigint,
  storage_quota_bytes bigint,
  subscription_status text,
  created_at timestamptz,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with matches as (
    select w.*, p.email as owner_email, p.full_name as owner_name
      from public.workspaces w
      join public.profiles p on p.id = w.owner_id
     where coalesce(btrim(p_query), '') = ''
        or w.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
        or w.id::text = btrim(p_query)
  )
  select m.id, m.name, m.kind, m.owner_email, m.owner_name, m.plan_id,
         (select count(*) from public.workspace_members wm where wm.workspace_id = m.id),
         m.storage_used_bytes,
         pl.storage_quota_bytes,
         (select s.status::text from public.subscriptions s where s.workspace_id = m.id and s.provider = 'stripe'),
         m.created_at,
         count(*) over ()
    from matches m
    join public.plans pl on pl.id = m.plan_id
   order by m.storage_used_bytes desc, m.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.admin_list_users(p_query text, p_limit integer, p_offset integer)
returns table (
  id uuid,
  email text,
  full_name text,
  locale text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  confirmed boolean,
  teams bigint,
  storage_used_bytes bigint,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, p.full_name, p.locale, u.created_at, u.last_sign_in_at,
         u.email_confirmed_at is not null,
         (select count(*) from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
           where m.user_id = u.id and w.kind = 'team'),
         coalesce((select w.storage_used_bytes from public.workspaces w where w.owner_id = u.id and w.kind = 'personal'), 0),
         count(*) over ()
    from auth.users u
    left join public.profiles p on p.id = u.id
   where coalesce(btrim(p_query), '') = ''
      or u.email ilike '%' || btrim(p_query) || '%'
      or p.full_name ilike '%' || btrim(p_query) || '%'
   order by u.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Change a workspace's plan by hand (support, discounts, partners). The admin
-- is recorded in the activity log.
create function public.admin_set_workspace_plan(p_workspace_id uuid, p_plan_id text, p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'invalid_plan';
  end if;
  perform set_config('nuvenca.actor_id', coalesce(p_actor_id::text, ''), true);
  update public.workspaces set plan_id = p_plan_id where id = p_workspace_id;
  if not found then
    raise exception 'not_found';
  end if;
  perform set_config('nuvenca.actor_id', '', true);
end;
$$;

revoke execute on function public.admin_overview() from public, anon, authenticated;
revoke execute on function public.admin_list_workspaces(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_set_workspace_plan(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_list_workspaces(text, integer, integer) to service_role;
grant execute on function public.admin_list_users(text, integer, integer) to service_role;
grant execute on function public.admin_set_workspace_plan(uuid, text, uuid) to service_role;
