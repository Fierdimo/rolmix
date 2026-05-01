/**
 * DamageResolutionModal
 * ─────────────────────
 * Muestra al DM los resultados de tirada contra la CA del objetivo y
 * permite aplicar daño automáticamente o ignorarlo ataque a ataque.
 *
 * Props:
 *  visible         – si el modal está abierto
 *  attacker        – combatiente atacante
 *  attacks         – lista de ataques resueltos con su objetivo
 *  damageDie       – dado de daño del arma, p. ej. '1d8'  (puede ser undefined)
 *  damageMod       – modificador de daño ya calculado
 *  characterMap    – mapa id → Character para leer CA del objetivo
 *  onApplyDamage   – callback para aplicar delta HP a un combatiente
 *  onClose         – cierra el modal
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView,
} from 'react-native';
import { Combatant, Character } from '../../lib/types';
import { rollDie, getSystem, computeFinalStats } from '../../lib/systems';

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface ResolvedAttack {
  index: number;
  modifier: number;
  roll: { d20: number; modifier: number; total: number };
  target: Combatant | null;
}

type HitType = 'hit' | 'miss' | 'touch' | 'flatfoot';

interface AttackState {
  attack: ResolvedAttack;
  /** CA normal del objetivo (extraída del personaje). */
  ac: number;
  touchAc: number;
  ffAc: number;
  hitType: HitType | null;   // null = crítico / natural 20 ignorado, calculado abajo
  damageRoll: number | null; // null = no tirado aún
  damageTotal: number | null;
  applied: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAcValues(
  target: Combatant | null,
  characterMap: Record<string, Character>,
): { ac: number; touchAc: number; ffAc: number } {
  if (!target?.character_id) return { ac: 10, touchAc: 10, ffAc: 10 };
  const ch = characterMap[target.character_id];
  if (!ch) return { ac: 10, touchAc: 10, ffAc: 10 };
  const system = getSystem(ch.system_id);
  if (system) {
    const stats = computeFinalStats(system, ch.data as Record<string, unknown>);
    return {
      ac:      stats.ac      ?? 10,
      touchAc: stats.touch_ac ?? stats.ac ?? 10,
      ffAc:    stats.flat_footed_ac ?? stats.ac ?? 10,
    };
  }
  // Fallback para sistemas desconocidos
  const d = ch.data as Record<string, unknown>;
  const ac = Number(d.ac ?? 10);
  const touchAc = Number(d.touch_ac ?? d.touchAc ?? ac);
  const ffAc    = Number(d.flat_footed_ac ?? d.ffAc ?? ac);
  return { ac, touchAc, ffAc };
}

function computeHitType(
  total: number,
  d20: number,
  ac: number,
  touchAc: number,
  ffAc: number,
  attackTarget?: 'ac' | 'touch_ac' | 'ff_ac',
): HitType {
  if (d20 === 20) return 'hit';     // natural 20 siempre impacta
  if (d20 === 1)  return 'miss';    // natural 1 siempre falla
  // Para conjuros de toque: comparar solo contra CA de toque
  if (attackTarget === 'touch_ac') return total >= touchAc ? 'hit' : 'miss';
  if (attackTarget === 'ff_ac')    return total >= ffAc    ? 'hit' : 'miss';
  // Ataque normal: verificar contra CA normal, luego desprevenido, luego toque
  if (total >= ac) return 'hit';
  if (total >= ffAc) return 'flatfoot';
  if (total >= touchAc) return 'touch';
  return 'miss';
}

function hitLabel(ht: HitType): string {
  switch (ht) {
    case 'hit':      return '✅ Impacto';
    case 'touch':    return '👋 Toque';
    case 'flatfoot': return '😶 Desprevenido';
    case 'miss':     return '❌ Falla';
  }
}

function hitColor(ht: HitType): string {
  switch (ht) {
    case 'hit':      return '#059669';
    case 'touch':    return '#6d28d9';
    case 'flatfoot': return '#d97706';
    case 'miss':     return '#dc2626';
  }
}

