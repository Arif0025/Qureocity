import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

type LeaveRow = { id: string; employee_id: string; employee_name: string; start_date: string; end_date: string; reason: string; status: 'pending' | 'approved' | 'rejected'; paid_dates: string[]; review_note: string | null; created_at: string; scheduled_shift_hours: number | null; salary_type: 'monthly' | 'hourly' | null };
type PaidCount = { employee_id: string; paid_days: number };

function venueDays(start: string, end: string) {
  const days: string[] = [];
  const cursor = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  while (cursor <= last && days.length < 92) {
    if (cursor.getUTCDay() !== 2) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
function dateLabel(value: string) { return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

export default function AdminLeaveRequests({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [paidCounts, setPaidCounts] = useState<Record<string, number>>({});
  const [paidDates, setPaidDates] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [overview, countResult] = await Promise.all([
      supabase.rpc('admin_leave_overview'),
      supabase.rpc('admin_paid_leave_days_this_month'),
    ]);
    if (overview.error || countResult.error) setError((overview.error ?? countResult.error)!.message);
    else {
      const data = overview.data as { requests?: LeaveRow[] } | null;
      setRows(data?.requests ?? []);
      const counts: Record<string, number> = {};
      for (const row of (countResult.data ?? []) as PaidCount[]) counts[row.employee_id] = Number(row.paid_days);
      setPaidCounts(counts);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = (row: LeaveRow, decision: 'approved' | 'rejected') => {
    Alert.alert(decision === 'approved' ? 'Approve leave?' : 'Decline leave?', `${row.employee_name} · ${dateLabel(row.start_date)} – ${dateLabel(row.end_date)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: decision === 'approved' ? 'Approve' : 'Decline', style: decision === 'approved' ? 'default' : 'destructive', onPress: () => { void applyReview(row, decision); } },
    ]);
  };
  const applyReview = async (row: LeaveRow, decision: 'approved' | 'rejected') => {
    setBusyId(row.id); setError(null); setNotice(null);
    const { error: actionError } = await supabase.rpc('admin_review_leave_request', {
      p_request_id: row.id, p_decision: decision,
      p_paid_dates: decision === 'approved' ? paidDates[row.id] ?? [] : [],
      p_review_note: notes[row.id] ?? '',
    });
    setBusyId(null);
    if (actionError) setError(`${actionError.message}${actionError.code ? ` (${actionError.code})` : ''}`);
    else { setNotice(decision === 'approved' ? 'Leave approved.' : 'Leave declined.'); await load(); }
  };

  const pending = rows.filter((row) => row.status === 'pending');
  const reviewed = rows.filter((row) => row.status !== 'pending');
  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh leave requests" onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>↻</Text></Pressable></View>
    <Text style={styles.eyebrow}>TEAM OPERATIONS</Text><Text accessibilityRole="header" style={styles.title}>Staff leave</Text><Text style={styles.subtitle}>Review requests and select which days count as paid leave.</Text>
    {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Couldn’t complete that action</Text><Text style={styles.errorText}>{error}</Text></View> : null}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {loading ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : pending.length === 0 && reviewed.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No leave requests</Text><Text style={styles.emptyText}>New staff requests will appear here.</Text></View> : <>
      <Text style={styles.sectionTitle}>Pending · {pending.length}</Text>
      {pending.map((row) => {
        const days = venueDays(row.start_date, row.end_date);
        const selected = paidDates[row.id] ?? [];
        return <View key={row.id} style={styles.card}>
          <Text style={styles.employeeName}>{row.employee_name}</Text><Text style={styles.dates}>{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</Text>
          <Text style={styles.paidCount}>{paidCounts[row.employee_id] ?? 0} paid leave days this month</Text>
          {row.reason ? <Text style={styles.reason}>{row.reason}</Text> : null}
          <Text style={styles.label}>Paid dates · select any days to pay</Text>
          {days.length === 0 ? <Text style={styles.help}>This request only includes Tuesdays, when the venue is closed.</Text> : <View style={styles.dayList}>{days.map((day) => {
            const checked = selected.includes(day);
            return <Pressable key={day} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setPaidDates((current) => ({ ...current, [row.id]: checked ? selected.filter((item) => item !== day) : [...selected, day] }))} style={[styles.dayChip, checked && styles.dayChipSelected]}>
              <View style={[styles.checkbox, checked && styles.checkboxSelected]}>{checked ? <Text style={styles.checkmark}>✓</Text> : null}</View><Text style={[styles.dayText, checked && styles.dayTextSelected]}>{dateLabel(day)}</Text>
            </Pressable>;
          })}</View>}
          <Text style={styles.help}>{row.salary_type === 'hourly' ? row.scheduled_shift_hours == null ? 'No shift is assigned, so paid dates will not add hourly pay.' : `Paid dates credit ${row.scheduled_shift_hours} scheduled hours per day.` : 'Paid dates count as worked days for the salary estimate.'} Unselected dates are unpaid.</Text>
          <TextInput accessibilityLabel="Optional note to employee" maxLength={1000} multiline onChangeText={(value) => setNotes((current) => ({ ...current, [row.id]: value }))} placeholder="Note to employee (optional)" placeholderTextColor="#8B8373" value={notes[row.id] ?? ''} style={styles.noteInput} />
          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busyId === row.id} onPress={() => review(row, 'rejected')} style={[styles.action, styles.rejectAction, busyId === row.id && styles.disabled]}><Text style={styles.rejectText}>Decline</Text></Pressable><Pressable accessibilityRole="button" disabled={busyId === row.id} onPress={() => review(row, 'approved')} style={[styles.action, styles.approveAction, busyId === row.id && styles.disabled]}>{busyId === row.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveText}>Approve</Text>}</Pressable></View>
        </View>;
      })}
      {reviewed.length ? <><Text style={[styles.sectionTitle, styles.reviewedTitle]}>Recent decisions</Text>{reviewed.map((row) => <View key={row.id} style={styles.reviewedCard}><View style={styles.reviewedLine}><Text style={styles.employeeName}>{row.employee_name}</Text><Text style={[styles.status, row.status === 'approved' ? styles.approvedStatus : styles.rejectedStatus]}>{row.status === 'approved' ? 'Approved' : 'Declined'}</Text></View><Text style={styles.dates}>{dateLabel(row.start_date)} – {dateLabel(row.end_date)}</Text><Text style={styles.help}>{row.status === 'approved' ? row.paid_dates?.length ? `Paid: ${row.paid_dates.map(dateLabel).join(', ')}` : 'Unpaid leave' : 'Request declined'}</Text>{row.review_note ? <Text style={styles.help}>Note: {row.review_note}</Text> : null}</View>)}</> : null}
    </>}
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, back: { minHeight: 40, justifyContent: 'center' }, backText: { color: C.plum, fontSize: 12, fontWeight: '800' }, refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' }, refreshText: { color: C.plum, fontSize: 24 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 17 }, sectionTitle: { color: C.ink, fontSize: 14, fontWeight: '900', marginVertical: 10 }, card: { padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#E8DDBF', backgroundColor: C.surface, marginBottom: 10 }, employeeName: { color: C.ink, fontSize: 12, fontWeight: '900' }, dates: { color: C.muted, fontSize: 10, marginTop: 4 }, paidCount: { color: C.gold, fontSize: 9, fontWeight: '800', marginTop: 6 }, reason: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 8 }, label: { color: C.ink, fontSize: 10, fontWeight: '800', marginTop: 13, marginBottom: 7 }, dayList: { gap: 6 }, dayChip: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 9 }, dayChipSelected: { borderColor: '#A5CEBC', backgroundColor: '#EEF7F3' }, checkbox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: '#C9BECF', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: C.mint, borderColor: C.mint }, checkmark: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' }, dayText: { color: C.muted, fontSize: 10 }, dayTextSelected: { color: C.mint, fontWeight: '800' }, help: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 7 }, noteInput: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 8, color: C.ink, fontSize: 11, marginTop: 10, textAlignVertical: 'top' }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 11 }, action: { minHeight: 42, minWidth: 94, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 14 }, rejectAction: { borderWidth: 1, borderColor: '#E8C9C6' }, rejectText: { color: C.coral, fontSize: 11, fontWeight: '800' }, approveAction: { backgroundColor: C.mint }, approveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, disabled: { opacity: 0.55 }, reviewedTitle: { marginTop: 18 }, reviewedCard: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, marginBottom: 8 }, reviewedLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, status: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }, approvedStatus: { color: C.mint, backgroundColor: '#EAF2E4' }, rejectedStatus: { color: C.coral, backgroundColor: '#FBE8E2' }, errorBox: { borderWidth: 1, borderColor: '#EDC5B9', backgroundColor: '#FBE8E2', borderRadius: 12, padding: 11, marginBottom: 10 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 10, marginTop: 4 }, notice: { color: C.mint, fontSize: 11, fontWeight: '800', marginBottom: 8 }, loading: { marginTop: 32 }, empty: { padding: 24, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' }, emptyTitle: { color: C.ink, fontSize: 13, fontWeight: '800' }, emptyText: { color: C.muted, fontSize: 10, marginTop: 5 },
});
