import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, StyleSheet, FlatList,
} from 'react-native';
import { Combatant, Character, CombatRoll } from '../../lib/types';
import { RollableAction } from '../../lib/systems/types';
import { computeFinalActions } from '../../lib/systems/aggregate';
import { getSystem, rollDie } from '../../lib/systems';
import type { CharacterData } from '../../lib/systems/types';

// ── Tipos de acción de combate (D&D 3.5) ──────────────────────────────────────

export type CombatActionType = 'standard' | 'full' | 'total_defense' | 'defensive' | 'def_cast';

interface ActionTypeDef {
  id: CombatActionType;
  label: string;
  icon: string;
  description: string;
  needsAttack: boolean;
}

const ACTION_TYPES: ActionTypeDef[] = [
  {
    id: 'standard',
    label: 'Ataque',
    icon: '⚔️',
    description: '1 ataque al bono completo (acción estándar)',
    needsAttack: true,
  },
  {
    id: 'full',
    label: 'Ataque Completo',
    icon: '⚔️⚔️',
    description: 'Todos los ataques iterativos (acción completa)',
    needsAttack: true,
  },
  {
    id: 'defensive',
    label: 'Lucha Defensiva',
    icon: '🛡️⚔️',
    description: '1 ataque a −4, gana +2 CA esquiva',
    needsAttack: true,
  },
  {
    id: 'total_defense',
    label: 'Defensa Total',
    icon: '🛡️',
    description: 'Sin ataque, +4 CA esquiva este turno',
    needsAttack: false,
  },
  {
    id: 'def_cast',
    label: 'Conjurar Defensivamente',
    icon: '🔮',
    description: 'Concentración (CD 15 + niv. conjuro) para no provocar AP',
    needsAttack: false,
  },
];

// ── Resultado del modal ───────────────────────────────────────────────────────

