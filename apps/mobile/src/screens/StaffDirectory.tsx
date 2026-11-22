import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

type Child = { id: string; name: string; age: number; subscription_active: boolean; subscription_expires_on: string | null; plan_name: string | null; currently_checked_in: boolean };
type Family = { customer_id: string; parent_name: string; phone: string; children: Child[] | null; any_active_subscription: boolean; currently_checked_in: boolean };

export default function StaffDirectory({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Family[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const search = async () => {
    const value = query.trim();
    if (value.length < 2) { setError('Enter at least two characters.'); return; }
    const current = ++requestId.current;
    setBusy(true); setError('');
    const { data, error: searchError } = await supabase.rpc('directory_browse_customers_with_plans', {
      p_query: value, p_limit: 25, p_offset: 0,
    });
    if (current !== requestId.current) return;
    if (searchError) { setRows([]); setError(searchError.message); }
    else setRows((data ?? []) as Family[]);
    setBusy(false);
  };

  return <View style={styles.root}>
    <View style={styles.header}><Pressable onPress={onBack}><Text style={styles.back}>‹  Home</Text></Pressable><Text style={styles.headerTitle}>Customer directory</Text><View style={{ width: 44 }} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>CUSTOMERS</Text><Text style={styles.title}>Customers</Text><Text style={styles.subtitle}>Search by guardian, child, or phone. Contact and membership details are read-only here.</Text>
      <View style={styles.searchRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" autoCapitalize="words" placeholder="Name or phone number" placeholderTextColor={C.muted} style={styles.input}/><Pressable onPress={() => void search()} style={styles.button}><Text style={styles.buttonText}>Search</Text></Pressable></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={C.plum} style={{ margin: 24 }}/> : rows.map((family) => <View key={family.customer_id} style={styles.card}>
        <View style={styles.familyTop}><View style={{ flex: 1 }}><Text style={styles.familyName}>{family.parent_name}</Text><Text style={styles.phone}>{family.phone}</Text></View><Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(`tel:${family.phone.replace(/\D/g,'')}`).catch(()=>setError('Unable to open the phone app.'))} style={styles.call}><Text style={styles.callText}>Call</Text></Pressable>{family.currently_checked_in ? <Text style={styles.pill}>ON SITE</Text> : null}</View>
        {(family.children ?? []).map((child) => <View key={child.id} style={styles.child}><View style={{ flex: 1 }}><Text style={styles.childName}>{child.name}{child.age ? ` · ${child.age} yrs` : ''}</Text><Text style={styles.detail}>{child.plan_name ?? (child.subscription_active ? 'Active membership' : 'No active membership')}{child.subscription_expires_on ? ` · Until ${child.subscription_expires_on}` : ''}</Text></View>{child.currently_checked_in ? <Text style={styles.here}>HERE</Text> : null}</View>)}
      </View>)}
      {!busy && rows.length === 0 && !error && query.length >= 2 ? <Text style={styles.empty}>No matching families.</Text> : null}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ root:{flex:1,backgroundColor:C.canvas},header:{minHeight:62,paddingHorizontal:18,paddingTop:8,backgroundColor:C.surface,borderBottomWidth:1,borderColor:C.line,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},back:{color:C.plum,fontSize:12,fontWeight:'800'},headerTitle:{color:C.ink,fontSize:15,fontWeight:'900'},content:{width:'100%',maxWidth:580,alignSelf:'center',padding:18,paddingBottom:40},eyebrow:{color:C.plum,fontSize:9,fontWeight:'900',letterSpacing:1.1},title:{color:C.ink,fontSize:19,fontWeight:'800',marginTop:5},subtitle:{color:C.muted,fontSize:11,lineHeight:17,marginTop:5,marginBottom:14},searchRow:{flexDirection:'row',gap:8},input:{flex:1,minWidth:0,minHeight:46,borderWidth:1,borderColor:C.line,borderRadius:12,backgroundColor:C.surface,paddingHorizontal:12,color:C.ink,fontSize:12},button:{minWidth:75,borderRadius:12,backgroundColor:C.plum,alignItems:'center',justifyContent:'center'},buttonText:{color:'#FFF',fontSize:11,fontWeight:'900'},error:{color:C.coral,fontSize:11,marginTop:12},card:{marginTop:10,padding:13,borderRadius:15,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},familyTop:{flexDirection:'row',alignItems:'center',gap:8},familyName:{color:C.ink,fontSize:13,fontWeight:'900'},phone:{color:C.muted,fontSize:10,marginTop:4},call:{minHeight:32,justifyContent:'center',paddingHorizontal:11,borderRadius:9,backgroundColor:C.plumTint},callText:{color:C.plum,fontSize:9,fontWeight:'900'},pill:{color:C.mint,backgroundColor:'#EAF2E4',borderRadius:7,paddingHorizontal:7,paddingVertical:5,fontSize:8,fontWeight:'900'},child:{flexDirection:'row',alignItems:'center',gap:8,borderTopWidth:1,borderColor:C.line,marginTop:10,paddingTop:9},childName:{color:C.ink,fontSize:11,fontWeight:'800'},detail:{color:C.muted,fontSize:9,marginTop:3},here:{color:C.mint,fontSize:8,fontWeight:'900'},empty:{color:C.muted,fontSize:11,textAlign:'center',padding:24}});
