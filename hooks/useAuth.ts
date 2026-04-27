import { useState, useEffect } from 'react';
import * as Linking from 'expo-linking';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../lib/types';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  }

  async function signUp(email: string, password: string, username: string) {
    // Verificar que el nombre de usuario no está ya en uso.
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle();

    if (existing) {
      throw new Error('Ese nombre de aventurero ya está en uso. Elige otro.');
    }

    const avatarColor = randomColor();
    const emailRedirectTo = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          username: username.trim(),
          avatar_color: avatarColor,
        },
      },
    });
    if (error) throw error;
    return data;
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return { session, user, profile, loading, signUp, signIn, signOut };
}

function randomColor(): string {
  const colors = ['#7c3aed', '#dc2626', '#059669', '#d97706', '#2563eb', '#db2777', '#0891b2'];
  return colors[Math.floor(Math.random() * colors.length)];
}
