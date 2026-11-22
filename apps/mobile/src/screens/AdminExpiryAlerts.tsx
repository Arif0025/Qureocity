import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import { openCustomerMessageDraft } from '../integrations/customerMessaging';

type ExpiryStatus = 'expiring_soon' | 'expired';
type ExpiryRow = { child_id: string; child_name: string; parent_name: string; phone: string | null; secondary_phone: string | null; plan_name: string; expires_on: string; days_remaining: number; date_of_birth: string };
const PAGE_SIZE = 30;
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminExpiryAlerts({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<ExpiryStatus>('expiring_soon');
  const [counts, setCounts] = useState({ expiring_soon: 0, expired: 0 });
  const [rows, setRows] = useState<ExpiryRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true);
    const { data, error: countError } = await supabase.rpc('admin_membership_expiry_alert_counts');
    if (countError) setError(`${countError.message}${countError.code ? ` (${countError.code})` : ''}`);
    else {
      const row = (Array.isArray(data) ? data[0] : data) as { expiring_soon?: number; expired?: number } | null;
      setCounts({ expiring_soon: Number(row?.expiring_soon ?? 0), expired: Number(row?.expired ?? 0) });
    }
    setLoadingCounts(false);
  }, []);
  const loadPage = useCallback(async (nextStatus: ExpiryStatus, nextOffset = 0, append = false) => {
    setLoading(true); setError(null);
    const { data, error: queryError } = await supabase.rpc('admin_membership_expiry_alerts', { p_status: nextStatus, p_limit: PAGE_SIZE, p_offset: nextOffset });
    if (queryError) setError(`${queryError.message}${queryError.code ? ` (${queryError.code})` : ''}`);
    else {
      const page = (data as ExpiryRow[] | null) ?? [];
      setRows((current) => append ? [...current, ...page] : page);
      setOffset(nextOffset + page.length);
      setHasMore(page.length === PAGE_SIZE);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void loadCounts(); }, [loadCounts]);
  useEffect(() => { setRows([]); setOffset(0); void loadPage(status); }, [loadPage, status]);

  const openMessageDraft = (row: ExpiryRow) => {
    const phone = row.phone || row.secondary_phone;
    if (!phone) { setError('There is no customer phone number for this membership.'); return; }
    const expiryDate = dateLabel(row.expires_on);
    const message = `Hi ${row.parent_name}! Just a heads up that ${row.child_name}'s membership at QureoCity expires on ${expiryDate}. Renew anytime at the front desk to keep the fun going!`;
    Alert.alert('Open WhatsApp draft?', 'WhatsApp will open with this message ready to review. It will not be sent automatically.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open WhatsApp', onPress: () => { void openCustomerMessageDraft({ channel: 'whatsapp', phone, message }).catch(() => setError('WhatsApp could not be opened on this device.')); } },
    ]);
  };

  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh expiry alerts" onPress={() => { void loadCounts(); void loadPage(status); }} style={styles.refresh}><Text style={styles.refreshText}>↻</Text></Pressable></View>
    <Text style={styles.eyebrow}>MEMBERSHIPS</Text><Text accessibilityRole="header" style={styles.title}>Expiry alerts</Text><Text style={styles.subtitle}>A paged list of expired memberships and those ending in the next 7 days.</Text>
    <View style={styles.filters}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: status === 'expiring_soon' }} onPress={() => setStatus('expiring_soon')} style={[styles.filter, status === 'expiring_soon' && styles.expiringActive]}><Text style={[styles.filterText, status === 'expiring_soon' && styles.activeText]}>Expiring · 7 days{!loadingCounts ? ` · ${counts.expiring_soon}` : ''}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: status === 'expired' }} onPress={() => setStatus('expired')} style={[styles.filter, status === 'expired' && styles.expiredActive]}><Text style={[styles.filterText, status === 'expired' && styles.activeText]}>Expired{!loadingCounts ? ` · ${counts.expired}` : ''}</Text></Pressable>
    </View>
    {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Couldn’t load membership alerts</Text><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void loadPage(status)}><Text style={styles.retry}>Retry</Text></Pressable></View> : null}
    {loading && rows.length === 0 ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : rows.length === 0 && !loading ? <View style={styles.empty}><Text style={styles.emptyText}>{status === 'expired' ? 'No expired memberships to show.' : 'No memberships expire within the next 7 days.'}</Text></View> : rows.map((row) => {
      const phone = row.phone || row.secondary_phone;
      return <View key={row.child_id} style={styles.card}>
        <View style={styles.top}><Text style={styles.child}>{row.child_name}</Text><Text style={[styles.badge, status === 'expired' ? styles.expiredBadge : styles.expiringBadge]}>{status === 'expired' ? 'Expired' : row.days_remaining === 0 ? 'Today' : `${row.days_remaining}d left`}</Text></View>
        <Text style={styles.plan}>{row.plan_name} · ends {dateLabel(row.expires_on)}</Text><Text style={styles.parent}>{row.parent_name}{phone ? ` · ${phone}` : ' · No phone number'}</Text>
        {phone ? <View style={styles.actions}><Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${phone}`)} style={styles.callButton}><Text style={styles.callText}>Call</Text></Pressable><Pressable accessibilityRole="button" onPress={() => openMessageDraft(row)} style={styles.messageButton}><Text style={styles.messageText}>Prepare WhatsApp reminder</Text></Pressable></View> : null}
      </View>;
    })}
    {hasMore ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => void loadPage(status, offset, true)} style={styles.more}><Text style={styles.moreText}>{loading ? 'Loading…' : 'Load more'}</Text></Pressable> : null}
  </ScrollView></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, back: { minHeight: 40, justifyContent: 'center' }, backText: { color: C.plum, fontSize: 12, fontWeight: '800' }, refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' }, refreshText: { color: C.plum, fontSize: 24 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, filters: { flexDirection: 'row', backgroundColor: '#ECE8EB', borderRadius: 13, padding: 4, gap: 5, marginBottom: 12 }, filter: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 4 }, expiringActive: { backgroundColor: '#FBF3E3' }, expiredActive: { backgroundColor: '#FBE8E2' }, filterText: { color: C.muted, fontSize: 9, fontWeight: '800', textAlign: 'center' }, activeText: { color: C.ink }, card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 12, marginBottom: 8 }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, child: { color: C.ink, fontSize: 12, fontWeight: '900', flex: 1 }, badge: { fontSize: 8, fontWeight: '900', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }, expiredBadge: { color: C.coral, backgroundColor: '#FBE8E2' }, expiringBadge: { color: C.gold, backgroundColor: '#FBF3E3' }, plan: { color: C.plumDark, fontSize: 10, fontWeight: '700', marginTop: 5 }, parent: { color: C.muted, fontSize: 9, marginTop: 4 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: 10 }, callButton: { minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 }, callText: { color: C.plumDark, fontSize: 9, fontWeight: '800' }, messageButton: { minHeight: 38, borderRadius: 10, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, messageText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' }, loading: { marginTop: 30 }, empty: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 20 }, emptyText: { textAlign: 'center', color: C.muted, fontSize: 10 }, errorBox: { backgroundColor: '#FBE8E2', borderWidth: 1, borderColor: '#EDC5B9', borderRadius: 12, padding: 11, marginBottom: 10 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 9, marginTop: 4 }, retry: { color: C.plum, fontWeight: '900', fontSize: 10, marginTop: 6 }, more: { minHeight: 42, borderRadius: 11, backgroundColor: '#EEE8F0', alignItems: 'center', justifyContent: 'center', marginTop: 3 }, moreText: { color: C.plumDark, fontSize: 10, fontWeight: '900' } });
