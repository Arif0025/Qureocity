import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';

const C = { ...colors, tint: colors.plumTint, dark: colors.plumDark };
const TOKEN_KEY = 'qureocity.mobile-push-token';
type EventPreference = { event_type: string; enabled: boolean };
type SettingsResponse = { role: string; device_registered: boolean; events: EventPreference[] };
type Rule = { event_type: string; enabled: boolean; employee_scope: 'none' | 'on_duty' | 'all'; show_child_name: boolean; params: Record<string, unknown> };
const EVENT_LABELS: Record<string, string> = {
  child_checkin: 'Child checked in', child_checkout: 'Child checked out',
  session_ending: "Child's time nearly up", session_overdue: 'Child session overdue',
  staff_punch_in: 'Staff punched in', staff_punch_out: 'Staff punched out',
  new_registration: 'New registration request', party_registration: 'New party request',
  employee_leave: 'Staff leave request',
};

export default function MobileNotifications() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    const { data, error: loadError } = await supabase.rpc('mobile_push_my_settings', { p_token: token });
    if (loadError) setError(loadError.message);
    else {
      const next = data as SettingsResponse;
      setSettings(next);
      if (next.role === 'admin') {
        const { data: overview, error: overviewError } = await supabase.rpc('admin_notification_overview');
        if (overviewError) setError(overviewError.message);
        else setRules(((overview as { rules?: Rule[] } | null)?.rules ?? []).filter(rule => !['session_ending','session_overdue'].includes(rule.event_type)));
      }
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const registerDevice = async () => {
    setBusy(true); setError('');
    try {
      const permission = await Notifications.getPermissionsAsync();
      const granted = permission.granted || (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) throw new Error('Allow notifications in your phone settings to enable alerts.');
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('staff-updates', { name: 'Staff updates', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#7A558C' });
      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== 'string' || !projectId) throw new Error('The Expo project ID is missing from the app configuration.');
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      const { error: saveError } = await supabase.rpc('mobile_push_register_device', { p_token: token, p_platform: Platform.OS, p_device_label: Platform.OS === 'android' ? 'Android app' : 'iOS app' });
      if (saveError) throw saveError;
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await load();
      Alert.alert('Notifications enabled', 'This phone is registered. Turn on the event switches you want to receive.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable notifications.');
    } finally { setBusy(false); }
  };

  const unregisterDevice = () => Alert.alert('Turn off this device?', 'This phone will stop receiving QureoCity push notifications.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Turn off', style: 'destructive', onPress: () => { void (async () => {
      setBusy(true); setError('');
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          const { error: removeError } = await supabase.rpc('mobile_push_unregister_device', { p_token: token });
          if (removeError) throw removeError;
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
        await load();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not turn off notifications.'); }
      finally { setBusy(false); }
    })(); } },
  ]);

  const setPreference = async (event: string, enabled: boolean) => {
    setSettings(current => current ? { ...current, events: current.events.map(item => item.event_type === event ? { ...item, enabled } : item) } : current);
    const { error: saveError } = await supabase.rpc('push_set_preference', { p_event: event, p_enabled: enabled });
    if (saveError) { setError(saveError.message); await load(); }
  };

  const saveRule = async (rule: Rule, patch: Partial<Rule>) => {
    const next = { ...rule, ...patch };
    setRules(current => current.map(item => item.event_type === rule.event_type ? next : item));
    const { error: saveError } = await supabase.rpc('admin_save_notification_rule', {
      p_event: rule.event_type, p_enabled: next.enabled, p_employee_scope: next.employee_scope,
      p_show_child_name: next.show_child_name, p_params: next.params ?? {},
    });
    if (saveError) { setError(saveError.message); await load(); }
  };

  const sendTest = async () => {
    setBusy(true); setError('');
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) throw new Error('Enable notifications on this phone first.');
      const { data, error: testError } = await supabase.functions.invoke('mobile-notification-test', { body: { token } });
      if (testError) {
        const context = (testError as { context?: Response }).context;
        const responseBody = context ? await context.clone().text().catch(() => '') : '';
        let serverMessage = '';
        if (responseBody) {
          try {
            const body = JSON.parse(responseBody) as { error?: string; message?: string };
            serverMessage = body.error ?? body.message ?? '';
          } catch {
            serverMessage = responseBody.trim().slice(0, 240);
          }
        }
        const status = context ? `HTTP ${context.status}` : '';
        throw new Error([serverMessage || testError.message, status].filter(Boolean).join(' · '));
      }
      if (data?.error) throw new Error(data.error);
      Alert.alert('Test sent', 'A push notification was sent to this phone. Delivery may take a few seconds.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send a test notification.'); }
    finally { setBusy(false); }
  };

  return <View style={styles.card}>
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.title}>Mobile notifications</Text><Text style={styles.copy}>Choose which team events can alert you on this phone.</Text></View><Pressable onPress={() => void load()}><Text style={styles.refresh}>Refresh</Text></Pressable></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={C.plum} /> : <>
    <View style={styles.deviceRow}><View style={{ flex: 1 }}><Text style={styles.deviceTitle}>{settings?.device_registered ? 'This phone is connected' : 'This phone is not connected'}</Text><Text style={styles.copy}>{settings?.device_registered ? 'Turn on the event switches you want below.' : 'Enable this phone, then choose event switches below. Staff delivery also depends on admin rules.'}</Text></View><Pressable disabled={busy} onPress={settings?.device_registered ? unregisterDevice : () => void registerDevice()} style={[styles.button, busy && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Please wait…' : settings?.device_registered ? 'Turn off' : 'Enable'}</Text></Pressable></View>
      {settings?.events.map(event => <View key={event.event_type} style={styles.eventRow}><Text style={styles.eventTitle}>{EVENT_LABELS[event.event_type] ?? event.event_type.replaceAll('_', ' ')}</Text><Switch value={event.enabled} onValueChange={value => void setPreference(event.event_type, value)} trackColor={{ false: '#D8D1D9', true: '#C8B7D0' }} thumbColor={event.enabled ? C.plum : '#FFFFFF'} accessibilityLabel={`Notify me: ${EVENT_LABELS[event.event_type] ?? event.event_type}`} /></View>)}
      {settings?.device_registered ? <Pressable disabled={busy} onPress={() => void sendTest()} style={[styles.testButton, busy && styles.disabled]}><Text style={styles.testText}>{busy ? 'Sending…' : 'Send test notification'}</Text></Pressable> : null}
      {settings?.role === 'admin' ? <View style={styles.adminRules}><Text style={styles.adminTitle}>Venue-wide event rules</Text><Text style={styles.copy}>Controls who can receive each enabled event. Staff still choose their own alerts above.</Text>{rules.map(rule => <View key={rule.event_type} style={styles.ruleCard}><View style={styles.ruleHeading}><Text style={styles.eventTitle}>{EVENT_LABELS[rule.event_type] ?? rule.event_type.replaceAll('_',' ')}</Text><Switch value={rule.enabled} onValueChange={value => void saveRule(rule,{enabled:value})} trackColor={{false:'#D8D1D9',true:'#C8B7D0'}} thumbColor={rule.enabled?C.plum:'#FFFFFF'} accessibilityLabel={`Enable venue event: ${rule.event_type}`} /></View>{rule.event_type==='employee_leave'?<Text style={styles.copy}>Recipients · Admins</Text>:<View style={styles.scopeRow}>{([['none','Admins'],['on_duty','On duty'],['all','All staff']] as const).map(([scope,label])=><Pressable key={scope} disabled={!rule.enabled} onPress={()=>void saveRule(rule,{employee_scope:scope})} style={[styles.scopeOption,rule.employee_scope===scope&&styles.scopeOptionOn,!rule.enabled&&styles.disabled]}><Text style={[styles.scopeText,rule.employee_scope===scope&&styles.scopeTextOn]}>{label}</Text></Pressable>)}</View>}{['child_checkin','child_checkout','session_ending','session_overdue','new_registration','party_registration'].includes(rule.event_type)?<View style={styles.ruleHeading}><Text style={styles.copy}>Include child's name</Text><Switch disabled={!rule.enabled} value={rule.show_child_name} onValueChange={value=>void saveRule(rule,{show_child_name:value})} trackColor={{false:'#D8D1D9',true:'#C8B7D0'}} thumbColor={rule.show_child_name?C.plum:'#FFFFFF'} /></View>:null}</View>)}</View> : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 17, padding: 15, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, title: { color: C.ink, fontSize: 15, fontWeight: '800' },
  copy: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, refresh: { color: C.plum, fontSize: 11, fontWeight: '800' },
  error: { color: C.coral, backgroundColor: '#FBE8E2', borderRadius: 9, padding: 9, fontSize: 11, marginTop: 10 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: C.line, paddingTop: 12, marginTop: 12 },
  deviceTitle: { color: C.ink, fontSize: 11, fontWeight: '800' }, button: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.dark },
  buttonText: { color: '#FFF', fontSize: 10, fontWeight: '800' }, disabled: { opacity: 0.5 },
  eventRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, gap: 8 },
  eventTitle: { flex: 1, color: C.ink, fontSize: 11, fontWeight: '600' }, testButton: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.tint },
  testText: { color: C.dark, fontSize: 10, fontWeight: '800' },
  adminRules: { marginTop: 18, borderTopWidth: 1, borderColor: C.line, paddingTop: 13 }, adminTitle: { color: C.ink, fontSize: 12, fontWeight: '800' },
  ruleCard: { borderTopWidth: 1, borderColor: C.line, paddingTop: 8, marginTop: 9 }, ruleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  scopeRow: { flexDirection: 'row', gap: 5, paddingVertical: 7 }, scopeOption: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 30, borderRadius: 8, borderWidth: 1, borderColor: C.line, paddingHorizontal: 3 },
  scopeOptionOn: { borderColor: C.plum, backgroundColor: C.tint }, scopeText: { color: C.muted, fontSize: 9, fontWeight: '700' }, scopeTextOn: { color: C.dark },
});
