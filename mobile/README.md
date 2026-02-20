# City Cleanliness Mobile App

React Native (Expo) mobile app for the KCG Hackathon — City Cleanliness Platform.

---

## Quick Start

### Prerequisites

- Node.js 18+
- [Expo Go](https://expo.dev/go) installed on your Android/iOS device

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Configure Supabase

Open `src/lib/supabase.ts` and replace:

```ts
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

Get these from: **Supabase Dashboard → Project Settings → API**

### 3. Run the database schema

In your Supabase dashboard → **SQL Editor → New Query**, paste and run the contents of:

```
supabase/schema.sql
```

### 4. Create storage buckets

In Supabase Dashboard → **Storage → New Bucket**:

- `cleanup-images` — public
- `dirty-reports` — public

### 5. Deploy Edge Functions

```bash
# Install Supabase CLI first: https://supabase.com/docs/guides/cli
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

npx supabase functions deploy create-pending-session
npx supabase functions deploy submit-cleanup-report
npx supabase functions deploy check-dirty-consensus
npx supabase functions deploy archive-monthly-leaderboard
```

Set Edge Function secrets in Supabase Dashboard → **Edge Functions → Manage secrets**:
| Secret | Value |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name (free tier) |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CRON_SECRET` | Any random string (also use in cron-job.org header) |

### 6. Set up monthly leaderboard reset (cron-job.org)

1. Go to [cron-job.org](https://cron-job.org) and create a free account
2. Create a new cron job:
   - URL: `https://YOUR_PROJECT_ID.supabase.co/functions/v1/archive-monthly-leaderboard`
   - Schedule: `0 0 1 * *` (midnight, 1st of each month)
   - Header: `x-cron-secret: YOUR_CRON_SECRET`

### 7. Start the app

```bash
npm start
```

Scan the QR code with Expo Go on your device.

---

## Project Structure

```
mobile/
├── App.tsx                          # Root — AuthProvider + push notification setup
├── app.json                         # Expo config (permissions, plugins)
├── src/
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client (ADD YOUR KEYS HERE)
│   │   └── notifications.ts        # Expo push notification registration
│   ├── context/
│   │   └── AuthContext.tsx          # Auth state, profile fetch, sign out
│   ├── navigation/
│   │   └── AppNavigator.tsx         # Bottom tabs + stack navigator
│   ├── screens/
│   │   ├── auth/LoginScreen.tsx     # Email sign in / sign up
│   │   ├── HomeScreen.tsx           # Dashboard with stats + points card
│   │   ├── MapScreen.tsx            # react-native-maps with location markers
│   │   ├── SubmitCleanupScreen.tsx  # Before/after photo submission flow
│   │   ├── LeaderboardScreen.tsx    # Monthly leaderboard
│   │   ├── ProfileScreen.tsx        # User profile + recent cleanups
│   │   ├── NotificationsScreen.tsx  # Notification inbox
│   │   ├── DirtyReportScreen.tsx    # Report dirty location with photo
│   │   └── GuardianScreen.tsx       # Subscribe/unsubscribe as guardian
│   └── types/index.ts               # TypeScript types for all DB rows
└── supabase/
    ├── schema.sql                   # Full DB schema + RLS policies
    └── functions/
        ├── create-pending-session/   # Records server-side before_time
        ├── submit-cleanup-report/    # GPS + time + image diff + hash dedup
        ├── check-dirty-consensus/    # 3-report threshold + push notifications
        └── archive-monthly-leaderboard/ # cron: monthly snapshot
```

---

## Verification Layers (Auto-enforced)

| Layer                  | Enforcement                                          |
| ---------------------- | ---------------------------------------------------- |
| In-app camera only     | Expo Camera, `source: camera`, gallery never exposed |
| GPS match (≤ 20m)      | Haversine in Edge Function                           |
| Time window (2–45 min) | Server-side `before_time` in Edge Function           |
| Image diff             | Cloudinary free-tier integration                     |
| Duplicate hash         | SHA-256 hash stored and checked per submission       |

---

## Points System

| Action                                      | Points             |
| ------------------------------------------- | ------------------ |
| Verified cleanup                            | +10                |
| Re-cleaning same area                       | +15 (10 + 5 bonus) |
| Dirty confirmation (when consensus reached) | +3                 |

Leaderboard is per-month. History is never deleted — filtered by `month` column.

---

## Demo Flow for Judges

1. Open app → Sign up
2. Go to **Map** → See existing location markers
3. Tap **Submit** → Start Cleanup → Take before photo → Wait 2 min → Take after photo → Submit
4. See points update on **Home** and **Leaderboard**
5. Tap a marker → Report dirty → Shows 1/3 confirmations
6. Tap a clean marker → Subscribe as **Guardian**
7. Check **Notifications** tab for guardian alerts
