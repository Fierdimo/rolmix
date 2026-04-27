import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  StatusBar, ActivityIndicator, Alert, Modal, Switch, FlatList, ListRenderItem,
  useWindowDimensions,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Character } from '../lib/types';
import { getSystem, resolveAction, computeFinalActions, computeFinalStats, aggregateClassGrants } from '../lib/systems';
import {
  FieldDef, RollableAction, ClassEntry, EquipmentItem, InventoryItem, SpellEntry, PrepSlot, BonusEffect, FeatItem, SkillEntry,
  SpellSlotBreakdown, SpellSlotResult,
} from '../lib/systems/types';
import { getCatalog, CatalogSpell, CatalogEquipment, CatalogFeat, CatalogSkill } from '../lib/catalog';
import { RootStackParamList } from '../App';

/** Convierte texto plano de descripción a HTML para RenderHtml */
function descToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Limpia _palabra_:/url/path/ → <em>palabra</em>
  const noUrlItalic = escaped.replace(/_([^_]+?)_:\/[^\s]*/g, '<em>$1</em>');
  // Convierte _palabra_ restantes → <em>palabra</em>
  const italicized = noUrlItalic.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  const paras = italicized
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => `<p>${l}</p>`)
    .join('');
  return paras || '<p>Sin descripción.</p>';
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CharacterEditor'>;
  route: RouteProp<RootStackParamList, 'CharacterEditor'>;
};

