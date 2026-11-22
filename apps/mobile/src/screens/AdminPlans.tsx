import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import AdminPartyAvailability from './AdminPartyAvailability';

type PlanKind = 'recurring' | 'special' | 'party';
type Plan = { id: string; name: string; description: string | null; plan_type: 'recurring' | 'special'; event_date: string | null; event_dates: string[]; code: string | null; validity_value: number; validity_unit: 'days' | 'weeks' | 'months'; hours_per_visit: number; max_visits: number | null; allowed_weekdays: number[]; min_age: number | null; max_age: number | null; price: number; active: boolean };
type PartyPlan = { id: string; name: string; description: string | null; price: number; kids_count: number; adults_count: number; includes_cake: boolean; includes_snacks: boolean; decorations_type: string | null; duration_minutes: number; area_type: 'party_room' | 'entire_play_area'; active: boolean };
type PlanForm = { name: string; description: string; eventDates: string; code: string; validityValue: string; validityUnit: 'days' | 'weeks' | 'months'; hours: string; maxVisits: string; weekdays: number[]; minAge: string; maxAge: string; price: string; active: boolean };
type PartyForm = { name: string; description: string; price: string; kids: string; adults: string; cake: boolean; snacks: boolean; decorations: string; duration: string; area: 'party_room' | 'entire_play_area'; active: boolean };
type RosterMember = { child_id: string; child_name: string; parent_name: string; phone: string; started_on?: string | null; expires_on?: string | null; event_date?: string; currently_active?: boolean };
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const emptyPlan = (kind: 'recurring' | 'special'): PlanForm => ({ name: '', description: '', eventDates: '', code: '', validityValue: '1', validityUnit: 'months', hours: '2', maxVisits: '', weekdays: [0, 1, 3, 4, 5, 6], minAge: '', maxAge: '', price: '', active: true });
const emptyParty: PartyForm = { name: '', description: '', price: '', kids: '0', adults: '0', cake: false, snacks: false, decorations: '', duration: '60', area: 'party_room', active: true };
const cleanDate = (v: string) => v.slice(0, 10);

