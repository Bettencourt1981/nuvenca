-- Database tests for permissions, sharing, uploads and trash.
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

-- pgTAP keeps its state in temp tables owned by the session user; let the
-- `authenticated` role write to them so assertions can run as a test user.
grant all on all tables in schema pg_temp to authenticated;
grant all on all sequences in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema if not exists tests;
grant usage on schema tests to authenticated;

create function tests.create_user(p_email text, p_confirmed boolean default true)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          case when p_confirmed then now() end, '{"full_name": "Test"}', now(), now());
  return v_id;
end $$;

create function tests.login(p_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema tests to authenticated;

create function tests.personal_ws(p_user_id uuid) returns uuid language sql security definer as $$
  select id from public.workspaces where owner_id = p_user_id and kind = 'personal'
$$;

-- Simulate a finished upload (server side).
create function tests.upload(p_user_id uuid, p_ws uuid, p_parent uuid, p_name text, p_size bigint)
returns uuid language plpgsql as $$
declare v_file uuid; v_version uuid;
begin
  perform tests.login(p_user_id);
  select file_id, version_id into v_file, v_version from public.begin_upload(p_ws, p_parent, p_name, p_size, 'text/plain');
  perform tests.logout();
  perform public.complete_upload(v_version, p_size, 'text/plain');
  return v_file;
end $$;

-- ---------------------------------------------------------------------------
-- Sign-up provisioning
-- ---------------------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

insert into ids values ('alice', tests.create_user('alice@example.com'));
insert into ids values ('bob', tests.create_user('bob@example.com'));
insert into ids values ('mallory', tests.create_user('mallory@example.com'));

select is((select count(*)::int from public.profiles where email = 'alice@example.com'), 1, 'profile created on sign-up');
select isnt(tests.personal_ws((select id from ids where name = 'alice')), null, 'personal workspace created');
select is(
  (select role::text from public.workspace_members where user_id = (select id from ids where name = 'alice')),
  'owner', 'user owns their personal workspace');

-- ---------------------------------------------------------------------------
-- Folders and uploads
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'alice'));
insert into ids select 'projects', id from public.create_folder(tests.personal_ws((select id from ids where name = 'alice')), null, '  Projects ');
insert into ids select 'design', id from public.create_folder(null, (select id from ids where name = 'projects'), 'Design');
select is((select name from public.files where id = (select id from ids where name = 'projects')), 'Projects', 'folder names are trimmed');
select is(
  (select ancestor_ids from public.files where id = (select id from ids where name = 'design')),
  array[(select id from ids where name = 'projects')], 'ancestor path recorded');
select throws_ok(
  format('select public.create_folder(%L, null, %L)', tests.personal_ws((select id from ids where name = 'alice')), '   '),
  'P0001', 'invalid_name', 'blank names are rejected');
select tests.logout();

insert into ids values ('report', tests.upload((select id from ids where name = 'alice'),
  tests.personal_ws((select id from ids where name = 'alice')), (select id from ids where name = 'design'), 'report.txt', 1000));

select is((select status::text from public.files where id = (select id from ids where name = 'report')), 'ready', 'upload completed');
select is((select storage_used_bytes from public.workspaces where id = tests.personal_ws((select id from ids where name = 'alice'))),
  1000::bigint, 'storage usage counted');

select tests.login((select id from ids where name = 'alice'));
select throws_ok(
  format('select * from public.begin_upload(%L, null, %L, %s, null)',
    tests.personal_ws((select id from ids where name = 'alice')), 'huge.bin', 200 * 1024 * 1024),
  'P0001', 'file_too_large', 'plan file size limit enforced');
select throws_ok(
  format('select public.complete_upload(%L, 1, null)', (select current_version_id from public.files where id = (select id from ids where name = 'report'))),
  '42501', null, 'clients cannot complete uploads themselves');
select throws_ok(
  format('insert into public.files (workspace_id, kind, name) values (%L, %L, %L)',
    tests.personal_ws((select id from ids where name = 'alice')), 'folder', 'x'),
  '42501', null, 'clients cannot write tables directly');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Isolation and sharing
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'bob'));
select is((select count(*)::int from public.files where workspace_id = tests.personal_ws((select id from ids where name = 'alice'))),
  0, 'other users see nothing by default');
select throws_ok(
  format('select public.rename_file(%L, %L)', (select id from ids where name = 'report'), 'hacked'),
  'P0001', 'not_found', 'no access looks like not found');
select tests.logout();

set local role anon;
select is((select count(*)::int from public.files), 0, 'anonymous users see nothing');
reset role;

select tests.login((select id from ids where name = 'alice'));
select lives_ok(
  format('select public.share_file(%L, %L, %L)', (select id from ids where name = 'projects'), 'Bob@Example.com', 'viewer'),
  'share a folder by email');
select throws_ok(
  format('select public.share_file(%L, %L, %L)', (select id from ids where name = 'projects'), 'not-an-email', 'viewer'),
  'P0001', 'invalid_email', 'invalid emails rejected');
select tests.logout();

select tests.login((select id from ids where name = 'bob'));
select is((select count(*)::int from public.files where workspace_id = tests.personal_ws((select id from ids where name = 'alice'))),
  3, 'viewer sees the shared folder and everything inside');
select is(public.file_access_level((select id from ids where name = 'report')), 1, 'viewer access is inherited');
select throws_ok(
  format('select public.rename_file(%L, %L)', (select id from ids where name = 'report'), 'nope'),
  'P0001', 'forbidden', 'viewers cannot rename');
