import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { Session } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import { RootStackParamList } from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Sessions'>;
};

export default function RoomsScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [sessionDesc, setSessionDesc] = useState('');
  const [systemName, setSystemName] = useState('');
  const [access, setAccess] = useState<'open' | 'invite'>('open');
  const [creating, setCreating] = useState(false);

  const fetchSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      let memberMap = new Map<string, Session['member']>();
      if (profile?.id) {
        const { data: memberships } = await supabase
          .from('session_members')
          .select('*')
          .eq('user_id', profile.id);
        memberMap = new Map((memberships ?? []).map((item) => [item.session_id, item]));
      }

      setSessions(data.map((item) => ({ ...item, member: memberMap.get(item.id) ?? null })));
    }
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    fetchSessions();

    const channel = supabase
      .channel('sessions-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => {
        fetchSessions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSessions]);

  async function createSession() {
    if (!sessionName.trim()) { Alert.alert('Error', 'El nombre es obligatorio.'); return; }
    if (!profile?.id) { Alert.alert('Error', 'No se pudo cargar tu perfil.'); return; }
    setCreating(true);
    const { error } = await supabase.rpc('create_session_with_dm_member', {
      p_name: sessionName.trim(),
      p_description: sessionDesc.trim() || null,
      p_system: systemName.trim() || null,
      p_access: access,
    });

    setCreating(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setSessionName('');
    setSessionDesc('');
    setSystemName('');
    setAccess('open');
    setModalVisible(false);
  }

  async function requestJoin(item: Session) {
    if (!profile?.id) return;
    const { error } = await supabase.rpc('request_join_session', {
      p_session_id: item.id,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert(
      item.access === 'open' ? 'Solicitud enviada' : 'Marcada para invitación',
      item.access === 'open'
        ? 'El DM podrá aceptarte en la partida.'
        : 'Esta partida es privada; el DM deberá aprobar tu acceso.'
    );
    fetchSessions();
  }

  function membershipLabel(item: Session) {
    if (item.dm_id === profile?.id) return 'DM';
    if (!item.member) return item.access === 'open' ? 'Libre' : 'Privada';
    if (item.member.status === 'accepted') return 'Dentro';
    if (item.member.status === 'pending') return 'Pendiente';
    if (item.member.status === 'invited') return 'Invitado';
    return 'Rechazado';
  }

  function membershipAction(item: Session) {
    if (item.dm_id === profile?.id) return 'Abrir';
    if (!item.member) return 'Unirse';
    if (item.member.status === 'accepted') return 'Entrar';
    if (item.member.status === 'pending') return 'Pendiente';
    if (item.member.status === 'invited') return 'Invitado';
    return 'Reintentar';
  }

  function handleSessionPress(item: Session) {
    if (item.member?.status === 'accepted' || item.dm_id === profile?.id) {
      navigation.navigate('Chat', { sessionId: item.id, sessionName: item.name });
      return;
    }
    requestJoin(item);
  }

  function renderRoom({ item }: { item: Session }) {
    return (
      <TouchableOpacity
        style={styles.roomCard}
        onPress={() => handleSessionPress(item)}
        activeOpacity={0.75}
      >
        <View style={[styles.roomIcon, { backgroundColor: '#7c3aed' }]}>
          <Text style={styles.roomIconText}>⚔️</Text>
        </View>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.roomDesc} numberOfLines={1}>{item.description}</Text>
          ) : null}
          <Text style={styles.roomMeta}>
            {item.system ?? 'Sistema libre'} · {item.access === 'open' ? 'Abierta' : 'Privada'}
          </Text>
          <Text style={styles.badge}>{membershipLabel(item)}</Text>
        </View>
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleSessionPress(item)}
        >
          <Text style={styles.joinButtonText}>{membershipAction(item)}</Text>
        </TouchableOpacity>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  }

  function openCreateModal() {
    setModalVisible(true);
  }

  function closeCreateModal() {
    setModalVisible(false);
    setSessionName('');
    setSessionDesc('');
    setSystemName('');
    setAccess('open');
  }

  const title = profile?.username ? `Hola, ${profile.username}` : 'Cargando...';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0c29" />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>RolMix Sessions</Text>
          <Text style={styles.headerSub}>{title}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Cerrar sesión', '¿Seguro?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Salir', style: 'destructive', onPress: signOut },
        ])}>
          <Text style={styles.logoutBtn}>Salir</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subBar}>
        <TouchableOpacity style={styles.subBtn} onPress={() => navigation.navigate('Characters')}>
          <Text style={styles.subBtnText}>👤  Mis personajes</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#7c3aed" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={renderRoom}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No hay partidas aún.{"\n"}Crea la primera mesa.</Text>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openCreateModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nueva partida</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre de la partida"
              placeholderTextColor="#888"
              value={sessionName}
              onChangeText={setSessionName}
            />
            <TextInput
              style={styles.input}
              placeholder="Sistema: D&D 5e, Pathfinder..."
              placeholderTextColor="#888"
              value={systemName}
              onChangeText={setSystemName}
            />
            <TextInput
              style={[styles.input, { height: 72 }]}
              placeholder="Descripción (opcional)"
              placeholderTextColor="#888"
              value={sessionDesc}
              onChangeText={setSessionDesc}
              multiline
            />
            <View style={styles.accessRow}>
              <TouchableOpacity
                style={[styles.accessChip, access === 'open' && styles.accessChipActive]}
                onPress={() => setAccess('open')}
              >
                <Text style={[styles.accessChipText, access === 'open' && styles.accessChipTextActive]}>Abierta</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.accessChip, access === 'invite' && styles.accessChipActive]}
                onPress={() => setAccess('invite')}
              >
                <Text style={[styles.accessChipText, access === 'invite' && styles.accessChipTextActive]}>Privada</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={closeCreateModal}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.createBtn]}
                onPress={createSession}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createBtnText}>Crear</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c29' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.15)',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#a78bfa', marginTop: 2 },
  logoutBtn: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  subBar: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    flexDirection: 'row', gap: 10,
  },
  subBtn: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderColor: 'rgba(124,58,237,0.45)', borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
  },
  subBtnText: { color: '#c4b5fd', fontWeight: '700', fontSize: 13 },
  list: { padding: 16, paddingBottom: 90 },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
  },
  roomIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  roomIconText: { fontSize: 22 },
  roomInfo: { flex: 1 },
  roomName: { color: '#e2e8f0', fontWeight: '700', fontSize: 15 },
  roomDesc: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  roomMeta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  badge: { color: '#fbbf24', fontSize: 11, fontWeight: '700', marginTop: 6 },
  joinButton: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
  },
  joinButtonText: { color: '#c4b5fd', fontSize: 12, fontWeight: '700' },
  arrow: { color: '#7c3aed', fontSize: 24, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 60, fontSize: 15, lineHeight: 26 },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    backgroundColor: '#7c3aed',
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 32 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1e1b4b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 20 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  accessRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  accessChip: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  accessChipActive: { backgroundColor: 'rgba(124,58,237,0.24)', borderColor: '#7c3aed' },
  accessChipText: { color: '#94a3b8', fontWeight: '600' },
  accessChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.08)' },
  cancelBtnText: { color: '#94a3b8', fontWeight: '600' },
  createBtn: { backgroundColor: '#7c3aed' },
  createBtnText: { color: '#fff', fontWeight: '700' },
});
