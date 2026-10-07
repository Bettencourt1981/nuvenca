-- =============================================================================
-- Nuvenca — search inside documents (stage 3)
-- =============================================================================
--
-- `file_contents` holds the plain text of each searchable file:
--   * Nuvenca documents and spreadsheets — written by the editors as people
--     type (and when a file is created with content);
--   * uploaded text, Word, Excel and PDF files — extracted on the server after
--     the upload finishes.
-- Search is accent- and case-insensitive ("orcamento" finds "Orçamento") and
-- language-neutral, so Portuguese and English text are treated alike. Words
-- match by prefix while typing ("orçam" finds "orçamento").
-- Who can find what is decided by RLS on `files`: a row is only visible to
-- people who can open the file.

create extension if not exists unaccent with schema extensions;

create text search configuration public.nuvenca_search (copy = pg_catalog.simple);
alter text search configuration public.nuvenca_search
  alter mapping for hword, hword_part, word with extensions.unaccent, pg_catalog.simple;

create table public.file_contents (
  file_id uuid primary key references public.files (id) on delete cascade,
  content text not null,
  search tsvector generated always as (to_tsvector('public.nuvenca_search'::regconfig, content)) stored,
  updated_at timestamptz not null default now()
);

create index file_contents_search_idx on public.file_contents using gin (search);

alter table public.file_contents enable row level security;

create policy "Readable by people who can open the file"
  on public.file_contents for select to authenticated
  using (exists (select 1 from public.files f where f.id = file_contents.file_id));

revoke all on public.file_contents from anon, authenticated;
grant select on public.file_contents to authenticated;

-- Text kept per file. Long enough for a book; keeps the index small.
create function public.max_indexed_chars()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 200000;
$$;

-- Store a file's searchable text. Editors of a Nuvenca document call it while
-- editing; the server (secret key) calls it for any file after an upload.
create function public.set_file_content(p_file_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_content text := left(coalesce(p_content, ''), public.max_indexed_chars());
begin
  if (select auth.role()) is distinct from 'service_role' then
    perform public.require_user();
    perform public.assert_native_file(p_file_id, 3);
  elsif not exists (select 1 from public.files where id = p_file_id) then
    raise exception 'not_found';
  end if;

  if btrim(v_content) = '' then
    delete from public.file_contents where file_id = p_file_id;
    return;
  end if;

  insert into public.file_contents (file_id, content)
  values (p_file_id, v_content)
  on conflict (file_id) do update
    set content = excluded.content, updated_at = now()
    where file_contents.content is distinct from excluded.content;
end;
$$;

-- Search names and contents of everything the caller can open (RLS applies:
-- SECURITY INVOKER). Name matches come first (most recent first), then
-- content matches by relevance. `snippet` marks matches with U+E000 … U+E001.
create function public.search_files(p_query text)
returns table (file_id uuid, snippet text, name_match boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_term text := btrim(left(coalesce(p_query, ''), 100));
  v_like text;
  v_query tsquery;
  v_options text := 'MaxFragments=2, MaxWords=16, MinWords=5, FragmentDelimiter=" … ", StartSel='
    || U&'\E000' || ', StopSel=' || U&'\E001';
begin
  if v_term = '' then
    return;
  end if;

  v_like := '%' || replace(replace(replace(
    extensions.unaccent('extensions.unaccent'::regdictionary, lower(v_term)),
    '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select to_tsquery('public.nuvenca_search'::regconfig, string_agg(quote_literal(w) || ':*', ' & '))
    into v_query
    from (
      select w
        from regexp_split_to_table(lower(v_term), '[^[:alnum:]]+') as w
       where w <> ''
       limit 8
    ) words;

  return query
  with names as (
    select f.id, row_number() over (order by f.updated_at desc) as position
      from public.files f
     where not f.in_trash
       and f.status = 'ready'
       and extensions.unaccent('extensions.unaccent'::regdictionary, lower(f.name)) like v_like escape '\'
     order by f.updated_at desc
     limit 100
  ),
  contents as (
    select c.file_id as id, c.content,
           row_number() over (order by ts_rank(c.search, v_query) desc, f.updated_at desc) as position
      from public.file_contents c
      join public.files f on f.id = c.file_id
     where v_query is not null
       and c.search @@ v_query
       and not f.in_trash
       and f.status = 'ready'
     order by ts_rank(c.search, v_query) desc, f.updated_at desc
     limit 50
  )
  select r.id, r.snippet, r.name_match
    from (
      select n.id,
             case when c.id is not null
                  then ts_headline('public.nuvenca_search'::regconfig, c.content, v_query, v_options) end as snippet,
             true as name_match,
             n.position as position
        from names n
        left join contents c on c.id = n.id
      union all
      select c.id,
             ts_headline('public.nuvenca_search'::regconfig, c.content, v_query, v_options),
             false,
             1000 + c.position
        from contents c
       where not exists (select 1 from names n where n.id = c.id)
    ) r
   order by r.position;
end;
$$;

revoke execute on function public.max_indexed_chars() from public, anon, authenticated;
revoke execute on function public.set_file_content(uuid, text) from public, anon;
revoke execute on function public.search_files(text) from public, anon;
grant execute on function public.set_file_content(uuid, text) to authenticated, service_role;
grant execute on function public.search_files(text) to authenticated;
-- Used inside set_file_content (definer) only.
grant execute on function public.max_indexed_chars() to service_role;
