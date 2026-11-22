import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';
import MobileNotifications from '../components/MobileNotifications';
import AccountSecurity from '../components/AccountSecurity';
import StaffAttendance from './StaffAttendance';
import StaffDirectory from './StaffDirectory';

const C = { ...colors, mint: colors.mintSoft, gold: colors.goldSoft };

const VENUE_CAPACITY = 60;

type OnSiteChild = {
  session_id: string;
  child_id: string;
  child_name: string;
  age: number;
  start_time: string;
  end_time: string | null;
  status: string;
  parent_name: string;
  phone: string;
  has_medical_info: boolean;
  visit_type: 'membership' | 'walk_in' | 'special' | null;
  plan_name: string | null;
  is_special_today: boolean;
  special_plan_name: string | null;
};

function istDateKey() {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function countdown(endTime: string | null, now: number) {
  if (!endTime) return { label: 'No set end time', tone: 'unlimited' as const };
  const remaining = new Date(endTime).getTime() - now;
  if (remaining <= 0) {
    const late = Math.max(1, Math.ceil(Math.abs(remaining) / 60_000));
    return { label: `Overdue · ${late}m`, tone: 'late' as const };
  }
  const minutes = Math.ceil(remaining / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const label = hours ? `Ends in ${hours}h ${rest}m` : `Ends in ${minutes}m`;
  return { label, tone: minutes <= 15 ? 'soon' as const : 'normal' as const };
}

function ChildCard({
  child,
  now,
  busy,
  onExtend,
  onCheckout,
}: {
  child: OnSiteChild;
  now: number;
  busy: boolean;
  onExtend: (child: OnSiteChild, minutes: 30 | 60) => void;
  onCheckout: (child: OnSiteChild) => void;
}) {
  const timer = countdown(child.end_time, now);
  const canExtend = child.visit_type === 'walk_in' && !!child.end_time && !child.is_special_today;

  return (
    <View style={styles.childCard}>
      <View style={styles.childHeader}>
        <View style={styles.childAvatar}><Text style={styles.childAvatarText}>{child.child_name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.childIdentity}>
          <Text style={styles.childName} numberOfLines={1}>{child.child_name}</Text>
          <Text style={styles.parentName} numberOfLines={1}>{child.parent_name}{child.age ? ` · ${child.age} yrs` : ''}</Text>
        </View>
        {child.has_medical_info ? (
          <View style={styles.carePill}><Text style={styles.carePillText}>CARE NOTE</Text></View>
        ) : null}
      </View>

      <View style={styles.childMetaRow}>
        <View style={[styles.timerPill, timer.tone === 'late' ? styles.timerLate : timer.tone === 'soon' ? styles.timerSoon : timer.tone === 'unlimited' ? styles.timerUnlimited : styles.timerNormal]}>
          <View style={[styles.timerDot, timer.tone === 'late' ? styles.dotLate : timer.tone === 'soon' ? styles.dotSoon : timer.tone === 'unlimited' ? styles.dotUnlimited : styles.dotNormal]} />
          <Text style={[styles.timerText, timer.tone === 'late' ? styles.textLate : timer.tone === 'soon' ? styles.textSoon : timer.tone === 'unlimited' ? styles.textUnlimited : styles.textNormal]}>{timer.label}</Text>
        </View>
        <Text style={styles.visitType} numberOfLines={1}>
          {child.visit_type === 'walk_in' ? 'Walk-in' : child.visit_type === 'special' ? (child.special_plan_name ?? 'Special pass') : 'Membership'}
        </Text>
      </View>

      <View style={styles.childActions}>
        {child.phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${child.parent_name}`}
            onPress={() => void Linking.openURL(`tel:${child.phone}`)}
            style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
          >
            <Text style={styles.callIcon}>☎</Text>
            <Text style={styles.callText}>Call parent</Text>
          </Pressable>
        ) : <View style={styles.actionSpacer} />}
        {canExtend ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => onExtend(child, 30)}
              style={({ pressed }) => [styles.extendButton, pressed && !busy && styles.pressed, busy && styles.busyButton]}
            >
              {busy ? <ActivityIndicator color={C.plum} size="small" /> : <Text style={styles.extendText}>+30m</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={() => onExtend(child, 60)}
              style={({ pressed }) => [styles.extendButton, pressed && !busy && styles.pressed, busy && styles.busyButton]}
            >
              <Text style={styles.extendText}>+1 hr</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => onCheckout(child)}
          style={({ pressed }) => [styles.checkoutButton, pressed && !busy && styles.checkoutPressed, busy && styles.busyButton]}
        >
          <Text style={styles.checkoutText}>Check out</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function StaffDashboard({
  employeeName,
  onSignOut,
}: {
  employeeName: string;
  onSignOut: () => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 370;
  const [kids, setKids] = useState<OnSiteChild[]>([]);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'attendance' | 'directory' | 'settings'>('home');
  const [now, setNow] = useState(() => Date.now());
  const entrance = useRef(new Animated.Value(0)).current;
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayKey = useMemo(() => istDateKey(), []);

  const loadSnapshot = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);

    const start = new Date(`${todayKey}T00:00:00+05:30`);
    const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    try {
      const [kidsResult, todayResult] = await Promise.all([
        supabase.rpc('dashboard_list_checked_in_kids'),
        supabase.from('play_sessions')
          .select('id', { count: 'exact', head: true })
          .gte('start_time', start.toISOString())
          .lt('start_time', tomorrow.toISOString())
          .in('status', ['active', 'completed', 'expired']),
      ]);

      if (kidsResult.error) throw kidsResult.error;
      setKids((kidsResult.data as OnSiteChild[] | null) ?? []);
      setTodayCount(todayResult.error ? null : todayResult.count ?? 0);
      if (todayResult.error) setLoadError('Today’s check-in total is unavailable. The on-site list is current.');
    } catch {
      setLoadError('Couldn’t refresh the on-site list. Tap refresh to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [todayKey]);

  useEffect(() => {
    Animated.spring(entrance, { toValue: 1, damping: 19, stiffness: 125, mass: 0.8, useNativeDriver: true }).start();
  }, [entrance]);

  useEffect(() => {
    void loadSnapshot();
    const channel = supabase
      .channel('mobile-staff-play-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_sessions' }, () => {
        // Coalesce rapid multi-row updates into one snapshot refresh.
        if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
        realtimeRefreshTimer.current = setTimeout(() => void loadSnapshot(true), 300);
      })
      .subscribe();
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(timer);
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [loadSnapshot]);

  const extendSession = (child: OnSiteChild, minutes: 30 | 60) => {
    Alert.alert(
      `Add ${minutes === 60 ? '1 hour' : '30 minutes'}?`,
      `Extend ${child.child_name}’s walk-in session.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void runSessionAction(child, 'extend', minutes) },
      ],
    );
  };

  const checkOut = (child: OnSiteChild) => {
    Alert.alert(
      'Check out child?',
      `End ${child.child_name}’s visit now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Check out', style: 'destructive', onPress: () => void runSessionAction(child, 'checkout') },
      ],
    );
  };

  const runSessionAction = async (child: OnSiteChild, action: 'extend' | 'checkout', minutes?: 30 | 60) => {
    setBusySessionId(child.session_id);
    try {
      const result = action === 'extend'
        ? await supabase.rpc('staff_extend_walkin_session', { p_session_id: child.session_id, p_minutes: minutes })
        : await supabase.rpc('checkout_session', { p_session_id: child.session_id });
      if (result.error) throw result.error;
      await loadSnapshot(true);
      if (action === 'extend') {
        Alert.alert('Time added', `${minutes === 60 ? '1 hour' : '30 minutes'} added for ${child.child_name}.`);
      }
    } catch (cause) {
      Alert.alert('Couldn’t update this visit', cause instanceof Error ? cause.message : 'Please refresh and try again.');
      await loadSnapshot(true);
    } finally {
      setBusySessionId(null);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  const visibleKids = kids.filter((kid) => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle || kid.child_name.toLocaleLowerCase().includes(needle) || kid.parent_name.toLocaleLowerCase().includes(needle);
  });
  const fill = Math.min(kids.length / VENUE_CAPACITY, 1);
  const viewStyle = {
    opacity: entrance,
    transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const tabBar = <View style={styles.tabBar}>
    {([['home', '⌂', 'Home'], ['directory', '⌕', 'Customers'], ['attendance', '◷', 'Attendance'], ['settings', '⚙', 'Settings']] as const).map(([tab, icon, label]) => {
      const active = activeTab === tab;
      return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setActiveTab(tab)} style={active ? styles.tabActive : styles.tabItem}>
        <Text style={active ? styles.tabIconActive : styles.tabIcon}>{icon}</Text><Text style={active ? styles.tabTextActive : styles.tabText}>{label}</Text>
      </Pressable>;
    })}
  </View>;

  if (activeTab === 'attendance') {
    return <View style={styles.root}><StaffAttendance onBack={() => setActiveTab('home')} />{tabBar}</View>;
  }

  if (activeTab === 'directory') {
    return <View style={styles.root}><StaffDirectory onBack={() => setActiveTab('home')} />{tabBar}</View>;
  }

  if (activeTab === 'settings') {
    return <View style={styles.root}><ScrollView contentContainerStyle={[styles.scrollContent, { paddingHorizontal: compact ? 18 : 24 }]}>
      <View style={styles.content}><View style={styles.topBar}><Image source={require('../../assets/qureocity-login.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="QureoCity" /></View>
        <Text accessibilityRole="header" style={styles.pageTitle}>Settings</Text><Text style={styles.greetingBody}>Notifications and account settings.</Text>
        <MobileNotifications />
        <AccountSecurity />
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: signingOut }} disabled={signingOut} onPress={() => void signOut()} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
          {signingOut ? <ActivityIndicator color={C.plumDark} size="small" /> : <Text style={styles.signOutText}>Sign out · {employeeName}</Text>}
        </Pressable>
      </View>
    </ScrollView>{tabBar}</View>;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: compact ? 18 : 24 }]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, viewStyle]}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <Image source={require('../../assets/qureocity-login.png')} style={styles.brandLogo} resizeMode="contain" accessibilityLabel="QureoCity" />
              <View style={styles.userIdentity}><Text style={styles.welcomeBack}>Welcome back</Text><Text style={styles.userName} numberOfLines={1}>{employeeName}</Text></View>
            </View>
            <View style={styles.topActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Customer search" onPress={() => setActiveTab('directory')} style={styles.headerAction}><Text style={styles.headerActionText}>⌕</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Notification settings" onPress={() => setActiveTab('settings')} style={styles.headerAction}><Text style={styles.headerActionText}>♧</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh on-site list" onPress={() => void loadSnapshot(true)} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
                {refreshing ? <ActivityIndicator color={C.plum} size="small" /> : <Text style={styles.refreshGlyph}>↻</Text>}
              </Pressable>
            </View>
          </View>

          <View style={styles.greetingBlock}>
            <Text accessibilityRole="header" style={styles.greetingTitle}>Home</Text>
            <Text style={styles.greetingBody}>Here’s the floor at a glance.</Text>
          </View>

          <View style={styles.venueCard}>
            <View style={styles.venueHeader}>
              <View style={styles.venueLabelRow}><View style={styles.liveDot} /><Text style={styles.venueLabel}>KIDS ON SITE</Text></View>
              <Text style={styles.capacityLabel}>CAPACITY {VENUE_CAPACITY}</Text>
            </View>
            <View style={styles.venueCounts}>
              <View style={styles.venuePrimary}>
                <Text style={styles.venueNumber}>{loading ? '—' : kids.length}</Text>
                <Text style={styles.venueCaption}>currently checked in</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.todayMetric}>
                <Text style={styles.todayNumber}>{loading ? '—' : todayCount ?? '—'}</Text>
                <Text style={styles.todayLabel}>check-ins today</Text>
              </View>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(fill * 100, kids.length ? 4 : 0)}%` }]} /></View>
            <Text style={styles.capacityFootnote}>{loading ? 'Loading floor count…' : `${Math.max(VENUE_CAPACITY - kids.length, 0)} spaces available`}</Text>
          </View>

          <View style={styles.listHeading}>
            <View>
              <Text style={styles.sectionEyebrow}>FLOOR</Text>
              <Text style={styles.sectionTitle}>On-site children</Text>
            </View>
            <View style={styles.countPill}><Text style={styles.countPillText}>{kids.length} HERE</Text></View>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput
              accessibilityLabel="Search on-site children or parents"
              value={query}
              onChangeText={setQuery}
              placeholder="Find a child or parent"
              placeholderTextColor="#8B8373"
              autoCapitalize="words"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
          </View>

          {loadError ? (
            <Pressable accessibilityRole="button" onPress={() => void loadSnapshot(true)} style={({ pressed }) => [styles.errorCard, pressed && styles.pressed]}>
              <Text style={styles.errorTitle}>Floor refresh needed</Text>
              <Text style={styles.errorText}>{loadError}</Text>
            </Pressable>
          ) : null}

          {loading ? (
            <View style={styles.loadingCard}><ActivityIndicator color={C.plum} /><Text style={styles.loadingText}>Loading today’s floor…</Text></View>
          ) : visibleKids.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>{query ? '⌕' : '✓'}</Text></View>
              <Text style={styles.emptyTitle}>{query ? 'No matching child' : 'The floor is clear'}</Text>
              <Text style={styles.emptyText}>{query ? 'Try another child or parent name.' : 'Checked-in children will appear here.'}</Text>
            </View>
          ) : (
            <View style={styles.childList}>
              {visibleKids.map((child) => (
                <ChildCard
                  key={child.session_id}
                  child={child}
                  now={now}
                  busy={busySessionId === child.session_id}
                  onExtend={extendSession}
                  onCheckout={checkOut}
                />
              ))}
            </View>
          )}

          <Text style={styles.footer}>A better day at the play space.</Text>
        </Animated.View>
      </ScrollView>

      {tabBar}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  scrollContent: { flexGrow: 1, paddingTop: 10, paddingBottom: 28 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 21 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  brandLogo: { width: 78, height: 30 },
  userIdentity: { minWidth: 0, borderLeftWidth: 1, borderLeftColor: C.line, paddingLeft: 9 },
  welcomeBack: { color: C.muted, fontSize: 9, lineHeight: 12 },
  userName: { color: C.ink, fontSize: 11, fontWeight: '800', maxWidth: 90 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerAction: { width: 34, height: 36, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  headerActionText: { color: C.muted, fontSize: 20, lineHeight: 24 },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  refreshGlyph: { color: C.plum, fontSize: 25, lineHeight: 29, fontWeight: '500' },
  greetingBlock: { marginBottom: 20 },
  pageTitle: { color: C.ink, fontSize: 19, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3, marginTop: 5 },
  greetingTitle: { color: C.ink, fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.45 },
  greetingBody: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  venueCard: { borderRadius: 24, backgroundColor: C.plumDark, padding: 20, marginBottom: 25 },
  venueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  venueLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.mint },
  venueLabel: { color: '#E8DDEA', fontSize: 10, fontWeight: '800', letterSpacing: 1.05 },
  capacityLabel: { color: '#D3C5D7', fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  venueCounts: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 17 },
  venuePrimary: { flex: 1 },
  venueNumber: { color: '#FFFFFF', fontSize: 46, lineHeight: 50, fontWeight: '800', letterSpacing: -1.8 },
  venueCaption: { color: '#DED4E1', fontSize: 12, fontWeight: '600', marginTop: 1 },
  divider: { width: 1, height: 47, backgroundColor: '#FFFFFF2A', marginHorizontal: 18 },
  todayMetric: { width: 104 },
  todayNumber: { color: '#FFFFFF', fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.7 },
  todayLabel: { color: '#DED4E1', fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: '#FFFFFF26', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.mint, borderRadius: 6 },
  capacityFootnote: { color: '#D3C5D7', fontSize: 10, fontWeight: '600', marginTop: 9 },
  listHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 13 },
  sectionEyebrow: { color: C.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.25 },
  sectionTitle: { color: C.ink, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, marginTop: 3 },
  countPill: { backgroundColor: C.plumTint, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 2 },
  countPillText: { color: C.plumDark, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  searchBox: { height: 47, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 12 },
  searchGlyph: { color: C.muted, fontSize: 22, marginRight: 8 },
  searchInput: { flex: 1, color: C.ink, fontSize: 12, paddingVertical: 0 },
  clearSearch: { color: C.muted, fontSize: 21, paddingHorizontal: 3 },
  errorCard: { backgroundColor: '#FBE8E2', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 13, padding: 12, marginBottom: 12 },
  errorTitle: { color: '#9F413C', fontSize: 11, fontWeight: '800' },
  errorText: { color: '#9F625D', fontSize: 10, lineHeight: 15, marginTop: 3 },
  loadingCard: { minHeight: 150, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: C.muted, fontSize: 11, fontWeight: '600' },
  emptyCard: { minHeight: 180, backgroundColor: C.surface, borderRadius: 19, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', padding: 22 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: C.plumTint, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emptyIconText: { color: C.plum, fontSize: 23, fontWeight: '700' },
  emptyTitle: { color: C.ink, fontSize: 13, fontWeight: '800' },
  emptyText: { color: C.muted, fontSize: 10, marginTop: 5, textAlign: 'center' },
  childList: { gap: 10 },
  childCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 17, padding: 13 },
  childHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  childAvatar: { width: 39, height: 39, borderRadius: 14, backgroundColor: C.plumTint, alignItems: 'center', justifyContent: 'center' },
  childAvatarText: { color: C.plumDark, fontSize: 15, fontWeight: '800' },
  childIdentity: { flex: 1, minWidth: 0 },
  childName: { color: C.ink, fontSize: 13, fontWeight: '800' },
  parentName: { color: C.muted, fontSize: 10, marginTop: 3 },
  carePill: { backgroundColor: '#FBE8E2', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5 },
  carePillText: { color: C.coral, fontSize: 7, fontWeight: '900', letterSpacing: 0.6 },
  childMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 11 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999 },
  timerNormal: { backgroundColor: '#EAF2E4' },
  timerSoon: { backgroundColor: '#FBF0CF' },
  timerLate: { backgroundColor: '#FBE8E2' },
  timerUnlimited: { backgroundColor: '#EAF0F4' },
  timerDot: { width: 6, height: 6, borderRadius: 3 },
  dotNormal: { backgroundColor: '#4B9C7C' },
  dotSoon: { backgroundColor: '#D69B34' },
  dotLate: { backgroundColor: C.coral },
  dotUnlimited: { backgroundColor: '#5C90B5' },
  timerText: { fontSize: 9, fontWeight: '800' },
  textNormal: { color: '#3E8068' },
  textSoon: { color: '#9D7227' },
  textLate: { color: '#9F413C' },
  textUnlimited: { color: '#4F7C9D' },
  visitType: { color: C.muted, fontSize: 9, fontWeight: '700', marginLeft: 7, flexShrink: 1, textAlign: 'right' },
  childActions: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#F0ECEF', paddingTop: 10 },
  callButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 8 },
  callIcon: { color: C.plum, fontSize: 12 },
  callText: { color: C.plumDark, fontSize: 9, fontWeight: '700' },
  actionSpacer: { flex: 1 },
  extendButton: { minHeight: 36, minWidth: 43, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCCFE2', backgroundColor: '#F7F2F8', borderRadius: 10, paddingHorizontal: 7 },
  extendText: { color: C.plumDark, fontSize: 9, fontWeight: '800' },
  checkoutButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: C.plum, paddingHorizontal: 10, marginLeft: 'auto' },
  checkoutPressed: { backgroundColor: C.plumDark, transform: [{ scale: 0.98 }] },
  checkoutText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  busyButton: { opacity: 0.55 },
  signOutButton: { minHeight: 45, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  signOutText: { color: C.plumDark, fontSize: 11, fontWeight: '700' },
  footer: { color: '#8B8373', fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 14 },
  tabBar: { position: 'absolute', zIndex: 12, left: 13, right: 13, bottom: 10, minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 3, backgroundColor: '#FFFFFFF2', borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 17, paddingHorizontal: 5, paddingVertical: 5, shadowColor: '#15130F', shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.13, shadowRadius: 20, elevation: 10 },
  tabActive: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#C9B6D4', backgroundColor: '#EEE6F1', paddingVertical: 5 },
  tabItem: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, paddingVertical: 5 },
  tabIconActive: { color: C.plum, fontSize: 19, lineHeight: 22, fontWeight: '800' },
  tabIcon: { color: C.muted, fontSize: 19, lineHeight: 22, fontWeight: '700' },
  tabTextActive: { color: C.plumDark, fontSize: 8, fontWeight: '800', marginTop: 2 },
  tabText: { color: C.muted, fontSize: 8, fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