type Tab = 'stats' | 'adventure' | 'classes' | 'equipment' | 'inventory' | 'spells' | 'feats' | 'skills' | 'rolls';

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function CharacterEditorScreen({ navigation, route }: Props) {
  const { characterId, sessionId, sessionName } = route.params;
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

    if (sessionId) {
      // Modo partida: cargar datos desde la copia de sesión.
      let { data: sc, error: scErr } = await supabase
        .from('session_characters')
        .select('data')
        .eq('session_id', sessionId)
        .eq('character_id', characterId)
        .single();

      // Si no existe la copia, intentar crearla automáticamente (el jugador es el dueño).
      if (scErr || !sc) {
        const { error: activateErr } = await supabase.rpc('activate_character_in_session', {
          p_session_id: sessionId,
          p_character_id: characterId,
        });
        if (!activateErr) {
          // Reintento: ahora sí debería existir el registro.
          const retry = await supabase
            .from('session_characters')
            .select('data')
            .eq('session_id', sessionId)
            .eq('character_id', characterId)
            .single();
          sc = retry.data;
          scErr = retry.error;
        }
      }

      if (scErr || !sc) {
        // El DM u otro usuario ve la ficha: mostrar datos base en modo solo-lectura.
        setData(row.data ?? {});
      } else {
        setData((sc.data as Record<string, unknown>) ?? {});
      }
    } else {
      setData(row.data ?? {});
    }
    setLoading(false);
  }, [characterId, sessionId, navigation]);

  useEffect(() => { fetch(); }, [fetch]);

  // Refs siempre con los últimos valores para usarse desde el listener de back.
  const latest = useRef({ name, data, dirty });
  useEffect(() => { latest.current = { name, data, dirty }; }, [name, data, dirty]);

  function setField(key: string, value: unknown) {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  const persist = useCallback(async (n: string, d: Record<string, unknown>) => {
    if (sessionId) {
      // Modo partida: guardar solo en la copia de sesión mediante RPC.
      const { error } = await supabase.rpc('update_session_character_data', {
        p_session_id: sessionId,
        p_character_id: characterId,
        p_data: d,
      });
      return error;
    }
    const { error } = await supabase
      .from('characters')
      .update({ name: n.trim() || 'Sin nombre', data: d })
      .eq('id', characterId);
    return error;
  }, [characterId, sessionId]);

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

      {/* Banner de modo partida */}
      {sessionId ? (
        <View style={styles.sessionBanner}>
          <Text style={styles.sessionBannerText}>
            ⚔️ Modo partida{sessionName ? ` · ${sessionName}` : ''} · Los cambios no afectan al personaje original
          </Text>
        </View>
      ) : null}

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['stats', 'adventure', 'classes', 'equipment', 'inventory', ...(system.hasSpells ? ['spells'] as Tab[] : []), 'feats', 'skills', 'rolls'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{TAB_LABEL[t]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'stats' && (
          <StatsTab
            name={name}
            onName={sessionId ? undefined : (v) => { setName(v); setDirty(true); }}
            system={system}
            data={data}
            setField={setField}
            finalStats={finalStats}
            finalActions={finalActions}
            classFeatures={classFeatures}
            sessionMode={!!sessionId}
          />
        )}
        {tab === 'adventure' && (
          <AdventureTab
            data={data}
            setData={(d) => { setData(d); setDirty(true); }}
            hp={finalStats.hp_max ?? 0}
            bab={finalStats.bab ?? 0}
            strMod={finalStats.mod_str ?? 0}
            dexMod={finalStats.mod_dex ?? 0}
            finalActions={finalActions}
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
  adventure: 'Sesión',
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
  name, onName, system, data, setField, finalStats, finalActions, classFeatures, sessionMode,
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
    'xp', // Gestionado en el tracker de partida; irrelevante en el personaje base
  ]);

  return (
    <View>
      <IdentityHeader
        system={system}
        data={data}
        name={name}
        onName={onName}
        setField={setField}
        sessionMode={sessionMode}
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

      {/* ── Notas del personaje ──────────────────────────────── */}
      <View style={styles.statsCard}>
        <Text style={styles.sectionTitle}>Notas del personaje</Text>
        <TextInput
          style={[styles.fieldInput, { minHeight: 100 }]}
          value={String(data.notes ?? '')}
          onChangeText={(t) => setField('notes', t)}
          placeholder="Trasfondo, personalidad, vínculos, apariencia…"
          placeholderTextColor="#475569"
          multiline
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

// ─── Cabecera de identidad: nombre, raza (selector), nivel total ──
// Tabla XP D&D 3.5 (nivel → XP necesaria para alcanzarlo)
const DND35_XP_TABLE = [0, 0, 1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000,
  55000, 66000, 78000, 91000, 105000, 120000, 136000, 153000, 171000, 190000];

function IdentityHeader({
  system, data, name, onName, setField, sessionMode,
}: {
  system: any;
  data: Record<string, unknown>;
  name: string;
  onName?: (v: string) => void;
  setField: (k: string, v: unknown) => void;
  sessionMode?: boolean;
}) {
  const [racePickerOpen, setRacePickerOpen] = useState(false);
  const [raceQuery, setRaceQuery] = useState('');
  const [xpModal, setXpModal] = useState<'add' | 'set' | null>(null);
  const [xpInput, setXpInput] = useState('');
  const [langInput, setLangInput] = useState('');
  const catalog = getCatalog(system.id);
  const races = (catalog?.races ?? []) as Array<{ id: string; name: string; size?: string; favoredClass?: string; abilityMods?: Record<string, number>; skillBonuses?: Record<string, number>; abilities?: string[] }>;
  const catalogClassesForLabel = catalog?.classes ?? [];

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
  const classLabel = (id: string) => {
    const sys = system.classes?.find((c: any) => c.id === id);
    if (sys) return sys.name;
    const cat = catalogClassesForLabel.find((c) => c.id === id);
    return cat?.name ?? id;
  };

  return (
    <View style={styles.identityCard}>
      <Text style={styles.identityFieldLabel}>Nombre</Text>
      <TextInput
        style={[styles.identityNameInput, !onName && { color: '#94a3b8' }]}
        value={name}
        onChangeText={onName}
        editable={!!onName}
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

      {/* ── Rasgos raciales ──────────────────────────────────── */}
      {(() => {
        if (!currentRace) return null;
        const raceEntry = races.find((r) => r.name.toLowerCase() === currentRace.toLowerCase());
        if (!raceEntry) return null;
        const parts: string[] = [];
        for (const [attr, val] of Object.entries(raceEntry.abilityMods ?? {})) {
          const short: Record<string, string> = {
            Strength: 'FUE', Dexterity: 'DES', Constitution: 'CON',
            Intelligence: 'INT', Wisdom: 'SAB', Charisma: 'CAR',
          };
          const label = short[attr] ?? attr;
          parts.push(`${val > 0 ? '+' : ''}${val} ${label}`);
        }
        for (const [skill, val] of Object.entries(raceEntry.skillBonuses ?? {})) {
          parts.push(`+${val} ${skill}`);
        }
        const traits = raceEntry.abilities ?? [];
        return (
          <View style={styles.racialTraitsBox}>
            {parts.length > 0 ? (
              <View style={styles.racialBonusRow}>
                {parts.map((p, i) => (
                  <View key={i} style={styles.racialBonusChip}>
                    <Text style={styles.racialBonusText}>{p}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {traits.length > 0 ? (
              <Text style={styles.racialTraitsList} numberOfLines={3}>
                {traits.join(' · ')}
              </Text>
            ) : null}
          </View>
        );
      })()}

      {/* ── XP tracker ─────────────────────────────────────── */}
      {sessionMode ? (() => {
        const xp = typeof data.xp === 'number' ? data.xp : 0;
        const nextLvl = Math.min(20, totalLevel + 1);
        const xpNext = DND35_XP_TABLE[nextLvl] ?? 0;
        const xpCur  = DND35_XP_TABLE[totalLevel] ?? 0;
        const xpPct  = xpNext > xpCur ? Math.min(1, Math.max(0, (xp - xpCur) / (xpNext - xpCur))) : 1;
        const formatter = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`;
        return (
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>PX</Text>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <View style={styles.xpBarTrack}>
                <View style={[styles.xpBarFill, { width: `${Math.round(xpPct * 100)}%` as any }]} />
              </View>
              <Text style={styles.xpNums}>
                {formatter(xp)} / {formatter(xpNext)}
                {totalLevel >= 20 ? ' · Nivel máximo' : ` (Nv ${nextLvl})`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.xpEditBtn}
              onPress={() => { setXpInput(''); setXpModal('add'); }}
              onLongPress={() => { setXpInput(String(xp)); setXpModal('set'); }}
              delayLongPress={400}
            >
              <Text style={styles.xpEditText}>+PX</Text>
            </TouchableOpacity>
          </View>
        );
      })() : null}

      {/* ── Alineamiento ─────────────────────────────────────── */}
      {(() => {
        const ALIGNS = [
          ['legal-bueno',    'LB'], ['neutral-bueno',   'NB'], ['caótico-bueno',    'CB'],
          ['legal-neutral',  'LN'], ['neutral',         'N'],  ['caótico-neutral',  'CN'],
          ['legal-malvado',  'LM'], ['neutral-malvado', 'NM'], ['caótico-malvado',  'CM'],
        ] as const;
        const curAlign = String(data.alignment ?? '');
        return (
          <View style={styles.alignSection}>
            <Text style={styles.identityFieldLabel}>Alineamiento</Text>
            <View style={styles.alignGrid}>
              {ALIGNS.map(([id, label]) => {
                const active = curAlign === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.alignCell, active && styles.alignCellActive]}
                    onPress={() => setField('alignment', active ? '' : id)}
                  >
                    <Text style={[styles.alignCellText, active && styles.alignCellTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View> 
          </View>
        );
      })()}

      {/* ── Idiomas ──────────────────────────────────────────── */}
      {(() => {
        const langs: string[] = Array.isArray((data as any).languages) ? (data as any).languages : [];
        return (
          <View style={styles.langsSection}>
            <Text style={styles.identityFieldLabel}>Idiomas</Text>
            <View style={styles.langsRow}>
              {langs.map((l, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.langChip}
                  onLongPress={() => setField('languages', langs.filter((_, j) => j !== i))}
                >
                  <Text style={styles.langChipText}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.langInputRow}>
              <TextInput
                style={[styles.fieldInput, { flex: 1, marginTop: 0 }]}
                value={langInput}
                onChangeText={setLangInput}
                placeholder="Añadir idioma…"
                placeholderTextColor="#475569"
                onSubmitEditing={() => {
                  const t = langInput.trim();
                  if (t && !langs.includes(t)) setField('languages', [...langs, t]);
                  setLangInput('');
                }}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.langAddBtn}
                onPress={() => {
                  const t = langInput.trim();
                  if (t && !langs.includes(t)) setField('languages', [...langs, t]);
                  setLangInput('');
                }}
              >
                <Text style={styles.langAddBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            {langs.length > 0 ? (
              <Text style={styles.help}>Mantén pulsado un idioma para eliminarlo.</Text>
            ) : null}
          </View>
        );
      })()}

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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }}>
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

      {/* Modal edición / suma de PX */}
      <Modal visible={!!xpModal} transparent animationType="fade" onRequestClose={() => setXpModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 }]}>
            <Text style={styles.modalTitle}>
              {xpModal === 'add' ? 'Añadir PX' : 'Establecer PX'}
            </Text>
            <TextInput
              style={[styles.input, { fontSize: 22, textAlign: 'center' }]}
              keyboardType="numeric"
              value={xpInput}
              onChangeText={setXpInput}
              autoFocus
              selectTextOnFocus
              placeholder={xpModal === 'add' ? 'Cantidad a sumar' : 'PX totales'}
              placeholderTextColor="#64748b"
              onSubmitEditing={() => {
                const n = Number(xpInput);
                if (!Number.isNaN(n)) {
                  const cur = typeof data.xp === 'number' ? data.xp : 0;
                  setField('xp', Math.max(0, xpModal === 'add' ? cur + n : n));
                }
                setXpModal(null);
              }}
            />
            <Text style={styles.help}>
              {xpModal === 'add'
                ? 'Introduce los PX ganados para sumarlos al total.'
                : 'Mantén pulsado +PX para editar el total directamente.'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setXpModal(null)}>
                <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(124,58,237,0.4)' }]}
                onPress={() => {
                  const n = Number(xpInput);
                  if (!Number.isNaN(n)) {
                    const cur = typeof data.xp === 'number' ? data.xp : 0;
                    setField('xp', Math.max(0, xpModal === 'add' ? cur + n : n));
                  }
                  setXpModal(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {xpModal === 'add' ? 'Sumar' : 'Guardar'}
                </Text>
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
  // Bono total al atributo (racial + equipo + dotes) en términos de puntuación.
  // Fórmula: (modificador final − modificador base) × 2
  // Ejemplo: enano CON 10, racial +2, equipo +1 al mod → final mod = 2,
  //   base mod = floor((10-10)/2) = 0 → bonusScore = (2-0)*2 = 4 → "10(+4)"
  const baseMod = (score: number) => Math.floor((score - 10) / 2);
  const abilCells = ABIL.map(([lbl, k]) => {
    const score = (data as Record<string, unknown>)[k];
    const baseScore = typeof score === 'number' ? score : 10;
    const mod = finalStats[`mod_${k}`] ?? 0;
    const scoreBonus = (mod - baseMod(baseScore)) * 2;
    return { lbl, key: k, score: baseScore, mod, scoreBonus };
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
  // Normaliza un nombre de arma a la clave attack_with: canónica
  // (minúsculas, sin tildes, sin caracteres especiales, espacios simples).
  const slugifyWeapon = (name: string) =>
    'attack_with:' + name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim()
      .replace(/\s+/g, ' ');

  // Pre-compute feat bonuses keyed by target for weapon-specific lookup.
  // Normalizamos los targets almacenados en las dotes con el mismo slug para
  // que el usuario pueda escribir "Daga", "daga", "Dãga", etc. y se reconozca.
  const featBonusesByTarget: Record<string, number> = useMemo(() => {
    const feats: Array<{ bonuses?: Array<{ target: string; value: number }> }> =
      Array.isArray((data as any).feats) ? (data as any).feats : [];
    const acc: Record<string, number> = {};
    for (const f of feats) {
      for (const b of f.bonuses ?? []) {
        if (b.target && b.target.startsWith('attack_with:')) {
          const rawName = b.target.slice('attack_with:'.length);
          const normalizedKey = slugifyWeapon(rawName);
          acc[normalizedKey] = (acc[normalizedKey] ?? 0) + (b.value || 0);
        }
      }
    }
    return acc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const parseWeapon = (w: {
    name: string; bonuses?: Array<{ target: string; value: number }>; notes?: string;
  }) => {
    const bonuses = w.bonuses ?? [];
    const meleeBonus = bonuses.filter((b) => b.target === 'attack_melee').reduce((a, b) => a + (b.value || 0), 0);
    const rangedBonus = bonuses.filter((b) => b.target === 'attack_ranged').reduce((a, b) => a + (b.value || 0), 0);
    const damageBonus = bonuses.filter((b) => b.target === 'damage').reduce((a, b) => a + (b.value || 0), 0);
    const isRanged = bonuses.some((b) => b.target === 'attack_ranged');
    const baseAtk = (isRanged ? (actionMod('attack_ranged') ?? bab + dexMod) : (actionMod('attack_melee') ?? bab + strMod));
    const itemAtk = isRanged ? rangedBonus : meleeBonus;
    // Feat bonuses specific to this weapon (e.g. Weapon Focus)
    const weaponTarget = slugifyWeapon(w.name);
    const weaponFeatBonus = featBonusesByTarget[weaponTarget] ?? 0;
    const totalAtk = baseAtk + itemAtk + weaponFeatBonus;
    // Damage dice from notes (primer patrón NdM)
    const notes = String(w.notes ?? '');
    const diceMatch = notes.match(/(\d+d\d+)/i);
    const dice = diceMatch ? diceMatch[1] : '—';
    const dmgItemBonus = damageBonus !== 0 ? damageBonus : itemAtk; // prefer explicit damage bonus
    const dmgAbil = isRanged ? 0 : strMod;
    const dmgTotal = dmgAbil + dmgItemBonus;
    const dmgStr = `${dice}${dmgTotal !== 0 ? (dmgTotal > 0 ? `+${dmgTotal}` : `${dmgTotal}`) : ''}`;
    return { isRanged, totalAtk, dmgStr, notes, weaponFeatBonus };
  };

  return (
    <View style={styles.statsCard}>
      {/* CA y PG héroe + HP actual */}
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

        {/* PG máximos (valor permanente) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => openEdit('hp_max', 'PG máximos', 0, 9999)}
          delayLongPress={350}
          style={[styles.heroCard, styles.heroHp]}
        >
          <Text style={styles.heroLabel}>PG máx.</Text>
          <Text style={styles.heroValue}>{raw(hp)}</Text>
          <Text style={styles.heroSub}>Constitución</Text>
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
            <View style={styles.abilScoreRow}>
              <Text style={styles.abilScore}>{a.score}</Text>
              {a.scoreBonus !== 0 ? (
                <Text style={[styles.abilRacialBadge, { color: a.scoreBonus > 0 ? '#86efac' : '#fca5a5' }]}>
                  {a.scoreBonus > 0 ? `(+${a.scoreBonus})` : `(${a.scoreBonus})`}
                </Text>
              ) : null}
            </View>
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
                  <TouchableOpacity style={styles.weaponStat} onPress={() => {
                    const roll = Math.floor(Math.random() * 20) + 1;
                    const label = p.isRanged ? 'A distancia' : 'Cuerpo a cuerpo';
                    Alert.alert(w.name, `${label}\n🎲 d20: ${roll} + ${p.totalAtk}\n= ${roll + p.totalAtk}`);
                  }}>
                    <Text style={styles.weaponStatLabel}>{p.isRanged ? 'Ataque (D)' : 'Ataque (C)'}</Text>
                    <Text style={styles.weaponAtk}>{p.totalAtk >= 0 ? `+${p.totalAtk}` : `${p.totalAtk}`}</Text>
                  </TouchableOpacity>
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

// ─── Adventure / Session tab ────────────────────────────────────────────────
// Contiene el estado temporal del personaje durante la sesión:
// PG actuales, PG temporales, velocidad, tiradas de muerte, condiciones.
// Este estado es independiente de la hoja permanente y se puede resetear
// entre sesiones sin afectar al personaje base.

const CONDITIONS_LIST: Array<{ id: string; label: string; color: string }> = [
  { id: 'blind',       label: 'Cegado',      color: '#6b7280' },
  { id: 'deaf',        label: 'Sordo',        color: '#6b7280' },
  { id: 'stunned',     label: 'Aturdido',     color: '#ef4444' },
  { id: 'paralyzed',   label: 'Paralizado',   color: '#ef4444' },
  { id: 'unconscious', label: 'Inconsciente', color: '#991b1b' },
  { id: 'prone',       label: 'Tumbado',      color: '#f59e0b' },
  { id: 'entangled',   label: 'Aprisionado',  color: '#f59e0b' },
  { id: 'frightened',  label: 'Asustado',     color: '#f97316' },
  { id: 'shaken',      label: 'Tembloroso',   color: '#f97316' },
  { id: 'fatigued',    label: 'Fatigado',     color: '#a78bfa' },
  { id: 'exhausted',   label: 'Agotado',      color: '#7c3aed' },
  { id: 'sickened',    label: 'Enfermo',      color: '#84cc16' },
];

function AdventureTab({
  data, setData, hp, bab, strMod, dexMod, finalActions,
}: {
  data: Record<string, unknown>;
  setData: (d: Record<string, unknown>) => void;
  hp: number;
  bab: number;
  strMod: number;
  dexMod: number;
  finalActions: RollableAction[];
}) {
  // All session state lives under data.sessionState so it's cleanly separable
  // from the permanent sheet data.
  const ss = ((data as any).sessionState ?? {}) as Record<string, unknown>;
  const setSS = (patch: Record<string, unknown>) =>
    setData({ ...data, sessionState: { ...ss, ...patch } });

  const hpCur: number = typeof ss.hp_cur === 'number' ? ss.hp_cur : hp;
  const hpTemp: number = typeof ss.hp_temp === 'number' ? Math.max(0, ss.hp_temp) : 0;
  const speed: number = typeof ss.speed === 'number' ? ss.speed :
    typeof (data as any).speed === 'number' ? (data as any).speed : 30;
  const ds = (ss.deathSaves as any) ?? { s: 0, f: 0 };
  const conditions: string[] = Array.isArray(ss.conditions) ? (ss.conditions as string[]) : [];
  // Spell slots used — mirror of SpellsTab but session-owned
  const slots: Record<number, { max: number; used: number }> =
    (data.spellSlots as any) ?? {};

  const hpPct = hp > 0 ? Math.min(1, Math.max(0, hpCur / hp)) : 0;
  const hpColor = hpPct > 0.5 ? '#34d399' : hpPct > 0.25 ? '#fbbf24' : '#f87171';

  const [editKey, setEditKey] = useState<{ key: string; label: string; min: number; max: number } | null>(null);
  const [editVal, setEditVal] = useState('');
  function openEdit(key: string, label: string, min: number, max: number, cur: number) {
    setEditVal(String(cur)); setEditKey({ key, label, min, max });
  }
  function commitEdit() {
    if (!editKey) return;
    const n = Number(editVal);
    if (Number.isNaN(n)) { setEditKey(null); return; }
    const v = Math.min(editKey.max, Math.max(editKey.min, n));
    if (editKey.key === 'speed') setSS({ speed: v });
    else if (editKey.key === 'hp_cur') setSS({ hp_cur: v });
    else if (editKey.key === 'hp_temp') setSS({ hp_temp: v });
    setEditKey(null);
  }

  function useSlot(level: number) {
    const cur = slots[level] ?? { max: 0, used: 0 };
    if (cur.used >= cur.max) return;
    setData({ ...data, spellSlots: { ...slots, [level]: { ...cur, used: cur.used + 1 } } });
  }
  function restoreSlot(level: number) {
    const cur = slots[level] ?? { max: 0, used: 0 };
    if (cur.used <= 0) return;
    setData({ ...data, spellSlots: { ...slots, [level]: { ...cur, used: cur.used - 1 } } });
  }
  function longRestSlots() {
    const reset = Object.fromEntries(
      Object.entries(slots).map(([k, v]) => [k, { ...(v as any), used: 0 }])
    );
    setData({ ...data, spellSlots: reset });
  }
  const usedLevels = [1,2,3,4,5,6,7,8,9].filter((l) => (slots[l]?.max ?? 0) > 0);

  function resetSession() {
    Alert.alert(
      'Resetear sesión',
      'Restaura PG al máximo, borra condiciones, tiradas de muerte y recupera todos los espacios de conjuro. El personaje base no cambia.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Resetear', style: 'destructive', onPress: () => {
          const resetSlots = Object.fromEntries(
            Object.entries(slots).map(([k, v]) => [k, { ...(v as any), used: 0 }])
          );
          setData({
            ...data,
            spellSlots: resetSlots,
            sessionState: { hp_cur: hp, hp_temp: 0, speed, deathSaves: { s: 0, f: 0 }, conditions: [] },
          });
        }},
      ]
    );
  }

  const actionMod = (id: string) => {
    const a = finalActions.find((x) => x.id === id);
    return a ? a.modifier : 0;
  };
  function rollDice(sides: number, mod: number, label: string) {
    const roll = Math.floor(Math.random() * sides) + 1;
    Alert.alert(label, `🎲 d${sides}: ${roll}${mod !== 0 ? ` ${mod >= 0 ? '+' : ''}${mod}` : ''}\n= ${roll + mod}`);
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>Estado de sesión</Text>
        <TouchableOpacity
          style={[styles.addBtn, { marginTop: 0, paddingHorizontal: 12, paddingVertical: 6 }]}
          onPress={resetSession}
        >
          <Text style={[styles.addBtnText, { fontSize: 11 }]}>↺ Nueva sesión</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.help}>
        Estado temporal: se resetea entre sesiones. El personaje base (Hoja) no cambia.
      </Text>

      {/* ── PG actuales ──────────────────────────────────────── */}
      <View style={styles.statsCard}>
        <View style={styles.heroRow}>
          {/* HP card */}
          <View style={[styles.heroCard, styles.heroHp, { justifyContent: 'space-between' }]}>
            <TouchableOpacity onLongPress={() => openEdit('hp_cur', 'PG actuales', 0, hp + 200, hpCur)} delayLongPress={350}>
              <Text style={styles.heroLabel}>PG</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Text style={[styles.heroValue, { color: hpColor }]}>{hpCur}</Text>
                {hpTemp > 0 ? <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: '700' }}>+{hpTemp}</Text> : null}
                <Text style={{ color: '#64748b', fontSize: 13 }}>/{hp}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.hpBarTrack}>
              <View style={[styles.hpBarFill, { width: `${Math.round(hpPct * 100)}%` as any, backgroundColor: hpColor }]} />
              {hpTemp > 0 && hp > 0 ? (
                <View style={[styles.hpBarFill, {
                  position: 'absolute', left: `${Math.round(hpPct * 100)}%` as any,
                  width: `${Math.min(100 - Math.round(hpPct * 100), Math.round((hpTemp / hp) * 100))}%` as any,
                  backgroundColor: '#fbbf24', opacity: 0.7,
                }]} />
              ) : null}
            </View>
            <View style={styles.hpBtnRow}>
              <TouchableOpacity style={styles.hpBtn} onPress={() => setSS({ hp_cur: Math.max(0, hpCur - 1) })}>
                <Text style={styles.hpBtnText}>−1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.hpBtn} onPress={() => setSS({ hp_cur: Math.min(hp, hpCur + 1) })}>
                <Text style={[styles.hpBtnText, { color: '#34d399' }]}>+1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.hpBtn, { opacity: 0.7 }]} onPress={() => setSS({ hp_cur: hp })}>
                <Text style={[styles.hpBtnText, { color: '#a78bfa', fontSize: 9 }]}>Full</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.hpBtn}
                onPress={() => openEdit('hp_temp', 'PG temporales', 0, 999, hpTemp)}
                onLongPress={() => setSS({ hp_temp: 0 })}>
                <Text style={[styles.hpBtnText, { color: hpTemp > 0 ? '#fbbf24' : '#475569', fontSize: 9 }]}>
                  {hpTemp > 0 ? `Tmp:${hpTemp}` : '+Tmp'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Side stats */}
          <View style={styles.heroSideCol}>
            <TouchableOpacity style={styles.heroSmall}
              onLongPress={() => openEdit('speed', 'Velocidad (pies)', 0, 120, speed)} delayLongPress={350}>
              <Text style={styles.heroSmallLabel}>Vel.</Text>
              <Text style={styles.heroSmallValue}>{speed}p</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroSmall} onPress={() => rollDice(20, actionMod('initiative'), 'Iniciativa')}>
              <Text style={styles.heroSmallLabel}>Init.</Text>
              <Text style={styles.heroSmallValue}>{actionMod('initiative') >= 0 ? '+' : ''}{actionMod('initiative')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tiradas de muerte (cuando PG ≤ 0) ──────────────── */}
        {hpCur <= 0 ? (() => {
          const toggleDS = (kind: 's' | 'f') => {
            const cur = (ds[kind] ?? 0) as number;
            setSS({ deathSaves: { ...ds, [kind]: cur >= 3 ? 0 : cur + 1 } });
          };
          return (
            <View style={styles.deathSavesBox}>
              <Text style={styles.deathSavesTitle}>⚠ Tiradas de Muerte</Text>
              <View style={styles.deathSavesRow}>
                <Text style={styles.deathSavesLabel}>Éxitos</Text>
                <View style={styles.deathPips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity key={i}
                      style={[styles.deathPip, styles.deathPipSuccess, i < ds.s ? styles.deathPipOn : undefined]}
                      onPress={() => toggleDS('s')} />
                  ))}
                </View>
                <Text style={styles.deathSavesLabel}>Fallos</Text>
                <View style={styles.deathPips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity key={i}
                      style={[styles.deathPip, styles.deathPipFail, i < ds.f ? styles.deathPipFailOn : undefined]}
                      onPress={() => toggleDS('f')} />
                  ))}
                </View>
                <TouchableOpacity style={styles.deathResetBtn} onPress={() => setSS({ deathSaves: { s: 0, f: 0 } })}>
                  <Text style={styles.deathResetText}>↺</Text>
                </TouchableOpacity>
              </View>
              {ds.s >= 3 ? <Text style={{ color: '#34d399', fontSize: 11, marginTop: 4 }}>¡Estabilizado!</Text> : null}
              {ds.f >= 3 ? <Text style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>Muerto.</Text> : null}
            </View>
          );
        })() : null}
      </View>

      {/* ── Espacios de conjuro (usados en sesión) ───────────── */}
      {usedLevels.length > 0 ? (
        <View style={styles.slotSection}>
          <View style={styles.slotHeader}>
            <Text style={styles.subgroupHero}>Espacios de conjuro</Text>
            <TouchableOpacity onPress={longRestSlots} style={styles.longRestBtn}>
              <Text style={styles.longRestText}>Descanso largo</Text>
            </TouchableOpacity>
          </View>
          {usedLevels.map((lvl) => {
            const s = slots[lvl];
            return (
              <View key={lvl} style={styles.slotRow}>
                <Text style={styles.slotLevelLabel}>Nv {lvl}</Text>
                <View style={styles.slotPips}>
                  {Array.from({ length: s.max }).map((_, i) => (
                    <TouchableOpacity key={i}
                      style={[styles.slotPip, i < s.used && styles.slotPipUsed]}
                      onPress={() => i < s.used ? restoreSlot(lvl) : useSlot(lvl)}
                    />
                  ))}
                </View>
                <Text style={[styles.slotMaxVal, { marginLeft: 6 }]}>{s.max - s.used}/{s.max}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ── Tiradas rápidas ──────────────────────────────────── */}
      <View style={styles.statsCard}>
        <Text style={styles.subgroupHero}>Tiradas rápidas</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([
            ['Fortaleza', 'fort'],
            ['Reflejos', 'ref'],
            ['Voluntad', 'will'],
            ['Cuerpo a cuerpo', 'attack_melee'],
            ['A distancia', 'attack_ranged'],
          ] as [string, string][]).map(([label, id]) => {
            const mod = actionMod(id);
            return (
              <TouchableOpacity key={id} style={styles.actionChip}
                onPress={() => rollDice(20, mod, label)}>
                <Text style={styles.actionLabel}>{label}</Text>
                <Text style={styles.actionMod}>d20 {mod >= 0 ? '+' : ''}{mod}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── Condiciones activas ───────────────────────────────── */}
      <View style={styles.statsCard}>
        <Text style={styles.subgroupHero}>Condiciones</Text>
        <View style={styles.conditionsGrid}>
          {CONDITIONS_LIST.map((c) => {
            const on = conditions.includes(c.id);
            return (
              <TouchableOpacity key={c.id}
                style={[styles.conditionChip, on && { backgroundColor: `${c.color}33`, borderColor: c.color }]}
                onPress={() => {
                  const next = on ? conditions.filter((x) => x !== c.id) : [...conditions, c.id];
                  setSS({ conditions: next });
                }}
              >
                <Text style={[styles.conditionText, on && { color: c.color, fontWeight: '700' }]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Editor rápido */}
      <Modal visible={!!editKey} transparent animationType="fade" onRequestClose={() => setEditKey(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 }]}>
            <Text style={styles.modalTitle}>{editKey?.label ?? ''}</Text>
            <TextInput
              style={[styles.input, { fontSize: 22, textAlign: 'center' }]}
              keyboardType="numeric" value={editVal} onChangeText={setEditVal}
              autoFocus selectTextOnFocus onSubmitEditing={commitEdit}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setEditKey(null)}>
                <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(124,58,237,0.4)' }]} onPress={commitEdit}>
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

          <View style={styles.slotFilterRow}>
            {slots.map((s: any) => (
              <TouchableOpacity key={s.id}
                style={[styles.slotChip, it.slot === s.id && styles.slotChipActive]}
                onPress={() => patch(it.id, { slot: s.id })}>
                <Text style={[styles.slotChipText, it.slot === s.id && styles.slotChipTextActive]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Bono de arma (solo para slots de arma) ──────────── */}
          {it.slot.startsWith('weapon') ? (() => {
            const isRangedSlot = it.slot === 'weapon_off'
              ? it.bonuses.some((b) => b.target === 'attack_ranged')
              : it.bonuses.some((b) => b.target === 'attack_ranged');
            const atkTarget = isRangedSlot ? 'attack_ranged' : 'attack_melee';
            const enhAtk = it.bonuses.find((b) => b.target === atkTarget && b.type === 'enhancement')?.value ?? 0;
            const enhDmg = it.bonuses.find((b) => b.target === 'damage' && b.type === 'enhancement')?.value ?? 0;

            function setEnhancement(atkVal: number, dmgVal: number, tgt: string) {
              let next = it.bonuses.filter(
                (b) => !(b.type === 'enhancement' && (b.target === 'attack_melee' || b.target === 'attack_ranged' || b.target === 'damage'))
              );
              if (atkVal !== 0) next = [...next, { target: tgt, value: atkVal, type: 'enhancement' as const }];
              if (dmgVal !== 0) next = [...next, { target: 'damage', value: dmgVal, type: 'enhancement' as const }];
              patch(it.id, { bonuses: next });
            }

            const step = (field: 'atk' | 'dmg', delta: number) => {
              const tgt = it.bonuses.some((b) => b.target === 'attack_ranged') ? 'attack_ranged' : 'attack_melee';
              if (field === 'atk') setEnhancement(enhAtk + delta, enhDmg, tgt);
              else setEnhancement(enhAtk, enhDmg + delta, tgt);
            };

            const toggleRanged = () => {
              const nowRanged = it.bonuses.some((b) => b.target === 'attack_ranged');
              const newTgt = nowRanged ? 'attack_melee' : 'attack_ranged';
              const oldTgt = nowRanged ? 'attack_ranged' : 'attack_melee';
              patch(it.id, {
                bonuses: it.bonuses.map((b) =>
                  b.target === oldTgt && b.type === 'enhancement' ? { ...b, target: newTgt } : b
                ),
              });
            };

            return (
              <View style={styles.weaponStatBox}>
                <View style={styles.weaponStatRow}>
                  <View style={styles.weaponStatCell}>
                    <Text style={styles.weaponStatLabel}>Bono ataque</Text>
                    <View style={styles.weaponStatStepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step('atk', -1)}>
                        <Text style={styles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepValue}>{enhAtk >= 0 ? `+${enhAtk}` : `${enhAtk}`}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step('atk', 1)}>
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.weaponStatHint}>Mejora · apila con dotes</Text>
                  </View>
                  <View style={styles.weaponStatCell}>
                    <Text style={styles.weaponStatLabel}>Bono daño</Text>
                    <View style={styles.weaponStatStepper}>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step('dmg', -1)}>
                        <Text style={styles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepValue}>{enhDmg >= 0 ? `+${enhDmg}` : `${enhDmg}`}</Text>
                      <TouchableOpacity style={styles.stepBtn} onPress={() => step('dmg', 1)}>
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.weaponStatHint}>Mejora (mismo valor)</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.rangedToggle} onPress={toggleRanged}>
                  <Text style={styles.rangedToggleText}>
                    {it.bonuses.some((b) => b.target === 'attack_ranged') ? '🏹 A distancia' : '⚔ Cuerpo a cuerpo'}
                    {'  (toca para cambiar)'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.weaponStatHint} numberOfLines={2}>
                  {'Para dotes específicas (Concentración en arma): añádelas en la pestaña Dotes → bono "⚔ Ataque con arma específica…"'}
                </Text>
              </View>
            );
          })() : null}

          <Text style={styles.subgroup}>Otros bonos</Text>
          {it.bonuses.filter((b) => b.type !== 'enhancement' || !it.slot.startsWith('weapon')).length === 0
            ? <Text style={styles.muted}>Sin bonos adicionales. Pulsa "+ Añadir bono".</Text>
            : null}
          {it.bonuses.map((b, idx) => {
            // Ocultar en weapons los enhancement ya gestionados arriba
            if (it.slot.startsWith('weapon') && b.type === 'enhancement' &&
                (b.target === 'attack_melee' || b.target === 'attack_ranged' || b.target === 'damage')) {
              return null;
            }
            return (
              <BonusEditorRow
                key={idx}
                targets={targets as BonusTargetDef[]}
                bonus={b}
                onChange={(p) => toggleBonus(it.id, idx, p)}
                onRemove={() => removeBonus(it.id, idx)}
              />
            );
          })}
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
  const [coinEdit, setCoinEdit] = useState<{ key: string; label: string } | null>(null);
  const [coinInput, setCoinInput] = useState('');

  // D&D 3.5 encumbrance thresholds indexed by STR score (1-29+)
  // [light, medium, heavy] in pounds
  const ENC_TABLE: Record<number, [number, number, number]> = {
    1:[3,6,10],2:[6,13,20],3:[10,20,30],4:[13,26,40],5:[16,33,50],
    6:[20,40,60],7:[23,46,70],8:[26,53,80],9:[30,60,90],10:[33,66,100],
    11:[38,76,115],12:[43,86,130],13:[50,100,150],14:[58,116,175],15:[66,133,200],
    16:[76,153,230],17:[86,173,260],18:[100,200,300],19:[116,233,350],20:[133,266,400],
    21:[153,306,460],22:[173,346,520],23:[200,400,600],24:[233,466,700],25:[266,533,800],
    26:[306,613,920],27:[346,693,1040],28:[400,800,1200],29:[466,933,1400],
  };
  const strScore = Math.max(1, Math.min(29, Number((data as any).str) || 10));
  const [lightLb, medLb, heavyLb] = ENC_TABLE[strScore] ?? [33, 66, 100];
  // Coin weight: 50 coins = 1 lb (D&D 3.5)
  const coinWeight = (
    (Number((data as any).coin_pp) || 0) +
    (Number((data as any).coin_po) || 0) +
    (Number((data as any).coin_pe) || 0) +
    (Number((data as any).coin_pc) || 0)
  ) / 50;
  // Item weight from notes like "5 lb" or just numeric qty×0 (no known weight)
  const itemWeight = items.reduce((sum, it) => {
    const match = String(it.name + ' ' + (it as any).notes ?? '').match(/(\d+(?:\.\d+)?)\s*lb/i);
    const w = match ? parseFloat(match[1]) : 0;
    return sum + w * (it.qty || 1);
  }, 0);
  const totalWeight = Math.round((coinWeight + itemWeight) * 10) / 10;
  const encLevel = totalWeight <= lightLb ? 'Ligera' : totalWeight <= medLb ? 'Media' : totalWeight <= heavyLb ? 'Pesada' : 'Sobrecargado';
  const encColor = totalWeight <= lightLb ? '#34d399' : totalWeight <= medLb ? '#fbbf24' : totalWeight <= heavyLb ? '#f97316' : '#f87171';
  const encPct = Math.min(1, totalWeight / heavyLb);

  const COINS = [
    { key: 'coin_pp', label: 'PP', color: '#a78bfa' },
    { key: 'coin_po', label: 'PO', color: '#fbbf24' },
    { key: 'coin_pe', label: 'PE', color: '#94a3b8' },
    { key: 'coin_pc', label: 'PC', color: '#d97706' },
  ];
  const getCoin = (k: string) => Math.max(0, Number((data as Record<string, unknown>)[k]) || 0);

  function update(next: InventoryItem[]) { setData({ ...data, inventory: next }); }
  function add() { update([...items, { id: uid(), name: 'Nuevo item', qty: 1 }]); }
  function patch(id: string, p: Partial<InventoryItem>) {
    update(items.map((it) => it.id === id ? { ...it, ...p } : it));
  }
  function remove(id: string) { update(items.filter((it) => it.id !== id)); }

  return (
    <View>
      <Text style={styles.sectionTitle}>Mochila</Text>

      {/* ── Monedas ──────────────────────────────────────────── */}
      <View style={styles.coinsRow}>
        {COINS.map((c) => {
          const val = getCoin(c.key);
          return (
            <TouchableOpacity
              key={c.key}
              style={styles.coinCard}
              onPress={() => { setCoinInput(String(val)); setCoinEdit(c); }}
            >
              <Text style={[styles.coinLabel, { color: c.color }]}>{c.label}</Text>
              <Text style={styles.coinValue}>{val}</Text>
              <View style={styles.coinBtns}>
                <TouchableOpacity
                  style={styles.coinBtn}
                  onPress={() => setData({ ...data, [c.key]: Math.max(0, val - 1) })}
                >
                  <Text style={styles.coinBtnText}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.coinBtn}
                  onPress={() => setData({ ...data, [c.key]: val + 1 })}
                >
                  <Text style={[styles.coinBtnText, { color: '#34d399' }]}>+</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.help}>Toca una moneda para editar el total. PP=10PO, PO=10PE=100PC.</Text>

      {/* ── Encumbrance ──────────────────────────────────────── */}
      <View style={styles.encBox}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={[styles.encLevel, { color: encColor }]}>{encLevel}</Text>
          <Text style={styles.encWeight}>{totalWeight} lb</Text>
        </View>
        <View style={styles.encBarTrack}>
          <View style={[styles.encBarFill, { width: `${Math.round(encPct * 100)}%` as any, backgroundColor: encColor }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={styles.encThreshold}>Lig. ≤{lightLb}</Text>
          <Text style={styles.encThreshold}>Med. ≤{medLb}</Text>
          <Text style={styles.encThreshold}>Pes. ≤{heavyLb} lb (FUE {strScore})</Text>
        </View>
      </View>

      {/* Modal edición de monedas */}
      <Modal visible={!!coinEdit} transparent animationType="fade" onRequestClose={() => setCoinEdit(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: 20 }]}>
            <Text style={styles.modalTitle}>{coinEdit?.label ?? ''}</Text>
            <TextInput
              style={[styles.input, { fontSize: 22, textAlign: 'center' }]}
              keyboardType="numeric"
              value={coinInput}
              onChangeText={setCoinInput}
              autoFocus selectTextOnFocus
              onSubmitEditing={() => {
                const n = Number(coinInput);
                if (!Number.isNaN(n) && coinEdit) setData({ ...data, [coinEdit.key]: Math.max(0, n) });
                setCoinEdit(null);
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setCoinEdit(null)}>
                <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(124,58,237,0.4)' }]}
                onPress={() => {
                  const n = Number(coinInput);
                  if (!Number.isNaN(n) && coinEdit) setData({ ...data, [coinEdit.key]: Math.max(0, n) });
                  setCoinEdit(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={[styles.subgroup, { marginTop: 8 }]}>Objetos</Text>
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
  const { width: windowWidth } = useWindowDimensions();
  const items: SpellEntry[] = Array.isArray(data.spells) ? data.spells : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [spellClassFilter, setSpellClassFilter] = useState<string | null>(null);
  const [detailSpell, setDetailSpell] = useState<SpellEntry | null>(null);
  const [selectedSpellLevel, setSelectedSpellLevel] = useState(0);
  const catalog = getCatalog(system.id);
  const catalogSpells = catalog?.spells ?? [];

  // Clases del personaje (para filtro de conjuros)
  const charClassNames = useMemo(() => {
    if (!Array.isArray((data as any).classes)) return [];
    return ((data as any).classes as Array<{ classId: string }>)
      .map((c) => {
        const def = catalog?.classes?.find((cl) => cl.id === c.classId);
        return def?.name ?? c.classId;
      })
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }, [(data as any).classes, catalog]);

  const visibleSpells = useMemo(() => {
    if (!spellClassFilter) return catalogSpells;
    return catalogSpells.filter((s) =>
      s.classes?.some((sc) => sc.toLowerCase() === spellClassFilter.toLowerCase()),
    );
  }, [catalogSpells, spellClassFilter]);

  // Conjuros del catálogo filtrados por nivel seleccionado (para el picker)
  const pickerSpells = useMemo(
    () => visibleSpells.filter((s) => s.level === selectedSpellLevel),
    [visibleSpells, selectedSpellLevel],
  );

  function update(next: SpellEntry[]) { setData({ ...data, spells: next }); }
  function add() { update([...items, { id: uid(), name: 'Conjuro', level: 0 }]); }

  // ── Espacios de conjuro ──
  // slots = { 1: {max:4, used:1}, 2: {max:3, used:0}, ... }
  const slots: Record<number, { max: number; used: number }> =
    (data.spellSlots as Record<number, { max: number; used: number }>) ?? {};
  function setSlotMax(level: number, max: number) {
    const cur = slots[level] ?? { max: 0, used: 0 };
    setData({ ...data, spellSlots: { ...slots, [level]: { ...cur, max: Math.max(0, max) } } });
  }
  function useSlot(level: number) {
    const cur = slots[level] ?? { max: 0, used: 0 };
    if (cur.used >= cur.max) return;
    setData({ ...data, spellSlots: { ...slots, [level]: { ...cur, used: cur.used + 1 } } });
  }
  function restoreSlot(level: number) {
    const cur = slots[level] ?? { max: 0, used: 0 };
    if (cur.used <= 0) return;
    setData({ ...data, spellSlots: { ...slots, [level]: { ...cur, used: cur.used - 1 } } });
  }
  function longRestSlots() {
    const reset = Object.fromEntries(
      Object.entries(slots).map(([k, v]) => [k, { ...(v as any), used: 0 }])
    );
    setData({ ...data, spellSlots: reset });
  }
  const usedLevels = [0,1,2,3,4,5,6,7,8,9].filter((l) => (slots[l]?.max ?? 0) > 0);

  function addFromCatalog(c: CatalogSpell) {
    setPickerOpen(false);
    update([...items, { id: uid(), name: c.name, level: c.level, notes: c.description }]);
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

  // ── Cálculo automático de espacios ──────────────────────────
  const computedSlots: SpellSlotResult | null = useMemo(
    () => (system.computeSpellSlots ? system.computeSpellSlots(data) as SpellSlotResult : null),
    [system, data],
  );
  const hasPreparedCaster = useMemo(
    () => computedSlots?.breakdown.some((b: SpellSlotBreakdown) => b.castingType === 'prepared') ?? false,
    [computedSlots],
  );
  const hasSpontaneousCaster = useMemo(
    () => computedSlots?.breakdown.some((b: SpellSlotBreakdown) => b.castingType === 'spontaneous') ?? false,
    [computedSlots],
  );
  // Si no hay info de sistema, mostramos el tracker manual siempre
  const showSlotTracker = hasSpontaneousCaster || !computedSlots;

  const hasWizard = useMemo(
    () => Array.isArray((data as any).classes) &&
      ((data as any).classes as Array<{ classId: string }>).some((c) => c.classId === 'wizard'),
    [(data as any).classes],
  );
  function syncFromComputed() {
    if (!computedSlots) return;
    const newSlots = { ...slots };
    for (const [sl, t] of Object.entries(computedSlots.totals)) {
      const k = Number(sl);
      const cur = newSlots[k] ?? { max: 0, used: 0 };
      newSlots[k] = { ...cur, max: t as number };
    }
    setData({ ...data, spellSlots: newSlots });
  }
  // ── Preparaciones del día (mago, clérigo, druida…) ──────────
  const prepSlots: PrepSlot[] = Array.isArray((data as any).preparedSlots)
    ? (data as any).preparedSlots as PrepSlot[]
    : [];
  function updatePrepSlots(next: PrepSlot[]) { setData({ ...data, preparedSlots: next }); }
  function addPrepSlot(spellName: string, spellLevel: number, slotLevel: number) {
    updatePrepSlots([...prepSlots, { id: uid(), spellName, spellLevel, slotLevel, used: false }]);
  }
  function removePrepSlot(id: string) {
    updatePrepSlots(prepSlots.filter((p) => p.id !== id));
  }
  function patchPrepSlot(id: string, change: Partial<PrepSlot>) {
    updatePrepSlots(prepSlots.map((p) => p.id === id ? { ...p, ...change } : p));
  }
  const [prepPickerSpell, setPrepPickerSpell] = useState<{ name: string; level: number } | null>(null);

  function longRestPrepared() {
    updatePrepSlots(prepSlots.map((p) => ({ ...p, used: false })));
  }

  const CLASS_NAMES_35: Record<string, string> = {
    wizard: 'Mago', cleric: 'Clérigo', druid: 'Druida', sorcerer: 'Hechicero',
    bard: 'Bardo', paladin: 'Paladín', ranger: 'Explorador',
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Conjuros</Text>

      {/* ── Panel calculado automáticamente ─────────────────── */}
      {computedSlots && (
        <View style={styles.slotSection}>
          <View style={styles.slotHeader}>
            <Text style={styles.subgroupHero}>Calculado por clase</Text>
            <TouchableOpacity onPress={syncFromComputed} style={styles.longRestBtn}>
              <Text style={styles.longRestText}>▶ Sincronizar</Text>
            </TouchableOpacity>
          </View>

          {/* Toggle especialización de mago */}
          {hasWizard && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.help, { flex: 1, marginTop: 0 }]}>Mago especialista (+1 espacio/nivel)</Text>
              <Switch
                value={!!(data as any).wizardSpecialty}
                onValueChange={(v) => setData({ ...data, wizardSpecialty: v })}
                trackColor={{ false: '#1e1b4b', true: '#7c3aed' }}
              />
            </View>
          )}

          {/* Desglose por clase */}
          {computedSlots.breakdown.map((bd: SpellSlotBreakdown, i: number) => {
            const allLevels = Array.from(
              new Set([...Object.keys(bd.base), ...Object.keys(bd.bonus), ...Object.keys(bd.extra)].map(Number)),
            ).sort((a, b) => a - b);
            return (
              <View key={i} style={{ marginBottom: 8 }}>
                <Text style={styles.subgroup}>
                  {CLASS_NAMES_35[bd.className] ?? bd.className}{' '}
                  · {bd.abilityLabel} {bd.mod >= 0 ? `+${bd.mod}` : bd.mod}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {allLevels.map((sl) => {
                    const b  = bd.base[sl]  ?? 0;
                    const bo = bd.bonus[sl] ?? 0;
                    const ex = bd.extra[sl] ?? 0;
                    const total = b + bo + ex;
                    if (total === 0 && b === 0) return null;
                    const parts = [String(b)];
                    if (bo > 0) parts.push(`+${bo}`);
                    if (ex > 0) parts.push(`+${ex}✦`);
                    return (
                      <View key={sl} style={styles.slotCalcChip}>
                        <Text style={styles.slotCalcLevel}>{sl === 0 ? 'Trucos' : `N${sl}`}</Text>
                        <Text style={styles.slotCalcTotal}>{total}</Text>
                        {(bo > 0 || ex > 0) && (
                          <Text style={styles.slotCalcDetail}>{parts.join('')}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Totales */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <Text style={[styles.help, { marginRight: 6, marginTop: 0 }]}>Total:</Text>
            {[0,1,2,3,4,5,6,7,8,9].map((sl) => {
              const t = computedSlots.totals[sl] ?? 0;
              if (t === 0) return null;
              return (
                <View key={sl} style={[styles.slotCalcChip, { backgroundColor: '#3b0764' }]}>
                  <Text style={styles.slotCalcLevel}>{sl === 0 ? 'Trucos' : `N${sl}`}</Text>
                  <Text style={[styles.slotCalcTotal, { color: '#e9d5ff' }]}>{t}</Text>
                </View>
              );
            })}
          </View>
          <Text style={[styles.help, { marginTop: 4 }]}>
            ✦ = dominio / especialización · Sincronizar copia los totales al tracker
          </Text>
        </View>
      )}

      {/* ── Tracker espontáneo: pool de espacios por nivel (Hechicero, Bardo) ── */}
      {showSlotTracker && (
        <View style={styles.slotSection}>
          <View style={styles.slotHeader}>
            <Text style={styles.subgroupHero}>
              {hasSpontaneousCaster ? 'Espacios de conjuro' : 'Espacios de conjuro'}
            </Text>
            {usedLevels.length > 0 ? (
              <TouchableOpacity onPress={longRestSlots} style={styles.longRestBtn}>
                <Text style={styles.longRestText}>Descanso largo</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {hasSpontaneousCaster && (
            <Text style={[styles.help, { marginBottom: 6, marginTop: 0 }]}>
              Pool compartido · lanza cualquier conjuro conocido
            </Text>
          )}
          {[0,1,2,3,4,5,6,7,8,9].map((lvl) => {
            const s = slots[lvl] ?? { max: 0, used: 0 };
            if (s.max === 0 && !(computedSlots?.totals[lvl])) return null;
            return (
              <View key={lvl} style={styles.slotRow}>
                <Text style={styles.slotLevelLabel}>{lvl === 0 ? 'Trucos' : `Nv ${lvl}`}</Text>
                <View style={styles.slotPips}>
                  {Array.from({ length: Math.max(s.max, 0) }).map((_, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.slotPip, i < s.used && styles.slotPipUsed]}
                      onPress={() => i < s.used ? restoreSlot(lvl) : useSlot(lvl)}
                    />
                  ))}
                </View>
                <View style={styles.slotMaxEdit}>
                  <TouchableOpacity onPress={() => setSlotMax(lvl, s.max - 1)} style={styles.slotMaxBtn}>
                    <Text style={styles.slotMaxBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.slotMaxVal}>{s.max}</Text>
                  <TouchableOpacity onPress={() => setSlotMax(lvl, s.max + 1)} style={styles.slotMaxBtn}>
                    <Text style={styles.slotMaxBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          <Text style={styles.help}>Toca un pip para gastar/recuperar. Cambia el máximo con −/+.</Text>
        </View>
      )}

      {/* ── Preparación del día (Mago, Clérigo, Druida…) ────────────────────── */}
      {hasPreparedCaster && (() => {
        const anyUsed = prepSlots.some((p) => p.used);
        const slotLevelsUsed = [...new Set(prepSlots.map((p) => p.slotLevel))].sort((a, b) => a - b);
        return (
          <View style={[styles.slotSection, { borderColor: 'rgba(251,191,36,0.2)' }]}>
            <View style={styles.slotHeader}>
              <Text style={[styles.subgroupHero, { color: '#fbbf24' }]}>Preparación del día</Text>
              {anyUsed ? (
                <TouchableOpacity onPress={longRestPrepared} style={[styles.longRestBtn, { borderColor: 'rgba(251,191,36,0.3)', backgroundColor: 'rgba(251,191,36,0.1)' }]}>
                  <Text style={[styles.longRestText, { color: '#fbbf24' }]}>Descanso largo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={[styles.help, { marginBottom: 6, marginTop: 0 }]}>
              Toca 📖 en el grimorio · cada preparación ocupa un espacio · se puede preparar en espacio superior
            </Text>
            {prepSlots.length === 0 ? (
              <Text style={styles.muted}>Sin preparaciones hoy.</Text>
            ) : (
              slotLevelsUsed.map((lvl) => {
                const slotMax = slots[lvl]?.max || computedSlots?.totals[lvl] || 0;
                const lvlPreps = prepSlots.filter((p) => p.slotLevel === lvl);
                const remaining = lvlPreps.filter((p) => !p.used).length;
                const pct = lvlPreps.length > 0 ? remaining / lvlPreps.length : 1;
                const barColor = pct > 0.5 ? '#34d399' : pct > 0 ? '#fbbf24' : '#f87171';
                return (
                  <View key={lvl} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={styles.slotLevelLabel}>{lvl === 0 ? 'Trucos' : `Nv ${lvl}`}</Text>
                      <View style={styles.prepBarBg}>
                        <View style={[styles.prepBarFill, { flex: remaining / Math.max(lvlPreps.length, 1), backgroundColor: barColor }]} />
                        <View style={{ flex: (lvlPreps.length - remaining) / Math.max(lvlPreps.length, 1) }} />
                      </View>
                      <Text style={[styles.prepCount, { color: barColor }]}>{remaining}/{lvlPreps.length}</Text>
                      {slotMax > 0 && (
                        <Text style={[styles.help, { margin: 0, marginLeft: 6, fontSize: 10 }]}>de {slotMax} esp.</Text>
                      )}
                    </View>
                    {lvlPreps.map((ps) => (
                      <View key={ps.id} style={[styles.spellRow, ps.used && { opacity: 0.5 }]}>
                        <Text style={[styles.itemNameInput, { flex: 1, color: ps.used ? '#64748b' : '#e2d9ff' }]} numberOfLines={1}>
                          {ps.spellName}
                        </Text>
                        {ps.slotLevel > ps.spellLevel && (
                          <View style={{ backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginRight: 4 }}>
                            <Text style={{ color: '#a78bfa', fontSize: 10 }}>en Nv{ps.slotLevel}</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => patchPrepSlot(ps.id, { used: !ps.used })}
                          style={[styles.castBtn, ps.used && styles.castBtnUsed]}
                        >
                          <Text style={styles.castBtnText}>{ps.used ? '◇' : '◆'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removePrepSlot(ps.id)} style={styles.delBtn}>
                          <Text style={styles.delBtnText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>
        );
      })()}

      {/* ── Tabs por nivel (grimorio) ────────────────────────── */}
      {(() => {
        // Niveles relevantes: donde hay conjuros, hay slots calculados o hay tracker
        const spellLevels = new Set(items.map((s) => s.level));
        const slotLevels = new Set(
          [0,1,2,3,4,5,6,7,8,9].filter(
            (l) => (computedSlots?.totals[l] ?? 0) > 0 || (slots[l]?.max ?? 0) > 0,
          ),
        );
        const tabLevels = [...new Set([...spellLevels, ...slotLevels, 0])].sort((a, b) => a - b);

        // Asegurarse de que el tab seleccionado sea válido
        const activeLevel = tabLevels.includes(selectedSpellLevel) ? selectedSpellLevel : tabLevels[0];

        const levelSpells = items.filter((s) => s.level === activeLevel);
        const levelSlot = slots[activeLevel] ?? { max: 0, used: 0 };
        const computedTotal = computedSlots?.totals[activeLevel] ?? 0;

        return (
          <>
            {/* Barra de tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.spellLevelTabBar}
              contentContainerStyle={{ paddingRight: 8 }}
            >
              {tabLevels.map((lvl) => {
                const count = items.filter((s) => s.level === lvl).length;
                const isActive = lvl === activeLevel;
                const hasUsed = prepSlots.some((p) => p.spellLevel === lvl && p.used);
                return (
                  <TouchableOpacity
                    key={lvl}
                    style={[styles.spellLevelTab, isActive && styles.spellLevelTabActive]}
                    onPress={() => setSelectedSpellLevel(lvl)}
                  >
                    <Text style={[styles.spellLevelTabLabel, isActive && styles.spellLevelTabLabelActive]}>
                      {lvl === 0 ? 'Trucos' : `Nv ${lvl}`}
                    </Text>
                    {count > 0 && (
                      <View style={[styles.spellLevelBadge, isActive && styles.spellLevelBadgeActive]}>
                        <Text style={[styles.spellLevelBadgeText, hasUsed && { color: '#fbbf24' }]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Estado de slots para este nivel */}
            {(levelSlot.max > 0 || computedTotal > 0) && (
              <View style={styles.spellLevelSlotRow}>
                {showSlotTracker && levelSlot.max > 0 ? (
                  <>
                    <View style={styles.slotPips}>
                      {Array.from({ length: levelSlot.max }).map((_, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.slotPip, i < levelSlot.used && styles.slotPipUsed]}
                          onPress={() => i < levelSlot.used ? restoreSlot(activeLevel) : useSlot(activeLevel)}
                        />
                      ))}
                    </View>
                    <View style={styles.slotMaxEdit}>
                      <TouchableOpacity onPress={() => setSlotMax(activeLevel, levelSlot.max - 1)} style={styles.slotMaxBtn}>
                        <Text style={styles.slotMaxBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.slotMaxVal}>{levelSlot.max}</Text>
                      <TouchableOpacity onPress={() => setSlotMax(activeLevel, levelSlot.max + 1)} style={styles.slotMaxBtn}>
                        <Text style={styles.slotMaxBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
                {hasPreparedCaster && (() => {
                  const lvlPreps = prepSlots.filter((p) => p.slotLevel === activeLevel);
                  if (lvlPreps.length === 0) return null;
                  const castable = lvlPreps.filter((p) => !p.used).length;
                  return (
                    <Text style={[styles.prepCount, { marginLeft: 'auto', color: castable > 0 ? '#34d399' : '#f87171' }]}>
                      {castable}/{lvlPreps.length} prep.
                    </Text>
                  );
                })()
                }
                {computedTotal > 0 && !showSlotTracker ? (
                  <Text style={[styles.help, { margin: 0, color: '#a78bfa', fontSize: 11 }]}>
                    {computedTotal} espacios calculados
                  </Text>
                ) : null}
              </View>
            )}

            {/* Grimorio: lista del nivel activo */}

            {/* Grimorio: lista del nivel activo */}
            {levelSpells.length === 0 ? (
              <Text style={styles.muted}>
                {activeLevel === 0 ? 'Sin trucos en el grimorio.' : `Sin conjuros de Nv ${activeLevel} en el grimorio.`}
              </Text>
            ) : null}
            {levelSpells.map((sp) => (
              <View key={sp.id} style={styles.spellRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailSpell(sp)}>
                  <Text style={[styles.itemNameInput, { color: '#cbd5e1' }]} numberOfLines={1}>
                    {sp.name}
                  </Text>
                </TouchableOpacity>
                {hasPreparedCaster && (
                  <TouchableOpacity
                    onPress={() => setPrepPickerSpell({ name: sp.name, level: sp.level })}
                    style={[styles.castBtn, { backgroundColor: 'rgba(167,139,250,0.15)' }]}
                  >
                    <Text style={[styles.castBtnText, { color: '#a78bfa' }]}>📖</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => remove(sp.id)} style={styles.delBtn}>
                  <Text style={styles.delBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}

            {/* Acciones del nivel */}
            <TouchableOpacity style={styles.addBtn} onPress={() => {
              update([...items, { id: uid(), name: 'Conjuro', level: activeLevel }]);
            }}>
              <Text style={styles.addBtnText}>
                + Añadir {activeLevel === 0 ? 'truco' : `conjuro Nv ${activeLevel}`}
              </Text>
            </TouchableOpacity>
            {catalogSpells.length > 0 ? (
              <View>
                {charClassNames.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
                    <TouchableOpacity
                      style={[styles.filterChip, !spellClassFilter && styles.filterChipActive]}
                      onPress={() => setSpellClassFilter(null)}>
                      <Text style={[styles.filterChipText, !spellClassFilter && styles.filterChipTextActive]}>Todos</Text>
                    </TouchableOpacity>
                    {charClassNames.map((cn) => (
                      <TouchableOpacity
                        key={cn}
                        style={[styles.filterChip, spellClassFilter === cn && styles.filterChipActive]}
                        onPress={() => setSpellClassFilter(spellClassFilter === cn ? null : cn)}>
                        <Text style={[styles.filterChipText, spellClassFilter === cn && styles.filterChipTextActive]}>{cn}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}
                <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
                  <Text style={styles.addBtnText}>
                    📚 Catálogo ({visibleSpells.filter((s) => s.level === activeLevel).length} de Nv {activeLevel}
                    {spellClassFilter ? ` · ${spellClassFilter}` : ''})
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        );
      })()}
      {/* ── Modal: elegir espacio para preparar ──────────────────────────── */}
      <Modal visible={!!prepPickerSpell} transparent animationType="fade" onRequestClose={() => setPrepPickerSpell(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            {prepPickerSpell && (() => {
              const minLvl = prepPickerSpell.level;
              const availLevels = [0,1,2,3,4,5,6,7,8,9].filter((l) => {
                if (l < minLvl) return false;
                const slotMax = slots[l]?.max || computedSlots?.totals[l] || 0;
                return slotMax > 0;
              });
              return (
                <>
                  <Text style={styles.modalTitle}>Preparar: {prepPickerSpell.name}</Text>
                  <Text style={[styles.help, { marginTop: 0, marginBottom: 8 }]}>
                    Elige en qué espacio lo preparas (Nv {minLvl === 0 ? 'truco' : minLvl} mínimo):
                  </Text>
                  <ScrollView>
                    {availLevels.length === 0 ? (
                      <Text style={styles.muted}>Configura los espacios en el tracker primero.</Text>
                    ) : (
                      availLevels.map((lvl) => {
                        const slotMax = slots[lvl]?.max || computedSlots?.totals[lvl] || 0;
                        const occupied = prepSlots.filter((p) => p.slotLevel === lvl).length;
                        const free = Math.max(0, slotMax - occupied);
                        const disabled = free === 0;
                        return (
                          <TouchableOpacity
                            key={lvl}
                            disabled={disabled}
                            style={[styles.modalAction, { marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', opacity: disabled ? 0.4 : 1 }]}
                            onPress={() => { addPrepSlot(prepPickerSpell.name, prepPickerSpell.level, lvl); setPrepPickerSpell(null); }}
                          >
                            <Text style={{ color: '#e2e8f0', fontWeight: '600' }}>
                              {lvl === 0 ? 'Truco' : `Espacio Nv ${lvl}`}{lvl > minLvl ? ' ↑' : ''}
                            </Text>
                            <Text style={{ color: free > 0 ? '#34d399' : '#f87171', fontSize: 12 }}>
                              {free}/{slotMax} libres
                            </Text>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                  <TouchableOpacity style={[styles.modalAction, { marginTop: 12 }]} onPress={() => setPrepPickerSpell(null)}>
                    <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cancelar</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      <CatalogPicker
        visible={pickerOpen}
        title={`Conjuros Nv ${selectedSpellLevel} del catálogo`}
        source={catalog?.source}
        items={pickerSpells.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: (c.school ? `${c.school}` : '') +
            (c.classes && c.classes.length ? ` · ${c.classes.join('/')}` : '') +
            (c.description ? `\n${c.description}` : ''),
          raw: c,
        }))}
        onPick={(it) => addFromCatalog(it.raw as CatalogSpell)}
        onClose={() => setPickerOpen(false)}
      />

      {/* ── Detalle de conjuro ──────────────────────────────── */}
      <Modal visible={!!detailSpell} transparent animationType="slide" onRequestClose={() => setDetailSpell(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%', flex: 1, flexShrink: 1 }]}>
            {detailSpell ? (() => {
              // Busca datos enriquecidos en el catálogo
              const cat = catalogSpells.find((s) => s.name.toLowerCase() === detailSpell.name.toLowerCase());
              return (
                <>
                  <Text style={styles.modalTitle}>{detailSpell.name}</Text>
                  <View style={styles.detailMeta}>
                    <Text style={styles.detailMetaItem}>Nivel {detailSpell.level}</Text>
                    {cat?.school ? <Text style={styles.detailMetaItem}>{cat.school}</Text> : null}
                    {cat?.components ? <Text style={styles.detailMetaItem}>{cat.components}</Text> : null}
                    {cat?.casting_time ? <Text style={styles.detailMetaItem}>⏱ {cat.casting_time}</Text> : null}
                    {cat?.range ? <Text style={styles.detailMetaItem}>↔ {cat.range}</Text> : null}
                    {cat?.duration ? <Text style={styles.detailMetaItem}>⌛ {cat.duration}</Text> : null}
                    {cat?.saving_throw ? <Text style={styles.detailMetaItem}>🛡 {cat.saving_throw}</Text> : null}
                    {cat?.classes?.length ? <Text style={styles.detailMetaItem}>{cat.classes.join(', ')}</Text> : null}
                  </View>
                  <ScrollView style={{ marginTop: 8, flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                    <RenderHtml
                      contentWidth={windowWidth - 64}
                      source={{ html: descToHtml(cat?.description ?? detailSpell.notes ?? '') }}
                      baseStyle={{ color: '#cbd5e1', fontSize: 13, lineHeight: 20 }}
                      tagsStyles={{ p: { marginTop: 0, marginBottom: 8 }, em: { color: '#e2e8f0', fontStyle: 'italic' } }}
                    />
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setDetailSpell(null)}>
                      <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(239,68,68,0.25)' }]}
                      onPress={() => { remove(detailSpell.id); setDetailSpell(null); }}
                    >
                      <Text style={{ color: '#f87171', fontWeight: '600' }}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const FEAT_TYPE_CHIPS = ['General', 'Fighter', 'Metamagic', 'Epic', 'Item Creation', 'Psionic', 'Divine'];

// ─── Feats tab ────────────────────────────────────────────────
function FeatsTab({ system, data, setData }: any) {
  const { width: windowWidth } = useWindowDimensions();
  const items: FeatItem[] = Array.isArray(data.feats) ? data.feats : [];
  const targets = system.bonusTargets ?? [];
  const [featTypeFilter, setFeatTypeFilter] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailFeat, setDetailFeat] = useState<FeatItem | null>(null);
  const catalog = getCatalog(system.id);
  const catalogFeats: CatalogFeat[] = catalog?.feats ?? [];

  const visibleFeats = useMemo(() => {
    if (!featTypeFilter) return catalogFeats;
    return catalogFeats.filter((f) => f.type === featTypeFilter);
  }, [catalogFeats, featTypeFilter]);

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
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailFeat(it)}>
              <Text style={styles.itemNameInput} numberOfLines={1}>{it.name || 'Dote sin nombre'}</Text>
              {it.notes ? <Text style={styles.weaponNotes} numberOfLines={1}>{it.notes}</Text> : null}
            </TouchableOpacity>
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
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipRow}>
            <TouchableOpacity
              style={[styles.filterChip, !featTypeFilter && styles.filterChipActive]}
              onPress={() => setFeatTypeFilter(null)}>
              <Text style={[styles.filterChipText, !featTypeFilter && styles.filterChipTextActive]}>Todos</Text>
            </TouchableOpacity>
            {FEAT_TYPE_CHIPS.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.filterChip, featTypeFilter === t && styles.filterChipActive]}
                onPress={() => setFeatTypeFilter(featTypeFilter === t ? null : t)}>
                <Text style={[styles.filterChipText, featTypeFilter === t && styles.filterChipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[styles.addBtn, styles.addBtnSecondary]} onPress={() => setPickerOpen(true)}>
            <Text style={styles.addBtnText}>📚 Catálogo ({visibleFeats.length}{featTypeFilter ? ` · ${featTypeFilter}` : ''})</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <CatalogPicker
        visible={pickerOpen}
        title="Dotes del catálogo"
        source={catalog?.source}
        items={visibleFeats.map((c) => ({
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

      {/* ── Detalle de dote ─────────────────────────────────── */}
      <Modal visible={!!detailFeat} transparent animationType="slide" onRequestClose={() => setDetailFeat(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%', flex: 1, flexShrink: 1 }]}>
            {detailFeat ? (() => {
              const cat = catalogFeats.find((f) => f.name.toLowerCase() === detailFeat.name.toLowerCase());
              const prereq = cat?.prereq ?? cat?.prereqs ?? null;
              const bonuses = detailFeat.bonuses ?? cat?.bonuses ?? [];
              return (
                <>
                  <Text style={styles.modalTitle}>{detailFeat.name}</Text>
                  <View style={styles.detailMeta}>
                    {cat?.type ? <Text style={styles.detailMetaItem}>Tipo: {cat.type}</Text> : null}
                    {prereq ? <Text style={styles.detailMetaItem}>Prerreq: {String(prereq)}</Text> : null}
                    {bonuses.length > 0 ? (
                      <Text style={styles.detailMetaItem}>
                        Bonos: {bonuses.map((b: any) => `${b.target} ${b.value >= 0 ? '+' : ''}${b.value}`).join(', ')}
                      </Text>
                    ) : null}
                  </View>
                  <ScrollView style={{ marginTop: 8, flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                    <RenderHtml
                      contentWidth={windowWidth - 64}
                      source={{ html: descToHtml(cat?.description ?? detailFeat.notes ?? '') }}
                      baseStyle={{ color: '#cbd5e1', fontSize: 13, lineHeight: 20 }}
                      tagsStyles={{ p: { marginTop: 0, marginBottom: 8 }, em: { color: '#e2e8f0', fontStyle: 'italic' } }}
                    />
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setDetailFeat(null)}>
                      <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(239,68,68,0.25)' }]}
                      onPress={() => { remove(detailFeat.id); setDetailFeat(null); }}
                    >
                      <Text style={{ color: '#f87171', fontWeight: '600' }}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Skills tab ───────────────────────────────────────────────
// En 3.5 los rangos máximos son nivel+3 para habilidades de clase y
// (nivel+3)/2 para transclase. El bono total = rangos + mod atributo + misc.
function SkillsTab({ system, data, setData }: any) {
  const { width: windowWidth } = useWindowDimensions();
  const items: SkillEntry[] = Array.isArray(data.skills) ? data.skills : [];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<SkillEntry | null>(null);
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
              <TouchableOpacity onPress={() => setDetailSkill(it)} style={styles.infoBtn}>
                <Text style={styles.infoBtnText}>ⓘ</Text>
              </TouchableOpacity>
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

            <View style={styles.slotFilterRow}>
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

      {/* ── Detalle de habilidad ────────────────────────────── */}
      <Modal visible={!!detailSkill} transparent animationType="slide" onRequestClose={() => setDetailSkill(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%', flex: 1, flexShrink: 1 }]}>
            {detailSkill ? (() => {
              const cat = catalogSkills.find((s) => s.name.toLowerCase() === detailSkill.name.toLowerCase());
              const mod = abilMod(detailSkill.ability);
              const total = (detailSkill.ranks || 0) + mod + (detailSkill.miscMod || 0);
              return (
                <>
                  <Text style={styles.modalTitle}>{detailSkill.name}</Text>
                  <View style={styles.detailMeta}>
                    <Text style={styles.detailMetaItem}>{detailSkill.ability ?? '—'}</Text>
                    <Text style={styles.detailMetaItem}>Total {total >= 0 ? `+${total}` : total}</Text>
                    {detailSkill.classSkill ? <Text style={styles.detailMetaItem}>De clase</Text> : null}
                    {cat?.trainedOnly ? <Text style={styles.detailMetaItem}>Sólo entrenada</Text> : null}
                    {cat?.armorCheck ? <Text style={styles.detailMetaItem}>Pen. armadura</Text> : null}
                  </View>
                  {cat?.synergy && cat.synergy.length > 0 ? (
                    <Text style={[styles.help, { marginTop: 6 }]}>
                      Sinergia: {cat.synergy.join(', ')}
                    </Text>
                  ) : null}
                  <ScrollView style={{ marginTop: 8, flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                    <RenderHtml
                      contentWidth={windowWidth - 64}
                      source={{ html: descToHtml(detailSkill.notes ?? '') }}
                      baseStyle={{ color: '#cbd5e1', fontSize: 13, lineHeight: 20 }}
                      tagsStyles={{ p: { marginTop: 0, marginBottom: 8 }, em: { color: '#e2e8f0', fontStyle: 'italic' } }}
                    />
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity style={[styles.modalAction, { flex: 1 }]} onPress={() => setDetailSkill(null)}>
                      <Text style={{ color: '#94a3b8', fontWeight: '600' }}>Cerrar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalAction, { flex: 1, backgroundColor: 'rgba(239,68,68,0.25)' }]}
                      onPress={() => { remove(detailSkill.id); setDetailSkill(null); }}
                    >
                      <Text style={{ color: '#f87171', fontWeight: '600' }}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
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
  // For attack_with:<weaponName> targets
  const [weaponNameInput, setWeaponNameInput] = useState(
    bonus.target.startsWith('attack_with:') ? bonus.target.slice('attack_with:'.length) : ''
  );
  const isWeaponSpecific = bonus.target === '__attack_with__' || bonus.target.startsWith('attack_with:');

  // Build display targets: include the current attack_with: target as a readable entry
  const displayTargets = useMemo(() => {
    if (!bonus.target.startsWith('attack_with:') || targets.find((t) => t.id === bonus.target)) return targets;
    const weaponName = bonus.target.slice('attack_with:'.length);
    return [...targets, { id: bonus.target, label: `⚔ Ataque con: ${weaponName}` }];
  }, [targets, bonus.target]);

  const current = displayTargets.find((t) => t.id === bonus.target)
    ?? (isWeaponSpecific ? { id: '__attack_with__', label: '⚔ Ataque con arma específica…' } : undefined);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return displayTargets;
    return displayTargets.filter((t) =>
      t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
    );
  }, [displayTargets, query]);
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
        {isWeaponSpecific ? (
          <TextInput
            style={[styles.fieldInput, { marginTop: 0, marginBottom: 0 }]}
            value={weaponNameInput}
            onChangeText={(t) => {
              setWeaponNameInput(t);
              if (t.trim()) {
                // Normalizar para que sea inmune a tildes, mayúsculas y caracteres raros.
                const slug = t.trim().toLowerCase()
                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
                onChange({ target: `attack_with:${slug}` });
              }
            }}
            placeholder="Nombre del arma (ej. Espada larga)"
            placeholderTextColor="#475569"
            autoCorrect={false}
          />
        ) : null}
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
                    onPress={() => {
                      if (t.id === '__attack_with__') {
                        // Switch to weapon-specific mode; weapon name typed separately
                        onChange({ target: weaponNameInput.trim() ? `attack_with:${weaponNameInput.trim()}` : '__attack_with__' });
                      } else {
                        onChange({ target: t.id });
                      }
                      setOpen(false);
                    }}
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
const CATALOG_PAGE = 200; // ítems visibles máximos sin búsqueda
const CATALOG_MAX  = 300; // ítems visibles máximos con búsqueda

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

  // Resetear búsqueda al abrir
  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const { shown, total } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return { shown: items.slice(0, CATALOG_PAGE), total: items.length };
    }
    const matched = items.filter((it) =>
      it.title.toLowerCase().includes(q) ||
      (it.subtitle ?? '').toLowerCase().includes(q)
    );
    return { shown: matched.slice(0, CATALOG_MAX), total: matched.length };
  }, [items, query]);

  const renderItem: ListRenderItem<CatalogPickItem> = useCallback(
    ({ item }) => (
      <TouchableOpacity style={styles.charPickRow} onPress={() => onPick(item)}>
        <Text style={styles.charPickName}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.charPickSys}>{item.subtitle}</Text> : null}
      </TouchableOpacity>
    ),
    [onPick],
  );

  const hint = total > shown.length
    ? `Mostrando ${shown.length} de ${total} — escribe para filtrar`
    : total === 0 ? 'Sin resultados.' : null;

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
            placeholder={`Buscar entre ${items.length}…`}
            placeholderTextColor="#64748b"
            autoCorrect={false}
          />
          {hint ? <Text style={[styles.muted, { marginBottom: 4 }]}>{hint}</Text> : null}
          <FlatList
            data={shown}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            style={{ maxHeight: 400 }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            maxToRenderPerBatch={30}
            windowSize={5}
            removeClippedSubviews
          />
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

  sessionBanner: {
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(167,139,250,0.25)',
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  sessionBannerText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

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
  filterChipRow: { flexDirection: 'row', marginVertical: 6 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginRight: 6,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  filterChipActive: { backgroundColor: 'rgba(124,58,237,0.35)', borderColor: '#7c3aed' },
  filterChipText: { color: '#94a3b8', fontSize: 11 },
  filterChipTextActive: { color: '#e2d9ff', fontWeight: '700', fontSize: 11 },
  // Spell slot tracker
  slotSection: {
    backgroundColor: 'rgba(30,20,70,0.5)', borderRadius: 12,
    padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(167,139,250,0.18)',
  },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  longRestBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(52,211,153,0.12)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)',
  },
  longRestText: { color: '#34d399', fontSize: 10, fontWeight: '700' },
  slotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  slotLevelLabel: { color: '#a78bfa', fontSize: 11, fontWeight: '700', width: 36 },
  slotPips: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 4 },
  slotPip: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(167,139,250,0.7)', borderWidth: 1, borderColor: '#a78bfa',
  },
  slotPipUsed: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(167,139,250,0.3)' },
  slotMaxEdit: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 },
  slotMaxBtn: {
    width: 22, height: 22, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  slotMaxBtnText: { color: '#a78bfa', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  slotMaxVal: { color: '#e2d9ff', fontSize: 12, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  // ── Chips del panel calculado
  slotCalcChip: {
    alignItems: 'center', backgroundColor: 'rgba(124,58,237,0.18)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    paddingHorizontal: 7, paddingVertical: 3, marginRight: 5, marginBottom: 4,
  },
  slotCalcLevel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  slotCalcTotal: { color: '#c4b5fd', fontSize: 15, fontWeight: '800', lineHeight: 18 },
  slotCalcDetail: { color: '#64748b', fontSize: 8 },
  // ── Barra de preparados
  prepBarBg: {
    flex: 1, height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', marginHorizontal: 8,
  },
  prepBarFill: { borderRadius: 4 },
  prepCount: { fontSize: 11, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  // ── Botón lanzar (toggle used en conjuro preparado)
  castBtn: {
    width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.12)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)',
    marginLeft: 2,
  },
  castBtnUsed: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  castBtnText: { color: '#fbbf24', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  // ── Tabs de nivel de conjuro
  spellLevelTabBar: { flexDirection: 'row', marginVertical: 8, marginHorizontal: -4 },
  spellLevelTab: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, marginHorizontal: 3,
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)', minWidth: 54,
  },
  spellLevelTabActive: {
    backgroundColor: 'rgba(124,58,237,0.28)', borderColor: '#7c3aed',
  },
  spellLevelTabLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  spellLevelTabLabelActive: { color: '#e2d9ff' },
  spellLevelBadge: {
    marginTop: 2, minWidth: 18, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(167,139,250,0.15)', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  spellLevelBadgeActive: { backgroundColor: 'rgba(167,139,250,0.35)' },
  spellLevelBadgeText: { color: '#c4b5fd', fontSize: 9, fontWeight: '700' },
  spellLevelSlotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, borderTopWidth: 1, borderTopColor: 'rgba(167,139,250,0.1)',
    marginBottom: 6,
  },
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

  // Rasgos raciales
  racialTraitsBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
  },
  racialBonusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 4 },
  racialBonusChip: {
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  racialBonusText: { color: '#c4b5fd', fontSize: 11, fontWeight: '700' },
  racialTraitsList: { color: '#64748b', fontSize: 11, lineHeight: 16 },

  // XP tracker
  xpRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 12,
    backgroundColor: 'rgba(15,12,41,0.4)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  xpLabel: { color: '#a78bfa', fontSize: 11, fontWeight: '800', width: 24 },
  xpBarTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 2 },
  xpBarFill: { height: 6, backgroundColor: '#a78bfa', borderRadius: 3 },
  xpNums: { color: '#64748b', fontSize: 10 },
  xpEditBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.2)', borderWidth: 1, borderColor: 'rgba(124,58,237,0.4)',
  },
  xpEditText: { color: '#c4b5fd', fontSize: 11, fontWeight: '700' },

  // Condiciones
  conditionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  conditionChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  conditionText: { color: '#475569', fontSize: 11 },

  // Alineamiento
  alignSection: { marginTop: 10 },
  alignGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  alignCell: {
    width: '31%', paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  alignCellActive: { backgroundColor: 'rgba(124,58,237,0.3)', borderColor: '#7c3aed' },
  alignCellText: { color: '#475569', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  alignCellTextActive: { color: '#e2d9ff' },
  alignLabel: { color: '#a78bfa', fontSize: 11, marginTop: 4 },

  // Idiomas
  langsSection: { marginTop: 10 },
  langsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 6 },
  langChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.12)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)',
  },
  langChipText: { color: '#94a3b8', fontSize: 12 },
  langInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  langAddBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  langAddBtnText: { color: '#a78bfa', fontWeight: '800', fontSize: 20 },

  // Encumbrance
  encBox: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginTop: 8, marginBottom: 4,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  encLevel: { fontSize: 16, fontWeight: '800' },
  encWeight: { color: '#94a3b8', fontSize: 13 },
  encBarTrack: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3,
    marginTop: 8, overflow: 'hidden',
  },
  encBarFill: { height: 6, borderRadius: 3 },
  encThreshold: { color: '#64748b', fontSize: 10 },

  // Tiradas de muerte
  deathSavesBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  deathSavesTitle: { color: '#f87171', fontWeight: '800', fontSize: 13, marginBottom: 8 },
  deathSavesRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deathSavesLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '700', minWidth: 44 },
  deathPips: { flexDirection: 'row', gap: 6 },
  deathPip: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  deathPipSuccess: { borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.1)' },
  deathPipOn: { backgroundColor: '#34d399' },
  deathPipFail: { borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)' },
  deathPipFailOn: { backgroundColor: '#f87171' },
  deathResetBtn: { marginLeft: 'auto' as any, padding: 4 },
  deathResetText: { color: '#64748b', fontSize: 16 },

  // Monedas
  coinsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  coinCard: {
    flex: 1, backgroundColor: 'rgba(15,12,41,0.5)', borderRadius: 12,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
  },
  coinLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  coinValue: { color: '#f1f5f9', fontSize: 20, fontWeight: '800', marginVertical: 2 },
  coinBtns: { flexDirection: 'row', gap: 4 },
  coinBtn: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  coinBtnText: { color: '#f87171', fontWeight: '700', fontSize: 12 },

  // Detalle conjuro/dote
  detailMeta: { flexDirection: 'column', gap: 6, marginTop: 6 },
  detailMetaItem: {
    color: '#a78bfa', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(124,58,237,0.15)', borderRadius: 999,
  },
  detailDesc: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },

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
  hpBarTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2,
    marginTop: 4, marginBottom: 4, overflow: 'hidden', width: '100%',
  },
  hpBarFill: { height: 4, borderRadius: 2 },
  hpBtnRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  hpBtn: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
  },
  hpBtnText: { color: '#f87171', fontWeight: '700', fontSize: 11 },

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
  abilScoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 },
  abilRacialBadge: { fontSize: 9, fontWeight: '700', lineHeight: 14 },

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
  infoBtn: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(124,58,237,0.18)', marginRight: 2,
  },
  infoBtnText: { color: '#a78bfa', fontWeight: '700', fontSize: 14 },

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
  slotFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 6 },
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

  // Weapon quick-edit panel
  weaponStatBox: {
    marginTop: 10, marginBottom: 4,
    backgroundColor: 'rgba(124,58,237,0.08)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(124,58,237,0.2)',
    padding: 10,
  },
  weaponStatRow: { flexDirection: 'row', gap: 12 },
  weaponStatCell: { flex: 1, alignItems: 'center', gap: 4 },
  weaponStatHint: { color: '#475569', fontSize: 10, textAlign: 'center', marginTop: 2 },
  weaponStatStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(124,58,237,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepBtnText: { color: '#c4b5fd', fontSize: 18, lineHeight: 20, fontWeight: '700' },
  stepValue: { color: '#fff', fontSize: 18, fontWeight: '900', minWidth: 36, textAlign: 'center' },
  rangedToggle: {
    marginTop: 8, paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8,
    alignSelf: 'flex-start',
  },
  rangedToggleText: { color: '#94a3b8', fontSize: 11 },
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
  modalCard: { backgroundColor: '#1e1b4b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 30, maxHeight: '85%' },
  modalTitle: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalAction: { marginTop: 10, alignItems: 'center', paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10 },
  charPickRow: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 6 },
  charPickName: { color: '#fff', fontWeight: '700' },
  charPickSys: { color: '#a78bfa', fontSize: 11, marginTop: 2 },
});
