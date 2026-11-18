-- Ex Stories: anonymous, typed stories about an ex, told as a thread of posts. Storytelling only: no jury,
-- no verdict, no comments. Run once in the Supabase SQL editor. RLS on with no policies, like every other table:
-- all access goes through the app's server routes.

-- One story. The author's account is kept only for abuse limits and to let them add to or delete their own
-- story; it is never shown or returned publicly. Readers see the date only (created_at stays server-side).
create table if not exists public.ex_stories (
  id uuid primary key default gen_random_uuid(),
  network text not null,                          -- 'celo' / 'celo-sepolia', so preview and live stay apart
  author_user_id text not null,                   -- Privy user id (private)
  title text not null check (char_length(title) between 3 and 80),
  tags text[] not null check (cardinality(tags) between 1 and 3
    and tags <@ array['Cheating', 'Ghosting', 'Money', 'Lies', 'Family', 'Other']),
  status text not null default 'live' check (status in ('live', 'hidden')),  -- hidden: reported, waiting for admin
  reads integer not null default 0,
  r_wow integer not null default 0,               -- 😮
  r_heart integer not null default 0,             -- 💔
  r_laugh integer not null default 0,             -- 😂
  r_flag integer not null default 0,              -- 🚩
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ex_stories_new_idx on public.ex_stories (network, status, created_at desc);
create index if not exists ex_stories_top_idx on public.ex_stories (network, status, reads desc);
create index if not exists ex_stories_author_idx on public.ex_stories (author_user_id, created_at);
alter table public.ex_stories enable row level security;

-- The thread: post 1 is the opening shown in the feed; the author can add more later.
create table if not exists public.ex_story_parts (
  story_id uuid not null references public.ex_stories (id) on delete cascade,
  idx smallint not null check (idx between 1 and 40),
  body text not null check (char_length(body) between 1 and 600),
  created_at timestamptz not null default now(),
  primary key (story_id, idx)
);
alter table public.ex_story_parts enable row level security;

-- One row per reader per emoji (toggle). Counts are kept on ex_stories by ex_story_react().
create table if not exists public.ex_story_reactions (
  story_id uuid not null references public.ex_stories (id) on delete cascade,
  user_id text not null,
  emoji text not null check (emoji in ('wow', 'heart', 'laugh', 'flag')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id, emoji)
);
alter table public.ex_story_reactions enable row level security;

create table if not exists public.ex_story_reports (
  id bigserial primary key,
  story_id uuid not null references public.ex_stories (id) on delete cascade,
  reporter_user_id text not null,
  reason text not null check (reason in ('identifies', 'harassment', 'other')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (story_id, reporter_user_id)
);
alter table public.ex_story_reports enable row level security;

-- Removals keep no content at all: only that a story was removed, by whom, and when (for metrics).
create table if not exists public.ex_story_removals (
  id bigserial primary key,
  network text not null,
  removed_by text not null check (removed_by in ('author', 'admin')),
  had_reports integer not null default 0,
  removed_at timestamptz not null default now()
);
alter table public.ex_story_removals enable row level security;

-- Toggle one reaction and keep the counter in step. Returns true if the reaction is now on.
create or replace function public.ex_story_react(p_story uuid, p_user text, p_emoji text)
returns boolean language plpgsql as $$
declare
  removed integer;
begin
  delete from public.ex_story_reactions where story_id = p_story and user_id = p_user and emoji = p_emoji;
  get diagnostics removed = row_count;
  if removed = 0 then
    insert into public.ex_story_reactions (story_id, user_id, emoji) values (p_story, p_user, p_emoji);
  end if;
  execute format('update public.ex_stories set %I = greatest(0, %I + $1) where id = $2', 'r_' || p_emoji, 'r_' || p_emoji)
    using case when removed = 0 then 1 else -1 end, p_story;
  return removed = 0;
end $$;

create or replace function public.ex_story_read(p_story uuid)
returns void language sql as $$
  update public.ex_stories set reads = reads + 1 where id = p_story and status = 'live';
$$;

-- Record a report (once per reader) and hide the story for admin review once it has 3.
create or replace function public.ex_story_report(p_story uuid, p_user text, p_reason text, p_note text)
returns integer language plpgsql as $$
declare
  n integer;
begin
  insert into public.ex_story_reports (story_id, reporter_user_id, reason, note)
  values (p_story, p_user, p_reason, p_note)
  on conflict (story_id, reporter_user_id) do nothing;
  select count(*) into n from public.ex_story_reports where story_id = p_story;
  update public.ex_stories
     set report_count = n, status = case when n >= 3 then 'hidden' else status end
   where id = p_story;
  return n;
end $$;
