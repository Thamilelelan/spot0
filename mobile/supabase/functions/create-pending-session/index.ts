// supabase/functions/create-pending-session/index.ts
// Called when user uploads the BEFORE photo.
// Records server-side before_time so client cannot tamper with it.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Authenticate caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authErr || !user) return new Response('Unauthorized', { status: 401 });

  const { location_id, before_image, before_image_hash, gps_lat, gps_lng, gps_accuracy } = await req.json();

  // Check for duplicate image hash
  const { data: existing } = await supabase
    .from('cleanup_reports')
    .select('id')
    .eq('before_image_hash', before_image_hash)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ error: 'Duplicate image detected. This photo has already been used.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const { data: session, error } = await supabase
    .from('pending_sessions')
    .insert({
      user_id: user.id,
      location_id,
      before_image,
      before_image_hash,
      before_time: new Date().toISOString(), // ← server-side timestamp
      gps_lat,
      gps_lng,
      gps_accuracy,
    })
    .select('id')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ id: session.id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
