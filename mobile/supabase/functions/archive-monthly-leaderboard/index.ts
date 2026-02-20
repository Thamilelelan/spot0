// supabase/functions/archive-monthly-leaderboard/index.ts
// Triggered by cron-job.org at the start of each month.
// Creates a snapshot of the top 100 for the previous month.
// Does NOT delete data — month field in points_log partitions history.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  // Verify cron secret to prevent unauthorized calls
  const secret = req.headers.get('x-cron-secret');
  if (secret !== Deno.env.get('CRON_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Compute previous month string "YYYY-MM"
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString()
    .slice(0, 7);

  // Aggregate previous month's points
  const { data: rows } = await supabase
    .from('points_log')
    .select('user_id, points')
    .eq('month', prevMonth);

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ message: 'No data for previous month.' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const map = new Map<string, number>();
  for (const row of rows as any[]) {
    map.set(row.user_id, (map.get(row.user_id) ?? 0) + row.points);
  }

  const snapshot = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([user_id, points], i) => ({
      month: prevMonth,
      rank: i + 1,
      user_id,
      points,
      archived_at: new Date().toISOString(),
    }));

  const { error } = await supabase.from('leaderboard_snapshots').insert(snapshot);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ message: `Archived ${snapshot.length} entries for ${prevMonth}.` }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
