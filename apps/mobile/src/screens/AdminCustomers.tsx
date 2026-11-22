import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';
import { openCustomerMessageDraft } from '../integrations/customerMessaging';

const PAGE_SIZE = 30;

type ChildSummary = {
  id: string; name: string; age: number; subscription_active: boolean;
  subscription_started_on: string | null; subscription_expires_on: string | null;
  plan_name: string | null; plan_id?: string | null; special_plan_ids?: string[]; max_visits?: number | null; visits_used?: number;
  currently_checked_in: boolean; active_session_id: string | null;
};
type Customer = {
  customer_id: string; parent_name: string; phone: string; secondary_phone: string | null;
  created_at: string; any_active_subscription: boolean; children: ChildSummary[] | null;
  currently_checked_in: boolean;
};
type ChildDetail = { date_of_birth: string; address: string | null; allergies: string | null; medical_conditions: string | null; special_instructions: string | null };
type CustomerContact = { phone: string; secondary_phone: string | null; whatsapp_consent: boolean; photo_consent: boolean; how_heard: string | null };
type VisitRow = { visit_day: string; status: string; checked_in_at: string; checked_out_at: string | null; intended_duration_mins: number | null; actual_duration_mins: number | null };
type PlanOption = { id: string; name: string; plan_type: 'recurring' | 'special'; event_date: string | null; active?: boolean; description?: string | null; price?: number };
type LandingPlan = PlanOption;
type MembershipFilter = 'all' | 'active' | 'expiring' | 'expired';
type MembershipEdit = { customerId: string; childId: string; childName: string; start: string; end: string; maxVisits: number | null; visitsUsed: number; expired: boolean };
type EditingDetails = { customerId: string; childId: string; parentName: string; phone: string; secondaryPhone: string; childName: string; dateOfBirth: string; address: string; allergies: string; medicalConditions: string; specialInstructions: string };

const phoneDigits = (value: string) => value.replace(/\D/g, '');
const whatsappDigits = (value: string) => { const digits = phoneDigits(value); return digits.length === 10 ? `91${digits}` : digits; };

