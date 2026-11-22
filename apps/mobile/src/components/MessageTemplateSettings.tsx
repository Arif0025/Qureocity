import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import { MESSAGE_TEMPLATE_EVENTS, messageTemplateVariablesFor, unsupportedTemplateTokens, type MessageTemplateEvent, type SavedMessageTemplate } from '../lib/messageTemplates';

export default function MessageTemplateSettings() {
  const [event, setEvent] = useState<MessageTemplateEvent>('customer_contact');
  const [rows, setRows] = useState<SavedMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (key: MessageTemplateEvent, preferId?: string) => {
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase.from('message_templates').select('id,event_key,name,body,is_default,updated_at').eq('event_key', key).eq('is_active', true).order('is_default', { ascending: false }).order('name', { ascending: true });
    if (queryError) setError(queryError.message);
    else {
      const next = (data as SavedMessageTemplate[] | null) ?? [];
      setRows(next);
      const selected = next.find(row => row.id === preferId) ?? next.find(row => row.is_default) ?? next[0];
      setSelectedId(selected?.id ?? ''); setName(selected?.name ?? ''); setBody(selected?.body ?? ''); setCreating(false); setMakeDefault(false);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(event); }, [event, load]);

  const save = async () => {
    if (!name.trim() || !body.trim()) { setError('Enter a format name and message.'); return; }
    const unsupported = unsupportedTemplateTokens(event, body);
    if (unsupported.length) { setError(`Unknown fields: ${unsupported.map(key => `{{${key}}}`).join(', ')}`); return; }
    setSaving(true); setError(''); setNotice('');
    const { data, error: saveError } = await supabase.rpc('admin_save_message_template', { p_id: creating ? null : selectedId || null, p_event_key: event, p_name: name.trim(), p_body: body.trim(), p_make_default: makeDefault || Boolean(rows.find(row => row.id === selectedId)?.is_default) });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    const savedId = (data as { id?: string } | null)?.id;
    await load(event, savedId);
    setNotice(makeDefault ? 'Saved as the default format.' : 'Format saved.');
  };

  const insertField = (key: string) => setBody(current => `${current}${current && !current.endsWith(' ') ? ' ' : ''}{{${key}}}`);
  return <View style={styles.card}>
    <Text style={styles.title}>Saved message formats</Text><Text style={styles.copy}>Reusable drafts used for customer messages. Fields fill from the selected family or request.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventList}>{MESSAGE_TEMPLATE_EVENTS.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: event === item.key }} onPress={() => { setEvent(item.key); setNotice(''); }} style={[styles.eventChip, event === item.key && styles.eventChipOn]}><Text style={[styles.eventText, event === item.key && styles.eventTextOn]}>{item.label}</Text></Pressable>)}</ScrollView>
    {loading ? <ActivityIndicator color={C.plum} /> : <>
      <View style={styles.templateList}>{rows.map(row => <Pressable key={row.id} accessibilityRole="button" accessibilityState={{ selected: row.id === selectedId }} onPress={() => { setSelectedId(row.id); setName(row.name); setBody(row.body); setCreating(false); setMakeDefault(false); setError(''); }} style={[styles.templateChip, row.id === selectedId && styles.templateSelected]}><Text style={styles.templateText}>{row.name}{row.is_default ? ' · Default' : ''}</Text></Pressable>)}<Pressable accessibilityRole="button" onPress={() => { setSelectedId(''); setName(''); setBody(''); setCreating(true); setMakeDefault(false); setError(''); setNotice(''); }} style={styles.newButton}><Text style={styles.newText}>＋ New format</Text></Pressable></View>
      <TextInput accessibilityLabel="Message format name" value={name} onChangeText={setName} maxLength={80} placeholder="Format name" placeholderTextColor={C.muted} style={styles.name} />
      <TextInput accessibilityLabel="Message format text" value={body} onChangeText={setBody} multiline maxLength={2000} textAlignVertical="top" placeholder="Write the reusable message…" placeholderTextColor={C.muted} style={styles.body} />
      <Text style={styles.sectionLabel}>INSERT FIELDS</Text><View style={styles.fields}>{messageTemplateVariablesFor(event).map(item => <Pressable key={item.key} onPress={() => insertField(item.key)} style={styles.field}><Text style={styles.fieldText}>{item.label}</Text></Pressable>)}</View>
      <View style={styles.defaultRow}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeDefault }} onPress={() => setMakeDefault(value => !value)} style={[styles.checkbox, makeDefault && styles.checkboxOn]}>{makeDefault ? <Text style={styles.checkmark}>✓</Text> : null}</Pressable><Text style={styles.copy}>Make default for {MESSAGE_TEMPLATE_EVENTS.find(item => item.key === event)?.label}</Text></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}{notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}><Text style={styles.saveText}>{saving ? 'Saving…' : creating ? 'Save new format' : 'Save format'}</Text></Pressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({ card: { paddingTop: 13, gap: 9 }, title: { color: C.ink, fontSize: 12, fontWeight: '900' }, copy: { color: C.muted, fontSize: 9, lineHeight: 14 }, eventList: { gap: 6, paddingVertical: 3 }, eventChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 9, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, eventChipOn: { backgroundColor: C.plumTint, borderColor: C.plum }, eventText: { color: C.muted, fontSize: 8, fontWeight: '800' }, eventTextOn: { color: C.plumDark }, templateList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, templateChip: { minHeight: 31, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }, templateSelected: { borderColor: C.plum, backgroundColor: C.plumTint }, templateText: { color: C.ink, fontSize: 8, fontWeight: '800' }, newButton: { minHeight: 31, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.plum }, newText: { color: '#FFF', fontSize: 8, fontWeight: '900' }, name: { minHeight: 38, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink, fontSize: 10 }, body: { minHeight: 92, padding: 10, borderRadius: 9, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink, fontSize: 10, lineHeight: 15 }, sectionLabel: { color: C.muted, fontSize: 8, fontWeight: '900', letterSpacing: .7 }, fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, field: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 14, backgroundColor: C.plumTint }, fieldText: { color: C.plumDark, fontSize: 8, fontWeight: '700' }, defaultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, checkbox: { width: 18, height: 18, borderWidth: 1, borderColor: C.line, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, checkboxOn: { backgroundColor: C.plum, borderColor: C.plum }, checkmark: { color: '#FFF', fontSize: 11, fontWeight: '900' }, error: { color: C.coral, fontSize: 9 }, notice: { color: C.mint, fontSize: 9, fontWeight: '800' }, saveButton: { minHeight: 39, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.plum }, saveText: { color: '#FFF', fontSize: 10, fontWeight: '900' }, disabled: { opacity: .5 } });