export interface CombatAttackResult {
  attacker: Combatant;
  target: Combatant | null;
  actionType: CombatActionType;
  actionLabel: string;
  weaponLabel: string;
  rolls: CombatRoll[];
  /** Bono de CA esquiva temporal (defensa total o lucha defensiva). */
  acBonus?: number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  attacker: Combatant | null;
  character: Character | null;
  combatants: Combatant[];
  onResult: (result: CombatAttackResult) => void;
  onClose: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function CombatActionModal({
  visible,
  attacker,
  character,
  combatants,
  onResult,
  onClose,
}: Props) {
  const [actionType, setActionType] = useState<CombatActionType>('standard');
  const [selectedWeapon, setSelectedWeapon] = useState<RollableAction | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Combatant | null>(null);

  // Acciones de combate del personaje activo
  const attackActions = useMemo<RollableAction[]>(() => {
    if (!character) return [];
    const sys = getSystem(character.system_id);
    if (!sys) return [];
    const allActions = computeFinalActions(sys, character.data as CharacterData);
    return allActions.filter(
      (a) =>
        a.group === 'Combate' &&
        (a.id.startsWith('weapon_') ||
          a.id === 'attack_melee' ||
          a.id === 'attack_ranged'),
    );
  }, [character]);

  // Objetivo automático o manual
  const availableTargets = combatants.filter(
    (c) => !c.is_defeated && c.id !== attacker?.id,
  );

  const activeTypeDef = ACTION_TYPES.find((t) => t.id === actionType)!;

  // Acción efectiva de ataque (con posible penalización por lucha defensiva)
  function getEffectiveAction(): RollableAction | null {
    const base = selectedWeapon ?? attackActions[0] ?? null;
    if (!base) return null;
    if (actionType === 'defensive') {
      return {
        ...base,
        modifier: base.modifier - 4,
        extraAttacks: undefined, // Lucha defensiva es solo 1 ataque
      };
    }
    return base;
  }

  function handleRoll() {
    if (!attacker) return;
    const def = activeTypeDef;

    // Acciones sin tirada de ataque
    if (!def.needsAttack) {
      let rolls: CombatRoll[] = [];
      let weaponLabel = '';

      if (actionType === 'def_cast') {
        // Tirada de Concentración (usa skill sk_concentration si existe)
        const conc = computeFinalActions(
          getSystem(character?.system_id ?? '') ?? ({} as ReturnType<typeof getSystem>)!,
          character?.data as CharacterData,
        ).find((a) => a.id === 'sk_concentration');
        const mod = conc?.modifier ?? 0;
        const d20 = rollDie('d20');
        rolls = [{ d20, modifier: mod, total: d20 + mod }];
        weaponLabel = 'Concentración';
      }

      onResult({
        attacker,
        target: selectedTarget,
        actionType,
        actionLabel: def.label,
        weaponLabel,
        rolls,
        acBonus: actionType === 'total_defense' ? 4 : undefined,
      });
      onClose();
      return;
    }

    const action = getEffectiveAction();
    if (!action) return;

    const modifiers =
      actionType === 'full'
        ? [action.modifier, ...(action.extraAttacks ?? [])]
        : [action.modifier];

    const rolls: CombatRoll[] = modifiers.map((mod) => {
      const d20 = rollDie('d20');
      return { d20, modifier: mod, total: d20 + mod };
    });

    onResult({
      attacker,
      target: selectedTarget,
      actionType,
      actionLabel: def.label,
      weaponLabel: action.label,
      rolls,
      acBonus: actionType === 'defensive' ? 2 : undefined,
    });
    onClose();
  }

  if (!attacker) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          {/* Cabecera */}
          <View style={s.header}>
            <Text style={s.headerTitle}>⚔️ {attacker.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={s.body}>
            {/* Tipo de acción */}
            <Text style={s.sectionLabel}>TIPO DE ACCIÓN</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.actionRow}>
              {ACTION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.actionChip, actionType === t.id && s.actionChipActive]}
                  onPress={() => setActionType(t.id)}
                >
                  <Text style={s.actionChipIcon}>{t.icon}</Text>
                  <Text style={[s.actionChipLabel, actionType === t.id && s.actionChipLabelActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.actionDesc}>{activeTypeDef.description}</Text>

            {/* Arma / ataque (solo para acciones con tirada de ataque) */}
            {activeTypeDef.needsAttack && attackActions.length > 0 && (
              <>
                <Text style={s.sectionLabel}>ATAQUE</Text>
                {attackActions.map((a) => {
                  const eff = actionType === 'defensive'
                    ? { ...a, modifier: a.modifier - 4 }
                    : a;
                  const iterative =
                    actionType === 'full' ? (a.extraAttacks ?? []) : [];
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[s.weaponRow, selectedWeapon?.id === a.id && s.weaponRowActive]}
                      onPress={() => setSelectedWeapon(a)}
                    >
                      <Text style={s.weaponName}>{a.label}</Text>
                      <View style={s.weaponMods}>
                        <Text style={s.weaponMod}>
                          {eff.modifier >= 0 ? '+' : ''}{eff.modifier}
                        </Text>
                        {iterative.map((m, i) => (
                          <Text key={i} style={[s.weaponMod, s.weaponModExtra]}>
                            {m >= 0 ? '+' : ''}{m}
                          </Text>
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* Objetivo */}
            {availableTargets.length > 0 && (
              <>
                <Text style={s.sectionLabel}>OBJETIVO (OPCIONAL)</Text>
                <FlatList
                  data={availableTargets}
                  keyExtractor={(c) => c.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.targetList}
                  renderItem={({ item: c }) => {
                    const hpPct = c.hp_max > 0 ? c.hp_current / c.hp_max : 0;
                    const barColor =
                      hpPct > 0.5 ? '#34d399' : hpPct > 0.25 ? '#fbbf24' : '#f87171';
                    return (
                      <TouchableOpacity
                        style={[
                          s.targetChip,
                          selectedTarget?.id === c.id && s.targetChipActive,
                        ]}
                        onPress={() =>
                          setSelectedTarget(selectedTarget?.id === c.id ? null : c)
                        }
                      >
                        <Text style={s.targetName} numberOfLines={1}>{c.name}</Text>
                        <View style={s.targetHpBar}>
                          <View
                            style={[
                              s.targetHpFill,
                              { width: `${hpPct * 100}%` as unknown as number, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                        <Text style={s.targetHp}>{c.hp_current}/{c.hp_max}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}
          </ScrollView>

          {/* Botón Realizar */}
          <TouchableOpacity
            style={[
              s.rollBtn,
              !activeTypeDef.needsAttack && s.rollBtnAlt,
            ]}
            onPress={handleRoll}
          >
            <Text style={s.rollBtnText}>
              {activeTypeDef.needsAttack ? '🎲 Tirar' : '✅ Realizar acción'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#1a1535',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,58,237,0.2)',
  },
  headerTitle: { color: '#e2e8f0', fontSize: 17, fontWeight: '700' },
  closeBtn:   { color: '#64748b', fontSize: 20, paddingHorizontal: 4 },
  body:       { paddingHorizontal: 16, paddingTop: 12 },
  sectionLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 14,
  },

  // Tipo de acción
  actionRow: { marginBottom: 4 },
  actionChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(30,27,60,0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 80,
  },
  actionChipActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: '#f87171',
  },
  actionChipIcon:  { fontSize: 20, marginBottom: 4 },
  actionChipLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  actionChipLabelActive: { color: '#fca5a5' },
  actionDesc:  { color: '#64748b', fontSize: 12, fontStyle: 'italic', marginBottom: 4 },

  // Arma
  weaponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(30,27,60,0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  weaponRowActive: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  weaponName: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', flex: 1 },
  weaponMods: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  weaponMod:  {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  weaponModExtra: { color: '#a78bfa', backgroundColor: 'rgba(124,58,237,0.1)' },

  // Objetivo
  targetList: { paddingBottom: 6 },
  targetChip: {
    backgroundColor: 'rgba(30,27,60,0.8)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
    padding: 10,
    marginRight: 8,
    width: 110,
    gap: 4,
  },
  targetChipActive: {
    borderColor: '#f87171',
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  targetName:  { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  targetHpBar: {
    height: 4,
    backgroundColor: 'rgba(100,116,139,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  targetHpFill: { height: '100%', borderRadius: 2 },
  targetHp:     { color: '#94a3b8', fontSize: 11 },

  // Botón de tirada
  rollBtn: {
    margin: 16,
    backgroundColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  rollBtnAlt: {
    backgroundColor: 'rgba(124,58,237,0.3)',
    borderColor: '#a78bfa',
  },
  rollBtnText: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
});
