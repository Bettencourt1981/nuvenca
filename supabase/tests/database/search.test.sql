-- Database tests for search inside documents.
-- Run with: npx supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
insert into ids values ('viewer', tests.create_user('viewer@example.com'));
insert into ids values ('stranger', tests.create_user('stranger@example.com'));

select tests.login((select id from ids where name = 'owner'));
insert into ids select 'doc', id from public.create_native_file(
  tests.personal_ws((select id from ids where name = 'owner')), null, 'Orçamento anual', 'document', '');
insert into ids select 'sheet', id from public.create_native_file(
  tests.personal_ws((select id from ids where name = 'owner')), null, 'Contas', 'spreadsheet', '');
select public.share_file((select id from ids where name = 'doc'), 'viewer@example.com', 'viewer');
select tests.logout();

-- An uploaded (non-native) file.
with created as (
  insert into public.files (workspace_id, kind, name, mime_type, status, created_by)
  values (tests.personal_ws((select id from ids where name = 'owner')), 'file', 'relatorio.pdf', 'application/pdf', 'ready',
          (select id from ids where name = 'owner'))
  returning id
)
insert into ids select 'pdf', id from created;

-- ---------------------------------------------------------------------------
-- Writing the index
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'owner'));
select lives_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'doc'),
         'O relatório mostra que a despesa com a câmara municipal subiu em março.'),
  'editors index their documents');
select lives_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'sheet'), 'Folha1' || chr(10) || 'Café 1.5'),
  'editors index their spreadsheets');
select throws_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'pdf'), 'fake'),
  'P0001', 'not_native', 'people cannot index uploaded files themselves');
select tests.logout();

select tests.login((select id from ids where name = 'viewer'));
select throws_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'doc'), 'spam'),
  'P0001', 'forbidden', 'viewers cannot change the index');
select tests.logout();

select tests.login((select id from ids where name = 'stranger'));
select throws_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'doc'), 'spam'),
  'P0001', 'not_found', 'strangers cannot change the index');
select is((select count(*) from public.file_contents), 0::bigint, 'strangers cannot read indexed text');
select throws_ok(
  format('insert into public.file_contents (file_id, content) values (%L, %L)', (select id from ids where name = 'doc'), 'x'),
  '42501', null, 'no direct writes');
select tests.logout();

select tests.login_service();
select lives_ok(
  format('select public.set_file_content(%L, %L)', (select id from ids where name = 'pdf'), 'Relatório de contas: zebra listrada'),
  'the server indexes uploads');
select tests.logout();

-- ---------------------------------------------------------------------------
-- Searching
-- ---------------------------------------------------------------------------
select tests.login((select id from ids where name = 'viewer'));
select is(
  (select array_agg(file_id) from public.search_files('camara munic')),
  array[(select id from ids where name = 'doc')],
  'content matches ignore accents and match word prefixes');
select ok(
  (select snippet from public.search_files('despesa')) like '%' || U&'\E000' || 'despesa' || U&'\E001' || '%',
  'the snippet marks the match');
select is((select count(*) from public.search_files('zebra')), 0::bigint, 'people only find files they can open');
select tests.logout();

select tests.login((select id from ids where name = 'owner'));
select is(
  (select array_agg(file_id order by file_id) from public.search_files('orcamento')),
  array[(select id from ids where name = 'doc')],
  'name matches ignore accents');
select ok(
  (select name_match from public.search_files('orcamento') limit 1),
  'name matches are flagged');
select is(
  (select array_agg(file_id) from public.search_files('zebra')),
  array[(select id from ids where name = 'pdf')],
  'uploaded files are found by their content');
select is((select count(*) from public.search_files('%')), 0::bigint, 'wildcards are taken literally');
select is((select count(*) from public.search_files('   ')), 0::bigint, 'an empty query finds nothing');

select public.trash_files(array[(select id from ids where name = 'pdf')]);
select is((select count(*) from public.search_files('zebra')), 0::bigint, 'files in the trash are not found');

select public.set_file_content((select id from ids where name = 'sheet'), '');
select is(
  (select count(*) from public.file_contents where file_id = (select id from ids where name = 'sheet')),
  0::bigint, 'empty text removes the entry');
select tests.logout();

select * from finish();
rollback;
