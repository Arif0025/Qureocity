import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';

const C = { ...colors, dark: colors.plumDark, tint: colors.plumTint };
type Employee = { id: string; name: string; role: 'admin' | 'staff'; salary_type: 'monthly' | 'hourly' | null; salary_rate: number | null };
type Shift = { id: string; employee_id: string; start_time: string; end_time: string; notes: string | null };
type Summary = { employee_id: string; total_hours_this_month: number; actual_working_days: number; scheduled_hours_this_month: number | null; paid_leave_hours_this_month?: number; paid_leave_days_this_month?: number; working_days_this_month?: number };
type Attendance = { id: string; punch_in: string; punch_out: string | null; auto_punched_out?: boolean };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const formatRupees = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
function monthProgressRatio() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'numeric', day:'numeric' }).formatToParts(new Date());
  const get = (key:string) => Number(parts.find((part)=>part.type===key)?.value);
  const year=get('year'), month=get('month'), todayDay=get('day'), daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  let openDays=0, elapsedOpenDays=0;
  for(let day=1;day<=daysInMonth;day+=1){if(new Date(Date.UTC(year,month-1,day)).getUTCDay()===2)continue;openDays+=1;if(day<=todayDay)elapsedOpenDays+=1;}
  return openDays ? elapsedOpenDays/openDays : 0;
}
function estimatedEarned(employee:Employee, summary?:Summary, monthStart = `${today().slice(0,7)}-01`) {
  if(!summary||employee.salary_rate==null||!employee.salary_type)return null;
  const rate=Number(employee.salary_rate); if(!Number.isFinite(rate)||rate<0)return null;
  const actual=Number(summary.total_hours_this_month||0)+Number(summary.paid_leave_hours_this_month||0);
  if(employee.salary_type==='hourly')return rate*actual;
  const scheduled=Number(summary.scheduled_hours_this_month||0), progress=monthStart===`${today().slice(0,7)}-01`?monthProgressRatio():1;
  if(scheduled>0)return rate*progress*Math.min(1,Math.max(0,actual/scheduled));
  const totalDays=Number(summary.working_days_this_month||0), credited=Number(summary.actual_working_days||0)+Number(summary.paid_leave_days_this_month||0);
  return rate*progress*(totalDays>0?Math.min(1,credited/totalDays):0);
}
const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('admin-manage-employee', { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as Record<string, unknown>;
};

export default function AdminStaff({ onBack, initialEmployeeId }: { onBack: () => void; initialEmployeeId?: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [onDuty, setOnDuty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [saving, setSaving] = useState(false);
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [salaryType, setSalaryType] = useState<'monthly' | 'hourly'>('monthly');
  const [salaryRate, setSalaryRate] = useState('');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [salaryMonth, setSalaryMonth] = useState(`${today().slice(0,7)}-01`);
  const [salarySummary, setSalarySummary] = useState<Summary | null>(null);
  const [salarySummaryLoading, setSalarySummaryLoading] = useState(false);
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const salaryRequest = useRef(0);
  const [editingAttendance, setEditingAttendance] = useState<Attendance | null>(null);
  const [editDate, setEditDate] = useState(''); const [editIn, setEditIn] = useState(''); const [editOut, setEditOut] = useState('');
  const [varianceMinutes, setVarianceMinutes] = useState('30');
  const [autoPunchOutTime, setAutoPunchOutTime] = useState('21:30');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState<'staff'|'admin'>('staff');
  const [shiftStart, setShiftStart] = useState('09:00'); const [shiftEnd, setShiftEnd] = useState('18:00'); const [shiftNotes, setShiftNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [staffResult, shiftResult, summaryResult, dutyResult, settingsResult] = await Promise.all([
      supabase.from('employees').select('id,name,role,salary_type,salary_rate').order('name'),
      supabase.from('shifts').select('id,employee_id,start_time,end_time,notes').limit(100),
      supabase.rpc('admin_staff_attendance_summary', { p_month_start: `${today().slice(0,7)}-01`, p_employee_id: null }),
      supabase.from('attendance_logs').select('employee_id').is('punch_out', null),
      supabase.from('app_settings').select('attendance_variance_threshold_mins,auto_punch_out_time').eq('id', true).maybeSingle(),
    ]);
    const issue = staffResult.error ?? shiftResult.error ?? summaryResult.error ?? dutyResult.error ?? settingsResult.error;
    if (issue) setError(issue.message);
    else {
      setEmployees((staffResult.data ?? []) as Employee[]); setShifts((shiftResult.data ?? []) as Shift[]);
      const next: Record<string, Summary> = {};
      for (const row of (summaryResult.data ?? []) as Summary[]) next[row.employee_id] = row;
      setSummaries(next); setOnDuty(new Set((dutyResult.data ?? []).map((row) => row.employee_id)));
      if (settingsResult.data?.attendance_variance_threshold_mins != null) setVarianceMinutes(String(settingsResult.data.attendance_variance_threshold_mins));
      if (settingsResult.data?.auto_punch_out_time) setAutoPunchOutTime(String(settingsResult.data.auto_punch_out_time).slice(0,5));
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const action = async (body: Record<string, unknown>) => {
    setSaving(true); setError('');
    try { const result = await call(body); await load(); return result; }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); return null; }
    finally { setSaving(false); }
  };
  const saveStaffSettings = async () => {
    const variance = Number(varianceMinutes);
    if (!Number.isInteger(variance) || variance < 0 || !/^\d{2}:\d{2}$/.test(autoPunchOutTime)) { setError('Check the attendance threshold and auto punch-out time.'); return; }
    setSaving(true); setError('');
    const { error: settingsError } = await supabase.from('app_settings').update({ attendance_variance_threshold_mins: variance, auto_punch_out_time: autoPunchOutTime }).eq('id', true);
    setSaving(false); if (settingsError) setError(settingsError.message);
  };
  const addEmployee = async () => {
    if (!name.trim() || !email.trim()) { setError('Enter an employee name and email.'); return; }
    const result = await action({ action: 'create', name: name.trim(), email: email.trim(), role });
    if (result) { setName(''); setEmail(''); setAddEmployeeOpen(false); Alert.alert('Employee created', `Temporary password:\n${String(result.temporaryPassword)}\n\nShare it securely and ask them to change it after signing in.`); }
  };
  const saveShift = async () => {
    if (!selected || !/^\d{2}:\d{2}$/.test(shiftStart) || !/^\d{2}:\d{2}$/.test(shiftEnd) || shiftEnd <= shiftStart) { setError('Enter a shift end time later than the start.'); return; }
    setSaving(true); setError('');
    const result = await supabase.from('shifts').upsert({ employee_id: selected.id, start_time: shiftStart, end_time: shiftEnd, notes: shiftNotes.trim() || null }, { onConflict: 'employee_id' });
    if (result.error) setError(result.error.message); else { setShiftNotes(''); await load(); }
    setSaving(false);
  };
  const dutyAction = async (employee: Employee, start: boolean) => {
    Alert.alert(start ? 'Punch employee in?' : 'Punch employee out?', `${employee.name} · ${start ? 'Start attendance now' : 'End the open attendance record'}`, [
      { text: 'Cancel', style: 'cancel' }, { text: start ? 'Punch in' : 'Punch out', onPress: async () => {
        setSaving(true); const { error: rpcError } = await supabase.rpc(start ? 'admin_force_punch_in' : 'admin_force_punch_out', { p_employee_id: employee.id });
        setSaving(false); if (rpcError) setError(rpcError.message); else await load();
      } },
    ]);
  };
  const manage = (employee: Employee, kind: string) => {
    const message = kind === 'remove' ? `Remove ${employee.name} and revoke their sign-in?` : kind === 'reset_password' ? `Create a new temporary password for ${employee.name}?` : kind === 'set_role' ? `Change ${employee.name}'s role?` : `Edit salary settings for ${employee.name}?`;
    Alert.alert(kind.replace('_',' '), message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: kind === 'remove' ? 'destructive' : 'default', onPress: async () => {
      if (kind === 'set_salary') { setSalaryType(employee.salary_type ?? 'monthly'); setSalaryRate(employee.salary_rate == null ? '' : String(employee.salary_rate)); setSalaryVisible(true); return; }
      const payload: Record<string, unknown> = { action: kind, employeeId: employee.id };
      if (kind === 'set_role') payload.role = employee.role === 'admin' ? 'staff' : 'admin';
      const result = await action(payload);
      if (result && kind === 'reset_password') Alert.alert('Temporary password', `${String(result.temporaryPassword)}\n\nShare it securely.`);
      if (result && kind === 'remove') setSelected(null);
    } }]);
  };
  const shiftsFor = (id: string) => shifts.filter((shift) => shift.employee_id === id);
  const loadAttendance = async (employeeId: string) => {
    setAttendanceLoading(true);
    const { data, error: loadError } = await supabase.from('attendance_logs').select('id,punch_in,punch_out,auto_punched_out').eq('employee_id', employeeId).order('punch_in', { ascending: false }).limit(60);
    if (loadError) setError(loadError.message); else setAttendance((data ?? []) as Attendance[]);
    setAttendanceLoading(false);
  };
  const loadSalaryMonth = async (employee: Employee, monthStart: string) => {
    const requestId = ++salaryRequest.current;
    setSalaryMonth(monthStart);
    if (monthStart === `${today().slice(0,7)}-01`) {
      setSalarySummary(summaries[employee.id] ?? null);
      setSalarySummaryLoading(false);
      return;
    }
    setSalarySummaryLoading(true); setSalarySummary(null);
    const { data, error: summaryError } = await supabase.rpc('admin_staff_attendance_summary', { p_month_start: monthStart, p_employee_id: employee.id });
    if (requestId !== salaryRequest.current) return;
    if (summaryError) setError(summaryError.message);
    else setSalarySummary(((data ?? []) as Summary[])[0] ?? null);
    setSalarySummaryLoading(false);
  };
  useEffect(() => {
    if (!initialEmployeeId || !employees.length || selected?.id === initialEmployeeId) return;
    const employee = employees.find((row) => row.id === initialEmployeeId);
    if (!employee) return;
    const assigned = shiftsFor(employee.id)[0];
    setShiftStart(assigned?.start_time.slice(0,5) ?? '09:00');
    setShiftEnd(assigned?.end_time.slice(0,5) ?? '18:00');
    setShiftNotes(assigned?.notes ?? '');
    setSelected(employee);
    void loadSalaryMonth(employee, `${today().slice(0,7)}-01`);
    void loadAttendance(employee.id);
  }, [employees, initialEmployeeId]);
  const moveSalaryMonth = (offset: number) => {
    if (!selected) return;
    const [year, month] = salaryMonth.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0,10);
    if (next <= `${today().slice(0,7)}-01`) void loadSalaryMonth(selected, next);
  };
  const localParts = (iso: string) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
    return { date, time };
  };
  const openAttendanceEdit = (row: Attendance) => { const start = localParts(row.punch_in); setEditDate(start.date); setEditIn(start.time); setEditOut(row.punch_out ? localParts(row.punch_out).time : ''); setEditingAttendance(row); };
  const saveAttendance = async () => {
    if (!selected || !editingAttendance || !/^\d{4}-\d{2}-\d{2}$/.test(editDate) || !/^\d{2}:\d{2}$/.test(editIn) || (editOut && !/^\d{2}:\d{2}$/.test(editOut)) || (editOut && editOut <= editIn)) { setError('Enter a valid date and punch times.'); return; }
    setSaving(true);
    const toIst = (time: string) => `${editDate}T${time}:00+05:30`;
    const { error: saveError } = await supabase.rpc('admin_save_attendance_log', { p_employee_id: selected.id, p_log_id: editingAttendance.id, p_punch_in: toIst(editIn), p_punch_out: editOut ? toIst(editOut) : null });
    setSaving(false); if (saveError) setError(saveError.message); else { setEditingAttendance(null); await loadAttendance(selected.id); await load(); }
  };
  const deleteAttendance = (row: Attendance) => Alert.alert('Delete attendance record?', `Punch-in ${new Date(row.punch_in).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`, [{ text:'Cancel',style:'cancel' },{ text:'Delete',style:'destructive',onPress:async()=>{if(!selected)return;const {error:deleteError}=await supabase.rpc('admin_delete_attendance_log',{p_employee_id:selected.id,p_log_id:row.id});if(deleteError)setError(deleteError.message);else{await loadAttendance(selected.id);await load();}} }]);

  return <View style={styles.root}>
    <View style={styles.header}><Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Overview</Text></Pressable><Pressable onPress={() => void load()}><Text style={styles.refresh}>Refresh</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.caption}>TEAM</Text><Text style={styles.heading}>Staff</Text><Text style={styles.subheading}>Roles, shifts, and attendance for the team.</Text>
      {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      <View style={styles.addCard}><Text style={styles.cardTitle}>Attendance settings</Text><Text style={styles.hint}>Venue-wide attendance controls.</Text><Text style={styles.fieldLabel}>Shift variance alert · minutes</Text><TextInput style={styles.input} value={varianceMinutes} onChangeText={setVarianceMinutes} keyboardType="number-pad" placeholder="30" placeholderTextColor={C.muted}/><Text style={styles.fieldLabel}>Auto punch-out · IST</Text><TextInput style={styles.input} value={autoPunchOutTime} onChangeText={setAutoPunchOutTime} placeholder="21:30" placeholderTextColor={C.muted}/><Pressable disabled={saving} onPress={()=>void saveStaffSettings()} style={styles.primary}><Text style={styles.primaryText}>{saving?'Saving…':'Save attendance settings'}</Text></Pressable></View>
      {loading ? <ActivityIndicator color={C.plum} style={{ margin: 30 }} /> : employees.map((employee) => {
        const summary = summaries[employee.id]; const assigned = shiftsFor(employee.id);
        return <Pressable key={employee.id} onPress={() => { const existing = shiftsFor(employee.id)[0]; setShiftStart(existing?.start_time.slice(0,5) ?? '09:00'); setShiftEnd(existing?.end_time.slice(0,5) ?? '18:00'); setShiftNotes(existing?.notes ?? ''); setSelected(employee); void loadSalaryMonth(employee,`${today().slice(0,7)}-01`); void loadAttendance(employee.id); }} style={styles.employeeCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{employee.name.trim().slice(0,1).toUpperCase()}</Text></View><View style={styles.employeeInfo}><View style={styles.nameRow}><Text style={styles.name}>{employee.name}</Text><Text style={[styles.status, { color: onDuty.has(employee.id) ? C.mint : C.muted }]}>{onDuty.has(employee.id) ? 'ON SITE' : employee.role.toUpperCase()}</Text></View><Text style={styles.meta}>{summary ? `${Number(summary.total_hours_this_month).toFixed(1)}h logged · ${summary.actual_working_days} days` : 'Attendance summary unavailable'}{assigned.length ? ` · Shift ${assigned[0].start_time.slice(0,5)}–${assigned[0].end_time.slice(0,5)}` : ''}</Text>{summary?<Text style={styles.meta}>{Number(summary.paid_leave_hours_this_month??0).toFixed(1)}h paid leave · Est. {estimatedEarned(employee,summary)===null?'—':formatRupees(estimatedEarned(employee,summary)!)}</Text>:null}</View><Text style={styles.chevron}>›</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" onPress={() => setAddEmployeeOpen(true)} style={styles.addEmployeeButton}><Text style={styles.addEmployeeButtonText}>＋ Add employee</Text></Pressable>
    </ScrollView>
    <Modal visible={addEmployeeOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddEmployeeOpen(false)}><View style={styles.modalRoot}><View style={styles.modalHeader}><View><Text style={styles.caption}>TEAM MANAGEMENT</Text><Text style={styles.modalTitle}>Add employee</Text></View><Pressable onPress={() => setAddEmployeeOpen(false)} style={styles.done}><Text style={styles.doneText}>Close</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled"><Text style={styles.hint}>Create a staff or admin account. A temporary password will be generated once.</Text><Text style={styles.fieldLabel}>Full name</Text><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={C.muted} /><Text style={styles.fieldLabel}>Sign-in email</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={C.muted} /><Text style={styles.fieldLabel}>Role</Text><View style={styles.roleRow}>{(['staff','admin'] as const).map((item) => <Pressable key={item} onPress={() => setRole(item)} style={[styles.roleButton, role === item && styles.roleSelected]}><Text style={[styles.roleText, role === item && styles.roleTextSelected]}>{item === 'staff' ? 'Staff' : 'Admin'}</Text></Pressable>)}</View>{error ? <Text style={styles.errorText}>{error}</Text> : null}<Pressable disabled={saving} onPress={() => void addEmployee()} style={styles.primary}>{saving ? <ActivityIndicator color="white" /> : <Text style={styles.primaryText}>Create account</Text>}</Pressable></ScrollView></View></Modal>
    <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}><View style={styles.modalRoot}><View style={styles.modalHeader}><View><Text style={styles.caption}>TEAM MEMBER</Text><Text style={styles.modalTitle}>{selected?.name}</Text></View><Pressable onPress={() => setSelected(null)} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable></View><ScrollView contentContainerStyle={styles.modalBody}>
      {selected && <>
        <View style={styles.stats}><Text style={styles.stat}>{(summaries[selected.id]?.total_hours_this_month ?? 0).toFixed(1)}h<Text style={styles.statLabel}> logged</Text></Text><Text style={styles.stat}>{Number(summaries[selected.id]?.paid_leave_hours_this_month??0).toFixed(1)}h<Text style={styles.statLabel}> paid leave</Text></Text></View><Text style={styles.salaryEstimate}>{summaries[selected.id] ? `${summaries[selected.id].actual_working_days} work days · ${summaries[selected.id].paid_leave_days_this_month??0} paid leave days` : ''}</Text>
        <View style={styles.actionRow}><Pressable style={styles.actionButton} onPress={() => void dutyAction(selected, !onDuty.has(selected.id))}><Text style={styles.actionText}>{onDuty.has(selected.id) ? 'Punch out' : 'Punch in'}</Text></Pressable><Pressable style={styles.actionButton} onPress={() => manage(selected,'reset_password')}><Text style={styles.actionText}>Reset password</Text></Pressable></View>
        <View style={styles.actionRow}><Pressable style={styles.actionButton} onPress={() => manage(selected,'set_role')}><Text style={styles.actionText}>Change role</Text></Pressable><Pressable style={[styles.actionButton, styles.removeButton]} onPress={() => manage(selected,'remove')}><Text style={[styles.actionText,{color:C.coral}]}>Remove staff</Text></Pressable></View>
        <Text style={styles.sectionTitle}>Salary settings & history</Text><Text style={styles.rowText}>{selected.salary_type ? `${selected.salary_type} · ${formatRupees(Number(selected.salary_rate??0))}` : 'No salary rate set'}</Text><View style={styles.actionRow}><Pressable style={styles.outline} onPress={() => moveSalaryMonth(-1)}><Text style={styles.actionText}>‹ Previous month</Text></Pressable><Text style={[styles.rowText,{alignSelf:'center',flex:1,textAlign:'center'}]}>{new Date(`${salaryMonth}T12:00:00Z`).toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'})}</Text><Pressable disabled={salaryMonth===`${today().slice(0,7)}-01`} style={[styles.outline,{opacity:salaryMonth===`${today().slice(0,7)}-01` ? 0.5 : 1}]} onPress={() => moveSalaryMonth(1)}><Text style={styles.actionText}>Next ›</Text></Pressable></View>{salarySummaryLoading?<ActivityIndicator color={C.plum}/>:salarySummary?<><Text style={styles.salaryEstimate}>{Number(salarySummary.total_hours_this_month??0).toFixed(1)}h logged · {Number(salarySummary.paid_leave_hours_this_month??0).toFixed(1)}h paid leave</Text>{estimatedEarned(selected,salarySummary,salaryMonth)!==null?<Text style={styles.salaryEstimate}>Estimated earned · {formatRupees(estimatedEarned(selected,salarySummary,salaryMonth)!)}{salaryMonth===`${today().slice(0,7)}-01`?' so far':''}</Text>:null}<Text style={styles.hint}>Estimate uses the current salary rate. Historical salary rate changes are not stored, so past amounts are not finalized payroll.</Text></>:<Text style={styles.hint}>No attendance summary for this month.</Text>}<Pressable onPress={() => { setSalaryType(selected.salary_type ?? 'monthly'); setSalaryRate(selected.salary_rate == null ? '' : String(selected.salary_rate)); setSalaryVisible(true); }} style={styles.outline}><Text style={styles.actionText}>Update rate</Text></Pressable>
        <Text style={styles.sectionTitle}>Standing shift</Text>{shiftsFor(selected.id).length ? <Text style={styles.rowText}>{shiftsFor(selected.id)[0].start_time.slice(0,5)}–{shiftsFor(selected.id)[0].end_time.slice(0,5)} · repeats until changed{shiftsFor(selected.id)[0].notes ? ` · ${shiftsFor(selected.id)[0].notes}` : ''}</Text> : <Text style={styles.hint}>No standing shift assigned.</Text>}
        <Text style={styles.sectionTitle}>Set standing shift</Text><View style={styles.actionRow}><TextInput style={[styles.input,{flex:1}]} value={shiftStart} onChangeText={setShiftStart} placeholder="Start HH:MM" placeholderTextColor={C.muted} /><TextInput style={[styles.input,{flex:1}]} value={shiftEnd} onChangeText={setShiftEnd} placeholder="End HH:MM" placeholderTextColor={C.muted} /></View><TextInput style={styles.input} value={shiftNotes} onChangeText={setShiftNotes} placeholder="Shift note (optional)" placeholderTextColor={C.muted} /><Pressable disabled={saving} onPress={() => void saveShift()} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save shift'}</Text></Pressable>
        <Text style={styles.sectionTitle}>Recent attendance</Text>{attendanceLoading ? <ActivityIndicator color={C.plum} /> : attendance.length ? attendance.map((row) => <View key={row.id} style={styles.attendanceRow}><Pressable onPress={() => openAttendanceEdit(row)} style={{flex:1}}><Text style={styles.rowText}>{new Date(row.punch_in).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'})}</Text><Text style={styles.hint}>{row.punch_out ? `Out ${new Date(row.punch_out).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'})}${row.auto_punched_out ? ' · auto' : ''}` : 'Still on duty'} · Tap to edit</Text></Pressable><Pressable onPress={() => deleteAttendance(row)}><Text style={styles.deleteText}>Delete</Text></Pressable></View>) : <Text style={styles.hint}>No attendance records found.</Text>}
      </>}
    </ScrollView></View></Modal>
    <Modal visible={salaryVisible} transparent animationType="fade" onRequestClose={() => setSalaryVisible(false)}><View style={styles.salaryOverlay}><View style={styles.salaryCard}><Text style={styles.modalTitle}>Salary rate</Text><View style={styles.roleRow}>{(['monthly','hourly'] as const).map((value) => <Pressable key={value} onPress={() => setSalaryType(value)} style={[styles.roleButton, salaryType === value && styles.roleSelected]}><Text style={[styles.roleText, salaryType === value && styles.roleTextSelected]}>{value}</Text></Pressable>)}</View><TextInput style={styles.input} value={salaryRate} onChangeText={setSalaryRate} keyboardType="decimal-pad" placeholder="Rate in INR" placeholderTextColor={C.muted} /><View style={styles.actionRow}><Pressable onPress={() => setSalaryVisible(false)} style={styles.outline}><Text style={styles.actionText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={async () => { const rate = Number(salaryRate); if (!selected || !Number.isFinite(rate) || rate < 0) { setError('Enter a valid non-negative salary rate.'); return; } const result = await action({ action: 'set_salary', employeeId: selected.id, salaryType, salaryRate: rate }); if (result) { setSalaryVisible(false); await load(); } }} style={[styles.primary,{flex:1}]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable></View></View></View></Modal>
    <Modal visible={!!editingAttendance} transparent animationType="fade" onRequestClose={() => setEditingAttendance(null)}><View style={styles.salaryOverlay}><View style={styles.salaryCard}><Text style={styles.modalTitle}>Correct attendance</Text><Text style={styles.hint}>Times use India Standard Time.</Text><TextInput style={styles.input} value={editDate} onChangeText={setEditDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} /><View style={styles.actionRow}><TextInput style={[styles.input,{flex:1}]} value={editIn} onChangeText={setEditIn} placeholder="Punch in HH:MM" placeholderTextColor={C.muted} /><TextInput style={[styles.input,{flex:1}]} value={editOut} onChangeText={setEditOut} placeholder="Punch out or blank" placeholderTextColor={C.muted} /></View><View style={styles.actionRow}><Pressable onPress={() => setEditingAttendance(null)} style={styles.outline}><Text style={styles.actionText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => void saveAttendance()} style={[styles.primary,{flex:1}]}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save correction'}</Text></Pressable></View></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:C.canvas}, header:{paddingTop:8,paddingHorizontal:20,paddingBottom:5,backgroundColor:'transparent',flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, back:{paddingVertical:6},backText:{color:C.plum,fontSize:13,fontWeight:'700'},title:{color:C.ink,fontSize:18,fontWeight:'800'},refresh:{color:C.plum,fontSize:12,fontWeight:'700'},content:{padding:18,paddingBottom:40,maxWidth:600,width:'100%',alignSelf:'center'},caption:{fontSize:9,color:C.plum,fontWeight:'800',letterSpacing:1.1},heading:{fontSize:19,color:C.ink,fontWeight:'800',marginTop:5},subheading:{fontSize:12,color:C.muted,marginTop:5,marginBottom:15},error:{backgroundColor:'#FBE8E2',borderRadius:12,padding:12,marginBottom:12},errorText:{color:C.coral,fontSize:12},addEmployeeButton:{minHeight:46,borderRadius:13,backgroundColor:C.plum,alignItems:'center',justifyContent:'center',marginTop:8},addEmployeeButtonText:{color:'#FFF',fontSize:12,fontWeight:'900'},employeeCard:{flexDirection:'row',alignItems:'center',backgroundColor:C.surface,borderWidth:1,borderColor:C.line,borderRadius:16,padding:13,marginBottom:8},avatar:{width:39,height:39,borderRadius:14,backgroundColor:C.tint,alignItems:'center',justifyContent:'center'},avatarText:{color:C.plum,fontWeight:'800',fontSize:16},employeeInfo:{flex:1,marginLeft:11},nameRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:5},name:{color:C.ink,fontWeight:'800',fontSize:13},status:{fontSize:8,fontWeight:'900',letterSpacing:.6},meta:{fontSize:10,color:C.muted,marginTop:5},chevron:{fontSize:22,color:C.muted,paddingHorizontal:4},addCard:{backgroundColor:C.surface,borderColor:C.line,borderWidth:1,borderRadius:17,padding:15,marginTop:8},cardTitle:{fontSize:15,fontWeight:'800',color:C.ink,marginBottom:10},fieldLabel:{fontSize:10,color:C.muted,fontWeight:'700',marginTop:4,marginBottom:5},input:{backgroundColor:'#FFFDEF',borderWidth:1,borderColor:C.line,borderRadius:11,paddingHorizontal:12,paddingVertical:10,color:C.ink,fontSize:13,marginBottom:8},roleRow:{flexDirection:'row',gap:8,marginVertical:4},roleButton:{flex:1,borderWidth:1,borderColor:C.line,borderRadius:10,padding:10,alignItems:'center'},roleSelected:{backgroundColor:C.tint,borderColor:C.plum},roleText:{color:C.muted,fontWeight:'700',fontSize:12,textTransform:'capitalize'},roleTextSelected:{color:C.plum},primary:{backgroundColor:C.plum,alignItems:'center',justifyContent:'center',borderRadius:11,minHeight:42,marginTop:5},primaryText:{color:'#FFF',fontSize:12,fontWeight:'800'},hint:{color:C.muted,fontSize:10,lineHeight:15,marginTop:6},modalRoot:{flex:1,backgroundColor:C.canvas},modalHeader:{paddingTop:24,paddingHorizontal:20,paddingBottom:15,backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.line,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},modalTitle:{fontSize:22,fontWeight:'800',color:C.ink,marginTop:4},done:{backgroundColor:C.tint,borderRadius:10,paddingVertical:8,paddingHorizontal:13},doneText:{color:C.dark,fontWeight:'800',fontSize:12},modalBody:{padding:18,paddingBottom:40,maxWidth:600,width:'100%',alignSelf:'center'},stats:{flexDirection:'row',justifyContent:'space-around',backgroundColor:C.dark,borderRadius:15,padding:16},stat:{color:'#FFF',fontWeight:'800',fontSize:19},statLabel:{fontSize:10,fontWeight:'600',color:'#DDD1E1'},salaryEstimate:{fontSize:10,color:C.muted,marginTop:7,lineHeight:15},actionRow:{flexDirection:'row',gap:8,marginTop:9},actionButton:{flex:1,backgroundColor:C.tint,borderRadius:11,padding:12,alignItems:'center'},actionText:{fontSize:11,color:C.plum,fontWeight:'800'},removeButton:{backgroundColor:'#FBE8E2'},sectionTitle:{fontSize:14,color:C.ink,fontWeight:'800',marginTop:19,marginBottom:9},rowText:{fontSize:12,color:C.ink,fontWeight:'700'},outline:{borderWidth:1,borderColor:C.line,borderRadius:10,padding:10,alignItems:'center',marginTop:8},shiftRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:11,borderBottomWidth:1,borderColor:C.line},attendanceRow:{flexDirection:'row',alignItems:'center',paddingVertical:10,borderBottomWidth:1,borderColor:C.line,gap:8},deleteText:{fontSize:10,color:C.coral,fontWeight:'800'},salaryOverlay:{flex:1,backgroundColor:'#0007',justifyContent:'center',padding:22},salaryCard:{backgroundColor:C.surface,borderRadius:18,padding:18} });
