import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { Message, MessageType, SessionMember, Character } from '../lib/types';
import { useAuth } from './useAuth';

const PAGE_SIZE = 40;

export interface SessionChatState {
  messages: Message[];
  membership: SessionMember | null;
  isDm: boolean;
  pendingMembers: SessionMember[];
  acceptedMembers: SessionMember[];
  myCharacters: Character[];
  activeCharacter: Character | null;
  dmNpcs: Character[];
  loading: boolean;
  inviteUsername: string;
  sendingInvite: boolean;
}

export interface SessionChatActions {
  sendMessage: (content: string, type: MessageType, metadata?: Record<string, unknown>) => Promise<void>;
  updateMemberStatus: (targetUserId: string, status: 'accepted' | 'rejected') => Promise<void>;
  acceptInvitation: () => Promise<void>;
  invitePlayer: () => Promise<void>;
  pickActiveCharacter: (characterId: string | null) => Promise<void>;
  addDmNpc: (characterId: string) => Promise<void>;
  removeDmNpc: (characterId: string) => Promise<void>;
  openDirectedRollFor: (member: SessionMember) => Promise<void>;
  setInviteUsername: (v: string) => void;
  refreshSession: () => void;
}

export function useSessionChat(
  sessionId: string,
  onDirectedRoll: (character: Character, member: SessionMember) => void,
): SessionChatState & SessionChatActions {
  const { user, profile } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [membership, setMembership] = useState<SessionMember | null>(null);
  const [isDm, setIsDm] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<SessionMember[]>([]);
  const [acceptedMembers, setAcceptedMembers] = useState<SessionMember[]>([]);
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [dmNpcs, setDmNpcs] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles:profiles!messages_user_id_fkey(username, avatar_color)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (!error && data) setMessages(data.reverse());
    setLoading(false);
  }, [sessionId]);

  const fetchMembership = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('session_members')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle();
    setMembership(data ?? null);
  }, [sessionId, user]);

  const fetchSessionState = useCallback(async () => {
    if (!user) return;
    const { data: session } = await supabase
      .from('sessions')
      .select('dm_id')
      .eq('id', sessionId)
      .single();

    const dmId = session?.dm_id;
    setIsDm(dmId === user.id);

    // Todos los usuarios necesitan la lista de miembros aceptados (para el selector de whispers).
    const { data: accepted } = await supabase
      .from('session_members')
      .select(`*, profiles:profiles!session_members_user_id_fkey(username, avatar_color), active_character:characters(id, name, system_id)`)
      .eq('session_id', sessionId)
      .eq('status', 'accepted')
      .neq('user_id', user.id);
    setAcceptedMembers(accepted ?? []);

    if (dmId === user.id) {
      const { data: pending } = await supabase
        .from('session_members')
        .select('*, profiles:profiles!session_members_user_id_fkey(username, avatar_color)')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'invited']);
      setPendingMembers(pending ?? []);
    } else {
      setPendingMembers([]);
    }
  }, [sessionId, user]);

  const fetchMyCharacters = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    setMyCharacters(data ?? []);
  }, [user]);

  const fetchDmNpcs = useCallback(async () => {
    if (!user) return;
    const { data: scData } = await supabase
      .from('session_characters')
      .select('character_id')
      .eq('session_id', sessionId)
      .eq('owner_id', user.id);
    const ids = (scData ?? []).map((r: { character_id: string }) => r.character_id);
    if (ids.length === 0) { setDmNpcs([]); return; }
    const { data: chars } = await supabase
      .from('characters')
      .select('*')
      .in('id', ids);
    setDmNpcs(chars ?? []);
  }, [sessionId, user]);

  // ── Active character by membership ──────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!membership?.active_character_id) { setActiveCharacter(null); return; }
      const { data } = await supabase
        .from('characters')
        .select('*')
        .eq('id', membership.active_character_id)
        .maybeSingle();
      if (!cancelled) setActiveCharacter(data ?? null);
    }
    load();
    return () => { cancelled = true; };
  }, [membership?.active_character_id]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchMessages();
    fetchMembership();
    fetchSessionState();
    fetchMyCharacters();
    fetchDmNpcs();
  }, [fetchMessages, fetchMembership, fetchSessionState, fetchMyCharacters, fetchDmNpcs]);

  // ── Realtime ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles:profiles!messages_user_id_fkey(username, avatar_color)')
            .eq('id', payload.new.id)
            .single();
          if (data) {
            setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data]);
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_members', filter: `session_id=eq.${sessionId}` },
        () => { fetchMembership(); fetchSessionState(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMembership, fetchSessionState, sessionId]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function sendMessage(content: string, type: MessageType, metadata?: Record<string, unknown>) {
    if (!user) return;
    const { error } = await supabase.rpc('send_session_message', {
      p_session_id: sessionId,
      p_content: content,
      p_type: type,
      p_metadata: metadata ?? null,
    });
    if (error) console.error('Send message error:', error.message);
  }

  async function updateMemberStatus(targetUserId: string, status: 'accepted' | 'rejected') {
    const { error } = await supabase.rpc('set_session_member_status', {
      p_session_id: sessionId,
      p_user_id: targetUserId,
      p_status: status,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    fetchSessionState();
    fetchMembership();
  }

  async function acceptInvitation() {
    const { error } = await supabase.rpc('accept_session_invitation', { p_session_id: sessionId });
    if (error) { Alert.alert('Error', error.message); return; }
    fetchMembership();
  }

  async function invitePlayer() {
    const username = inviteUsername.trim();
    if (!username) return;
    setSendingInvite(true);

    const { data: target, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (profileError || !target) {
      setSendingInvite(false);
      Alert.alert('Error', 'No existe un usuario con ese nombre.');
      return;
    }

    const { error } = await supabase.rpc('invite_player_to_session', {
      p_session_id: sessionId,
      p_user_id: target.id,
    });
    setSendingInvite(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setInviteUsername('');
    fetchSessionState();
  }

  async function pickActiveCharacter(characterId: string | null) {
    if (characterId) {
      const { error } = await supabase.rpc('activate_character_in_session', {
        p_session_id: sessionId,
        p_character_id: characterId,
      });
      if (error) { Alert.alert('Error', error.message); return; }
    } else {
      const { error } = await supabase.rpc('set_active_character', {
        p_session_id: sessionId,
        p_character_id: null,
      });
      if (error) { Alert.alert('Error', error.message); return; }
    }
    fetchMembership();
  }

  async function addDmNpc(characterId: string) {
    const { error } = await supabase.rpc('add_npc_to_session', {
      p_session_id: sessionId,
      p_character_id: characterId,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    fetchDmNpcs();
  }

  async function removeDmNpc(characterId: string) {
    if (!user) return;
    const { error } = await supabase
      .from('session_characters')
      .delete()
      .eq('session_id', sessionId)
      .eq('character_id', characterId)
      .eq('owner_id', user.id);
    if (error) { Alert.alert('Error', error.message); return; }
    fetchDmNpcs();
  }

  async function openDirectedRollFor(member: SessionMember) {
    if (!member.active_character_id) {
      Alert.alert('Sin personaje', `${member.profiles?.username ?? 'Ese jugador'} no ha elegido personaje en esta partida.`);
      return;
    }
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', member.active_character_id)
      .maybeSingle();
    if (error || !data) { Alert.alert('Error', 'No se pudo cargar la hoja.'); return; }
    onDirectedRoll(data, member);
  }

  function refreshSession() {
    fetchSessionState();
    fetchMembership();
  }

  return {
    // state
    messages, membership, isDm, pendingMembers, acceptedMembers,
    myCharacters, activeCharacter, dmNpcs, loading, inviteUsername, sendingInvite,
    // actions
    sendMessage, updateMemberStatus, acceptInvitation, invitePlayer,
    pickActiveCharacter, addDmNpc, removeDmNpc, openDirectedRollFor, setInviteUsername, refreshSession,
  };
}
