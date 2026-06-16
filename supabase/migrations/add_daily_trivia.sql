-- Caches one AI-generated, web-sourced "fresh" Big Sam's Trivia question per day.
-- Only used on weekends (Sat/Sun); weekdays use the static bank in src/data/triviaBank.json.
-- The /api/trivia function generates the question once (first opener of the day) and caches
-- it here so everyone on the crew gets the SAME question that day.
-- Run in the Supabase SQL Editor. Re-runnable.

CREATE TABLE IF NOT EXISTS daily_trivia (
  date       date        PRIMARY KEY,
  question   text        NOT NULL,
  answer     text        NOT NULL,
  hint1      text,
  hint2      text,
  category   text,
  fun_fact   text,
  source     text        NOT NULL DEFAULT 'web',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE daily_trivia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read daily_trivia" ON daily_trivia;
CREATE POLICY "public read daily_trivia" ON daily_trivia FOR SELECT USING (true);

DROP POLICY IF EXISTS "public insert daily_trivia" ON daily_trivia;
CREATE POLICY "public insert daily_trivia" ON daily_trivia FOR INSERT WITH CHECK (true);