select throws_ok(
  format('select public.create_folder(null, %L, %L)', (select id from ids where name = 'design'), 'nope'),
  'P0001', 'forbidden', 'viewers cannot add items');
select is((select count(*)::int from public.shared_with_me()), 1, 'shared with me lists only the top shared item');
select is((select count(*)::int from public.get_file_access_list((select id from ids where name = 'report'))), 1,
  'access list shows inherited shares');
select tests.logout();

select tests.login((select id from ids where name = 'alice'));
select lives_ok(
  format('select public.share_file(%L, %L, %L)', (select id from ids where name = 'projects'), 'bob@example.com', 'editor'),
  'sharing again updates the role');
select is((select count(*)::int from public.file_shares where file_id = (select id from ids where name = 'projects')), 1,
  'no duplicate share rows');
select tests.logout();

select tests.login((select id from ids where name = 'bob'));
select lives_ok(
  format('select public.create_folder(null, %L, %L)', (select id from ids where name = 'design'), 'From Bob'),
  'editors can add items');
select lives_ok(
  format('select public.rename_file(%L, %L)', (select id from ids where name = 'report'), 'report-v2.txt'),
  'editors can rename');
select throws_ok(
  format('select public.move_files(array[%L]::uuid[], null)', (select id from ids where name = 'report')),
  'P0001', 'forbidden', 'non-members cannot move items to the workspace root');
select tests.logout();

select tests.login((select id from ids where name = 'mallory'));
select is(public.file_access_level((select id from ids where name = 'report')), 0, 'unrelated users still have no access');
select tests.logout();

-- Invitation before sign-up is claimed once the email is confirmed.
select tests.login((select id from ids where name = 'alice'));
select lives_ok(
  format('select public.share_file(%L, %L, %L)', (select id from ids where name = 'report'), 'carol@example.com', 'commenter'),
  'invite someone without an account');
select tests.logout();
insert into ids values ('carol', tests.create_user('carol@example.com', false));
select tests.login((select id from ids where name = 'carol'));
select is(public.file_access_level((select id from ids where name = 'report')), 0, 'unconfirmed email does not grant access');
select tests.logout();
update auth.users set email_confirmed_at = now() where id = (select id from ids where name = 'carol');
select tests.login((select id from ids where name = 'carol'));
select is(public.file_access_level((select id from ids where name = 'report')), 2, 'confirmed email claims the invitation');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Move, trash, restore, delete
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'alice'));
select throws_ok(
  format('select public.move_files(array[%L]::uuid[], %L)', (select id from ids where name = 'projects'), (select id from ids where name = 'design')),
  'P0001', 'cannot_move_into_itself', 'cannot move a folder into its own subfolder');
select lives_ok(
  format('select public.move_files(array[%L]::uuid[], null)', (select id from ids where name = 'design')),
  'move a folder to the root');
select is(
  (select ancestor_ids from public.files where id = (select id from ids where name = 'report')),
  array[(select id from ids where name = 'design')], 'descendant paths rewritten after a move');

select lives_ok(format('select public.trash_files(array[%L]::uuid[])', (select id from ids where name = 'design')), 'trash a folder');
select is((select in_trash from public.files where id = (select id from ids where name = 'report')), true, 'children are hidden with their folder');
select is((select trashed_at is null from public.files where id = (select id from ids where name = 'report')), true, 'children are not individually trashed');
select lives_ok(format('select public.restore_files(array[%L]::uuid[])', (select id from ids where name = 'design')), 'restore a folder');
select is((select in_trash from public.files where id = (select id from ids where name = 'report')), false, 'children come back with their folder');

select throws_ok(
  format('select public.delete_files_forever(array[%L]::uuid[])', (select id from ids where name = 'design')),
  'P0001', 'not_in_trash', 'only trashed items can be deleted forever');
select public.trash_files(array[(select id from ids where name = 'design')]);
select is(
  (select cardinality(public.delete_files_forever(array[(select id from ids where name = 'design')]))),
  1, 'delete forever returns the storage paths to remove');
select tests.logout();

select is((select storage_used_bytes from public.workspaces where id = tests.personal_ws((select id from ids where name = 'alice'))),
  0::bigint, 'storage usage released');
select is((select count(*)::int from public.file_shares where email = 'carol@example.com'), 0, 'shares removed with the file');

-- ---------------------------------------------------------------------------
-- Team workspaces
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'alice'));
insert into ids select 'team', id from public.create_team_workspace('Acme');
select lives_ok(
  format('select public.add_workspace_member(%L, %L, %L)', (select id from ids where name = 'team'), 'bob@example.com', 'member'),
  'add a member by email');
select throws_ok(
  format('select public.add_workspace_member(%L, %L, %L)', (select id from ids where name = 'team'), 'nobody@example.com', 'member'),
  'P0001', 'user_not_found', 'members must have an account');
select tests.logout();

select tests.login((select id from ids where name = 'bob'));
select is(public.is_workspace_member((select id from ids where name = 'team')), true, 'member can access the team workspace');
select throws_ok(
  format('select public.add_workspace_member(%L, %L, %L)', (select id from ids where name = 'team'), 'mallory@example.com', 'member'),
  'P0001', 'forbidden', 'plain members cannot add members');
select tests.logout();

select * from finish();
rollback;
