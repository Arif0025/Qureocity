import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

type Row = { id: string; kind: string; name: string; parent: string; plan: string; status: string; reviewed_at: string; reviewed_by: string | null };
type RegRow = { id: string; child_name: string | null; registration_type: 'new' | 'renewal' | 'special'; status: string; reviewed_at: string; reviewed_by: string | null; parent_name: string | null; plan_name_snapshot: string | null };
type PartyRow = { id: string; child_name: string; status: string; reviewed_at: string; reviewed_by: string | null; parent_name: string; plan_name: string };
type LeaveRow = { id: string; start_date: string; end_date: string; status: string; reviewed_at: string; reviewed_by: string | null; employees: { name: string } | null };

export default function AdminRequestHistory({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [registrations, parties, leave] = await Promise.all([
      supabase.from('membership_registrations').select('id,child_name,registration_type,status,reviewed_at,reviewed_by,parent_name,plan_name_snapshot').in('status', ['confirmed', 'discarded']).not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(20),
      supabase.from('party_bookings').select('id,child_name,status,reviewed_at,reviewed_by,parent_name,plan_name').in('status', ['confirmed', 'cancelled', 'quoted']).not('reviewed_at', 'is', null).order('reviewed_at', { ascending: false }).limit(20),
      supabase.from('employee_leave_requests').select('id,start_date,end_date,status,reviewed_at,reviewed_by,employees(name)').in('status',['approved','rejected']).not('reviewed_at','is',null).order('reviewed_at',{ascending:false}).limit(20),
    ]);
    if (registrations.error || parties.error || leave.error) setError((registrations.error ?? parties.error ?? leave.error)!.message);
    else {
      const registrationRows = (registrations.data ?? []) as RegRow[];
      const partyRows = (parties.data ?? []) as PartyRow[];
      const leaveRows = (leave.data ?? []) as unknown as LeaveRow[];
      const mapped: Row[] = [
        ...registrationRows.map((row) => ({ id: `registration-${row.id}`, kind: row.registration_type === 'special' ? 'Special day' : row.registration_type === 'renewal' ? 'Renewal' : 'Membership', name: row.child_name ?? 'Existing child', parent: row.parent_name ?? 'Parent unavailable', plan: row.plan_name_snapshot ?? '', status: row.status, reviewed_at: row.reviewed_at, reviewed_by: row.reviewed_by })),
        ...partyRows.map((row) => ({ id: `party-${row.id}`, kind: 'Party', name: row.child_name, parent: row.parent_name, plan: row.plan_name, status: row.status, reviewed_at: row.reviewed_at, reviewed_by: row.reviewed_by })),
        ...leaveRows.map((row) => ({ id: `leave-${row.id}`, kind: 'Staff leave', name: row.employees?.name ?? 'Staff member', parent: `${row.start_date} – ${row.end_date}`, plan: '', status: row.status, reviewed_at: row.reviewed_at, reviewed_by: row.reviewed_by })),
      ].sort((a, b) => Date.parse(b.reviewed_at) - Date.parse(a.reviewed_at)).slice(0, 30);
      setRows(mapped);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <Text onPress={onBack} style={styles.back}>‹ Back</Text><Text style={styles.eyebrow}>ADMIN INBOX</Text><Text accessibilityRole="header" style={styles.title}>Action history</Text><Text style={styles.subtitle}>Recent registration, party, and staff leave decisions.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : rows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No recent decisions yet.</Text></View> : rows.map((row) => <View key={row.id} style={styles.card}>
      <View style={styles.top}><Text style={styles.name}>{row.name}</Text><Text style={[styles.status, row.status === 'confirmed' ? styles.approved : row.status === 'quoted' ? styles.quoted : styles.declined]}>{row.status === 'confirmed' ? 'Approved' : row.status === 'quoted' ? 'Quoted' : 'Declined'}</Text></View>
      <Text style={styles.meta}>{row.kind}{row.plan ? ` · ${row.plan}` : ''}</Text><Text style={styles.meta}>{row.parent}</Text><Text style={styles.date}>Reviewed {new Date(row.reviewed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</Text>
    </View>)}
  </ScrollView></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 }, back: { color: C.plum, fontSize: 12, fontWeight: '800', paddingVertical: 9, marginBottom: 12 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 15 }, card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 8 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, name: { color: C.ink, fontSize: 11, fontWeight: '900', flex: 1 }, status: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, fontSize: 8, fontWeight: '900', textTransform: 'uppercase' }, approved: { color: C.mint, backgroundColor: '#EAF2E4' }, quoted: { color: C.plum, backgroundColor: '#EEE6F1' }, declined: { color: C.coral, backgroundColor: '#FBE8E2' }, meta: { color: C.muted, fontSize: 9, marginTop: 4 }, date: { color: C.muted, fontSize: 8, marginTop: 7 }, loading: { marginTop: 30 }, error: { color: C.coral, fontSize: 10, marginBottom: 10 }, empty: { padding: 20, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, emptyText: { color: C.muted, fontSize: 11, textAlign: 'center' } });
