import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import AdminRequests from './AdminRequests';
import AdminCustomers from './AdminCustomers';
import AdminPlans from './AdminPlans';
import AdminStaff from './AdminStaff';
import AdminSettings from './AdminSettings';
import { colors } from '../theme/tokens';
import AdminGlobalSearch from '../components/AdminGlobalSearch';
import AdminLeaveRequests from './AdminLeaveRequests';
import AdminPartyRequests from './AdminPartyRequests';
import AdminExpiryAlerts from './AdminExpiryAlerts';
import AdminRequestHistory from './AdminRequestHistory';
import AdminPushHistory from './AdminPushHistory';
import { openCustomerMessageDraft } from '../integrations/customerMessaging';

const C = { ...colors };

type VisitRow = { checked_out_at: string | null };
type Metrics = {
  onSite: number | null;
  staffOnSite: number | null;
  today: number | null;
  registrations: number | null;
  sessions: number | null;
  parties: number | null;
  leave: number | null;
};
type DetailKind = 'requests' | 'kids' | 'staff' | 'checkins' | null;
type CheckinDetail = {
  sessionId: string;
  childId: string;
  childName: string;
  parentName: string;
  parentPhone: string;
  visitType: string;
  planName: string | null;
  membershipExpiresOn: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
  active: boolean;
};
type StaffDetail = {
  employeeId: string;
  employeeName: string;
  status: 'present' | 'left' | 'absent' | 'off' | 'on_leave' | 'shift_not_started';
  punchIn: string | null;
  punchOut: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
};
type DetailItem = { title: string; subtitle: string; checkin?: CheckinDetail; staff?: StaffDetail };
type AdminView = 'overview' | 'requests' | 'customers' | 'plans' | 'staff' | 'settings' | 'leave' | 'parties' | 'expiry' | 'history' | 'pushHistory';

const emptyMetrics: Metrics = {
  onSite: null,
  staffOnSite: null,
  today: null,
  registrations: null,
  sessions: null,
  parties: null,
  leave: null,
};

function istDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localClock(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
}

function StaffDetailRow({ item, expanded, notifying, onToggle, onNotify, onViewDetails }: {
  item: StaffDetail;
  expanded: boolean;
  notifying: boolean;
  onToggle: () => void;
  onNotify: () => void;
  onViewDetails: () => void;
}) {
  const labels: Record<StaffDetail['status'], string> = {
    present: 'ON SITE', left: 'SHIFT ENDED', absent: 'ABSENT', off: 'NO SHIFT',
    on_leave: 'ON LEAVE', shift_not_started: 'SHIFT NOT STARTED',
  };
  const statusStyle = {
    present: styles.staffStatus_present,
    left: styles.staffStatus_left,
    absent: styles.staffStatus_absent,
    off: styles.staffStatus_off,
    on_leave: styles.staffStatus_on_leave,
    shift_not_started: styles.staffStatus_shift_not_started,
  }[item.status];
  return (
    <View style={styles.staffDetailCard}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle} style={styles.staffDetailSummary}>
        <View style={styles.staffInitial}><Text style={styles.staffInitialText}>{item.employeeName.trim().slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.staffDetailCopy}>
          <Text style={styles.staffDetailName}>{item.employeeName}</Text>
          <Text style={[styles.staffStatus, statusStyle]}>{labels[item.status]}</Text>
        </View>
        <Text style={styles.staffDisclosureArrow}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.staffExpanded}>
          <Text style={styles.staffTimes}>Shift · {item.shiftStart ? item.shiftStart.slice(0, 5) : 'Not scheduled'}{item.shiftEnd ? `–${item.shiftEnd.slice(0, 5)}` : ''}</Text>
          <Text style={styles.staffTimes}>In · {localClock(item.punchIn)}   Out · {localClock(item.punchOut)}</Text>
          <View style={styles.staffActions}>
            <Pressable accessibilityRole="button" disabled={notifying} onPress={onNotify} style={styles.staffAction}><Text style={styles.staffActionText}>{notifying ? 'Sending…' : 'Notify'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={onViewDetails} style={styles.staffAction}><Text style={styles.staffActionText}>View details</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CheckinDetailRow({ item, expanded, onToggleParent, onCall, onMessage, onEdit }: {
  item: CheckinDetail;
  expanded: boolean;
  onToggleParent: () => void;
  onCall: () => void;
  onMessage: () => void;
  onEdit: () => void;
}) {
  const kind = item.visitType === 'membership' ? 'MEMBER' : item.visitType === 'special' ? 'SPECIAL PASS' : 'WALK-IN';
  const timing = `In ${localClock(item.checkedInAt)} · ${item.active ? 'Expected out' : 'Out'} ${localClock(item.checkedOutAt)}`;
  return (
    <View style={styles.checkinCard}>
      <View style={styles.checkinHeading}>
        <View style={styles.checkinTitleBlock}>
          <Text style={styles.checkinChildName}>{item.childName}</Text>
          <Text style={styles.checkinParentPreview}>{item.parentName}</Text>
        </View>
        <Text style={[styles.checkinStatus, item.visitType === 'membership' ? styles.memberStatus : styles.guestStatus]}>{kind}</Text>
      </View>
      <Text style={styles.checkinPlan}>{item.planName ?? (item.visitType === 'special' ? 'Special-day pass' : 'No active plan')}{item.membershipExpiresOn ? ` · valid through ${item.membershipExpiresOn}` : ''}</Text>
      <Text style={styles.checkinTiming}>{timing}</Text>
      <View style={styles.checkinActions}>
        <Pressable accessibilityRole="button" onPress={onCall} style={styles.checkinAction}><Text style={styles.checkinActionText}>Call</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onMessage} style={styles.checkinAction}><Text style={styles.checkinActionText}>Message</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onEdit} style={styles.checkinAction}><Text style={styles.checkinActionText}>Edit</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggleParent} style={styles.parentDisclosure}>
        <Text style={styles.parentDisclosureText}>{expanded ? 'Hide parent details' : 'Parent details'}</Text>
        <Text style={styles.parentDisclosureArrow}>{expanded ? '⌃' : '⌄'}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.parentDetails}>
          <Text style={styles.parentName}>{item.parentName}</Text>
          <Text style={styles.parentPhone}>{item.parentPhone || 'No phone number recorded'}</Text>
        </View>
      ) : null}
    </View>
  );
}

