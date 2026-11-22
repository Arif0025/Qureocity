import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceRoleKey || !authorization) return response({ error: 'Notification service is not configured.' }, 503);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Sign in again to notify staff.' }, 401);

  const { data: caller, error: callerError } = await service.from('employees').select('id,role').eq('id', authData.user.id).maybeSingle();
  if (callerError) return response({ error: 'Could not verify the admin account.' }, 500);
  if (caller?.role !== 'admin') return response({ error: 'Admins only.' }, 403);

  let payload: { employee_id?: unknown; title?: unknown; message?: unknown };
  try { payload = await request.json(); } catch { return response({ error: 'Invalid request body.' }, 400); }
  const employeeId = typeof payload.employee_id === 'string' ? payload.employee_id : '';
  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 100) : '';
  const message = typeof payload.message === 'string' ? payload.message.trim().slice(0, 500) : '';
  if (!employeeId || !title || !message) return response({ error: 'Employee, title, and message are required.' }, 400);

  const { data: target, error: targetError } = await service.from('employees').select('id,role').eq('id', employeeId).maybeSingle();
  if (targetError) return response({ error: 'Could not load that employee.' }, 500);
  if (!target || target.role !== 'staff') return response({ error: 'Choose an active staff member.' }, 404);

  const { data: devices, error: deviceError } = await service.from('mobile_push_devices')
    .select('id,expo_push_token,device_label').eq('user_id', employeeId);
  if (deviceError) return response({ error: 'Could not load the staff member’s mobile devices.' }, 500);
  if (!devices?.length) return response({ error: 'This staff member has no mobile device registered for notifications.' }, 404);

  let pushPayload: { data?: { status?: string; message?: string; details?: { error?: string } }[] };
  try {
    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(devices.map((device) => ({
        to: device.expo_push_token,
        title,
        body: message,
        sound: 'default',
        channelId: 'staff-updates',
        data: { event: 'manual_nudge', url: '/employee?tab=home' },
      }))),
    });
    if (!pushResponse.ok) return response({ error: 'Expo could not accept the notification. Try again.' }, 502);
    pushPayload = await pushResponse.json();
  } catch {
    return response({ error: 'Could not reach the notification service.' }, 502);
  }

  const tickets = Array.isArray(pushPayload.data) ? pushPayload.data : [];
  let sent = 0;
  await Promise.all(devices.map(async (device, index) => {
    const ticket = tickets[index];
    if (ticket?.status === 'ok') sent += 1;
    if (ticket?.details?.error === 'DeviceNotRegistered') await service.from('mobile_push_devices').delete().eq('id', device.id);
    await service.rpc('push_log_send', {
      p_event_type: 'manual_nudge',
      p_is_test: false,
      p_user_id: employeeId,
      p_device_label: device.device_label,
      p_endpoint: device.expo_push_token,
      p_result: ticket?.status === 'ok' ? 'sent' : ticket?.details?.error === 'DeviceNotRegistered' ? 'gone' : 'failed',
    });
  }));
  if (sent === 0) return response({ error: 'The notification did not reach any registered device.' }, 502);

  await service.from('employee_notifications').insert({
    user_id: employeeId,
    category: 'admin',
    title,
    body: message,
    target_url: '/employee?tab=home',
  });
  return response({ ok: true, sent, total: devices.length });
});
