import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StatusBar,
  Text,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  TextInput,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Character, Combatant, DiceMetadata, MessageType, SessionMember } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import { useSessionChat } from '../hooks/useSessionChat';
import { useCombat, CombatParticipant } from '../hooks/useCombat';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import SessionDrawer from '../components/chat/SessionDrawer';
import CharacterPickerModal from '../components/chat/CharacterPickerModal';
import { PlayerRollPanelModal, DirectedRollPanelModal, GroupRollPanelModal, GroupRollEntry, RollOptions } from '../components/chat/RollPanelModal';
import CombatTrackerPanel from '../components/chat/CombatTrackerPanel';
import CombatActionModal, { CombatAttackResult } from '../components/chat/CombatActionModal';
import DamageResolutionModal, { ResolvedAttack } from '../components/chat/DamageResolutionModal';
import MonsterPickerModal, { MonsterEntry } from '../components/chat/MonsterPickerModal';
import { resolveAction } from '../lib/systems';
import { RollableAction } from '../lib/systems/types';
import { chatStyles as s } from '../components/chat/chatStyles';
import { RootStackParamList } from '../App';
import { useSessionRoster } from '../hooks/useSessionRoster';
import { useSessionEncounters } from '../hooks/useSessionEncounters';
import EncounterBuilderModal from '../components/chat/EncounterBuilderModal';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
  route: RouteProp<RootStackParamList, 'Chat'>;
};

