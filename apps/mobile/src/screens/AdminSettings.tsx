import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/tokens';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import MobileNotifications from '../components/MobileNotifications';

const C = { ...colors, tint: colors.plumTint };
type KioskSession = { id: string; name: string; created_at: string; last_seen_at: string };
type SectionKey = 'frontDesk' | 'notifications' | 'account';

const exportGroups = [
  { id: 'customers', label: 'Customers & children' },
  { id: 'memberships', label: 'Memberships & plans' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'registrations', label: 'Registration & parties' },
  { id: 'staff', label: 'Staff & attendance' },
  { id: 'settings', label: 'Settings & notification records' },
] as const;

function Disclosure({
  title,
  description,
  opened,
  onPress,
  children,
}: {
  title: string;
  description: string;
  opened: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.disclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: opened }}
        onPress={onPress}
        style={styles.disclosureHeader}
      >
        <View style={styles.disclosureCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.disclosureDescription}>{description}</Text>
        </View>
        <Text style={styles.disclosureChevron}>{opened ? '⌃' : '⌄'}</Text>
      </Pressable>
      {opened ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export default function AdminSettings({ onBack, onSignOut }: { onBack: () => void; onSignOut: () => Promise<void> }) {
  const [mode, setMode] = useState<'static' | 'dynamic'>('static');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [kioskPassword, setKioskPassword] = useState('');
  const [kioskSessions, setKioskSessions] = useState<KioskSession[]>([]);
  const [kioskLoading, setKioskLoading] = useState(false);
  const [kioskSaving, setKioskSaving] = useState(false);
  const [selectedExportGroups, setSelectedExportGroups] = useState<string[]>(['customers', 'memberships', 'checkins', 'registrations', 'staff', 'settings']);
  const [exporting, setExporting] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ frontDesk: false, notifications: false, account: false });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('app_settings').select('qr_mode').eq('id', true).single();
    if (loadError) setError(loadError.message);
    else if (data?.qr_mode === 'static' || data?.qr_mode === 'dynamic') setMode(data.qr_mode);
    setLoading(false);
  }, []);

  const loadKioskSessions = useCallback(async () => {
    setKioskLoading(true);
    const { data, error: loadError } = await supabase.functions.invoke('admin-manage-kiosk', { body: { action: 'list_sessions' } });
    setKioskLoading(false);
    if (loadError) { setError(loadError.message); return; }
    if (data?.error) { setError(data.error); return; }
    setKioskSessions((data?.sessions ?? []) as KioskSession[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleSection = (section: SectionKey) => {
    const opening = !sections[section];
    setSections((current) => ({ ...current, [section]: !current[section] }));
    if (section === 'frontDesk' && opening) void loadKioskSessions();
  };

  const setQrMode = async (next: 'static' | 'dynamic') => {
    if (next === mode) return;
    setSaving(true); setError('');
    const { error: saveError } = await supabase.from('app_settings').update({ qr_mode: next }).eq('id', true);
    setSaving(false);
    if (saveError) setError(saveError.message); else setMode(next);
  };

  const updatePassword = async () => {
    setError('');
    if (newPassword.length < 8) { setError('Use at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (passwordError) setError(passwordError.message);
    else { setNewPassword(''); setConfirmPassword(''); Alert.alert('Password updated', 'Your sign-in password has been changed.'); }
  };

  const updateKioskPassword = () => {
    if (kioskPassword.length < 8 || kioskPassword.length > 128) { setError('Use a kiosk password from 8 to 128 characters.'); return; }
    Alert.alert('Change kiosk password?', 'All active desk browsers will be signed out and must sign in with the new password.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change password', style: 'destructive', onPress: () => {
        void (async () => {
          setKioskSaving(true); setError('');
          const { data, error: saveError } = await supabase.functions.invoke('admin-manage-kiosk', { body: { action: 'set_password', password: kioskPassword } });
          setKioskSaving(false);
          if (saveError) setError(saveError.message);
          else if (data?.error) setError(data.error);
          else { setKioskPassword(''); setKioskSessions([]); Alert.alert('Kiosk password changed', 'Active kiosk sessions were revoked.'); }
        })();
      } },
    ]);
  };

  const revokeKioskSession = (session: KioskSession) => Alert.alert('Remove kiosk access?', `${session.name} will be signed out of the desk.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => {
      void (async () => {
        const { data, error: revokeError } = await supabase.functions.invoke('admin-manage-kiosk', { body: { action: 'revoke_session', sessionId: session.id } });
        if (revokeError) setError(revokeError.message);
        else if (data?.error) setError(data.error);
        else await loadKioskSessions();
      })();
    } },
  ]);

  const exportData = async () => {
    if (!selectedExportGroups.length) { setError('Select at least one export group.'); return; }
    setExporting(true); setError('');
    try {
      const { data, error: exportError } = await supabase.functions.invoke('admin-export-data', { body: { groups: selectedExportGroups } });
      if (exportError) throw exportError;
      if (data?.error) throw new Error(data.error);
      const file = new File(Paths.cache, `qureocity-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      await file.write(JSON.stringify(data, null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is not available on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share QureoCity data export' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the data export.');
    } finally { setExporting(false); }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <View style={styles.pageTitleBlock}>
            <Text accessibilityRole="header" style={styles.pageTitle}>Settings</Text>
            <Text style={styles.pageDescription}>Configure administrative and check-in options.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.homeButton}>
            <Text style={styles.homeButtonText}>⌂  Home</Text>
          </Pressable>
        </View>

        {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}

        <Disclosure
          title="Front desk & kiosk"
          description="QR display, kiosk access, and registered desk devices."
          opened={sections.frontDesk}
          onPress={() => toggleSection('frontDesk')}
        >
          <View style={styles.settingBlock}>
            <Text style={styles.sectionTitle}>Front-desk QR</Text>
            <Text style={styles.description}>Dynamic QR codes rotate frequently and are safer against copied screenshots. Static mode keeps one fixed code.</Text>
            {loading ? <ActivityIndicator color={C.plum} /> : (
              <View style={styles.row}>{(['static', 'dynamic'] as const).map((value) => (
                <Pressable key={value} disabled={saving} onPress={() => void setQrMode(value)} style={[styles.option, mode === value && styles.optionOn]}>
                  <Text style={[styles.optionText, mode === value && styles.optionTextOn]}>{value === 'static' ? 'Static' : 'Dynamic'}</Text>
                  <Text style={styles.optionSub}>{value === 'static' ? 'Fixed code' : 'Rotating code'}</Text>
                </Pressable>
              ))}</View>
            )}
            {saving ? <Text style={styles.hint}>Saving…</Text> : null}
          </View>

          <View style={styles.settingBlock}>
            <View style={styles.cardHeader}>
              <View style={styles.disclosureCopy}><Text style={styles.sectionTitle}>Kiosk access</Text><Text style={styles.description}>Set the password for /desk and revoke individual registered desk browsers.</Text></View>
              <Pressable accessibilityRole="button" onPress={() => void loadKioskSessions()}><Text style={styles.actionLink}>Refresh</Text></Pressable>
            </View>
            <TextInput style={styles.input} value={kioskPassword} onChangeText={setKioskPassword} secureTextEntry autoCapitalize="none" placeholder="New kiosk password · 8+ characters" placeholderTextColor={C.muted} />
            <Pressable disabled={kioskSaving || kioskPassword.length < 8} onPress={updateKioskPassword} style={[styles.primary, (kioskSaving || kioskPassword.length < 8) && styles.disabled]}>
              <Text style={styles.primaryText}>{kioskSaving ? 'Updating…' : 'Set password and sign out kiosks'}</Text>
            </Pressable>
            <Text style={styles.hint}>Password updates revoke all active kiosk sessions.</Text>
            <View style={styles.kioskListHeader}><Text style={styles.sectionTitle}>Active kiosk sessions</Text>{kioskLoading ? <ActivityIndicator color={C.plum} size="small" /> : null}</View>
            {!kioskLoading && !kioskSessions.length ? <Text style={styles.description}>No active kiosk sessions.</Text> : null}
            {kioskSessions.map((session) => (
              <View key={session.id} style={styles.kioskRow}>
                <View style={styles.disclosureCopy}><Text style={styles.sessionName}>{session.name}</Text><Text style={styles.hint}>Last active · {new Date(session.last_seen_at).toLocaleString('en-IN')}</Text></View>
                <Pressable accessibilityRole="button" onPress={() => revokeKioskSession(session)} style={styles.revokeButton}><Text style={styles.revokeText}>Remove</Text></Pressable>
              </View>
            ))}
          </View>
        </Disclosure>

        <Disclosure
          title="Notifications"
          description="Device setup and the venue’s notification rules."
          opened={sections.notifications}
          onPress={() => toggleSection('notifications')}
        >
          <MobileNotifications />
        </Disclosure>

        <View style={styles.dataExport}>
          <Text style={styles.cardTitle}>Export data</Text>
          <Text style={styles.description}>Choose the records to include in a secure JSON export.</Text>
          <View style={styles.exportOptions}>{exportGroups.map((group) => {
            const checked = selectedExportGroups.includes(group.id);
            return (
              <Pressable key={group.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setSelectedExportGroups((current) => checked ? current.filter((id) => id !== group.id) : [...current, group.id])} style={[styles.exportOption, checked && styles.exportOptionOn]}>
                <View style={[styles.checkbox, checked && styles.checkboxOn]}>{checked ? <Text style={styles.checkboxMark}>✓</Text> : null}</View>
                <Text style={[styles.optionText, checked && styles.optionTextOn]}>{group.label}</Text>
              </Pressable>
            );
          })}</View>
          <Pressable disabled={exporting || !selectedExportGroups.length} onPress={() => void exportData()} style={[styles.primary, (exporting || !selectedExportGroups.length) && styles.disabled]}>
            <Text style={styles.primaryText}>{exporting ? 'Preparing export…' : 'Create and share JSON export'}</Text>
          </Pressable>
        </View>

        <Disclosure
          title="Password & account"
          description="Change your password or sign out of this device."
          opened={sections.account}
          onPress={() => toggleSection('account')}
        >
          <View style={styles.settingBlock}>
            <Text style={styles.sectionTitle}>Change password</Text>
            <Text style={styles.description}>Use a unique password with at least 8 characters.</Text>
            <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" placeholder="New password" placeholderTextColor={C.muted} />
            <TextInput style={styles.input} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoCapitalize="none" placeholder="Confirm password" placeholderTextColor={C.muted} />
            <Pressable disabled={saving} onPress={() => void updatePassword()} style={[styles.primary, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? 'Updating…' : 'Update password'}</Text></Pressable>
          </View>
          <Pressable onPress={() => Alert.alert('Sign out?', 'You will need your staff or admin credentials to sign in again.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() }])} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </Disclosure>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 28, paddingBottom: 112, gap: 12 },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
  pageTitleBlock: { flex: 1 },
  pageTitle: { color: C.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.25 },
  pageDescription: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  homeButton: { minHeight: 34, borderWidth: 1, borderColor: C.line, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 },
  homeButtonText: { color: C.muted, fontSize: 11, fontWeight: '700' },
  disclosure: { overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  disclosureHeader: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  disclosureCopy: { flex: 1 },
  disclosureDescription: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  disclosureChevron: { color: C.muted, fontSize: 20, paddingHorizontal: 2 },
  disclosureBody: { borderTopWidth: 1, borderTopColor: C.line, padding: 14, gap: 12 },
  settingBlock: { padding: 14, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.canvas },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: C.ink, fontSize: 13, fontWeight: '700' },
  description: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 10 },
  actionLink: { color: C.plum, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, borderRadius: 11, borderColor: C.line, borderWidth: 1, padding: 11, backgroundColor: C.surface },
  optionOn: { borderColor: C.plum, backgroundColor: C.tint },
  optionText: { color: C.ink, fontSize: 12, fontWeight: '700' },
  optionTextOn: { color: C.plum },
  optionSub: { color: C.muted, fontSize: 10, marginTop: 3 },
  hint: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 7 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 13, marginTop: 8 },
  primary: { minHeight: 42, borderRadius: 10, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 9 },
  primaryText: { color: C.white, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  kioskListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 4 },
  kioskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: C.line },
  sessionName: { color: C.ink, fontSize: 12, fontWeight: '700' },
  revokeButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 9, backgroundColor: C.dangerSurface },
  revokeText: { color: C.coral, fontSize: 11, fontWeight: '700' },
  dataExport: { borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, padding: 15 },
  exportOptions: { gap: 7, marginBottom: 9 },
  exportOption: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: C.line },
  exportOptionOn: { backgroundColor: C.tint, borderColor: C.plum },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: C.plum, borderColor: C.plum },
  checkboxMark: { color: C.white, fontSize: 12, fontWeight: '900', lineHeight: 14 },
  error: { backgroundColor: C.dangerSurface, borderRadius: 12, padding: 12 },
  errorText: { color: C.coral, fontSize: 12, lineHeight: 18 },
  signOut: { minHeight: 40, borderWidth: 1, borderColor: C.coral, borderRadius: 10, padding: 10, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  signOutText: { color: C.coral, fontSize: 12, fontWeight: '700' },
});
