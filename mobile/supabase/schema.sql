-- ─────────────────────────────────────────────────────────────────────────────
-- City Cleanliness Platform — Supabase Schema
-- Run this in your Supabase SQL editor (Project > SQL Editor > New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'Anonymous',
  avatar          TEXT,
  total_points    INTEGER NOT NULL DEFAULT 0,
  cleanups_done   INTEGER NOT NULL DEFAULT 0,
  total_karma     INTEGER NOT NULL DEFAULT 0,
  expo_push_token TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── LOCATIONS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  lat_grid        DOUBLE PRECISION NOT NULL,  -- rounded to 4dp for dedup
  lng_grid        DOUBLE PRECISION NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('dirty','pending','clean')),
  last_cleaned_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique grid index for deduplication (~11m precision)
CREATE UNIQUE INDEX IF NOT EXISTS locations_grid_idx ON public.locations(lat_grid, lng_grid);

-- ── PENDING SESSIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id       UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  before_image      TEXT NOT NULL,
  before_image_hash TEXT,
  before_time       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server-recorded
  gps_lat           DOUBLE PRECISION NOT NULL,
  gps_lng           DOUBLE PRECISION NOT NULL,
  gps_accuracy      DOUBLE PRECISION,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CLEANUP REPORTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cleanup_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id         UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  before_image        TEXT NOT NULL,
  before_image_hash   TEXT,
  after_image         TEXT NOT NULL,
  after_image_hash    TEXT,
  before_time         TIMESTAMPTZ NOT NULL,
  after_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified            BOOLEAN NOT NULL DEFAULT false,
  gps_low_confidence  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── DIRTY REPORTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dirty_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent same user from spamming dirty reports for same location on same day
CREATE UNIQUE INDEX IF NOT EXISTS dirty_reports_user_loc_day_idx
  ON public.dirty_reports(user_id, location_id, report_date);

-- ── POINTS LOG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.points_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL,  -- 'verified_cleanup', 'dirty_confirmation', 'verified_cleanup_reclean'
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  month       TEXT NOT NULL,  -- 'YYYY-MM' for monthly partitioning
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS points_log_month_idx ON public.points_log(month);
CREATE INDEX IF NOT EXISTS points_log_user_month_idx ON public.points_log(user_id, month);

-- ── GUARDIANS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guardians (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  location_id   UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, location_id)
);

-- ── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, read);

-- ── LIKES ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id  UUID NOT NULL REFERENCES public.cleanup_reports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_id)
);

-- ── VOTES (karma system: upvote / downvote per cleanup post) ──────────────────
CREATE TABLE IF NOT EXISTS public.votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  report_id  UUID NOT NULL REFERENCES public.cleanup_reports(id) ON DELETE CASCADE,
  vote_type  TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_id)
);

-- ── LEADERBOARD SNAPSHOTS (for monthly archive) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.leaderboard_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month       TEXT NOT NULL,
  rank        INTEGER NOT NULL,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points      INTEGER NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS snapshots_month_idx ON public.leaderboard_snapshots(month, rank);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC HELPER: increment user stats atomically
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_user_cleanup(uid UUID, pts INTEGER)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET total_points  = total_points + pts,
      cleanups_done = cleanups_done + 1
  WHERE id = uid;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC HELPER: recalculate a user's total_karma from the votes table