export default function ChatScreen({ navigation, route }: Props) {
  const { sessionId, sessionName } = route.params;
  const { user, profile } = useAuth();

  // ── UI state ─────────────────────────────────────────────────────────────
  const [pickerVisible, setPickerVisible] = useState(false);
  const [rollPanelVisible, setRollPanelVisible] = useState(false);
  const [directedFor, setDirectedFor] = useState<SessionMember | null>(null);
  const [directedCharacter, setDirectedCharacter] = useState<Character | null>(null);
  const [groupRollVisible, setGroupRollVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  // 'active' = cambiar personaje activo, 'session_npc' = añadir NPC a sesión, 'roster' = añadir personaje al bestiario
  const [charPickerTarget, setCharPickerTarget] = useState<'active' | 'session_npc' | 'roster'>('active');
  const [monsterPickerVisible, setMonsterPickerVisible] = useState(false);
  const [monsterPickerLoading, setMonsterPickerLoading] = useState(false);
  // Modo del picker de monstruos: 'session' = añadir al combate / 'roster' = añadir al bestiario
  const [monsterPickerTarget, setMonsterPickerTarget] = useState<'session' | 'roster'>('session');
  const [pendingMonster, setPendingMonster] = useState<MonsterEntry | null>(null);
  const [encounterBuilderVisible, setEncounterBuilderVisible] = useState(false);
  const [pendingMonsterName, setPendingMonsterName] = useState('');
  const [combatActingFor, setCombatActingFor] = useState<Combatant | null>(null);
  // Damage resolution
  const [damageModalVisible, setDamageModalVisible] = useState(false);
  const [pendingAttacks, setPendingAttacks] = useState<ResolvedAttack[]>([]);
  const [pendingDamageDie, setPendingDamageDie] = useState<string | undefined>(undefined);
  const [pendingDamageMod, setPendingDamageMod] = useState<number>(0);
  const [pendingAttacker, setPendingAttacker] = useState<Combatant | null>(null);
  const [pendingAttackTarget, setPendingAttackTarget] = useState<'ac' | 'touch_ac' | 'ff_ac' | undefined>(undefined);
  const [pendingSaveDC, setPendingSaveDC] = useState<number | undefined>(undefined);
  const [pendingSaveType, setPendingSaveType] = useState<'fort' | 'ref' | 'will' | undefined>(undefined);
  const [pendingEffectLabel, setPendingEffectLabel] = useState<string | undefined>(undefined);

  const listRef = useRef<FlatList>(null);
  const drawerAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;

  // ── Drawer helpers ────────────────────────────────────────────────────────
  function openDrawer() {
    setDrawerVisible(true);
    Animated.spring(drawerAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 22,
      tension: 180,
    }).start();
  }

  function closeDrawer() {
    Animated.timing(drawerAnim, {
      toValue: Dimensions.get('window').width,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setDrawerVisible(false));
  }

  // Called by the hook when the DM taps "Tirar" on a player
  const handleDirectedRollOpen = useCallback((character: Character, member: SessionMember) => {
    setDirectedFor(member);
    setDirectedCharacter(character);
  }, []);

  // ── Session data & actions ────────────────────────────────────────────────
  const {
    messages, membership, isDm, pendingMembers, acceptedMembers,
    myCharacters, activeCharacter, dmNpcs, loading,
    inviteUsername, sendingInvite,
    sendMessage, updateMemberStatus, acceptInvitation, invitePlayer,
    pickActiveCharacter, addDmNpc, removeDmNpc, renameDmNpc, openDirectedRollFor, setInviteUsername,
  } = useSessionChat(sessionId, handleDirectedRollOpen);

  // ── Combat ────────────────────────────────────────────────────────────────
  const {
    encounter, combatants, activeCombatant, characterMap,
    startCombat, endCombat, nextTurn, updateHp, delayAfter, consumeSpell,
  } = useCombat(sessionId, isDm);

  // ── Bestiario de sesión ───────────────────────────────────────────────────
  const { roster, addToRoster, removeFromRoster } = useSessionRoster(sessionId);

  // ── Encuentros preparados ─────────────────────────────────────────────────
  const { encounters, saveEncounter, deleteEncounter } = useSessionEncounters(sessionId);

  // ── Scroll to bottom on new message ──────────────────────────────────────
  const handleContentSizeChange = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  // ── Dice roll ─────────────────────────────────────────────────────────────
  async function rollAction(
    character: Character,
    action: RollableAction,
    directed: boolean,
    opts: RollOptions = { secret: false, whisperTo: [] },
  ) {
    const r = resolveAction(action);
    const meta: DiceMetadata = {
      die: r.die,
      result: r.result,
      modifier: r.modifier,
      total: r.total,
      character_name: character.name,
      action_label: action.label,
      directed,
      ...(opts.secret ? { secret: true, whisper_to: [user?.id ?? '', ...opts.whisperTo] } : {}),
    };
    const text = directed
      ? `Tirada dirigida: ${character.name} \u2192 ${action.label}`
      : `${character.name} tira ${action.label}`;
    // Las tiradas secretas se envían como 'whisper' para que el RLS de Supabase
    // las filtre en el servidor según whisper_to; las públicas van como 'dice'.
    const msgType: MessageType = opts.secret ? 'whisper' : 'dice';
    await sendMessage(text, msgType, meta as unknown as Record<string, unknown>);
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const hasAcceptedAccess = membership?.status === 'accepted';
  const inputDisabled = !profile || !hasAcceptedAccess;

  const bannerText =
    membership == null
      ? 'Todav\u00eda no formas parte de esta partida. Usa "Unirse" desde el listado.'
      : membership.status === 'pending'
        ? 'Tu solicitud est\u00e1 pendiente de aprobaci\u00f3n por el DM.'
        : membership.status === 'invited'
          ? 'Tienes invitaci\u00f3n pendiente. Falta aceptaci\u00f3n del DM.'
          : null;

  // ── Drawer helpers that close first, then open another modal ─────────────
  function drawerThenPicker() { closeDrawer(); setTimeout(() => setPickerVisible(true), 260); }
  function drawerThenRoll() { closeDrawer(); setTimeout(() => setRollPanelVisible(true), 260); }
  function drawerThenSheet(charId: string) {
    closeDrawer();
    navigation.navigate('CharacterEditor', { characterId: charId, sessionId, sessionName });
  }
  function drawerThenDirected(member: SessionMember) {
    closeDrawer();
    setTimeout(() => openDirectedRollFor(member), 260);
  }
  function drawerThenGroupRoll() { closeDrawer(); setTimeout(() => setGroupRollVisible(true), 260); }
  function drawerThenAddNpc() { closeDrawer(); setTimeout(() => { setMonsterPickerTarget('session'); setMonsterPickerVisible(true); }, 260); }
  function drawerThenAddToRoster() { closeDrawer(); setTimeout(() => { setMonsterPickerTarget('roster'); setMonsterPickerVisible(true); }, 260); }
  function handleAddToSessionFromRoster(monster: MonsterEntry) {
    closeDrawer();
    setTimeout(() => { setPendingMonster(monster); setPendingMonsterName(monster.name); }, 260);
  }
  function drawerThenManageEncounters() { closeDrawer(); setTimeout(() => setEncounterBuilderVisible(true), 260); }
  function drawerThenCharToRoster() {
    closeDrawer();
    setTimeout(() => { setCharPickerTarget('roster'); setPickerVisible(true); }, 260);
  }

  /** Despliega un encuentro completo: crea cada instancia como personaje y la añade a la sesión. */
  async function handleDeployEncounter(enc: import('../hooks/useSessionEncounters').PreparedEncounter) {
    const { supabase: sb } = await import('../lib/supabase');
    for (const entry of enc.monsters) {
      const instances = Array.from({ length: entry.count }, (_, i) =>
        entry.count > 1 ? `${entry.customName} ${i + 1}` : entry.customName,
      );
      for (const instanceName of instances) {
        const { data: newChar, error } = await sb
          .from('characters')
          .insert({ owner_id: user?.id, system_id: entry.monster.system_id, name: instanceName, data: entry.monster.data })
          .select()
          .single();
        if (!error && newChar) await addDmNpc(newChar.id);
      }
    }
    await sendMessage(`⚔️ Encuentro desplegado: **${enc.name}** (${enc.monsters.reduce((a, m) => a + m.count, 0)} figuras)`, 'narration');
  }
  function drawerThenNpcRoll(character: Character) {
    closeDrawer();
    setTimeout(() => { setDirectedCharacter(character); setDirectedFor(null); }, 260);
  }

  // ── Combat handlers ───────────────────────────────────────────────────────

  async function drawerThenStartCombat() {
    closeDrawer();
    if (encounter) {
      // Ya hay combate activo — el botón actúa como indicador visual, no hace nada extra
      return;
    }
    // Recopilar participantes: PCs aceptados + NPCs del DM
    const participants: CombatParticipant[] = [];

    // Cargar personajes de jugadores aceptados
    const memberCharIds = acceptedMembers
      .map((m) => m.active_character_id)
      .filter(Boolean) as string[];

    let pcChars: Character[] = [];
    if (memberCharIds.length > 0) {
      const { supabase: sb } = await import('../lib/supabase');
      const [{ data: baseChars }, { data: scRows }] = await Promise.all([
        sb.from('characters').select('*').in('id', memberCharIds),
        sb.from('session_characters').select('character_id, data')
          .eq('session_id', sessionId).in('character_id', memberCharIds),
      ]);
      const scMap: Record<string, Record<string, unknown>> = {};
      for (const sc of scRows ?? []) scMap[sc.character_id] = sc.data as Record<string, unknown>;
      pcChars = (baseChars ?? []).map((ch: Character) =>
        scMap[ch.id] ? { ...ch, data: { ...(ch.data as object), ...scMap[ch.id] } } as Character : ch
      );
    }

    // El propio personaje del DM (si existe)
    if (activeCharacter && !pcChars.find((c) => c.id === activeCharacter.id)) {
      pcChars.push(activeCharacter);
    }

    for (const ch of pcChars) participants.push({ character: ch, isNpc: false });
    for (const npc of dmNpcs) participants.push({ character: npc, isNpc: true });

    if (participants.length === 0) return;

    const order = await startCombat(participants);
    if (!order) return;

    // Publicar en el chat el orden de iniciativa
    const lines = order
      .map((e, i) => `${i + 1}. ${e.character.name} — INI ${e.initiative} (🎲${e.roll}${e.dexMod >= 0 ? '+' : ''}${e.dexMod})`)
      .join('\n');
    await sendMessage(`⚔️ ¡Combate iniciado!\n${lines}`, 'narration');
  }

  function handleCombatAct(combatant: Combatant) {
    setCombatActingFor(combatant);
  }

  async function handleCombatResult(result: CombatAttackResult) {
    const { attacker, target, actionType, actionLabel, weaponLabel, rolls, acBonus, perAttack, damageDie, damageMod } = result;

    // Conjuro: primero descontar el recurso, luego anunciar
    if (actionType === 'cast' && result.castSpellName != null && attacker.character_id) {
      await consumeSpell(attacker.character_id, result.castSpellName, result.castSpellLevel ?? 0);
    }

    if (actionType === 'delay') {
      const afterName = target ? ` (después de ${target.name})` : ' (al final)';
      const ok = await delayAfter(attacker.id, target?.id ?? null);
      if (ok) await sendMessage(`⏸️ ${attacker.name} se retrasa${afterName}`, 'narration');
      return;
    }

    if (actionType === 'total_defense' || actionType === 'defensive') {
      const bonus = acBonus ?? (actionType === 'total_defense' ? 4 : 2);
      await sendMessage(
        `🛡️ ${attacker.name} realiza ${actionLabel} (+${bonus} CA esquiva este turno)`,
        'action',
      );
      return;
    }

    if (actionType === 'def_cast' && rolls.length > 0) {
      const r = rolls[0];
      const meta: DiceMetadata = {
        die: 'd20',
        result: r.d20,
        modifier: r.modifier,
        total: r.total,
        character_name: attacker.name,
        action_label: 'Concentración (Conjurar Defensivamente)',
        target_name: target?.name,
        combat_action_type: actionType,
      };
      await sendMessage(`🔮 ${attacker.name} conjura defensivamente`, 'dice', meta as unknown as Record<string, unknown>);
      return;
    }

    // Conjuro sin tirada de ataque (solo salvación o utilidad)
    if (actionType === 'cast' && rolls.length === 0) {
      const targetStr = target ? ` → ${target.name}` : '';
      const saveStr = result.saveDC != null
        ? ` (CD ${result.saveDC} ${result.saveType === 'fort' ? 'Fortaleza' : result.saveType === 'ref' ? 'Reflejos' : 'Voluntad'})`
        : '';
      const effectStr = result.effectLabel ? ` · ${result.effectLabel}` : '';
      await sendMessage(
        `🔮 ${attacker.name} lanza ${weaponLabel}${targetStr}${saveStr}${effectStr}`,
        'action',
      );
      return;
    }

    // Tirada(s) de ataque
    if (rolls.length === 0) return;

    // Construir per_attacks para el metadata (normalizado desde perAttack)
    const perAttackMeta = perAttack?.map((p) => ({
      index: p.index,
      modifier: p.modifier,
      roll: p.roll,
      targetId: p.target?.id ?? null,
      targetName: p.target?.name ?? null,
    }));

    // Resumen de objetivos para el contenido del mensaje
    const uniqueTargets = perAttack
      ? [...new Set(perAttack.map((p) => p.target?.name).filter(Boolean))].join(', ')
      : target?.name;
    const targetStr = uniqueTargets ? ` → ${uniqueTargets}` : '';
    const content = `${attacker.name} · ${actionLabel}${weaponLabel ? ` · ${weaponLabel}` : ''}${targetStr}`;

    const meta: DiceMetadata = {
      die: 'd20',
      result: rolls[0].d20,
      modifier: rolls[0].modifier,
      total: rolls[0].total,
      character_name: attacker.name,
      action_label: weaponLabel || actionLabel,
      directed: isDm,
      combat_rolls: rolls,
      target_name: uniqueTargets ?? undefined,
      combat_action_type: actionType,
      per_attacks: perAttackMeta,
      damage_die: damageDie,
      damage_mod: damageMod,
    };

    await sendMessage(content, 'dice', meta as unknown as Record<string, unknown>);

    // DM: abrir modal de resolución de daño
    if (isDm && rolls.length > 0) {
      const resolvedAttacks: ResolvedAttack[] = (perAttack ?? [{ index: 0, modifier: rolls[0].modifier, roll: rolls[0], target }]).map((p) => ({
        index: p.index,
        modifier: p.modifier,
        roll: p.roll,
        target: p.target,
      }));
      setPendingAttacker(attacker);
      setPendingAttacks(resolvedAttacks);
      setPendingDamageDie(damageDie);
      setPendingDamageMod(damageMod ?? 0);
      setPendingAttackTarget(result.attackTarget);
      setPendingSaveDC(result.saveDC);
      setPendingSaveType(result.saveType);
      setPendingEffectLabel(result.effectLabel);
      setDamageModalVisible(true);
    }
  }

  async function handleGroupRoll(rolls: GroupRollEntry[]) {
    for (const { character, action } of rolls) {
      await rollAction(character, action, true, { secret: false, whisperTo: [] });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{sessionName}</Text>
          <View style={s.onlineDot} />
        </View>
        <TouchableOpacity onPress={openDrawer} style={s.menuBtn}>
          <Text style={s.menuBtnText}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Panel de combate (visible a todos mientras haya encuentro activo) */}
      {encounter && (
        <CombatTrackerPanel
          encounter={encounter}
          combatants={combatants}
          characterMap={characterMap}
          isDm={isDm}
          myCharacterId={activeCharacter?.id}
          onNextTurn={nextTurn}
          onEndCombat={endCombat}
          onUpdateHp={updateHp}
          onAct={handleCombatAct}
        />
      )}

      {/* Chat + input */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <ActivityIndicator color="#7c3aed" style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble message={item} isOwn={item.user_id === user?.id} currentUserId={user?.id} />
            )}
            style={s.flex}
            contentContainerStyle={s.messagesList}
            onContentSizeChange={handleContentSizeChange}
            ListEmptyComponent={
              <Text style={s.emptyChat}>No hay mensajes.{'\n'}Iniciativa!</Text>
            }
          />
        )}

        {bannerText ? (
          <View style={s.noticeWrap}>
            <Text style={s.notice}>{bannerText}</Text>
            {membership?.status === 'invited' ? (
              <TouchableOpacity style={s.noticeButton} onPress={acceptInvitation}>
                <Text style={s.noticeButtonText}>Aceptar invitaci\u00f3n</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <MessageInput onSend={sendMessage} disabled={inputDisabled} />
      </KeyboardAvoidingView>

      {/* Modales y drawer */}

      <SessionDrawer
        visible={drawerVisible}
        sessionName={sessionName}
        isDm={isDm}
        hasAcceptedAccess={hasAcceptedAccess}
        activeCharacter={activeCharacter}
        onPickCharacter={drawerThenPicker}
        onRollOwn={drawerThenRoll}
        onViewSheet={drawerThenSheet}
        inviteUsername={inviteUsername}
        sendingInvite={sendingInvite}
        pendingMembers={pendingMembers}
        acceptedMembers={acceptedMembers}
        onInviteUsernameChange={setInviteUsername}
        onInvitePlayer={invitePlayer}
        onUpdateMemberStatus={updateMemberStatus}
        onDirectedRoll={drawerThenDirected}
        onViewPlayerSheet={drawerThenSheet}
        onGroupRoll={drawerThenGroupRoll}
        combatActive={!!encounter}
        onStartCombat={drawerThenStartCombat}
        dmNpcs={dmNpcs}
        onAddNpc={drawerThenAddNpc}
        onRemoveNpc={removeDmNpc}
        onRenameNpc={renameDmNpc}
        onNpcRoll={drawerThenNpcRoll}
        onNpcSheet={drawerThenSheet}
        roster={roster}
        onAddToRoster={drawerThenAddToRoster}
        onAddCharacterToRoster={drawerThenCharToRoster}
        onRemoveFromRoster={removeFromRoster}
        onAddToSessionFromRoster={handleAddToSessionFromRoster}
        encounters={encounters}
        onManageEncounters={drawerThenManageEncounters}
        onDeployEncounter={handleDeployEncounter}
        drawerAnim={drawerAnim}
        onClose={closeDrawer}
      />

      <CharacterPickerModal
        visible={pickerVisible}
        characters={myCharacters}
        activeCharacter={charPickerTarget !== 'active' ? null : activeCharacter}
        onPick={(id) => {
          setPickerVisible(false);
          if (charPickerTarget === 'session_npc') {
            if (id) addDmNpc(id);
          } else if (charPickerTarget === 'roster') {
            if (id) {
              const char = myCharacters.find((c) => c.id === id);
              if (char) addToRoster({ id: char.id, name: char.name, system_id: char.system_id, data: char.data as Record<string, unknown> });
            }
          } else {
            pickActiveCharacter(id);
          }
          setCharPickerTarget('active');
        }}
        onClose={() => { setPickerVisible(false); setCharPickerTarget('active'); }}
      />

      <MonsterPickerModal
        visible={monsterPickerVisible}
        loading={monsterPickerLoading}
        onPick={async (monster: MonsterEntry) => {
          setMonsterPickerVisible(false);
          if (monsterPickerTarget === 'roster') {
            addToRoster(monster);
          } else {
            // Pedir nombre personalizado antes de crear
            setPendingMonster(monster);
            setPendingMonsterName(monster.name);
          }
        }}
        onClose={() => setMonsterPickerVisible(false)}
      />

      {/* ── Modal nombre de monstruo ─────────────────────────── */}
      {pendingMonster && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPendingMonster(null)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15,12,41,0.50)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#ffffff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: 'rgba(109,40,217,0.18)' }}>
              <Text style={{ color: '#1e1b3a', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Añadir monstruo</Text>
              <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>Elige un nombre para esta instancia (puede ser diferente al tipo base).</Text>
              <TextInput
                value={pendingMonsterName}
                onChangeText={setPendingMonsterName}
                placeholder={pendingMonster.name}
                placeholderTextColor="#9ca3af"
                style={{ backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: 'rgba(109,40,217,0.18)', borderRadius: 8, color: '#1e1b3a', paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 16 }}
                autoFocus
                selectTextOnFocus
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setPendingMonster(null)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(109,40,217,0.20)', alignItems: 'center' }}
                >
                  <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const monster = pendingMonster;
                    const customName = pendingMonsterName.trim() || monster.name;
                    setPendingMonster(null);
                    setMonsterPickerLoading(true);
                    try {
                      const { supabase } = await import('../lib/supabase');
                      const { data: newChar, error } = await supabase
                        .from('characters')
                        .insert({ owner_id: user?.id, system_id: 'dnd35', name: customName, data: monster.data })
                        .select()
                        .single();
                      if (error || !newChar) { console.error('Error creando monstruo:', error?.message); }
                      else { await addDmNpc(newChar.id); }
                    } finally {
                      setMonsterPickerLoading(false);
                    }
                  }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#6d28d9', alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Añadir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      <PlayerRollPanelModal
        visible={rollPanelVisible}
        character={activeCharacter}
        members={acceptedMembers.filter((m) => m.user_id !== user?.id)}
        onRoll={(action, opts) => activeCharacter && rollAction(activeCharacter, action, false, opts)}
        onClose={() => setRollPanelVisible(false)}
      />

      <DirectedRollPanelModal
        targetMember={directedFor}
        targetCharacter={directedCharacter}
        members={acceptedMembers}
        onRoll={(action, opts) => directedCharacter && rollAction(directedCharacter, action, true, opts)}
        onClose={() => { setDirectedCharacter(null); setDirectedFor(null); }}
      />

      <GroupRollPanelModal
        visible={groupRollVisible}
        members={acceptedMembers}
        extraCharacters={dmNpcs}
        onGroupRoll={handleGroupRoll}
        onClose={() => setGroupRollVisible(false)}
      />

      <CombatActionModal
        visible={!!combatActingFor}
        attacker={combatActingFor}
        character={combatActingFor?.character_id ? (characterMap[combatActingFor.character_id] ?? null) : null}
        combatants={combatants}
        onResult={handleCombatResult}
        onClose={() => setCombatActingFor(null)}
      />

      <DamageResolutionModal
        visible={damageModalVisible}
        attacker={pendingAttacker}
        attacks={pendingAttacks}
        damageDie={pendingDamageDie}
        damageMod={pendingDamageMod}
        characterMap={characterMap}
        attackTarget={pendingAttackTarget}
        saveDC={pendingSaveDC}
        saveType={pendingSaveType}
        effectLabel={pendingEffectLabel}
        onApplyDamage={(targetId, delta) => updateHp(targetId, delta)}
        onClose={() => setDamageModalVisible(false)}
      />

      <EncounterBuilderModal
        visible={encounterBuilderVisible}
        encounters={encounters}
        myCharacters={myCharacters}
        onSave={saveEncounter}
        onDelete={deleteEncounter}
        onDeploy={handleDeployEncounter}
        onClose={() => setEncounterBuilderVisible(false)}
      />
    </View>
  );
}
