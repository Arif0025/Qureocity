import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceRoleKey || !authorization) return response({ error: 'Notification test is not configured.' }, 503);

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Sign in again to test notifications.' }, 401);
  const { data: employee, error: employeeError } = await service.from('employees').select('id').eq('id', authData.user.id).maybeSingle();
  if (employeeError) return response({ error: 'Could not verify your staff account.' }, 500);
  if (!employee) return response({ error: 'Staff access is required.' }, 403);
  let payload: { token?: unknown };
  try { payload = await request.json(); } catch { return response({ error: 'Invalid request body.' }, 400); }
  const token = typeof payload.token === 'string' ? payload.token : '';
  if (!token || token.length > 255) return response({ error: 'Enable notifications on this device first.' }, 400);
  const { data: devices, error: deviceError } = await service.from('mobile_push_devices')
    .select('id,expo_push_token').eq('user_id', employee.id).eq('expo_push_token', token).limit(1);
  if (deviceError) return response({ error: 'Could not load your registered phone.' }, 500);
  const device = devices?.[0];
  if (!device) return response({ error: 'Enable notifications on this device first.' }, 400);

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: device.expo_push_token, title: 'QureoCity test', body: 'Mobile notifications are connected.', sound: 'default', channelId: 'staff-updates', data: { event: 'test', url: '/' } }),
  });
  if (!pushResponse.ok) return response({ error: 'Expo could not accept the test notification. Check the app push credentials and try again.' }, 502);
  const result = await pushResponse.json();
  const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;
  if (ticket?.status !== 'ok') {
    if (ticket?.details?.error === 'DeviceNotRegistered') await service.from('mobile_push_devices').delete().eq('id', device.id);
    return response({ error: ticket?.message ?? 'Expo could not deliver to this phone.' }, 502);
  }
  return response({ ok: true });
});