-- SECURITY DEFINER so any authenticated user can trigger it after voting
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_user_karma(target_user_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET total_karma = (
    SELECT COALESCE(SUM(CASE WHEN v.vote_type = 'up' THEN 1 ELSE -1 END), 0)
    FROM public.votes v
    JOIN public.cleanup_reports cr ON cr.id = v.report_id
    WHERE cr.user_id = target_user_id
  )
  WHERE id = target_user_id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_reports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dirty_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes                 ENABLE ROW LEVEL SECURITY;

-- users: public read, self write
DROP POLICY IF EXISTS "users_public_read" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
DROP POLICY IF EXISTS "users_self_insert" ON public.users;
CREATE POLICY "users_public_read"  ON public.users FOR SELECT USING (true);
CREATE POLICY "users_self_update"  ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "users_self_insert"  ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- locations: public read, authenticated insert (for client-side location creation)
DROP POLICY IF EXISTS "locations_public_read" ON public.locations;
DROP POLICY IF EXISTS "locations_auth_insert" ON public.locations;
DROP POLICY IF EXISTS "locations_auth_update" ON public.locations;
CREATE POLICY "locations_public_read" ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations_auth_insert" ON public.locations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "locations_auth_update" ON public.locations FOR UPDATE USING (auth.uid() IS NOT NULL);

-- pending_sessions: owner only
DROP POLICY IF EXISTS "pending_sessions_select" ON public.pending_sessions;
DROP POLICY IF EXISTS "pending_sessions_insert" ON public.pending_sessions;
DROP POLICY IF EXISTS "pending_sessions_delete" ON public.pending_sessions;
CREATE POLICY "pending_sessions_select" ON public.pending_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pending_sessions_insert" ON public.pending_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pending_sessions_delete" ON public.pending_sessions FOR DELETE USING (auth.uid() = user_id);

-- cleanup_reports: public read (for stats), owner insert
DROP POLICY IF EXISTS "cleanup_reports_public_read" ON public.cleanup_reports;
DROP POLICY IF EXISTS "cleanup_reports_insert" ON public.cleanup_reports;
CREATE POLICY "cleanup_reports_public_read" ON public.cleanup_reports FOR SELECT USING (true);
CREATE POLICY "cleanup_reports_insert"      ON public.cleanup_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- dirty_reports: public read (so all users see pending markers & report counts), owner insert
DROP POLICY IF EXISTS "dirty_reports_select" ON public.dirty_reports;
DROP POLICY IF EXISTS "dirty_reports_insert" ON public.dirty_reports;
CREATE POLICY "dirty_reports_select" ON public.dirty_reports FOR SELECT USING (true);
CREATE POLICY "dirty_reports_insert" ON public.dirty_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

-- points_log: public read (leaderboard), owner insert via Edge Functions
DROP POLICY IF EXISTS "points_log_public_read" ON public.points_log;
CREATE POLICY "points_log_public_read" ON public.points_log FOR SELECT USING (true);

-- guardians: owner only
DROP POLICY IF EXISTS "guardians_select" ON public.guardians;
DROP POLICY IF EXISTS "guardians_insert" ON public.guardians;
DROP POLICY IF EXISTS "guardians_delete" ON public.guardians;
CREATE POLICY "guardians_select" ON public.guardians FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "guardians_insert" ON public.guardians FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "guardians_delete" ON public.guardians FOR DELETE USING (auth.uid() = user_id);

-- notifications: owner only
DROP POLICY IF EXISTS "notif_select" ON public.notifications;
DROP POLICY IF EXISTS "notif_update" ON public.notifications;
CREATE POLICY "notif_select" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif_update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- leaderboard_snapshots: public read
DROP POLICY IF EXISTS "snapshots_public_read" ON public.leaderboard_snapshots;
CREATE POLICY "snapshots_public_read" ON public.leaderboard_snapshots FOR SELECT USING (true);

-- likes: public read, owner insert/delete
DROP POLICY IF EXISTS "likes_select" ON public.likes;
DROP POLICY IF EXISTS "likes_insert" ON public.likes;
DROP POLICY IF EXISTS "likes_delete" ON public.likes;
CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete" ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- votes: public read, owner insert/update/delete
DROP POLICY IF EXISTS "votes_select" ON public.votes;
DROP POLICY IF EXISTS "votes_insert" ON public.votes;
DROP POLICY IF EXISTS "votes_update" ON public.votes;
DROP POLICY IF EXISTS "votes_delete" ON public.votes;
CREATE POLICY "votes_select" ON public.votes FOR SELECT USING (true);
CREATE POLICY "votes_insert" ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_update" ON public.votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "votes_delete" ON public.votes FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKETS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('cleanup-images', 'cleanup-images', true),
         ('dirty-reports',  'dirty-reports',  true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "cleanup_images_upload"      ON storage.objects;
DROP POLICY IF EXISTS "cleanup_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "dirty_reports_upload"       ON storage.objects;
DROP POLICY IF EXISTS "dirty_reports_public_read"  ON storage.objects;

CREATE POLICY "cleanup_images_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cleanup-images' AND auth.role() = 'authenticated'
  );

CREATE POLICY "cleanup_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cleanup-images');

CREATE POLICY "dirty_reports_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'dirty-reports' AND auth.role() = 'authenticated'
  );

CREATE POLICY "dirty_reports_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'dirty-reports');

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA MIGRATIONS  (run these after the base schema if already deployed)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add role column to users (city_official can create drives)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'city_official', 'admin'));

-- Add configurable guardian slot limit per location
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS guardian_slots INTEGER NOT NULL DEFAULT 3;

