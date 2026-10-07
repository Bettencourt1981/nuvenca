-- Database tests for the activity log and in-app notifications.
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

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
insert into ids values ('editor', tests.create_user('editor@example.com'));
insert into ids values ('member', tests.create_user('member@example.com'));
insert into ids values ('stranger', tests.create_user('stranger@example.com'));
update public.profiles set full_name = 'Ana Lopes' where id = (select id from ids where name = 'owner');
update public.profiles set full_name = 'Rui Costa' where id = (select id from ids where name = 'editor');

-- Only this test's workspaces: the database may hold other data (and the app
-- may be writing to it while the tests run).
create function tests.events(p_action text) returns bigint language sql security definer as $$
  select count(*) from public.audit_events
   where action = p_action and workspace_id in (select w.id from public.workspaces w where w.owner_id in (select id from ids))
$$;
create function tests.last_event(p_action text) returns public.audit_events language sql security definer as $$
  select * from public.audit_events
   where action = p_action and workspace_id in (select w.id from public.workspaces w where w.owner_id in (select id from ids))
   order by id desc limit 1
$$;
create function tests.notifications_of(p_user uuid, p_kind text) returns bigint language sql security definer as $$
  select count(*) from public.notifications where user_id = p_user and kind = p_kind
$$;
grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Activity: files
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'folder', id from public.create_folder(tests.personal_ws((select id from ids where name = 'owner')), null, 'Contratos');
insert into ids select 'other', id from public.create_folder(tests.personal_ws((select id from ids where name = 'owner')), null, 'Arquivo');
insert into ids select 'child', id from public.create_folder(tests.personal_ws((select id from ids where name = 'owner')), (select id from ids where name = 'folder'), 'Assinados');
insert into ids select 'doc', id from public.create_native_file(tests.personal_ws((select id from ids where name = 'owner')), null, 'Plano', 'document', '');
select tests.logout();

select is((tests.last_event('file.created')).actor_name, 'Ana Lopes', 'creating files is logged with who did it');
select is(tests.events('file.created'), 4::bigint, 'every creation is logged');

select tests.login((select id from ids where name = 'owner'));
select public.rename_file((select id from ids where name = 'folder'), 'Contratos 2027');
select public.move_files(array[(select id from ids where name = 'folder')], (select id from ids where name = 'other'));
select public.trash_files(array[(select id from ids where name = 'folder')]);
select public.restore_files(array[(select id from ids where name = 'folder')]);
select tests.logout();

select is((tests.last_event('file.renamed')).details ->> 'from', 'Contratos', 'renames keep the old name');
select is((tests.last_event('file.moved')).details ->> 'to', 'Arquivo', 'moves say where to');
select is(tests.events('file.trashed'), 1::bigint, 'trashing is logged once (not for each item inside)');
select is(tests.events('file.restored'), 1::bigint, 'restoring is logged');
select is(tests.events('file.moved'), 1::bigint, 'moving a folder logs only the folder');

-- Upload: started by the user, finished by the server.
select tests.login((select id from ids where name = 'owner'));
with started as (select * from public.begin_upload(tests.personal_ws((select id from ids where name = 'owner')), null, 'nota.txt', 5, 'text/plain'))
insert into ids select 'upload', file_id from started union all select 'upload_version', version_id from started;
select tests.logout();
select is(tests.events('file.created') , 4::bigint, 'unfinished uploads are not logged');
select public.complete_upload((select id from ids where name = 'upload_version'), 5, 'text/plain');
select is((tests.last_event('file.uploaded')).actor_id, (select id from ids where name = 'owner'), 'uploads are credited to the uploader');

-- Sharing.
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'share', id from public.share_file((select id from ids where name = 'doc'), 'editor@example.com', 'editor');
select public.update_share((select id from ids where name = 'share'), 'viewer');
select public.set_share_link((select id from ids where name = 'doc'), true, 'viewer');
select tests.logout();
select is((tests.last_event('share.added')).details ->> 'email', 'editor@example.com', 'shares are logged');
select is((tests.last_event('share.changed')).details ->> 'from', 'editor', 'role changes are logged');
select is((tests.last_event('link.changed')).details ->> 'enabled', 'true', 'public links are logged');

-- Downloads.
select tests.login((select id from ids where name = 'editor'));
select lives_ok(format('select public.log_file_download(%L)', (select id from ids where name = 'doc')), 'people with access report downloads');
select tests.logout();
select is((tests.last_event('file.downloaded')).actor_name, 'Rui Costa', 'downloads are logged with who downloaded');
select tests.login((select id from ids where name = 'stranger'));
select throws_ok(format('select public.log_file_download(%L)', (select id from ids where name = 'doc')), 'P0001', 'not_found',
  'downloads of inaccessible files are refused');
select tests.logout();

-- Permanent deletion: only the trashed item.
select tests.login((select id from ids where name = 'owner'));
select public.trash_files(array[(select id from ids where name = 'other')]);
select public.delete_files_forever(array[(select id from ids where name = 'other')]);
select tests.logout();
select is(tests.events('file.deleted'), 1::bigint, 'deleting a folder logs the folder, not its contents');

