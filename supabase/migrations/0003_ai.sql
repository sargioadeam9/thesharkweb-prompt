-- AI Tools: server-side config, per-user monthly quota, and per-call audit log.
-- The provider key lives only here (service-role). It is never returned to a client.

create table public.ai_config (
  id                 text primary key default 'app' check (id = 'app'),
  enabled            boolean not null default false,
  base_url           text not null,
  default_model      text not null,
  api_key            text not null,
  system_prompt      text,
  temperature        numeric not null default 0.4,
  max_tokens         int not null default 800,
  request_timeout_ms int not null default 25000,
  total_budget_ms    int not null default 45000,
  max_attempts       int not null default 3,
  plan_models        jsonb not null default '{}'::jsonb,      -- { plan: [modelId, ...] }
  plan_limits        jsonb not null default '{"free":3}'::jsonb, -- { plan: callsPerMonth | null = unlimited }
  monthly_budget_usd numeric,                                  -- global kill switch, null = off
  price_per_million_in  numeric,                               -- provider input price, null = no estimation
  price_per_million_out numeric,                               -- provider output price, null = no estimation
  updated_at         timestamptz not null default now(),
  updated_by         text
);

create table public.ai_usage (
  user_id    uuid not null references auth.users on delete cascade,
  period     text not null,          -- 'YYYY-MM' UTC, same rule for free and paid
  calls      int not null default 0,
  tokens_in  bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd   numeric not null default 0,  -- this user's estimated spend for the period
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

create table public.ai_usage_log (
  id         bigserial primary key,
  user_id    uuid,
  kind       text not null,          -- 'enhance' | 'generate'
  model      text,
  plan       text,
  attempts   int not null default 1,
  chain      jsonb,                  -- [{ model, status, ms, error }]
  ok         boolean not null,
  error_code text,
  tokens_in  int,
  tokens_out int,
  cost_usd   numeric not null default 0,  -- estimated provider spend for this call
  ms         int,
  created_at timestamptz not null default now()
);
create index ai_usage_log_created_idx on public.ai_usage_log (created_at desc);

alter table public.ai_config    enable row level security;
alter table public.ai_usage     enable row level security;
alter table public.ai_usage_log enable row level security;

-- No policies on ai_config: service-role only.
-- ai_usage / ai_usage_log need no client policy; quota is reported through our API.

-- Atomic quota consume. Returns the new call count, or null when the limit is hit.
create or replace function public.consume_ai_quota(p_uid uuid, p_period text, p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare used int;
begin
  if p_limit is not null and p_limit <= 0 then
    return null;
  end if;

  insert into public.ai_usage (user_id, period, calls)
  values (p_uid, p_period, 1)
  on conflict (user_id, period) do update
    set calls = public.ai_usage.calls + 1,
        updated_at = now()
    where p_limit is null or public.ai_usage.calls < p_limit
  returning calls into used;

  return used;
end $$;

create or replace function public.refund_ai_quota(p_uid uuid, p_period text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set calls = greatest(calls - 1, 0),
         updated_at = now()
   where user_id = p_uid and period = p_period;
$$;

-- Token accounting after a successful call (best effort, never blocks the response).
create or replace function public.add_ai_tokens(
  p_uid uuid,
  p_period text,
  p_in int,
  p_out int,
  p_cost numeric default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set tokens_in  = tokens_in  + coalesce(p_in, 0),
         tokens_out = tokens_out + coalesce(p_out, 0),
         cost_usd   = cost_usd   + coalesce(p_cost, 0),
         updated_at = now()
   where user_id = p_uid and period = p_period;
$$;

-- Global spend for a period, from the per-call cost log. Drives the kill switch.
create or replace function public.ai_month_spend_usd(p_period text)
returns numeric
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from public.ai_usage_log
  where ok = true
    and to_char(created_at, 'YYYY-MM') = p_period;
$$;
