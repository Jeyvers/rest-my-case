-- Daily Case. Run once in the Supabase SQL editor. RLS on with no policies, like every other table here: all
-- reads and writes go through the app's server routes.
--
-- case_bank: every case that can be the Daily Case. Shared by all networks; nothing in it is shown until the admin
-- approves it. daily_slots: which case ran on which day, per network. A day's slot is filled once and never changes.

create table if not exists public.case_bank (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  story text not null check (char_length(story) between 10 and 1500),
  side_a_who text not null default 'Side A' check (char_length(side_a_who) between 1 and 40),
  side_a text not null check (char_length(side_a) between 2 and 1000),
  side_b_who text not null default 'Side B' check (char_length(side_b_who) between 1 and 40),
  side_b text not null check (char_length(side_b) between 2 and 1000),
  clues text[] not null default '{}',               -- revealed one at a time, in order
  -- 'A' or 'B': a known answer (a ruling, or a real Rest My Case jury's verdict).
  -- 'jury': no fixed answer; the day's verified players decide by majority.
  answer text not null check (answer in ('A', 'B', 'jury')),
  explanation text check (explanation is null or char_length(explanation) <= 1000),  -- shown after the reveal
  category text not null default 'everyday' check (char_length(category) between 2 and 30),
  source text not null default 'bank' check (source in ('bank', 'user')),
  source_key text,                                  -- user cases: the network + contract key (dataKey)
  source_case_id bigint,                            -- user cases: the original case number
  review_flags text[] not null default '{}',        -- things the admin should check before approving
  status text not null default 'draft' check (status in ('draft', 'approved')),
  scheduled_date date unique,                       -- pinned to this UTC day (optional)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  check ((source = 'user') = (source_case_id is not null and source_key is not null))
);
create unique index if not exists case_bank_source_idx on public.case_bank (source_key, source_case_id)
  where source = 'user';
create index if not exists case_bank_pick_idx on public.case_bank (status, source, created_at);
alter table public.case_bank enable row level security;

create table if not exists public.daily_slots (
  network text not null,                            -- network name ('celo', 'celo-sepolia')
  day date not null,                                -- UTC day
  case_id uuid not null references public.case_bank (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (network, day)
);
create index if not exists daily_slots_case_idx on public.daily_slots (network, case_id, day desc);
alter table public.daily_slots enable row level security;

-- Daily Case picks. Free and unpaid. Only verified people are recorded (one per person per day), so a 'jury'
-- answer can't be swayed by sock puppets. clue = how many clues were showing when they locked in.
create table if not exists public.daily_votes (
  network text not null,
  day date not null,
  person text not null,                             -- verified identity root, lowercased
  privy_user_id text not null,
  vote text not null check (vote in ('A', 'B')),
  clue smallint not null default 0 check (clue between 0 and 20),
  created_at timestamptz not null default now(),
  primary key (network, day, person)
);
alter table public.daily_votes enable row level security;

-- "Feature as Daily Case": one row per party who agreed. Deleting the row withdraws consent.
create table if not exists public.feature_consents (
  network text not null,                            -- dataKey (network + contract)
  case_id bigint not null,
  wallet text not null,                             -- the party's wallet, lowercased
  created_at timestamptz not null default now(),
  primary key (network, case_id, wallet)
);
alter table public.feature_consents enable row level security;

-- New alert: "Your case is today's Daily Case".
alter table public.notifications_sent drop constraint if exists notifications_sent_kind_check;
alter table public.notifications_sent add constraint notifications_sent_kind_check
  check (kind in ('drawn', 'reveal', 'joined', 'nudge', 'verdict', 'refund', 'juror_paid', 'featured'));
