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
    return response({ error: 'The employee management endpoint is not configured.' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userResult, error: authError } = await userClient.auth.getUser();
  const actorId = userResult.user?.id;
  if (authError || !actorId) return response({ error: 'Sign in again to manage employees.' }, 401);

  const { data: actor, error: actorError } = await adminClient.from('employees').select('role').eq('id', actorId).maybeSingle();
  if (actorError) return response({ error: 'Could not verify administrator access.' }, 500);
  if (actor?.role !== 'admin') return response({ error: 'Only admins can manage employees.' }, 403);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return response({ error: 'Invalid request body.' }, 400);
  }

  const action = payload.action;
  if (action === 'create') {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const role = payload.role === 'admin' ? 'admin' : payload.role === 'staff' ? 'staff' : null;
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role) {
      return response({ error: 'Enter a valid name, email, and role.' }, 400);
    }
    const temporaryPassword = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true });
    if (createError || !created.user) return response({ error: createError?.message ?? 'Could not create the sign-in account.' }, 400);
    const { error: insertError } = await adminClient.from('employees').insert({ id: created.user.id, name, role });
    if (insertError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return response({ error: insertError.message }, 400);
    }
    return response({ id: created.user.id, temporaryPassword });
  }

  const employeeId = typeof payload.employeeId === 'string' ? payload.employeeId : '';
  if (!employeeId) return response({ error: 'Employee ID is required.' }, 400);
  const { data: target, error: targetError } = await adminClient.from('employees').select('id,role').eq('id', employeeId).maybeSingle();
  if (targetError) return response({ error: 'Could not load the employee record.' }, 500);
  if (!target) return response({ error: 'Employee not found.' }, 404);

  if (action === 'reset_password') {
    const temporaryPassword = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
    const { error: updateError } = await adminClient.auth.admin.updateUserById(employeeId, { password: temporaryPassword });
    if (updateError) return response({ error: updateError.message }, 400);
    return response({ temporaryPassword });
  }

  if (action === 'set_salary') {
    const salaryType = payload.salaryType;
    const salaryRate = Number(payload.salaryRate);
    if ((salaryType !== 'monthly' && salaryType !== 'hourly') || !Number.isFinite(salaryRate) || salaryRate < 0 || salaryRate > 100_000_000) {
      return response({ error: 'Enter a valid salary type and non-negative rate.' }, 400);
    }
    const { error: updateError } = await adminClient.from('employees').update({ salary_type: salaryType, salary_rate: Math.round(salaryRate * 100) / 100 }).eq('id', employeeId);
    return updateError ? response({ error: updateError.message }, 400) : response({ ok: true });
  }

  if (action === 'set_role') {
    const role = payload.role;
    if (role !== 'admin' && role !== 'staff') return response({ error: 'Choose staff or admin.' }, 400);
    if (target.role === 'admin' && role !== 'admin') {
      const { count, error: countError } = await adminClient.from('employees').select('id', { count: 'exact', head: true }).eq('role', 'admin').neq('id', employeeId);
      if (countError) return response({ error: 'Could not verify remaining administrator accounts.' }, 500);
      if (!count) return response({ error: 'Keep at least one administrator account.' }, 409);
    }
    const { error: updateError } = await adminClient.from('employees').update({ role }).eq('id', employeeId);
    return updateError ? response({ error: updateError.message }, 400) : response({ ok: true });
  }

  if (action === 'remove') {
    if (employeeId === actorId) return response({ error: 'You cannot remove the account you are using.' }, 409);
    if (target.role === 'admin') {
      const { count, error: countError } = await adminClient.from('employees').select('id', { count: 'exact', head: true }).eq('role', 'admin').neq('id', employeeId);
      if (countError) return response({ error: 'Could not verify remaining administrator accounts.' }, 500);
      if (!count) return response({ error: 'Keep at least one administrator account.' }, 409);
    }
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(employeeId);
    if (deleteAuthError && !/not found/i.test(deleteAuthError.message)) return response({ error: deleteAuthError.message }, 400);
    const { error: deleteRecordError } = await adminClient.from('employees').delete().eq('id', employeeId);
    return deleteRecordError ? response({ error: deleteRecordError.message }, 400) : response({ ok: true });
  }

  return response({ error: 'Unsupported employee action.' }, 400);
});
