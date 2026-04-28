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
import { rollDie } from '../../lib/systems';

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
  const d = ch.data as Record<string, unknown>;
  const ac = Number(d.ac ?? 10);
  // touch_ac y flat_footed_ac opcionales (el personaje puede no tenerlos calculados)
  const touchAc = Number(d.touch_ac ?? d.touchAc ?? Math.max(10, ac - Number(d.armor_bonus ?? 0) - Number(d.shield_bonus ?? 0) - Number(d.natural_armor ?? 0)));
  const ffAc    = Number(d.flat_footed_ac ?? d.ffAc ?? Math.max(10, ac - Number(d.dex_mod ?? 0)));
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
    case 'hit':      return '#34d399';
    case 'touch':    return '#a78bfa';
    case 'flatfoot': return '#fbbf24';
    case 'miss':     return '#f87171';
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#1a1535',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
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
  headerTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  closeBtn: { color: '#64748b', fontSize: 20, paddingHorizontal: 4 },
  body: { paddingHorizontal: 14, paddingTop: 10 },

  attackCard: {
    backgroundColor: 'rgba(30,27,60,0.8)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.2)',
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  attackHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  attackIdx: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  attackRoll: { color: '#94a3b8', fontSize: 13 },
  attackTotal: { color: '#e2e8f0', fontWeight: '800' },

  acRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  targetLabel: { color: '#a78bfa', fontSize: 13, fontWeight: '600' },
  acLabel: { color: '#64748b', fontSize: 11 },

  hitBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  hitText: { fontSize: 13, fontWeight: '700' },

  noTarget: { color: '#475569', fontSize: 12, fontStyle: 'italic' },

  damageRow: { marginTop: 4 },
  dmgBtn: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f87171',
  },
  dmgBtnText: { color: '#fca5a5', fontSize: 13, fontWeight: '600' },

  dmgResult: { gap: 8 },
  dmgResultText: { color: '#94a3b8', fontSize: 13 },
  dmgTotal: { color: '#f87171', fontWeight: '800', fontSize: 16 },

  dmgActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  applyBtn: {
    backgroundColor: 'rgba(52,211,153,0.2)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#34d399',
  },
  applyBtnText: { color: '#34d399', fontSize: 12, fontWeight: '700' },
  skipBtn: {
    backgroundColor: 'rgba(100,116,139,0.2)',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#475569',
  },
  skipBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  noDie: { color: '#64748b', fontSize: 12 },

  appliedBadge: { color: '#34d399', fontSize: 12, fontStyle: 'italic' },

  spellInfoCard: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    padding: 10,
    marginBottom: 10,
    gap: 4,
  },
  spellInfoText: { color: '#c4b5fd', fontSize: 13, fontWeight: '600' },
  spellEffectText: { color: '#94a3b8', fontSize: 12, fontStyle: 'italic' },

  closeFooterBtn: {
    margin: 14,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  closeFooterText: { color: '#a78bfa', fontSize: 15, fontWeight: '600' },
});
