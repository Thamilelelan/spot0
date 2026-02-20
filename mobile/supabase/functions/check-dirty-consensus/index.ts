// supabase/functions/check-dirty-consensus/index.ts
// Counts dirty reports for a location in the last 24 hours.
// If ≥ 3 unique users have reported, marks location as dirty
// and sends push notifications to all guardians.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { location_id } = await req.json();

  // Count distinct users who reported in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: reports } = await supabase
    .from('dirty_reports')
    .select('user_id')
    .eq('location_id', location_id)
    .gte('created_at', since);

  if (!reports) return new Response('ok', { headers: corsHeaders });

  const uniqueUsers = new Set(reports.map((r: any) => r.user_id));

  if (uniqueUsers.size < 3) {
    return new Response(
      JSON.stringify({ message: `${uniqueUsers.size}/3 confirmations so far.` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // ── Threshold reached: mark location dirty ────────────────────────────────
  const { data: loc } = await supabase
    .from('locations')
    .select('status')
    .eq('id', location_id)
    .single();

  if (loc?.status === 'dirty') {
    return new Response(JSON.stringify({ message: 'Already dirty.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await supabase.from('locations').update({ status: 'dirty' }).eq('id', location_id);

  // Award +3 points to all reporters in this consensus window
  const month = new Date().toISOString().slice(0, 7);
  const pointsInserts = Array.from(uniqueUsers).map((uid) => ({
    user_id: uid,
    points: 3,
    reason: 'dirty_confirmation',
    location_id,
    month,
  }));
  await supabase.from('points_log').insert(pointsInserts);

  // Notify guardians
  const { data: guardians } = await supabase
    .from('guardians')
    .select('user_id, users(expo_push_token, name)')
    .eq('location_id', location_id);

  if (guardians && guardians.length > 0) {
    const notifications: any[] = [];
    const dbNotifications: any[] = [];

    for (const g of guardians as any[]) {
      const token = g.users?.expo_push_token;
      if (token) {
        notifications.push({
          to: token,
          title: '🚨 Guardian Alert',
          body: 'A location you are guarding has been reported dirty again!',
          data: { location_id },
          channelId: 'guardian-alerts',
        });
      }
      dbNotifications.push({
        user_id: g.user_id,
        message: `A location you are guarding has been reported dirty by ${uniqueUsers.size} users.`,
        location_id,
        read: false,
      });
    }

    // Send Expo push notifications
    if (notifications.length > 0) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(notifications),
      });
    }

    // Persist notification records
    await supabase.from('notifications').insert(dbNotifications);
  }

  return new Response(
    JSON.stringify({ message: 'Location marked dirty. Guardians notified.', notified: guardians?.length ?? 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
