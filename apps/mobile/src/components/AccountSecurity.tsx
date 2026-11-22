import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors as C } from '../theme/tokens';

export default function AccountSecurity() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const update = async () => {
    setError('');
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirmation) { setError('The passwords do not match.'); return; }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setPassword(''); setConfirmation(''); setOpen(false);
    Alert.alert('Password updated', 'Your sign-in password has been changed.');
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Account security</Text>
    <Text style={styles.copy}>Change your staff sign-in password.</Text>
    {!open ? <Pressable onPress={() => setOpen(true)} style={styles.button}><Text style={styles.buttonText}>Change password</Text></Pressable> : <>
      <TextInput accessibilityLabel="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="New password · 8 characters minimum" placeholderTextColor={C.muted} style={styles.input}/>
      <TextInput accessibilityLabel="Confirm new password" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" placeholder="Confirm new password" placeholderTextColor={C.muted} style={styles.input}/>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}><Pressable disabled={saving} onPress={() => { setOpen(false); setError(''); setPassword(''); setConfirmation(''); }} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => void update()} style={styles.button}>{saving ? <ActivityIndicator color="#FFF"/> : <Text style={styles.buttonText}>Save password</Text>}</Pressable></View>
    </>}
  </View>;
}

const styles=StyleSheet.create({card:{marginTop:12,padding:14,borderRadius:15,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},title:{color:C.ink,fontSize:13,fontWeight:'900'},copy:{color:C.muted,fontSize:10,marginTop:4},input:{minHeight:44,marginTop:9,paddingHorizontal:11,borderWidth:1,borderColor:C.line,borderRadius:10,backgroundColor:'#FFFDEF',color:C.ink,fontSize:11},actions:{flexDirection:'row',justifyContent:'flex-end',gap:8,marginTop:10},button:{minHeight:39,minWidth:120,marginTop:10,borderRadius:10,backgroundColor:C.plum,alignItems:'center',justifyContent:'center',paddingHorizontal:12},buttonText:{color:'#FFF',fontSize:10,fontWeight:'900'},cancel:{minHeight:39,justifyContent:'center',paddingHorizontal:12},cancelText:{color:C.muted,fontSize:10,fontWeight:'800'},error:{color:C.coral,fontSize:10,marginTop:7}});
