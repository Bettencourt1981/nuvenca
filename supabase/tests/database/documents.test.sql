-- Database tests for native documents: content, comments, versions, realtime.
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

grant all on all tables in schema pg_temp to authenticated;
grant all on all sequences in schema pg_temp to authenticated;

create schema if not exists tests;
grant usage on schema tests to authenticated;

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

create function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.personal_ws(p_user_id uuid) returns uuid language sql security definer as $$
  select id from public.workspaces where owner_id = p_user_id and kind = 'personal'
$$;
grant execute on all functions in schema tests to authenticated;

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('owner', tests.create_user('owner@example.com'));
insert into ids values ('editor', tests.create_user('editor@example.com'));
insert into ids values ('commenter', tests.create_user('commenter@example.com'));
insert into ids values ('viewer', tests.create_user('viewer@example.com'));
insert into ids values ('stranger', tests.create_user('stranger@example.com'));

-- ---------------------------------------------------------------------------
-- Create and share a document
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'doc', id from public.create_native_file(
  tests.personal_ws((select id from ids where name = 'owner')), null, 'Plano', 'document', encode('initial-state', 'base64'));
select is((select mime_type from public.files where id = (select id from ids where name = 'doc')),
  'application/vnd.nuvenca.document', 'native document created');
select is((select size_bytes from public.files where id = (select id from ids where name = 'doc')),
  13::bigint, 'size reflects the stored state');
select is((select storage_used_bytes from public.workspaces where id = tests.personal_ws((select id from ids where name = 'owner'))),
  13::bigint, 'native content counts towards storage');
select throws_ok(
  format('select public.create_native_file(%L, null, %L, %L, %L)', tests.personal_ws((select id from ids where name = 'owner')), 'x', 'slides', ''),
  'P0001', 'invalid_type', 'unknown native types are rejected');

select public.share_file((select id from ids where name = 'doc'), 'editor@example.com', 'editor');
select public.share_file((select id from ids where name = 'doc'), 'commenter@example.com', 'commenter');
select public.share_file((select id from ids where name = 'doc'), 'viewer@example.com', 'viewer');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Content: load and append
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'editor'));
select lives_ok(
  format('select public.append_document_update(%L, %L)', (select id from ids where name = 'doc'), encode('edit-1', 'base64')),
  'editors append updates');
select tests.logout();

select tests.login((select id from ids where name = 'viewer'));
select is(
  (public.load_document((select id from ids where name = 'doc')) ->> 'state'),
  encode('initial-state', 'base64'), 'viewers load the state');
select is(
  jsonb_array_length(public.load_document((select id from ids where name = 'doc')) -> 'updates'),
  1, 'pending updates are returned with the state');
select is(
  (public.load_document((select id from ids where name = 'doc')) ->> 'access_level')::int,
  1, 'load reports the access level');
select throws_ok(
  format('select public.append_document_update(%L, %L)', (select id from ids where name = 'doc'), encode('evil', 'base64')),
  'P0001', 'forbidden', 'viewers cannot edit');
select tests.logout();

select tests.login((select id from ids where name = 'stranger'));
select throws_ok(
  format('select public.load_document(%L)', (select id from ids where name = 'doc')),
  'P0001', 'not_found', 'strangers cannot load');
select throws_ok(
  format('select public.compact_document(%L, %L, 0, 1)', (select id from ids where name = 'doc'), encode('x', 'base64')),
  '42501', null, 'clients cannot compact');
select tests.logout();

-- Compaction (server side)
select is(public.compact_document((select id from ids where name = 'doc'), encode('merged', 'base64'), 0,
  (select max(id) from public.document_updates where file_id = (select id from ids where name = 'doc'))),
  true, 'compaction applies with the expected revision');
select is(public.compact_document((select id from ids where name = 'doc'), encode('stale', 'base64'), 0, 0),
  false, 'stale compaction is rejected');
select is((select count(*)::int from public.document_updates where file_id = (select id from ids where name = 'doc')),
  0, 'compacted updates are removed');
select is((select storage_used_bytes from public.workspaces where id = tests.personal_ws((select id from ids where name = 'owner'))),
  6::bigint, 'storage usage follows the compacted state');

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'commenter'));
insert into ids select 'thread', id from public.add_comment(
  (select id from ids where name = 'doc'), null, '{"from":"a","to":"b"}', 'quoted', 'Please check this');
select is((select count(*)::int from public.document_comments), 1, 'commenters comment and read comments');
select throws_ok(
  format('select public.add_comment(%L, null, null, null, %L)', (select id from ids where name = 'doc'), '   '),
  'P0001', 'invalid_comment', 'empty comments are rejected');
select tests.logout();

select tests.login((select id from ids where name = 'viewer'));
select is((select count(*)::int from public.document_comments), 0, 'viewers do not see comments');
select throws_ok(
  format('select public.add_comment(%L, null, null, null, %L)', (select id from ids where name = 'doc'), 'hi'),
  'P0001', 'forbidden', 'viewers cannot comment');
select tests.logout();

select tests.login((select id from ids where name = 'editor'));
select lives_ok(
  format('select public.add_comment(%L, %L, null, null, %L)', (select id from ids where name = 'doc'), (select id from ids where name = 'thread'), 'Done'),
  'reply to a thread');
select lives_ok(format('select public.resolve_comment(%L, true)', (select id from ids where name = 'thread')), 'resolve a thread');
select throws_ok(
  format('select public.edit_comment(%L, %L)', (select id from ids where name = 'thread'), 'rewritten'),
  'P0001', 'forbidden', 'only the author edits a comment');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Versions
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'editor'));
select lives_ok(
  format('select public.create_document_version(%L, %L, %L)', (select id from ids where name = 'doc'), encode('v1', 'base64'), 'Draft'),
  'editors save versions');
select is((select count(*)::int from public.list_document_versions((select id from ids where name = 'doc'))), 1, 'versions are listed');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Realtime topic access
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'viewer'));
select is(public.realtime_file_access('file:' || (select id from ids where name = 'doc')), 1, 'viewers may listen on the file topic');
select tests.logout();
select tests.login((select id from ids where name = 'stranger'));
select is(public.realtime_file_access('file:' || (select id from ids where name = 'doc')), 0, 'strangers may not join the topic');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Joining through a public link
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'owner'));
insert into ids select 'link', id from public.set_share_link((select id from ids where name = 'doc'), true, 'editor');
select tests.logout();
create temp table link_token as select token from public.share_links where id = (select id from ids where name = 'link');
grant select on link_token to authenticated;

select tests.login((select id from ids where name = 'stranger'));
select is(public.join_via_link((select token from link_token)),
  (select id from ids where name = 'doc'), 'signed-in users join through an edit link');
select is(public.file_access_level((select id from ids where name = 'doc')), 3, 'joining grants the link role');
select tests.logout();

select tests.login((select id from ids where name = 'viewer'));
select public.join_via_link((select token from link_token));
select is(public.file_access_level((select id from ids where name = 'doc')), 3, 'existing lower access is upgraded');
select tests.logout();

update public.share_links set enabled = false where id = (select id from ids where name = 'link');
select tests.login((select id from ids where name = 'commenter'));
select throws_ok(
  format('select public.join_via_link(%L)', (select token from link_token)),
  'P0001', 'not_found', 'disabled links cannot be joined');
select tests.logout();

select * from finish();
rollback;
