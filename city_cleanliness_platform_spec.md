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
Leaflet map showing:
- Red = Dirty
- Yellow = Pending verification
- Green = Cleaned

Tables:
locations(id, lat, lng, status, last_cleaned_at)

---

### Clean Spot Submission (Main Feature)
User flow:
1. Capture BEFORE photo in-app
2. Clean area
3. Capture AFTER photo
4. Submit report

Tables:
cleanup_reports(id, user_id, location_id, before_image, after_image, before_time, after_time, verified)

---

### Dirty Report (Crowd Validation)
A location becomes dirty only if multiple users confirm.

Rule:
3 independent confirmations within 24 hours

Tables:
dirty_reports(id, user_id, location_id, created_at)

---

### Points System
+10 verified cleanup
+3 dirty confirmation
+5 re-cleaning same area

Leaderboard resets monthly.

---

### Impact Dashboard
Displays:
- Total cleanups
- Active volunteers
- Areas restored
- Cleanliness heatmap

---

## Verification System (Layered Trust Model)
A cleanup is accepted only if most trust signals match.

### Session Rules
- Minimum duration: 2 minutes
- Maximum duration: 45 minutes

Purpose: ensure same visit authenticity

---

### Verification Layers

1. In-App Camera Only
   Prevents gallery uploads

2. GPS Matching
   Before & After must be within 20m radius

3. Time Window
   Between 2–45 minutes

4. Image Difference Check
   Pixel change threshold must be met

5. Duplicate Detection
   Image hash must not match previous submissions

---

### Anti-Cheat Scenarios Covered
- Reusing old photos
- Cleaning on different days
- Uploading internet images
- Claiming same cleanup repeatedly
- Instant fake submissions

---

## Re-Dirty Detection
If 3 users independently report a location dirty within 24 hours:
- Status changes to RED
- Guardians & nearby users notified

---

## System Architecture
Mobile App -> Upload Photos -> Supabase Storage
-> Edge Function Validation -> Database Update
-> Map & Leaderboard Auto Update

---

## Technology Stack
Backend: Supabase (DB, Auth, Storage, Edge Functions)
Web: Next.js + Leaflet
Mobile: React Native

---

## Out of Scope
- No payment processing
- No bank integrations
- No donation tracking
- No heavy AI models

---

## System Boundary Statement
The platform verifies civic work, not financial transactions. Rewards are handled externally using the verified public contribution data.

---

## Team Responsibilities

### Web Team (Next.js)
- Implement Leaflet cleanliness map
- Display location markers with color status (red/yellow/green)
- Leaderboard UI
- Impact dashboard (metrics & statistics)
- Authentication UI integration

### Mobile Team (React Native)
- In-app camera capture (before & after photos)
- GPS capture while taking photo
- Upload cleanup report
- Report dirty location
- Notifications for re-dirty alerts (basic implementation)

### Backend Team (Supabase)
- Database schema setup
- Supabase Auth configuration
- Storage buckets for images
- Edge function validation (distance, time, duplicate image)
- Points calculation logic
- Dirty report consensus logic
- Leaderboard queries