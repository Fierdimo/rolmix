import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Character, SessionMember } from '../../lib/types';
import { getSystem, computeFinalActions } from '../../lib/systems';
import { RollableAction } from '../../lib/systems/types';
import { supabase } from '../../lib/supabase';
import { chatStyles as s } from './chatStyles';

// ── Color de acento por categoría ─────────────────────────────────────────────

const GROUP_COLOR: Record<string, string> = {
  Combate:     '#ef4444',
  Salvaciones: '#f59e0b',
  Habilidades: '#3b82f6',
  Magia:       '#a78bfa',
  Especial:    '#34d399',
};
function accentOf(group: string) { return GROUP_COLOR[group] ?? '#94a3b8'; }

// ── Toggle público / secreto + selector de destinatarios ──────────────────────

interface SecretPickerProps {
  secret: boolean;
  onToggle: () => void;
  members: SessionMember[];
  whisperTo: string[];
  onToggleMember: (userId: string) => void;
}

function SecretPicker({ secret, onToggle, members, whisperTo, onToggleMember }: SecretPickerProps) {
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: secret ? 10 : 0 }}>
        <TouchableOpacity
          style={[rpBtn, !secret && rpBtnPublic]}
          onPress={() => secret && onToggle()}
        >
          <Text style={[rpBtnTxt, !secret && rpBtnTxtActive]}>🌐  Pública</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[rpBtn, secret && rpBtnSecret]}
          onPress={() => !secret && onToggle()}
        >
          <Text style={[rpBtnTxt, secret && rpBtnTxtActive]}>🔒  Secreta</Text>
        </TouchableOpacity>
      </View>

      {secret ? (
        <View style={rpSecretBox}>
          {members.length === 0 ? (
            <Text style={{ color: '#64748b', fontSize: 12, fontStyle: 'italic' }}>
              Solo tú verás esta tirada (no hay otros miembros en la partida).
            </Text>
          ) : (
            <>
              <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700', marginBottom: 8 }}>
                Visible también para:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {members.map((m) => {
                  const sel = whisperTo.includes(m.user_id);
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => onToggleMember(m.user_id)}
                      style={[memberChip, sel && memberChipActive]}
                    >
                      <Text style={[memberChipTxt, sel && memberChipActiveTxt]}>
                        {sel ? '✓ ' : ''}{m.profiles?.username ?? 'Jugador'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ── Layout por grupo ─────────────────────────────────────────────────────────
// Todos los grupos usan lista (1 chip por fila, ancho completo)
function layoutOf(_group: string): 'list' {
  return 'list';
}

// ── Chip de acción individual ──────────────────────────────────────────────────

function RollChip({
  action,
  accent,
  layout = 'grid',
  onPick,
}: {
  action: RollableAction;
  accent: string;
  layout?: 'grid' | 'list';
  onPick: (a: RollableAction) => void;
}) {
  const modStr = action.modifier > 0 ? `+${action.modifier}` : `${action.modifier}`;
  const modColor = action.modifier >= 0 ? '#34d399' : '#f87171';

  if (layout === 'list') {
    // Fila completa: nombre a la izquierda, dado + mod a la derecha
    return (
      <TouchableOpacity
        style={[rpChipList, { borderColor: accent + '40' }]}
        onPress={() => onPick(action)}
        activeOpacity={0.7}
      >
        <Text style={rpChipListName} numberOfLines={1}>{action.label}</Text>
        <View style={rpChipBottom}>
          <View style={[rpDieBadge, { backgroundColor: accent + '25' }]}>
            <Text style={[rpDieText, { color: accent }]}>{action.die}</Text>
          </View>
          <Text style={[rpModText, { color: modColor, minWidth: 32, textAlign: 'right' }]}>
            {modStr}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Grid: 3 por fila — nombre arriba, dado + mod abajo
  return (
    <TouchableOpacity
      style={[rpChip, { borderColor: accent + '55' }]}
      onPress={() => onPick(action)}
      activeOpacity={0.7}
    >
      <Text style={rpChipName} numberOfLines={1}>{action.label}</Text>
      <View style={rpChipBottom}>
        <View style={[rpDieBadge, { backgroundColor: accent + '25' }]}>
          <Text style={[rpDieText, { color: accent }]}>{action.die}</Text>
        </View>
        <Text style={[rpModText, { color: modColor }]}>{modStr}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── ChipWrap: contenedor adaptado al layout del grupo ────────────────────────

function ChipWrap({
  group,
  items,
  accent,
  onPick,
}: {
  group: string;
  items: RollableAction[];
  accent: string;
  onPick: (a: RollableAction) => void;
}) {
  return (
    <View style={{ gap: 6, paddingBottom: 4 }}>
      {items.map((a) => (
        <RollChip key={a.id} action={a} accent={accent} layout="list" onPick={onPick} />
      ))}
    </View>
  );
}

// ── Panel con tabs de categoría + chips ───────────────────────────────────────

function RollPanel({
  character,
  onPick,
}: {
  character: Character | null;
  onPick: (action: RollableAction) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  if (!character) {
    return (
      <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>
        Sin personaje activo. Elige uno desde el menú.
      </Text>
    );
  }

  const sys = getSystem(character.system_id);
  if (!sys) {
    return <Text style={{ color: '#64748b' }}>Sistema desconocido: {character.system_id}</Text>;
  }

  const actions = computeFinalActions(sys, character.data);
  const groups = [...new Set(actions.map((a) => a.group ?? 'Acciones'))];
  const inGroup = (g: string) => actions.filter((a) => (a.group ?? 'Acciones') === g);

  return (
    <View>
      {/* Tabs de categoría */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 14 }}
        contentContainerStyle={{ gap: 6, paddingRight: 8 }}
      >
        <TouchableOpacity
          onPress={() => setActiveGroup(null)}
          style={[rpTab, !activeGroup && rpTabAll]}
        >
          <Text style={[rpTabTxt, !activeGroup && rpTabTxtActive]}>Todo</Text>
        </TouchableOpacity>
        {groups.map((g) => {
          const accent = accentOf(g);
          const active = activeGroup === g;
          return (
            <TouchableOpacity
              key={g}
              onPress={() => setActiveGroup(g)}
              style={[rpTab, active && { backgroundColor: accent + '22', borderColor: accent }]}
            >
              <Text style={[rpTabTxt, active && { color: accent }]}>{g}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Chips */}
      <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
        {activeGroup ? (
          // Tab específico
          <ChipWrap group={activeGroup} items={inGroup(activeGroup)} accent={accentOf(activeGroup)} onPick={onPick} />
        ) : (
          // "Todo": una sección por categoría
          groups.map((g) => {
            const accent = accentOf(g);
            return (
              <View key={g} style={{ marginBottom: 16 }}>
                <View style={[rpGroupHeader, { borderLeftColor: accent }]}>
                  <Text style={[rpGroupTitle, { color: accent }]}>{g}</Text>
                  <Text style={{ color: accent + '99', fontSize: 11 }}>{inGroup(g).length}</Text>
                </View>
                <ChipWrap group={g} items={inGroup(g)} accent={accent} onPick={onPick} />
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const rpBtn: object = {
  flex: 1, paddingVertical: 10, borderRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  alignItems: 'center',
};
const rpBtnPublic: object    = { backgroundColor: 'rgba(52,211,153,0.15)',  borderColor: '#34d399' };
const rpBtnSecret: object    = { backgroundColor: 'rgba(251,191,36,0.15)',  borderColor: '#fbbf24' };
const rpBtnTxt: object       = { color: '#64748b', fontWeight: '700' as const, fontSize: 13 };
const rpBtnTxtActive: object = { color: '#e2e8f0' };

const rpSecretBox: object = {
  backgroundColor: 'rgba(251,191,36,0.07)',
  borderRadius: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
  padding: 12,
};

const memberChip: object = {
  paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
};
const memberChipActive: object    = { backgroundColor: 'rgba(124,58,237,0.3)', borderColor: '#7c3aed' };
const memberChipTxt: object       = { color: '#94a3b8', fontSize: 12 };
const memberChipActiveTxt: object = { color: '#c4b5fd', fontWeight: '700' as const };

const rpTab: object       = {
  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
};
const rpTabAll: object       = { backgroundColor: 'rgba(167,139,250,0.18)', borderColor: '#a78bfa' };
const rpTabTxt: object       = { color: '#64748b', fontWeight: '600' as const, fontSize: 12 };
const rpTabTxtActive: object = { color: '#e2e8f0' };

const rpGroupHeader: object = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10,
};
const rpGroupTitle: object = {
  fontWeight: '800' as const, fontSize: 12,
  textTransform: 'uppercase' as const, letterSpacing: 0.8,
};

const rpChip: object = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderRadius: 10, borderWidth: 1,
  paddingHorizontal: 10, paddingVertical: 8,
  // 3 por fila: (100% - 2 gaps de 8) / 3 ≈ 30.6%
  width: '30.5%',
};
const rpChipList: object = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  borderRadius: 10, borderWidth: 1,
  paddingHorizontal: 12, paddingVertical: 9,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
};
const rpChipListName: object = { color: '#e2e8f0', fontSize: 13, fontWeight: '600' as const, flex: 1, marginRight: 8 };
const rpChipName: object   = { color: '#e2e8f0', fontSize: 12, fontWeight: '600' as const };
const rpChipBottom: object = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, marginTop: 4 };
const rpDieBadge: object   = { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 };
const rpDieText: object    = { fontSize: 10, fontWeight: '700' as const };
const rpModText: object    = { fontSize: 12, fontWeight: '700' as const };

const rpHeader: object = {
  flexDirection: 'row' as const,
  alignItems: 'flex-start' as const,
  justifyContent: 'space-between' as const,
  marginBottom: 16,
};
const rpHeaderTitle: object = { color: '#e2e8f0', fontSize: 17, fontWeight: '800' as const };
const rpHeaderSub: object   = { color: '#a78bfa', fontSize: 13, marginTop: 2 };
const rpCloseBtn: object    = {
  width: 32, height: 32, borderRadius: 16,
  backgroundColor: 'rgba(255,255,255,0.08)',
  justifyContent: 'center' as const, alignItems: 'center' as const,
};
const rpCloseTxt: object = { color: '#64748b', fontSize: 16, fontWeight: '700' as const };

// ── Exports ───────────────────────────────────────────────────────────────────

export interface RollOptions {
  secret: boolean;
  whisperTo: string[];
}

// ── Modal de tirada propia ────────────────────────────────────────────────────

interface PlayerRollPanelProps {
  visible: boolean;
  character: Character | null;
  members: SessionMember[];
  onRoll: (action: RollableAction, opts: RollOptions) => void;
  onClose: () => void;
}

export function PlayerRollPanelModal({
  visible,
  character,
  members,
  onRoll,
  onClose,
}: PlayerRollPanelProps) {
  const [secret, setSecret] = useState(false);
  const [whisperTo, setWhisperTo] = useState<string[]>([]);

  function toggleMember(userId: string) {
    setWhisperTo((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function handleRoll(action: RollableAction) {
    onRoll(action, { secret, whisperTo });
    onClose();
    setSecret(false);
    setWhisperTo([]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { maxHeight: '90%' }]}>
          <View style={rpHeader}>
            <View>
              <Text style={rpHeaderTitle}>🎲 Tiradas</Text>
              {character ? <Text style={rpHeaderSub}>{character.name}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={rpCloseBtn}>
              <Text style={rpCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <SecretPicker
            secret={secret}
            onToggle={() => { setSecret((v) => !v); setWhisperTo([]); }}
            members={members}
            whisperTo={whisperTo}
            onToggleMember={toggleMember}
          />

          <RollPanel character={character} onPick={handleRoll} />
        </View>
      </View>
    </Modal>
  );
}

// ── Modal de tirada dirigida (DM) ─────────────────────────────────────────────

interface DirectedRollPanelProps {
  targetMember: SessionMember | null;
  targetCharacter: Character | null;
  members: SessionMember[];
  onRoll: (action: RollableAction, opts: RollOptions) => void;
  onClose: () => void;
}

export function DirectedRollPanelModal({
  targetMember,
  targetCharacter,
  members,
  onRoll,
  onClose,
}: DirectedRollPanelProps) {
  const [secret, setSecret] = useState(false);
  const [whisperTo, setWhisperTo] = useState<string[]>([]);

  function toggleMember(userId: string) {
    setWhisperTo((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  function handleRoll(action: RollableAction) {
    onRoll(action, { secret, whisperTo });
    onClose();
    setSecret(false);
    setWhisperTo([]);
  }

  return (
    <Modal visible={!!targetCharacter} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { maxHeight: '90%' }]}>
          <View style={rpHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={rpHeaderTitle}>🎯 Tirada dirigida</Text>
              <Text style={rpHeaderSub} numberOfLines={1}>
                {targetMember?.profiles?.username ?? targetCharacter?.name ?? 'NPC'}
                {targetCharacter && targetMember ? ` · ${targetCharacter.name}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={rpCloseBtn}>
              <Text style={rpCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <SecretPicker
            secret={secret}
            onToggle={() => { setSecret((v) => !v); setWhisperTo([]); }}
            members={members}
            whisperTo={whisperTo}
            onToggleMember={toggleMember}
          />

          <RollPanel character={targetCharacter} onPick={handleRoll} />
        </View>
      </View>
    </Modal>
  );
}

// ── Modal de tirada grupal (DM) ───────────────────────────────────────────────

export interface GroupRollEntry {
  member: SessionMember;
  character: Character;
  action: RollableAction;
}

interface GroupRollPanelProps {
  visible: boolean;
  members: SessionMember[];         // miembros aceptados con active_character_id
  extraCharacters?: Character[];    // NPCs del DM (varios, sin membership)
  onGroupRoll: (rolls: GroupRollEntry[]) => void;
  onClose: () => void;
}

export function GroupRollPanelModal({
  visible,
  members,
  extraCharacters = [],
  onGroupRoll,
  onClose,
}: GroupRollPanelProps) {
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [loadingChars, setLoadingChars] = useState(false);

  const eligibleMembers = members.filter((m) => !!m.active_character_id);

  useEffect(() => {
    if (!visible) return;
    const ids = eligibleMembers.map((m) => m.active_character_id!);
    if (ids.length === 0) { setCharacters({}); setLoadingChars(false); return; }
    setLoadingChars(true);
    supabase
      .from('characters')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        const map: Record<string, Character> = {};
        for (const c of data ?? []) map[c.id] = c;
        setCharacters(map);
        setLoadingChars(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Personaje representativo para mostrar la lista de acciones
  // Preferir un NPC del DM si existen (suelen ser del mismo sistema que los jugadores)
  const repCharacter: Character | null =
    extraCharacters[0] ??
    (eligibleMembers.find((m) => characters[m.active_character_id!])
      ? characters[eligibleMembers.find((m) => characters[m.active_character_id!])!.active_character_id!]
      : null);

  function resolveActionForChar(char: Character, action: RollableAction): RollableAction {
    const sys = getSystem(char.system_id);
    if (!sys) return { ...action, modifier: 0 };
    const finalActions = computeFinalActions(sys, char.data as Record<string, unknown>);
    return (
      finalActions.find((a) => a.id === action.id) ??
      finalActions.find((a) => a.label === action.label) ??
      { ...action, modifier: 0 }
    );
  }

  function handlePick(action: RollableAction) {
    const rolls: GroupRollEntry[] = [
      // NPCs del DM (usan un SessionMember vacío como placeholder)
      ...extraCharacters.map((char) => ({
        member: { id: char.id, user_id: '', session_id: '', role: 'player', status: 'accepted',
          active_character_id: char.id } as unknown as SessionMember,
        character: char,
        action: resolveActionForChar(char, action),
      })),
      // Jugadores
      ...eligibleMembers.flatMap((m) => {
        const char = characters[m.active_character_id!];
        if (!char) return [];
        return [{ member: m, character: char, action: resolveActionForChar(char, action) }];
      }),
    ];
    onGroupRoll(rolls);
    onClose();
  }

  const totalCount = extraCharacters.length + eligibleMembers.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={[s.modalCard, { maxHeight: '90%' }]}>
          <View style={rpHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={rpHeaderTitle}>⚔️ Tirada grupal</Text>
              <Text style={rpHeaderSub}>
                {totalCount === 0
                  ? 'Sin personajes activos'
                  : `${totalCount} personaje${totalCount !== 1 ? 's' : ''}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={rpCloseBtn}>
              <Text style={rpCloseTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {loadingChars ? (
            <ActivityIndicator color="#7c3aed" style={{ margin: 24 }} />
          ) : repCharacter ? (
            <RollPanel character={repCharacter} onPick={handlePick} />
          ) : (
            <Text style={{ color: '#94a3b8', padding: 24, textAlign: 'center' }}>
              Ningún jugador tiene personaje activo en esta partida.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
