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

// Keep in sync with the website export allowlist. app_settings is deliberately
// column-limited so hashes, integration credentials, and kiosk secrets never leave.
const EXPORT_GROUPS = {
  customers: [
    { table: 'customers', orderBy: ['id'] },
    { table: 'children', orderBy: ['id'] },
  ],
  memberships: [
    { table: 'membership_plans', orderBy: ['id'] },
    { table: 'child_subscriptions', orderBy: ['child_id'] },
    { table: 'child_special_passes', orderBy: ['id'] },
  ],
  checkins: [{ table: 'play_sessions', orderBy: ['id'] }],
  registrations: [
    { table: 'membership_registrations', orderBy: ['id'] },
    { table: 'party_plans', orderBy: ['id'] },
    { table: 'party_bookings', orderBy: ['id'] },
  ],
  staff: [
    { table: 'employees', orderBy: ['id'] },
    { table: 'attendance_logs', orderBy: ['id'] },
    { table: 'shifts', orderBy: ['id'] },
  ],
  settings: [
    { table: 'app_settings', orderBy: ['id'], columns: 'id,qr_mode,attendance_variance_threshold_mins,auto_punch_out_time,party_booking_open_time,party_booking_close_time,party_booking_slot_minutes,party_booking_gap_minutes' },
    { table: 'notification_rules', orderBy: ['event_type'] },
    { table: 'notification_preferences', orderBy: ['user_id', 'event_type'] },
    { table: 'notification_log', orderBy: ['event_type', 'dedupe_key'] },
    { table: 'push_send_log', orderBy: ['id'] },
    { table: 'employee_notifications', orderBy: ['id'] },
  ],
} as const;
type ExportGroup = keyof typeof EXPORT_GROUPS;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return response({ error: 'Export is not configured.' }, 503);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: authError } = await userClient.auth.getUser();
  const actorId = userResult.user?.id;
  if (authError || !actorId) return response({ error: 'Sign in again to export data.' }, 401);
  const { data: employee, error: roleError } = await adminClient.from('employees').select('role').eq('id', actorId).maybeSingle();
  if (roleError) return response({ error: 'Could not verify administrator access.' }, 500);
  if (employee?.role !== 'admin') return response({ error: 'Only admins can export data.' }, 403);

  let requested: unknown;
  try { requested = (await request.json()).groups; }
  catch { return response({ error: 'Choose at least one data group.' }, 400); }
  if (!Array.isArray(requested) || requested.length < 1 || requested.length > 6 || requested.some((key) => typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(EXPORT_GROUPS, key))) {
    return response({ error: 'The selected data groups are invalid.' }, 400);
  }

  const groups = [...new Set(requested as ExportGroup[])];
  const tables: Record<string, unknown[]> = {};
  try {
    for (const group of groups) {
      for (const resource of EXPORT_GROUPS[group]) {
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          let query = adminClient.from(resource.table).select('columns' in resource ? resource.columns : '*');
          for (const column of resource.orderBy) query = query.order(column, { ascending: true });
          const { data, error } = await query.range(from, from + 999);
          if (error) throw new Error(`${resource.table}: ${error.message}`);
          rows.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        tables[resource.table] = rows;
      }
    }
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : 'Export failed.' }, 500);
  }
  return response({ product: 'QureoCity', formatVersion: 1, exportedAt: new Date().toISOString(), groups, tables });
});
