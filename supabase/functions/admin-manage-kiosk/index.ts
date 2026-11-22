import { randomBytes, scryptSync } from 'node:crypto';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return response({ error: 'Kiosk management is not configured.' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return response({ error: 'Sign in again to manage kiosk access.' }, 401);
  const { data: employee, error: roleError } = await adminClient.from('employees')
    .select('role').eq('id', userData.user.id).maybeSingle();
  if (roleError) return response({ error: 'Could not verify administrator access.' }, 500);
  if (employee?.role !== 'admin') return response({ error: 'Only admins can manage kiosk access.' }, 403);

  let payload: Record<string, unknown>;
  try { payload = await request.json(); }
  catch { return response({ error: 'Invalid request body.' }, 400); }

  if (payload.action === 'list_sessions') {
    const { data, error } = await adminClient.from('kiosk_sessions')
      .select('id,name,created_at,last_seen_at').is('revoked_at', null)
      .order('last_seen_at', { ascending: false }).limit(100);
    return error ? response({ error: 'Could not load kiosk sessions.' }, 500) : response({ sessions: data ?? [] });
  }

  if (payload.action === 'set_password') {
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (password.length < 8 || password.length > 128) return response({ error: 'Use a password from 8 to 128 characters.' }, 400);
    const salt = randomBytes(16).toString('hex');
    const digest = scryptSync(password, salt, 64).toString('hex');
    const { error } = await adminClient.rpc('mobile_set_kiosk_password_hash', { p_password_hash: `${salt}:${digest}` });
    return error ? response({ error: 'Could not update kiosk access. No kiosk sessions were changed.' }, 500) : response({ ok: true });
  }

  if (payload.action === 'revoke_session') {
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      return response({ error: 'A valid kiosk session is required.' }, 400);
    }
    const { error } = await adminClient.from('kiosk_sessions')
      .update({ revoked_at: new Date().toISOString() }).eq('id', sessionId).is('revoked_at', null);
    return error ? response({ error: 'Could not revoke this kiosk session.' }, 500) : response({ ok: true });
  }

  return response({ error: 'Unsupported kiosk action.' }, 400);
});
