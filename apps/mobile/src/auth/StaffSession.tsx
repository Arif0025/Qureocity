import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { User } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

export type StaffProfile = {
  id: string;
  name: string;
  role: 'staff' | 'admin';
};

type SessionStatus = 'loading' | 'signed-out' | 'signed-in';

type StaffSessionValue = {
  status: SessionStatus;
  profile: StaffProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const StaffSessionContext = createContext<StaffSessionValue | null>(null);
const STAFF_PROFILE_CACHE_KEY = 'qureocity.staff-profile-cache';

async function getStaffProfile(user: User): Promise<StaffProfile> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw new Error('We could not verify your staff account. Please try again.');
  if (!data || (data.role !== 'staff' && data.role !== 'admin')) {
    throw new Error('This account is not registered as a QureoCity staff member.');
  }

  return { id: data.id, name: data.name, role: data.role };
}

async function saveStaffProfile(profile: StaffProfile) {
  await SecureStore.setItemAsync(STAFF_PROFILE_CACHE_KEY, JSON.stringify(profile)).catch(() => undefined);
}

async function readStaffProfile(userId: string): Promise<StaffProfile | null> {
  const serialized = await SecureStore.getItemAsync(STAFF_PROFILE_CACHE_KEY).catch(() => null);
  if (!serialized) return null;
  try {
    const cached = JSON.parse(serialized) as Partial<StaffProfile>;
    if (cached.id !== userId || typeof cached.name !== 'string' || (cached.role !== 'staff' && cached.role !== 'admin')) return null;
    return { id: cached.id, name: cached.name, role: cached.role };
  } catch {
    return null;
  }
}

export function StaffSessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const operation = useRef(0);

  const restoreProfile = useCallback(async (user: User) => {
    const currentOperation = ++operation.current;
    try {
      const nextProfile = await getStaffProfile(user);
      if (operation.current !== currentOperation) return;
      await saveStaffProfile(nextProfile);
      setProfile(nextProfile);
      setStatus('signed-in');
    } catch {
      if (operation.current !== currentOperation) return;
      setProfile(null);
      setStatus('signed-out');
      await supabase.auth.signOut();
    }
  }, []);

  const restoreCachedProfile = useCallback(async (user: User) => {
    const currentOperation = ++operation.current;
    const cachedProfile = await readStaffProfile(user.id);
    if (operation.current !== currentOperation) return;
    if (cachedProfile) {
      setProfile(cachedProfile);
      setStatus('signed-in');
      return;
    }
    await restoreProfile(user);
  }, [restoreProfile]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        operation.current += 1;
        setProfile(null);
        setStatus('signed-out');
        void SecureStore.deleteItemAsync(STAFF_PROFILE_CACHE_KEY).catch(() => undefined);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        // Restore the encrypted Supabase session and cached employee profile locally.
        // Query the employee row only if this install has no matching saved profile.
        queueMicrotask(() => void restoreCachedProfile(session.user));
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [restoreCachedProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw new Error('Email or password is incorrect. Please try again.');
    }

    try {
      const nextProfile = await getStaffProfile(data.user);
      operation.current += 1;
      await saveStaffProfile(nextProfile);
      setProfile(nextProfile);
      setStatus('signed-in');
    } catch (cause) {
      await supabase.auth.signOut();
      throw cause;
    }
  }, []);

  const signOut = useCallback(async () => {
    const pushToken = await SecureStore.getItemAsync('qureocity.mobile-push-token').catch(() => null);
    if (pushToken) {
      const { error: pushRemoveError } = await supabase.rpc('mobile_push_unregister_device', { p_token: pushToken });
      if (!pushRemoveError) await SecureStore.deleteItemAsync('qureocity.mobile-push-token').catch(() => undefined);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error('Unable to sign out. Please try again.');
    await SecureStore.deleteItemAsync(STAFF_PROFILE_CACHE_KEY).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ status, profile, signIn, signOut }),
    [status, profile, signIn, signOut],
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

export function useStaffSession(): StaffSessionValue {
  const context = useContext(StaffSessionContext);
  if (!context) throw new Error('useStaffSession must be used within StaffSessionProvider.');
  return context;
}
