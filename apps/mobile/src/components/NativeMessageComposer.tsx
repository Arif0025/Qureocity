import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import { MESSAGE_TEMPLATE_EVENTS, messageTemplateVariablesFor, birthdayTextFromDob, missingTemplateValues, renderMessageTemplate, unsupportedTemplateTokens, type MessageTemplateEvent, type MessageTemplateValues, type SavedMessageTemplate } from '../lib/messageTemplates';

type Props = { open: boolean; onClose: () => void; title: string; phone: string; event: MessageTemplateEvent; values: MessageTemplateValues; initialMessage: string; canManageTemplates?: boolean };
const normalizedPhone = (phone: string) => { const digits = phone.replace(/\D/g, ''); return digits.length === 10 ? `91${digits}` : digits; };

export default function NativeMessageComposer({ open, onClose, title, phone, event, values, initialMessage, canManageTemplates = false }: Props) {
  const [templates, setTemplates] = useState<SavedMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [formatName, setFormatName] = useState('');
  const [newFormat, setNewFormat] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lookedUpDob, setLookedUpDob] = useState<string | undefined>();
  const [dobLoading, setDobLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setMessage(initialMessage); setError(''); setNotice(''); setSelectedId(''); setFormatName(''); setNewFormat(false); setLookedUpDob(undefined);
    setLoading(true);
    void supabase.from('message_templates').select('id,event_key,name,body,is_default,updated_at').eq('is_active', true).order('is_default', { ascending: false }).order('name', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) { setError(queryError.message); return; }
        const rows = (data as SavedMessageTemplate[] | null) ?? [];
        setTemplates(rows);
        const chosen = rows.find(row => row.event_key === event && row.is_default) ?? rows.find(row => row.event_key === event) ?? rows[0];
        if (chosen) { setSelectedId(chosen.id); setFormatName(chosen.name); setMessage(chosen.body); }
      }).then(() => { if (active) setLoading(false); }, queryError => { if (active) { setError(String(queryError)); setLoading(false); } });
    return () => { active = false; };
  }, [event, initialMessage, open]);

  useEffect(() => {
    const childName = String(values.child_name ?? '').trim();
    const needsDob = /{{\s*(?:date_of_birth|birthday_date)\s*}}/i.test(message);
    if (!open || !needsDob || values.date_of_birth || lookedUpDob || !phone || !childName) return;
    let active = true;
    setDobLoading(true);
    void supabase.rpc('staff_child_dob_for_contact', { p_phone: phone, p_child_name: childName }).then(({ data, error: lookupError }) => {
      if (!active) return;
      if (typeof data === 'string') setLookedUpDob(data);
      else if (lookupError) setError(lookupError.message);
    }, lookupError => { if (active) setError(String(lookupError)); }).then(() => { if (active) setDobLoading(false); });
    return () => { active = false; };
  }, [message, open, phone, values.child_name, values.date_of_birth, lookedUpDob]);

  const resolvedValues = useMemo(() => ({ ...values, date_of_birth: values.date_of_birth || lookedUpDob, birthday_date: values.birthday_date || birthdayTextFromDob(values.date_of_birth || lookedUpDob), business_name: values.business_name || 'QureoCity' }), [values, lookedUpDob]);
  const preview = renderMessageTemplate(message, resolvedValues);
  const missing = missingTemplateValues(message, resolvedValues);
  const selectedTemplate = templates.find(row => row.id === selectedId);
  const activeEvent = selectedTemplate?.event_key ?? event;
  const unsupported = unsupportedTemplateTokens(activeEvent, message);
  const recipient = normalizedPhone(phone);
  const cannotSend = loading || dobLoading || !recipient || recipient.length < 11 || recipient.length > 15 || !preview || missing.length > 0 || unsupported.length > 0;

  const openChannel = async (channel: 'whatsapp' | 'sms') => {
    const url = channel === 'whatsapp' ? `https://wa.me/${recipient}?text=${encodeURIComponent(preview)}` : Platform.OS === 'ios' ? `sms:${recipient}&body=${encodeURIComponent(preview)}` : `sms:${recipient}?body=${encodeURIComponent(preview)}`;
    try { await Linking.openURL(url); onClose(); }
    catch { setError(`Could not open ${channel === 'whatsapp' ? 'WhatsApp' : 'the messaging app'} on this device.`); }
  };

  const choose = (row: SavedMessageTemplate) => { setSelectedId(row.id); setFormatName(row.name); setMessage(row.body); setNewFormat(false); setNotice(''); setError(''); };
  const saveFormat = async () => {
    if (!formatName.trim() || !message.trim()) { setError('Enter a format name and message first.'); return; }
    if (unsupported.length) { setError(`Unsupported fields: ${unsupported.map(key => `{{${key}}}`).join(', ')}`); return; }
    setSaving(true); setError(''); setNotice('');
    const { data, error: saveError } = await supabase.rpc('admin_save_message_template', { p_id: newFormat ? null : selectedId || null, p_event_key: activeEvent, p_name: formatName.trim(), p_body: message.trim(), p_make_default: makeDefault || Boolean(selectedTemplate?.is_default) });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    const saved = data as SavedMessageTemplate | null;
    if (saved) { setTemplates(current => [...current.filter(row => row.id !== saved.id && row.name !== saved.name), saved].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name))); setSelectedId(saved.id); setFormatName(saved.name); setNewFormat(false); }
    setNotice(makeDefault ? 'Saved as the default format.' : 'Format saved.');
  };

  return <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <View style={styles.root}><View style={styles.header}><View style={styles.headerCopy}><Text style={styles.eyebrow}>{MESSAGE_TEMPLATE_EVENTS.find(item => item.key === event)?.label.toUpperCase()}</Text><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.subtitle}>Review the personalized draft before it opens in your messaging app.</Text></View><Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.closeText}>Done</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={C.plum} style={{ marginVertical: 18 }} /> : null}
        {templates.length ? <View><Text style={styles.label}>Saved format</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>{templates.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityState={{ selected: row.id === selectedId }} onPress={() => choose(row)} style={[styles.templateChip, row.id === selectedId && styles.templateChipSelected]}><Text style={[styles.templateText, row.id === selectedId && styles.templateTextSelected]}>{row.name}{row.is_default ? ' · Default' : ''}</Text></Pressable>)}</ScrollView></View> : null}
        <Text style={styles.label}>Message</Text><TextInput accessibilityLabel="Edit message draft" value={message} onChangeText={setMessage} multiline maxLength={2000} textAlignVertical="top" style={styles.messageInput} />
        <View style={styles.preview}><Text style={styles.previewLabel}>PERSONALIZED PREVIEW</Text><Text style={styles.previewBody}>{preview || 'Your personalized message will appear here.'}</Text></View>
        {missing.length || unsupported.length ? <Text style={styles.error}>{missing.length ? `Add values for: ${missing.join(', ')}. ` : ''}{unsupported.length ? `Unsupported fields: ${unsupported.map(key => `{{${key}}}`).join(', ')}` : ''}</Text> : null}
        {canManageTemplates ? <View style={styles.manage}><Text style={styles.manageTitle}>Saved message formats</Text>{!newFormat ? <Pressable accessibilityRole="button" onPress={() => { setNewFormat(true); setSelectedId(''); setFormatName(''); setNotice(''); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Create another format</Text></Pressable> : null}<TextInput accessibilityLabel="Format name" value={formatName} onChangeText={setFormatName} maxLength={80} placeholder="Format name" placeholderTextColor={C.muted} style={styles.nameInput} /><View style={styles.fieldWrap}>{messageTemplateVariablesFor(activeEvent).map(item => <Pressable key={item.key} accessibilityRole="button" onPress={() => setMessage(current => `${current}${current && !current.endsWith(' ') ? ' ' : ''}{{${item.key}}}`)} style={styles.fieldChip}><Text style={styles.fieldText}>{item.label}</Text></Pressable>)}</View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }} onPress={() => setMakeDefault(value => !value)} style={styles.defaultRow}><View style={[styles.checkbox, makeDefault && styles.checkboxSelected]}>{makeDefault ? <Text style={styles.checkmark}>✓</Text> : null}</View><Text style={styles.secondaryText}>Make this the default format</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveFormat()} style={styles.saveButton}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save format'}</Text></Pressable>{notice ? <Text style={styles.notice}>{notice}</Text> : null}</View> : null}
        <View style={styles.channels}><Pressable accessibilityRole="button" disabled={cannotSend} onPress={() => void openChannel('whatsapp')} style={[styles.channelButton, styles.whatsapp, cannotSend && styles.disabled]}><Text style={styles.channelText}>Open WhatsApp</Text></Pressable><Pressable accessibilityRole="button" disabled={cannotSend} onPress={() => void openChannel('sms')} style={[styles.channelButton, styles.sms, cannotSend && styles.disabled]}><Text style={styles.smsText}>Open SMS</Text></Pressable></View><Text style={styles.footer}>The message is not sent automatically. Review and send it in the selected app.</Text>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: C.canvas }, header: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 13, borderBottomWidth: 1, borderColor: C.line, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headerCopy: { flex: 1 }, eyebrow: { color: C.plum, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, title: { color: C.ink, fontSize: 17, fontWeight: '900', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, close: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 9 }, closeText: { color: C.plum, fontSize: 11, fontWeight: '900' }, content: { padding: 16, paddingBottom: 36, gap: 11 }, label: { color: C.ink, fontSize: 10, fontWeight: '900', marginBottom: 5 }, templateRow: { gap: 7, paddingBottom: 4 }, templateChip: { minHeight: 34, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }, templateChipSelected: { borderColor: C.plum, backgroundColor: C.plumTint }, templateText: { color: C.muted, fontSize: 9, fontWeight: '800' }, templateTextSelected: { color: C.plumDark }, messageInput: { minHeight: 126, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink, fontSize: 12, lineHeight: 18, padding: 11 }, preview: { borderRadius: 12, borderWidth: 1, borderColor: '#CFE0C7', backgroundColor: '#F1F7ED', padding: 11 }, previewLabel: { color: C.mint, fontSize: 8, fontWeight: '900', letterSpacing: .8 }, previewBody: { color: C.ink, fontSize: 11, lineHeight: 17, marginTop: 6 }, error: { color: C.coral, fontSize: 10, lineHeight: 15, padding: 9, borderRadius: 9, backgroundColor: '#FBE8E2' }, manage: { borderTopWidth: 1, borderColor: C.line, paddingTop: 12, gap: 8 }, manageTitle: { color: C.ink, fontSize: 11, fontWeight: '900' }, nameInput: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink, fontSize: 11, paddingHorizontal: 10 }, fieldWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, fieldChip: { minHeight: 30, borderRadius: 15, backgroundColor: C.plumTint, justifyContent: 'center', paddingHorizontal: 9 }, fieldText: { color: C.plumDark, fontSize: 8, fontWeight: '700' }, defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34 }, checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }, checkboxSelected: { backgroundColor: C.plum, borderColor: C.plum }, checkmark: { color: '#FFF', fontSize: 11, fontWeight: '900' }, secondaryButton: { minHeight: 34, alignSelf: 'flex-start', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 9, backgroundColor: C.plumTint }, secondaryText: { color: C.plumDark, fontSize: 9, fontWeight: '800' }, saveButton: { minHeight: 39, borderRadius: 10, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#FFF', fontSize: 10, fontWeight: '900' }, notice: { color: C.mint, fontSize: 9, fontWeight: '800' }, channels: { flexDirection: 'row', gap: 8, marginTop: 5 }, channelButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, whatsapp: { backgroundColor: '#237A4B' }, sms: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface }, channelText: { color: '#FFF', fontSize: 10, fontWeight: '900' }, smsText: { color: C.ink, fontSize: 10, fontWeight: '900' }, disabled: { opacity: .45 }, footer: { color: C.muted, fontSize: 8, textAlign: 'center', marginTop: 2 } });