export default function AdminPlans({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<PlanKind>('recurring');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [partyPlans, setPartyPlans] = useState<PartyPlan[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<'recurring' | 'special' | 'party' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanForm>(emptyPlan('recurring'));
  const [partyForm, setPartyForm] = useState<PartyForm>(emptyParty);
  const [rosterPlan, setRosterPlan] = useState<Plan | null>(null);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [plansResult, partyResult, countResult] = await Promise.all([
      supabase.from('membership_plans').select('id,name,description,plan_type,event_date,event_dates,code,validity_value,validity_unit,hours_per_visit,max_visits,allowed_weekdays,min_age,max_age,price,active').order('created_at', { ascending: false }),
      supabase.from('party_plans').select('id,name,description,price,kids_count,adults_count,includes_cake,includes_snacks,decorations_type,duration_minutes,area_type,active').order('created_at', { ascending: false }),
      supabase.rpc('admin_plan_member_counts'),
    ]);
    const problem = plansResult.error ?? partyResult.error ?? countResult.error;
    if (problem) setError(`${problem.message}${problem.code ? ` (${problem.code})` : ''}`);
    else {
      setPlans((plansResult.data as Plan[] | null) ?? []);
      setPartyPlans((partyResult.data as PartyPlan[] | null) ?? []);
      const next: Record<string, number> = {};
      for (const row of (countResult.data ?? []) as { plan_id: string; member_count: number }[]) next[row.plan_id] = Number(row.member_count);
      setCounts(next);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visiblePlans = useMemo(() => kind === 'party' ? [] : plans.filter((plan) => plan.plan_type === kind), [kind, plans]);

  const createPlan = (nextKind: 'recurring' | 'special') => { setEditingId(null); setPlanForm(emptyPlan(nextKind)); setFormKind(nextKind); setError(null); };
  const editPlan = (plan: Plan) => {
    setEditingId(plan.id); setFormKind(plan.plan_type);
    setPlanForm({ name: plan.name, description: plan.description ?? '', eventDates: (plan.event_dates?.length ? plan.event_dates : plan.event_date ? [plan.event_date] : []).map(cleanDate).join(', '), code: plan.code ?? '', validityValue: String(plan.validity_value), validityUnit: plan.validity_unit, hours: String(plan.hours_per_visit), maxVisits: plan.max_visits == null ? '' : String(plan.max_visits), weekdays: plan.allowed_weekdays ?? [], minAge: plan.min_age == null ? '' : String(plan.min_age), maxAge: plan.max_age == null ? '' : String(plan.max_age), price: String(plan.price), active: plan.active });
  };
  const savePlan = async () => {
    if (!formKind || formKind === 'party') return;
    const eventDates = [...new Set(planForm.eventDates.split(',').map((date) => date.trim()).filter(Boolean))].sort();
    if (!planForm.name.trim()) { setError('Plan name is required.'); return; }
    if (formKind === 'special' && (!eventDates.length || !/^[A-Za-z0-9]{2,10}$/.test(planForm.code.trim()))) { setError('Special-day plans need valid YYYY-MM-DD event dates and a 2–10 character code.'); return; }
    if (formKind === 'recurring' && !planForm.weekdays.length) { setError('Choose at least one allowed weekday.'); return; }
    const payload = {
      name: planForm.name.trim(), description: planForm.description.trim() || null,
      plan_type: formKind, event_date: formKind === 'special' ? eventDates[0] : null,
      event_dates: formKind === 'special' ? eventDates : [],
      code: formKind === 'special' ? planForm.code.trim().toUpperCase() : null,
      validity_value: formKind === 'special' ? 1 : Math.max(1, Number.parseInt(planForm.validityValue, 10) || 1),
      validity_unit: formKind === 'special' ? 'weeks' : planForm.validityUnit,
      hours_per_visit: Math.max(1, Number.parseFloat(planForm.hours) || 1),
      max_visits: formKind === 'recurring' && planForm.maxVisits.trim() ? Math.max(1, Number.parseInt(planForm.maxVisits, 10) || 1) : null,
      allowed_weekdays: formKind === 'special' ? [new Date(`${eventDates[0]}T00:00:00`).getDay()] : planForm.weekdays,
      min_age: planForm.minAge.trim() ? Math.max(0, Number.parseInt(planForm.minAge, 10) || 0) : null,
      max_age: planForm.maxAge.trim() ? Math.max(0, Number.parseInt(planForm.maxAge, 10) || 0) : null,
      price: Math.max(0, Number.parseFloat(planForm.price) || 0), active: planForm.active,
    };
    setSaving(true); setError(null);
    const result = editingId
      ? await supabase.from('membership_plans').update(payload).eq('id', editingId)
      : await supabase.from('membership_plans').insert(payload);
    setSaving(false);
    if (result.error) { setError(`${result.error.message}${result.error.code ? ` (${result.error.code})` : ''}`); return; }
    setFormKind(null); await load();
  };
  const saveParty = async () => {
    if (!partyForm.name.trim()) { setError('Package name is required.'); return; }
    const payload = { name: partyForm.name.trim(), description: partyForm.description.trim() || null, price: Math.max(0, Number(partyForm.price) || 0), kids_count: Math.max(0, Number.parseInt(partyForm.kids, 10) || 0), adults_count: Math.max(0, Number.parseInt(partyForm.adults, 10) || 0), includes_cake: partyForm.cake, includes_snacks: partyForm.snacks, decorations_type: partyForm.decorations.trim() || null, duration_minutes: Math.max(15, Number.parseInt(partyForm.duration, 10) || 60), area_type: partyForm.area, active: partyForm.active };
    setSaving(true); setError(null);
    const result = editingId ? await supabase.from('party_plans').update(payload).eq('id', editingId) : await supabase.from('party_plans').insert(payload);
    setSaving(false);
    if (result.error) { setError(`${result.error.message}${result.error.code ? ` (${result.error.code})` : ''}`); return; }
    setFormKind(null); await load();
  };
  const editParty = (plan: PartyPlan) => { setEditingId(plan.id); setFormKind('party'); setPartyForm({ name: plan.name, description: plan.description ?? '', price: String(plan.price), kids: String(plan.kids_count), adults: String(plan.adults_count), cake: plan.includes_cake, snacks: plan.includes_snacks, decorations: plan.decorations_type ?? '', duration: String(plan.duration_minutes), area: plan.area_type, active: plan.active }); };
  const deletePlan = (id: string, name: string, party = false) => Alert.alert('Delete this plan?', `${name} may be in use by registrations or bookings.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void applyDelete(id, party); } }]);
  const applyDelete = async (id: string, party: boolean) => {
    setError(null);
    const { error: deleteError } = await (party ? supabase.from('party_plans') : supabase.from('membership_plans')).delete().eq('id', id);
    if (deleteError) { setError(`${deleteError.message}${deleteError.code ? ` (${deleteError.code})` : ''}`); return; }
    await load();
  };
  const openRoster = async (plan: Plan) => {
    setRosterPlan(plan); setRoster([]); setRosterLoading(true); setError(null);
    const { data, error: rosterError } = await supabase.rpc('admin_list_plan_members');
    if (rosterError) setError(`${rosterError.message}${rosterError.code ? ` (${rosterError.code})` : ''}`);
    else {
      const all = (data as { plan_id: string; members: RosterMember[] }[] | null) ?? [];
      setRoster(all.find((row) => row.plan_id === plan.id)?.members ?? []);
    }
    setRosterLoading(false);
  };

  return <View style={styles.root}><ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><Pressable accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ Back</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Refresh plans" onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>↻</Text></Pressable></View>
    <Text accessibilityRole="header" style={styles.title}>Plans</Text><Text style={styles.subtitle}>Manage memberships, special days, and party packages.</Text>
    <View style={styles.tabs}>{(['recurring', 'special', 'party'] as PlanKind[]).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: kind === item }} onPress={() => { setKind(item); setExpandedPlanId(null); }} style={[styles.tab, kind === item && styles.tabActive]}><Text style={[styles.tabText, kind === item && styles.tabTextActive]}>{item === 'recurring' ? 'Monthly plans' : item === 'special' ? 'Special days' : 'Party plans'}</Text></Pressable>)}</View>
    {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Plan action needs attention</Text><Text style={styles.errorText}>{error}</Text></View> : null}
    {loading ? <ActivityIndicator color={C.plum} size="large" style={styles.loading} /> : kind !== 'party' ? <>
      <Pressable accessibilityRole="button" onPress={() => createPlan(kind)} style={styles.createButton}><Text style={styles.createText}>＋ Create {kind === 'recurring' ? 'membership plan' : 'special-day plan'}</Text></Pressable>
      {visiblePlans.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No {kind === 'recurring' ? 'monthly' : 'special-day'} plans yet. Create one to make it available to customers.</Text></View> : visiblePlans.map((plan, index) => {
        const expanded = expandedPlanId === plan.id;
        const tone = index % 4;
        const eventDates = plan.event_dates?.length ? plan.event_dates : plan.event_date ? [plan.event_date] : [];
        return <View key={plan.id} style={[styles.webPlanCard, tone === 0 ? styles.webPlanLavender : tone === 1 ? styles.webPlanGreen : tone === 2 ? styles.webPlanCoral : styles.webPlanGold, !plan.active && styles.inactivePlanCard]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpandedPlanId(expanded ? null : plan.id)} style={styles.webPlanHeader}>
            <View style={styles.planTitleArea}>
              <View style={styles.webPlanTitleRow}><Text numberOfLines={1} style={styles.webPlanName}>{plan.name}</Text>{plan.plan_type === 'special' ? <Text style={styles.specialDateBadge}>{eventDates.length ? `${cleanDate(eventDates[0]).slice(5).replace('-', '/').replace(/^0/, '')}${eventDates.length > 1 ? ` +${eventDates.length - 1}` : ''}` : 'Special day'}</Text> : null}{!plan.active ? <Text style={styles.inactiveBadge}>Inactive</Text> : null}</View>
              <Text numberOfLines={2} style={styles.webPlanDescription}>{plan.description || (plan.plan_type === 'special' ? 'Special day pass' : 'Membership plan')}</Text>
            </View>
            <View style={styles.webPlanPrice}><Text style={styles.webPlanPriceText}>₹{Number(plan.price).toLocaleString('en-IN')}</Text><Text style={styles.webPlanChevron}>{expanded ? '⌃' : '⌄'}</Text></View>
          </Pressable>
          {expanded ? <>
            <View style={styles.webPlanInfoGrid}>
              <View style={styles.webPlanInfo}><Text style={styles.webPlanInfoLabel}>REGISTERED</Text><Text style={styles.webPlanInfoValue}>{counts[plan.id] ?? 0}</Text></View>
              <View style={styles.webPlanInfo}><Text style={styles.webPlanInfoLabel}>{plan.plan_type === 'special' ? 'EVENT DATES' : 'MEMBERSHIP LENGTH'}</Text><Text style={styles.webPlanInfoValue}>{plan.plan_type === 'special' ? eventDates.map(cleanDate).join(', ') || 'Date not set' : `${plan.validity_value} ${plan.validity_unit}`}</Text></View>
              <View style={styles.webPlanInfo}><Text style={styles.webPlanInfoLabel}>VISIT LENGTH</Text><Text style={styles.webPlanInfoValue}>{plan.hours_per_visit} hours{plan.plan_type === 'recurring' ? ' per visit' : ''}</Text></View>
              {plan.plan_type === 'recurring' ? <View style={styles.webPlanInfo}><Text style={styles.webPlanInfoLabel}>VISIT LIMIT</Text><Text style={styles.webPlanInfoValue}>{plan.max_visits == null ? 'Unlimited' : `${plan.max_visits} visits`}</Text></View> : null}
              {plan.min_age != null || plan.max_age != null ? <View style={styles.webPlanInfo}><Text style={styles.webPlanInfoLabel}>AGE RANGE</Text><Text style={styles.webPlanInfoValue}>{plan.min_age ?? 0}–{plan.max_age ?? 'No limit'}</Text></View> : null}
            </View>
            <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={() => void openRoster(plan)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Member roster</Text></Pressable><Pressable accessibilityRole="button" onPress={() => editPlan(plan)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Edit plan</Text></Pressable><Pressable accessibilityRole="button" onPress={() => deletePlan(plan.id, plan.name)} style={styles.dangerButton}><Text style={styles.dangerText}>Delete</Text></Pressable></View>
          </> : null}
        </View>;
      })}
    </> : <>
      <AdminPartyAvailability />
      <Pressable accessibilityRole="button" onPress={() => { setEditingId(null); setPartyForm(emptyParty); setFormKind('party'); setError(null); }} style={styles.createButton}><Text style={styles.createText}>＋ Create party package</Text></Pressable>
      {partyPlans.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No party packages yet.</Text></View> : partyPlans.map((plan) => <View key={plan.id} style={styles.card}>
        <View style={styles.planHeader}><View style={styles.planTitleArea}><Text style={styles.planName}>{plan.name}</Text><Text style={styles.planMeta}>₹{Number(plan.price).toLocaleString('en-IN')} · {plan.duration_minutes} min · {plan.kids_count} children / {plan.adults_count} adults</Text><Text style={styles.planMeta}>{plan.area_type === 'entire_play_area' ? 'Entire play area' : 'Party room'}{plan.includes_cake ? ' · Cake' : ''}{plan.includes_snacks ? ' · Snacks' : ''}</Text></View><Text style={[styles.activeTag, plan.active ? styles.activeOn : styles.activeOff]}>{plan.active ? 'ACTIVE' : 'INACTIVE'}</Text></View>
        <View style={styles.cardActions}><Pressable accessibilityRole="button" onPress={() => editParty(plan)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Edit package</Text></Pressable><Pressable accessibilityRole="button" onPress={() => deletePlan(plan.id, plan.name, true)} style={styles.dangerButton}><Text style={styles.dangerText}>Delete</Text></Pressable></View>
      </View>)}
    </>}
  </ScrollView>
  <Modal visible={formKind !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormKind(null)}>
    <ScrollView contentContainerStyle={styles.formSheet} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>{editingId ? 'EDIT' : 'CREATE'} {formKind === 'party' ? 'PARTY PACKAGE' : formKind === 'special' ? 'SPECIAL DAY' : 'MEMBERSHIP'}</Text>
      <Text accessibilityRole="header" style={styles.formTitle}>{formKind === 'party' ? 'Party package' : formKind === 'special' ? 'Special-day plan' : 'Membership plan'}</Text>
      {formKind === 'party' ? <>
        <Field label="Name" value={partyForm.name} onChangeText={(value) => setPartyForm((current) => ({ ...current, name: value }))} />
        <Field label="Description" value={partyForm.description} onChangeText={(value) => setPartyForm((current) => ({ ...current, description: value }))} multiline />
        <Field label="Price (₹)" value={partyForm.price} onChangeText={(value) => setPartyForm((current) => ({ ...current, price: value }))} keyboardType="decimal-pad" />
        <Field label="Children included" value={partyForm.kids} onChangeText={(value) => setPartyForm((current) => ({ ...current, kids: value }))} keyboardType="number-pad" />
        <Field label="Adults included" value={partyForm.adults} onChangeText={(value) => setPartyForm((current) => ({ ...current, adults: value }))} keyboardType="number-pad" />
        <Field label="Duration in minutes" value={partyForm.duration} onChangeText={(value) => setPartyForm((current) => ({ ...current, duration: value }))} keyboardType="number-pad" />
        <Field label="Decoration details" value={partyForm.decorations} onChangeText={(value) => setPartyForm((current) => ({ ...current, decorations: value }))} />
        <BooleanRow label="Includes cake" value={partyForm.cake} onChange={(value) => setPartyForm((current) => ({ ...current, cake: value }))} />
        <BooleanRow label="Includes snacks" value={partyForm.snacks} onChange={(value) => setPartyForm((current) => ({ ...current, snacks: value }))} />
        <ChoiceRow label="Area" options={[['party_room', 'Party room'], ['entire_play_area', 'Entire play area']]} value={partyForm.area} onSelect={(value) => setPartyForm((current) => ({ ...current, area: value as PartyForm['area'] }))} />
        <BooleanRow label="Available to customers" value={partyForm.active} onChange={(value) => setPartyForm((current) => ({ ...current, active: value }))} />
      </> : <>
        <Field label="Name" value={planForm.name} onChangeText={(value) => setPlanForm((current) => ({ ...current, name: value }))} />
        <Field label="Description" value={planForm.description} onChangeText={(value) => setPlanForm((current) => ({ ...current, description: value }))} multiline />
        {formKind === 'special' ? <><Field label="Event dates · comma-separated YYYY-MM-DD" value={planForm.eventDates} onChangeText={(value) => setPlanForm((current) => ({ ...current, eventDates: value }))} /><Field label="Special-day code · 2–10 letters/numbers" value={planForm.code} onChangeText={(value) => setPlanForm((current) => ({ ...current, code: value.toUpperCase() }))} /></> : <>
          <Field label="Validity amount" value={planForm.validityValue} onChangeText={(value) => setPlanForm((current) => ({ ...current, validityValue: value }))} keyboardType="number-pad" />
          <ChoiceRow label="Validity unit" options={[["days", "Days"], ["weeks", "Weeks"], ["months", "Months"]]} value={planForm.validityUnit} onSelect={(value) => setPlanForm((current) => ({ ...current, validityUnit: value as PlanForm['validityUnit'] }))} />
          <Field label="Hours per visit" value={planForm.hours} onChangeText={(value) => setPlanForm((current) => ({ ...current, hours: value }))} keyboardType="decimal-pad" />
          <Field label="Maximum visits · blank for unlimited" value={planForm.maxVisits} onChangeText={(value) => setPlanForm((current) => ({ ...current, maxVisits: value }))} keyboardType="number-pad" />
          <Text style={styles.fieldLabel}>Allowed weekdays</Text><View style={styles.weekdays}>{weekdays.map((day, index) => <Pressable key={day} onPress={() => setPlanForm((current) => ({ ...current, weekdays: current.weekdays.includes(index) ? current.weekdays.filter((item) => item !== index) : [...current.weekdays, index].sort() }))} style={[styles.weekday, planForm.weekdays.includes(index) && styles.weekdayActive]}><Text style={[styles.weekdayText, planForm.weekdays.includes(index) && styles.weekdayTextActive]}>{day}</Text></Pressable>)}</View>
        </>}
        <Field label="Price (₹)" value={planForm.price} onChangeText={(value) => setPlanForm((current) => ({ ...current, price: value }))} keyboardType="decimal-pad" />
        <Field label="Minimum age · optional" value={planForm.minAge} onChangeText={(value) => setPlanForm((current) => ({ ...current, minAge: value }))} keyboardType="number-pad" />
        <Field label="Maximum age · optional" value={planForm.maxAge} onChangeText={(value) => setPlanForm((current) => ({ ...current, maxAge: value }))} keyboardType="number-pad" />
        <BooleanRow label="Available to customers" value={planForm.active} onChange={(value) => setPlanForm((current) => ({ ...current, active: value }))} />
      </>}
      {error ? <Text accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
      <View style={styles.formActions}><Pressable accessibilityRole="button" onPress={() => setFormKind(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={saving} onPress={() => void (formKind === 'party' ? saveParty() : savePlan())} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{editingId ? 'Save changes' : 'Create plan'}</Text>}</Pressable></View>
    </ScrollView>
  </Modal>
  <Modal visible={rosterPlan !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRosterPlan(null)}>
    <View style={styles.rosterSheet}><Text style={styles.eyebrow}>MEMBER ROSTER</Text><Text accessibilityRole="header" style={styles.formTitle}>{rosterPlan?.name}</Text>{rosterLoading ? <ActivityIndicator color={C.plum} style={styles.loading} /> : roster.length === 0 ? <Text style={styles.emptyText}>No members or registrations are listed for this plan.</Text> : <ScrollView contentContainerStyle={styles.rosterList}>{roster.map((member, index) => <View key={`${member.child_id}-${index}`} style={styles.rosterRow}><Text style={styles.planName}>{member.child_name}</Text><Text style={styles.planMeta}>{member.parent_name} · {member.phone}</Text><Text style={styles.planMeta}>{member.event_date ? `Event ${member.event_date}` : `${member.started_on ?? '—'} to ${member.expires_on ?? 'No expiry'}`}</Text></View>)}</ScrollView>}<Pressable accessibilityRole="button" onPress={() => setRosterPlan(null)} style={[styles.cancelButton, styles.rosterClose]}><Text style={styles.cancelText}>Close</Text></Pressable></View>
  </Modal>
  </View>;
}

function Field({ label, value, onChangeText, keyboardType, multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'number-pad' | 'decimal-pad' | 'default'; multiline?: boolean }) {
  return <><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={keyboardType ?? 'default'} multiline={multiline} placeholder={label} placeholderTextColor="#8B8373" style={[styles.formInput, multiline && styles.multilineInput]} /></>;
}
function BooleanRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.booleanRow}><Text style={styles.fieldLabel}>{label}</Text><Switch value={value} onValueChange={onChange} trackColor={{ false: '#D7D1D8', true: '#B9A8C3' }} thumbColor={value ? C.plum : '#FFFFFF'} /></View>;
}
function ChoiceRow({ label, value, options, onSelect }: { label: string; value: string; options: string[][]; onSelect: (value: string) => void }) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceRow}>{options.map(([option, text]) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected: value === option }} onPress={() => onSelect(option)} style={[styles.choice, value === option && styles.choiceActive]}><Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{text}</Text></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  webPlanCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 17, padding: 14, marginBottom: 10 },
  webPlanLavender: { backgroundColor: '#F1EBF5', borderColor: '#DCCFE5', borderLeftColor: '#8E6AA2' },
  webPlanGreen: { backgroundColor: '#EEF4E9', borderColor: '#D0DFC5', borderLeftColor: '#789663' },
  webPlanCoral: { backgroundColor: '#F9ECE8', borderColor: '#EAD0C8', borderLeftColor: '#C66E62' },
  webPlanGold: { backgroundColor: '#F8F1E4', borderColor: '#E8DABD', borderLeftColor: '#B28C4D' },
  inactivePlanCard: { opacity: 0.68 },
  webPlanHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  webPlanTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  webPlanName: { flexShrink: 1, color: C.ink, fontSize: 13, fontWeight: '900' },
  webPlanDescription: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
  specialDateBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: '#F4E5C8', color: '#846314', fontSize: 8, fontWeight: '900' },
  inactiveBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: '#E7E2E8', color: C.muted, fontSize: 8, fontWeight: '900' },
  webPlanPrice: { minHeight: 35, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 11, paddingHorizontal: 9, backgroundColor: '#FFFFFFA8' },
  webPlanPriceText: { color: C.ink, fontSize: 12, fontWeight: '900' },
  webPlanChevron: { color: C.muted, fontSize: 15, fontWeight: '700' },
  webPlanInfoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  webPlanInfo: { width: '47%', minHeight: 58, borderRadius: 11, padding: 9, backgroundColor: '#FFFFFFA8' },
  webPlanInfoLabel: { color: C.muted, fontSize: 7, fontWeight: '900', letterSpacing: 0.65 },
  webPlanInfoValue: { color: C.ink, fontSize: 10, fontWeight: '800', marginTop: 5 },
  root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }, back: { minHeight: 40, justifyContent: 'center' }, backText: { color: C.plum, fontSize: 12, fontWeight: '800' }, refresh: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, refreshText: { color: C.plum, fontSize: 24 }, eyebrow: { color: C.plum, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: C.ink, fontSize: 19, fontWeight: '800', marginTop: 4 }, subtitle: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, tabs: { flexDirection: 'row', gap: 5, borderRadius: 13, padding: 4, backgroundColor: C.canvas, marginBottom: 14 }, tab: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 3 }, tabActive: { backgroundColor: C.plum }, tabText: { color: C.muted, fontSize: 8, fontWeight: '800', textAlign: 'center' }, tabTextActive: { color: '#FFFFFF' }, createButton: { minHeight: 45, borderRadius: 12, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }, createText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, card: { borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 12, backgroundColor: C.surface, marginBottom: 8 }, planHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }, planTitleArea: { flex: 1, minWidth: 0 }, planName: { color: C.ink, fontSize: 12, fontWeight: '900' }, planMeta: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 4 }, activeTag: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 5, fontSize: 7, fontWeight: '900' }, activeOn: { color: C.mint, backgroundColor: '#EAF2E4' }, activeOff: { color: C.muted, backgroundColor: '#F1EFF0' }, description: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 8 }, cardActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: C.line }, secondaryButton: { minHeight: 36, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, borderColor: C.line, justifyContent: 'center' }, secondaryText: { color: C.plumDark, fontSize: 8, fontWeight: '800' }, dangerButton: { minHeight: 36, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1, borderColor: '#E8C9C6', justifyContent: 'center' }, dangerText: { color: C.coral, fontSize: 8, fontWeight: '800' }, empty: { padding: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14 }, emptyText: { color: C.muted, fontSize: 10, textAlign: 'center' }, loading: { marginTop: 28 }, errorBox: { backgroundColor: '#FBE8E2', borderWidth: 1, borderColor: '#EDC5B9', borderRadius: 12, padding: 11, marginBottom: 10 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 9, lineHeight: 14, marginTop: 3 },
  formSheet: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, paddingTop: 28, paddingBottom: 36, backgroundColor: C.canvas }, formTitle: { color: C.ink, fontSize: 21, fontWeight: '900', marginTop: 5, marginBottom: 10 }, fieldLabel: { color: C.ink, fontSize: 9, fontWeight: '800', marginTop: 10, marginBottom: 5 }, formInput: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: C.surface, color: C.ink, paddingHorizontal: 10, fontSize: 11 }, multilineInput: { minHeight: 70, paddingTop: 9, textAlignVertical: 'top' }, booleanRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, choice: { minHeight: 34, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, choiceActive: { backgroundColor: C.plumTint, borderColor: '#D7C8DE' }, choiceText: { color: C.muted, fontSize: 8, fontWeight: '700' }, choiceTextActive: { color: C.plumDark, fontWeight: '900' }, weekdays: { flexDirection: 'row', gap: 4 }, weekday: { flex: 1, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface }, weekdayActive: { backgroundColor: C.plumTint, borderColor: '#D7C8DE' }, weekdayText: { color: C.muted, fontSize: 7, fontWeight: '800' }, weekdayTextActive: { color: C.plumDark }, formError: { color: C.coral, fontSize: 9, lineHeight: 14, marginTop: 9 }, formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 }, cancelButton: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: C.muted, fontSize: 10, fontWeight: '800' }, saveButton: { minHeight: 42, minWidth: 120, borderRadius: 10, paddingHorizontal: 14, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' }, saveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' }, disabled: { opacity: 0.5 }, rosterSheet: { flex: 1, backgroundColor: C.canvas, padding: 20, paddingTop: 28 }, rosterList: { paddingBottom: 20 }, rosterRow: { padding: 11, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface, marginBottom: 7 }, rosterClose: { alignSelf: 'flex-end', marginTop: 10 },
});
