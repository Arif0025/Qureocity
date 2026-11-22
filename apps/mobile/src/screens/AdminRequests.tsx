import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import AdminLeaveRequests from './AdminLeaveRequests';
import AdminPartyRequests from './AdminPartyRequests';
import AdminRequestHistory from './AdminRequestHistory';
import AdminExpiryAlerts from './AdminExpiryAlerts';
import AdminPushHistory from './AdminPushHistory';
import NativeMessageComposer from '../components/NativeMessageComposer';
import type { MessageTemplateEvent, MessageTemplateValues } from '../lib/messageTemplates';

const REGISTRATION_PAGE_SIZE = 30;
type Registration = {
  id: string;
  receipt_number: string;
  registration_type: 'new' | 'renewal' | 'special';
  child_name: string;
  child_age?: number | null;
  gender?: string | null;
  school?: string | null;
  interests?: string[] | null;
  allergies?: string | null;
  medical_conditions?: string | null;
  special_instructions?: string | null;
  parent_name: string;
  phone?: string | null;
  secondary_phone?: string | null;
  address?: string | null;
  plan_name: string | null;
  plan_event_date?: string | null;
  special_event_date?: string | null;
  how_heard?: string | null;
  photo_consent?: boolean;
  whatsapp_consent?: boolean;
  submitted_at: string;
};
type RegistrationMessageDraft = { phone: string; event: MessageTemplateEvent; title: string; values: MessageTemplateValues; initialMessage: string };

function displayDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminRequests({ onBack, onOpenSettings }: { onBack: () => void; onOpenSettings?: () => void }) {
  const [section, setSection] = useState<'hub' | 'registrations' | 'parties' | 'leave' | 'history' | 'expiry' | 'push'>('hub');
  const [rows, setRows] = useState<Registration[]>([]);
  const [registrationOffset, setRegistrationOffset] = useState(0);
  const [registrationHasMore, setRegistrationHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailsById, setDetailsById] = useState<Record<string, Registration>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<RegistrationMessageDraft | null>(null);

  const load = useCallback(async (nextOffset = 0, append = false) => {
    setError(null);
    if (append) setLoadingMore(true); else setLoading(true);
    const { data, error: requestError } = await supabase.rpc('admin_mobile_pending_registration_list', { p_limit: REGISTRATION_PAGE_SIZE, p_offset: nextOffset });
    if (requestError) setError(`${requestError.message}${requestError.code ? ` (${requestError.code})` : ''}`);
    else {
      const page = (data as Registration[] | null) ?? [];
      setRows((current) => append ? [...current, ...page] : page);
      setRegistrationOffset(nextOffset + page.length);
      setRegistrationHasMore(page.length === REGISTRATION_PAGE_SIZE);
    }
    if (append) setLoadingMore(false); else setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadRegistrationDetail = async (row: Registration) => {
    if (detailsById[row.id] || detailLoadingId === row.id) return;
    setDetailLoadingId(row.id); setError(null);
    const { data, error: detailError } = await supabase.rpc('admin_mobile_pending_registration_detail', { p_registration_id: row.id });
    setDetailLoadingId(null);
    if (detailError || !data) { setError(detailError?.message ?? 'Registration details are no longer available. Refresh the inbox.'); return; }
    setDetailsById((current) => ({ ...current, [row.id]: data as Registration }));
  };
  const toggleRegistration = (row: Registration) => {
    if (expandedId === row.id) { setExpandedId(null); return; }
    setExpandedId(row.id);
    void loadRegistrationDetail(row);
  };

  if (section === 'parties') return <AdminPartyRequests onBack={() => setSection('hub')} />;
  if (section === 'leave') return <AdminLeaveRequests onBack={() => setSection('hub')} />;
  if (section === 'history') return <AdminRequestHistory onBack={() => setSection('hub')} />;
  if (section === 'expiry') return <AdminExpiryAlerts onBack={() => setSection('hub')} />;
  if (section === 'push') return <AdminPushHistory onBack={() => setSection('hub')} />;

  if (section === 'hub') {
    const routes = [
      { key: 'leave' as const, icon: '◷', title: 'Staff leave requests', detail: 'Review and respond to leave applications.' },
      { key: 'registrations' as const, icon: '＋', title: 'New registrations', detail: 'Membership, renewal, and special-day requests.', count: loading ? '…' : `${rows.length}${registrationHasMore ? '+' : ''}` },
      { key: 'parties' as const, icon: '✦', title: 'Party requests', detail: 'Review upcoming bookings and customer requests.' },
      { key: 'history' as const, icon: '↺', title: 'Registration history', detail: 'See recent decisions and completed requests.' },
      { key: 'expiry' as const, icon: '⌛', title: 'Membership expiry', detail: 'Review expired and soon-to-expire memberships.' },
      { key: 'push' as const, icon: '◉', title: 'Push activity', detail: 'Inspect recent notification delivery attempts.' },
    ];
    return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹ Overview</Text></Pressable><Text style={styles.hubHeaderLabel}>Notifications</Text><View style={styles.headerSpacer} /></View>
      <Text style={styles.eyebrow}>ADMIN WORKSPACE</Text><Text accessibilityRole="header" style={styles.title}>Notifications</Text><Text style={styles.description}>Review new registrations and keep important requests visible.</Text>
      {error ? <Pressable onPress={() => void load()} style={styles.errorBox}><Text style={styles.errorTitle}>Inbox needs attention</Text><Text style={styles.errorText}>{error}</Text></Pressable> : null}
      {routes.map((route) => <Pressable key={route.key} accessibilityRole="button" onPress={() => setSection(route.key)} style={({ pressed }) => [styles.hubCard, route.key === 'registrations' && styles.hubRegistrationCard, pressed && styles.hubPressed]}>
        <View style={[styles.hubIcon, route.key === 'registrations' && styles.hubRegistrationIcon]}><Text style={styles.hubIconText}>{route.icon}</Text></View><View style={styles.hubCopy}><Text style={styles.hubTitle}>{route.title}</Text><Text style={styles.hubDetail}>{route.detail}</Text></View>{route.count ? <Text style={styles.hubCount}>{route.count}</Text> : null}<Text style={styles.hubChevron}>›</Text>
      </Pressable>)}
      {onOpenSettings ? <Pressable accessibilityRole="button" onPress={onOpenSettings} style={styles.settingsLink}><Text style={styles.settingsLinkText}>Notification delivery preferences are in Settings</Text><Text style={styles.hubChevron}>›</Text></Pressable> : null}
    </ScrollView></View>;
  }

  const runAction = (row: Registration, action: 'confirm' | 'discard') => {
    const isConfirm = action === 'confirm';
    Alert.alert(
      isConfirm ? 'Confirm this request?' : 'Discard this request?',
      `${row.child_name} · ${row.receipt_number}${isConfirm ? ' will be added to QureoCity records.' : ' will be removed from the pending review queue.'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isConfirm ? 'Confirm' : 'Discard',
          style: isConfirm ? 'default' : 'destructive',
          onPress: () => { void applyAction(row, action); },
        },
      ],
    );
  };

  const applyAction = async (row: Registration, action: 'confirm' | 'discard') => {
    setBusyId(row.id);
    setError(null);
    const { data, error: actionError } = await supabase.rpc(
      action === 'confirm' ? 'confirm_membership_registration' : 'discard_membership_registration',
      { p_registration_id: row.id },
    );
    setBusyId(null);
    if (actionError) {
      setError(`${actionError.message}${actionError.code ? ` (${actionError.code})` : ''}`);
      return;
    }
    if (data && typeof data === 'object' && 'success' in data && !(data as { success: boolean }).success) {
      setError('Another administrator already handled this request. Refreshing the queue.');
      void load();
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setRegistrationOffset((current) => Math.max(0, current - 1));
    setDetailsById((current) => { const next = { ...current }; delete next[row.id]; return next; });
    setExpandedId(null);
    const detail = detailsById[row.id] ?? row;
    const phone = detail.phone || detail.secondary_phone || row.phone || row.secondary_phone || '';
    if (phone) {
      const special = row.registration_type === 'special';
      const approved = action === 'confirm';
      const event: MessageTemplateEvent = special
        ? approved ? 'special_day_approved' : 'special_day_declined'
        : approved ? 'membership_approved' : 'membership_declined';
      const eventDate = displayDate(detail.special_event_date ?? detail.plan_event_date);
      setMessageDraft({
        phone, event, title: `${special ? 'Special day' : 'Membership'} ${approved ? 'approved' : 'declined'}`,
        values: { parent_name: detail.parent_name, child_name: detail.child_name, plan_name: detail.plan_name ?? '', request_type: row.registration_type === 'renewal' ? 'renewal' : special ? 'special-day' : 'membership', event_date: eventDate === '—' ? '' : eventDate, business_name: 'QureoCity' },
        initialMessage: approved
          ? special ? 'Hi {{parent_name}}, {{child_name}}’s registration for {{plan_name}} on {{event_date}} is confirmed. We look forward to welcoming you!' : 'Hi {{parent_name}}, {{child_name}}’s {{plan_name}} has been approved and their subscription is now active. We look forward to welcoming you!'
          : special ? 'Hi {{parent_name}}, unfortunately we’re unable to approve {{child_name}}’s {{request_type}} request for {{event_date}}. Please contact us if you have questions.' : 'Hi {{parent_name}}, unfortunately we’re unable to approve {{child_name}}’s {{request_type}} request at this time. Please contact us if you have any questions.',
      });
    }
  };

  return (
    <View style={styles.root}>
      <NativeMessageComposer open={Boolean(messageDraft)} onClose={() => setMessageDraft(null)} title={messageDraft?.title ?? 'Message family'} phone={messageDraft?.phone ?? ''} event={messageDraft?.event ?? 'customer_contact'} values={messageDraft?.values ?? {}} initialMessage={messageDraft?.initialMessage ?? ''} canManageTemplates />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={() => setSection('hub')} style={styles.backButton}>
            <Text style={styles.backText}>‹ Notifications</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh pending requests" onPress={() => void load()} style={styles.refreshButton}>
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>
        <Text style={styles.eyebrow}>ADMIN WORKSPACE</Text>
        <Text accessibilityRole="header" style={styles.title}>Registration inbox</Text>
        <Text style={styles.description}>Review new registrations and open Actions to see recent decisions.</Text>
        <View style={styles.countPill}><Text style={styles.countText}>{loading ? 'Loading…' : `${rows.length}${registrationHasMore ? '+' : ''} shown`}</Text></View>
        <View style={styles.queueTabs}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: true }} onPress={() => setSection('registrations')} style={[styles.queueTab, styles.queueTabSelected]}><Text style={[styles.queueTabText, styles.queueTabTextSelected]}>Registrations</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSection('parties')} style={styles.queueTab}><Text style={styles.queueTabText}>Parties</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSection('leave')} style={styles.queueTab}><Text style={styles.queueTabText}>Staff leave</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSection('history')} style={styles.queueTab}><Text style={styles.queueTabText}>Actions</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSection('expiry')} style={styles.queueTab}><Text style={styles.queueTabText}>Expiry</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setSection('push')} style={styles.queueTab}><Text style={styles.queueTabText}>Push log</Text></Pressable>
        </View>

        {error ? (
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.errorBox}>
            <Text style={styles.errorTitle}>Request action needs attention</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tap to refresh the list.</Text>
          </Pressable>
        ) : null}

        {loading ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : rows.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>All caught up</Text><Text style={styles.emptyText}>There are no pending registration requests.</Text></View>
        ) : rows.map((row) => {
          const expanded = expandedId === row.id;
          const detail = detailsById[row.id];
          const age = row.child_age;
          const type = row.registration_type === 'renewal' ? 'Renewal' : row.registration_type === 'special' ? 'Special day' : 'New membership';
          return (
            <View key={row.id} style={styles.requestCard}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => void toggleRegistration(row)} style={styles.requestSummary}>
                <View style={styles.requestText}>
                  <Text numberOfLines={1} style={styles.childName}>{row.child_name}{age != null ? ` · ${age}y` : ''}</Text>
                  <Text numberOfLines={2} style={styles.summaryLine}>{type} · {row.parent_name} · {row.plan_name ?? 'No plan selected'}</Text>
                </View>
                <View style={styles.receiptBox}><Text style={styles.receipt}>{row.receipt_number}</Text><Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text></View>
              </Pressable>
              {expanded ? (
                <View style={styles.details}>
                  {detailLoadingId === row.id ? <ActivityIndicator color={C.plum} style={{ marginVertical: 12 }} /> : !detail ? <Pressable onPress={() => void loadRegistrationDetail(row)}><Text style={styles.errorText}>Details could not be loaded. Tap to retry.</Text></Pressable> : <>
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>CHILD</Text>
                    <Text style={styles.detailValue}>{detail.child_name}{detail.gender ? ` · ${detail.gender}` : ''}</Text>
                    {detail.school ? <Text style={styles.detailSecondary}>School: {detail.school}</Text> : null}
                    {detail.interests?.length ? <Text style={styles.detailSecondary}>Interests: {detail.interests.join(', ')}</Text> : null}
                    <Text style={styles.detailSecondary}>Submitted {new Date(detail.submitted_at).toLocaleDateString('en-IN')}</Text>
                  </View>
                  <View style={styles.detailBlock}>
                    <Text style={styles.detailLabel}>PARENT / GUARDIAN</Text>
                    <Text style={styles.detailValue}>{detail.parent_name}</Text>
                    {detail.phone ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${detail.phone}`)}><Text style={styles.phoneLink}>{detail.phone} · Call</Text></Pressable> : null}
                    {detail.secondary_phone ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${detail.secondary_phone}`)}><Text style={styles.phoneLink}>Alt: {detail.secondary_phone}</Text></Pressable> : null}
                    {detail.address ? <Text style={styles.detailSecondary}>{detail.address}</Text> : null}
                  </View>
                  {detail.registration_type === 'special' && (detail.special_event_date || detail.plan_event_date) ? (
                    <View style={styles.detailBlock}><Text style={styles.detailLabel}>EVENT DATE</Text><Text style={styles.detailValue}>{displayDate(detail.special_event_date ?? detail.plan_event_date)}</Text></View>
                  ) : null}
                  {(detail.allergies || detail.medical_conditions || detail.special_instructions) ? (
                    <View style={styles.medicalBox}>
                      <Text style={styles.medicalTitle}>Medical and care notes</Text>
                      {detail.allergies ? <Text style={styles.medicalText}>Allergies: {detail.allergies}</Text> : null}
                      {detail.medical_conditions ? <Text style={styles.medicalText}>Conditions: {detail.medical_conditions}</Text> : null}
                      {detail.special_instructions ? <Text style={styles.medicalText}>Instructions: {detail.special_instructions}</Text> : null}
                    </View>
                  ) : null}
                  {detail.registration_type !== 'renewal' ? <Text style={styles.consentText}>Photo consent: {detail.photo_consent ? 'Yes' : 'No'} · WhatsApp updates: {detail.whatsapp_consent ? 'Yes' : 'No'}{detail.how_heard ? ` · Heard via ${detail.how_heard}` : ''}</Text> : null}
                  <View style={styles.actions}>
                    <Pressable accessibilityRole="button" disabled={busyId === row.id} onPress={() => runAction(row, 'discard')} style={[styles.actionButton, styles.discardButton, busyId === row.id && styles.disabled]}>
                      <Text style={styles.discardText}>{busyId === row.id ? 'Working…' : 'Discard'}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busyId === row.id} onPress={() => runAction(row, 'confirm')} style={[styles.actionButton, styles.confirmButton, busyId === row.id && styles.disabled]}>
                      {busyId === row.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.confirmText}>{row.registration_type === 'renewal' ? 'Confirm renewal' : row.registration_type === 'special' ? 'Confirm special day' : 'Confirm membership'}</Text>}
                    </Pressable>
                  </View>
                  </>}
                </View>
              ) : null}
            </View>
          );
        })}
        {!loading && registrationHasMore ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void load(registrationOffset,true)} style={styles.loadMore}>{loadingMore?<ActivityIndicator color={C.plum}/>:<Text style={styles.loadMoreText}>Load more registrations</Text>}</Pressable> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 },
  queueTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 4, borderRadius: 13, backgroundColor: '#EDE8EB', marginBottom: 14 }, queueTab: { minHeight: 36, flexBasis: '31%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 3 }, queueTabSelected: { backgroundColor: C.surface }, queueTabText: { color: C.muted, fontSize: 8, fontWeight: '800', textAlign: 'center' }, queueTabTextSelected: { color: C.plumDark },
  hubHeaderLabel:{color:C.ink,fontSize:12,fontWeight:'800'},headerSpacer:{width:58},hubCard:{minHeight:78,flexDirection:'row',alignItems:'center',gap:11,borderRadius:16,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:13,paddingVertical:11,marginBottom:9},hubRegistrationCard:{borderColor:'#D7C6E2',backgroundColor:'#F8F3FA'},hubPressed:{opacity:0.82},hubIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:'#F0EBF2'},hubRegistrationIcon:{backgroundColor:C.plumTint},hubIconText:{color:C.plum,fontSize:17,fontWeight:'900'},hubCopy:{flex:1,minWidth:0},hubTitle:{color:C.ink,fontSize:12,fontWeight:'800'},hubDetail:{color:C.muted,fontSize:9,lineHeight:13,marginTop:4},hubCount:{minWidth:29,textAlign:'center',color:C.plumDark,fontSize:10,fontWeight:'900',backgroundColor:C.plumTint,borderRadius:20,paddingHorizontal:7,paddingVertical:6,overflow:'hidden'},hubChevron:{color:C.plum,fontSize:21,paddingLeft:2},settingsLink:{minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:9,marginTop:3},settingsLinkText:{color:C.muted,fontSize:10,fontWeight:'700'},
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }, backButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 }, backText: { color: C.plum, fontSize: 13, fontWeight: '800' }, refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, refreshText: { color: C.plum, fontSize: 25 },
  eyebrow: { color: C.plum, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, title: { color: C.ink, fontSize: 26, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 }, description: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }, countPill: { alignSelf: 'flex-start', backgroundColor: C.plumTint, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginTop: 14, marginBottom: 13 }, countText: { color: C.plumDark, fontSize: 10, fontWeight: '800' },
  requestCard: { backgroundColor: C.surface, borderRadius: 17, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 9 }, requestSummary: { minHeight: 74, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 12 }, requestText: { flex: 1, minWidth: 0 }, childName: { color: C.ink, fontSize: 13, fontWeight: '800' }, summaryLine: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, receiptBox: { alignItems: 'flex-end', marginLeft: 7 }, receipt: { color: C.muted, fontSize: 9, fontWeight: '700' }, chevron: { color: C.plum, fontSize: 19, lineHeight: 21, marginTop: 3 }, details: { borderTopWidth: 1, borderTopColor: C.line, padding: 13, gap: 13, backgroundColor: '#FCFBFA' }, detailBlock: { gap: 3 }, detailLabel: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.9 }, detailValue: { color: C.ink, fontSize: 12, fontWeight: '700' }, detailSecondary: { color: C.muted, fontSize: 10, lineHeight: 15 }, phoneLink: { color: C.plum, fontSize: 11, fontWeight: '700', paddingVertical: 3 }, medicalBox: { backgroundColor: '#FFF2F0', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 12, padding: 11, gap: 3 }, medicalTitle: { color: C.coral, fontSize: 10, fontWeight: '900', marginBottom: 2 }, medicalText: { color: C.ink, fontSize: 10, lineHeight: 15 }, consentText: { color: C.muted, fontSize: 9, lineHeight: 14 }, actions: { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }, actionButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, discardButton: { borderWidth: 1, borderColor: '#E8C9C6', backgroundColor: '#FFFFFF', minWidth: 84 }, confirmButton: { flex: 1, backgroundColor: C.mint }, discardText: { color: C.coral, fontSize: 11, fontWeight: '800' }, confirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, disabled: { opacity: 0.55 },
  loadMore:{minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,marginTop:3,marginBottom:14},loadMoreText:{color:C.plum,fontSize:10,fontWeight:'900'},
  errorBox: { backgroundColor: '#FBE8E2', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 13 }, errorTitle: { color: C.coral, fontSize: 11, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 10, lineHeight: 15, marginTop: 4 }, retryText: { color: C.plum, fontSize: 10, fontWeight: '800', marginTop: 6 }, loading: { marginTop: 32 }, emptyCard: { padding: 24, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' }, emptyTitle: { color: C.ink, fontSize: 14, fontWeight: '800' }, emptyText: { color: C.muted, fontSize: 11, marginTop: 5 },
});
