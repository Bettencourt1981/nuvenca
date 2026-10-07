-- =============================================================================
-- Nuvenca — email notifications for shares (stage 3)
-- =============================================================================
--
-- When someone shares a file or folder, or adds a person to a team, the app
-- emails them. The database decides whether an email may be sent (the caller
-- must be allowed to share, and there is a per-person rate limit against
-- abuse) and returns what the email needs, in the recipient's language.
-- `notification_emails` keeps a log of what was sent; nobody can read it
-- through the API.

create table public.notification_emails (
  id bigint generated always as identity primary key,
  sender_id uuid references auth.users (id) on delete cascade,
  recipient text not null,
  kind text not null check (kind in ('file_shared', 'workspace_member')),
  file_id uuid references public.files (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  created_at timestamptz not null default now()
);

create index notification_emails_sender_idx on public.notification_emails (sender_id, created_at desc);

alter table public.notification_emails enable row level security;
revoke all on public.notification_emails from anon, authenticated;

-- Per sender: at most 30 notification emails an hour and 100 a day.
create function public.reserve_notification_email(
  p_recipient text,
  p_kind text,
  p_file_id uuid,
  p_workspace_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
begin
  if (select count(*) from public.notification_emails
       where sender_id = v_uid and created_at > now() - interval '1 hour') >= 30
     or (select count(*) from public.notification_emails
          where sender_id = v_uid and created_at > now() - interval '1 day') >= 100 then
    raise exception 'rate_limited';
  end if;
  insert into public.notification_emails (sender_id, recipient, kind, file_id, workspace_id)
  values (v_uid, p_recipient, p_kind, p_file_id, p_workspace_id);
end;
$$;

-- Details for "X shared Y with you". Only for a share on an item the caller
-- can manage; the share must have been created moments ago (no resending
-- old shares).
create function public.prepare_share_notification(p_share_id uuid)
returns table (
  recipient text,
  recipient_locale text,
  has_account boolean,
  file_id uuid,
  file_name text,
  file_kind public.file_kind,
  file_mime text,
  role public.share_role,
  sender_name text,
  sender_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_share public.file_shares;
  v_file public.files;
begin
  select * into v_share from public.file_shares where id = p_share_id;
  if not found then
    raise exception 'not_found';
  end if;
  v_file := public.assert_file_access(v_share.file_id, 3);
  if v_share.created_by is distinct from v_uid or v_share.created_at < now() - interval '5 minutes' then
    raise exception 'forbidden';
  end if;
  perform public.reserve_notification_email(v_share.email, 'file_shared', v_file.id, null);

  return query
  select v_share.email,
         p.locale,
         v_share.user_id is not null,
         v_file.id,
         v_file.name,
         v_file.kind,
         v_file.mime_type,
         v_share.role,
         coalesce(nullif(s.full_name, ''), s.email),
         s.email
    from public.profiles s
    left join public.profiles p on p.id = v_share.user_id
   where s.id = v_uid;
end;
$$;

-- Details for "X added you to the team Y". Only owners and admins of the team,
-- right after adding that person.
create function public.prepare_member_notification(p_workspace_id uuid, p_user_id uuid)
returns table (
  recipient text,
  recipient_locale text,
  workspace_name text,
  sender_name text,
  sender_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_user();
  v_member public.workspace_members;
  v_recipient public.profiles;
begin
  if coalesce(public.workspace_role_of(p_workspace_id)::text, '') not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;
  select * into v_member from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found or v_member.created_at < now() - interval '5 minutes' then
    raise exception 'forbidden';
  end if;
  select * into v_recipient from public.profiles where id = p_user_id;
  perform public.reserve_notification_email(v_recipient.email, 'workspace_member', null, p_workspace_id);

  return query
  select v_recipient.email,
         v_recipient.locale,
         w.name,
         coalesce(nullif(s.full_name, ''), s.email),
         s.email
    from public.workspaces w, public.profiles s
   where w.id = p_workspace_id and s.id = v_uid;
end;
$$;

-- The log only needs a day for rate limiting; keep 90 days for support, then
-- forget it (called by the daily cleanup job).
create function public.prune_notification_log()
returns integer
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.notification_emails where created_at < now() - interval '90 days' returning 1
  )
  select count(*)::integer from deleted;
$$;

revoke execute on function public.prune_notification_log() from public, anon, authenticated;
grant execute on function public.prune_notification_log() to service_role;
revoke execute on function public.reserve_notification_email(text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.prepare_share_notification(uuid) from public, anon;
revoke execute on function public.prepare_member_notification(uuid, uuid) from public, anon;
grant execute on function public.prepare_share_notification(uuid) to authenticated;
grant execute on function public.prepare_member_notification(uuid, uuid) to authenticated;