// ── Componente ─────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  attacker: Combatant | null;
  attacks: ResolvedAttack[];
  damageDie?: string;
  damageMod?: number;
  characterMap: Record<string, Character>;
  onApplyDamage: (targetId: string, delta: number) => void;
  onClose: () => void;
  /** Para conjuros: contra qué CA se compara el ataque (modifica la lógica de impacto). */
  attackTarget?: 'ac' | 'touch_ac' | 'ff_ac';
  /** Para conjuros: CD de salvación. */
  saveDC?: number;
  /** Para conjuros: tipo de tirada de salvación. */
  saveType?: 'fort' | 'ref' | 'will';
  /** Para conjuros: descripción del efecto. */
  effectLabel?: string;
}

export default function DamageResolutionModal({
  visible,
  attacker,
  attacks,
  damageDie,
  damageMod = 0,
  characterMap,
  onApplyDamage,
  onClose,
  attackTarget,
  saveDC,
  saveType,
  effectLabel,
}: Props) {
  const [states, setStates] = useState<AttackState[]>(() => buildStates());

  function buildStates(): AttackState[] {
    return attacks.map((atk) => {
      const { ac, touchAc, ffAc } = getAcValues(atk.target, characterMap);
      const hitType = atk.target
        ? computeHitType(atk.roll.total, atk.roll.d20, ac, touchAc, ffAc, attackTarget)
        : null;
      return { attack: atk, ac, touchAc, ffAc, hitType, damageRoll: null, damageTotal: null, applied: false };
    });
  }

  // Re-build states when attacks change
  React.useEffect(() => {
    setStates(buildStates());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacks, visible]);

  const rollDamage = useCallback((idx: number) => {
    // Parsear dado posiblemente con modificador embebido, ej. "1d6+2", "2d8-1"
    let dieStr = damageDie ?? '';
    let embeddedMod = 0;
    const embeddedMatch = dieStr.match(/^(\d+d\d+)\s*([+\-]\s*\d+)$/i);
    if (embeddedMatch) {
      dieStr = embeddedMatch[1];
      embeddedMod = parseInt(embeddedMatch[2].replace(/\s/g, ''), 10);
    }
    const dmgRoll = dieStr ? rollDie(dieStr) : 0;
    const total = Math.max(1, dmgRoll + damageMod + embeddedMod);
    setStates((prev) => prev.map((s, i) =>
      i === idx ? { ...s, damageRoll: dmgRoll, damageTotal: total } : s,
    ));
  }, [damageDie, damageMod]);

  const applyDamage = useCallback((idx: number) => {
    const st = states[idx];
    if (!st || !st.attack.target || st.damageTotal === null) return;
    onApplyDamage(st.attack.target.id, -st.damageTotal);
    setStates((prev) => prev.map((s, i) => i === idx ? { ...s, applied: true } : s));
  }, [states, onApplyDamage]);

  const applyManual = useCallback((idx: number) => {
    const st = states[idx];
    if (!st || !st.attack.target) return;
    // Marca como aplicado manualmente (el DM lo gestionará fuera)
    setStates((prev) => prev.map((s, i) => i === idx ? { ...s, applied: true } : s));
  }, [states]);

  if (!attacker) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.headerTitle}>🎯 Resolución · {attacker.name}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {/* Info de conjuro: CD de salvación y efecto */}
            {(saveDC != null || effectLabel) && (
              <View style={s.spellInfoCard}>
                {saveDC != null && (
                  <Text style={s.spellInfoText}>
                    🔮 CD {saveDC} de {saveType === 'fort' ? 'Fortaleza' : saveType === 'ref' ? 'Reflejos' : saveType === 'will' ? 'Voluntad' : 'Salvación'}
                    {attackTarget === 'touch_ac' ? '  ·  Ataque de toque' : attackTarget === 'ff_ac' ? '  ·  vs CA desprevenido' : ''}
                  </Text>
                )}
                {effectLabel && (
                  <Text style={s.spellEffectText}>Efecto: {effectLabel}</Text>
                )}
              </View>
            )}
            {states.map((st, i) => {
              const { attack, hitType, damageRoll, damageTotal, applied } = st;
              const hasTarget = !!attack.target;
              const isHit = hitType === 'hit' || hitType === 'touch' || hitType === 'flatfoot';

              return (
                <View key={i} style={s.attackCard}>
                  {/* Cabecera del ataque */}
                  <View style={s.attackHeader}>
                    <Text style={s.attackIdx}>Ataque {i + 1}</Text>
                    <Text style={s.attackRoll}>
                      🎲 {attack.roll.d20} {attack.modifier >= 0 ? '+' : ''}{attack.modifier} = <Text style={s.attackTotal}>{attack.roll.total}</Text>
                    </Text>
                  </View>

                  {/* Objetivo y CA */}
                  {hasTarget && (
                    <View style={s.acRow}>
                      <Text style={s.targetLabel}>→ {attack.target!.name}</Text>
                      <Text style={s.acLabel}>CA {st.ac}  Toque {st.touchAc}  FF {st.ffAc}</Text>
                    </View>
                  )}

                  {/* Resultado del impacto */}
                  {hasTarget && hitType && (
                    <View style={[s.hitBadge, { borderColor: hitColor(hitType), backgroundColor: hitColor(hitType) + '22' }]}>
                      <Text style={[s.hitText, { color: hitColor(hitType) }]}>{hitLabel(hitType)}</Text>
                    </View>
                  )}

                  {!hasTarget && (
                    <Text style={s.noTarget}>Sin objetivo asignado</Text>
                  )}

                  {/* Daño (solo en impactos con objetivo y dado de daño) */}
                  {hasTarget && isHit && !applied && (
                    <View style={s.damageRow}>
                      {damageDie ? (
                        <>
                          {damageRoll === null ? (
                            <TouchableOpacity style={s.dmgBtn} onPress={() => rollDamage(i)}>
                              <Text style={s.dmgBtnText}>🎲 Tirar daño ({damageDie}{damageMod !== 0 ? ` ${damageMod >= 0 ? '+' : ''}${damageMod}` : ''})</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={s.dmgResult}>
                              <Text style={s.dmgResultText}>
                                {damageRoll}{damageMod !== 0 ? ` ${damageMod >= 0 ? '+' : ''}${damageMod}` : ''} = <Text style={s.dmgTotal}>{damageTotal}</Text> daño
                              </Text>
                              <View style={s.dmgActions}>
                                <TouchableOpacity style={s.applyBtn} onPress={() => applyDamage(i)}>
                                  <Text style={s.applyBtnText}>✅ Aplicar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.skipBtn} onPress={() => applyManual(i)}>
                                  <Text style={s.skipBtnText}>✏️ Manual</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={s.dmgActions}>
                          <Text style={s.noDie}>Sin dado de daño. </Text>
                          <TouchableOpacity style={s.skipBtn} onPress={() => applyManual(i)}>
                            <Text style={s.skipBtnText}>✏️ Aplicar manual</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {applied && (
                    <Text style={s.appliedBadge}>✔ Daño aplicado</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={s.closeFooterBtn} onPress={onClose}>
            <Text style={s.closeFooterText}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,12,41,0.50)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
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
  headerTitle: { color: '#1e1b3a', fontSize: 16, fontWeight: '700' },
  closeBtn: { color: '#9ca3af', fontSize: 20, paddingHorizontal: 4 },
  body: { paddingHorizontal: 14, paddingTop: 10 },

  attackCard: {
    backgroundColor: '#faf9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.15)',
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  attackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attackIdx: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  attackRoll: { color: '#6b7280', fontSize: 13 },
  attackTotal: { color: '#1e1b3a', fontWeight: '800' },

  acRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  targetLabel: { color: '#6d28d9', fontSize: 13, fontWeight: '600' },
  acLabel: { color: '#9ca3af', fontSize: 11 },

  hitBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hitText: { fontSize: 13, fontWeight: '700' },

  noTarget: { color: '#6b7280', fontSize: 12, fontStyle: 'italic' },

  damageRow: { marginTop: 4 },
  dmgBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  dmgBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  dmgResult: { gap: 8 },
  dmgResultText: { color: '#6b7280', fontSize: 13 },
  dmgTotal: { color: '#dc2626', fontWeight: '800', fontSize: 16 },

  dmgActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  applyBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  applyBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  skipBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(107,114,128,0.30)',
  },
  skipBtnText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  noDie: { color: '#9ca3af', fontSize: 12 },

  appliedBadge: { color: '#059669', fontSize: 12, fontStyle: 'italic' },

  spellInfoCard: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    padding: 10,
    marginBottom: 10,
    gap: 4,
  },
  spellInfoText: { color: '#5b21b6', fontSize: 13, fontWeight: '600' },
  spellEffectText: { color: '#6b7280', fontSize: 12, fontStyle: 'italic' },

  closeFooterBtn: {
    margin: 14,
    backgroundColor: '#6d28d9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  closeFooterText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
