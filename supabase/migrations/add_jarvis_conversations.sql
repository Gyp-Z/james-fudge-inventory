-- Per-day Jarvis conversation memory.
--
-- Why: the in-app Jarvis chat currently only persists to sessionStorage — it survives a page
-- refresh but is LOST when the kitchen tablet's tab/app is closed or the browser drops it.
-- The owner wants the day's conversation to stick around so context isn't forgotten if the
-- tablet gets refreshed. This table stores ONE row per Eastern calendar day (the running chat
-- transcript + the raw API message history), upserted as the conversation grows. On load the
-- widget hydrates from here when sessionStorage is empty (i.e. a fresh session / after a close).
-- A new day starts a fresh row; prior days remain as history.
--
-- Owner-only in practice (the widget only renders for an authenticated session), but the browser
-- talks to Supabase with the anon key, so RLS must permit anon read/write. Matches the app's
-- existing public read/insert/update posture. Idempotent: safe to re-run.

create table if not exists jarvis_conversations (
  convo_date  date primary key,          -- Eastern calendar day; one conversation per day
  transcript  jsonb not null default '[]'::jsonb,  -- the rendered chat (UI bubbles/cards)
  messages    jsonb not null default '[]'::jsonb,  -- the raw Anthropic message history (for context)
  updated_at  timestamptz not null default now()
);

alter table jarvis_conversations enable row level security;

drop policy if exists "Public read jarvis_conversations" on jarvis_conversations;
create policy "Public read jarvis_conversations" on jarvis_conversations
  for select to anon, authenticated using (true);

drop policy if exists "Public insert jarvis_conversations" on jarvis_conversations;
create policy "Public insert jarvis_conversations" on jarvis_conversations
  for insert to anon, authenticated with check (true);

drop policy if exists "Public update jarvis_conversations" on jarvis_conversations;
create policy "Public update jarvis_conversations" on jarvis_conversations
  for update to anon, authenticated using (true) with check (true);

drop policy if exists "Public delete jarvis_conversations" on jarvis_conversations;
create policy "Public delete jarvis_conversations" on jarvis_conversations
  for delete to anon, authenticated using (true);
