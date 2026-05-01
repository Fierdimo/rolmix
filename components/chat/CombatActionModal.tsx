import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  Modal, StyleSheet, FlatList, TextInput,
} from 'react-native';
import { Combatant, Character, CombatRoll } from '../../lib/types';
import { RollableAction } from '../../lib/systems/types';
import { computeFinalActions } from '../../lib/systems/aggregate';
import { getSystem, rollDie } from '../../lib/systems';
import type { CharacterData, SpellEntry } from '../../lib/systems/types';

// ── Tipos de acción de combate (D&D 3.5) ──────────────────────────────────────

export type CombatActionType = 'standard' | 'full' | 'total_defense' | 'defensive' | 'def_cast' | 'delay' | 'cast';

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
  {
    id: 'delay',
    label: 'Retrasarse',
    icon: '⏸️',
    description: 'Pospones tu turno. Elige después de quién actúas en la iniciativa.',
    needsAttack: false,
  },
  {
    id: 'cast',
    label: 'Conjuro',
    icon: '🔮',
    description: 'Lanza un conjuro de tu lista. Ataques de toque tiran d20; conjuros de salvación anuncian la CD.',
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
  /** Ataques individuales con objetivos independientes (ataque completo). */
  perAttack?: { index: number; modifier: number; roll: CombatRoll; target: Combatant | null }[];
  /** Dado de daño del arma, p. ej. '1d8'. */
  damageDie?: string;
  /** Modificador de daño calculado (Fuerza + mejoras). */
  damageMod?: number;
  /** Bono de CA esquiva temporal (defensa total o lucha defensiva). */
  acBonus?: number;
  /** Para conjuros: contra qué CA se compara el ataque. */
  attackTarget?: 'ac' | 'touch_ac' | 'ff_ac';
  /** Para conjuros: CD de salvación. */
  saveDC?: number;
  /** Para conjuros: tipo de tirada de salvación. */
  saveType?: 'fort' | 'ref' | 'will';
  /** Para conjuros: descripción del efecto. */
  effectLabel?: string;
  /** Para conjuros: nombre del conjuro lanzado (para descontar del tracker). */
  castSpellName?: string;
  /** Para conjuros: nivel del espacio consumido. */
  castSpellLevel?: number;
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
  const [selectedSpell, setSelectedSpell] = useState<SpellEntry | null>(null);
  // Para ataque completo con múltiples ataques: objetivo por índice de ataque
  // Para ataque simple / delay: solo usamos el índice 0
  const [targetsByAttack, setTargetsByAttack] = useState<Record<number, Combatant | null>>({});
  // Dado de daño manual: para cuando el ataque no tiene damageDie (monstruos, ataques base)
  const [manualDamageDie, setManualDamageDie] = useState('');

  // Acciones de combate y de conjuro del personaje activo
  const { attackActions, spellActions } = useMemo(() => {
    if (!character) return { attackActions: [] as RollableAction[], spellActions: [] as RollableAction[] };
    const sys = getSystem(character.system_id);
    if (!sys) return { attackActions: [] as RollableAction[], spellActions: [] as RollableAction[] };
    const allActions = computeFinalActions(sys, character.data as CharacterData);
    return {
      attackActions: allActions.filter(
        (a) =>
          a.group === 'Combate' &&
          (a.id.startsWith('weapon_') ||
            a.id.startsWith('monster_atk_') ||
            a.id === 'attack_melee' ||
            a.id === 'attack_ranged'),
      ),
      spellActions: allActions.filter(
        (a) => a.group === 'Conjuros' && a.id.startsWith('spell_'),
      ),
    };
  }, [character]);

  // Todos los conjuros del grimorio (para el picker de 'cast')
  const castSpells = useMemo<SpellEntry[]>(() => {
    if (!character) return [];
    const d = character.data as CharacterData;
    return Array.isArray(d.spells) ? (d.spells as SpellEntry[]) : [];
  }, [character]);

  // Acción precalculada del conjuro seleccionado (si tiene metadatos de combate)
  const selectedSpellAction = useMemo<RollableAction | null>(() => {
    if (!selectedSpell) return null;
    return spellActions.find((a) => a.id === `spell_${selectedSpell.id}`) ?? null;
  }, [selectedSpell, spellActions]);

  // El conjuro seleccionado requiere tirada de ataque si tiene attackTarget
  const castNeedsRoll = !!selectedSpellAction?.attackTarget;

  const availableTargets = combatants.filter(
    (c) => !c.is_defeated && c.id !== attacker?.id,
  );

  const activeTypeDef = ACTION_TYPES.find((t) => t.id === actionType)!;

  // Lista de modificadores de ataque (simple = 1, completo = todos)
  const effectiveAction = useMemo<RollableAction | null>(() => {
    const base = selectedWeapon ?? attackActions[0] ?? null;
    if (!base) return null;
    if (actionType === 'defensive') {
      return { ...base, modifier: base.modifier - 4, extraAttacks: undefined };
    }
    return base;
  }, [selectedWeapon, attackActions, actionType]);

  const attackModifiers: number[] = useMemo(() => {
    if (!effectiveAction) return [];
    if (actionType === 'full') {
      return [effectiveAction.modifier, ...(effectiveAction.extraAttacks ?? [])];
    }
    return [effectiveAction.modifier];
  }, [effectiveAction, actionType]);

  // Reset per-attack targets and spell selection when action type changes
  const prevActionType = useRef(actionType);
  if (prevActionType.current !== actionType) {
    prevActionType.current = actionType;
    setTargetsByAttack({});
    setSelectedSpell(null);
  }

  function setAttackTarget(attackIdx: number, target: Combatant | null) {
    setTargetsByAttack((prev) => ({ ...prev, [attackIdx]: target }));
  }

  function handleRoll() {
    if (!attacker) return;
    const def = activeTypeDef;

    // Lanzar conjuro
    if (actionType === 'cast') {
      if (!selectedSpell) return; // necesita conjuro seleccionado
      const target = targetsByAttack[0] ?? null;

      if (castNeedsRoll && selectedSpellAction) {
        // Conjuro de ataque (toque / distancia): tirar d20
        const mod = selectedSpellAction.modifier;
        const d20 = rollDie('d20');
        const roll: CombatRoll = { d20, modifier: mod, total: d20 + mod };
        onResult({
          attacker,
          target,
          actionType: 'cast',
          actionLabel: 'Conjuro',
          weaponLabel: selectedSpell.name,
          rolls: [roll],
          perAttack: [{ index: 0, modifier: mod, roll, target }],
          damageDie: selectedSpellAction.damageDie,
          damageMod: 0,
          attackTarget: selectedSpellAction.attackTarget,
          saveDC: selectedSpellAction.saveDC,
          saveType: selectedSpellAction.saveType,
          effectLabel: selectedSpellAction.effectLabel,
          castSpellName: selectedSpell.name,
          castSpellLevel: selectedSpell.level,
        });
      } else {
        // Conjuro de salvación o utilidad: anuncio sin tirada de ataque
        onResult({
          attacker,
          target,
          actionType: 'cast',
          actionLabel: 'Conjuro',
          weaponLabel: selectedSpell.name,
          rolls: [],
          saveDC: selectedSpellAction?.saveDC,
          saveType: selectedSpellAction?.saveType,
          effectLabel: selectedSpellAction?.effectLabel ?? selectedSpell.effect_label,
          castSpellName: selectedSpell.name,
          castSpellLevel: selectedSpell.level,
        });
      }
      onClose();
      return;
    }

    // Retrasarse
    if (actionType === 'delay') {
      onResult({
        attacker,
        target: targetsByAttack[0] ?? null,
        actionType: 'delay',
        actionLabel: def.label,
        weaponLabel: '',
        rolls: [],
      });
      onClose();
      return;
    }

    // Acciones sin tirada de ataque
    if (!def.needsAttack) {
      let rolls: CombatRoll[] = [];
      let weaponLabel = '';
      if (actionType === 'def_cast') {
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
        target: targetsByAttack[0] ?? null,
        actionType,
        actionLabel: def.label,
        weaponLabel,
        rolls,
        acBonus: actionType === 'total_defense' ? 4 : undefined,
      });
      onClose();
      return;
    }

    const action = effectiveAction;
    if (!action) return;

    // Un ataque por modificador, cada uno con su propio objetivo
    const perAttack = attackModifiers.map((mod, i) => {
      const d20 = rollDie('d20');
      return {
        index: i,
        modifier: mod,
        roll: { d20, modifier: mod, total: d20 + mod },
        target: targetsByAttack[i] ?? targetsByAttack[0] ?? null,
      };
    });

    onResult({
      attacker,
      target: perAttack[0]?.target ?? null,
      actionType,
      actionLabel: def.label,
      weaponLabel: action.label,
      rolls: perAttack.map((p) => p.roll),
      perAttack,
      damageDie: action.damageDie || (manualDamageDie.trim() || undefined),
      damageMod: action.damageMod,
      acBonus: actionType === 'defensive' ? 2 : undefined,
      attackTarget: action.attackTarget,
      saveDC: action.saveDC,
      saveType: action.saveType,
      effectLabel: action.effectLabel,
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

            {/* Picker de conjuros (acción 'cast') */}
            {actionType === 'cast' && (
              <>
                <Text style={s.sectionLabel}>CONJURO A LANZAR</Text>
                {castSpells.length === 0 ? (
                  <Text style={s.emptyHint}>Sin conjuros en el grimorio. Añádelos en el editor de personaje (pestaña Conjuros).</Text>
                ) : (
                  castSpells.map((sp) => {
                    const action = spellActions.find((a) => a.id === `spell_${sp.id}`);
                    const isSelected = selectedSpell?.id === sp.id;
                    const attackTargetLabel =
                      action?.attackTarget === 'touch_ac' ? 'Toque' :
                      action?.attackTarget === 'ff_ac' ? 'Desprevenido' :
                      action?.attackTarget === 'ac' ? 'CA normal' : null;
                    return (
                      <TouchableOpacity
                        key={sp.id}
                        style={[s.weaponRow, isSelected && s.weaponRowActive]}
                        onPress={() => { setSelectedSpell(sp); setTargetsByAttack({}); }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <Text style={s.weaponName}>{sp.name}</Text>
                            <View style={s.spellLvlBadge}>
                              <Text style={s.spellLvlBadgeText}>{sp.level === 0 ? 'Truco' : `Nv ${sp.level}`}</Text>
                            </View>
                            {attackTargetLabel ? (
                              <View style={s.spellBadge}>
                                <Text style={s.spellBadgeText}>⚔ {attackTargetLabel}</Text>
                              </View>
                            ) : action?.saveType ? (
                              <View style={[s.spellBadge, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                                <Text style={[s.spellBadgeText, { color: '#d97706' }]}>🛡 Salvación</Text>
                              </View>
                            ) : null}
                          </View>
                          {action?.damageDie && (
                            <Text style={s.weaponDamage}>Daño: {action.damageDie}</Text>
                          )}
                          {action?.saveDC != null && (
                            <Text style={s.spellSaveInfo}>
                              CD {action.saveDC} · {action.saveType === 'fort' ? 'Fortaleza' : action.saveType === 'ref' ? 'Reflejos' : 'Voluntad'}
                              {action.effectLabel ? ` · ${action.effectLabel}` : ''}
                            </Text>
                          )}
                          {!action && sp.effect_label ? (
                            <Text style={s.spellSaveInfo}>{sp.effect_label}</Text>
                          ) : null}
                        </View>
                        <View style={s.weaponMods}>
                          {action?.attackTarget ? (
                            <Text style={s.weaponMod}>{action.modifier >= 0 ? '+' : ''}{action.modifier}</Text>
                          ) : (
                            <Text style={[s.weaponMod, { color: '#5b21b6', backgroundColor: 'rgba(139,92,246,0.1)', fontSize: 16 }]}>🔮</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}

            {/* Objetivo para conjuro de ataque */}
            {actionType === 'cast' && castNeedsRoll && availableTargets.length > 0 && (
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
                    const barColor = hpPct > 0.5 ? '#059669' : hpPct > 0.25 ? '#d97706' : '#dc2626';
                    const selected = targetsByAttack[0] ?? null;
                    return (
                      <TouchableOpacity
                        style={[s.targetChip, selected?.id === c.id && s.targetChipActive]}
                        onPress={() => setAttackTarget(0, selected?.id === c.id ? null : c)}
                      >
                        <Text style={s.targetName} numberOfLines={1}>{c.name}</Text>
                        <View style={s.targetHpBar}>
                          <View style={[s.targetHpFill, { width: `${hpPct * 100}%` as unknown as number, backgroundColor: barColor }]} />
                        </View>
                        <Text style={s.targetHp}>{c.hp_current}/{c.hp_max}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </>
            )}

            {/* Arma / ataque */}
            {activeTypeDef.needsAttack && attackActions.length > 0 && (
              <>
                <Text style={s.sectionLabel}>ATAQUE / CONJURO</Text>
                {attackActions.map((a) => {
                  const eff = actionType === 'defensive'
                    ? { ...a, modifier: a.modifier - 4 }
                    : a;
                  const iterative = actionType === 'full' ? (a.extraAttacks ?? []) : [];
                  const isSpell = a.id.startsWith('spell_');
                  const attackTargetLabel =
                    a.attackTarget === 'touch_ac' ? 'Toque' :
                    a.attackTarget === 'ff_ac' ? 'Desprevenido' :
                    a.attackTarget === 'ac' ? 'CA' : null;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[s.weaponRow, selectedWeapon?.id === a.id && s.weaponRowActive]}
                      onPress={() => { setSelectedWeapon(a); setTargetsByAttack({}); setManualDamageDie(''); }}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                          <Text style={s.weaponName}>{a.label}</Text>
                          {isSpell && attackTargetLabel && (
                            <View style={s.spellBadge}>
                              <Text style={s.spellBadgeText}>vs {attackTargetLabel}</Text>
                            </View>
                          )}
                          {isSpell && !a.attackTarget && a.saveType && (
                            <View style={[s.spellBadge, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                              <Text style={[s.spellBadgeText, { color: '#d97706' }]}>Solo salvación</Text>
                            </View>
                          )}
                        </View>
                        {a.damageDie && (
                          <Text style={s.weaponDamage}>Daño: {a.damageDie}{a.damageMod !== undefined && a.damageMod !== 0 ? ` ${a.damageMod >= 0 ? '+' : ''}${a.damageMod}` : ''}</Text>
                        )}
                        {isSpell && a.saveDC != null && (
                          <Text style={s.spellSaveInfo}>
                            CD {a.saveDC} · {a.saveType === 'fort' ? 'Fort' : a.saveType === 'ref' ? 'Ref' : a.saveType === 'will' ? 'Vol' : ''}
                            {a.effectLabel ? ` · ${a.effectLabel}` : ''}
                          </Text>
                        )}
                      </View>
                      <View style={s.weaponMods}>
                        {a.attackTarget ? (
                          <>
                            <Text style={s.weaponMod}>
                              {eff.modifier >= 0 ? '+' : ''}{eff.modifier}
                            </Text>
                            {iterative.map((m, i) => (
                              <Text key={i} style={[s.weaponMod, s.weaponModExtra]}>
                                {m >= 0 ? '+' : ''}{m}
                              </Text>
                            ))}
                          </>
                        ) : isSpell ? (
                          <Text style={[s.weaponMod, { color: '#d97706', fontSize: 11 }]}>🔮</Text>
                        ) : (
                          <>
                            <Text style={s.weaponMod}>
                              {eff.modifier >= 0 ? '+' : ''}{eff.modifier}
                            </Text>
                            {iterative.map((m, i) => (
                              <Text key={i} style={[s.weaponMod, s.weaponModExtra]}>
                                {m >= 0 ? '+' : ''}{m}
                              </Text>
                            ))}
                          </>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* Dado de daño manual: aparece cuando el ataque no tiene damageDie precargado */}
            {activeTypeDef.needsAttack && !effectiveAction?.damageDie && (
              <>
                <Text style={s.sectionLabel}>DADO DE DAÑO</Text>
                <View style={s.manualDieRow}>
                  <TextInput
                    style={s.manualDieInput}
                    value={manualDamageDie}
                    onChangeText={setManualDamageDie}
                    placeholder="ej. 1d6, 2d8, 1d4+2…"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={s.manualDieHint}>Opcional · se usará en resolución de daño</Text>
                </View>
              </>
            )}

            {/* Objetivo(s) por ataque */}
            {availableTargets.length > 0 && activeTypeDef.needsAttack && attackModifiers.length > 1 && (
              <>
                <Text style={s.sectionLabel}>OBJETIVOS POR ATAQUE</Text>
                {attackModifiers.map((mod, i) => {
                  const selected = targetsByAttack[i] ?? null;
                  return (
                    <View key={i} style={s.perAttackRow}>
                      <Text style={s.perAttackLabel}>
                        Ataque {i + 1} ({mod >= 0 ? '+' : ''}{mod})
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.perAttackTargets}>
                        {availableTargets.map((c) => {
                          const hpPct = c.hp_max > 0 ? c.hp_current / c.hp_max : 0;
                          const barColor = hpPct > 0.5 ? '#059669' : hpPct > 0.25 ? '#d97706' : '#dc2626';
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[s.targetChip, selected?.id === c.id && s.targetChipActive]}
                              onPress={() => setAttackTarget(i, selected?.id === c.id ? null : c)}
                            >
                              <Text style={s.targetName} numberOfLines={1}>{c.name}</Text>
                              <View style={s.targetHpBar}>
                                <View style={[s.targetHpFill, { width: `${hpPct * 100}%` as unknown as number, backgroundColor: barColor }]} />
                              </View>
                              <Text style={s.targetHp}>{c.hp_current}/{c.hp_max}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}
              </>
            )}

            {/* Objetivo único (ataque simple / delay / acciones sin ataque) */}
            {availableTargets.length > 0 && (attackModifiers.length <= 1 || !activeTypeDef.needsAttack) && (
              <>
                <Text style={s.sectionLabel}>
                  {actionType === 'delay' ? '¿DESPUÉS DE QUIÉN ACTÚAS?' : 'OBJETIVO (OPCIONAL)'}
                </Text>
                <FlatList
                  data={availableTargets}
                  keyExtractor={(c) => c.id}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.targetList}
                  renderItem={({ item: c }) => {
                    const hpPct = c.hp_max > 0 ? c.hp_current / c.hp_max : 0;
                    const barColor = hpPct > 0.5 ? '#059669' : hpPct > 0.25 ? '#d97706' : '#dc2626';
                    const selected = targetsByAttack[0] ?? null;
                    return (
                      <TouchableOpacity
                        style={[s.targetChip, selected?.id === c.id && s.targetChipActive]}
                        onPress={() => setAttackTarget(0, selected?.id === c.id ? null : c)}
                      >
                        <Text style={s.targetName} numberOfLines={1}>{c.name}</Text>
                        <View style={s.targetHpBar}>
                          <View style={[s.targetHpFill, { width: `${hpPct * 100}%` as unknown as number, backgroundColor: barColor }]} />
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
              actionType === 'delay' && s.rollBtnDelay,
              actionType === 'cast' && !selectedSpell && s.rollBtnDisabled,
            ]}
            onPress={handleRoll}
            disabled={actionType === 'cast' && !selectedSpell}
          >
            <Text style={s.rollBtnText}>
              {actionType === 'delay'
                ? '⏸️ Retrasarse'
                : actionType === 'cast'
                  ? castNeedsRoll ? '🎲 Tirar ataque' : '🔮 Lanzar conjuro'
                  : activeTypeDef.needsAttack
                  ? '🎲 Tirar'
                  : '✅ Realizar acción'}
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
    backgroundColor: 'rgba(15,12,41,0.45)',
    justifyContent: 'flex-end',
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.15)',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(109,40,217,0.12)',
  },
  headerTitle: { color: '#1e1b3a', fontSize: 17, fontWeight: '700' },
  closeBtn:   { color: '#9ca3af', fontSize: 20, paddingHorizontal: 4 },
  body:       { paddingHorizontal: 16, paddingTop: 12 },
  sectionLabel: {
    color: '#9ca3af',
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
    backgroundColor: '#faf9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 80,
  },
  actionChipActive: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  actionChipIcon:  { fontSize: 20, marginBottom: 4 },
  actionChipLabel: { color: '#6b7280', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  actionChipLabelActive: { color: '#dc2626' },
  actionDesc:  { color: '#9ca3af', fontSize: 12, fontStyle: 'italic', marginBottom: 4 },

  // Arma
  weaponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#faf9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
  },
  weaponRowActive: {
    borderColor: '#6d28d9',
    backgroundColor: 'rgba(109,40,217,0.10)',
  },
  weaponName: { color: '#1e1b3a', fontSize: 14, fontWeight: '600', flex: 1 },
  weaponDamage: { color: '#6b7280', fontSize: 11, marginTop: 2 },
  weaponMods: { flexDirection: 'row', gap: 6, alignItems: 'center' },

  // Badges de conjuro
  spellBadge: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  spellBadgeText: { color: '#6d28d9', fontSize: 10, fontWeight: '700' },
  spellSaveInfo: { color: '#d97706', fontSize: 11, marginTop: 2 },

  // Dado de daño manual
  manualDieRow: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 6,
    gap: 4,
  },
  manualDieInput: {
    color: '#92400e',
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 0,
  },
  manualDieHint: {
    color: '#6b7280',
    fontSize: 11,
  },
  weaponMod:  {
    color: '#059669',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#d1fae5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  weaponModExtra: { color: '#6d28d9', backgroundColor: '#ede9fe' },

  // Objetivo
  targetList: { paddingBottom: 6 },

  // Ataques por objetivo (ataque completo)
  perAttackRow: {
    marginBottom: 10,
  },
  perAttackLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  perAttackTargets: { marginBottom: 2 },

  targetChip: {
    backgroundColor: '#faf9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.15)',
    padding: 10,
    marginRight: 8,
    width: 110,
    gap: 4,
  },
  targetChipActive: {
    borderColor: '#dc2626',
    backgroundColor: '#fee2e2',
  },
  targetName:  { color: '#1e1b3a', fontSize: 12, fontWeight: '600' },
  targetHpBar: {
    height: 4,
    backgroundColor: 'rgba(100,116,139,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  targetHpFill: { height: '100%', borderRadius: 2 },
  targetHp:     { color: '#6b7280', fontSize: 11 },

  // Botón de tirada
  rollBtn: {
    margin: 16,
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 6,
    elevation: 4,
  },
  rollBtnAlt: {
    backgroundColor: '#6d28d9',
    shadowColor: '#6d28d9',
  },
  rollBtnDelay: {
    backgroundColor: '#d97706',
    shadowColor: '#d97706',
  },
  rollBtnDisabled: {
    backgroundColor: '#e5e7eb',
    shadowOpacity: 0,
    elevation: 0,
  },
  emptyHint: { color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  spellLvlBadge: {
    backgroundColor: 'rgba(109,40,217,0.12)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  spellLvlBadgeText: { color: '#6d28d9', fontSize: 10, fontWeight: '700' },
  rollBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
