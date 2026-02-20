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

-- dirty_reports: owner only
DROP POLICY IF EXISTS "dirty_reports_select" ON public.dirty_reports;
DROP POLICY IF EXISTS "dirty_reports_insert" ON public.dirty_reports;
CREATE POLICY "dirty_reports_select" ON public.dirty_reports FOR SELECT USING (auth.uid() = user_id);
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
