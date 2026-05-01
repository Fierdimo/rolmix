import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { chatStyles as s } from './chatStyles';
import { MonsterEntry } from './MonsterPickerModal';
import { PreparedEncounter, EncounterMonsterEntry } from '../../hooks/useSessionEncounters';
import { Character } from '../../lib/types';

// Catálogo de monstruos en bundle local
import MONSTERS_RAW from '../../data/dnd35/monsters.json';
const MONSTERS = MONSTERS_RAW as MonsterEntry[];

type InternalView = 'list' | 'edit' | 'search';

interface Props {
  visible: boolean;
  encounters: PreparedEncounter[];
  /** Personajes guardados por el DM, para añadirlos como NPC en un encuentro. */
  myCharacters: Character[];
  onSave: (enc: PreparedEncounter) => void;
  onDelete: (id: string) => void;
  /** El DM pulsa "Desplegar" → ChatScreen crea los personajes y los añade a la sesión. */
  onDeploy: (enc: PreparedEncounter) => void;
  onClose: () => void;
}

function blankEncounter(): PreparedEncounter {
  return {
    id: Date.now().toString(),
    name: '',
    description: '',
    monsters: [],
    createdAt: new Date().toISOString(),
  };
}

export default function EncounterBuilderModal({
  visible, encounters, myCharacters, onSave, onDelete, onDeploy, onClose,
}: Props) {
  const [view, setView] = useState<InternalView>('list');
  const [editing, setEditing] = useState<PreparedEncounter | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxCr, setMaxCr] = useState('');
  const [searchTab, setSearchTab] = useState<'catalog' | 'chars'>('catalog');

  // ── Monster search (inline sub-view) ────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cr = parseFloat(maxCr);
    return MONSTERS.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (!isNaN(cr) && (m.data.cr as number) > cr) return false;
      return true;
    }).slice(0, 100);
  }, [searchQuery, maxCr]);

  // ── Navigation ───────────────────────────────────────────────────────────
  function goBack() {
    if (view === 'search') {
      setView('edit');
      setSearchQuery('');
      setMaxCr('');
      setSearchTab('catalog');
    } else if (view === 'edit') {
      setView('list');
      setEditing(null);
    } else {
      onClose();
    }
  }

  function startNew() {
    setEditing(blankEncounter());
    setView('edit');
  }

  function startEdit(enc: PreparedEncounter) {
    setEditing({ ...enc, monsters: enc.monsters.map((m) => ({ ...m })) });
    setView('edit');
  }

  // ── Edit actions ─────────────────────────────────────────────────────────
  function saveEdit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { Alert.alert('Falta nombre', 'Escribe un nombre para el encuentro.'); return; }
    if (editing.monsters.length === 0) {
      Alert.alert('Sin monstruos', 'Añade al menos un monstruo antes de guardar.');
      return;
    }
    onSave({ ...editing, name });
    setView('list');
    setEditing(null);
  }

  const addMonsterFromSearch = useCallback((monster: MonsterEntry) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const idx = prev.monsters.findIndex((m) => m.monster.id === monster.id);
      let monsters: EncounterMonsterEntry[];
      if (idx >= 0) {
        monsters = prev.monsters.map((m, i) =>
          i === idx ? { ...m, count: m.count + 1 } : m,
        );
      } else {
        monsters = [...prev.monsters, { monster, customName: monster.name, count: 1 }];
      }
      return { ...prev, monsters };
    });
    setView('edit');
    setSearchQuery('');
    setMaxCr('');
  }, []);

  function updateMonsterName(idx: number, name: string) {
    if (!editing) return;
    const monsters = editing.monsters.map((m, i) =>
      i === idx ? { ...m, customName: name } : m,
    );
    setEditing({ ...editing, monsters });
  }

  function updateMonsterCount(idx: number, delta: number) {
    if (!editing) return;
    const monsters = editing.monsters.map((m, i) =>
      i === idx ? { ...m, count: Math.max(1, m.count + delta) } : m,
    );
    setEditing({ ...editing, monsters });
  }

  function removeMonster(idx: number) {
    if (!editing) return;
    setEditing({ ...editing, monsters: editing.monsters.filter((_, i) => i !== idx) });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function totalFigures(enc: PreparedEncounter) {
    return enc.monsters.reduce((a, m) => a + m.count, 0);
  }

  function encSummary(enc: PreparedEncounter) {
    return enc.monsters
      .map((m) => m.customName + (m.count > 1 ? ` ×${m.count}` : ''))
      .join(', ');
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={goBack}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { maxHeight: '93%' }]}>

          {/* ── Header ── */}
          <View style={localS.header}>
            <TouchableOpacity onPress={goBack} style={localS.backBtn}>
              <Text style={localS.backText}>{view === 'list' ? '✕' : '‹'}</Text>
            </TouchableOpacity>
            <Text style={s.modalTitle} numberOfLines={1}>
              {view === 'list'
                ? 'Encuentros preparados'
                : view === 'edit'
                  ? (editing?.createdAt && encounters.find((e) => e.id === editing.id) ? 'Editar encuentro' : 'Nuevo encuentro')
                  : 'Añadir monstruo'}
            </Text>
          </View>

          {/* ══════════ LIST VIEW ══════════ */}
          {view === 'list' && (
            <>
              {encounters.length === 0 ? (
                <Text style={[s.emptyLabel, { textAlign: 'center', marginVertical: 28, lineHeight: 20 }]}>
                  {'No hay encuentros preparados.\nCrea uno para tenerlo listo al instante.'}
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 420 }}>
                  {encounters.map((enc) => (
                    <View key={enc.id} style={localS.encRow}>
                      <Text style={localS.encName} numberOfLines={1}>{enc.name}</Text>
                      <Text style={localS.encMeta} numberOfLines={2}>
                        {totalFigures(enc)} figura{totalFigures(enc) !== 1 ? 's' : ''} · {encSummary(enc)}
                      </Text>
                      {enc.description ? (
                        <Text style={localS.encDesc} numberOfLines={1}>{enc.description}</Text>
                      ) : null}
                      <View style={localS.encActions}>
                        <TouchableOpacity
                          style={localS.deployBtn}
                          onPress={() => { onDeploy(enc); onClose(); }}
                        >
                          <Text style={localS.deployBtnText}>▶  Desplegar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={localS.editIconBtn} onPress={() => startEdit(enc)}>
                          <Text style={localS.editIconText}>✎</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={localS.deleteIconBtn}
                          onPress={() => Alert.alert(
                            'Eliminar encuentro',
                            `¿Seguro que quieres eliminar "${enc.name}"?`,
                            [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(enc.id) }],
                          )}
                        >
                          <Text style={localS.deleteIconText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[s.modalAction, { backgroundColor: '#6d28d9', marginTop: 14 }]}
                onPress={startNew}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>＋  Nuevo encuentro</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ══════════ EDIT VIEW ══════════ */}
          {view === 'edit' && editing && (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
              {/* Nombre */}
              <TextInput
                style={localS.nameInput}
                placeholder="Nombre del encuentro (ej. Emboscada en el bosque)"
                placeholderTextColor="#9ca3af"
                value={editing.name}
                onChangeText={(t) => setEditing({ ...editing, name: t })}
                autoFocus={!editing.name}
              />
              {/* Descripción */}
              <TextInput
                style={[localS.nameInput, { fontSize: 13, marginBottom: 16, minHeight: 40 }]}
                placeholder="Notas / descripción (opcional)"
                placeholderTextColor="#9ca3af"
                value={editing.description}
                onChangeText={(t) => setEditing({ ...editing, description: t })}
                multiline
              />

              {/* Lista de monstruos */}
              <Text style={localS.subTitle}>Monstruos / NPCs</Text>

              {editing.monsters.length === 0 ? (
                <Text style={[s.emptyLabel, { marginBottom: 12 }]}>
                  Sin monstruos todavía. Añade uno con el botón de abajo.
                </Text>
              ) : (
                editing.monsters.map((entry, idx) => (
                  <View key={idx} style={localS.monsterEntry}>
                    {/* Nombre editable + tipo base */}
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={localS.monsterNameInput}
                        value={entry.customName}
                        onChangeText={(t) => updateMonsterName(idx, t)}
                        placeholder={entry.monster.name}
                        placeholderTextColor="#9ca3af"
                      />
                      <Text style={localS.monsterBase}>
                        CR {entry.monster.data.cr as number} · {entry.monster.data.type as string}
                      </Text>
                    </View>

                    {/* Contador de instancias */}
                    <View style={localS.countRow}>
                      <TouchableOpacity style={localS.countBtn} onPress={() => updateMonsterCount(idx, -1)}>
                        <Text style={localS.countBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={localS.countValue}>{entry.count}</Text>
                      <TouchableOpacity style={localS.countBtn} onPress={() => updateMonsterCount(idx, +1)}>
                        <Text style={localS.countBtnText}>＋</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Quitar */}
                    <TouchableOpacity style={localS.removeBtn} onPress={() => removeMonster(idx)}>
                      <Text style={localS.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Resumen de figuras */}
              {editing.monsters.length > 0 && (
                <Text style={localS.totalLabel}>
                  Total: {editing.monsters.reduce((a, m) => a + m.count, 0)} figura{editing.monsters.reduce((a, m) => a + m.count, 0) !== 1 ? 's' : ''}
                </Text>
              )}

              <TouchableOpacity style={s.modalAction} onPress={() => setView('search')}>
                <Text style={{ color: '#6d28d9', fontWeight: '700' }}>＋  Añadir monstruo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  s.modalAction,
                  { backgroundColor: editing.name.trim() && editing.monsters.length > 0 ? '#6d28d9' : '#e5e7eb', marginTop: 8, marginBottom: 16 },
                ]}
                onPress={saveEdit}
              >
                <Text style={{ color: editing.name.trim() && editing.monsters.length > 0 ? '#fff' : '#9ca3af', fontWeight: '700' }}>
                  Guardar encuentro
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ══════════ SEARCH VIEW ══════════ */}
          {view === 'search' && (
            <>
              {/* Tabs: catálogo vs mis personajes */}
              <View style={localS.tabRow}>
                <TouchableOpacity
                  style={[localS.tabBtn, searchTab === 'catalog' && localS.tabBtnActive]}
                  onPress={() => setSearchTab('catalog')}
                >
                  <Text style={[localS.tabBtnText, searchTab === 'catalog' && localS.tabBtnTextActive]}>Catálogo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[localS.tabBtn, searchTab === 'chars' && localS.tabBtnActive]}
                  onPress={() => setSearchTab('chars')}
                >
                  <Text style={[localS.tabBtnText, searchTab === 'chars' && localS.tabBtnTextActive]}>Mis personajes</Text>
                </TouchableOpacity>
              </View>

              {searchTab === 'catalog' ? (
                <>
                  <View style={localS.filterRow}>
                    <TextInput
                      style={[localS.filterInput, { flex: 2 }]}
                      placeholder="Buscar por nombre…"
                      placeholderTextColor="#9ca3af"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus={searchTab === 'catalog'}
                    />
                    <TextInput
                      style={[localS.filterInput, { flex: 1, marginLeft: 6 }]}
                      placeholder="CR máx"
                      placeholderTextColor="#9ca3af"
                      value={maxCr}
                      onChangeText={setMaxCr}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <Text style={localS.countLabel}>
                    {filtered.length === 100
                      ? `Mostrando 100 de ${MONSTERS.length} (refina la búsqueda)`
                      : `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}`}
                  </Text>
                  <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 340 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity style={localS.monsterRow} onPress={() => addMonsterFromSearch(item)}>
                        <View style={{ flex: 1 }}>
                          <Text style={localS.monsterRowName} numberOfLines={1}>{item.name}</Text>
                          <Text style={localS.monsterRowMeta}>
                            {item.data.type as string}{item.data.size ? ` · ${item.data.size}` : ''}
                          </Text>
                        </View>
                        <View style={localS.crBadge}>
                          <Text style={localS.crText}>CR {item.data.cr as number}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={s.emptyLabel}>Sin resultados.</Text>}
                  />
                </>
              ) : (
                // ── Mis personajes ──────────────────────────────────────────
                myCharacters.length === 0 ? (
                  <Text style={[s.emptyLabel, { textAlign: 'center', marginVertical: 24 }]}>
                    No tienes personajes guardados.{`\n`}Crea uno desde "Mis personajes".
                  </Text>
                ) : (
                  <FlatList
                    data={myCharacters}
                    keyExtractor={(item) => item.id}
                    style={{ maxHeight: 360 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={localS.monsterRow}
                        onPress={() => addMonsterFromSearch({
                          id: item.id,
                          name: item.name,
                          system_id: item.system_id,
                          data: item.data as Record<string, unknown>,
                        })}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={localS.monsterRowName} numberOfLines={1}>{item.name}</Text>
                          <Text style={localS.monsterRowMeta}>{item.system_id}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={s.emptyLabel}>Sin personajes.</Text>}
                  />
                )
              )}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const localS = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 4,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#6d28d9', fontSize: 24, fontWeight: '300' },

  // ── Encounter list ───────────────────────────────────────────────────────
  encRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.09)',
  },
  encName: { color: '#1e1b3a', fontWeight: '800', fontSize: 15 },
  encMeta: { color: '#6b7280', fontSize: 12, marginTop: 3, lineHeight: 17 },
  encDesc: { color: '#9ca3af', fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  encActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  deployBtn: {
    flex: 1,
    backgroundColor: 'rgba(109,40,217,0.12)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  deployBtnText: { color: '#6d28d9', fontWeight: '700', fontSize: 13 },
  editIconBtn: {
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editIconText: { color: '#6d28d9', fontSize: 15 },
  deleteIconBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteIconText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },

  // ── Edit view ────────────────────────────────────────────────────────────
  nameInput: {
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1e1b3a',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
    marginBottom: 8,
  },
  subTitle: {
    color: '#6d28d9',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  monsterEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.07)',
    gap: 8,
  },
  monsterNameInput: {
    backgroundColor: '#f9f8ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#1e1b3a',
    fontSize: 13,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.14)',
  },
  monsterBase: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countBtn: {
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBtnText: { color: '#6d28d9', fontWeight: '700', fontSize: 16, lineHeight: 20 },
  countValue: {
    color: '#1e1b3a',
    fontWeight: '700',
    fontSize: 15,
    minWidth: 22,
    textAlign: 'center',
  },
  removeBtn: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: 6,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  totalLabel: {
    color: '#6d28d9',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 4,
  },

  // ── Search view ──────────────────────────────────────────────────────────
  filterRow: { flexDirection: 'row', marginBottom: 8 },
  filterInput: {
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#1e1b3a',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.08)',
  },
  countLabel: { color: '#9ca3af', fontSize: 11, marginBottom: 6 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: '#6d28d9' },
  tabBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 13 },
  tabBtnTextActive: { color: '#fff' },
  monsterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.06)',
  },
  monsterRowName: { color: '#1e1b3a', fontSize: 14, fontWeight: '600' },
  monsterRowMeta: { color: '#6b7280', fontSize: 12, marginTop: 1 },
  crBadge: {
    backgroundColor: '#ede9fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  crText: { color: '#6d28d9', fontWeight: '700', fontSize: 12 },
});
