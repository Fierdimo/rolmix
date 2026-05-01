import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { chatStyles as s } from './chatStyles';

// Cargamos el JSON en tiempo de compilación (bundle local, ~1926 entries)
import MONSTERS_RAW from '../../data/dnd35/monsters.json';

export interface MonsterEntry {
  id: string;
  name: string;
  system_id: string;
  data: Record<string, unknown>;
}

const MONSTERS = MONSTERS_RAW as MonsterEntry[];

interface Props {
  visible: boolean;
  loading?: boolean;
  onPick: (monster: MonsterEntry) => void;
  onClose: () => void;
}

export default function MonsterPickerModal({ visible, loading, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [maxCr, setMaxCr] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cr = parseFloat(maxCr);
    return MONSTERS.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (!isNaN(cr) && (m.data.cr as number) > cr) return false;
      return true;
    }).slice(0, 100); // mostramos máx 100 resultados para fluidez
  }, [query, maxCr]);

  function reset() {
    setQuery('');
    setMaxCr('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { maxHeight: '85%' }]}>
          <Text style={s.modalTitle}>Añadir monstruo</Text>

          {/* Barra de filtros */}
          <View style={localS.filterRow}>
            <TextInput
              style={[localS.input, { flex: 2 }]}
              placeholder="Buscar por nombre…"
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[localS.input, { flex: 1, marginLeft: 6 }]}
              placeholder="CR máx"
              placeholderTextColor="#9ca3af"
              value={maxCr}
              onChangeText={setMaxCr}
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={localS.count}>
            {filtered.length === 100
              ? `Mostrando 100 de ${MONSTERS.length} (refina la búsqueda)`
              : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
          </Text>

          {loading ? (
            <ActivityIndicator color="#7c3aed" style={{ marginVertical: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={localS.row}
                  onPress={() => { reset(); onPick(item); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={localS.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={localS.rowMeta}>
                      {item.data.type as string}{item.data.size ? ` · ${item.data.size}` : ''}
                    </Text>
                  </View>
                  <View style={localS.crBadge}>
                    <Text style={localS.crText}>CR {item.data.cr as number}</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={s.emptyLabel}>Sin resultados. Prueba otro nombre o CR.</Text>
              }
              keyboardShouldPersistTaps="handled"
            />
          )}

          <TouchableOpacity style={s.modalAction} onPress={() => { reset(); onClose(); }}>
            <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const localS = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#1e1b3a',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.08)',
  },
  count: {
    color: '#9ca3af',
    fontSize: 11,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowName: {
    color: '#1e1b3a',
    fontSize: 14,
    fontWeight: '600',
  },
  rowMeta: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 1,
  },
  crBadge: {
    backgroundColor: 'rgba(109,40,217,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  crText: {
    color: '#6d28d9',
    fontSize: 12,
    fontWeight: '700',
  },
});
