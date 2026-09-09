-- Staff feedback: a lightweight way for staff to leave a note/question/idea for Zach (the one
-- who knows the app best) without needing a whole new nav tab. Surfaced as a small section on
-- the Dashboard (open to everyone, since staff have no login) and readable/resolvable by Jarvis
-- so Zach can ask "any feedback from the crew?" and get pointed at open items instead of having
-- to remember to check a page. Matches the app's existing public read/insert/update RLS posture
-- (mutations are gated in the UI, not RLS) — see jarvis_conversations for the same pattern.
-- Idempotent: safe to re-run.

create table if not exists staff_feedback (
  id           uuid primary key default gen_random_uuid(),
  message      text not null,
  submitted_by text,                                  -- optional free-text name, staff can leave blank
  created_at   timestamptz not null default now(),
  resolved     boolean not null default false,
  resolved_at  timestamptz
);

alter table staff_feedback enable row level security;

drop policy if exists "Public read staff_feedback" on staff_feedback;
create policy "Public read staff_feedback" on staff_feedback
  for select to anon, authenticated using (true);

drop policy if exists "Public insert staff_feedback" on staff_feedback;
create policy "Public insert staff_feedback" on staff_feedback
  for insert to anon, authenticated with check (true);

drop policy if exists "Public update staff_feedback" on staff_feedback;
create policy "Public update staff_feedback" on staff_feedback
  for update to anon, authenticated using (true) with check (true);
