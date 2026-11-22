import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

type PushRow = { event_type: string; is_test: boolean; person: string; device: string; result: 'sent' | 'failed' | 'gone'; created_at: string };
const RESULT: Record<PushRow['result'], string> = { sent: 'Delivered', failed: 'Failed', gone: 'Device unreachable' };
const EVENT: Record<string, string> = { manual_test: 'Manual test', child_checkin: 'Child check-in', child_checkout: 'Child check-out', session_ending: 'Session ending', session_overdue: 'Session overdue', staff_punch_in: 'Staff punch-in', staff_punch_out: 'Staff punch-out', new_registration: 'New registration', party_registration: 'Party request', employee_leave: 'Employee leave' };
const PAGE_SIZE = 10;

export default function AdminPushHistory({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<PushRow[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (nextLimit = PAGE_SIZE) => {
    setLoading(true); setError(null);
    const { data, error: queryError } = await supabase.rpc('admin_recent_push_sends', { p_limit: nextLimit });
    if (queryError) setError(`${queryError.message}${queryError.code ? ` (${queryError.code})` : ''}`);
    else {
      const list = (data as PushRow[] | null) ?? [];
      setRows(list); setHasMore(list.length === nextLimit); setLimit(nextLimit);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Notifications</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh push delivery history" onPress={() => void load(limit)} style={styles.refresh}><Text style={styles.refreshText}>↻</Text></Pressable></View>
    <Text style={styles.eyebrow}>NOTIFICATION OPERATIONS</Text><Text accessibilityRole="header" style={styles.title}>Push delivery history</Text><Text style={styles.subtitle}>Recent attempts, recipient device, and delivery result. Message content and tokens are not shown.</Text>
    {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Couldn’t load delivery history</Text><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load(limit)}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}
    {loading && rows.length === 0 ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : rows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>Nothing has been sent yet.</Text></View> : rows.map((row, index) => <View key={`${row.created_at}-${index}`} style={styles.card}>
      <View style={styles.top}><Text style={styles.event}>{EVENT[row.event_type] ?? row.event_type}{row.is_test ? ' · Test' : ''}</Text><Text style={[styles.result, row.result === 'sent' ? styles.sent : row.result === 'failed' ? styles.failed : styles.gone]}>{RESULT[row.result] ?? row.result}</Text></View>
      <Text style={styles.meta}>{row.person} · {row.device}</Text><Text style={styles.date}>{new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} IST</Text>
    </View>)}
    {hasMore ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load(limit + PAGE_SIZE)} style={styles.more}><Text style={styles.moreText}>{loading ? 'Loading…' : 'Load 10 more'}</Text></Pressable> : null}
  </ScrollView></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, back: { minHeight: 40, justifyContent: 'center' }, backText: { color: C.plum, fontSize: 12, fontWeight: '800' }, refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, refreshText: { color: C.plum, fontSize: 24 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginBottom: 8 }, top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, event: { color: C.ink, fontSize: 11, fontWeight: '900', flex: 1 }, result: { fontSize: 8, fontWeight: '900', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }, sent: { color: C.mint, backgroundColor: '#EAF2E4' }, failed: { color: C.coral, backgroundColor: '#FBE8E2' }, gone: { color: C.muted, backgroundColor: '#F1EFF0' }, meta: { color: C.muted, fontSize: 9, marginTop: 5 }, date: { color: C.muted, fontSize: 8, marginTop: 5 }, loading: { marginTop: 30 }, errorBox: { backgroundColor: '#FBE8E2', borderWidth: 1, borderColor: '#EDC5B9', borderRadius: 12, padding: 11 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 9, marginTop: 4 }, retry: { color: C.plum, fontSize: 10, fontWeight: '900', marginTop: 6 }, empty: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 20 }, emptyText: { color: C.muted, fontSize: 10, textAlign: 'center' }, more: { minHeight: 42, borderRadius: 11, backgroundColor: '#EEE8F0', alignItems: 'center', justifyContent: 'center', marginTop: 3 }, moreText: { color: C.plum, fontSize: 10, fontWeight: '900' } });
