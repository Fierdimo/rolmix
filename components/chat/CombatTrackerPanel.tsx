import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, Modal, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CombatEncounter, Combatant, Character } from '../../lib/types';

interface Props {
  encounter: CombatEncounter;
  combatants: Combatant[];
  characterMap: Record<string, Character>;
  isDm: boolean;
  myCharacterId?: string | null;
  onNextTurn: () => void;
  onEndCombat: () => void;
  onUpdateHp: (combatantId: string, delta: number) => void;
  /** El DM o el jugador activo piden realizar una acción. */
  onAct: (combatant: Combatant) => void;
}

// ── HP Edit Modal ─────────────────────────────────────────────────────────────

interface HpEditModalProps {
  combatant: Combatant;
  displayName: string;
  onApply: (delta: number) => void;
  onClose: () => void;
}

function HpEditModal({ combatant, displayName, onApply, onClose }: HpEditModalProps) {
  const [value, setValue] = useState('');

  function apply() {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n !== 0) {
      onApply(n);
    }
    onClose();
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={ms.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={ms.container}
      >
        <View style={ms.card}>
          <Text style={ms.title}>{displayName}</Text>
          <Text style={ms.sub}>
            PG actuales: {combatant.hp_current} / {combatant.hp_max}
          </Text>
          <Text style={ms.label}>
            Delta de PG (negativo = daño, positivo = curación):
          </Text>
          <TextInput
            style={ms.input}
            value={value}
            onChangeText={setValue}
            keyboardType="numbers-and-punctuation"
            placeholder="-5  /  +3"
            placeholderTextColor="#9ca3af"
            autoFocus
            onSubmitEditing={apply}
          />
          <View style={ms.row}>
            {[-10, -5, -1, 1, 5, 10].map((n) => (
              <TouchableOpacity
                key={n}
                style={[ms.quickBtn, n < 0 ? ms.quickDmg : ms.quickHeal]}
                onPress={() => { onApply(n); onClose(); }}
              >
                <Text style={ms.quickBtnText}>{n > 0 ? `+${n}` : n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={ms.actions}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose}>
              <Text style={ms.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.applyBtn} onPress={apply}>
              <Text style={ms.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────

export default function CombatTrackerPanel({
  encounter,
  combatants,
  characterMap,
  isDm,
  myCharacterId,
  onNextTurn,
  onEndCombat,
  onUpdateHp,
  onAct,
}: Props) {
  const [editingHp, setEditingHp] = useState<Combatant | null>(null);

  function canActNow(c: Combatant): boolean {
    if (c.is_defeated) return false;
    if (c.turn_order !== encounter.active_index) return false;
    return isDm || c.character_id === myCharacterId;
  }

  function renderCard({ item: c }: { item: Combatant }) {
    const isActive = c.turn_order === encounter.active_index && !c.is_defeated;
    const hpPct    = c.hp_max > 0 ? Math.max(0, c.hp_current / c.hp_max) : 0;
    const barColor = hpPct > 0.5 ? '#059669' : hpPct > 0.25 ? '#d97706' : '#dc2626';

    return (
      <View style={[s.card, isActive && s.cardActive, c.is_defeated && s.cardDefeated]}>
        {/* Fila nombre + iniciativa */}
        <View style={s.nameRow}>
          <Text style={[s.name, c.is_defeated && s.textDefeated]} numberOfLines={1}>
            {isActive ? '▶ ' : ''}{(c.character_id && characterMap[c.character_id]?.name) || c.name}
          </Text>
          <Text style={[s.initiative, c.is_defeated && s.textDefeated]}>
            {c.initiative}
          </Text>
        </View>

        {/* Barra de PG */}
        <View style={s.hpBarBg}>
          <View
            style={[
              s.hpBarFill,
              { width: `${hpPct * 100}%` as unknown as number, backgroundColor: barColor },
            ]}
          />
        </View>

        {/* PG texto (toca para editar si es DM) */}
        <TouchableOpacity
          disabled={!isDm}
          onPress={() => isDm && setEditingHp(c)}
          style={s.hpTextRow}
        >
          <Text style={[s.hpText, c.is_defeated && s.textDefeated]}>
            {c.is_defeated ? '💀' : `${c.hp_current}/${c.hp_max} PG`}
          </Text>
          {isDm && !c.is_defeated && <Text style={s.editHint}>✏️</Text>}
        </TouchableOpacity>

        {/* Botón Actuar */}
        {canActNow(c) && (
          <TouchableOpacity style={s.actBtn} onPress={() => onAct(c)}>
            <Text style={s.actBtnText}>Actuar</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={s.panel}>
      {/* Cabecera */}
      <View style={s.header}>
        <Text style={s.headerTitle}>⚔️ Ronda {encounter.round}</Text>
        {isDm && (
          <TouchableOpacity style={s.endBtn} onPress={onEndCombat}>
            <Text style={s.endBtnText}>Terminar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Lista horizontal de combatientes */}
      <FlatList
        data={combatants}
        keyExtractor={(c) => c.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        renderItem={renderCard}
      />

      {/* Siguiente turno (solo DM) */}
      {isDm && (
        <TouchableOpacity style={s.nextBtn} onPress={onNextTurn}>
          <Text style={s.nextBtnText}>Siguiente turno ▶</Text>
        </TouchableOpacity>
      )}

      {/* Modal de edición de PG */}
      {editingHp && (
        <HpEditModal
          combatant={editingHp}
          displayName={(editingHp.character_id && characterMap[editingHp.character_id]?.name) || editingHp.name}
          onApply={(delta) => onUpdateHp(editingHp.id, delta)}
          onClose={() => setEditingHp(null)}
        />
      )}
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  panel: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.15)',
    paddingBottom: 6,
    maxHeight: 210,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  endBtn: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  endBtnText: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
  listContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 8 },

  // Tarjeta de combatiente
  card: {
    width: 120,
    backgroundColor: '#faf9ff',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
    gap: 3,
  },
  cardActive: {
    borderColor: '#f87171',
    backgroundColor: '#fee2e2',
  },
  cardDefeated: {
    borderColor: 'rgba(100,116,139,0.3)',
    backgroundColor: '#f5f3ff',
    opacity: 0.6,
  },
  turnArrow: { color: '#b91c1c', fontSize: 10, fontWeight: '700', marginBottom: -2 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  name: {
    color: '#1e1b3a',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  initiative: { color: '#6d28d9', fontSize: 11, fontWeight: '600' },
  textDefeated: { color: '#9ca3af' },

  // Barra de PG
  hpBarBg: {
    height: 5,
    backgroundColor: 'rgba(100,116,139,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 2,
  },
  hpBarFill: { height: '100%', borderRadius: 3 },

  hpTextRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hpText: { color: '#6b7280', fontSize: 11 },
  editHint: { fontSize: 10, opacity: 0.6 },

  actBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  actBtnText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },

  nextBtn: {
    marginHorizontal: 12,
    marginTop: 2,
    backgroundColor: 'rgba(109,40,217,0.14)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  nextBtnText: { color: '#6d28d9', fontSize: 13, fontWeight: '600' },
});

// Estilos del modal de edición de HP
const ms = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,12,41,0.50)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
  },
  title: { color: '#1e1b3a', fontSize: 16, fontWeight: '700' },
  sub:   { color: '#6b7280', fontSize: 13 },
  label: { color: '#6b7280', fontSize: 12 },
  input: {
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.22)',
    color: '#1e1b3a',
    fontSize: 18,
    textAlign: 'center',
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  quickBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickDmg:  { backgroundColor: 'rgba(239,68,68,0.25)' },
  quickHeal: { backgroundColor: 'rgba(52,211,153,0.2)' },
  quickBtnText: { color: '#1e1b3a', fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(100,116,139,0.2)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
  applyBtn: {
    flex: 1,
    backgroundColor: '#6d28d9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
});
