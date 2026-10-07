-- Database tests for billing (subscriptions applied by the Stripe webhook).
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

create schema if not exists tests;
grant usage on schema tests to authenticated, service_role;

create function tests.create_user(p_email text)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '', now(), '{}', now(), now());
  return v_id;
end $$;

create function tests.login(p_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.personal_ws(p_user_id uuid) returns uuid language sql security definer as $$
  select id from public.workspaces where owner_id = p_user_id and kind = 'personal'
$$;
grant execute on all functions in schema tests to authenticated, service_role;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, service_role;
insert into ids values ('owner', tests.create_user('owner@example.com'));
insert into ids values ('admin', tests.create_user('admin@example.com'));
insert into ids values ('member', tests.create_user('member@example.com'));

select tests.login((select id from ids where name = 'owner'));
insert into ids select 'team', id from public.create_team_workspace('Equipa Faturação');
select public.add_workspace_member((select id from ids where name = 'team'), 'admin@example.com', 'admin');
select public.add_workspace_member((select id from ids where name = 'team'), 'member@example.com', 'member');
select throws_ok(
  format($$select public.apply_subscription(%L, 'business', 'active', 'sub_1', 'cus_1', now(), now() + interval '1 month', false)$$,
         (select id from ids where name = 'team')),
  '42501', null, 'people cannot apply subscriptions themselves');
select tests.logout();

select tests.login_service();
select is(
  public.apply_subscription((select id from ids where name = 'team'), 'business', 'incomplete', 'sub_1', 'cus_1', null, null, false),
  'free', 'an unfinished first payment changes nothing');
select is(
  public.apply_subscription((select id from ids where name = 'team'), 'business', 'active', 'sub_1', 'cus_1',
                            now(), now() + interval '1 month', false),
  'business', 'an active subscription sets the plan');
select tests.logout();

select is((select plan_id from public.workspaces where id = (select id from ids where name = 'team')), 'business', 'the workspace is on the new plan');
select is((select storage_quota_bytes from public.plans p join public.workspaces w on w.plan_id = p.id where w.id = (select id from ids where name = 'team')),
  1024::bigint * 1024 * 1024 * 1024, 'its limits follow the plan');
select is((select action from public.audit_events where workspace_id = (select id from ids where name = 'team') and action = 'plan.changed'), 'plan.changed',
  'plan changes appear in the activity log');

select tests.login((select id from ids where name = 'admin'));
select is((select status::text from public.subscriptions where workspace_id = (select id from ids where name = 'team')), 'active',
  'admins see the subscription status');
select throws_ok('select provider_subscription_id from public.subscriptions', '42501', null, 'provider ids stay on the server');
select tests.logout();
select tests.login((select id from ids where name = 'member'));
select is((select count(*) from public.subscriptions), 0::bigint, 'members don''t see billing');
select tests.logout();

select tests.login_service();
select is(
  public.apply_subscription((select id from ids where name = 'team'), 'business', 'past_due', 'sub_1', 'cus_1', now(), now() + interval '1 month', false),
  'business', 'a failed payment keeps the plan while Stripe retries');
select is(
  public.apply_subscription((select id from ids where name = 'team'), 'business', 'canceled', 'sub_1', 'cus_1', now(), now(), false),
  'free', 'a canceled subscription goes back to Free');
select tests.logout();

select * from finish();
rollback;
