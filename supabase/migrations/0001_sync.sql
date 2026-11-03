create table public.profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create table public.licenses (
  user_id               uuid primary key references auth.users on delete cascade,
  plan                  text not null check (plan in
                          ('sync_monthly','sync_annual','lifetime','founding','master')),
  status                text not null default 'active' check (status in ('active','expired','revoked')),
  started_at            timestamptz not null default now(),
  expires_at            timestamptz,          -- null only for 'lifetime' and 'master'
  max_devices           int,                  -- null = unlimited
  max_prompts           int,                  -- null = unlimited
  note                  text,
  created_by            text not null,        -- admin email or 'owner-sql'
  created_at            timestamptz not null default now(),
  last_expiry_notice_at timestamptz
);

create table public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  email         text not null,
  plan          text not null check (plan in ('sync_monthly','sync_annual','lifetime')),
  amount_bdt    int  not null,
  method        text not null check (method in ('bkash','nagad')),
  txn_id        text not null,
  sender_number text,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reject_reason text,
  reviewed_by   text,
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz
);
create unique index payment_requests_txn_uniq on public.payment_requests (lower(txn_id));
create index payment_requests_status_idx on public.payment_requests (status, submitted_at desc);

create table public.sync_blobs (
  user_id    uuid primary key references auth.users on delete cascade,
  version    int not null default 1,
  payload    jsonb not null,
  bytes      int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.sync_blob_history (
  user_id    uuid not null references auth.users on delete cascade,
  version    int  not null,
  payload    jsonb not null,
  bytes      int  not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, version)
);

create table public.devices (
  user_id      uuid not null references auth.users on delete cascade,
  device_id    text not null,
  label        text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table public.audit_log (
  id         bigserial primary key,
  actor      text not null,
  action     text not null,
  subject    uuid,
  detail     jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles          enable row level security;
alter table public.licenses          enable row level security;
alter table public.payment_requests  enable row level security;
alter table public.sync_blobs        enable row level security;
alter table public.sync_blob_history enable row level security;
alter table public.devices           enable row level security;
alter table public.audit_log         enable row level security;

create policy "own profile"  on public.profiles         for select using (auth.uid() = user_id);
create policy "own license"  on public.licenses         for select using (auth.uid() = user_id);
create policy "own requests" on public.payment_requests for select using (auth.uid() = user_id);
-- no write policies anywhere: writes are service-role only, from API routes

