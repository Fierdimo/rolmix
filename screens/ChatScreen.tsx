import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  StatusBar,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Message, MessageType, SessionMember, Character, DiceMetadata } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import { getSystem, resolveAction, computeFinalActions } from '../lib/systems';
import { RollableAction } from '../lib/systems/types';
import { RootStackParamList } from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

const PAGE_SIZE = 40;

export default function ChatScreen({ navigation, route }: Props) {
  const { sessionId, sessionName } = route.params;
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [membership, setMembership] = useState<SessionMember | null>(null);
  const [isDm, setIsDm] = useState(false);
  const [pendingMembers, setPendingMembers] = useState<SessionMember[]>([]);
  const [acceptedMembers, setAcceptedMembers] = useState<SessionMember[]>([]);
  const [inviteUsername, setInviteUsername] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Personajes ───────────────────────────────────────────
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [activeCharacter, setActiveCharacter] = useState<Character | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [rollPanelVisible, setRollPanelVisible] = useState(false);
  const [directedFor, setDirectedFor] = useState<SessionMember | null>(null);
  const [directedCharacter, setDirectedCharacter] = useState<Character | null>(null);

  const listRef = useRef<FlatList>(null);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*, profiles:profiles!messages_user_id_fkey(username, avatar_color)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (!error && data) {
      setMessages(data.reverse());
    }
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

    setIsDm(session?.dm_id === user.id);

    if (session?.dm_id === user.id) {
      const { data } = await supabase
        .from('session_members')
        .select('*, profiles:profiles!session_members_user_id_fkey(username, avatar_color)')
        .eq('session_id', sessionId)
        .in('status', ['pending', 'invited']);
      setPendingMembers(data ?? []);

      const { data: accepted } = await supabase
        .from('session_members')
        .select('*, profiles:profiles!session_members_user_id_fkey(username, avatar_color)')
        .eq('session_id', sessionId)
        .eq('status', 'accepted')
        .neq('user_id', user.id);
      setAcceptedMembers(accepted ?? []);
    } else {
      setPendingMembers([]);
      setAcceptedMembers([]);
    }
  }, [sessionId, user]);

  // Cargar mis personajes (para que el jugador elija activo)
  const fetchMyCharacters = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('characters').select('*').eq('owner_id', user.id)
      .order('updated_at', { ascending: false });
    setMyCharacters(data ?? []);
  }, [user]);

  // Cargar personaje activo según membership.active_character_id
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!membership?.active_character_id) { setActiveCharacter(null); return; }
      const { data } = await supabase
        .from('characters').select('*').eq('id', membership.active_character_id).maybeSingle();
      if (!cancelled) setActiveCharacter(data ?? null);
    }
    load();
    return () => { cancelled = true; };
  }, [membership?.active_character_id]);

  useEffect(() => {
    fetchMessages();
    fetchMembership();
    fetchSessionState();
    fetchMyCharacters();
  }, [fetchMessages, fetchMembership, fetchSessionState, fetchMyCharacters]);

  useEffect(() => {
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, profiles:profiles!messages_user_id_fkey(username, avatar_color)')
            .eq('id', payload.new.id)
            .single();

          if (data) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data];
            });
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_members',
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          fetchMembership();
          fetchSessionState();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMembership, fetchSessionState, sessionId]);

  async function sendMessage(
    content: string,
    type: MessageType,
    metadata?: Record<string, unknown>
  ) {
    if (!user) return;
    const { error } = await supabase.rpc('send_session_message', {
      p_session_id: sessionId,
      p_content: content,
      p_type: type,
      p_metadata: metadata ?? null,
    });
    if (error) {
      console.error('Send message error:', error.message);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    return <MessageBubble message={item} isOwn={item.user_id === user?.id} />;
  }

  async function updateMemberStatus(targetUserId: string, status: 'accepted' | 'rejected') {
    const { error } = await supabase.rpc('set_session_member_status', {
      p_session_id: sessionId,
      p_user_id: targetUserId,
      p_status: status,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    fetchSessionState();
    fetchMembership();
  }

  async function acceptInvitation() {
    const { error } = await supabase.rpc('accept_session_invitation', {
      p_session_id: sessionId,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
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
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    setInviteUsername('');
    fetchSessionState();
  }

  // ── Personajes ───────────────────────────────────────────
  async function pickActiveCharacter(characterId: string | null) {
    setPickerVisible(false);
    const { error } = await supabase.rpc('set_active_character', {
      p_session_id: sessionId,
      p_character_id: characterId,
    });
    if (error) { Alert.alert('Error', error.message); return; }
    fetchMembership();
  }

  /**
   * Lanza una acción y publica el resultado como mensaje 'dice'.
   * Si `directed` viene en true, indica que lo lanzó el DM en nombre del jugador.
   */
  async function rollAction(character: Character, action: RollableAction, directed: boolean) {
    const r = resolveAction(action);
    const meta: DiceMetadata = {
      die: r.die,
      result: r.result,
      modifier: r.modifier,
      total: r.total,
      character_name: character.name,
      action_label: action.label,
      directed,
    };
    const text = directed
      ? `Tirada dirigida: ${character.name} → ${action.label}`
      : `${character.name} tira ${action.label}`;
    await sendMessage(text, 'dice', meta as unknown as Record<string, unknown>);
  }

  // Carga la hoja del personaje del jugador objetivo (para que el DM la use)
  async function openDirectedRollFor(member: SessionMember) {
    if (!member.active_character_id) {
      Alert.alert('Sin personaje', `${member.profiles?.username ?? 'Ese jugador'} no ha elegido personaje en esta partida.`);
      return;
    }
    const { data, error } = await supabase
      .from('characters').select('*').eq('id', member.active_character_id).maybeSingle();
    if (error || !data) { Alert.alert('Error', 'No se pudo cargar la hoja.'); return; }
    setDirectedFor(member);
    setDirectedCharacter(data);
  }

  const hasAcceptedAccess = membership?.status === 'accepted';
  const inputDisabled = !profile || !hasAcceptedAccess;
  const bannerText = membership == null
    ? 'Todavía no formas parte de esta partida. Usa "Unirse" desde el listado.'
    : membership.status === 'pending'
      ? 'Tu solicitud está pendiente de aprobación por el DM.'
      : membership.status === 'invited'
        ? 'Tienes invitación pendiente. Falta aceptación del DM.'
        : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0c29" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{sessionName}</Text>
          <View style={styles.onlineDot} />
        </View>
        <View style={{ width: 36 }} />
      </View>

      {hasAcceptedAccess && !isDm ? (
        <View style={styles.charBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.charBarLabel}>Personaje activo</Text>
            <Text style={styles.charBarName} numberOfLines={1}>
              {activeCharacter ? `${activeCharacter.name} · ${getSystem(activeCharacter.system_id)?.name ?? ''}` : 'Sin personaje'}
            </Text>
          </View>
          <TouchableOpacity style={styles.charBarBtn} onPress={() => setPickerVisible(true)}>
            <Text style={styles.charBarBtnText}>{activeCharacter ? 'Cambiar' : 'Elegir'}</Text>
          </TouchableOpacity>
          {activeCharacter ? (
            <TouchableOpacity style={[styles.charBarBtn, { backgroundColor: '#7c3aed' }]} onPress={() => setRollPanelVisible(true)}>
              <Text style={[styles.charBarBtnText, { color: '#fff' }]}>Tirar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <ActivityIndicator color="#7c3aed" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <Text style={styles.emptyChat}>
                No hay mensajes aún.{'\n'}¡Rompe el hielo!
              </Text>
            }
          />
        )}

        {isDm ? (
          <View style={styles.dmPanel}>
            <Text style={styles.dmTitle}>Panel del DM</Text>
            <View style={styles.inviteRow}>
              <TextInput
                style={styles.inviteInput}
                placeholder="Invitar por nombre de usuario"
                placeholderTextColor="#64748b"
                value={inviteUsername}
                onChangeText={setInviteUsername}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.inviteButton} onPress={invitePlayer} disabled={sendingInvite}>
                <Text style={styles.inviteButtonText}>{sendingInvite ? '...' : 'Invitar'}</Text>
              </TouchableOpacity>
            </View>

            {pendingMembers.length > 0 ? (
              pendingMembers.map((member) => (
                <View key={member.id} style={styles.memberRow}>
                  <View>
                    <Text style={styles.memberName}>{member.profiles?.username ?? 'Usuario'}</Text>
                    <Text style={styles.memberMeta}>{member.status === 'pending' ? 'Solicitud pendiente' : 'Invitación enviada'}</Text>
                  </View>
                  <View style={styles.memberActions}>
                    <TouchableOpacity style={styles.acceptButton} onPress={() => updateMemberStatus(member.user_id, 'accepted')}>
                      <Text style={styles.acceptButtonText}>Aceptar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectButton} onPress={() => updateMemberStatus(member.user_id, 'rejected')}>
                      <Text style={styles.rejectButtonText}>Rechazar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.dmEmpty}>Sin solicitudes pendientes.</Text>
            )}

            {acceptedMembers.length > 0 ? (
              <>
                <Text style={[styles.dmTitle, { marginTop: 12 }]}>Tirada dirigida</Text>
                <Text style={styles.dmEmpty}>Selecciona un jugador para tirar usando su personaje activo.</Text>
                <View style={styles.directedRow}>
                  {acceptedMembers.map((m) => (
                    <TouchableOpacity key={m.id} style={styles.directedChip} onPress={() => openDirectedRollFor(m)}>
                      <Text style={styles.directedChipText}>{m.profiles?.username ?? '???'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {bannerText ? (
          <View style={styles.noticeWrap}>
            <Text style={styles.notice}>{bannerText}</Text>
            {membership?.status === 'invited' ? (
              <TouchableOpacity style={styles.noticeButton} onPress={acceptInvitation}>
                <Text style={styles.noticeButtonText}>Aceptar invitación</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <MessageInput onSend={sendMessage} disabled={inputDisabled} />
      </KeyboardAvoidingView>

      {/* Modal: elegir personaje activo */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Personaje activo</Text>
            {myCharacters.length === 0 ? (
              <Text style={styles.dmEmpty}>No tienes personajes. Crea uno desde "Mis personajes".</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {myCharacters.map((c) => (
                  <TouchableOpacity key={c.id} style={styles.charPickRow} onPress={() => pickActiveCharacter(c.id)}>
                    <Text style={styles.charPickName}>{c.name}</Text>
                    <Text style={styles.charPickSys}>{getSystem(c.system_id)?.name ?? c.system_id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {activeCharacter ? (
              <TouchableOpacity style={[styles.modalAction, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={() => pickActiveCharacter(null)}>
                <Text style={{ color: '#fca5a5', fontWeight: '700' }}>Quitar personaje</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.modalAction} onPress={() => setPickerVisible(false)}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: panel de tirada del jugador */}
      <Modal visible={rollPanelVisible} transparent animationType="slide" onRequestClose={() => setRollPanelVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{activeCharacter?.name ?? ''} — Tiradas</Text>
            <RollList
              character={activeCharacter}
              onPick={(action) => {
                if (!activeCharacter) return;
                setRollPanelVisible(false);
                rollAction(activeCharacter, action, false);
              }}
            />
            <TouchableOpacity style={styles.modalAction} onPress={() => setRollPanelVisible(false)}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: tirada dirigida del DM */}
      <Modal
        visible={!!directedCharacter}
        transparent
        animationType="slide"
        onRequestClose={() => { setDirectedCharacter(null); setDirectedFor(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Tirar por {directedFor?.profiles?.username ?? 'jugador'} ({directedCharacter?.name})
            </Text>
            <RollList
              character={directedCharacter}
              onPick={(action) => {
                if (!directedCharacter) return;
                const c = directedCharacter;
                setDirectedCharacter(null);
                setDirectedFor(null);
                rollAction(c, action, true);
              }}
            />
            <TouchableOpacity style={styles.modalAction} onPress={() => { setDirectedCharacter(null); setDirectedFor(null); }}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RollList({ character, onPick }: { character: Character | null; onPick: (a: RollableAction) => void }) {
  if (!character) return null;
  const sys = getSystem(character.system_id);
  if (!sys) return <Text style={styles.dmEmpty}>Sistema desconocido.</Text>;
  const actions = computeFinalActions(sys, character.data);
  const grouped = actions.reduce<Record<string, RollableAction[]>>((acc, a) => {
    const g = a.group ?? 'Acciones';
    if (!acc[g]) acc[g] = [];
    acc[g].push(a);
    return acc;
  }, {});
  return (
    <ScrollView style={{ maxHeight: 380 }}>
      {Object.entries(grouped).map(([g, list]) => (
        <View key={g} style={{ marginBottom: 10 }}>
          <Text style={styles.rollGroup}>{g}</Text>
          <View style={styles.rollWrap}>
            {list.map((a) => (
              <TouchableOpacity key={a.id} style={styles.rollChip} onPress={() => onPick(a)}>
                <Text style={styles.rollChipLabel}>{a.label}</Text>
                <Text style={styles.rollChipMod}>{a.die} {a.modifier >= 0 ? `+${a.modifier}` : a.modifier}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#0f0c29' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.15)',
    backgroundColor: '#0f0c29',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#a78bfa', fontSize: 32, lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  headerTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, maxWidth: '80%' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#34d399' },
  messagesList: { paddingVertical: 12, paddingBottom: 4 },
  emptyChat: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 80,
    fontSize: 15,
    lineHeight: 26,
  },
  notice: {
    color: '#fbbf24',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
  },
  noticeWrap: {
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251,191,36,0.18)',
  },
  noticeButton: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  noticeButtonText: { color: '#1f2937', fontWeight: '800' },
  dmPanel: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,139,250,0.15)',
    backgroundColor: 'rgba(30,27,75,0.85)',
  },
  dmTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 14, marginBottom: 10 },
  inviteRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inviteInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  inviteButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inviteButtonText: { color: '#fff', fontWeight: '700' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  memberName: { color: '#fff', fontWeight: '700' },
  memberMeta: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  memberActions: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  acceptButtonText: { color: '#86efac', fontWeight: '700', fontSize: 12 },
  rejectButton: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectButtonText: { color: '#fca5a5', fontWeight: '700', fontSize: 12 },
  dmEmpty: { color: '#64748b', fontSize: 12 },

  // Character bar
  charBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(124,58,237,0.18)',
  },
  charBarLabel: { color: '#94a3b8', fontSize: 10 },
  charBarName: { color: '#e2e8f0', fontWeight: '700', fontSize: 13 },
  charBarBtn: {
    backgroundColor: 'rgba(124,58,237,0.18)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  charBarBtnText: { color: '#c4b5fd', fontWeight: '700', fontSize: 12 },

  // DM directed-roll chips
  directedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  directedChip: {
    backgroundColor: 'rgba(251,191,36,0.15)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
  },
  directedChipText: { color: '#fbbf24', fontWeight: '700', fontSize: 12 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e1b4b', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 30,
  },
  modalTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalAction: {
    marginTop: 10, alignItems: 'center', paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
  },
  charPickRow: {
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 6,
  },
  charPickName: { color: '#fff', fontWeight: '700' },
  charPickSys: { color: '#a78bfa', fontSize: 12, marginTop: 2 },
  rollGroup: { color: '#a78bfa', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  rollWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rollChip: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  rollChipLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  rollChipMod: { color: '#34d399', fontSize: 11, marginTop: 2 },
});