-- ---------------------------------------------------------------------------
-- Activity: teams, plan, visibility
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'team', id from public.create_team_workspace('Equipa Sul');
select public.add_workspace_member((select id from ids where name = 'team'), 'member@example.com', 'member');
select public.add_workspace_member((select id from ids where name = 'team'), 'editor@example.com', 'admin');
select public.update_workspace_member((select id from ids where name = 'team'), (select id from ids where name = 'member'), 'admin');
select public.update_workspace_member((select id from ids where name = 'team'), (select id from ids where name = 'member'), 'member');
select public.rename_workspace((select id from ids where name = 'team'), 'Equipa Sul Lda');
select tests.logout();
select is(tests.events('member.added'), 2::bigint, 'new members are logged (not the creator)');
select is(tests.events('member.role_changed'), 2::bigint, 'role changes are logged');
select is((tests.last_event('workspace.renamed')).details ->> 'from', 'Equipa Sul', 'renaming a team is logged');

-- Plan changes made by the server for an admin carry the admin's name.
select tests.login_service();
select set_config('nuvenca.actor_id', (select id::text from ids where name = 'editor'), true);
update public.workspaces set plan_id = 'business' where id = (select id from ids where name = 'team');
select set_config('nuvenca.actor_id', '', true);
select tests.logout();
select is((tests.last_event('plan.changed')).actor_name, 'Rui Costa', 'plan changes are logged with the acting admin');

select tests.login((select id from ids where name = 'member'));
select is((select count(*) from public.audit_events where workspace_id = (select id from ids where name = 'team')), 0::bigint,
  'members cannot read the team''s activity');
select tests.logout();
select tests.login((select id from ids where name = 'editor'));
select ok((select count(*) from public.audit_events where workspace_id = (select id from ids where name = 'team')) >= 4,
  'team admins read the team''s activity');
select is((select count(*) from public.audit_events where workspace_id = tests.personal_ws((select id from ids where name = 'owner'))), 0::bigint,
  'nobody else reads a personal drive''s activity');
select throws_ok($$insert into public.audit_events (workspace_id, action) values (gen_random_uuid(), 'x')$$, '42501', null,
  'the log cannot be written directly');
select tests.logout();
select tests.login((select id from ids where name = 'owner'));
select ok((select count(*) from public.audit_events where workspace_id = tests.personal_ws((select id from ids where name = 'owner'))) >= 10,
  'owners read their own drive''s activity');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
select is(tests.notifications_of((select id from ids where name = 'editor'), 'file_shared'), 1::bigint,
  'sharing with someone notifies them');
select is(tests.notifications_of((select id from ids where name = 'member'), 'workspace_member'), 1::bigint,
  'joining a team notifies the new member');
select is(tests.notifications_of((select id from ids where name = 'owner'), 'workspace_member'), 0::bigint,
  'the team creator is not notified');

-- An invitation to an address without an account notifies once they sign up.
select tests.login((select id from ids where name = 'owner'));
select public.share_file((select id from ids where name = 'doc'), 'later@example.com', 'commenter');
select tests.logout();
insert into ids values ('later', tests.create_user('later@example.com'));
select is(tests.notifications_of((select id from ids where name = 'later'), 'file_shared'), 1::bigint,
  'invitations are notified when the person signs up');

-- Comments: the file's owner, then everyone in the thread.
select tests.login((select id from ids where name = 'owner'));
select public.update_share((select id from ids where name = 'share'), 'commenter');
select tests.logout();
select tests.login((select id from ids where name = 'editor'));
insert into ids select 'thread', id from public.add_comment((select id from ids where name = 'doc'), null, '{}', 'Plano', 'Podemos rever isto?');
select tests.logout();
select is(tests.notifications_of((select id from ids where name = 'owner'), 'comment'), 1::bigint, 'comments notify the owner');
select tests.login((select id from ids where name = 'owner'));
select public.add_comment((select id from ids where name = 'doc'), (select id from ids where name = 'thread'), null, null, 'Sim, amanhã.');
select tests.logout();
select is(tests.notifications_of((select id from ids where name = 'editor'), 'comment'), 1::bigint, 'replies notify the thread');
select is(tests.notifications_of((select id from ids where name = 'owner'), 'comment'), 1::bigint, 'nobody is notified of their own reply');

-- People who lost access are not notified.
select tests.login((select id from ids where name = 'owner'));
select public.remove_share((select id from ids where name = 'share'));
select public.add_comment((select id from ids where name = 'doc'), (select id from ids where name = 'thread'), null, null, 'Fechado.');
select tests.logout();
select is(tests.notifications_of((select id from ids where name = 'editor'), 'comment'), 1::bigint,
  'people without access are not notified');

-- Reading and marking.
select tests.login((select id from ids where name = 'editor'));
select is((select count(*) from public.notifications), (select count(*) from public.notifications where user_id = (select id from ids where name = 'editor')),
  'people only see their own notifications');
select is((select actor_name from public.notifications where kind = 'comment'), 'Ana Lopes', 'notifications say who did it');
select is(public.mark_notifications_read(null), 3::integer, 'mark all as read');
select is((select count(*) from public.notifications where read_at is null), 0::bigint, 'nothing unread afterwards');
select tests.logout();

-- Retention.
update public.audit_events set created_at = now() - interval '40 days'
 where workspace_id = tests.personal_ws((select id from ids where name = 'owner')) and action = 'file.created';
select ok((public.prune_activity() ->> 'audit_events')::int >= 4, 'old activity is pruned per plan (30 days on Free)');

select * from finish();
rollback;
