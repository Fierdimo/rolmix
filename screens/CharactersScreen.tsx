import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, ActivityIndicator, StatusBar,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { Character } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import { listSystems, getSystem } from '../lib/systems';
import { RootStackParamList } from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Characters'>;
};

export default function CharactersScreen({ navigation }: Props) {
  const { profile } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);

  const fetchCharacters = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('owner_id', profile.id)
      .order('updated_at', { ascending: false });
    if (!error && data) setCharacters(data);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { fetchCharacters(); }, [fetchCharacters]);

  async function createCharacter(systemId: string) {
    if (!profile?.id) return;
    setPickerVisible(false);
    const sys = getSystem(systemId);
    if (!sys) return;

    // Defaults declarados en la SystemDefinition
    const defaults: Record<string, string | number> = {};
    for (const f of sys.fields) {
      if (f.default !== undefined) defaults[f.key] = f.default;
    }

    const { data, error } = await supabase
      .from('characters')
      .insert({
        owner_id: profile.id,
        system_id: systemId,
        name: 'Nuevo personaje',
        data: defaults,
      })
      .select()
      .single();

    if (error) { Alert.alert('Error', error.message); return; }
    fetchCharacters();
    navigation.navigate('CharacterEditor', { characterId: data.id });
  }

  async function deleteCharacter(c: Character) {
    Alert.alert(
      'Borrar personaje',
      `Vas a eliminar "${c.name}" de forma permanente.\n\n` +
      'Se perderán todos sus datos: estadísticas, equipo, conjuros, dotes, habilidades y notas. ' +
      'Esta acción NO se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar permanentemente',
          style: 'destructive',
          onPress: () => {
            // Doble confirmación para evitar borrados accidentales.
            Alert.alert(
              '¿Seguro?',
              `Confirma el borrado de "${c.name}". Esta acción es irreversible.`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Sí, borrar',
                  style: 'destructive',
                  onPress: async () => {
                    const { error } = await supabase.from('characters').delete().eq('id', c.id);
                    if (error) { Alert.alert('Error', error.message); return; }
                    setCharacters((prev) => prev.filter((x) => x.id !== c.id));
                  },
                },
              ],
            );
          },
        },
      ],
    );
  }

  function renderItem({ item }: { item: Character }) {
    const sys = getSystem(item.system_id);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('CharacterEditor', { characterId: item.id })}
        onLongPress={() => deleteCharacter(item)}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardSystem}>{sys?.name ?? item.system_id}</Text>
          {item.data?.class || item.data?.level ? (
            <Text style={styles.cardMeta}>
              {item.data?.class ? String(item.data.class) : '—'} · Nivel {item.data?.level ?? '?'}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation?.(); deleteCharacter(item); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.deleteBtn}
        >
          <Text style={styles.deleteText}>🗑</Text>
        </TouchableOpacity>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0c29" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis personajes</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#7c3aed" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={characters}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No tienes personajes.{"\n"}Pulsa + para crear uno.
            </Text>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setPickerVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={pickerVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Qué sistema?</Text>
            {listSystems().map((s) => (
              <TouchableOpacity key={s.id} style={styles.systemBtn} onPress={() => createCharacter(s.id)}>
                <Text style={styles.systemBtnTitle}>{s.name}</Text>
                <Text style={styles.systemBtnSub}>{s.short}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPickerVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c29' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.15)',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#a78bfa', fontSize: 32, lineHeight: 36 },
  headerTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16 },
  list: { padding: 16, paddingBottom: 90 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  cardLeft: { flex: 1 },
  cardName: { color: '#e2e8f0', fontWeight: '700', fontSize: 16 },
  cardSystem: { color: '#a78bfa', fontSize: 12, marginTop: 2 },
  cardMeta: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  arrow: { color: '#7c3aed', fontSize: 24, fontWeight: '700' },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    marginRight: 8,
  },
  deleteText: { fontSize: 16 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 60, fontSize: 15, lineHeight: 26 },
  fab: {
    position: 'absolute', bottom: 30, right: 24, backgroundColor: '#7c3aed',
    width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 32 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e1b4b', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  systemBtn: {
    backgroundColor: 'rgba(124,58,237,0.18)', borderRadius: 12,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  systemBtnTitle: { color: '#fff', fontWeight: '700', fontSize: 15 },
  systemBtnSub: { color: '#c4b5fd', fontSize: 12, marginTop: 2 },
  cancelBtn: { marginTop: 6, alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#94a3b8', fontWeight: '600' },
});
