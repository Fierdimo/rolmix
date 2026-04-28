import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, Modal, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CombatEncounter, Combatant } from '../../lib/types';

interface Props {
  encounter: CombatEncounter;
  combatants: Combatant[];
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
  onApply: (delta: number) => void;
  onClose: () => void;
}

function HpEditModal({ combatant, onApply, onClose }: HpEditModalProps) {
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
          <Text style={ms.title}>{combatant.name}</Text>
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
            placeholderTextColor="#64748b"
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
    const barColor = hpPct > 0.5 ? '#34d399' : hpPct > 0.25 ? '#fbbf24' : '#f87171';

    return (
      <View style={[s.card, isActive && s.cardActive, c.is_defeated && s.cardDefeated]}>
        {/* Indicador de turno activo */}
        {isActive && <Text style={s.turnArrow}>▶</Text>}

        {/* Nombre */}
        <Text style={[s.name, c.is_defeated && s.textDefeated]} numberOfLines={1}>
          {c.name}
        </Text>

        {/* Iniciativa */}
        <Text style={[s.initiative, c.is_defeated && s.textDefeated]}>
          INI {c.initiative}
        </Text>

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
    backgroundColor: 'rgba(15,12,41,0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,58,237,0.3)',
    paddingBottom: 6,
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
    color: '#f87171',
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
  endBtnText: { color: '#f87171', fontSize: 12, fontWeight: '600' },
  listContent: { paddingHorizontal: 8, paddingVertical: 4, gap: 8 },

  // Tarjeta de combatiente
  card: {
    width: 130,
    backgroundColor: 'rgba(30,27,60,0.9)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
    gap: 4,
  },
  cardActive: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  cardDefeated: {
    borderColor: 'rgba(100,116,139,0.3)',
    backgroundColor: 'rgba(15,12,41,0.6)',
    opacity: 0.6,
  },
  turnArrow: { color: '#f87171', fontSize: 10, fontWeight: '700', marginBottom: -2 },
  name: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '700',
  },
  initiative: { color: '#a78bfa', fontSize: 11 },
  textDefeated: { color: '#64748b' },

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
  hpText: { color: '#94a3b8', fontSize: 11 },
  editHint: { fontSize: 10, opacity: 0.6 },

  actBtn: {
    marginTop: 4,
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderRadius: 6,
    paddingVertical: 4,
    alignItems: 'center',
  },
  actBtnText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },

  nextBtn: {
    marginHorizontal: 12,
    marginTop: 2,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  nextBtnText: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
});

// Estilos del modal de edición de HP
const ms = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#1e1b3c',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  title: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  sub:   { color: '#94a3b8', fontSize: 13 },
  label: { color: '#94a3b8', fontSize: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.3)',
    color: '#e2e8f0',
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
  quickBtnText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(100,116,139,0.2)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  applyBtn: {
    flex: 1,
    backgroundColor: 'rgba(124,58,237,0.4)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  applyBtnText: { color: '#e2e8f0', fontSize: 14, fontWeight: '700' },
});
