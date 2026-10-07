-- =============================================================================
-- Nuvenca — billing with Stripe (stage 4)
-- =============================================================================
--
-- Prices live in Stripe under lookup keys `nuvenca_<plan>_<monthly|yearly>`;
-- `plans.price_*_cents` mirror them for display. A plan is offered for
-- self-service when it is public and has a price.
-- `features.for` says which workspaces a plan is for ('personal' or 'team');
-- `features.per_seat` bills team plans per member.
--
-- Stripe webhooks (verified on the server) call `apply_subscription`, which
-- records the subscription and sets the workspace's effective plan. Limits
-- (storage, file size, members, trash and history retention) follow the plan
-- everywhere they are enforced.

update public.plans set features = features || '{"for": "personal"}'::jsonb where id = 'pro';
update public.plans set features = features || '{"for": "team", "per_seat": true}'::jsonb where id = 'business';

-- One Stripe customer per workspace. Server only.
create table public.billing_customers (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.billing_customers enable row level security;
revoke all on public.billing_customers from anon, authenticated;

-- Owners and admins (existing policy) see the subscription's state, not the
-- provider's ids.
revoke all on public.subscriptions from anon, authenticated;
grant select (workspace_id, plan_id, status, provider, current_period_end, cancel_at_period_end, updated_at)
  on public.subscriptions to authenticated;

-- Record a provider subscription and set the workspace's plan. Paying
-- statuses keep the plan; anything else falls back to Free (nothing is
-- deleted: over-limit workspaces just can't add more until they upgrade).
create function public.apply_subscription(
  p_workspace_id uuid,
  p_plan_id text,
  p_status text,
  p_provider_subscription_id text,
  p_provider_customer_id text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.subscription_status;
  v_effective text;
begin
  if not exists (select 1 from public.workspaces where id = p_workspace_id) then
    raise exception 'not_found';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id) then
    raise exception 'invalid_plan';
  end if;

  v_status := case p_status
    when 'active' then 'active'
    when 'trialing' then 'trialing'
    when 'past_due' then 'past_due'
    else 'canceled'
  end::public.subscription_status;
  -- An unfinished first payment changes nothing yet.
  if p_status = 'incomplete' then
    return (select plan_id from public.workspaces where id = p_workspace_id);
  end if;

  insert into public.subscriptions (workspace_id, plan_id, status, provider, provider_customer_id,
                                    provider_subscription_id, current_period_start, current_period_end, cancel_at_period_end)
  values (p_workspace_id, p_plan_id, v_status, 'stripe', p_provider_customer_id,
          p_provider_subscription_id, p_period_start, p_period_end, coalesce(p_cancel_at_period_end, false))
  on conflict (workspace_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        provider = excluded.provider,
        provider_customer_id = excluded.provider_customer_id,
        provider_subscription_id = excluded.provider_subscription_id,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end;

  v_effective := case when v_status in ('active', 'trialing', 'past_due') then p_plan_id else 'free' end;
  update public.workspaces set plan_id = v_effective where id = p_workspace_id and plan_id is distinct from v_effective;
  return v_effective;
end;
$$;

revoke execute on function public.apply_subscription(uuid, text, text, text, text, timestamptz, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_subscription(uuid, text, text, text, text, timestamptz, timestamptz, boolean)
  to service_role;
