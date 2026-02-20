# City Cleanliness Challenge Platform — System Specification

## Project Purpose

A geo-verified civic contribution tracking platform that records, validates, and visualizes real-world cleanliness efforts. The system does NOT handle payments or donations. It only generates a trusted public contribution record which can be used by municipalities or sponsors for rewards outside the platform.

---

## Core Concepts

- Reduce fake participation
- Encourage small contributions
- Enable long-term maintenance
- Provide measurable civic impact

---

## Platform Boundary (Important)

**Mobile App** is the only submission interface. All user-generated content (photos, GPS, reports) originates from the mobile app where verification constraints can be enforced at the OS/app level.

**Web App** is read-only. It displays the map, leaderboard, impact dashboard, and public contribution data. It has no upload or submission functionality.

This boundary exists because camera enforcement (no gallery uploads, no camera roll) can only be reliably enforced in a controlled native/Expo app environment, not a browser.

---

## Participation Modes

### 1. Quick Cleaner (Default)

Users clean any location once and submit proof.

### 2. Guardian (Optional)

Users subscribe to an area and get notified if it becomes dirty again. No obligation to clean every time.

---

## Feature List

### Authentication

- Email / Google login using Supabase Auth
- Each action linked to user account

Tables:

users(id, name, avatar, total_points, cleanups_done)

---

### Cleanliness Map

Leaflet map (Web) and map view (Mobile) showing:

- Red = Dirty
- Yellow = Pending verification
- Green = Cleaned

Tables:

locations(id, lat, lng, lat_grid, lng_grid, status, last_cleaned_at)

Note: `lat_grid` and `lng_grid` store lat/lng rounded to 4 decimal places (~11m precision) and are used to deduplicate nearby location submissions. When a new report is submitted, the app checks for an existing location within the same grid cell before creating a new one.

---

### Clean Spot Submission (Main Feature)

**Mobile only.**

User flow:

1. Open app → tap "Start Cleanup" → app opens in-app camera
2. Capture BEFORE photo (camera only, gallery disabled)
3. App records GPS coordinates and uploads photo → server creates a pending session
4. User cleans the area
5. Capture AFTER photo (same in-app camera)
6. Submit report → Edge Function validates all layers

Tables:

pending_sessions(id, user_id, location_id, before_image, before_time, gps_lat, gps_lng, created_at)
cleanup_reports(id, user_id, location_id, before_image, after_image, before_time, after_time, verified)

**Why `pending_sessions`:** `before_time` is recorded server-side when the before-photo is uploaded, not when the report is submitted. This prevents client-side timestamp tampering. The Edge Function compares server-recorded `before_time` against submission time to enforce the 2–45 minute window.

---

### Dirty Report (Crowd Validation)

**Mobile only.**

A location becomes dirty only if multiple users confirm with photo evidence.

Rule: 3 independent confirmations within 24 hours.

Tables:

dirty_reports(id, user_id, location_id, photo_url, created_at)

Note: `photo_url` is required. A photo must be taken in-app at the time of reporting. This prevents coordinated false dirty reports and raises the trust signal quality.

---

### Points System

- +10 verified cleanup
- +3 dirty confirmation (with photo)
- +5 re-cleaning same area

Leaderboard resets monthly.

Tables:

points_log(id, user_id, points, reason, location_id, month, created_at)

`points_log` stores every point event individually. Monthly leaderboard is computed by filtering `points_log` by `month`. This allows monthly resets without modifying `users.total_points` (which represents all-time points). Leaderboard queries aggregate `points_log` for the current month.

Monthly reset mechanism: cron-job.org (free external cron service) triggers a Supabase Edge Function at the start of each month to archive the previous month's leaderboard snapshot. No data is deleted — the `month` field partitions the data.

---

### Guardian Mode

Tables:

guardians(id, user_id, location_id, subscribed_at)

When a location's status changes to RED (re-dirty), the system queries `guardians` for all users subscribed to that location and sends them a push notification.

---

### Notifications

Tables:

notifications(id, user_id, message, location_id, read, created_at)

When a location's status changes to RED (re-dirty), the system queries `guardians` for all users subscribed to that location and sends them a push notification.

---

### Notifications

Tables:

notifications(id, user_id, message, location_id, read, created_at)

Notifications are stored in the database and delivered via Expo Push Notifications (see Push Notification Infrastructure below).

---

### Impact Dashboard

**Web only (read-only display).**

Displays:

- Total cleanups
- Active volunteers
- Areas restored
- Cleanliness heatmap

---

## Verification System (Layered Trust Model)

A cleanup is accepted only if all critical trust signals pass. Executed in a Supabase Edge Function on report submission.

### Session Rules

- Minimum duration: 2 minutes
- Maximum duration: 45 minutes

Measured between server-recorded `before_time` (in `pending_sessions`) and Edge Function execution time at submission.

---

### Verification Layers

**1. In-App Camera Only**
The mobile app uses Expo ImagePicker with `mediaTypes: Images`, `allowsEditing: false`, and `source: camera` — gallery access is not exposed to the user. This is enforced at the app level.

**2. GPS Matching**
Before & After GPS coordinates must be within 20m radius. GPS is captured by the app at photo time and sent to the server. Submissions where the device-reported GPS accuracy exceeds 50m are flagged as low-confidence and held for extra confirmation rather than auto-rejected (GPS spoofing mitigation).

**3. Time Window**
Between 2–45 minutes, measured using server-side `before_time` from `pending_sessions`. Client-submitted timestamps are ignored for this check.