-- ── CITY DRIVES ──────────────────────────────────────────────────────────────
-- A drive is a time-limited, geo-fenced cleanup campaign created by a city official.
-- Any verified cleanup inside the zone during the drive period earns bonus points + badge.
CREATE TABLE IF NOT EXISTS public.drives (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  created_by        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lat               DOUBLE PRECISION NOT NULL,
  lng               DOUBLE PRECISION NOT NULL,
  radius_km         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  badge_name        TEXT NOT NULL,
  badge_color       TEXT NOT NULL DEFAULT '#16a34a',
  badge_icon        TEXT NOT NULL DEFAULT 'shield-checkmark',
  points_multiplier DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── USER BADGES ───────────────────────────────────────────────────────────────
-- Awarded when a user submits a verified cleanup inside an active drive zone.
CREATE TABLE IF NOT EXISTS public.user_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  drive_id    UUID NOT NULL REFERENCES public.drives(id) ON DELETE CASCADE,
  badge_name  TEXT NOT NULL,
  badge_color TEXT NOT NULL DEFAULT '#16a34a',
  badge_icon  TEXT NOT NULL DEFAULT 'shield-checkmark',
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, drive_id)
);

-- ── RLS for new tables ────────────────────────────────────────────────────────
ALTER TABLE public.drives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

-- drives: anyone can read; only city_official / admin can create/update
DROP POLICY IF EXISTS "drives_public_read"      ON public.drives;
DROP POLICY IF EXISTS "drives_official_insert"  ON public.drives;
DROP POLICY IF EXISTS "drives_official_update"  ON public.drives;
CREATE POLICY "drives_public_read"     ON public.drives FOR SELECT USING (true);
CREATE POLICY "drives_official_insert" ON public.drives FOR INSERT WITH CHECK (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('city_official', 'admin')
);
CREATE POLICY "drives_official_update" ON public.drives FOR UPDATE USING (
  (SELECT role FROM public.users WHERE id = auth.uid()) IN ('city_official', 'admin')
);

-- user_badges: public read, owner insert (client awards own badge during submission)
DROP POLICY IF EXISTS "user_badges_select" ON public.user_badges;
DROP POLICY IF EXISTS "user_badges_insert" ON public.user_badges;
CREATE POLICY "user_badges_select" ON public.user_badges FOR SELECT USING (true);
CREATE POLICY "user_badges_insert" ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- guardians: change from owner-only SELECT → public SELECT (so map can show guardian counts/names)
DROP POLICY IF EXISTS "guardians_select" ON public.guardians;
CREATE POLICY "guardians_select" ON public.guardians FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: Make dirty_reports public read (run this if already deployed)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dirty_reports_select" ON public.dirty_reports;
CREATE POLICY "dirty_reports_select" ON public.dirty_reports FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO SEED LOCATIONS (Chennai area)
-- These give the map some pins to show right away for demo purposes.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.locations (lat, lng, lat_grid, lng_grid, status) VALUES
  -- Pending spots (users reported, awaiting 3 confirmations to turn red/dirty)
  (13.0827, 80.2707, 13.0827, 80.2707, 'pending'), -- Chennai Central
  (13.0674, 80.2376, 13.0674, 80.2376, 'pending'), -- T. Nagar
  (13.0488, 80.2194, 13.0488, 80.2194, 'pending'), -- Guindy
  (13.0765, 80.2580, 13.0765, 80.2580, 'pending'), -- Egmore
  (13.0340, 80.2700, 13.0340, 80.2700, 'pending'), -- Adyar
  (13.0980, 80.2870, 13.0980, 80.2870, 'pending'), -- Royapuram
  -- Clean spots
  (13.0878, 80.2785, 13.0878, 80.2785, 'clean'),   -- Fort St. George
  (13.0604, 80.2496, 13.0604, 80.2496, 'clean'),   -- Nungambakkam
  (13.0524, 80.2114, 13.0524, 80.2114, 'clean'),   -- Saidapet
  (12.9214, 80.2401, 12.9214, 80.2401, 'clean')    -- KCG College area (OMR Karapakkam)
ON CONFLICT (lat_grid, lng_grid) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- DEMO DATA
-- After running this schema, promote a test user to city_official and seed a drive:
--
--   UPDATE public.users SET role = 'city_official' WHERE id = '<your-user-id>';
--
--   INSERT INTO public.drives
--     (title, description, created_by, lat, lng, radius_km,
--      start_time, end_time, badge_name, badge_color, badge_icon, points_multiplier)
--   VALUES (
--     'KCG Cleanliness Drive 2026',
--     'Official KCG drive to restore public spaces across Chennai. Earn double points and a special badge!',
--     '<your-user-id>',
--     12.9214, 80.2401,        -- KCG College area (OMR Karapakkam)
--     0.5,                     -- 500 m radius
--     now(),
--     now() + interval '7 days',
--     'KCG Drive 2026',
--     '#16a34a',
--     'shield-checkmark',
--     2.0
--   );
-- ─────────────────────────────────────────────────────────────────────────────

