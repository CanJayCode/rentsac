-- Rentsac schema.
-- The owner runs this once in the Supabase SQL editor. It is idempotent, so
-- running it again is safe. The app only uses the server-side service role
-- key: every table has RLS enabled with no policies, and anon/authenticated
-- have no privileges.

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  number int unique not null,
  label text
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  name text not null,
  rent_amount int not null,
  cycle_start_day int not null check (cycle_start_day between 1 and 31),
  started_on date not null,
  left_on date
);

create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  kind text not null check (kind in ('rent', 'light', 'opening')),
  due_date date not null,
  amount int not null check (amount >= 0),
  opening_for text check (opening_for in ('rent', 'light')),
  period_start date,
  round_id uuid,
  rate int,
  prev_reading numeric,
  curr_reading numeric,
  units numeric,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, dedupe_key)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  paid_on date not null,
  amount int not null check (amount >= 0),
  cash int not null,
  upi int not null,
  note text,
  target text not null check (target in ('auto', 'rent', 'light')),
  idem_key text unique not null,
  deleted_at date,
  created_at timestamptz not null default now()
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists readings (
  round_id uuid not null references rounds(id),
  room_id uuid not null references rooms(id),
  value numeric not null,
  base_reset boolean not null default false,
  primary key (round_id, room_id)
);

create table if not exists main_readings (
  round_id uuid not null references rounds(id),
  key text not null check (
    key in ('block_1_4', 'block_5_8', 'block_9_12', 'block_13_16', 'inverter', 'motor')
  ),
  value numeric not null,
  primary key (round_id, key)
);

create table if not exists settings (
  key text primary key,
  value text not null
);

create table if not exists auth_attempts (
  id bigserial primary key,
  ip text not null,
  ok boolean not null,
  at timestamptz not null default now()
);

insert into rooms (number)
select generate_series(1, 16)
on conflict (number) do nothing;

alter table rooms enable row level security;
alter table tenants enable row level security;
alter table charges enable row level security;
alter table payments enable row level security;
alter table rounds enable row level security;
alter table readings enable row level security;
alter table main_readings enable row level security;
alter table settings enable row level security;
alter table auth_attempts enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
