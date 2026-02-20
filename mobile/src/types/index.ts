// ─── Database row types matching the schema ──────────────────────────────────

export type LocationStatus = 'dirty' | 'pending' | 'clean';

export interface UserRow {
  id: string;
  name: string;
  avatar: string | null;
  total_points: number;
  cleanups_done: number;
  expo_push_token: string | null;
}

export interface LocationRow {
  id: string;
  lat: number;
  lng: number;
  lat_grid: number;
  lng_grid: number;
  status: LocationStatus;
  last_cleaned_at: string | null;
}

export interface PendingSession {
  id: string;
  user_id: string;
  location_id: string;
  before_image: string;
  before_time: string; // recorded server-side
  gps_lat: number;
  gps_lng: number;
  created_at: string;
}

export interface CleanupReport {
  id: string;
  user_id: string;
  location_id: string;
  before_image: string;
  after_image: string;
  before_time: string;
  after_time: string;
  verified: boolean;
}

export interface DirtyReport {
  id: string;
  user_id: string;
  location_id: string;
  photo_url: string;
  created_at: string;
}

export interface PointsLogRow {
  id: string;
  user_id: string;
  points: number;
  reason: string;
  location_id: string;
  month: string; // "YYYY-MM"
  created_at: string;
}

export interface GuardianRow {
  id: string;
  user_id: string;
  location_id: string;
  subscribed_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  message: string;
  location_id: string;
  read: boolean;
  created_at: string;
}

// ─── Leaderboard entry ────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  user_id: string;
  name: string;
  avatar: string | null;
  monthly_points: number;
}
