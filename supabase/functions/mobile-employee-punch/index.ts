import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

async function verifyDynamicToken(value: string, secret: string) {
  const [bucketText, signature] = value.split('.');
  if (!/^\d+$/.test(bucketText ?? '') || !/^[a-f0-9]{24}$/.test(signature ?? '')) return false;
  const bucket = Number(bucketText);
  const current = Math.floor(Date.now() / 45_000);
  if (!Number.isSafeInteger(bucket) || (bucket !== current && bucket !== current - 1)) return false;

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(bucket))));
  return hex(signed).slice(0, 24) === signature;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !authorization) return json({ error: 'Punch service is not configured.' }, 503);

  let payload: { value?: unknown };
  try { payload = await request.json(); } catch { return json({ error: 'Invalid QR scan.' }, 400); }
  const value = typeof payload.value === 'string' ? payload.value : '';
  if (!value || value.length > 256) return json({ error: 'Invalid QR scan.' }, 400);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Sign in again to record your punch.' }, 401);

  const { data: employee, error: employeeError } = await client.from('employees').select('id').eq('id', authData.user.id).maybeSingle();
  if (employeeError || !employee) return json({ error: 'Staff access is required.' }, 403);

  const { data: setting, error: settingError } = await client.from('app_settings').select('qr_mode').eq('id', true).single();
  if (settingError || (setting?.qr_mode !== 'static' && setting?.qr_mode !== 'dynamic')) {
    return json({ error: 'Could not confirm the venue QR mode. Try again.' }, 503);
  }

  let tokenHash: string | null = null;
  if (setting.qr_mode === 'static') {
    const expected = Deno.env.get('DESK_QR_VALUE') ?? 'QUREOCITY-FRONT-DESK';
    if (value !== expected) return json({ error: 'That code is not the current front-desk QR.' }, 400);
  } else {
    const secret = Deno.env.get('QR_SIGNING_SECRET');
    if (!secret) return json({ error: 'Dynamic QR punch is not configured on the server.' }, 503);
    if (!(await verifyDynamicToken(value, secret))) return json({ error: 'QR code expired or invalid. Please rescan the current desk code.' }, 400);
    tokenHash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
  }

  const { data, error } = await client.rpc('employee_toggle_punch', { p_token_hash: tokenHash });
  if (error) {
    const message = error.message.includes('just used') ? 'This QR code was already used. Please rescan.' : error.message;
    return json({ error: message }, 400);
  }
  return json(data);
});