function HomeMetric({ icon, label, value, onPress }: { icon: string; label: string; value: number | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.homeMetric, pressed && styles.pressed]}>
      <View style={styles.homeMetricTop}>
        <Text style={styles.homeMetricIcon}>{icon}</Text>
        <Text style={styles.homeMetricArrow}>↗</Text>
      </View>
      <Text style={styles.homeMetricValue}>{value === null ? '—' : value}</Text>
      <Text style={styles.homeMetricLabel}>{label}</Text>
    </Pressable>
  );
}

function ReviewRow({ icon, label, detail, value, onPress }: { icon: string; label: string; detail: string; value: number | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}>
      <Text style={styles.reviewIcon}>{icon}</Text>
      <View style={styles.reviewCopy}>
        <Text style={styles.reviewTitle}>{label}</Text>
        <Text style={styles.reviewDetail}>{detail}</Text>
      </View>
      <Text style={styles.reviewCount}>{value === null ? '—' : value}</Text>
      <Text style={styles.reviewArrow}>›</Text>
    </Pressable>
  );
}

function SearchMark() {
  return <View style={styles.searchMark}><View style={styles.searchMarkLens} /><View style={styles.searchMarkHandle} /></View>;
}

function BellMark() {
  return <View style={styles.bellMark}><View style={styles.bellDome} /><View style={styles.bellBase} /><View style={styles.bellClapper} /></View>;
}

