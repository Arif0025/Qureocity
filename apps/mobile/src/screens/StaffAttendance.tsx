import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

type Shift = { start_time: string; end_time: string; notes: string | null };
type Log = { id: string; punch_in: string; punch_out: string | null; auto_punched_out: boolean };
type LeaveRequest = { id: string; start_date: string; end_date: string; reason: string; status: 'pending' | 'approved' | 'rejected'; paid_dates: string[]; review_note: string | null; created_at: string };
type Summary = { actual_working_days: number; total_hours_this_month: number; working_days_this_month: number };

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const istDay = (value: string) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const timeOfDay = (value: string) => { const [h, m] = value.split(':'); const hour = Number(h); return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`; };

function hasOpenWorkday(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return false;
  const day = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (day <= last) {
    if (day.getUTCDay() !== 2) return true;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return false;
}

export default function StaffAttendance({ onBack }: { onBack: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [shift, setShift] = useState<Shift | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leaveRows, setLeaveRows] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [punchBusy, setPunchBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveStart, setLeaveStart] = useState(todayIST());
  const [leaveEnd, setLeaveEnd] = useState(todayIST());
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(`${todayIST().slice(0,7)}-01`);
  const [calendarLogs, setCalendarLogs] = useState<Log[]>([]);
  const [calendarSummary, setCalendarSummary] = useState<Summary | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const calendarRequest = useRef(0);

  const openLog = useMemo(() => logs.find((log) => !log.punch_out) ?? null, [logs]);
  const requestHasWorkday = hasOpenWorkday(leaveStart, leaveEnd);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true); else setLoading(true);
    setError('');
    const current = todayIST();
    const monthStart = `${current.slice(0, 7)}-01`;
    calendarRequest.current += 1;
    setCalendarMonth(monthStart); setSelectedDay(null); setCalendarLoading(false);
    const [shiftResult, logResult, summaryResult, leaveResult] = await Promise.all([
      supabase.from('shifts').select('start_time,end_time,notes').maybeSingle(),
      supabase.from('attendance_logs').select('id,punch_in,punch_out,auto_punched_out').order('punch_in', { ascending: false }).limit(45),
      supabase.rpc('admin_staff_attendance_summary', { p_month_start: monthStart }),
      supabase.rpc('employee_leave_overview'),
    ]);
    const failed = shiftResult.error ?? logResult.error ?? summaryResult.error ?? leaveResult.error;
    if (failed) setError(failed.message);
    if (!shiftResult.error) setShift((shiftResult.data as Shift | null) ?? null);
    if (!logResult.error) {
      const nextLogs = (logResult.data as Log[] | null) ?? [];
      setLogs(nextLogs);
      setCalendarLogs(nextLogs.filter((row) => istDay(row.punch_in).startsWith(current.slice(0,7))));
    }
    if (!summaryResult.error) {
      const nextSummary = ((summaryResult.data as Summary[] | null) ?? [])[0] ?? null;
      setSummary(nextSummary); setCalendarSummary(nextSummary);
    }
    if (!leaveResult.error) setLeaveRows((leaveResult.data as LeaveRequest[] | null) ?? []);
    setLoading(false); setRefreshing(false);
  }, []);

  const loadCalendarMonth = async (monthStart: string) => {
    const requestId = ++calendarRequest.current;
    setCalendarMonth(monthStart); setSelectedDay(null); setCalendarLoading(true);
    const [year, month] = monthStart.split('-').map(Number);
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0,10);
    const [logResult, summaryResult] = await Promise.all([
      supabase.from('attendance_logs').select('id,punch_in,punch_out,auto_punched_out')
        .gte('punch_in', `${monthStart}T00:00:00+05:30`).lt('punch_in', `${nextMonth}T00:00:00+05:30`).order('punch_in',{ascending:true}).limit(100),
      supabase.rpc('admin_staff_attendance_summary', { p_month_start: monthStart }),
    ]);
    if (requestId !== calendarRequest.current) return;
    if (logResult.error || summaryResult.error) setError((logResult.error ?? summaryResult.error)!.message);
    else { setCalendarLogs((logResult.data ?? []) as Log[]); setCalendarSummary(((summaryResult.data as Summary[] | null) ?? [])[0] ?? null); }
    setCalendarLoading(false);
  };
  const monthDays = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const count = new Date(Date.UTC(year,month,0)).getUTCDate();
    const offset = new Date(Date.UTC(year,month-1,1)).getUTCDay();
    return [...Array(offset).fill(null), ...Array.from({length:count},(_,i)=>`${calendarMonth.slice(0,7)}-${String(i+1).padStart(2,'0')}`)];
  }, [calendarMonth]);
  const changeCalendarMonth = (delta: number) => {
    const [year,month]=calendarMonth.split('-').map(Number);
    const next=new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,10);
    if(next<=`${todayIST().slice(0,7)}-01`) void loadCalendarMonth(next);
  };

  useEffect(() => { void load(); }, [load]);

  const submitPunch = async () => {
    if (!scannedValue) return;
    setPunchBusy(true); setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('mobile-employee-punch', { body: { value: scannedValue } });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      setScannerOpen(false); setScannedValue(null);
      Alert.alert(data?.action === 'in' ? 'Shift started' : 'Shift ended', `Recorded at ${timeLabel(data?.at ?? new Date().toISOString())}.`);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record your punch. Please rescan the desk QR code.');
      setScannedValue(null);
    } finally { setPunchBusy(false); }
  };

  const submitLeave = async () => {
    if (!requestHasWorkday) { setError('Choose a range that includes an open workday. The venue is closed on Tuesdays.'); return; }
    setLeaveBusy(true); setError('');
    const { error: submitError } = await supabase.rpc('employee_submit_leave_request', { p_start_date: leaveStart, p_end_date: leaveEnd, p_reason: leaveReason });
    setLeaveBusy(false);
    if (submitError) { setError(submitError.message); return; }
    setLeaveOpen(false); setLeaveReason('');
    Alert.alert('Request sent', 'Your leave request has been sent to an administrator.');
    await load(true);
  };

  return <View style={styles.root}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack}><Text style={styles.back}>‹  Home</Text></Pressable><Text style={styles.headerTitle}>Attendance</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh attendance" onPress={() => void load(true)}><Text style={styles.refresh}>{refreshing ? '…' : '↻'}</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>YOUR SHIFT</Text><Text accessibilityRole="header" style={styles.title}>Attendance & leave</Text><Text style={styles.subtitle}>Your shift, punch history and leave requests.</Text>
      {error ? <Pressable accessibilityRole="alert" onPress={() => void load(true)} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {loading ? <ActivityIndicator color={C.plum} size="large" style={{ margin: 30 }} /> : <>
        <View style={styles.shiftCard}>
          <View style={styles.shiftTop}><View style={{ flex: 1 }}><Text style={styles.shiftLabel}>{shift ? 'ASSIGNED SHIFT' : 'SHIFT NOT ASSIGNED'}</Text><Text style={styles.shiftTime}>{shift ? `${timeOfDay(shift.start_time)} – ${timeOfDay(shift.end_time)}` : 'Check with an administrator'}</Text></View><View style={[styles.dutyPill, openLog ? styles.dutyOn : styles.dutyOff]}><Text style={[styles.dutyText, openLog ? styles.dutyTextOn : styles.dutyTextOff]}>{openLog ? 'ON DUTY' : 'OFF DUTY'}</Text></View></View>
          <Text style={styles.shiftNote}>{shift?.notes || 'Regular shift on venue open days · closed Tuesdays.'}</Text>
          {openLog ? <Text style={styles.punchTime}>Punched in at {timeLabel(openLog.punch_in)}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => { setScannedValue(null); setScannerOpen(true); }} style={styles.primary}><Text style={styles.primaryText}>{openLog ? 'Scan desk QR to punch out' : 'Scan desk QR to punch in'}</Text></Pressable>
          <Text style={styles.hint}>Scan the current code displayed at the front desk. Dynamic codes expire quickly.</Text>
        </View>

        <View style={styles.statsRow}><Stat value={summary?.actual_working_days ?? 0} label={`of ${summary?.working_days_this_month ?? 0} workdays`} /><Stat value={Number(summary?.total_hours_this_month ?? 0).toFixed(1)} label="hours this month" /></View>

        <View style={styles.card}><View style={styles.cardHeader}><View style={{flex:1}}><Text style={styles.cardTitle}>Attendance calendar</Text><Text style={styles.cardSub}>Monthly punch history</Text></View><View style={styles.monthNav}><Pressable accessibilityLabel="Previous month" onPress={()=>changeCalendarMonth(-1)} style={styles.monthButton}><Text style={styles.monthArrow}>‹</Text></Pressable><Text style={styles.monthTitle}>{new Date(`${calendarMonth}T12:00:00Z`).toLocaleDateString('en-IN',{month:'short',year:'numeric',timeZone:'UTC'})}</Text><Pressable accessibilityLabel="Next month" disabled={calendarMonth===`${todayIST().slice(0,7)}-01`} onPress={()=>changeCalendarMonth(1)} style={[styles.monthButton,calendarMonth===`${todayIST().slice(0,7)}-01`&&styles.monthDisabled]}><Text style={styles.monthArrow}>›</Text></Pressable></View></View><Text style={styles.calendarSummary}>{calendarSummary?.actual_working_days??0} days · {Number(calendarSummary?.total_hours_this_month??0).toFixed(1)} hours</Text><View style={styles.calendarGrid}>{['S','M','T','W','T','F','S'].map((day,index)=><Text key={`${day}-${index}`} style={styles.weekday}>{day}</Text>)}{monthDays.map((day,index)=>{if(!day)return <View key={`blank-${index}`} style={styles.dayCell}/>;const hasLog=calendarLogs.some(log=>istDay(log.punch_in)===day);const closed=new Date(`${day}T00:00:00Z`).getUTCDay()===2;return <Pressable key={day} onPress={()=>setSelectedDay(day)} style={[styles.dayCell,closed&&styles.dayClosed,hasLog&&styles.dayPresent,selectedDay===day&&styles.daySelected]}><Text style={[styles.dayText,hasLog&&styles.dayTextPresent,selectedDay===day&&styles.dayTextSelected]}>{Number(day.slice(-2))}</Text></Pressable>;})}</View>{calendarLoading?<ActivityIndicator color={C.plum} style={{marginTop:10}}/>:selectedDay?<View style={styles.selectedDayBox}><Text style={styles.selectedDayTitle}>{dateLabel(selectedDay)}</Text>{calendarLogs.filter(log=>istDay(log.punch_in)===selectedDay).length?calendarLogs.filter(log=>istDay(log.punch_in)===selectedDay).map(log=><Text key={log.id} style={styles.selectedDayText}>{timeLabel(log.punch_in)} – {log.punch_out?timeLabel(log.punch_out):'In progress'}{log.auto_punched_out?' · Auto punch-out':''}</Text>):<Text style={styles.selectedDayText}>No punch recorded.</Text>}</View>:<Text style={styles.calendarHint}>Tap a day to see its punch record. Tuesdays are venue closed days.</Text>}</View>

        <View style={styles.card}><Text style={styles.cardTitle}>Recent punches</Text>{logs.length ? logs.slice(0, 12).map((log) => <View key={log.id} style={styles.logRow}><View style={{ flex: 1 }}><Text style={styles.logDate}>{dateLabel(log.punch_in)}</Text><Text style={styles.logTime}>{timeLabel(log.punch_in)} – {log.punch_out ? timeLabel(log.punch_out) : 'In progress'}</Text></View>{log.auto_punched_out ? <Text style={styles.autoTag}>AUTO</Text> : null}</View>) : <Text style={styles.empty}>No attendance records yet.</Text>}</View>

        <View style={styles.card}><View style={styles.cardHeader}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Leave requests</Text><Text style={styles.cardSub}>Request time off and follow its status.</Text></View><Pressable accessibilityRole="button" onPress={() => setLeaveOpen(true)} style={styles.secondary}><Text style={styles.secondaryText}>Request leave</Text></Pressable></View>
          {leaveRows.length ? leaveRows.slice(0, 8).map((row) => <View key={row.id} style={styles.leaveRow}><View style={{ flex: 1 }}><Text style={styles.logDate}>{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</Text>{row.reason ? <Text style={styles.logTime}>{row.reason}</Text> : null}{row.review_note ? <Text style={styles.reviewNote}>Admin note: {row.review_note}</Text> : null}</View><Text style={[styles.status, row.status === 'approved' ? styles.approved : row.status === 'rejected' ? styles.rejected : styles.pending]}>{row.status === 'rejected' ? 'Declined' : row.status}</Text></View>) : <Text style={styles.empty}>No leave requests yet.</Text>}
        </View>
      </>}
    </ScrollView>

    <Modal visible={scannerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setScannerOpen(false); setScannedValue(null); }}>
      <View style={styles.modalRoot}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Scan front-desk QR</Text><Pressable onPress={() => { setScannerOpen(false); setScannedValue(null); }}><Text style={styles.close}>Close</Text></Pressable></View>
        {!permission?.granted ? <View style={styles.permissionBox}><Text style={styles.modalCopy}>Camera access is used only to scan the venue’s shift QR code.</Text><Pressable onPress={() => void requestPermission()} style={styles.primary}><Text style={styles.primaryText}>Allow camera</Text></Pressable></View> : scannedValue ? <View style={styles.permissionBox}><Text style={styles.scanOk}>QR code scanned</Text><Text style={styles.modalCopy}>Confirm to record your {openLog ? 'punch-out' : 'punch-in'}.</Text><Pressable disabled={punchBusy} onPress={() => void submitPunch()} style={[styles.primary, punchBusy && styles.disabled]}>{punchBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Confirm punch</Text>}</Pressable><Pressable disabled={punchBusy} onPress={() => setScannedValue(null)} style={styles.rescan}><Text style={styles.secondaryText}>Scan again</Text></Pressable></View> : <View style={styles.cameraWrap}><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => setScannedValue(data)} /><View pointerEvents="none" style={styles.cameraFrame} /><Text style={styles.cameraHint}>Point your camera at the desk QR code</Text></View>}
      </View>
    </Modal>

    <Modal visible={leaveOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setLeaveOpen(false)}>
      <View style={styles.modalRoot}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Request leave</Text><Pressable onPress={() => setLeaveOpen(false)}><Text style={styles.close}>Close</Text></Pressable></View><ScrollView contentContainerStyle={styles.leaveForm}><Text style={styles.modalCopy}>Use YYYY-MM-DD. Leave must include an open workday; the venue is closed on Tuesdays.</Text><Text style={styles.fieldLabel}>From</Text><TextInput accessibilityLabel="Leave start date" value={leaveStart} onChangeText={setLeaveStart} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={styles.input} /><Text style={styles.fieldLabel}>Through</Text><TextInput accessibilityLabel="Leave end date" value={leaveEnd} onChangeText={setLeaveEnd} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" style={styles.input} /><Text style={styles.fieldLabel}>Reason (optional)</Text><TextInput accessibilityLabel="Leave reason" value={leaveReason} onChangeText={setLeaveReason} maxLength={1000} multiline style={[styles.input, styles.reasonInput]} /><Text style={styles.modalCopy}>{requestHasWorkday ? '' : 'Select valid dates including an open workday.'}</Text><Pressable disabled={leaveBusy || !requestHasWorkday} onPress={() => void submitLeave()} style={[styles.primary, (leaveBusy || !requestHasWorkday) && styles.disabled]}>{leaveBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit request</Text>}</Pressable></ScrollView></View>
    </Modal>
  </View>;
}

function Stat({ value, label }: { value: string | number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas }, header: { minHeight: 62, paddingHorizontal: 18, paddingTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.line }, back: { color: C.plum, fontSize: 12, fontWeight: '800' }, headerTitle: { color: C.ink, fontSize: 16, fontWeight: '900' }, refresh: { color: C.plum, fontSize: 22, fontWeight: '700', width: 36, textAlign: 'right' }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 17, paddingBottom: 36 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4, marginBottom: 13 }, error: { padding: 10, borderRadius: 11, backgroundColor: '#FBE8E2', marginBottom: 10 }, errorText: { color: C.coral, fontSize: 10, lineHeight: 15 }, shiftCard: { padding: 15, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17 }, shiftTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, shiftLabel: { color: C.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, shiftTime: { color: C.ink, fontSize: 18, fontWeight: '900', marginTop: 5 }, dutyPill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, dutyOn: { backgroundColor: '#EAF2E4' }, dutyOff: { backgroundColor: '#F1EFF0' }, dutyText: { fontSize: 8, fontWeight: '900' }, dutyTextOn: { color: C.mint }, dutyTextOff: { color: C.muted }, shiftNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 8 }, punchTime: { color: C.plumDark, fontSize: 10, fontWeight: '800', marginTop: 8 }, primary: { minHeight: 45, marginTop: 13, borderRadius: 12, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, primaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, hint: { color: C.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 8 }, statsRow: { flexDirection: 'row', gap: 8, marginTop: 9 }, stat: { flex: 1, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 12, alignItems: 'center' }, statValue: { color: C.ink, fontSize: 21, fontWeight: '900' }, statLabel: { color: C.muted, fontSize: 9, marginTop: 2, textAlign: 'center' }, card: { padding: 13, marginTop: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 15 }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, cardTitle: { color: C.ink, fontSize: 13, fontWeight: '900' }, cardSub: { color: C.muted, fontSize: 9, marginTop: 3 }, monthNav:{flexDirection:'row',alignItems:'center',gap:5},monthButton:{width:29,height:29,alignItems:'center',justifyContent:'center',borderRadius:8,backgroundColor:C.plumTint},monthDisabled:{opacity:.35},monthArrow:{color:C.plum,fontSize:20,fontWeight:'800'},monthTitle:{minWidth:76,textAlign:'center',color:C.ink,fontSize:10,fontWeight:'900'},calendarSummary:{color:C.muted,fontSize:9,marginTop:10,marginBottom:7},calendarGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start'},weekday:{width:'14.2857%',textAlign:'center',color:C.muted,fontSize:8,fontWeight:'900',paddingVertical:5},dayCell:{width:'14.2857%',height:34,alignItems:'center',justifyContent:'center',borderRadius:9,marginBottom:2},dayClosed:{backgroundColor:'#F1EFF0'},dayPresent:{backgroundColor:'#EAF2E4'},daySelected:{backgroundColor:C.plum},dayText:{color:C.ink,fontSize:10,fontWeight:'700'},dayTextPresent:{color:C.mint},dayTextSelected:{color:'#FFF'},selectedDayBox:{marginTop:8,padding:10,borderRadius:10,backgroundColor:'#F8F5F9'},selectedDayTitle:{color:C.ink,fontSize:10,fontWeight:'900'},selectedDayText:{color:C.muted,fontSize:9,marginTop:4},calendarHint:{color:C.muted,fontSize:8,marginTop:7}, logRow: { minHeight: 49, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: C.line, marginTop: 8, paddingTop: 7 }, leaveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: C.line, marginTop: 8, paddingTop: 9 }, logDate: { color: C.ink, fontSize: 10, fontWeight: '800' }, logTime: { color: C.muted, fontSize: 9, marginTop: 3 }, autoTag: { color: C.gold, backgroundColor: C.goldSoft, overflow: 'hidden', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4, fontSize: 7, fontWeight: '900' }, status: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, textTransform: 'capitalize', fontSize: 8, fontWeight: '900' }, approved: { backgroundColor: '#EAF2E4', color: C.mint }, rejected: { backgroundColor: '#FBE8E2', color: C.coral }, pending: { backgroundColor: '#FBF3E3', color: C.gold }, secondary: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: C.plumTint, borderRadius: 9 }, secondaryText: { color: C.plumDark, fontSize: 9, fontWeight: '900' }, empty: { color: C.muted, fontSize: 10, paddingVertical: 12, textAlign: 'center' }, reviewNote: { color: C.plum, fontSize: 9, marginTop: 3 }, modalRoot: { flex: 1, backgroundColor: C.canvas }, modalHeader: { minHeight: 62, paddingHorizontal: 18, paddingTop: 8, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.line, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.ink, fontSize: 16, fontWeight: '900' }, close: { color: C.plum, fontSize: 11, fontWeight: '900' }, cameraWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 }, camera: { width: '100%', maxWidth: 440, height: 360, overflow: 'hidden', borderRadius: 18 }, cameraFrame: { position: 'absolute', width: 220, height: 220, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: 24, top: '50%', marginTop: -135, alignSelf: 'center' }, cameraHint: { color: C.muted, fontSize: 11, marginTop: 18, textAlign: 'center' }, permissionBox: { flex: 1, padding: 24, justifyContent: 'center' }, modalCopy: { color: C.muted, fontSize: 11, lineHeight: 17, marginBottom: 10 }, scanOk: { color: C.mint, fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 8 }, rescan: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 7 }, disabled: { opacity: 0.5 }, leaveForm: { padding: 18, paddingBottom: 40 }, fieldLabel: { color: C.ink, fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 5 }, input: { minHeight: 44, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink, fontSize: 12 }, reasonInput: { minHeight: 90, paddingTop: 10, textAlignVertical: 'top' },
});
