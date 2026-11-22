import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import { openCustomerMessageDraft } from '../integrations/customerMessaging';

type Booking = { id: string; plan_name: string; plan_price: number | null; area_type: 'party_room' | 'entire_play_area'; kids_count: number; adults_count: number; duration_minutes: number; parent_name: string; phone: string; child_name: string; custom_request: boolean; request_message: string | null; admin_quote: number | null; starts_at: string; ends_at: string; status: 'pending' | 'quoted' };
const dateTime = (value: string) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

export default function AdminPartyRequests({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Booking[]>([]);
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: queryError } = await supabase.from('party_bookings')
      .select('id,plan_name,plan_price,area_type,kids_count,adults_count,duration_minutes,parent_name,phone,child_name,custom_request,request_message,admin_quote,starts_at,ends_at,status')
      .in('status', ['pending', 'quoted']).order('starts_at', { ascending: true }).limit(100);
    if (queryError) setError(`${queryError.message}${queryError.code ? ` (${queryError.code})` : ''}`);
    else setRows((data as Booking[] | null) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const draftMessage = (booking: Booking, status: 'confirmed' | 'cancelled' | 'quoted', quoteAmount?: number) => {
    const message = status === 'confirmed'
      ? `Hi ${booking.parent_name}, ${booking.child_name}'s party booking for ${booking.plan_name} is approved for ${dateTime(booking.starts_at)}. We look forward to celebrating with you!`
      : status === 'cancelled'
        ? `Hi ${booking.parent_name}, unfortunately we’re unable to host ${booking.child_name}'s party on ${dateTime(booking.starts_at)}. Please reply if you would like to discuss another date.`
        : `Hi ${booking.parent_name}, we have prepared a quote of ₹${Number(quoteAmount ?? booking.admin_quote ?? 0).toLocaleString('en-IN')} for ${booking.child_name}'s party request. Requested start: ${dateTime(booking.starts_at)}. Please reply if you would like to discuss or confirm.`;
    Alert.alert('Open WhatsApp draft?', 'This opens WhatsApp with the message ready to review. It will not send automatically.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Open WhatsApp', onPress: () => { void openCustomerMessageDraft({ channel: 'whatsapp', phone: booking.phone, message }).catch(() => setError('WhatsApp could not be opened on this device.')); } },
    ]);
  };

  const updateStatus = async (booking: Booking, status: 'confirmed' | 'cancelled' | 'quoted', quoteAmount?: number) => {
    setBusyId(booking.id); setError(null);
    const { error: updateError } = await supabase.from('party_bookings')
      .update({ status, ...(quoteAmount === undefined ? {} : { admin_quote: quoteAmount }) }).eq('id', booking.id);
    setBusyId(null);
    if (updateError) { setError(`${updateError.message}${updateError.code ? ` (${updateError.code})` : ''}`); return; }
    setRows((current) => status === 'quoted' ? current.map((item) => item.id === booking.id ? { ...item, status, admin_quote: quoteAmount ?? null } : item) : current.filter((item) => item.id !== booking.id));
    draftMessage(booking, status, quoteAmount);
  };

  const confirmAction = (booking: Booking, status: 'confirmed' | 'cancelled' | 'quoted', amount?: number) => {
    const label = status === 'confirmed' ? 'Approve booking?' : status === 'cancelled' ? 'Decline booking?' : 'Save quote?';
    Alert.alert(label, `${booking.child_name} · ${dateTime(booking.starts_at)}${amount === undefined ? '' : ` · ₹${amount.toLocaleString('en-IN')}`}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: status === 'confirmed' ? 'Approve' : status === 'cancelled' ? 'Decline' : 'Save quote', style: status === 'cancelled' ? 'destructive' : 'default', onPress: () => { void updateStatus(booking, status, amount); } },
    ]);
  };

  const saveQuote = (booking: Booking) => {
    const amount = Number(quotes[booking.id]);
    if (!Number.isFinite(amount) || amount < 0) { setError('Enter a valid quote amount first.'); return; }
    confirmAction(booking, 'quoted', amount);
  };

  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh party requests" onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>↻</Text></Pressable></View>
    <Text style={styles.eyebrow}>CUSTOMER REQUESTS</Text><Text accessibilityRole="header" style={styles.title}>Party bookings</Text><Text style={styles.subtitle}>Review package and custom requests. Message drafts are opened only after you choose.</Text>
    {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Couldn’t update party request</Text><Text style={styles.errorText}>{error}</Text></View> : null}
    {loading ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : rows.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No party requests need a response</Text><Text style={styles.emptyText}>New requests will appear here after refresh.</Text></View> : rows.map((booking) => <View key={booking.id} style={styles.card}>
      <View style={styles.topLine}><View style={styles.flex}><Text style={styles.childName}>{booking.child_name} · {booking.plan_name}</Text><Text style={styles.parentLine}>{booking.parent_name} · {booking.phone}</Text></View><Text style={[styles.status, booking.status === 'quoted' ? styles.quoted : styles.pending]}>{booking.status}</Text></View>
      <View style={styles.datePanel}><Text style={styles.dateLabel}>REQUESTED TIME</Text><Text style={styles.dateValue}>{dateTime(booking.starts_at)}</Text><Text style={styles.meta}>{booking.duration_minutes} min · {booking.area_type === 'entire_play_area' ? 'Entire play area' : 'Party room'}</Text></View>
      <Text style={styles.meta}>{booking.kids_count} children · {booking.adults_count} adults{booking.plan_price !== null ? ` · Package ₹${Number(booking.plan_price).toLocaleString('en-IN')}` : ''}</Text>
      {booking.custom_request && booking.request_message ? <Text style={styles.requestText}>{booking.request_message}</Text> : null}
      {booking.status === 'pending' ? <View style={styles.actions}>
        {booking.custom_request ? <TextInput accessibilityLabel={`Quote for ${booking.child_name}`} keyboardType="decimal-pad" onChangeText={(value) => setQuotes((current) => ({ ...current, [booking.id]: value }))} placeholder="Quote ₹" placeholderTextColor="#8B8373" value={quotes[booking.id] ?? (booking.admin_quote == null ? '' : String(booking.admin_quote))} style={styles.quoteInput} /> : null}
        <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => confirmAction(booking, 'cancelled')} style={[styles.button, styles.declineButton, busyId === booking.id && styles.disabled]}><Text style={styles.declineText}>Decline</Text></Pressable>
        {booking.custom_request ? <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => saveQuote(booking)} style={[styles.button, styles.quoteButton, busyId === booking.id && styles.disabled]}><Text style={styles.quoteText}>Prepare quote</Text></Pressable> : <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => confirmAction(booking, 'confirmed')} style={[styles.button, styles.approveButton, busyId === booking.id && styles.disabled]}>{busyId === booking.id ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveText}>Approve</Text>}</Pressable>}
      </View> : <View style={styles.actions}>
        <Text style={styles.quoteSaved}>Quote · ₹{Number(booking.admin_quote ?? 0).toLocaleString('en-IN')}</Text>
        <Pressable accessibilityRole="button" onPress={() => draftMessage(booking, 'quoted')} style={[styles.button, styles.quoteButton]}><Text style={styles.quoteText}>Review message</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busyId === booking.id} onPress={() => confirmAction(booking, 'confirmed')} style={[styles.button, styles.approveButton]}><Text style={styles.approveText}>Approve</Text></Pressable>
      </View>}
    </View>)}
  </ScrollView></View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }, back: { minHeight: 40, justifyContent: 'center' }, backText: { color: C.plum, fontSize: 12, fontWeight: '800' }, refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center', alignItems: 'center' }, refreshText: { color: C.plum, fontSize: 24 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, marginBottom: 9 }, topLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, flex: { flex: 1, minWidth: 0 }, childName: { color: C.ink, fontSize: 12, fontWeight: '900' }, parentLine: { color: C.muted, fontSize: 9, marginTop: 5 }, status: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 }, pending: { color: C.gold, backgroundColor: '#FBF3E3' }, quoted: { color: C.plum, backgroundColor: C.plumTint }, datePanel: { backgroundColor: '#F1F7FA', borderWidth: 1, borderColor: '#DCECF3', borderRadius: 11, padding: 10, marginTop: 11, marginBottom: 8 }, dateLabel: { color: C.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 }, dateValue: { color: C.plumDark, fontSize: 11, fontWeight: '900', marginTop: 4 }, meta: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 5 }, requestText: { color: C.ink, fontSize: 10, lineHeight: 15, backgroundColor: '#FFF5F2', borderRadius: 10, padding: 10, marginTop: 9 }, actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }, button: { minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 }, declineButton: { borderWidth: 1, borderColor: '#E8C9C6' }, declineText: { color: C.coral, fontSize: 9, fontWeight: '800' }, quoteButton: { backgroundColor: C.plumTint }, quoteText: { color: C.plumDark, fontSize: 9, fontWeight: '800' }, approveButton: { backgroundColor: C.mint }, approveText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' }, quoteInput: { height: 40, width: 100, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 9, backgroundColor: C.surface, color: C.ink, fontSize: 11 }, quoteSaved: { flex: 1, color: C.ink, fontSize: 10, fontWeight: '900' }, disabled: { opacity: 0.55 }, errorBox: { backgroundColor: '#FBE8E2', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 12, padding: 11, marginBottom: 10 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 10, marginTop: 4 }, loading: { marginTop: 32 }, empty: { padding: 22, borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' }, emptyTitle: { color: C.ink, fontSize: 12, fontWeight: '800', textAlign: 'center' }, emptyText: { color: C.muted, fontSize: 10, marginTop: 5 } });