export default function AdminDashboard({
  employeeName,
  onSignOut,
}: {
  employeeName: string;
  onSignOut: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [detailKind, setDetailKind] = useState<DetailKind>(null);
  const [detailItems, setDetailItems] = useState<DetailItem[]>([]);
  const [expandedCheckinId, setExpandedCheckinId] = useState<string | null>(null);
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [notifyingEmployeeId, setNotifyingEmployeeId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailWarning, setDetailWarning] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AdminView>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [customerSearchSeed, setCustomerSearchSeed] = useState('');
  const [customerChildSeed, setCustomerChildSeed] = useState<string | undefined>();
  const [staffSearchSeed, setStaffSearchSeed] = useState<string | undefined>();
  const navigationHistory = useRef<AdminView[]>([]);
  const entrance = useRef(new Animated.Value(0)).current;
  const checkinCountAnim = useRef(new Animated.Value(0)).current;
  const [checkinCountDisplay, setCheckinCountDisplay] = useState(0);
  const [staffOnSite, setStaffOnSite] = useState<StaffDetail[]>([]);
  const todayKey = useMemo(() => istDateKey(), []);

  useEffect(() => {
    if (metrics.today === null) return;
    checkinCountAnim.stopAnimation();
    checkinCountAnim.setValue(0);
    const listener = checkinCountAnim.addListener(({ value }) => setCheckinCountDisplay(Math.round(value)));
    Animated.timing(checkinCountAnim, { toValue: metrics.today, duration: 650, useNativeDriver: false }).start();
    return () => checkinCountAnim.removeListener(listener);
  }, [checkinCountAnim, metrics.today]);

  const openDetails = useCallback(async (kind: Exclude<DetailKind, null>) => {
    setDetailKind(kind);
    setExpandedCheckinId(null);
    setExpandedStaffId(null);
    setDetailItems([]);
    setDetailError(null);
    setDetailWarning(null);
    setDetailLoading(true);
    try {
      const toItems = (rows: Record<string, unknown>[], titleKey: string, subtitle: (row: Record<string, unknown>) => string): DetailItem[] =>
        rows.map((row) => ({ title: String(row[titleKey] ?? 'Unnamed'), subtitle: subtitle(row) }));
      let items: DetailItem[];
      if (kind === 'kids') {
        const { data, error } = await supabase.rpc('dashboard_list_checked_in_kids');
        if (error) throw error;
        items = toItems((data ?? []) as Record<string, unknown>[], 'child_name', (row) =>
          `${String(row.parent_name ?? 'Parent unavailable')} · Checked in ${new Date(String(row.start_time)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
      } else if (kind === 'staff') {
        const team = await supabase.rpc('dashboard_list_team_on_day', { p_day: todayKey });
        if (team.error) throw team.error;
        const leave = await supabase.from('employee_leave_requests').select('employee_id').eq('status', 'approved').lte('start_date', todayKey).gte('end_date', todayKey);
        if (leave.error) setDetailWarning('Staff roster loaded, but leave status is temporarily unavailable.');
        const leaveIds = new Set((leave.data ?? []).map((row) => row.employee_id));
        const nowIst = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
        items = ((team.data ?? []) as Record<string, unknown>[]).filter((row) => row.role !== 'admin').map((row) => {
          const shiftStart = row.shift_start ? String(row.shift_start) : null;
          const rawStatus = String(row.status ?? 'off');
          const status: StaffDetail['status'] = rawStatus === 'present' ? 'present'
            : rawStatus === 'left' ? 'left'
              : leaveIds.has(String(row.employee_id)) ? 'on_leave'
                : rawStatus === 'absent' && row.scheduled && shiftStart && shiftStart.slice(0, 5) > nowIst ? 'shift_not_started'
                  : rawStatus === 'absent' ? 'absent' : 'off';
          const detail: StaffDetail = {
            employeeId: String(row.employee_id ?? ''),
            employeeName: String(row.employee_name ?? 'Unnamed employee'),
            status,
            punchIn: row.punch_in ? String(row.punch_in) : null,
            punchOut: row.punch_out ? String(row.punch_out) : null,
            shiftStart,
            shiftEnd: row.shift_end ? String(row.shift_end) : null,
          };
          return { title: detail.employeeName, subtitle: '', staff: detail };
        });
      } else if (kind === 'checkins') {
        const [checkins, activeVisits] = await Promise.all([
          supabase.rpc('admin_today_checkin_list', { p_day: todayKey, p_visit_type: null }),
          supabase.rpc('dashboard_list_checked_in_kids'),
        ]);
        if (checkins.error) throw checkins.error;
        if (activeVisits.error) throw activeVisits.error;
        const activeIds = new Set(((activeVisits.data ?? []) as Record<string, unknown>[]).map((row) => String(row.session_id)));
        const rows = (checkins.data ?? []) as Record<string, unknown>[];
        items = rows.map((row) => {
          const sessionId = String(row.session_id ?? '');
          const detail: CheckinDetail = {
            sessionId,
            childId: String(row.child_id ?? ''),
            childName: String(row.child_name ?? 'Unnamed child'),
            parentName: String(row.parent_name ?? 'Parent unavailable'),
            parentPhone: String(row.parent_phone ?? ''),
            visitType: String(row.visit_type ?? 'walk_in'),
            planName: row.plan_name ? String(row.plan_name) : null,
            membershipExpiresOn: row.membership_expires_on ? String(row.membership_expires_on) : null,
            checkedInAt: String(row.checked_in_at ?? ''),
            checkedOutAt: row.checked_out_at ? String(row.checked_out_at) : null,
            active: activeIds.has(sessionId),
          };
          return { title: detail.childName, subtitle: '', checkin: detail };
        });
      } else {
        const [registrations, sessions, parties, leave] = await Promise.all([
          supabase.from('membership_registrations').select('receipt_number,registration_type,child_name,submitted_at').eq('status', 'pending').order('submitted_at', { ascending: true }).limit(100),
          supabase.rpc('list_pending_sessions'),
          supabase.from('party_bookings').select('id,plan_name,child_name,parent_name,starts_at').eq('status', 'pending').order('starts_at', { ascending: true }).limit(100),
          supabase.from('employee_leave_requests').select('id,start_date,end_date,reason,created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
        ]);
        const requestError = registrations.error ?? sessions.error ?? parties.error ?? leave.error;
        if (requestError) throw requestError;
        const registrationItems = ((registrations.data ?? []) as Record<string, unknown>[]).map((row) => ({
          title: `${String(row.registration_type ?? 'Membership')} · ${String(row.child_name ?? 'Renewal request')}`,
          subtitle: `Receipt ${String(row.receipt_number)} · Submitted ${new Date(String(row.submitted_at)).toLocaleDateString()}`,
        }));
        const sessionItems = toItems((sessions.data ?? []) as Record<string, unknown>[], 'child_name', (row) => `Check-in confirmation · ${String(row.parent_name ?? 'Parent unavailable')}`);
        const partyItems = toItems((parties.data ?? []) as Record<string, unknown>[], 'child_name', (row) => `${String(row.plan_name ?? 'Party request')} · ${String(row.parent_name ?? '')} · ${new Date(String(row.starts_at)).toLocaleDateString()}`);
        const leaveItems = ((leave.data ?? []) as Record<string, unknown>[]).map((row) => ({ title: 'Staff leave request', subtitle: `${String(row.start_date)} – ${String(row.end_date)} · ${String(row.reason ?? '')}` }));
        items = [...registrationItems, ...sessionItems, ...partyItems, ...leaveItems];
      }
      setDetailItems(items);
    } catch (cause) {
      const issue = cause as { message?: string; code?: string };
      setDetailError(`${issue?.message ?? 'Could not load the details.'}${issue?.code ? ` (${issue.code})` : ''}`);
    } finally {
      setDetailLoading(false);
    }
  }, [todayKey]);

  const loadMetrics = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);

    try {
      const [{ data, error }, team] = await Promise.all([
        supabase.rpc('admin_mobile_dashboard_summary', { p_day: todayKey }),
        supabase.rpc('dashboard_list_team_on_day', { p_day: todayKey }),
      ]);
      if (error) throw error;
      const summary = data as Record<string, number | string>;
      setMetrics({
        onSite: Number(summary.kids_on_site),
        staffOnSite: Number(summary.staff_on_site),
        today: Number(summary.checkins_today),
        registrations: Number(summary.pending_registrations),
        sessions: Number(summary.pending_sessions),
        parties: Number(summary.pending_parties),
        leave: Number(summary.pending_leave),
      });
      if (!team.error) {
        const rows = (team.data ?? []) as Record<string, unknown>[];
        setStaffOnSite(rows.filter((row) => row.status === 'present').map((row) => ({
          employeeId: String(row.employee_id ?? ''),
          employeeName: String(row.employee_name ?? 'Unnamed employee'),
          status: 'present' as const,
          punchIn: row.punch_in ? String(row.punch_in) : null,
          punchOut: null,
          shiftStart: row.shift_start ? String(row.shift_start) : null,
          shiftEnd: row.shift_end ? String(row.shift_end) : null,
        })));
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayKey]);

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      damping: 19,
      stiffness: 125,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const entranceStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  const callParent = async (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (!digits) { Alert.alert('Phone number unavailable', 'No parent phone number is recorded for this visit.'); return; }
    try { await Linking.openURL(`tel:${digits}`); }
    catch { Alert.alert('Could not open phone', 'This device could not open the phone dialer.'); }
  };

  const messageParent = async (phone: string, parentName: string, childName: string) => {
    if (!phone) { Alert.alert('Phone number unavailable', 'No parent phone number is recorded for this visit.'); return; }
    try {
      await openCustomerMessageDraft({ channel: 'whatsapp', phone, message: `Hi ${parentName}, this is QureoCity. We’re contacting you about ${childName}’s visit.` });
    } catch {
      Alert.alert('Could not open WhatsApp', 'Check the parent’s phone number and try again.');
    }
  };

  const sendStaffNotification = async (employee: StaffDetail) => {
    setNotifyingEmployeeId(employee.employeeId);
    try {
      const { data, error } = await supabase.functions.invoke('mobile-admin-notify', {
        body: {
          employee_id: employee.employeeId,
          title: 'Message from QureoCity admin',
          message: 'Please check in with the admin when you have a moment.',
        },
      });
      if (error || data?.error) {
        Alert.alert('Could not notify staff', data?.error ?? error?.message ?? 'Please try again.');
        return;
      }
      Alert.alert('Notification sent', `Delivered to ${data?.sent ?? 0} of ${data?.total ?? 0} registered devices.`);
    } catch {
      Alert.alert('Could not notify staff', 'Please check your connection and try again.');
    } finally {
      setNotifyingEmployeeId(null);
    }
  };

  const confirmStaffNotification = (employee: StaffDetail) => Alert.alert(
    `Notify ${employee.employeeName}?`,
    'Send a push notification asking them to check in with the admin.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Notify', onPress: () => void sendStaffNotification(employee) },
    ],
  );

  const navigate = useCallback((view: AdminView) => {
    if (view !== activeView) navigationHistory.current.push(activeView);
    setMoreOpen(false);
    setActiveView(view);
    if (view !== 'staff') setStaffSearchSeed(undefined);
    if (view !== 'customers') { setCustomerSearchSeed(''); setCustomerChildSeed(undefined); }
    if (view === 'overview') void loadMetrics(true);
  }, [activeView, loadMetrics]);
  const goBack = useCallback(() => {
    const previous = navigationHistory.current.pop() ?? 'overview';
    setMoreOpen(false);
    setActiveView(previous);
    if (previous !== 'staff') setStaffSearchSeed(undefined);
    if (previous !== 'customers') { setCustomerSearchSeed(''); setCustomerChildSeed(undefined); }
    if (previous === 'overview') void loadMetrics(true);
  }, [loadMetrics]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (moreOpen) { setMoreOpen(false); return true; }
      if (detailKind !== null) { setDetailKind(null); return true; }
      if (activeView !== 'overview') { goBack(); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [activeView, detailKind, goBack, moreOpen]);

  let secondaryScreen: ReactNode = null;
  if (activeView === 'requests') secondaryScreen = <AdminRequests onBack={goBack} />;
  else if (activeView === 'customers') secondaryScreen = <AdminCustomers initialQuery={customerSearchSeed} initialChildId={customerChildSeed} onBack={goBack} />;
  else if (activeView === 'plans') secondaryScreen = <AdminPlans onBack={goBack} />;
  else if (activeView === 'staff') secondaryScreen = <AdminStaff initialEmployeeId={staffSearchSeed} onBack={goBack} />;
  else if (activeView === 'settings') secondaryScreen = <AdminSettings onBack={goBack} onSignOut={onSignOut} />;
  else if (activeView === 'leave') secondaryScreen = <AdminLeaveRequests onBack={goBack} />;
  else if (activeView === 'parties') secondaryScreen = <AdminPartyRequests onBack={goBack} />;
  else if (activeView === 'expiry') secondaryScreen = <AdminExpiryAlerts onBack={goBack} />;
  else if (activeView === 'history') secondaryScreen = <AdminRequestHistory onBack={goBack} />;
  else if (activeView === 'pushHistory') secondaryScreen = <AdminPushHistory onBack={goBack} />;

  const moreItems: { label: string; icon: string; view?: AdminView; action?: 'signOut' }[] = [
    { label: 'Registration inbox', icon: '✓', view: 'requests' },
    { label: 'Leave requests', icon: '◷', view: 'leave' },
    { label: 'Party requests', icon: '✦', view: 'parties' },
    { label: 'Membership expiry', icon: '⌛', view: 'expiry' },
    { label: 'Review history', icon: '↺', view: 'history' },
    { label: 'Push history', icon: '◉', view: 'pushHistory' },
    { label: 'Sign out', icon: '↗', action: 'signOut' },
  ];

  const bottomNavigation = (
    <>
      {moreOpen ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Close more menu" onPress={() => setMoreOpen(false)} style={styles.menuBackdrop} />
          <View style={styles.moreMenu}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.moreMenuContent}>
              {moreItems.map((item) => (
                <Pressable key={item.label} accessibilityRole="button" onPress={() => {
                  if (item.action === 'signOut') { setMoreOpen(false); void signOut(); }
                  else if (item.view) navigate(item.view);
                }} disabled={item.action === 'signOut' && signingOut} style={({ pressed }) => [styles.moreMenuItem, pressed && styles.pressed]}>
                  <Text style={styles.moreMenuIcon}>{item.icon}</Text>
                  <Text style={[styles.moreMenuLabel, item.action === 'signOut' && styles.moreMenuSignOut]}>{item.action === 'signOut' && signingOut ? 'Signing out…' : item.label}</Text>
                  <Text style={styles.moreMenuChevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      ) : null}
      <View style={styles.navDock}>
        {([
          { view: 'overview' as const, icon: '▦', label: 'Overview' },
          { view: 'customers' as const, icon: '♧', label: 'Customers' },
          { view: 'plans' as const, icon: '✓', label: 'Plans' },
          { view: 'staff' as const, icon: '♙', label: 'Staff' },
          { view: 'settings' as const, icon: '⚙', label: 'Settings' },
        ]).map((item) => {
          const selected = activeView === item.view;
          return (
            <Pressable key={item.view} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => navigate(item.view)} style={[styles.navItem, selected && styles.navItemSelected]}>
              <Text style={[styles.navIcon, selected && styles.navIconSelected]}>{item.icon}</Text>
              <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  return (
    <View style={[styles.root, activeView === 'overview' && styles.overviewRoot]}>
      {activeView === 'overview' ? <ScrollView
        contentContainerStyle={[styles.scrollContent, styles.overviewScroll, { paddingHorizontal: compact ? 21 : 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, entranceStyle]}>
          <View style={[styles.topBar, styles.overviewTopBar]}>
            <View style={styles.brandRow}>
              <Image source={require('../../assets/qureocity-login.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="QureoCity" />
            </View>
            <View style={styles.topActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Notifications and requests" onPress={() => navigate('requests')} style={({ pressed }) => [styles.overviewIconButton, pressed && styles.pressed]}>
              <BellMark />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Global search" onPress={() => setSearchOpen(true)} style={({ pressed }) => [styles.overviewIconButton, pressed && styles.pressed]}>
              <SearchMark />
            </Pressable>
            </View>
          </View>

          {loadError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadMetrics(true)}
              style={({ pressed }) => [styles.loadError, pressed && styles.pressed]}
            >
              <Text style={styles.loadErrorTitle}>Dashboard data didn’t load</Text>
              <Text style={styles.loadErrorBody}>Tap to try again. You can still use the workspace.</Text>
            </Pressable>
          ) : null}

          <View style={styles.overviewSection}>
            <Text style={styles.overviewEyebrow}>CHECK-INS TODAY</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View today's check-ins" onPress={() => void openDetails('checkins')} style={({ pressed }) => [styles.checkinCountRow, pressed && styles.pressed]}>
              <Text style={styles.checkinCount}>{loading ? '—' : checkinCountDisplay}</Text>
              <Text style={styles.checkinCountArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.overviewSection}>
            <View style={styles.overviewSectionTitleRow}><View style={styles.sectionMarker} /><Text style={styles.minimalSectionTitle}>Staff on site</Text><Text style={styles.staffCount}>{loading ? '—' : staffOnSite.length}</Text></View>
            {staffOnSite.length ? staffOnSite.map((staff) => (
              <Pressable key={staff.employeeId} accessibilityRole="button" onPress={() => void openDetails('staff')} style={({ pressed }) => [styles.staffOnSiteRow, pressed && styles.pressed]}>
                <Text style={styles.staffOnSiteName}>{staff.employeeName}</Text>
                <Text style={styles.staffPunchTime}>In {localClock(staff.punchIn)}</Text>
              </Pressable>
            )) : <Text style={styles.overviewQuietText}>{loading ? 'Loading attendance…' : 'No staff punched in yet'}</Text>}
          </View>

          {(() => {
            const pendingReviews = [
              { icon: '＋', label: 'Registrations & renewals', detail: 'Membership decisions', value: metrics.registrations, onPress: () => navigate('requests') },
              { icon: '◷', label: 'Staff leave', detail: 'Leave applications', value: metrics.leave, onPress: () => navigate('leave') },
              { icon: '✦', label: 'Party requests', detail: 'Bookings waiting for review', value: metrics.parties, onPress: () => navigate('parties') },
              { icon: '✓', label: 'Check-in confirmations', detail: 'Sessions needing confirmation', value: metrics.sessions, onPress: () => navigate('requests') },
            ].filter((item) => item.value !== null && item.value > 0);
            return pendingReviews.length ? <View style={styles.overviewSection}>
              <View style={styles.overviewSectionTitleRow}><View style={styles.sectionMarker} /><Text style={styles.minimalSectionTitle}>Needs review</Text></View>
              {pendingReviews.map((item) => <ReviewRow key={item.label} {...item} />)}
            </View> : null;
          })()}
        </Animated.View>
      </ScrollView> : (
        <View style={styles.secondaryLayout}>
          <View style={[styles.topBar, styles.secondaryTopBar]}>
            <Image source={require('../../assets/qureocity-login.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="QureoCity" />
            <View style={styles.topActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Notifications and requests" onPress={() => navigate('requests')} style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}><Text style={styles.searchGlyph}>♧</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Global search" onPress={() => setSearchOpen(true)} style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}><Text style={styles.searchGlyph}>⌕</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="More admin tools" accessibilityState={{ expanded: moreOpen }} onPress={() => setMoreOpen((open) => !open)} style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}><Text style={styles.searchGlyph}>•••</Text></Pressable>
            </View>
          </View>
          <View style={styles.secondaryScreen}>{secondaryScreen}</View>
        </View>
      )}

      <Modal visible={activeView === 'overview' && detailKind !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailKind(null)}>
        <View style={styles.detailSheet}>
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>ADMIN WORKSPACE</Text>
              <Text accessibilityRole="header" style={styles.detailTitle}>{detailKind === 'kids' ? 'Children on site' : detailKind === 'staff' ? 'Staff on site' : detailKind === 'checkins' ? 'Today’s check-ins' : 'Pending requests'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setDetailKind(null)} style={styles.detailClose}><Text style={styles.detailCloseText}>Done</Text></Pressable>
          </View>
          {detailWarning ? <Text style={styles.detailWarning}>{detailWarning}</Text> : null}
          {detailLoading ? <ActivityIndicator color={C.plum} style={styles.detailLoader} /> : detailError ? (
            <Pressable accessibilityRole="button" onPress={() => detailKind && void openDetails(detailKind)} style={styles.loadError}>
              <Text style={styles.loadErrorTitle}>Details didn’t load</Text>
              <Text style={styles.loadErrorBody}>{detailError} · Tap to retry.</Text>
            </Pressable>
          ) : detailItems.length === 0 ? <Text style={styles.detailEmpty}>Nothing to show right now.</Text> : (
            <ScrollView contentContainerStyle={styles.detailList} showsVerticalScrollIndicator={false}>
              {detailItems.map((item, index) => (
                item.checkin ? (
                  <CheckinDetailRow
                    key={item.checkin.sessionId || `${item.title}-${index}`}
                    item={item.checkin}
                    expanded={expandedCheckinId === item.checkin.sessionId}
                    onToggleParent={() => setExpandedCheckinId((current) => current === item.checkin!.sessionId ? null : item.checkin!.sessionId)}
                    onCall={() => void callParent(item.checkin!.parentPhone)}
                    onMessage={() => void messageParent(item.checkin!.parentPhone, item.checkin!.parentName, item.checkin!.childName)}
                    onEdit={() => {
                      const visit = item.checkin!;
                      setDetailKind(null);
                      setCustomerSearchSeed(visit.parentPhone || visit.parentName);
                      setCustomerChildSeed(visit.childId);
                      navigate('customers');
                    }}
                  />
                ) : item.staff ? (
                  <StaffDetailRow
                    key={item.staff.employeeId}
                    item={item.staff}
                    expanded={expandedStaffId === item.staff.employeeId}
                    notifying={notifyingEmployeeId === item.staff.employeeId}
                    onToggle={() => setExpandedStaffId((current) => current === item.staff!.employeeId ? null : item.staff!.employeeId)}
                    onNotify={() => confirmStaffNotification(item.staff!)}
                    onViewDetails={() => {
                      setStaffSearchSeed(item.staff!.employeeId);
                      setDetailKind(null);
                      navigate('staff');
                    }}
                  />
                ) : (
                  <View key={`${item.title}-${index}`} style={styles.detailRow}>
                    <Text style={styles.detailItemTitle}>{item.title}</Text>
                    <Text style={styles.detailItemSubtitle}>{item.subtitle}</Text>
                  </View>
                )
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      {bottomNavigation}
      <AdminGlobalSearch visible={searchOpen} onClose={() => setSearchOpen(false)} onOpenCustomer={(query) => { setCustomerSearchSeed(query); navigate('customers'); }} onOpenEmployee={(id) => { setStaffSearchSeed(id); navigate('staff'); }} onNavigate={(page) => { if(page==='inbox')navigate('requests');else if(page==='customers'){setCustomerSearchSeed('');navigate('customers');}else if(page==='plans')navigate('plans');else if(page==='staff')navigate('staff');else if(page==='settings')navigate('settings'); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  overviewRoot: { backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, paddingTop: 10, paddingBottom: 116 },
  overviewScroll: { paddingTop: 17 },
  secondaryLayout: { flex: 1, paddingHorizontal: 18, paddingTop: 8 },
  secondaryTopBar: { marginBottom: 12 },
  secondaryScreen: { flex: 1, paddingBottom: 88 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 27 },
  overviewTopBar: { marginBottom: 32, paddingHorizontal: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  overviewIconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  searchMark: { width: 22, height: 22, position: 'relative' },
  searchMarkLens: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: '#8E60FF', position: 'absolute', left: 1, top: 1 },
  searchMarkHandle: { width: 8, height: 2, borderRadius: 2, backgroundColor: '#8E60FF', position: 'absolute', right: 0, bottom: 2, transform: [{ rotate: '45deg' }] },
  bellMark: { width: 20, height: 22, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  bellDome: { width: 14, height: 15, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderWidth: 1.8, borderBottomWidth: 0, borderColor: '#8E60FF' },
  bellBase: { width: 18, height: 2, borderRadius: 2, backgroundColor: '#8E60FF', marginTop: -1 },
  bellClapper: { width: 4, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#8E60FF', marginTop: 1 },
  overviewRefresh: { color: '#8E60FF', fontSize: 23, lineHeight: 26 },
  searchButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  searchGlyph: { color: C.plum, fontSize: 25, lineHeight: 30 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandLogo: { width: 92, height: 34 },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  refreshGlyph: { color: C.plum, fontSize: 25, lineHeight: 29, fontWeight: '500' },
  greetingBlock: { marginBottom: 20 },
  overviewSection: { marginBottom: 29 },
  overviewEyebrow: { color: '#77727F', fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 1.1, marginBottom: 3 },
  checkinCountRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkinCount: { color: '#0A0A0A', fontSize: 54, lineHeight: 62, fontWeight: '700', letterSpacing: -2 },
  checkinCountArrow: { color: '#8E60FF', fontSize: 25, paddingHorizontal: 7 },
  overviewSectionTitleRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7 },
  sectionMarker: { width: 4, height: 16, borderRadius: 3, backgroundColor: '#8E60FF' },
  minimalSectionTitle: { flex: 1, color: '#1A1A1A', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  staffCount: { color: '#8E60FF', fontSize: 12, fontWeight: '700' },
  staffOnSiteRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECEAF0' },
  staffOnSiteName: { color: '#1A1A1A', fontSize: 13, fontWeight: '600' },
  staffPunchTime: { color: '#77727F', fontSize: 11 },
  overviewQuietText: { color: '#77727F', fontSize: 12, paddingVertical: 9 },
  greetingTitle: { color: C.ink, fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.45 },
  greetingBody: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  loadError: { backgroundColor: '#FBE8E2', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 16 },
  loadErrorTitle: { color: '#9F413C', fontSize: 11, fontWeight: '800' },
  loadErrorBody: { color: '#9F625D', fontSize: 10, lineHeight: 15, marginTop: 3 },
  detailSheet: { flex: 1, backgroundColor: C.canvas, paddingHorizontal: 20, paddingTop: 22 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.line, paddingBottom: 16, marginBottom: 12 },
  detailTitle: { color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 4 },
  detailClose: { backgroundColor: C.plumTint, borderRadius: 11, paddingHorizontal: 14, paddingVertical: 9 },
  detailCloseText: { color: C.plumDark, fontSize: 11, fontWeight: '800' },
  detailLoader: { marginTop: 36 },
  detailWarning: { color: '#846314', backgroundColor: '#FFF8E5', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, fontSize: 10, lineHeight: 15, marginBottom: 9 },
  detailEmpty: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 36 },
  detailList: { paddingBottom: 28 },
  detailRow: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 13, marginBottom: 8 },
  detailItemTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  detailItemSubtitle: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  staffDetailCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17, paddingHorizontal: 13, paddingTop: 12, marginBottom: 8 },
  staffDetailSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  staffInitial: { width: 36, height: 36, borderRadius: 13, backgroundColor: C.plumTint, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  staffInitialText: { color: C.plumDark, fontSize: 14, fontWeight: '800' },
  staffDetailCopy: { flex: 1 },
  staffDetailName: { color: C.ink, fontSize: 12, fontWeight: '800' },
  staffStatus: { fontSize: 8, fontWeight: '900', letterSpacing: 0.65, marginTop: 4 },
  staffStatus_present: { color: '#2F8B69' },
  staffStatus_left: { color: C.muted },
  staffStatus_absent: { color: C.coral },
  staffStatus_off: { color: C.muted },
  staffStatus_on_leave: { color: '#A97916' },
  staffStatus_shift_not_started: { color: C.plum },
  staffDisclosureArrow: { color: C.muted, fontSize: 16, paddingHorizontal: 4 },
  staffExpanded: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 9, paddingTop: 10, paddingBottom: 5 },
  staffTimes: { color: C.muted, fontSize: 10, marginBottom: 5 },
  staffActions: { flexDirection: 'row', gap: 24, paddingTop: 5 },
  staffAction: { minHeight: 35, justifyContent: 'center' },
  staffActionText: { color: C.plum, fontSize: 11, fontWeight: '800' },
  checkinCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 9, marginBottom: 9 },
  checkinHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  checkinTitleBlock: { flex: 1 },
  checkinChildName: { color: C.ink, fontSize: 14, fontWeight: '800' },
  checkinParentPreview: { color: C.muted, fontSize: 10, marginTop: 3 },
  checkinStatus: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6, marginTop: 2 },
  memberStatus: { color: C.plum },
  guestStatus: { color: C.muted },
  checkinPlan: { color: C.plumDark, fontSize: 10, fontWeight: '700', marginTop: 9 },
  checkinTiming: { color: C.muted, fontSize: 10, marginTop: 4 },
  checkinActions: { flexDirection: 'row', gap: 23, paddingTop: 11, paddingBottom: 8 },
  checkinAction: { minHeight: 34, justifyContent: 'center' },
  checkinActionText: { color: C.plum, fontSize: 11, fontWeight: '800' },
  parentDisclosure: { minHeight: 35, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  parentDisclosureText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  parentDisclosureArrow: { color: C.muted, fontSize: 15 },
  parentDetails: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, paddingBottom: 3 },
  parentName: { color: C.ink, fontSize: 11, fontWeight: '700' },
  parentPhone: { color: C.muted, fontSize: 10, marginTop: 3 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  sectionEyebrow: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, marginTop: 3 },
  istPill: { backgroundColor: C.plumTint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 2 },
  istPillText: { color: C.plumDark, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  dailyCard: { borderRadius: 16, padding: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 12 },
  dailyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dailySummary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: C.line, marginTop: 12, paddingTop: 12 },
  dailyValue: { color: C.ink, fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -1 },
  dailyCopy: { flex: 1 },
  dailyLabel: { color: C.ink, fontSize: 12, fontWeight: '700' },
  dailyHint: { color: C.muted, fontSize: 10, marginTop: 3 },
  dailyArrow: { color: C.muted, fontSize: 22 },
  homeMetricGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  homeMetric: { flex: 1, minHeight: 108, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  homeMetricTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  homeMetricIcon: { color: C.plum, fontSize: 18, fontWeight: '800' },
  homeMetricArrow: { color: '#8B8373', fontSize: 16 },
  homeMetricValue: { color: C.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -1, marginTop: 7 },
  homeMetricLabel: { color: C.muted, fontSize: 10, fontWeight: '700', marginTop: 1 },
  reviewHeading: { marginBottom: 8 },
  reviewList: { borderTopWidth: 1, borderTopColor: C.line, marginBottom: 20 },
  reviewRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECEAF0', paddingVertical: 8 },
  reviewIcon: { width: 28, color: '#8E60FF', fontSize: 16, fontWeight: '700' },
  reviewCopy: { flex: 1, paddingRight: 8 },
  reviewTitle: { color: '#1A1A1A', fontSize: 12, fontWeight: '700' },
  reviewDetail: { color: '#77727F', fontSize: 10, lineHeight: 14, marginTop: 2 },
  reviewCount: { minWidth: 28, textAlign: 'right', color: '#0A0A0A', fontSize: 16, fontWeight: '700' },
  reviewArrow: { width: 20, textAlign: 'right', color: '#8E60FF', fontSize: 20 },
  menuBackdrop: { ...StyleSheet.absoluteFill, zIndex: 8 },
  moreMenu: { position: 'absolute', zIndex: 11, left: 20, right: 20, bottom: 91, maxHeight: 420, borderRadius: 24, overflow: 'hidden', backgroundColor: '#FFFFFFF2', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#15130F', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 12 },
  moreMenuContent: { paddingHorizontal: 13, paddingVertical: 8 },
  moreMenuItem: { minHeight: 47, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E9DFC4' },
  moreMenuIcon: { width: 29, color: C.plum, fontSize: 17, fontWeight: '700' },
  moreMenuLabel: { flex: 1, color: C.ink, fontSize: 12, fontWeight: '600' },
  moreMenuSignOut: { color: C.coral },
  moreMenuChevron: { color: C.muted, fontSize: 21, lineHeight: 24, paddingLeft: 6 },
  navDock: { position: 'absolute', zIndex: 12, left: 13, right: 13, bottom: 10, minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 3, paddingHorizontal: 5, paddingVertical: 5, borderRadius: 17, backgroundColor: '#FFFFFFF2', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#15130F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.13, shadowRadius: 20, elevation: 10 },
  navItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, paddingHorizontal: 2, paddingVertical: 5 },
  navItemSelected: { borderWidth: 1, borderColor: '#C9B6D4', backgroundColor: '#EEE6F1' },
  navIcon: { color: '#716B5E', fontSize: 20, lineHeight: 24, fontWeight: '700' },
  navIconSelected: { color: C.plum, fontWeight: '900' },
  navLabel: { color: '#716B5E', fontSize: 9, fontWeight: '600', marginTop: 2 },
  navLabelSelected: { color: C.plumDark, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
