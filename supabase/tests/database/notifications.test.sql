-- Database tests for share notification emails.
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

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
insert into ids values ('friend', tests.create_user('friend@example.com'));
insert into ids values ('viewer', tests.create_user('viewer@example.com'));
update public.profiles set locale = 'pt', full_name = 'Ana Lopes' where id = (select id from ids where name = 'owner');
update public.profiles set locale = 'en' where id = (select id from ids where name = 'friend');

select tests.login((select id from ids where name = 'owner'));
insert into ids select 'doc', id from public.create_native_file(
  tests.personal_ws((select id from ids where name = 'owner')), null, 'Plano', 'document', '');
insert into ids select 'share_friend', id from public.share_file((select id from ids where name = 'doc'), 'friend@example.com', 'editor');
insert into ids select 'share_new', id from public.share_file((select id from ids where name = 'doc'), 'new.person@example.com', 'viewer');
insert into ids select 'share_viewer', id from public.share_file((select id from ids where name = 'doc'), 'viewer@example.com', 'viewer');

select results_eq(
  format('select recipient, recipient_locale, has_account, file_name, role::text, sender_name, sender_email from public.prepare_share_notification(%L)',
         (select id from ids where name = 'share_friend')),
  $$values ('friend@example.com', 'en', true, 'Plano', 'editor', 'Ana Lopes', 'owner@example.com')$$,
  'share details come in the recipient''s language');
select results_eq(
  format('select has_account, recipient_locale from public.prepare_share_notification(%L)', (select id from ids where name = 'share_new')),
  $$values (false, null::text)$$,
  'people without an account are invited to sign up');
select tests.logout();

select is((select count(*) from public.notification_emails where sender_id = (select id from ids where name = 'owner')), 2::bigint, 'each email is logged');

select tests.login((select id from ids where name = 'viewer'));
select throws_ok(
  format('select * from public.prepare_share_notification(%L)', (select id from ids where name = 'share_friend')),
  'P0001', 'forbidden', 'only people who can share may notify');
select throws_ok(
  format('select * from public.prepare_share_notification(%L)', gen_random_uuid()),
  'P0001', 'not_found', 'unknown shares are rejected');
select throws_ok(
  $$select public.reserve_notification_email('x@example.com', 'file_shared', null, null)$$,
  '42501', null, 'the log cannot be written directly');
select throws_ok('select count(*) from public.notification_emails', '42501', null, 'the log is not readable');
select tests.logout();

-- Old shares cannot be (re)announced.
update public.file_shares set created_at = now() - interval '1 day' where id = (select id from ids where name = 'share_viewer');
select tests.login((select id from ids where name = 'owner'));
select throws_ok(
  format('select * from public.prepare_share_notification(%L)', (select id from ids where name = 'share_viewer')),
  'P0001', 'forbidden', 'old shares are not announced again');
select tests.logout();

-- Rate limit: 30 an hour per sender.
insert into public.notification_emails (sender_id, recipient, kind)
select (select id from ids where name = 'owner'), 'bulk' || n || '@example.com', 'file_shared' from generate_series(1, 28) n;
update public.file_shares set created_at = now() where id = (select id from ids where name = 'share_viewer');
select tests.login((select id from ids where name = 'owner'));
select throws_ok(
  format('select * from public.prepare_share_notification(%L)', (select id from ids where name = 'share_viewer')),
  'P0001', 'rate_limited', 'senders are rate limited');
select tests.logout();

-- Team members.
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'team', id from public.create_team_workspace('Equipa Norte');
select public.add_workspace_member((select id from ids where name = 'team'), 'friend@example.com', 'member');
select tests.logout();
delete from public.notification_emails where sender_id = (select id from ids where name = 'owner');
select tests.login((select id from ids where name = 'owner'));
select results_eq(
  format('select recipient, recipient_locale, workspace_name from public.prepare_member_notification(%L, %L)',
         (select id from ids where name = 'team'), (select id from ids where name = 'friend')),
  $$values ('friend@example.com', 'en', 'Equipa Norte')$$,
  'team invitations name the team');
select tests.logout();

select tests.login((select id from ids where name = 'friend'));
select throws_ok(
  format('select * from public.prepare_member_notification(%L, %L)',
         (select id from ids where name = 'team'), (select id from ids where name = 'owner')),
  'P0001', 'forbidden', 'members cannot send team invitations');
select tests.logout();

select tests.login((select id from ids where name = 'owner'));
select throws_ok(
  format('select * from public.prepare_member_notification(%L, %L)',
         (select id from ids where name = 'team'), (select id from ids where name = 'viewer')),
  'P0001', 'forbidden', 'only actual members are notified');
select tests.logout();

-- Retention.
insert into public.notification_emails (sender_id, recipient, kind, created_at)
values ((select id from ids where name = 'owner'), 'old@example.com', 'file_shared', now() - interval '100 days');
select tests.login((select id from ids where name = 'owner'));
select throws_ok('select public.prune_notification_log()', '42501', null, 'only the server prunes the log');
select tests.logout();
select ok(public.prune_notification_log() >= 1, 'entries older than 90 days are pruned');
select is((select count(*) from public.notification_emails where recipient = 'old@example.com'), 0::bigint, 'old entries are gone');

select * from finish();
rollback;
