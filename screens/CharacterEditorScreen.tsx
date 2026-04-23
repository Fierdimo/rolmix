import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Alert, Modal, Switch,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Character } from '../lib/types';
import { getSystem, resolveAction, computeFinalActions, computeFinalStats, aggregateClassGrants } from '../lib/systems';
import {
  FieldDef, RollableAction, ClassEntry, EquipmentItem, InventoryItem, SpellEntry, BonusEffect, FeatItem, SkillEntry,
} from '../lib/systems/types';
import { getCatalog, CatalogSpell, CatalogEquipment, CatalogFeat, CatalogSkill } from '../lib/catalog';
import { RootStackParamList } from '../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CharacterEditor'>;
  route: RouteProp<RootStackParamList, 'CharacterEditor'>;
};

type Tab = 'stats' | 'classes' | 'equipment' | 'inventory' | 'spells' | 'feats' | 'skills' | 'rolls';

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function CharacterEditorScreen({ navigation, route }: Props) {
  const { characterId } = route.params;
  const [character, setCharacter] = useState<Character | null>(null);
  const [name, setName] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('stats');

  const system = useMemo(() => character ? getSystem(character.system_id) : null, [character]);

  const fetch = useCallback(async () => {
    const { data: row, error } = await supabase
      .from('characters').select('*').eq('id', characterId).single();
    if (error || !row) { Alert.alert('Error', error?.message ?? 'No encontrado'); navigation.goBack(); return; }
    setCharacter(row);
    setName(row.name);
    setData(row.data ?? {});
    setLoading(false);
  }, [characterId, navigation]);

  useEffect(() => { fetch(); }, [fetch]);

  // Refs siempre con los últimos valores para usarse desde el listener de back.
  const latest = useRef({ name, data, dirty });
  useEffect(() => { latest.current = { name, data, dirty }; }, [name, data, dirty]);

  function setField(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const persist = useCallback(async (n: string, d: Record<string, unknown>) => {
    const { error } = await supabase
      .from('characters')
      .update({ name: n.trim() || 'Sin nombre', data: d })
      .eq('id', characterId);
    return error;
  }, [characterId]);

  async function save() {
    setSaving(true);
    const error = await persist(name, data);
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setDirty(false);
  }

  // Guardado automático al salir de la pantalla (back, gesto, etc.).
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const { name: n, data: d, dirty: isDirty } = latest.current;
      if (!isDirty) return;
      e.preventDefault();
      (async () => {
        const error = await persist(n, d);
        if (error) {
          Alert.alert('Error al guardar', error.message, [
            { text: 'Salir sin guardar', style: 'destructive', onPress: () => {
              latest.current.dirty = false;
              navigation.dispatch(e.data.action);
            } },
            { text: 'Reintentar', style: 'cancel' },
          ]);
          return;
        }
        latest.current.dirty = false;
        navigation.dispatch(e.data.action);
      })();
    });
    return unsub;
  }, [navigation, persist]);

  const finalStats = useMemo(() => system ? computeFinalStats(system, data) : {}, [system, data]);
  const finalActions: RollableAction[] = useMemo(() => system ? computeFinalActions(system, data) : [], [system, data]);
  const classFeatures = useMemo(() => system ? (aggregateClassGrants(system, data).features ?? []) : [], [system, data]);

  function previewRoll(action: RollableAction) {
    const r = resolveAction(action);
    Alert.alert(action.label,
      `🎲 ${r.die}: ${r.result}` +
      (r.modifier !== 0 ? ` ${r.modifier > 0 ? '+' : ''}${r.modifier}` : '') +
      `\n= ${r.total}`);
  }

  if (loading || !system || !character) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#7c3aed" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0c29" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name || 'Personaje'}</Text>
          <Text style={styles.headerSub}>{system.name}</Text>
        </View>
        <TouchableOpacity onPress={save} disabled={saving || !dirty} style={styles.saveBtn}>
          <Text style={[styles.saveText, (!dirty || saving) && { opacity: 0.4 }]}>
            {saving ? '...' : 'Guardar'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['stats', 'classes', 'equipment', 'inventory', ...(system.hasSpells ? ['spells'] as Tab[] : []), 'feats', 'skills', 'rolls'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{TAB_LABEL[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'stats' && (
          <StatsTab
            name={name}
            onName={(v) => { setName(v); setDirty(true); }}
            system={system}
            data={data}
            setField={setField}
            finalStats={finalStats}
            finalActions={finalActions}
            classFeatures={classFeatures}
          />
        )}
        {tab === 'classes' && (
          <ClassesTab system={system} data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'equipment' && (
          <EquipmentTab system={system} data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'inventory' && (
          <InventoryTab data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'spells' && system.hasSpells && (
          <SpellsTab system={system} data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'feats' && (
          <FeatsTab system={system} data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'skills' && (
          <SkillsTab system={system} data={data} setData={(d) => { setData(d); setDirty(true); }} />
        )}
        {tab === 'rolls' && (
          <RollsTab actions={finalActions} onPick={previewRoll} />
        )}
      </ScrollView>
    </View>
  );
}

const TAB_LABEL: Record<Tab, string> = {
  stats: 'Hoja',
  classes: 'Clases',
  equipment: 'Equipo',
  inventory: 'Mochila',
  spells: 'Conjuros',
  feats: 'Dotes',
  skills: 'Habilidades',
  rolls: 'Tiradas',
};

// ─── Stats tab ────────────────────────────────────────────────
function StatsTab({
  name, onName, system, data, setField, finalStats, finalActions, classFeatures,
}: any) {
  const grouped = (system.fields as FieldDef[]).reduce<Record<string, FieldDef[]>>((acc, f) => {
    const g = f.group ?? 'General';
    if (!acc[g]) acc[g] = [];
    acc[g].push(f);
    return acc;
  }, {});

  // Estos campos ya se editan desde la cabecera o desde la SummaryCard
  // (long-press), así que ocultamos los grupos que sólo los contienen.
  const HANDLED_KEYS = new Set([
    'race', 'level', 'ac', 'hp_max',
    'str', 'dex', 'con', 'int', 'wis', 'cha',
  ]);

  return (
    <View>
      <IdentityHeader
        system={system}
        data={data}
        name={name}
        onName={onName}
        setField={setField}
      />

      <SummaryCard system={system} finalStats={finalStats} finalActions={finalActions} data={data} setField={setField} />

      {Object.entries(grouped).map(([group, fields]) => {
        if (group === 'Habilidades') {
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.sectionTitle}>{group}</Text>
              <SkillsTableHoja
                builtinFields={fields}
                data={data}
                finalActions={finalActions}
                finalStats={finalStats}
                setField={setField}
              />
            </View>
          );
        }
        const visible = fields.filter((f) => !HANDLED_KEYS.has(f.key));
        if (visible.length === 0) return null;
        return (
          <View key={group} style={styles.group}>
            <Text style={styles.sectionTitle}>{group}</Text>
            {visible.map((f) => (
              <FieldRow key={f.key} field={f} value={data[f.key]} onChange={(v) => setField(f.key, v)} />
            ))}
          </View>
        );
      })}

      {classFeatures.length > 0 ? (
        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Rasgos de clase</Text>
          {(classFeatures as string[]).map((f, i) => (
            <Text key={i} style={styles.featureLine}>• {f}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ─── Cabecera de identidad: nombre, raza (selector), nivel total ──
function IdentityHeader({
  system, data, name, onName, setField,
}: {
  system: any;
  data: Record<string, unknown>;
  name: string;
  onName: (v: string) => void;
  setField: (k: string, v: unknown) => void;
}) {
  const [racePickerOpen, setRacePickerOpen] = useState(false);
  const [raceQuery, setRaceQuery] = useState('');
  const catalog = getCatalog(system.id);
  const races = (catalog?.races ?? []) as Array<{ id: string; name: string; size?: string; favoredClass?: string }>;
  const filteredRaces = useMemo(() => {
    const q = raceQuery.trim().toLowerCase();
    if (!q) return races;
    return races.filter((r) => r.name.toLowerCase().includes(q));
  }, [races, raceQuery]);

  const currentRace = String(data.race ?? '').trim();

  // Nivel total = suma de niveles de las clases del personaje.
  const classes = Array.isArray((data as { classes?: unknown }).classes)
    ? ((data as { classes: Array<{ classId: string; level: number }> }).classes)
    : [];
  const totalLevel = classes.reduce((acc, c) => acc + (c.level | 0), 0);
  const classLabel = (id: string) => system.classes?.find((c: any) => c.id === id)?.name ?? id;

  return (
    <View style={styles.identityCard}>
      <Text style={styles.identityFieldLabel}>Nombre</Text>
      <TextInput
        style={styles.identityNameInput}
        value={name}
        onChangeText={onName}
        placeholder="Nombre del personaje"
        placeholderTextColor="#475569"
      />

      <View style={styles.identityRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.identityFieldLabel}>Raza</Text>
          <TouchableOpacity
            style={styles.identitySelectBtn}
            onPress={() => { setRaceQuery(''); setRacePickerOpen(true); }}
          >
            <Text style={[styles.identitySelectValue, !currentRace && { color: '#64748b' }]} numberOfLines={1}>
              {currentRace || 'Elegir raza…'}
            </Text>
            <Text style={styles.targetSelectChevron}>▾</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.identityLevelBox}>
          <Text style={styles.identityFieldLabel}>Nivel</Text>
          <Text style={styles.identityLevelValue}>{totalLevel || '—'}</Text>
        </View>
      </View>

      {classes.length > 0 ? (
        <View style={styles.identityClassRow}>
          {classes.map((c, i) => (
            <View key={i} style={styles.identityClassChip}>
              <Text style={styles.identityClassName}>{classLabel(c.classId)}</Text>
              <Text style={styles.identityClassLevel}>{c.level}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.help}>Añade clases en la pestaña Clases para calcular el nivel.</Text>
      )}

      <Modal visible={racePickerOpen} transparent animationType="slide" onRequestClose={() => setRacePickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Elige raza</Text>
            <TextInput
              style={styles.input}
              value={raceQuery}
              onChangeText={setRaceQuery}
              placeholder="Buscar…"
              placeholderTextColor="#64748b"
              autoCorrect={false}
            />
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {filteredRaces.length === 0 ? (
                <Text style={styles.muted}>Sin resultados.</Text>
              ) : null}
              {filteredRaces.map((r) => {
                const active = currentRace.toLowerCase() === r.name.toLowerCase();
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.targetPickRow, active && styles.targetPickRowActive]}
                    onPress={() => { setField('race', r.name); setRacePickerOpen(false); }}
                  >
                    <Text style={[styles.targetPickName, active && { color: '#fff', fontWeight: '700' }]}>
                      {r.name}
                    </Text>
                    {(r.size || r.favoredClass) ? (
                      <Text style={styles.targetPickId}>
                        {[r.size, r.favoredClass && `Favorita: ${r.favoredClass}`].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {currentRace ? (
                <TouchableOpacity
                  style={[styles.modalAction, { flex: 1 }]}
                  onPress={() => { setField('race', ''); setRacePickerOpen(false); }}
                >
                  <Text style={{ color: '#f87171', fontWeight: '600' }}>Quitar</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalAction, { flex: 1 }]}
                onPress={() => setRacePickerOpen(false)}
              >
                <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Tabla unificada de habilidades en la pestaña Hoja ─────────
// Une las habilidades del sistema (sk_*) y las habilidades adicionales
// del usuario, mostrando para cada una: nombre, atributo clave, rangos
// editables y total final (con bonos de equipo, dotes, etc.).
const BUILTIN_SKILL_ABILITY: Record<string, string> = {
  sk_listen: 'SAB', sk_spot: 'SAB', sk_hide: 'DES', sk_move_silently: 'DES',
  sk_search: 'INT', sk_diplomacy: 'CAR', sk_bluff: 'CAR', sk_jump: 'FUE',
};
const ABILITY_SHORT: Record<string, string> = {
  Strength: 'FUE', Dexterity: 'DES', Constitution: 'CON',
  Intelligence: 'INT', Wisdom: 'SAB', Charisma: 'CAR',
  Str: 'FUE', Dex: 'DES', Con: 'CON', Int: 'INT', Wis: 'SAB', Cha: 'CAR',
};

function SkillsTableHoja({
  builtinFields, data, finalActions, finalStats, setField,
}: {
  builtinFields: FieldDef[];
  data: Record<string, unknown>;
  finalActions: RollableAction[];
  finalStats: Record<string, number>;
  setField: (k: string, v: unknown) => void;
}) {
  const byActionId = new Map(finalActions.map((a) => [a.id, a]));
  const userSkills: SkillEntry[] = Array.isArray((data as { skills?: unknown }).skills)
    ? ((data as { skills: SkillEntry[] }).skills)
    : [];
  // FUE/DES/… → mod_str/mod_dex/… (sobre los stats finales con bonos).
  const ABIL_TO_STAT: Record<string, string> = {
    FUE: 'mod_str', DES: 'mod_dex', CON: 'mod_con',
    INT: 'mod_int', SAB: 'mod_wis', CAR: 'mod_cha',
  };
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <View>
      {/* cabecera */}
      <View style={styles.skillTableHeader}>
        <Text style={[styles.skillTableHName, { flex: 1 }]}>Habilidad</Text>
        <Text style={styles.skillTableHKey}>Clave</Text>
        <Text style={styles.skillTableHRanks}>Rangos</Text>
        <Text style={styles.skillTableHRanks}>Varios</Text>
        <Text style={styles.skillTableHTotal}>Total</Text>
      </View>

      {/* habilidades del sistema (siempre visibles) */}
      {builtinFields.map((f) => {
        const ranks = Number(data[f.key]) || 0;
        const action = byActionId.get(f.key);
        const total = action ? action.modifier : ranks;
        const ability = BUILTIN_SKILL_ABILITY[f.key] ?? '—';
        const abilMod = finalStats[ABIL_TO_STAT[ability] ?? ''] ?? 0;
        const misc = total - ranks - abilMod;
        const label = f.label.replace(/\s*\(rangos\)\s*$/i, '');
        return (
          <View key={f.key} style={styles.skillTableRow}>
            <Text style={[styles.skillTableName, { flex: 1 }]} numberOfLines={1}>{label}</Text>
            <Text style={styles.skillTableKey}>{ability}{abilMod ? ` ${fmt(abilMod)}` : ''}</Text>
            <TextInput
              style={styles.skillTableInput}
              keyboardType="numbers-and-punctuation"
              value={String(ranks)}
              onChangeText={(t) => {
                const n = Number(t);
                if (!Number.isNaN(n)) setField(f.key, n);
              }}
            />
            <Text style={[styles.skillTableMisc, misc !== 0 && styles.skillTableMiscOn]}>
              {misc >= 0 ? `+${misc}` : `${misc}`}
            </Text>
            <Text style={styles.skillTableTotal}>{fmt(total)}</Text>
          </View>
        );
      })}

      {/* habilidades adicionales (incluye transclase) */}
      {userSkills.length > 0 ? (
        <Text style={[styles.subgroup, { marginTop: 10 }]}>Adicionales</Text>
      ) : null}
      {userSkills.map((sk) => {
        const action = byActionId.get(`skill_${sk.id}`);
        const total = action ? action.modifier : (sk.ranks || 0) + (sk.miscMod || 0);
        const key = ABILITY_SHORT[sk.ability ?? ''] ?? (sk.ability ? sk.ability.slice(0, 3).toUpperCase() : '—');
        const abilMod = finalStats[ABIL_TO_STAT[key] ?? ''] ?? 0;
        const ranks = sk.ranks ?? 0;
        const misc = total - ranks - abilMod;
        return (
          <View key={sk.id} style={styles.skillTableRow}>
            <Text style={[styles.skillTableName, { flex: 1 }]} numberOfLines={1}>
              {sk.name}
            </Text>
            <Text style={styles.skillTableKey}>{key}{abilMod ? ` ${fmt(abilMod)}` : ''}</Text>
            <Text style={styles.skillTableInput}>{ranks}</Text>
            <Text style={[styles.skillTableMisc, misc !== 0 && styles.skillTableMiscOn]}>
              {misc >= 0 ? `+${misc}` : `${misc}`}
            </Text>
            <Text style={styles.skillTableTotal}>{fmt(total)}</Text>
          </View>
        );
      })}
      {userSkills.length > 0 ? (
        <Text style={styles.help}>
          Edita rangos de habilidades adicionales en la pestaña Habilidades. "Varios" suma bonos de equipo equipado y dotes activas.
        </Text>
      ) : null}
    </View>
  );
}

// ─── Summary card (CA, PG, ataques, salvaciones, atributos) ─────
function SummaryCard({
  system, finalStats, finalActions, data, setField,
}: {
  system: any;
  finalStats: Record<string, number>;
  finalActions: RollableAction[];
  data: Record<string, unknown>;
  setField: (k: string, v: unknown) => void;
}) {
  // Editor rápido por long-press: { key, label, min, max }
  const [edit, setEdit] = useState<{ key: string; label: string; min?: number; max?: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const openEdit = (key: string, label: string, min?: number, max?: number) => {
    const cur = (data as Record<string, unknown>)[key];
    setEditValue(String(typeof cur === 'number' ? cur : (cur ?? '')));
    setEdit({ key, label, min, max });
  };
  const commitEdit = () => {
    if (!edit) return;
    const n = Number(editValue);
    if (Number.isNaN(n)) { setEdit(null); return; }
    let v = n;
    if (edit.min !== undefined) v = Math.max(edit.min, v);
    if (edit.max !== undefined) v = Math.min(edit.max, v);
    setField(edit.key, v);
    setEdit(null);
  };
  const targetLabel: Record<string, string> = {};
  for (const t of (system.bonusTargets ?? []) as Array<{ id: string; label: string }>) {
    targetLabel[t.id] = t.label;
  }
  const actionMod = (id: string) => {
    const a = finalActions.find((x) => x.id === id);
    return a ? a.modifier : undefined;
  };
  const fmt = (n: number | undefined) => n === undefined ? '—' : (n >= 0 ? `+${n}` : `${n}`);
  const raw = (n: number | undefined) => n === undefined ? '—' : `${n}`;

  // Atributos: valor (con bono de equipo/dotes mod_X*2 ya integrado en mod final)
  const ABIL: Array<[string, string, string]> = [
    ['FUE', 'str', 'Fuerza'], ['DES', 'dex', 'Destreza'], ['CON', 'con', 'Constitución'],
    ['INT', 'int', 'Inteligencia'], ['SAB', 'wis', 'Sabiduría'], ['CAR', 'cha', 'Carisma'],
  ];
  const abilCells = ABIL.map(([lbl, k]) => {
    const score = (data as Record<string, unknown>)[k];
    const baseScore = typeof score === 'number' ? score : 10;
    const mod = finalStats[`mod_${k}`] ?? 0;
    return { lbl, key: k, score: baseScore, mod };
  });

  const ac = finalStats.ac;
  const hp = finalStats.hp_max;
  const init = actionMod('initiative') ?? 0;
  const bab = finalStats.bab ?? 0;

  // ─── Armas equipadas ──────────────────────────────────────────────
  // Listamos los items equipados cuyo slot empieza por 'weapon' y
  // calculamos un ataque y daño totales aproximados:
  //   Ataque = BAB + (FUE para melee / DES para ranged) + bonos del arma a attack_*
  //   Daño   = dado del arma extraído de las notas (ej. "1d8") + FUE (melee)
  // Permite ver de un vistazo si las dotes/encantamientos suman.
  const strMod = finalStats.mod_str ?? 0;
  const dexMod = finalStats.mod_dex ?? 0;
  const equippedWeapons = (() => {
    const eq = Array.isArray((data as { equipment?: unknown }).equipment)
      ? ((data as { equipment: Array<{
          id: string; name: string; slot: string; equipped?: boolean;
          bonuses?: Array<{ target: string; value: number }>; notes?: string;
        }> }).equipment)
      : [];
    return eq.filter((it) => it?.equipped && typeof it.slot === 'string' && it.slot.startsWith('weapon'));
  })();
  const parseWeapon = (w: {
    name: string; bonuses?: Array<{ target: string; value: number }>; notes?: string;
  }) => {
    const bonuses = w.bonuses ?? [];
    const meleeBonus = bonuses.filter((b) => b.target === 'attack_melee').reduce((a, b) => a + (b.value || 0), 0);
    const rangedBonus = bonuses.filter((b) => b.target === 'attack_ranged').reduce((a, b) => a + (b.value || 0), 0);
    const isRanged = bonuses.some((b) => b.target === 'attack_ranged');
    const baseAtk = (isRanged ? (actionMod('attack_ranged') ?? bab + dexMod) : (actionMod('attack_melee') ?? bab + strMod));
    const itemAtk = isRanged ? rangedBonus : meleeBonus;
    const totalAtk = baseAtk + itemAtk;
    // Damage dice from notes (primer patrón NdM)
    const notes = String(w.notes ?? '');
    const diceMatch = notes.match(/(\d+d\d+)/i);
    const dice = diceMatch ? diceMatch[1] : '—';
    // Bono de daño: armas mágicas suelen sumar también al daño; aquí mostramos el bono del arma
    const dmgItemBonus = itemAtk; // misma cifra que +N de magia
    const dmgAbil = isRanged ? 0 : strMod;
    const dmgTotal = dmgAbil + dmgItemBonus;
    const dmgStr = `${dice}${dmgTotal !== 0 ? (dmgTotal > 0 ? `+${dmgTotal}` : `${dmgTotal}`) : ''}`;
    return { isRanged, totalAtk, dmgStr, notes };
  };

  return (
    <View style={styles.statsCard}>
      {/* Cabecera con CA y PG destacados como dos "fichas" grandes. */}
      <View style={styles.heroRow}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => openEdit('ac', 'CA base', 0, 60)}
          delayLongPress={350}
          style={[styles.heroCard, styles.heroAc]}
        >
          <Text style={styles.heroLabel}>CA</Text>
          <Text style={styles.heroValue}>{raw(ac)}</Text>
          <Text style={styles.heroSub}>Defensa</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => openEdit('hp_max', 'PG máximos', 0, 9999)}
          delayLongPress={350}
          style={[styles.heroCard, styles.heroHp]}
        >
          <Text style={styles.heroLabel}>PG</Text>
          <Text style={styles.heroValue}>{raw(hp)}</Text>
          <Text style={styles.heroSub}>Máximos</Text>
        </TouchableOpacity>
        <View style={styles.heroSideCol}>
          <View style={styles.heroSmall}>
            <Text style={styles.heroSmallLabel}>Iniciativa</Text>
            <Text style={styles.heroSmallValue}>{init >= 0 ? `+${init}` : `${init}`}</Text>
          </View>
          <View style={styles.heroSmall}>
            <Text style={styles.heroSmallLabel}>BAB</Text>
            <Text style={styles.heroSmallValue}>{bab >= 0 ? `+${bab}` : `${bab}`}</Text>
          </View>
        </View>
      </View>

      {/* Atributos al estilo "stat block" del PHB. */}
      <Text style={styles.subgroupHero}>Atributos · <Text style={styles.subgroupHint}>mantén pulsado para editar</Text></Text>
      <View style={styles.abilGrid}>
        {abilCells.map((a) => (
          <TouchableOpacity
            key={a.key}
            activeOpacity={0.85}
            onLongPress={() => openEdit(a.key, ABIL.find(([, k]) => k === a.key)?.[2] ?? a.lbl, 1, 40)}
            delayLongPress={350}
            style={styles.abilCard}
          >
            <Text style={styles.abilLabel}>{a.lbl}</Text>
            <Text style={styles.abilMod}>{a.mod >= 0 ? `+${a.mod}` : a.mod}</Text>
            <View style={styles.abilDivider} />
            <Text style={styles.abilScore}>{a.score}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Salvaciones y ataques en dos columnas paralelas. */}
      <View style={styles.twoColRow}>
        <View style={styles.colBlock}>
          <Text style={styles.subgroupHero}>Salvaciones</Text>
          {([
            ['Fortaleza', actionMod('fort')],
            ['Reflejos', actionMod('ref')],
            ['Voluntad', actionMod('will')],
          ] as Array<[string, number | undefined]>).map(([k, v]) => (
            <View key={k} style={styles.lineRow}>
              <Text style={styles.lineLabel}>{k}</Text>
              <Text style={styles.lineValue}>{fmt(v)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.colBlock}>
          <Text style={styles.subgroupHero}>Ataques</Text>
          {([
            ['Cuerpo a cuerpo', actionMod('attack_melee')],
            ['A distancia', actionMod('attack_ranged')],
          ] as Array<[string, number | undefined]>).map(([k, v]) => (
            <View key={k} style={styles.lineRow}>
              <Text style={styles.lineLabel}>{k}</Text>
              <Text style={styles.lineValue}>{fmt(v)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Armas equipadas con su ataque y daño total. */}
      {equippedWeapons.length > 0 ? (
        <>
          <Text style={styles.subgroupHero}>Armas equipadas</Text>
          <View style={styles.weaponList}>
            {equippedWeapons.map((w) => {
              const p = parseWeapon(w);
              return (
                <View key={w.id} style={styles.weaponRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.weaponName} numberOfLines={1}>{w.name}</Text>
                    {p.notes ? (
                      <Text style={styles.weaponNotes} numberOfLines={2}>{p.notes}</Text>
                    ) : null}
                  </View>
                  <View style={styles.weaponStat}>
                    <Text style={styles.weaponStatLabel}>{p.isRanged ? 'Ataque (D)' : 'Ataque (C)'}</Text>
                    <Text style={styles.weaponAtk}>{p.totalAtk >= 0 ? `+${p.totalAtk}` : `${p.totalAtk}`}</Text>
                  </View>
                  <View style={styles.weaponStat}>
                    <Text style={styles.weaponStatLabel}>Daño</Text>
                    <Text style={styles.weaponDmg}>{p.dmgStr}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Otros bonos extra (skills con bonos de objetos/dotes que no se ven arriba) */}
      {(() => {
        const known = new Set<string>([
          'ac', 'hp_max', 'bab', 'fort', 'ref', 'will',
          ...ABIL.map(([, k]) => `mod_${k}`),
        ]);
        const extras = Object.entries(finalStats).filter(([k, v]) => !known.has(k) && typeof v === 'number' && v !== 0);
        if (extras.length === 0) return null;
        return (
          <>
            <Text style={styles.subgroupHero}>Otros bonos activos</Text>
            <View style={styles.statsGrid}>
              {extras.map(([k, v]) => (
                <View key={k} style={styles.statPill}>
                  <Text style={styles.statKey}>{targetLabel[k] ?? k}</Text>
                  <Text style={styles.statVal}>{(v as number) >= 0 ? `+${v}` : `${v}`}</Text>
                </View>
              ))}
            </View>
          </>
        );
      })()}

      {/* Editor rápido (long-press) */}
      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 }]}>
            <Text style={styles.modalTitle}>{edit?.label ?? ''}</Text>
            <TextInput
              style={[styles.input, { fontSize: 22, textAlign: 'center' }]}
              keyboardType="numbers-and-punctuation"
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={commitEdit}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.modalAction, { flex: 1 }]}
                onPress={() => setEdit(null)}
              >
                <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(124,58,237,0.4)' }]}
                onPress={commitEdit}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Classes tab ──────────────────────────────────────────────
function ClassesTab({ system, data, setData }: any) {
  const entries: ClassEntry[] = Array.isArray(data.classes) ? data.classes : [];
  const [pickerVisible, setPickerVisible] = useState(false);
  if (!system.classes || system.classes.length === 0) {
    return <Text style={styles.muted}>Este sistema no tiene clases definidas.</Text>;
  }

  function update(next: ClassEntry[]) {
    const totalLevel = next.reduce((acc, e) => acc + (e.level | 0), 0);
    setData({ ...data, classes: next, level: Math.max(1, totalLevel || 1) });
  }
  function addEntry(classId: string) {
    setPickerVisible(false);
    update([...entries, { id: uid(), classId, level: 1 }]);
  }
  function setLevel(id: string, level: number) {
    update(entries.map((e) => e.id === id ? { ...e, level: Math.max(0, level) } : e));
  }
  function remove(id: string) {
    update(entries.filter((e) => e.id !== id));
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Niveles de clase</Text>
      <Text style={styles.help}>El nivel total se sincroniza automáticamente con la suma.</Text>

      {entries.length === 0 ? <Text style={styles.muted}>Aún no has añadido ninguna clase.</Text> : null}
      {entries.map((e) => {
        const def = system.classes.find((c: any) => c.id === e.classId);
        return (
          <View key={e.id} style={styles.itemCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{def?.name ?? e.classId}</Text>
              {def?.description ? <Text style={styles.itemSub}>{def.description}</Text> : null}
            </View>
            <View style={styles.levelRow}>
              <TouchableOpacity style={styles.levelBtn} onPress={() => setLevel(e.id, e.level - 1)}>
                <Text style={styles.levelBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.levelValue}>{e.level}</Text>
              <TouchableOpacity style={styles.levelBtn} onPress={() => setLevel(e.id, e.level + 1)}>
                <Text style={styles.levelBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => remove(e.id)} style={styles.delBtn}>
              <Text style={styles.delBtnText}>×</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <TouchableOpacity style={styles.addBtn} onPress={() => setPickerVisible(true)}>
        <Text style={styles.addBtnText}>+ Añadir clase</Text>
      </TouchableOpacity>

      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Elige clase</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {system.classes.map((c: any) => (
                <TouchableOpacity key={c.id} style={styles.charPickRow} onPress={() => addEntry(c.id)}>
                  <Text style={styles.charPickName}>{c.name}</Text>
                  {c.description ? <Text style={styles.charPickSys}>{c.description}</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalAction} onPress={() => setPickerVisible(false)}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Equipment tab ────────────────────────────────────────────
function EquipmentTab({ system, data, setData }: any) {
  const items: EquipmentItem[] = Array.isArray(data.equipment) ? data.equipment : [];
  const slots = system.equipmentSlots ?? [{ id: 'other', label: 'Otro' }];
  const targets = system.bonusTargets ?? [];
  const [editor, setEditor] = useState<EquipmentItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = getCatalog(system.id);
  const catalogEquipment = catalog?.equipment ?? [];

  function update(next: EquipmentItem[]) { setData({ ...data, equipment: next }); }
  function add() {
    const newItem: EquipmentItem = {
      id: uid(), name: 'Nuevo objeto', slot: slots[0].id, equipped: true, bonuses: [],
    };
    update([...items, newItem]);
    setEditor(newItem);
  }
  function addFromCatalog(c: CatalogEquipment) {
    setPickerOpen(false);
    const newItem: EquipmentItem = {
      id: uid(),
      name: c.name,
      slot: c.slot,
      equipped: true,
      bonuses: (c.bonuses ?? []).map((b) => ({ ...b })),
      notes: c.notes,
    };
    update([...items, newItem]);
  }
  function patch(id: string, p: Partial<EquipmentItem>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
    if (editor?.id === id) setEditor({ ...editor, ...p });
  }
  function remove(id: string) {
    update(items.filter((it) => it.id !== id));
    if (editor?.id === id) setEditor(null);
  }

  function toggleBonus(id: string, idx: number, p: Partial<BonusEffect>) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const bonuses = it.bonuses.map((b, i) => i === idx ? { ...b, ...p } : b);
    patch(id, { bonuses });
  }
  function addBonus(id: string) {
    const it = items.find((x) => x.id === id); if (!it) return;
    patch(id, { bonuses: [...it.bonuses, { target: targets[0]?.id ?? 'ac', value: 1 }] });
  }
  function removeBonus(id: string, idx: number) {
    const it = items.find((x) => x.id === id); if (!it) return;
    patch(id, { bonuses: it.bonuses.filter((_, i) => i !== idx) });
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Equipo</Text>
      <Text style={styles.help}>Marca un objeto como "equipado" para que sus bonos se apliquen automáticamente.</Text>

      {items.length === 0 ? <Text style={styles.muted}>Sin objetos. Añade armas, armaduras o reliquias.</Text> : null}

      {items.map((it) => (
        <View key={it.id} style={styles.equipCard}>
          <View style={styles.equipHeader}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.itemNameInput}
                value={it.name}
                onChangeText={(t) => patch(it.id, { name: t })}
                placeholder="Nombre del objeto" placeholderTextColor="#475569"
              />
              <Text style={styles.itemSub}>{slots.find((s: any) => s.id === it.slot)?.label ?? it.slot}</Text>
            </View>
            <View style={styles.equipToggle}>
              <Text style={styles.equipToggleLabel}>{it.equipped ? 'Equipado' : 'Guardado'}</Text>
              <Switch
                value={it.equipped}
                onValueChange={(v) => patch(it.id, { equipped: v })}
                trackColor={{ false: '#1e1b4b', true: '#7c3aed' }}
              />
            </View>
            <TouchableOpacity onPress={() => remove(it.id)} style={styles.delBtn}>
              <Text style={styles.delBtnText}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.slotRow}>
            {slots.map((s: any) => (
              <TouchableOpacity key={s.id}
                style={[styles.slotChip, it.slot === s.id && styles.slotChipActive]}
                onPress={() => patch(it.id, { slot: s.id })}>
                <Text style={[styles.slotChipText, it.slot === s.id && styles.slotChipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.subgroup}>Bonos automáticos</Text>
          {it.bonuses.length === 0 ? <Text style={styles.muted}>Sin bonos. Pulsa "+ Añadir bono".</Text> : null}
          {it.bonuses.map((b, idx) => (
            <BonusEditorRow
              key={idx}
              targets={targets as BonusTargetDef[]}
              bonus={b}
              onChange={(p) => toggleBonus(it.id, idx, p)}
              onRemove={() => removeBonus(it.id, idx)}
            />
          ))}
          <TouchableOpacity style={styles.addBonusBtn} onPress={() => addBonus(it.id)}>
            <Text style={styles.addBonusText}>+ Añadir bono</Text>
          </TouchableOpacity>

          <TextInput
            style={[styles.fieldInput, { marginTop: 8 }]}
            value={it.notes ?? ''}
            onChangeText={(t) => patch(it.id, { notes: t })}
            placeholder="Notas (descripción, daño, etc.)"
            placeholderTextColor="#475569"
            multiline
          />
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Text style={styles.addBtnText}>+ Añadir objeto</Text>
      </TouchableOpacity>
      {catalogEquipment.length > 0 ? (
        <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addBtnText}>📚 Añadir desde catálogo ({catalogEquipment.length})</Text>
        </TouchableOpacity>
      ) : null}

      <CatalogPicker
        visible={pickerOpen}
        title="Equipo del catálogo"
        source={catalog?.source}
        items={catalogEquipment.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: `${slots.find((s: any) => s.id === c.slot)?.label ?? c.slot}` +
            (c.bonuses && c.bonuses.length
              ? ` · ${c.bonuses.map((b) => `${b.target}${b.value >= 0 ? '+' : ''}${b.value}`).join(', ')}`
              : '') +
            (c.notes ? ` · ${c.notes}` : ''),
          raw: c,
        }))}
        onPick={(it) => addFromCatalog(it.raw as CatalogEquipment)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
function InventoryTab({ data, setData }: any) {
  const items: InventoryItem[] = Array.isArray(data.inventory) ? data.inventory : [];
  function update(next: InventoryItem[]) { setData({ ...data, inventory: next }); }
  function add() { update([...items, { id: uid(), name: 'Nuevo item', qty: 1 }]); }
  function patch(id: string, p: Partial<InventoryItem>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
  }
  function remove(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <View>
      <Text style={styles.sectionTitle}>Mochila</Text>
      <Text style={styles.help}>Objetos sin efectos mecánicos (raciones, antorchas, recuerdos…).</Text>

      {items.length === 0 ? <Text style={styles.muted}>Sin objetos en la mochila.</Text> : null}
      {items.map((it) => (
        <View key={it.id} style={styles.invRow}>
          <TextInput style={[styles.itemNameInput, { flex: 1 }]} value={it.name}
            onChangeText={(t) => patch(it.id, { name: t })} />
          <TextInput style={styles.qtyInput} keyboardType="numeric" value={String(it.qty)}
            onChangeText={(t) => { const n = Number(t); if (!Number.isNaN(n)) patch(it.id, { qty: n }); }} />
          <TouchableOpacity onPress={() => remove(it.id)} style={styles.delBtn}>
            <Text style={styles.delBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Text style={styles.addBtnText}>+ Añadir item</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Spells tab ───────────────────────────────────────────────
function SpellsTab({ system, data, setData }: any) {
  const items: SpellEntry[] = Array.isArray(data.spells) ? data.spells : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = getCatalog(system.id);
  const catalogSpells = catalog?.spells ?? [];
  function update(next: SpellEntry[]) { setData({ ...data, spells: next }); }
  function add() { update([...items, { id: uid(), name: 'Conjuro', level: 0, prepared: false }]); }
  function addFromCatalog(c: CatalogSpell) {
    setPickerOpen(false);
    update([...items, { id: uid(), name: c.name, level: c.level, prepared: false, notes: c.description }]);
  }
  function patch(id: string, p: Partial<SpellEntry>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
  }
  function remove(id: string) { update(items.filter((it) => it.id !== id)); }

  // agrupar por nivel
  const grouped = items.reduce<Record<number, SpellEntry[]>>((acc, s) => {
    if (!acc[s.level]) acc[s.level] = [];
    acc[s.level].push(s);
    return acc;
  }, {});

  return (
    <View>
      <Text style={styles.sectionTitle}>Conjuros</Text>
      <Text style={styles.help}>Marca los conjuros preparados para destacarlos.</Text>

      {items.length === 0 ? <Text style={styles.muted}>Sin conjuros aún.</Text> : null}
      {Object.keys(grouped).map(Number).sort((a, b) => a - b).map((lvl) => (
        <View key={lvl} style={{ marginBottom: 10 }}>
          <Text style={styles.subgroup}>{lvl === 0 ? 'Trucos / Cantrips' : `Nivel ${lvl}`}</Text>
          {grouped[lvl].map((sp) => (
            <View key={sp.id} style={styles.spellRow}>
              <TextInput style={[styles.itemNameInput, { flex: 1 }]} value={sp.name}
                onChangeText={(t) => patch(sp.id, { name: t })} />
              <TextInput style={styles.qtyInput} keyboardType="numeric" value={String(sp.level)}
                onChangeText={(t) => { const n = Number(t); if (!Number.isNaN(n)) patch(sp.id, { level: n }); }} />
              <Switch value={!!sp.prepared} onValueChange={(v) => patch(sp.id, { prepared: v })}
                trackColor={{ false: '#1e1b4b', true: '#7c3aed' }} />
              <TouchableOpacity onPress={() => remove(sp.id)} style={styles.delBtn}>
                <Text style={styles.delBtnText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Text style={styles.addBtnText}>+ Añadir conjuro</Text>
      </TouchableOpacity>
      {catalogSpells.length > 0 ? (
        <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addBtnText}>📚 Añadir desde catálogo ({catalogSpells.length})</Text>
        </TouchableOpacity>
      ) : null}
      <CatalogPicker
        visible={pickerOpen}
        title="Conjuros del catálogo"
        source={catalog?.source}
        items={catalogSpells.map((c) => ({
          id: c.id,
          title: `${c.name}`,
          subtitle: `Nv ${c.level}` +
            (c.school ? ` · ${c.school}` : '') +
            (c.classes && c.classes.length ? ` · ${c.classes.join('/')}` : '') +
            (c.description ? `\n${c.description}` : ''),
          raw: c,
        }))}
        onPick={(it) => addFromCatalog(it.raw as CatalogSpell)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

// ─── Feats tab ────────────────────────────────────────────────
function FeatsTab({ system, data, setData }: any) {
  const items: FeatItem[] = Array.isArray(data.feats) ? data.feats : [];
  const targets = system.bonusTargets ?? [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = getCatalog(system.id);
  const catalogFeats: CatalogFeat[] = catalog?.feats ?? [];

  function update(next: FeatItem[]) { setData({ ...data, feats: next }); }
  function add() { update([...items, { id: uid(), name: 'Nueva dote', bonuses: [] }]); }
  function addFromCatalog(c: CatalogFeat) {
    setPickerOpen(false);
    update([...items, {
      id: uid(),
      name: c.name,
      bonuses: (c.bonuses ?? []).map((b) => ({ ...b })),
      notes: c.description,
    }]);
  }
  function patch(id: string, p: Partial<FeatItem>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
  }
  function remove(id: string) { update(items.filter((it) => it.id !== id)); }
  function setBonus(id: string, idx: number, p: Partial<BonusEffect>) {
    const it = items.find((x) => x.id === id); if (!it) return;
    patch(id, { bonuses: (it.bonuses ?? []).map((b, i) => i === idx ? { ...b, ...p } : b) });
  }
  function addBonus(id: string) {
    const it = items.find((x) => x.id === id); if (!it) return;
    patch(id, { bonuses: [...(it.bonuses ?? []), { target: targets[0]?.id ?? 'ac', value: 1 }] });
  }
  function removeBonus(id: string, idx: number) {
    const it = items.find((x) => x.id === id); if (!it) return;
    patch(id, { bonuses: (it.bonuses ?? []).filter((_, i) => i !== idx) });
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Dotes</Text>
      <Text style={styles.help}>Las dotes con bonos numéricos se aplican automáticamente a tu hoja.</Text>

      {items.length === 0 ? <Text style={styles.muted}>Sin dotes. Añade desde el catálogo para auto-aplicar bonos.</Text> : null}

      {items.map((it) => (
        <View key={it.id} style={styles.equipCard}>
          <View style={styles.equipHeader}>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.itemNameInput}
                value={it.name}
                onChangeText={(t) => patch(it.id, { name: t })}
                placeholder="Nombre de la dote" placeholderTextColor="#475569"
              />
            </View>
            <TouchableOpacity onPress={() => remove(it.id)} style={styles.delBtn}>
              <Text style={styles.delBtnText}>×</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subgroup}>Bonos automáticos</Text>
          {(it.bonuses ?? []).length === 0 ? <Text style={styles.muted}>Sin bonos numéricos.</Text> : null}
          {(it.bonuses ?? []).map((b, idx) => (
            <BonusEditorRow
              key={idx}
              targets={targets as BonusTargetDef[]}
              bonus={b}
              onChange={(p) => setBonus(it.id, idx, p)}
              onRemove={() => removeBonus(it.id, idx)}
            />
          ))}
          <TouchableOpacity style={styles.addBonusBtn} onPress={() => addBonus(it.id)}>
            <Text style={styles.addBonusText}>+ Añadir bono</Text>
          </TouchableOpacity>

          <TextInput
            style={[styles.fieldInput, { marginTop: 8 }]}
            value={it.notes ?? ''}
            onChangeText={(t) => patch(it.id, { notes: t })}
            placeholder="Descripción / efecto"
            placeholderTextColor="#475569"
            multiline
          />
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Text style={styles.addBtnText}>+ Añadir dote</Text>
      </TouchableOpacity>
      {catalogFeats.length > 0 ? (
        <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addBtnText}>📚 Añadir desde catálogo ({catalogFeats.length})</Text>
        </TouchableOpacity>
      ) : null}

      <CatalogPicker
        visible={pickerOpen}
        title="Dotes del catálogo"
        source={catalog?.source}
        items={catalogFeats.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: (c.type ? c.type : '') +
            (c.bonuses && c.bonuses.length
              ? ` · ${c.bonuses.map((b) => `${b.target}${b.value >= 0 ? '+' : ''}${b.value}`).join(', ')}`
              : '') +
            (c.description ? `\n${c.description}` : ''),
          raw: c,
        }))}
        onPick={(it) => addFromCatalog(it.raw as CatalogFeat)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

// ─── Skills tab ───────────────────────────────────────────────
// En 3.5 los rangos máximos son nivel+3 para habilidades de clase y
// (nivel+3)/2 para transclase. El bono total = rangos + mod atributo + misc.
function SkillsTab({ system, data, setData }: any) {
  const items: SkillEntry[] = Array.isArray(data.skills) ? data.skills : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = getCatalog(system.id);
  const catalogSkills: CatalogSkill[] = catalog?.skills ?? [];

  const level = Number((data as Record<string, unknown>).level) || 1;
  const maxClass = level + 3;
  const maxCross = Math.floor((level + 3) / 2);

  // Mod del atributo final (ya con bonos de equipo/dotes).
  const ABIL_KEYS: Record<string, string> = {
    Strength: 'str', Dexterity: 'dex', Constitution: 'con',
    Intelligence: 'int', Wisdom: 'wis', Charisma: 'cha',
    Str: 'str', Dex: 'dex', Con: 'con', Int: 'int', Wis: 'wis', Cha: 'cha',
  };
  function abilMod(ability?: string): number {
    if (!ability) return 0;
    const k = ABIL_KEYS[ability] ?? ABIL_KEYS[ability.replace(/^./, (c) => c.toUpperCase())];
    if (!k) return 0;
    // Usar finalStats sería ideal; aquí recalculamos sólo con el atributo base:
    const score = Number((data as Record<string, unknown>)[k]) || 10;
    return Math.floor((score - 10) / 2);
  }

  function update(next: SkillEntry[]) { setData({ ...data, skills: next }); }
  function add() {
    update([...items, { id: uid(), name: 'Nueva habilidad', ability: 'Strength', ranks: 0, classSkill: false }]);
  }
  function addFromCatalog(c: CatalogSkill) {
    setPickerOpen(false);
    update([...items, {
      id: uid(),
      name: c.name,
      ability: c.ability,
      ranks: 0,
      classSkill: false,
      notes: c.trainedOnly ? 'Sólo entrenada' : undefined,
    }]);
  }
  function patch(id: string, p: Partial<SkillEntry>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
  }
  function remove(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <View>
      <Text style={styles.sectionTitle}>Habilidades</Text>
      <Text style={styles.help}>
        Bono total = rangos + mod. atributo + varios. Tope de rangos: clase {maxClass}, transclase {maxCross}.
      </Text>

      {items.length === 0 ? (
        <Text style={styles.muted}>Sin habilidades. Añade desde el catálogo (49 disponibles).</Text>
      ) : null}

      {items.map((it) => {
        const mod = abilMod(it.ability);
        const total = (it.ranks || 0) + mod + (it.miscMod || 0);
        const cap = it.classSkill ? maxClass : maxCross;
        const overCap = it.ranks > cap;
        return (
          <View key={it.id} style={styles.equipCard}>
            <View style={styles.equipHeader}>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.itemNameInput}
                  value={it.name}
                  onChangeText={(t) => patch(it.id, { name: t })}
                  placeholder="Nombre" placeholderTextColor="#475569"
                />
                <Text style={styles.itemSub}>
                  {it.ability ?? 'Sin atributo'} · mod {mod >= 0 ? `+${mod}` : mod}
                </Text>
              </View>
              <View style={styles.skillTotalBox}>
                <Text style={styles.skillTotalLabel}>Total</Text>
                <Text style={styles.skillTotalValue}>{total >= 0 ? `+${total}` : total}</Text>
              </View>
              <TouchableOpacity onPress={() => remove(it.id)} style={styles.delBtn}>
                <Text style={styles.delBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.skillRow}>
              <View style={styles.skillField}>
                <Text style={styles.skillFieldLabel}>Rangos</Text>
                <TextInput
                  style={[styles.bonusInput, overCap && { borderColor: '#dc2626' }]}
                  keyboardType="numbers-and-punctuation"
                  value={String(it.ranks)}
                  onChangeText={(t) => { const n = Number(t); if (!Number.isNaN(n)) patch(it.id, { ranks: n }); }}
                />
              </View>
              <View style={styles.skillField}>
                <Text style={styles.skillFieldLabel}>Varios</Text>
                <TextInput
                  style={styles.bonusInput}
                  keyboardType="numbers-and-punctuation"
                  value={String(it.miscMod ?? 0)}
                  onChangeText={(t) => { const n = Number(t); if (!Number.isNaN(n)) patch(it.id, { miscMod: n }); }}
                />
              </View>
              <View style={styles.skillField}>
                <Text style={styles.skillFieldLabel}>De clase</Text>
                <Switch
                  value={!!it.classSkill}
                  onValueChange={(v) => patch(it.id, { classSkill: v })}
                  trackColor={{ false: '#1e1b4b', true: '#7c3aed' }}
                />
              </View>
            </View>

            <View style={styles.slotRow}>
              {(['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] as const).map((a) => (
                <TouchableOpacity key={a}
                  style={[styles.slotChip, it.ability === a && styles.slotChipActive]}
                  onPress={() => patch(it.id, { ability: a })}>
                  <Text style={[styles.slotChipText, it.ability === a && styles.slotChipTextActive]}>
                    {a.slice(0, 3).toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {overCap ? (
              <Text style={styles.warn}>
                ⚠ Rangos por encima del tope ({cap}) para {it.classSkill ? 'habilidad de clase' : 'transclase'}.
              </Text>
            ) : null}

            <TextInput
              style={[styles.fieldInput, { marginTop: 8 }]}
              value={it.notes ?? ''}
              onChangeText={(t) => patch(it.id, { notes: t })}
              placeholder="Notas (sinergias, equipo, …)"
              placeholderTextColor="#475569"
              multiline
            />
          </View>
        );
      })}

      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Text style={styles.addBtnText}>+ Añadir habilidad</Text>
      </TouchableOpacity>
      {catalogSkills.length > 0 ? (
        <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addBtnText}>📚 Añadir desde catálogo ({catalogSkills.length})</Text>
        </TouchableOpacity>
      ) : null}

      <CatalogPicker
        visible={pickerOpen}
        title="Habilidades del catálogo"
        source={catalog?.source}
        items={catalogSkills.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: (c.ability ? `${c.ability}` : '') +
            (c.trainedOnly ? ' · sólo entrenada' : '') +
            (c.armorCheck ? ' · pen. armadura' : '') +
            (c.synergy && c.synergy.length ? `\nSinergia: ${c.synergy.join(', ')}` : ''),
          raw: c,
        }))}
        onPick={(it) => addFromCatalog(it.raw as CatalogSkill)}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

// ─── Rolls tab ────────────────────────────────────────────────
function RollsTab({ actions, onPick }: { actions: RollableAction[]; onPick: (a: RollableAction) => void }) {
  const grouped = actions.reduce<Record<string, RollableAction[]>>((acc, a) => {
    const g = a.group ?? 'Acciones';
    if (!acc[g]) acc[g] = [];
    acc[g].push(a);
    return acc;
  }, {});
  return (
    <View>
      <Text style={styles.sectionTitle}>Tiradas (con bonos finales)</Text>
      <Text style={styles.help}>Toca para tirar localmente. En la partida tu DM podrá hacerlo dirigido.</Text>
      {Object.entries(grouped).map(([g, list]) => (
        <View key={g} style={{ marginBottom: 10 }}>
          <Text style={styles.subgroup}>{g}</Text>
          <View style={styles.actionsWrap}>
            {list.map((a) => (
              <TouchableOpacity key={a.id} style={styles.actionChip} onPress={() => onPick(a)}>
                <Text style={styles.actionLabel}>{a.label}</Text>
                <Text style={styles.actionMod}>{a.die} {a.modifier >= 0 ? `+${a.modifier}` : a.modifier}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Selector de target de bono (bottom sheet con búsqueda) ───
type BonusTargetDef = { id: string; label: string };

function BonusEditorRow({
  targets, bonus, onChange, onRemove,
}: {
  targets: BonusTargetDef[];
  bonus: { target: string; value: number; type?: string };
  onChange: (next: Partial<{ target: string; value: number; type: string }>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = targets.find((t) => t.id === bonus.target);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) =>
      t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }, [targets, query]);
  const currentType = (bonus.type ?? 'untyped') as string;
  const currentTypeLabel = BONUS_TYPE_OPTIONS.find((o) => o.id === currentType)?.label ?? 'Sin tipo';

  return (
    <View style={styles.bonusRow}>
      <View style={{ flex: 1, gap: 4 }}>
        <TouchableOpacity
          style={styles.targetSelectBtn}
          onPress={() => { setQuery(''); setOpen(true); }}
        >
          <Text style={styles.targetSelectLabel} numberOfLines={1}>
            {current ? current.label : 'Elegir destino…'}
          </Text>
          <Text style={styles.targetSelectChevron}>▾</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.bonusTypeBtn}
          onPress={() => setTypeOpen(true)}
        >
          <Text style={styles.bonusTypeLabel} numberOfLines={1}>{currentTypeLabel}</Text>
          <Text style={styles.targetSelectChevron}>▾</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.bonusInput}
        keyboardType="numbers-and-punctuation"
        value={String(bonus.value)}
        onChangeText={(t) => {
          const n = Number(t); if (Number.isNaN(n)) return;
          onChange({ value: n });
        }}
      />
      <TouchableOpacity onPress={onRemove} style={styles.delBtn}>
        <Text style={styles.delBtnText}>×</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Destino del bono</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar (CA, escuchar, fortaleza…)"
              placeholderTextColor="#64748b"
              autoCorrect={false}
            />
            <ScrollView style={{ maxHeight: 480 }} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={styles.muted}>Sin resultados.</Text>
              ) : null}
              {filtered.map((t) => {
                const active = t.id === bonus.target;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.targetPickRow, active && styles.targetPickRowActive]}
                    onPress={() => { onChange({ target: t.id }); setOpen(false); }}
                  >
                    <Text style={[styles.targetPickName, active && { color: '#fff', fontWeight: '700' }]}>
                      {t.label}
                    </Text>
                    <Text style={styles.targetPickId}>{t.id}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalAction} onPress={() => setOpen(false)}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={typeOpen} transparent animationType="slide" onRequestClose={() => setTypeOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Tipo de bono</Text>
            <Text style={styles.help}>
              Dos bonos del mismo tipo no se apilan: sólo cuenta el más alto.
              Excepciones que siempre apilan: esquiva, circunstancia y sin tipo.
            </Text>
            <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
              {BONUS_TYPE_OPTIONS.map((opt) => {
                const active = opt.id === currentType;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.targetPickRow, active && styles.targetPickRowActive]}
                    onPress={() => { onChange({ type: opt.id }); setTypeOpen(false); }}
                  >
                    <Text style={[styles.targetPickName, active && { color: '#fff', fontWeight: '700' }]}>
                      {opt.label}
                      {opt.stacks ? ' · apila' : ''}
                    </Text>
                    {opt.hint ? <Text style={styles.targetPickId}>{opt.hint}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalAction} onPress={() => setTypeOpen(false)}>
              <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Tipos de bono disponibles (D&D 3.5).
const BONUS_TYPE_OPTIONS: Array<{ id: string; label: string; stacks?: boolean; hint?: string }> = [
  { id: 'untyped', label: 'Sin tipo', stacks: true, hint: 'Apila siempre' },
  { id: 'dodge', label: 'Esquiva', stacks: true, hint: 'Apila siempre' },
  { id: 'circumstance', label: 'Circunstancia', stacks: true, hint: 'Apila siempre' },
  { id: 'alchemical', label: 'Alquímico' },
  { id: 'armor', label: 'Armadura' },
  { id: 'competence', label: 'Competencia' },
  { id: 'deflection', label: 'Deflexión' },
  { id: 'enhancement', label: 'Mejora' },
  { id: 'insight', label: 'Visión' },
  { id: 'luck', label: 'Suerte' },
  { id: 'morale', label: 'Moral' },
  { id: 'natural', label: 'Armadura natural' },
  { id: 'profane', label: 'Profano' },
  { id: 'racial', label: 'Racial' },
  { id: 'resistance', label: 'Resistencia' },
  { id: 'sacred', label: 'Sagrado' },
  { id: 'shield', label: 'Escudo' },
  { id: 'size', label: 'Tamaño' },
];

// ─── Catalog picker (modal genérico) ──────────────────────────
type CatalogPickItem = { id: string; title: string; subtitle?: string; raw: unknown };
function CatalogPicker({
  visible, title, source, items, onPick, onClose,
}: {
  visible: boolean;
  title: string;
  source?: string;
  items: CatalogPickItem[];
  onPick: (it: CatalogPickItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.title.toLowerCase().includes(q) ||
      (it.subtitle ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { maxHeight: '85%' }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          {source ? <Text style={styles.help}>{source}</Text> : null}
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar…"
            placeholderTextColor="#64748b"
            autoCorrect={false}
          />
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <Text style={styles.muted}>Sin resultados.</Text>
            ) : null}
            {filtered.map((it) => (
              <TouchableOpacity key={it.id} style={styles.charPickRow} onPress={() => onPick(it)}>
                <Text style={styles.charPickName}>{it.title}</Text>
                {it.subtitle ? <Text style={styles.charPickSys}>{it.subtitle}</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.modalAction} onPress={onClose}>
            <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Field row (reuses) ───────────────────────────────────────
function FieldRow({
  field, value, onChange,
}: { field: FieldDef; value: unknown; onChange: (v: string | number) => void }) {
  if (field.type === 'select' && field.options) {
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.selectWrap}>
          {field.options.map((opt) => {
            const active = String(value ?? field.default ?? '') === opt;
            return (
              <TouchableOpacity key={opt}
                style={[styles.selectChip, active && styles.selectChipActive]}
                onPress={() => onChange(opt)}>
                <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {field.help ? <Text style={styles.help}>{field.help}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        style={styles.fieldInput}
        keyboardType={field.type === 'number' ? 'numeric' : 'default'}
        value={value !== undefined && value !== null ? String(value) : ''}
        onChangeText={(t) => {
          if (field.type === 'number') {
            if (t.trim() === '' || t === '-') { onChange(t as unknown as number); return; }
            const n = Number(t); if (!Number.isNaN(n)) onChange(n);
          } else { onChange(t); }
        }}
        placeholder={field.default !== undefined ? String(field.default) : ''}
        placeholderTextColor="#475569"
      />
      {field.help ? <Text style={styles.help}>{field.help}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0c29' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 48, paddingBottom: 12, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.15)',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#a78bfa', fontSize: 32, lineHeight: 36 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 16, maxWidth: '90%' },
  headerSub: { color: '#a78bfa', fontSize: 11, marginTop: 2 },
  saveBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  saveText: { color: '#7c3aed', fontWeight: '700' },

  tabs: {
    flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.1)', flexWrap: 'wrap', gap: 4,
  },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  tabActive: { backgroundColor: 'rgba(124,58,237,0.25)' },
  tabText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  scroll: { padding: 16, paddingBottom: 60 },
  sectionTitle: { color: '#e2e8f0', fontWeight: '800', fontSize: 14, marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', marginBottom: 12,
  },
  group: { marginBottom: 16 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { color: '#cbd5e1', fontSize: 12, marginBottom: 4 },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  selectWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  selectChipActive: { backgroundColor: 'rgba(124,58,237,0.4)', borderColor: '#7c3aed' },
  selectChipText: { color: '#94a3b8', fontSize: 12 },
  selectChipTextActive: { color: '#fff', fontWeight: '700' },
  help: { color: '#64748b', fontSize: 11, marginTop: 4, marginBottom: 4 },
  muted: { color: '#64748b', fontSize: 12, marginVertical: 8 },
  statsCard: {
    backgroundColor: 'rgba(124,58,237,0.08)', borderRadius: 14,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statPill: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  statKey: { color: '#94a3b8', fontSize: 10 },
  statVal: { color: '#34d399', fontWeight: '700', fontSize: 13 },
  featureLine: { color: '#cbd5e1', fontSize: 12, marginVertical: 2 },
  subgroup: { color: '#a78bfa', fontSize: 12, fontWeight: '700', marginTop: 6, marginBottom: 6 },
  subgroupHero: {
    color: '#a78bfa', fontSize: 11, fontWeight: '800',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginTop: 14, marginBottom: 8,
  },
  subgroupHint: {
    color: '#64748b', fontSize: 10, fontWeight: '500',
    letterSpacing: 0, textTransform: 'none',
  },

  // Identity header
  identityCard: {
    backgroundColor: 'rgba(124,58,237,0.10)',
    borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.3)',
  },
  identityFieldLabel: {
    color: '#a78bfa', fontSize: 10, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4,
  },
  identityNameInput: {
    color: '#fff', fontSize: 22, fontWeight: '800',
    paddingVertical: 4, paddingHorizontal: 0,
    borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.3)',
    marginBottom: 12,
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  identitySelectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  identitySelectValue: { color: '#e2e8f0', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 6 },
  identityLevelBox: {
    width: 78, alignItems: 'center',
    backgroundColor: 'rgba(15,12,41,0.6)',
    borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  identityLevelValue: {
    color: '#fbbf24', fontSize: 28, fontWeight: '900', lineHeight: 32,
  },
  identityClassRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10,
  },
  identityClassChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  identityClassName: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  identityClassLevel: {
    color: '#fff', fontSize: 12, fontWeight: '800',
    backgroundColor: 'rgba(124,58,237,0.5)',
    minWidth: 20, textAlign: 'center',
    paddingHorizontal: 6, borderRadius: 999,
  },

  // Armas equipadas
  weaponList: { gap: 8, marginBottom: 6 },
  weaponRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(15,12,41,0.55)',
    borderWidth: 1, borderColor: 'rgba(248,113,113,0.25)',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10,
  },
  weaponName: { color: '#fef2f2', fontSize: 14, fontWeight: '700' },
  weaponNotes: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  weaponStat: { alignItems: 'center', minWidth: 60 },
  weaponStatLabel: {
    color: '#64748b', fontSize: 9, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  weaponAtk: { color: '#fbbf24', fontSize: 18, fontWeight: '900', marginTop: 2 },
  weaponDmg: { color: '#f87171', fontSize: 14, fontWeight: '800', marginTop: 2 },

  // Hero (CA + PG + Iniciativa/BAB)
  heroRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  heroCard: {
    flex: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  heroAc: {
    backgroundColor: 'rgba(56,189,248,0.10)', borderColor: 'rgba(56,189,248,0.45)',
  },
  heroHp: {
    backgroundColor: 'rgba(248,113,113,0.10)', borderColor: 'rgba(248,113,113,0.45)',
  },
  heroLabel: {
    color: '#cbd5e1', fontSize: 11, fontWeight: '800',
    letterSpacing: 2, textTransform: 'uppercase',
  },
  heroValue: {
    color: '#fff', fontSize: 36, fontWeight: '900', lineHeight: 40, marginTop: 2,
  },
  heroSub: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  heroSideCol: { width: 96, justifyContent: 'space-between' },
  heroSmall: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
    alignItems: 'center',
  },
  heroSmallLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroSmallValue: { color: '#34d399', fontSize: 18, fontWeight: '800', marginTop: 2 },

  // Atributos en grid 3x2 estilo "stat block"
  abilGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  abilCard: {
    width: '31%',
    backgroundColor: 'rgba(15,12,41,0.6)',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
  },
  abilLabel: {
    color: '#a78bfa', fontSize: 11, fontWeight: '800',
    letterSpacing: 1.5,
  },
  abilMod: {
    color: '#fbbf24', fontSize: 22, fontWeight: '900', lineHeight: 26, marginTop: 2,
  },
  abilDivider: {
    width: 28, height: 1, backgroundColor: 'rgba(167,139,250,0.3)', marginVertical: 6,
  },
  abilScore: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },

  // Salvaciones / Ataques en dos columnas
  twoColRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  colBlock: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, paddingHorizontal: 12, paddingBottom: 10,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  lineRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: 'rgba(167,139,250,0.08)',
  },
  lineLabel: { color: '#cbd5e1', fontSize: 12 },
  lineValue: { color: '#34d399', fontSize: 16, fontWeight: '800' },

  // Class rows
  itemCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  itemTitle: { color: '#e2e8f0', fontWeight: '700' },
  itemSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  levelBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  levelValue: { color: '#fff', fontWeight: '800', minWidth: 20, textAlign: 'center' },
  delBtn: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.18)',
  },
  delBtnText: { color: '#fca5a5', fontWeight: '800', fontSize: 18, lineHeight: 18 },

  addBtn: {
    marginTop: 6, alignItems: 'center', paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(124,58,237,0.2)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.45)',
  },
  addBtnSecondary: {
    marginTop: 8, backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.45)',
  },
  addBtnText: { color: '#c4b5fd', fontWeight: '700' },

  // Equipment
  equipCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  equipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  itemNameInput: {
    color: '#fff', fontWeight: '700', fontSize: 14, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(167,139,250,0.2)',
  },
  equipToggle: { alignItems: 'center' },
  equipToggleLabel: { color: '#94a3b8', fontSize: 10, marginBottom: 2 },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 6 },
  slotChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  slotChipActive: { backgroundColor: 'rgba(124,58,237,0.3)', borderColor: '#7c3aed' },
  slotChipText: { color: '#94a3b8', fontSize: 10 },
  slotChipTextActive: { color: '#fff', fontWeight: '700' },
  bonusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginVertical: 6 },
  targetChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginRight: 4,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  targetChipActive: { backgroundColor: 'rgba(34,197,94,0.25)', borderColor: '#22c55e' },
  targetChipText: { color: '#94a3b8', fontSize: 10 },
  targetChipTextActive: { color: '#fff', fontWeight: '700' },

  // Selector de target (bottom sheet)
  targetSelectBtn: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  targetSelectLabel: { color: '#e2e8f0', fontSize: 12, flex: 1, marginRight: 6 },
  targetSelectChevron: { color: '#a78bfa', fontSize: 12 },
  bonusTypeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  bonusTypeLabel: { color: '#a78bfa', fontSize: 11, fontWeight: '600', flex: 1, marginRight: 6 },
  targetPickRow: {
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'transparent',
  },
  targetPickRowActive: {
    backgroundColor: 'rgba(124,58,237,0.25)', borderColor: '#7c3aed',
  },
  targetPickName: { color: '#e2e8f0', fontSize: 14 },
  targetPickId: { color: '#64748b', fontSize: 10, marginTop: 2 },
  bonusInput: {
    width: 50, color: '#34d399', fontWeight: '800', textAlign: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', borderRadius: 8, paddingVertical: 4,
  },
  addBonusBtn: { marginTop: 6, paddingVertical: 6, alignItems: 'center' },
  addBonusText: { color: '#a78bfa', fontSize: 12, fontWeight: '600' },

  // Skills
  skillRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginVertical: 6 },
  skillField: { alignItems: 'center', gap: 4 },
  skillFieldLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  skillTotalBox: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 6,
    backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  skillTotalLabel: { color: '#94a3b8', fontSize: 9 },
  skillTotalValue: { color: '#34d399', fontSize: 16, fontWeight: '800' },
  warn: { color: '#f59e0b', fontSize: 11, marginTop: 4 },
  skillSummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 4,
  },
  skillSummaryName: { color: '#e2e8f0', fontSize: 13, flex: 1 },
  skillSummaryTC: { color: '#f59e0b', fontSize: 11 },
  skillSummaryAbil: { color: '#94a3b8', fontSize: 11, width: 80, textAlign: 'right' },
  skillSummaryTotal: { color: '#34d399', fontSize: 14, fontWeight: '800', width: 50, textAlign: 'right' },

  // Tabla de habilidades en Hoja
  skillTableHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 1, borderColor: 'rgba(167,139,250,0.3)', marginBottom: 4,
  },
  skillTableHName: { color: '#a78bfa', fontSize: 11, fontWeight: '700' },
  skillTableHKey: { color: '#a78bfa', fontSize: 11, fontWeight: '700', width: 44, textAlign: 'center' },
  skillTableHRanks: { color: '#a78bfa', fontSize: 11, fontWeight: '700', width: 56, textAlign: 'center' },
  skillTableHTotal: { color: '#a78bfa', fontSize: 11, fontWeight: '700', width: 56, textAlign: 'right' },
  skillTableRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4, paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 3,
  },
  skillTableName: { color: '#e2e8f0', fontSize: 13 },
  skillTableKey: {
    color: '#94a3b8', fontSize: 11, fontWeight: '700',
    width: 44, textAlign: 'center',
  },
  skillTableInput: {
    width: 56, color: '#fff', textAlign: 'center', fontSize: 13,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', borderRadius: 6, paddingVertical: 3,
  },
  skillTableTotal: {
    color: '#34d399', fontSize: 14, fontWeight: '800', width: 56, textAlign: 'right',
  },
  skillTableMisc: {
    width: 56, color: '#64748b', textAlign: 'center', fontSize: 13, fontWeight: '600',
  },
  skillTableMiscOn: { color: '#fbbf24' },

  // Inventory + spells row
  invRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6,
  },
  spellRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, marginBottom: 6,
  },
  qtyInput: {
    width: 48, color: '#fff', textAlign: 'center',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)', borderRadius: 8, paddingVertical: 4,
  },

  // Rolls
  actionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionChip: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  actionLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },
  actionMod: { color: '#34d399', fontSize: 11, marginTop: 2 },

  // Modal (class picker)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1e1b4b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30 },
  modalTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalAction: { marginTop: 10, alignItems: 'center', paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10 },
  charPickRow: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 6 },
  charPickName: { color: '#fff', fontWeight: '700' },
  charPickSys: { color: '#a78bfa', fontSize: 11, marginTop: 2 },
});