**4. Image Difference Check**
Uses an external free image comparison API (e.g. Cloudinary's free-tier image analysis or equivalent). The Edge Function uploads both images and requests a visual diff score. The score must meet a minimum threshold to confirm visible change. No heavy AI models are used — this is a lightweight pixel-level comparison service.

**5. Duplicate Detection**
A perceptual hash (pHash) of each image is computed and stored. Any submission whose before or after image hash matches a previously used image is rejected. Hash is computed in the Edge Function on upload.

---

### Anti-Cheat Scenarios Covered

- Reusing old photos (duplicate hash detection)
- Cleaning on different days (server-side time window)
- Uploading internet images (in-app camera enforcement)
- Claiming same cleanup repeatedly (duplicate hash detection)
- Instant fake submissions (2-minute minimum enforced server-side)
- Fabricated timestamps (before_time recorded server-side)
- GPS spoofing (accuracy threshold flag)

---

## Re-Dirty Detection

If 3 users independently submit dirty reports with photos for the same location within 24 hours:

- Location status changes to RED
- Guardians subscribed to that location are notified via push notification
- Notification record inserted into `notifications` table

---

## Push Notification Infrastructure

**Using Expo Push Notifications (free).**

Why Expo: React Native apps built with Expo have access to a unified push notification API that handles both FCM (Android) and APNs (iOS) behind a single endpoint — no separate Firebase or Apple developer configuration required for basic usage.

Flow:

1. On app first launch, Expo SDK generates a unique `ExpoPushToken` for the device.
2. Token is saved to the `users` table (`expo_push_token` column).
3. When a notification needs to be sent (re-dirty event, etc.), the Supabase Edge Function calls the Expo Push API (`https://exp.host/--/api/v2/push/send`) with the user's token and message.
4. Expo delivers to the device via the appropriate platform channel.

Schema addition:

users(id, name, avatar, total_points, cleanups_done, expo_push_token)

This requires no paid services and no separate FCM/APNs account setup.

---

## Complete Database Schema

users(id, name, avatar, total_points, cleanups_done, expo_push_token)
locations(id, lat, lng, lat_grid, lng_grid, status, last_cleaned_at)
pending_sessions(id, user_id, location_id, before_image, before_time, gps_lat, gps_lng, created_at)
cleanup_reports(id, user_id, location_id, before_image, after_image, before_time, after_time, verified)
dirty_reports(id, user_id, location_id, photo_url, created_at)
points_log(id, user_id, points, reason, location_id, month, created_at)
guardians(id, user_id, location_id, subscribed_at)
notifications(id, user_id, message, location_id, read, created_at)

---

## System Architecture

Mobile App (Expo / React Native)
-> In-app camera capture (camera only, no gallery)
-> GPS capture at photo time
-> Upload before photo -> Supabase Storage -> Edge Function creates pending_session (server records before_time)
-> Upload after photo + submit report -> Edge Function validation
[GPS check, time window, image diff API, hash dedup]
-> Database Update (cleanup_reports, points_log, locations)
-> Push notification via Expo Push API (if re-dirty event)

Web App (Next.js + Leaflet)
-> Read-only queries to Supabase DB
-> Displays map, leaderboard, impact dashboard

---

## Technology Stack

- **Backend:** Supabase (DB, Auth, Storage, Edge Functions, RLS)
- **Web:** Next.js + Leaflet
- **Mobile:** React Native with Expo
- **Image Diff:** External free-tier image comparison API (Cloudinary or equivalent)
- **Leaderboard Reset:** cron-job.org (free) → Supabase Edge Function
- **Push Notifications:** Expo Push Notifications (free)

---

## Security

### Row Level Security (RLS)

All Supabase tables will have RLS enabled. Policies:

- Users can only read/write their own `pending_sessions`, `cleanup_reports`, `dirty_reports`, `points_log`, `notifications`, `guardians` rows.
- `locations` is publicly readable; only Edge Functions (service role) can update status.
- `users` profiles are publicly readable; only the owner can update their own row.
- All write operations that affect points or location status go through Edge Functions using the service role key (not exposed to clients).

---

## Out of Scope

- No payment processing
- No bank integrations
- No donation tracking
- No heavy AI models

---

## System Boundary Statement

The platform verifies civic work, not financial transactions. Rewards are handled externally using the verified public contribution data. All data submission originates from the mobile app only.

---

## Team Responsibilities

### Web Team (Next.js) — Read-Only Display

- Implement Leaflet cleanliness map with location markers (red/yellow/green)
- Leaderboard UI (queries `points_log` for current month)
- Impact dashboard (total cleanups, active volunteers, areas restored, heatmap)
- Authentication UI integration (login/profile page)
- No upload or submission features on web

### Mobile Team (React Native + Expo)

- In-app camera capture — before & after photos (camera only, gallery access disabled)
- GPS capture at photo time
- Before-photo upload → creates pending session on server
- After-photo upload + report submission
- Report dirty location (with in-app photo)
- Guardian subscription management
- Expo push notification setup (register device token on launch, handle incoming notifications)
- Notification inbox UI

### Backend Team (Supabase)

- Database schema setup (all 8 tables)
- RLS policies per table
- Supabase Auth configuration (Email + Google)
- Storage buckets for images
- Edge Function: pending session creation (records server-side before_time)
- Edge Function: cleanup report validation (GPS, time window, image diff API call, pHash dedup)
- Edge Function: dirty report consensus (count + trigger re-dirty status change + push notifications)
- Edge Function: monthly leaderboard archive (triggered by cron-job.org)
- Points calculation logic (writes to points_log)
- Expo Push Notification dispatch logic in Edge Functions

---

## Implementation Priority (Hackathon Order)

1. Map with markers — highest visual impact for demo
2. Cleanup submission with before/after photo + basic validation
3. Points + leaderboard
4. Verification Edge Function (GPS + time window + image diff)
5. Re-dirty detection + notifications
6. Guardian mode
7. Monthly leaderboard reset (cron-job.org) — implement last