function ageFromDate(value: string) {
  const birth = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default function AdminCustomers({ onBack, initialQuery = '', initialChildId }: { onBack: () => void; initialQuery?: string; initialChildId?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [landing, setLanding] = useState(!initialQuery.trim() && !initialChildId);
  const [landingPlans, setLandingPlans] = useState<LandingPlan[] | null>(null);
  const [membershipFilter, setMembershipFilter] = useState<MembershipFilter>('all');
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [planFilterOptions, setPlanFilterOptions] = useState<PlanOption[]>([]);
  const [planFilterLoading, setPlanFilterLoading] = useState(false);
  const [planFilterOpen, setPlanFilterOpen] = useState(false);
  const [membershipEdit, setMembershipEdit] = useState<MembershipEdit | null>(null);
  const [membershipSaving, setMembershipSaving] = useState(false);
  const [visitsRemaining, setVisitsRemaining] = useState('');
  const [rows, setRows] = useState<Customer[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailsByChild, setDetailsByChild] = useState<Record<string, ChildDetail>>({});
  const [contactsByCustomer, setContactsByCustomer] = useState<Record<string, CustomerContact>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyChildId, setBusyChildId] = useState<string | null>(null);
  const [durationChild, setDurationChild] = useState<{ customerId: string; child: ChildSummary } | null>(null);
  const [historyByChild, setHistoryByChild] = useState<Record<string, VisitRow[]>>({});
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [addFamilyOpen, setAddFamilyOpen] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [newChildName, setNewChildName] = useState('');
  const [newChildDob, setNewChildDob] = useState('');
  const [savingFamily, setSavingFamily] = useState(false);
  const [editing, setEditing] = useState<EditingDetails | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [planOptions, setPlanOptions] = useState<PlanOption[]>([]);
  const [planOptionsLoading, setPlanOptionsLoading] = useState(false);
  const [planForChild, setPlanForChild] = useState<{ customerId: string; child: ChildSummary } | null>(null);
  const [applyingPlan, setApplyingPlan] = useState(false);

  const search = useCallback(async (nextOffset = 0, append = false, queryOverride?: string, filterOverride?: MembershipFilter, planOverride?: string | null, allowBrowse = false) => {
    const normalized = (queryOverride ?? query).trim();
    const activeFilter = filterOverride ?? membershipFilter;
    const activePlanId = planOverride !== undefined ? planOverride : planFilter;
    if (normalized.length < 2 && activeFilter === 'all' && !activePlanId && !allowBrowse) {
      setError('Enter at least two characters or choose a membership filter.');
      return;
    }
    setLanding(false);
    setLoading(true);
    setError(null);
    const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const expiryCutoff = new Date(`${todayIst}T00:00:00Z`); expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + 7);
    const { data, error: requestError } = activeFilter === 'expired'
      ? await supabase.rpc('directory_browse_expired_customers_with_plans', { p_query: normalized.length >= 2 ? normalized : null, p_limit: PAGE_SIZE, p_offset: nextOffset })
      : await supabase.rpc('directory_browse_customers_with_plans', {
        p_query: normalized.length >= 2 ? normalized : null,
        p_plan_id: activePlanId,
        p_members_only: activeFilter === 'active',
        p_created_since: null,
        p_expiring_before: activeFilter === 'expiring' ? expiryCutoff.toISOString().slice(0, 10) : null,
        p_on_site_first: true,
        p_limit: PAGE_SIZE,
        p_offset: nextOffset,
      });
    setLoading(false);
    if (requestError) {
      setError(`${requestError.message}${requestError.code ? ` (${requestError.code})` : ''}`);
      if (!append) setRows([]);
      return;
    }
    const page = (data as Customer[] | null) ?? [];
    setRows((current) => append ? [...current, ...page] : page);
    setOffset(nextOffset + page.length);
    setHasMore(page.length === PAGE_SIZE);
    setExpandedId(null);
  }, [membershipFilter, planFilter, query]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('membership_plans').select('id,name,description,plan_type,event_date,active,price').order('active', { ascending: false }).order('plan_type').order('name'),
      supabase.rpc('admin_plan_member_counts'),
    ]).then(([plansResult]) => {
      if (active && !plansResult.error) setLandingPlans((plansResult.data as LandingPlan[]) ?? []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (initialQuery.trim().length >= 2) void search(0, false, initialQuery);
  }, []);

  const loadChildDetails = useCallback(async (customerId: string, childId: string) => {
    if (detailsByChild[childId]) return detailsByChild[childId];
    setDetailLoading(childId);
    setError(null);
    const { data, error: requestError } = await supabase.rpc('directory_child_details', {
      p_customer_id: customerId,
      p_child_id: childId,
    });
    setDetailLoading(null);
    if (requestError) {
      setError(`${requestError.message}${requestError.code ? ` (${requestError.code})` : ''}`);
      return null;
    }
    if (!data) return null;
    const details = data as ChildDetail;
    setDetailsByChild((current) => ({ ...current, [childId]: details }));
    return details;
  }, [detailsByChild]);

  const loadCustomerContact = useCallback(async (customerId: string) => {
    if (contactsByCustomer[customerId]) return contactsByCustomer[customerId];
    const { data, error: contactError } = await supabase.from('customers')
      .select('phone,secondary_phone,whatsapp_consent,photo_consent,how_heard')
      .eq('id', customerId).maybeSingle();
    if (contactError || !data) {
      setError(contactError ? `${contactError.message}${contactError.code ? ` (${contactError.code})` : ''}` : 'Contact details were not found.');
      return null;
    }
    const contact = data as CustomerContact;
    setContactsByCustomer((current) => ({ ...current, [customerId]: contact }));
    setRows((current) => current.map((row) => row.customer_id === customerId ? { ...row, phone: contact.phone, secondary_phone: contact.secondary_phone } : row));
    return contact;
  }, [contactsByCustomer]);

  useEffect(() => {
    if (!initialChildId) return;
    const family = rows.find((row) => row.children?.some((child) => child.id === initialChildId));
    if (!family) return;
    setExpandedId(family.customer_id);
    void loadCustomerContact(family.customer_id);
    void loadChildDetails(family.customer_id, initialChildId);
  }, [initialChildId, rows, loadCustomerContact, loadChildDetails]);

  const toggleCustomer = (customerId: string, isExpanded: boolean) => {
    setExpandedId(isExpanded ? null : customerId);
    if (!isExpanded) void loadCustomerContact(customerId);
  };

  const openPhone = async (phone: string) => {
    try { await Linking.openURL(`tel:${phoneDigits(phone)}`); }
    catch { setError('This device could not open the phone dialer.'); }
  };

  const openWhatsAppDraft = async (customer: Customer) => {
    const contact = contactsByCustomer[customer.customer_id] ?? await loadCustomerContact(customer.customer_id);
    if (!contact) return;
    const number = whatsappDigits(contact.phone);
    if (number.length < 11 || number.length > 15) { setError('The primary phone number is not valid for WhatsApp.'); return; }
    const text = `Hi ${customer.parent_name}, this is QureoCity. How can we help you today?`;
    try { await openCustomerMessageDraft({ channel: 'whatsapp', phone: number, message: text }); }
    catch { setError('WhatsApp could not be opened on this device.'); }
  };

  const checkIn = async (customer: Customer, child: ChildSummary, durationMins: number | null) => {
    setBusyChildId(child.id); setError(null);
    const { data, error: actionError } = await supabase.rpc('checkin_create_sessions', {
      p_customer_id: customer.customer_id,
      p_child_ids: [child.id],
      p_duration_mins: durationMins,
      p_client_key: `admin-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      p_status: 'active',
    });
    setBusyChildId(null); setDurationChild(null);
    if (actionError) { setError(`${actionError.message}${actionError.code ? ` (${actionError.code})` : ''}`); return; }
    const sessionId = data?.sessions?.[0]?.session_id ?? null;
    setRows((current) => current.map((row) => {
      if (row.customer_id !== customer.customer_id) return row;
      const children = (row.children ?? []).map((item) => item.id === child.id ? { ...item, currently_checked_in: true, active_session_id: sessionId } : item);
      return { ...row, currently_checked_in: children.some((item) => item.currently_checked_in), children };
    }));
  };

  const checkOut = (customer: Customer, child: ChildSummary) => {
    if (!child.active_session_id) return;
    Alert.alert('Check this child out?', `${child.name} · ${customer.parent_name}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Check out', onPress: () => { void applyCheckOut(customer, child); } },
    ]);
  };
  const applyCheckOut = async (customer: Customer, child: ChildSummary) => {
    setBusyChildId(child.id); setError(null);
    const { error: actionError } = await supabase.rpc('checkout_session', { p_session_id: child.active_session_id });
    setBusyChildId(null);
    if (actionError) { setError(`${actionError.message}${actionError.code ? ` (${actionError.code})` : ''}`); return; }
    setRows((current) => current.map((row) => {
      if (row.customer_id !== customer.customer_id) return row;
      const children = (row.children ?? []).map((item) => item.id === child.id ? { ...item, currently_checked_in: false, active_session_id: null } : item);
      return { ...row, currently_checked_in: children.some((item) => item.currently_checked_in), children };
    }));
  };

  const toggleHistory = async (customerId: string, childId: string) => {
    if (historyOpenId === childId) { setHistoryOpenId(null); return; }
    setHistoryOpenId(childId);
    if (historyByChild[childId]) return;
    setHistoryLoadingId(childId); setError(null);
    const { data, error: historyError } = await supabase.rpc('customer_visit_history', { p_customer_id: customerId, p_child_id: childId });
    setHistoryLoadingId(null);
    if (historyError) { setHistoryOpenId(null); setError(`${historyError.message}${historyError.code ? ` (${historyError.code})` : ''}`); return; }
    setHistoryByChild((current) => ({ ...current, [childId]: (data as VisitRow[] | null) ?? [] }));
  };

  const addFamily = async () => {
    const digits = parentPhone.replace(/\D/g, '');
    if (!parentName.trim() || digits.length < 10 || digits.length > 15 || !newChildName.trim() || !newChildDob) {
      setError('Enter the guardian name, a valid phone, and the child’s name and date of birth.'); return;
    }
    setSavingFamily(true); setError(null);
    const { data, error: createError } = await supabase.rpc('checkin_register', {
      p_phone: parentPhone.trim(), p_parent_name: parentName.trim(),
      p_children: [{ name: newChildName.trim(), date_of_birth: newChildDob }],
      p_client_key: `admin-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    setSavingFamily(false);
    if (createError) { setError(`${createError.message}${createError.code ? ` (${createError.code})` : ''}`); return; }
    if (!data?.customer_id) { setError('Customer could not be created. Refresh and try again.'); return; }
    const phone = parentPhone.trim();
    setAddFamilyOpen(false); setParentName(''); setParentPhone(''); setNewChildName(''); setNewChildDob(''); setQuery(phone);
    void search(0, false, phone);
  };

  const beginEdit = async (customer: Customer, child: ChildSummary) => {
    const details = await loadChildDetails(customer.customer_id, child.id);
    if (!details) return;
    const contact = await loadCustomerContact(customer.customer_id);
    if (!contact) return;
    setEditing({ customerId: customer.customer_id, childId: child.id, parentName: customer.parent_name, phone: contact.phone, secondaryPhone: contact.secondary_phone ?? '', childName: child.name, dateOfBirth: details.date_of_birth, address: details.address ?? '', allergies: details.allergies ?? '', medicalConditions: details.medical_conditions ?? '', specialInstructions: details.special_instructions ?? '' });
  };

  const saveDetails = async () => {
    if (!editing) return;
    const phone = phoneDigits(editing.phone);
    const secondaryPhone = phoneDigits(editing.secondaryPhone);
    if (phone.length < 10 || phone.length > 15) { setError('Primary phone must have 10 to 15 digits.'); return; }
    if (secondaryPhone && (secondaryPhone.length < 10 || secondaryPhone.length > 15)) { setError('Secondary phone must have 10 to 15 digits or be blank.'); return; }
    setSavingDetails(true); setError(null);
    const { error: saveError } = await supabase.rpc('admin_update_customer_record_mobile', {
      p_customer_id: editing.customerId, p_child_id: editing.childId,
      p_parent_name: editing.parentName, p_phone: phone, p_secondary_phone: secondaryPhone || null,
      p_child_name: editing.childName,
      p_date_of_birth: editing.dateOfBirth, p_address: editing.address,
      p_allergies: editing.allergies, p_medical_conditions: editing.medicalConditions,
      p_special_instructions: editing.specialInstructions,
    });
    setSavingDetails(false);
    if (saveError) { setError(`${saveError.message}${saveError.code ? ` (${saveError.code})` : ''}`); return; }
    setRows((current) => current.map((row) => row.customer_id !== editing.customerId ? row : {
      ...row, parent_name: editing.parentName.trim(), phone, secondary_phone: secondaryPhone || null, children: (row.children ?? []).map((child) => child.id !== editing.childId ? child : { ...child, name: editing.childName.trim(), age: ageFromDate(editing.dateOfBirth) }),
    }));
    setContactsByCustomer((current) => ({ ...current, [editing.customerId]: { ...(current[editing.customerId] ?? { whatsapp_consent: false, photo_consent: false, how_heard: null }), phone, secondary_phone: secondaryPhone || null } }));
    setDetailsByChild((current) => ({ ...current, [editing.childId]: { date_of_birth: editing.dateOfBirth, address: editing.address.trim() || null, allergies: editing.allergies.trim() || null, medical_conditions: editing.medicalConditions.trim() || null, special_instructions: editing.specialInstructions.trim() || null } }));
    setEditing(null);
  };

  const deleteCustomer = (customer: Customer) => Alert.alert('Delete this family?', `${customer.parent_name} and all child records will be removed. Historical registration records are preserved, but this cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete family', style: 'destructive', onPress: () => { void applyDelete(customer); } },
  ]);
  const applyDelete = async (customer: Customer) => {
    setDeletingCustomer(true); setError(null);
    const { error: deleteError } = await supabase.rpc('admin_delete_customer', { p_customer_id: customer.customer_id });
    setDeletingCustomer(false);
    if (deleteError) { setError(`${deleteError.message}${deleteError.code ? ` (${deleteError.code})` : ''}`); return; }
    setRows((current) => current.filter((row) => row.customer_id !== customer.customer_id));
  };

  const openPlanPicker = async (customer: Customer, child: ChildSummary) => {
    setPlanForChild({ customerId: customer.customer_id, child });
    if (planOptions.length) return;
    setPlanOptionsLoading(true);
    const { data, error: plansError } = await supabase.from('membership_plans')
      .select('id,name,plan_type,event_date').eq('active', true).order('plan_type').order('name');
    setPlanOptionsLoading(false);
    if (plansError) { setError(`${plansError.message}${plansError.code ? ` (${plansError.code})` : ''}`); return; }
    setPlanOptions((data as PlanOption[] | null) ?? []);
  };

  const assignPlan = async (plan: PlanOption) => {
    if (!planForChild) return;
    setApplyingPlan(true); setError(null);
    const { data, error: assignError } = plan.plan_type === 'recurring'
      ? await supabase.rpc('admin_apply_plan_to_child', { p_child_id: planForChild.child.id, p_plan_id: plan.id })
      : await supabase.rpc('admin_add_child_special_pass', { p_child_id: planForChild.child.id, p_plan_id: plan.id });
    setApplyingPlan(false);
    if (assignError) { setError(`${assignError.message}${assignError.code ? ` (${assignError.code})` : ''}`); return; }
    setPlanForChild(null);
    const customer = rows.find((row) => row.customer_id === planForChild.customerId);
    Alert.alert('Plan assigned', `${plan.name}${plan.plan_type === 'recurring' && data?.receipt_number ? ` · Receipt ${data.receipt_number}` : ''}`);
    if (customer) void search(0, false, query || customer.phone);
  };

  const openPlanFilter = async () => {
    setPlanFilterOpen(true);
    if (planFilterOptions.length || planFilterLoading) return;
    setPlanFilterLoading(true);
    const { data, error: plansError } = await supabase.from('membership_plans').select('id,name,plan_type,event_date,active').order('active',{ascending:false}).order('plan_type').order('name');
    setPlanFilterLoading(false);
    if (plansError) { setError(`${plansError.message}${plansError.code ? ` (${plansError.code})` : ''}`); return; }
    setPlanFilterOptions((data ?? []) as PlanOption[]);
  };

  const choosePlanFilter = (planId: string | null) => {
    setPlanFilter(planId); setPlanFilterOpen(false);
    void search(0, false, query, membershipFilter, planId);
  };

  const saveMembership = async () => {
    if (!membershipEdit) return;
    const { start, end, maxVisits } = membershipEdit;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) { setError('Choose a valid membership start and end date.'); return; }
    if (end < start) { setError('End date cannot be before the start date.'); return; }
    const remaining = maxVisits === null ? null : Number(visitsRemaining);
    if (maxVisits !== null && (!visitsRemaining.trim() || !Number.isInteger(remaining) || remaining! < 0)) { setError('Enter a whole number of visits remaining, 0 or more.'); return; }
    setMembershipSaving(true); setError(null);
    const { error: updateError } = await supabase.rpc('admin_update_child_membership_details', { p_child_id: membershipEdit.childId, p_started_on: start, p_expires_on: end, p_visits_remaining: remaining });
    setMembershipSaving(false);
    if (updateError) { setError(`${updateError.message}${updateError.code ? ` (${updateError.code})` : ''}`); return; }
    const customerId = membershipEdit.customerId; setMembershipEdit(null);
    Alert.alert('Membership updated', 'The membership dates and remaining visit allowance were saved.');
    const customer = rows.find((row) => row.customer_id === customerId);
    if (customer) void search(0, false, query || customer.phone);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹ Back</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setAddFamilyOpen(true)} style={styles.addButton}><Text style={styles.addButtonText}>＋ Add family</Text></Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Customers</Text>
        <Text style={styles.description}>Search families, children, and memberships.</Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel="Search customers, children, or phone numbers"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            onChangeText={setQuery}
            onSubmitEditing={() => void search()}
            placeholder="Search a child, parent, or phone number"
            placeholderTextColor="#8B8373"
            returnKeyType="search"
            value={query}
            style={styles.searchInput}
          />
          <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search()} style={[styles.searchButton, loading && styles.disabled]}>
            {loading ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.searchButtonText}>Search</Text>}
          </Pressable>
        </View>
        {landing ? <>
          <View style={styles.landingShortcuts}>
            <Pressable accessibilityRole="button" onPress={() => { setMembershipFilter('all'); setPlanFilter(null); void search(0, false, '', 'all', null, true); }} style={({ pressed }) => [styles.landingShortcut, styles.landingShortcutGreen, pressed && styles.pressed]}>
              <Text style={styles.landingShortcutIcon}>⌕</Text><Text style={styles.landingShortcutText}>Browse all customers</Text><Text style={styles.landingShortcutArrow}>›</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setMembershipFilter('active'); setPlanFilter(null); void search(0, false, '', 'active', null, true); }} style={({ pressed }) => [styles.landingShortcut, styles.landingShortcutPurple, pressed && styles.pressed]}>
              <Text style={styles.landingShortcutIcon}>✓</Text><Text style={styles.landingShortcutText}>Show active customers</Text><Text style={styles.landingShortcutArrow}>›</Text>
            </Pressable>
          </View>
          <View style={styles.landingSectionHeader}><Text style={styles.landingSectionIcon}>✦</Text><Text style={styles.landingSectionTitle}>Plans</Text></View>
          {landingPlans === null ? <ActivityIndicator color={C.plum} style={styles.landingLoading} /> : landingPlans.length === 0 ? <View style={styles.landingEmpty}><Text style={styles.landingEmptyText}>No plans are set up yet.</Text></View> : landingPlans.map((plan, index) => (
            <Pressable key={plan.id} accessibilityRole="button" onPress={() => { setPlanFilter(plan.id); setMembershipFilter('all'); void search(0, false, '', 'all', plan.id, true); }} style={({ pressed }) => [styles.landingPlanCard, index % 2 === 0 ? styles.landingPlanLavender : styles.landingPlanPeach, !plan.active && styles.landingPlanInactive, pressed && styles.pressed]}>
              <View style={styles.landingPlanTop}><Text numberOfLines={1} style={styles.landingPlanName}>{plan.name}</Text><Text style={styles.landingPlanBadge}>{plan.plan_type === 'special' ? 'SPECIAL DAY' : 'MEMBERSHIP'}</Text></View>
              <View style={styles.landingPlanBottom}><Text numberOfLines={1} style={styles.landingPlanMeta}>{plan.event_date ? new Date(`${plan.event_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : plan.description || 'Tap to view customers'}</Text><Text style={[styles.landingPlanStatus, !plan.active && styles.landingPlanInactiveText]}>{plan.active ? 'Active' : 'Inactive'}</Text></View>
            </Pressable>
          ))}
        </> : <>
          <View style={styles.membershipFilters}>{([['all','All'],['active','Active'],['expiring','Expiring'],['expired','Expired']] as const).map(([value,label])=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:membershipFilter===value}} onPress={()=>{setMembershipFilter(value);if(value==='expired'){setPlanFilter(null);void search(0,false,query,value,null);}else void search(0,false,query,value);}} style={[styles.membershipFilter,membershipFilter===value&&styles.membershipFilterOn]}><Text style={[styles.membershipFilterText,membershipFilter===value&&styles.membershipFilterTextOn]}>{label}</Text></Pressable>)}</View>
          {membershipFilter !== 'expired' ? <View style={styles.planFilterRow}><Pressable accessibilityRole="button" onPress={()=>void openPlanFilter()} style={styles.planFilterButton}><Text style={styles.planFilterText}>{planFilterOptions.find((plan)=>plan.id===planFilter)?.name ?? 'Filter by plan'}</Text><Text style={styles.planFilterCaret}>⌄</Text></Pressable>{planFilter ? <Pressable accessibilityRole="button" onPress={()=>choosePlanFilter(null)} style={styles.clearFilter}><Text style={styles.clearFilterText}>Clear</Text></Pressable> : null}</View> : null}
        </>}
        {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorTitle}>Couldn’t load customer data</Text><Text style={styles.errorText}>{error}</Text></View> : null}
        {!landing && rows.length === 0 && !loading ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{query.trim().length >= 2 ? 'No customers found' : 'No customers to show'}</Text><Text style={styles.emptyText}>Try another search or membership filter.</Text></View> : null}
        {rows.map((customer) => {
          const expanded = expandedId === customer.customer_id;
          return (
            <View key={customer.customer_id} style={styles.customerCard}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => toggleCustomer(customer.customer_id, expanded)} style={styles.customerSummary}>
                <View style={styles.customerInitial}><Text style={styles.initialText}>{customer.parent_name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.customerText}>
                  <Text numberOfLines={1} style={styles.customerName}>{customer.parent_name}</Text>
                  <Text style={styles.customerMeta}>{customer.phone} · {customer.children?.length ?? 0} children</Text>
                </View>
                <View style={styles.badgeColumn}>
                  {customer.currently_checked_in ? <Text style={styles.onsiteBadge}>ON SITE</Text> : null}
                  {customer.any_active_subscription ? <Text style={styles.memberBadge}>MEMBER</Text> : null}
                </View>
              </Pressable>
              {expanded ? <View style={styles.childrenList}>
                <View style={styles.contactCard}><Text style={styles.contactHeading}>Family contact</Text><Text style={styles.contactLine}>Primary · {customer.phone}</Text>{customer.secondary_phone ? <Text style={styles.contactLine}>Secondary · {customer.secondary_phone}</Text> : null}{contactsByCustomer[customer.customer_id]?.how_heard?<Text style={styles.contactLine}>How they found us · {contactsByCustomer[customer.customer_id].how_heard}</Text>:null}<Text style={styles.contactConsent}>{contactsByCustomer[customer.customer_id] ? `WhatsApp updates consent · ${contactsByCustomer[customer.customer_id].whatsapp_consent ? 'Yes' : 'No'}  ·  Photo consent · ${contactsByCustomer[customer.customer_id].photo_consent ? 'Yes' : 'No'}` : 'Loading consent details…'}</Text><Text style={styles.contactHint}>WhatsApp opens a draft for the admin to review. It is never sent automatically.</Text><View style={styles.contactActions}><Pressable accessibilityRole="button" onPress={()=>void openPhone(customer.phone)} style={styles.contactButton}><Text style={styles.contactButtonText}>Call primary</Text></Pressable>{customer.secondary_phone?<Pressable accessibilityRole="button" onPress={()=>void openPhone(customer.secondary_phone!)} style={styles.contactButton}><Text style={styles.contactButtonText}>Call secondary</Text></Pressable>:null}<Pressable accessibilityRole="button" onPress={()=>void openWhatsAppDraft(customer)} style={styles.whatsappButton}><Text style={styles.whatsappButtonText}>WhatsApp draft</Text></Pressable></View></View>
                <Pressable accessibilityRole="button" disabled={deletingCustomer} onPress={() => deleteCustomer(customer)} style={styles.deleteFamily}><Text style={styles.deleteFamilyText}>{deletingCustomer ? 'Deleting…' : 'Delete family'}</Text></Pressable>
                {(customer.children ?? []).length === 0 ? <Text style={styles.emptyText}>No children on this family record.</Text> : (customer.children ?? []).map((child) => {
                  const childDetails = detailsByChild[child.id];
                  return <View key={child.id} style={styles.childCard}>
                    <Pressable accessibilityRole="button" onPress={() => void loadChildDetails(customer.customer_id, child.id)} style={styles.childHeader}>
                      <View style={styles.childTitleBlock}>
                        <Text style={styles.childName}>{child.name}{child.age ? ` · ${child.age}y` : ''}</Text>
                        <Text style={styles.childSub}>{child.currently_checked_in ? 'Checked in now' : child.plan_name ? `${child.plan_name}${child.subscription_expires_on ? ` · until ${child.subscription_expires_on}` : ''}` : 'No current plan'}</Text>
                      </View>
                      {detailLoading === child.id ? <ActivityIndicator color={C.plum} size="small" /> : <Text style={styles.detailsLink}>{childDetails ? 'Loaded' : 'View details'}</Text>}
                    </Pressable>
                    {childDetails ? <View style={styles.childDetails}>
                      <Text style={styles.childDetailLine}>Date of birth · {childDetails.date_of_birth}</Text>
                      {childDetails.address ? <Text style={styles.childDetailLine}>Address · {childDetails.address}</Text> : null}
                      {childDetails.allergies ? <Text style={styles.medicalLine}>Allergies · {childDetails.allergies}</Text> : null}
                      {childDetails.medical_conditions ? <Text style={styles.medicalLine}>Conditions · {childDetails.medical_conditions}</Text> : null}
                      {childDetails.special_instructions ? <Text style={styles.medicalLine}>Care notes · {childDetails.special_instructions}</Text> : null}
                    </View> : null}
                    <View style={styles.childActions}>
                      <Pressable accessibilityRole="button" onPress={() => void toggleHistory(customer.customer_id, child.id)} style={styles.smallAction}>
                        <Text style={styles.smallActionText}>{historyLoadingId === child.id ? 'Loading…' : historyOpenId === child.id ? 'Hide visit history' : 'Visit history'}</Text>
                      </Pressable>
                      {child.currently_checked_in && child.active_session_id ? (
                        <Pressable accessibilityRole="button" disabled={busyChildId === child.id} onPress={() => checkOut(customer, child)} style={[styles.checkOutAction, busyChildId === child.id && styles.disabled]}><Text style={styles.checkOutText}>{busyChildId === child.id ? 'Working…' : 'Check out'}</Text></Pressable>
                      ) : <Pressable accessibilityRole="button" disabled={busyChildId === child.id} onPress={() => setDurationChild({ customerId: customer.customer_id, child })} style={[styles.checkInAction, busyChildId === child.id && styles.disabled]}><Text style={styles.checkInText}>{busyChildId === child.id ? 'Working…' : 'Check in'}</Text></Pressable>}
                      <Pressable accessibilityRole="button" onPress={() => void beginEdit(customer, child)} style={styles.smallAction}><Text style={styles.smallActionText}>Edit details</Text></Pressable>
                      <Pressable accessibilityRole="button" onPress={() => void openPlanPicker(customer, child)} style={styles.smallAction}><Text style={styles.smallActionText}>Assign plan</Text></Pressable>
                      {(child.plan_id || child.plan_name || child.subscription_started_on || child.subscription_expires_on || child.max_visits != null) ? <Pressable accessibilityRole="button" onPress={() => { setError(null); setMembershipEdit({ customerId:customer.customer_id, childId:child.id, childName:child.name, start:child.subscription_started_on ?? '', end:child.subscription_expires_on ?? '', maxVisits:child.max_visits ?? null, visitsUsed:child.visits_used ?? 0, expired:!child.subscription_active }); setVisitsRemaining(child.max_visits == null ? '' : String(Math.max(child.max_visits-(child.visits_used??0),0))); }} style={styles.smallAction}><Text style={styles.smallActionText}>Edit membership</Text></Pressable> : null}
                    </View>
                    {historyOpenId === child.id && historyByChild[child.id] ? <View style={styles.historyBox}>
                      {historyByChild[child.id].length === 0 ? <Text style={styles.historyText}>No visits recorded yet.</Text> : historyByChild[child.id].map((visit, index) => <View key={`${visit.visit_day}-${index}`} style={styles.historyRow}>
                        <Text style={styles.historyTitle}>{new Date(`${visit.visit_day.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {visit.status === 'active' ? 'Active' : visit.status === 'completed' ? 'Completed' : visit.status}</Text>
                        <Text style={styles.historyText}>{visit.intended_duration_mins === null ? 'Unlimited' : `${visit.intended_duration_mins} min planned`}{visit.actual_duration_mins === null ? '' : ` · ${visit.actual_duration_mins} min actual`}</Text>
                      </View>)}
                    </View> : null}
                  </View>;
                })}
              </View> : null}
            </View>
          );
        })}
        {hasMore ? <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search(offset, true)} style={styles.moreButton}><Text style={styles.moreText}>{loading ? 'Loading…' : 'Load more results'}</Text></Pressable> : null}
      </ScrollView>
      <Modal visible={durationChild !== null} transparent animationType="fade" onRequestClose={() => setDurationChild(null)}>
        <View style={styles.modalScrim}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Check in {durationChild?.child.name}</Text><Text style={styles.modalDescription}>Choose the planned visit length.</Text>
          <View style={styles.durationOptions}>
            {[{ label: '1 hour', minutes: 60 }, { label: '2 hours', minutes: 120 }, { label: 'Unlimited', minutes: null }].map((option) => <Pressable key={option.label} accessibilityRole="button" onPress={() => {
              if (!durationChild) return;
              const customer = rows.find((row) => row.customer_id === durationChild.customerId);
              if (!customer) { setDurationChild(null); setError('This customer is no longer in the results. Search again.'); return; }
              void checkIn(customer, durationChild.child, option.minutes);
            }} style={styles.durationButton}><Text style={styles.durationButtonText}>{option.label}</Text></Pressable>)}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setDurationChild(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </View></View>
      </Modal>
      <Modal visible={addFamilyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddFamilyOpen(false)}>
        <View style={styles.addSheet}><Text style={styles.eyebrow}>CUSTOMER DIRECTORY</Text><Text accessibilityRole="header" style={styles.modalTitle}>Add a family</Text><Text style={styles.modalDescription}>Create a parent and first child record using the existing registration flow.</Text>
          <Text style={styles.fieldLabel}>Parent or guardian</Text><TextInput accessibilityLabel="Parent or guardian name" maxLength={120} onChangeText={setParentName} placeholder="Full name" placeholderTextColor="#8B8373" value={parentName} style={styles.formInput} />
          <Text style={styles.fieldLabel}>Phone number</Text><TextInput accessibilityLabel="Phone number" keyboardType="phone-pad" maxLength={24} onChangeText={setParentPhone} placeholder="Phone" placeholderTextColor="#8B8373" value={parentPhone} style={styles.formInput} />
          <Text style={styles.fieldLabel}>Child name</Text><TextInput accessibilityLabel="Child name" maxLength={120} onChangeText={setNewChildName} placeholder="Child name" placeholderTextColor="#8B8373" value={newChildName} style={styles.formInput} />
          <Text style={styles.fieldLabel}>Date of birth · YYYY-MM-DD</Text><TextInput accessibilityLabel="Child date of birth" keyboardType="numbers-and-punctuation" maxLength={10} onChangeText={setNewChildDob} placeholder="2021-06-18" placeholderTextColor="#8B8373" value={newChildDob} style={styles.formInput} />
          {error ? <Text accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
          <View style={styles.formActions}><Pressable accessibilityRole="button" onPress={() => setAddFamilyOpen(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={savingFamily} onPress={() => void addFamily()} style={[styles.saveButton, savingFamily && styles.disabled]}>{savingFamily ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Create family</Text>}</Pressable></View>
        </View>
      </Modal>
      <Modal visible={editing !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing ? <ScrollView contentContainerStyle={styles.addSheet} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>CUSTOMER DIRECTORY</Text><Text accessibilityRole="header" style={styles.modalTitle}>Edit family details</Text><Text style={styles.modalDescription}>Changes are saved through the admin-only customer update RPC.</Text>
          {([
            ['Parent or guardian name', 'parentName'], ['Primary phone', 'phone'], ['Secondary phone · optional', 'secondaryPhone'], ['Child name', 'childName'], ['Date of birth · YYYY-MM-DD', 'dateOfBirth'], ['Address', 'address'], ['Allergies', 'allergies'], ['Medical conditions', 'medicalConditions'], ['Special instructions', 'specialInstructions'],
          ] as const).map(([label, key]) => <View key={key}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput accessibilityLabel={label} keyboardType={key==='phone'||key==='secondaryPhone'?'phone-pad':'default'} maxLength={key === 'dateOfBirth' ? 10 : key==='phone'||key==='secondaryPhone'?24:1000} multiline={key === 'address' || key === 'allergies' || key === 'medicalConditions' || key === 'specialInstructions'} onChangeText={(value) => setEditing((current) => current ? { ...current, [key]: value } : current)} placeholder={key === 'dateOfBirth' ? '2021-06-18' : label} placeholderTextColor="#8B8373" value={editing[key]} style={[styles.formInput, (key === 'address' || key === 'allergies' || key === 'medicalConditions' || key === 'specialInstructions') && styles.multilineInput]} />
          </View>)}
          {error ? <Text accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
          <View style={styles.formActions}><Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={savingDetails} onPress={() => void saveDetails()} style={[styles.saveButton, savingDetails && styles.disabled]}>{savingDetails ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save changes</Text>}</Pressable></View>
        </ScrollView> : null}
      </Modal>
      <Modal visible={planForChild !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlanForChild(null)}>
        <View style={styles.addSheet}><Text style={styles.eyebrow}>MEMBERSHIP MANAGEMENT</Text><Text accessibilityRole="header" style={styles.modalTitle}>Assign a plan</Text><Text style={styles.modalDescription}>{planForChild?.child.name} · Existing admin plan assignment action.</Text>
          {planOptionsLoading ? <ActivityIndicator color={C.plum} style={styles.modalLoading} /> : planOptions.length === 0 ? <Text style={styles.emptyText}>No active plans are available.</Text> : <ScrollView style={styles.planList}>
            {planOptions.map((plan) => <Pressable key={plan.id} accessibilityRole="button" disabled={applyingPlan} onPress={() => void assignPlan(plan)} style={[styles.planOption, applyingPlan && styles.disabled]}>
              <View style={styles.planOptionText}><Text style={styles.planOptionName}>{plan.name}</Text><Text style={styles.planOptionMeta}>{plan.plan_type === 'special' ? `Special day · ${plan.event_date ?? 'Multiple dates'}` : 'Recurring membership'}</Text></View>
              {applyingPlan ? <ActivityIndicator color={C.plum} size="small" /> : <Text style={styles.planSelect}>Assign ›</Text>}
            </Pressable>)}
          </ScrollView>}
          {error ? <Text accessibilityRole="alert" style={styles.formError}>{error}</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => setPlanForChild(null)} style={[styles.cancelButton, styles.planCancel]}><Text style={styles.cancelText}>Close</Text></Pressable>
        </View>
      </Modal>
      <Modal visible={planFilterOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlanFilterOpen(false)}>
        <View style={styles.addSheet}><Text style={styles.eyebrow}>CUSTOMER DIRECTORY</Text><Text accessibilityRole="header" style={styles.modalTitle}>Filter by plan</Text><Text style={styles.modalDescription}>Show families with a child on this membership or special pass.</Text>
          {planFilterLoading ? <ActivityIndicator color={C.plum} style={styles.modalLoading}/> : <ScrollView style={styles.planList}>
            <Pressable accessibilityRole="button" onPress={()=>choosePlanFilter(null)} style={styles.planOption}><Text style={styles.planOptionName}>All plans</Text>{!planFilter?<Text style={styles.planSelect}>Selected</Text>:null}</Pressable>
            {planFilterOptions.map(plan=><Pressable key={plan.id} accessibilityRole="button" onPress={()=>choosePlanFilter(plan.id)} style={styles.planOption}><View style={styles.planOptionText}><Text style={styles.planOptionName}>{plan.name}</Text><Text style={styles.planOptionMeta}>{plan.plan_type==='special'?'Special day':'Membership'}{plan.active===false?' · Inactive':''}</Text></View>{planFilter===plan.id?<Text style={styles.planSelect}>Selected</Text>:null}</Pressable>)}
          </ScrollView>}
          <Pressable accessibilityRole="button" onPress={()=>setPlanFilterOpen(false)} style={[styles.cancelButton,styles.planCancel]}><Text style={styles.cancelText}>Close</Text></Pressable>
        </View>
      </Modal>
      <Modal visible={membershipEdit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setMembershipEdit(null)}>
        {membershipEdit ? <ScrollView contentContainerStyle={styles.addSheet} keyboardShouldPersistTaps="handled"><Text style={styles.eyebrow}>MEMBERSHIP MANAGEMENT</Text><Text accessibilityRole="header" style={styles.modalTitle}>Edit membership</Text><Text style={styles.modalDescription}>{membershipEdit.childName} · Date changes can restore an expired membership when its limits are valid.</Text>
          {membershipEdit.expired?<View style={styles.expiredNotice}><Text style={styles.expiredNoticeText}>This membership is currently expired. Update its dates or remaining visits to restore access.</Text></View>:null}
          <Text style={styles.fieldLabel}>Start date · YYYY-MM-DD</Text><TextInput accessibilityLabel="Membership start date" value={membershipEdit.start} onChangeText={value=>setMembershipEdit(current=>current?{...current,start:value}:current)} placeholder="2026-01-01" placeholderTextColor="#8B8373" style={styles.formInput}/>
          <Text style={styles.fieldLabel}>End date · YYYY-MM-DD</Text><TextInput accessibilityLabel="Membership end date" value={membershipEdit.end} onChangeText={value=>setMembershipEdit(current=>current?{...current,end:value}:current)} placeholder="2026-12-31" placeholderTextColor="#8B8373" style={styles.formInput}/>
          {membershipEdit.maxVisits!==null?<><Text style={styles.fieldLabel}>Visits remaining · current total allowance {membershipEdit.maxVisits}</Text><TextInput accessibilityLabel="Membership visits remaining" value={visitsRemaining} onChangeText={setVisitsRemaining} keyboardType="number-pad" placeholder="0" placeholderTextColor="#8B8373" style={styles.formInput}/><Text style={styles.modalDescription}>Increasing remaining visits raises the child’s total allowance when needed.</Text></>:null}
          <Text style={styles.modalDescription}>Membership ends when its end date passes or its visit allowance runs out.</Text>
          {error?<Text accessibilityRole="alert" style={styles.formError}>{error}</Text>:null}
          <View style={styles.formActions}><Pressable accessibilityRole="button" onPress={()=>setMembershipEdit(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable accessibilityRole="button" disabled={membershipSaving} onPress={()=>void saveMembership()} style={[styles.saveButton,membershipSaving&&styles.disabled]}>{membershipSaving?<ActivityIndicator color="#FFFFFF"/>:<Text style={styles.saveText}>Save membership</Text>}</Pressable></View>
        </ScrollView>:null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas }, scroll: { flexGrow: 1, width: '100%', maxWidth: 600, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30 },
  header: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 19 }, backButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 }, backText: { color: C.plum, fontSize: 13, fontWeight: '800' }, addButton: { minHeight: 39, borderRadius: 12, backgroundColor: C.plum, paddingHorizontal: 12, justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' }, eyebrow: { color: C.muted, fontSize: 9, letterSpacing: 1, fontWeight: '900' },
  title: { color: C.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.35 }, description: { color: C.muted, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 14 }, searchRow: { flexDirection: 'row', gap: 8 }, searchInput: { flex: 1, minWidth: 0, height: 46, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, backgroundColor: C.surface, color: C.ink, fontSize: 13 }, searchButton: { minWidth: 78, borderRadius: 12, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, searchButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.55 }, membershipFilters: { flexDirection:'row',gap:6,marginVertical:10 }, membershipFilter: { flex:1,minHeight:38,borderRadius:10,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center' }, membershipFilterOn: { borderColor:C.plum,backgroundColor:C.plumTint }, membershipFilterText: { color:C.muted,fontSize:9,fontWeight:'800' }, membershipFilterTextOn: { color:C.plumDark }, planFilterRow:{flexDirection:'row',gap:7,marginBottom:11}, planFilterButton:{flex:1,minHeight:40,borderRadius:11,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,paddingHorizontal:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, planFilterText:{color:C.plumDark,fontSize:10,fontWeight:'800'},planFilterCaret:{color:C.muted,fontSize:16},clearFilter:{minHeight:40,borderRadius:10,justifyContent:'center',paddingHorizontal:12,backgroundColor:C.plumTint},clearFilterText:{color:C.plumDark,fontSize:10,fontWeight:'800'}, expiredNotice:{borderRadius:10,borderWidth:1,borderColor:'#E7D3A6',backgroundColor:'#FBF3E3',padding:11,marginBottom:12},expiredNoticeText:{fontSize:10,color:'#8A6518',lineHeight:15}, filterToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 11 }, checkbox: { width: 19, height: 19, borderRadius: 6, borderWidth: 1, borderColor: '#C9BECF', backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, checkboxChecked: { borderColor: C.plum, backgroundColor: C.plum }, checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, filterText: { color: C.ink, fontSize: 11, fontWeight: '700' },
  landingShortcuts: { flexDirection: 'row', gap: 9, marginTop: 13, marginBottom: 24 },
  landingShortcut: { flex: 1, minWidth: 0, minHeight: 61, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 15, paddingHorizontal: 9 },
  landingShortcutGreen: { backgroundColor: '#EEF4E8', borderColor: '#C7D9B8' },
  landingShortcutPurple: { backgroundColor: '#F0EAF4', borderColor: '#D7C9E0' },
  landingShortcutIcon: { color: C.plum, fontSize: 16, fontWeight: '900' },
  landingShortcutText: { flex: 1, color: C.ink, fontSize: 9, lineHeight: 13, fontWeight: '800' },
  landingShortcutArrow: { color: C.plum, fontSize: 19, fontWeight: '700' },
  landingSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  landingSectionIcon: { color: C.plum, fontSize: 15, fontWeight: '900' },
  landingSectionTitle: { color: C.ink, fontSize: 14, fontWeight: '800' },
  landingLoading: { marginTop: 22 },
  landingEmpty: { borderRadius: 15, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 18 },
  landingEmptyText: { color: C.muted, fontSize: 11 },
  landingPlanCard: { minHeight: 82, justifyContent: 'space-between', borderWidth: 1, borderLeftWidth: 4, borderRadius: 15, padding: 12, marginBottom: 9 },
  landingPlanLavender: { backgroundColor: '#F1EBF5', borderColor: '#DACDE3', borderLeftColor: '#9B78AA' },
  landingPlanPeach: { backgroundColor: '#FAEEE5', borderColor: '#EAD3C2', borderLeftColor: '#D0936C' },
  landingPlanInactive: { opacity: 0.62 },
  landingPlanTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  landingPlanName: { flex: 1, color: C.ink, fontSize: 12, fontWeight: '800' },
  landingPlanBadge: { color: C.plum, fontSize: 7, fontWeight: '900', letterSpacing: 0.45 },
  landingPlanBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  landingPlanMeta: { flex: 1, color: C.muted, fontSize: 9 },
  landingPlanStatus: { color: C.mint, fontSize: 9, fontWeight: '800' },
  landingPlanInactiveText: { color: C.muted },
  pressed: { opacity: 0.82 },
  customerCard: { borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, overflow: 'hidden', marginBottom: 9 }, customerSummary: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11 }, customerInitial: { width: 39, height: 39, borderRadius: 14, backgroundColor: C.plumTint, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, initialText: { color: C.plumDark, fontSize: 15, fontWeight: '900' }, customerText: { flex: 1, minWidth: 0 }, customerName: { color: C.ink, fontSize: 12, fontWeight: '800' }, customerMeta: { color: C.muted, fontSize: 10, marginTop: 4 }, badgeColumn: { gap: 4, alignItems: 'flex-end', marginLeft: 6 }, onsiteBadge: { color: C.mint, backgroundColor: '#EAF2E4', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 7, fontWeight: '900' }, memberBadge: { color: C.plum, backgroundColor: C.plumTint, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontSize: 7, fontWeight: '900' },
  childrenList: { borderTopWidth: 1, borderTopColor: C.line, padding: 10, gap: 8, backgroundColor: '#FCFBFA' }, parentExtra: { color: C.muted, fontSize: 9, paddingHorizontal: 4, paddingBottom: 2 }, contactCard:{borderWidth:1,borderColor:C.line,borderRadius:12,backgroundColor:C.surface,padding:11},contactHeading:{color:C.ink,fontSize:10,fontWeight:'900'},contactLine:{color:C.muted,fontSize:9,marginTop:5},contactConsent:{color:C.plumDark,fontSize:9,fontWeight:'700',marginTop:6},contactHint:{color:C.muted,fontSize:8,lineHeight:12,marginTop:5},contactActions:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:9},contactButton:{minHeight:34,borderRadius:9,borderWidth:1,borderColor:C.line,justifyContent:'center',paddingHorizontal:10},contactButtonText:{color:C.plumDark,fontSize:8,fontWeight:'800'},whatsappButton:{minHeight:34,borderRadius:9,backgroundColor:'#EAF2E4',justifyContent:'center',paddingHorizontal:10},whatsappButtonText:{color:C.mint,fontSize:8,fontWeight:'900'}, deleteFamily: { minHeight: 36, alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, borderColor: '#E8C9C6', paddingHorizontal: 10, justifyContent: 'center' }, deleteFamilyText: { color: C.coral, fontSize: 8, fontWeight: '900' }, childCard: { borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface, overflow: 'hidden' }, childHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 9 }, childTitleBlock: { flex: 1, minWidth: 0, paddingRight: 6 }, childName: { color: C.ink, fontSize: 11, fontWeight: '800' }, childSub: { color: C.muted, fontSize: 9, marginTop: 4 }, detailsLink: { color: C.plum, fontSize: 9, fontWeight: '800' }, childDetails: { borderTopWidth: 1, borderTopColor: C.line, padding: 10, gap: 4 }, childDetailLine: { color: C.muted, fontSize: 9, lineHeight: 14 }, medicalLine: { color: C.coral, fontSize: 9, lineHeight: 14 }, childActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 9, paddingBottom: 9 }, smallAction: { minHeight: 35, borderRadius: 9, paddingHorizontal: 9, justifyContent: 'center', backgroundColor: C.plumTint }, smallActionText: { color: C.plumDark, fontSize: 8, fontWeight: '800' }, checkInAction: { minHeight: 35, borderRadius: 9, paddingHorizontal: 11, justifyContent: 'center', backgroundColor: '#EAF2E4' }, checkInText: { color: C.mint, fontSize: 8, fontWeight: '900' }, checkOutAction: { minHeight: 35, borderRadius: 9, paddingHorizontal: 11, justifyContent: 'center', backgroundColor: '#FBE8E2' }, checkOutText: { color: C.coral, fontSize: 8, fontWeight: '900' }, historyBox: { borderTopWidth: 1, borderTopColor: C.line, padding: 9, gap: 6, backgroundColor: '#FAF8F7' }, historyRow: { borderRadius: 9, padding: 8, backgroundColor: C.surface }, historyTitle: { color: C.ink, fontSize: 9, fontWeight: '800' }, historyText: { color: C.muted, fontSize: 8, marginTop: 3 },
  errorBox: { backgroundColor: '#FBE8E2', borderColor: '#EDC5B9', borderWidth: 1, borderRadius: 13, padding: 11, marginBottom: 10 }, errorTitle: { color: C.coral, fontSize: 10, fontWeight: '900' }, errorText: { color: '#9F625D', fontSize: 9, lineHeight: 14, marginTop: 3 }, emptyCard: { padding: 24, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' }, emptyTitle: { color: C.ink, fontSize: 13, fontWeight: '800' }, emptyText: { color: C.muted, fontSize: 10, marginTop: 5 }, moreButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.plumTint, marginTop: 4 }, moreText: { color: C.plumDark, fontSize: 11, fontWeight: '800' }, modalScrim: { flex: 1, backgroundColor: '#00000070', justifyContent: 'center', padding: 20 }, modalCard: { borderRadius: 20, padding: 18, backgroundColor: C.surface }, modalTitle: { color: C.ink, fontSize: 18, fontWeight: '900' }, modalDescription: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 15 }, durationOptions: { gap: 8 }, durationButton: { minHeight: 48, borderRadius: 12, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center' }, durationButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, cancelButton: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, cancelText: { color: C.muted, fontSize: 11, fontWeight: '800' }, addSheet: { flex: 1, backgroundColor: C.canvas, padding: 20, paddingTop: 28 }, fieldLabel: { color: C.ink, fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 5 }, formInput: { minHeight: 47, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 11, color: C.ink, fontSize: 12 }, multilineInput: { minHeight: 72, paddingTop: 10, textAlignVertical: 'top' }, formError: { color: C.coral, fontSize: 10, lineHeight: 15, marginTop: 10 }, formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 }, saveButton: { minHeight: 44, minWidth: 120, borderRadius: 11, backgroundColor: C.plum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, saveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, modalLoading: { marginTop: 24, marginBottom: 24 }, planList: { flexGrow: 0, maxHeight: '68%' }, planOption: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 11, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, marginBottom: 7 }, planOptionText: { flex: 1, minWidth: 0 }, planOptionName: { color: C.ink, fontSize: 11, fontWeight: '900' }, planOptionMeta: { color: C.muted, fontSize: 9, marginTop: 4 }, planSelect: { color: C.plum, fontSize: 9, fontWeight: '900', marginLeft: 8 }, planCancel: { marginTop: 12 },
});
