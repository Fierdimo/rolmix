import React, { useRef, useState, useCallback } from 'react';
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
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { Character, DiceMetadata, MessageType, SessionMember } from '../lib/types';
import { useAuth } from '../hooks/useAuth';
import { useSessionChat } from '../hooks/useSessionChat';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import SessionDrawer from '../components/chat/SessionDrawer';
import CharacterPickerModal from '../components/chat/CharacterPickerModal';
import { PlayerRollPanelModal, DirectedRollPanelModal, GroupRollPanelModal, GroupRollEntry, RollOptions } from '../components/chat/RollPanelModal';
import { resolveAction } from '../lib/systems';
import { RollableAction } from '../lib/systems/types';
import { chatStyles as s } from '../components/chat/chatStyles';
import { RootStackParamList } from '../App';

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
  const [npcPickerMode, setNpcPickerMode] = useState(false);

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
    pickActiveCharacter, addDmNpc, removeDmNpc, openDirectedRollFor, setInviteUsername,
  } = useSessionChat(sessionId, handleDirectedRollOpen);

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
  function drawerThenAddNpc() { closeDrawer(); setTimeout(() => { setNpcPickerMode(true); setPickerVisible(true); }, 260); }
  function drawerThenNpcRoll(character: Character) {
    closeDrawer();
    setTimeout(() => { setDirectedCharacter(character); setDirectedFor(null); }, 260);
  }

  async function handleGroupRoll(rolls: GroupRollEntry[]) {
    for (const { character, action } of rolls) {
      await rollAction(character, action, true, { secret: false, whisperTo: [] });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0c29" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backText}>❎</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{sessionName}</Text>
          <View style={s.onlineDot} />
        </View>
        <TouchableOpacity onPress={openDrawer} style={s.menuBtn}>
          <Text style={s.menuBtnText}>🟰</Text>
        </TouchableOpacity>
      </View>

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
        dmNpcs={dmNpcs}
        onAddNpc={drawerThenAddNpc}
        onRemoveNpc={removeDmNpc}
        onNpcRoll={drawerThenNpcRoll}
        onNpcSheet={drawerThenSheet}
        drawerAnim={drawerAnim}
        onClose={closeDrawer}
      />

      <CharacterPickerModal
        visible={pickerVisible}
        characters={myCharacters}
        activeCharacter={npcPickerMode ? null : activeCharacter}
        onPick={(id) => {
          setPickerVisible(false);
          if (npcPickerMode) { setNpcPickerMode(false); if (id) addDmNpc(id); }
          else pickActiveCharacter(id);
        }}
        onClose={() => { setPickerVisible(false); setNpcPickerMode(false); }}
      />

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
    </View>
  );
}
