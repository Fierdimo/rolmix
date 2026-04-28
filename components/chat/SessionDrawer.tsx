import React, { useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
} from 'react-native';
import { Character, SessionMember } from '../../lib/types';
import { getSystem } from '../../lib/systems';
import { chatStyles as s } from './chatStyles';

interface Props {
  visible: boolean;
  sessionName: string;
  isDm: boolean;
  hasAcceptedAccess: boolean;
  // personaje propio
  activeCharacter: Character | null;
  onPickCharacter: () => void;
  onRollOwn: () => void;
  onViewSheet: (characterId: string) => void;
  // sólo DM
  inviteUsername: string;
  sendingInvite: boolean;
  pendingMembers: SessionMember[];
  acceptedMembers: SessionMember[];
  onInviteUsernameChange: (v: string) => void;
  onInvitePlayer: () => void;
  onUpdateMemberStatus: (userId: string, status: 'accepted' | 'rejected') => void;
  onDirectedRoll: (member: SessionMember) => void;
  onViewPlayerSheet: (characterId: string) => void;
  onGroupRoll: () => void;
  // Combate
  combatActive: boolean;
  onStartCombat: () => void;
  // NPCs del DM
  dmNpcs: Character[];
  onAddNpc: () => void;
  onRemoveNpc: (characterId: string) => void;
  onRenameNpc: (characterId: string, newName: string) => void;
  onNpcRoll: (character: Character) => void;
  onNpcSheet: (characterId: string) => void;
  // drawer
  drawerAnim: Animated.Value;
  onClose: () => void;
}

export default function SessionDrawer({
  visible, sessionName, isDm, hasAcceptedAccess,
  activeCharacter, onPickCharacter, onRollOwn, onViewSheet,
  inviteUsername, sendingInvite, pendingMembers, acceptedMembers,
  onInviteUsernameChange, onInvitePlayer, onUpdateMemberStatus,
  onDirectedRoll, onViewPlayerSheet, onGroupRoll,
  combatActive, onStartCombat,
  dmNpcs, onAddNpc, onRemoveNpc, onRenameNpc, onNpcRoll, onNpcSheet,
  drawerAnim, onClose,
}: Props) {
  const [editingNpcId, setEditingNpcId] = useState<string | null>(null);
  const [editingNpcName, setEditingNpcName] = useState('');

  function startRename(npc: Character) {
    setEditingNpcId(npc.id);
    setEditingNpcName(npc.name);
  }
  function commitRename() {
    if (editingNpcId) onRenameNpc(editingNpcId, editingNpcName);
    setEditingNpcId(null);
  }

  const showCharSection = hasAcceptedAccess || isDm;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={s.drawerContainer}>
        <TouchableOpacity style={s.drawerBackdrop} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[s.drawerPanel, { transform: [{ translateX: drawerAnim }] }]}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Cabecera */}
            <View style={s.drawerHeader}>
              <Text style={s.drawerTitle} numberOfLines={1}>{sessionName}</Text>
              <TouchableOpacity onPress={onClose} style={s.drawerClose}>
                <Text style={s.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* ── Mi personaje ─────────────────────────── */}
            {showCharSection ? (
              <View style={s.drawerSection}>
                <Text style={s.drawerSectionTitle}>Mi personaje</Text>
                <View style={s.drawerCharCard}>
                  <Text style={s.drawerCharName} numberOfLines={1}>
                    {activeCharacter ? activeCharacter.name : 'Sin personaje activo'}
                  </Text>
                  {activeCharacter ? (
                    <Text style={s.drawerCharSys}>
                      {getSystem(activeCharacter.system_id)?.name ?? activeCharacter.system_id}
                    </Text>
                  ) : null}
                </View>

                <TouchableOpacity style={s.drawerBtn} onPress={onPickCharacter}>
                  <Text style={s.drawerBtnText}>
                    {activeCharacter ? '↺  Cambiar personaje' : '＋  Elegir personaje'}
                  </Text>
                </TouchableOpacity>

                {activeCharacter ? (
                  <>
                    <TouchableOpacity
                      style={[s.drawerBtn, s.drawerBtnPrimary]}
                      onPress={onRollOwn}
                    >
                      <Text style={[s.drawerBtnText, { color: '#fff' }]}>🎲  Tirar dados</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.drawerBtn}
                      onPress={() => onViewSheet(activeCharacter.id)}
                    >
                      <Text style={s.drawerBtnText}>📋  Ver ficha</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : null}

            {/* ── Panel del DM ─────────────────────────── */}
            {isDm ? (
              <>
                {/* Invitar */}
                <View style={s.drawerSection}>
                  <Text style={s.drawerSectionTitle}>Invitar jugador</Text>
                  <View style={s.inviteRow}>
                    <TextInput
                      style={s.inviteInput}
                      placeholder="Nombre de usuario"
                      placeholderTextColor="#64748b"
                      value={inviteUsername}
                      onChangeText={onInviteUsernameChange}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      style={s.inviteButton}
                      onPress={onInvitePlayer}
                      disabled={sendingInvite}
                    >
                      <Text style={s.inviteButtonText}>{sendingInvite ? '...' : 'Invitar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Solicitudes pendientes */}
                {pendingMembers.length > 0 ? (
                  <View style={s.drawerSection}>
                    <Text style={s.drawerSectionTitle}>Solicitudes pendientes</Text>
                    {pendingMembers.map((member) => (
                      <View key={member.id} style={s.memberRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.memberName}>{member.profiles?.username ?? 'Usuario'}</Text>
                          <Text style={s.memberMeta}>
                            {member.status === 'pending' ? 'Solicitud' : 'Invitación enviada'}
                          </Text>
                        </View>
                        <View style={s.memberActions}>
                          <TouchableOpacity
                            style={s.acceptButton}
                            onPress={() => onUpdateMemberStatus(member.user_id, 'accepted')}
                          >
                            <Text style={s.acceptButtonText}>Aceptar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.rejectButton}
                            onPress={() => onUpdateMemberStatus(member.user_id, 'rejected')}
                          >
                            <Text style={s.rejectButtonText}>Rechazar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Jugadores aceptados */}
                <View style={s.drawerSection}>
                  <TouchableOpacity
                    style={[s.drawerBtn, s.drawerBtnPrimary, { marginBottom: 8 }]}
                    onPress={onGroupRoll}
                  >
                    <Text style={[s.drawerBtnText, { color: '#fff' }]}>⚔️  Tirada grupal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.drawerBtn, { marginBottom: 12, backgroundColor: combatActive ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', borderColor: combatActive ? '#f87171' : 'rgba(239,68,68,0.3)', borderWidth: 1 }]}
                    onPress={onStartCombat}
                  >
                    <Text style={[s.drawerBtnText, { color: combatActive ? '#f87171' : '#fca5a5' }]}>
                      {combatActive ? '🔴  Combate activo' : '⚔️  Iniciar Combate'}
                    </Text>
                  </TouchableOpacity>

                  {/* NPCs/monstruos del DM */}
                  <Text style={s.drawerSectionTitle}>NPCs en partida</Text>
                  {dmNpcs.map((npc) => (
                    <View key={npc.id} style={s.memberRow}>
                      <View style={{ flex: 1 }}>
                        {editingNpcId === npc.id ? (
                          <TextInput
                            value={editingNpcName}
                            onChangeText={setEditingNpcName}
                            onBlur={commitRename}
                            onSubmitEditing={commitRename}
                            autoFocus
                            style={[s.memberName, { borderBottomWidth: 1, borderBottomColor: '#7c3aed', paddingVertical: 0 }]}
                          />
                        ) : (
                          <TouchableOpacity onLongPress={() => startRename(npc)}>
                            <Text style={s.memberName} numberOfLines={1}>{npc.name}</Text>
                          </TouchableOpacity>
                        )}
                        <Text style={s.memberMeta}>
                          {getSystem(npc.system_id)?.name ?? npc.system_id}
                        </Text>
                      </View>
                      <View style={s.memberActions}>
                        <TouchableOpacity
                          style={s.acceptButton}
                          onPress={() => onNpcRoll(npc)}
                        >
                          <Text style={s.acceptButtonText}>Tirar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s.acceptButton, { backgroundColor: 'rgba(124,58,237,0.25)' }]}
                          onPress={() => onNpcSheet(npc.id)}
                        >
                          <Text style={[s.acceptButtonText, { color: '#a78bfa' }]}>Ficha</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s.rejectButton}
                          onPress={() => onRemoveNpc(npc.id)}
                        >
                          <Text style={s.rejectButtonText}>Quitar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={s.drawerBtn} onPress={onAddNpc}>
                    <Text style={s.drawerBtnText}>＋  Agregar NPC / monstruo</Text>
                  </TouchableOpacity>

                  <Text style={[s.drawerSectionTitle, { marginTop: 12 }]}>Jugadores en partida</Text>
                  {acceptedMembers.length === 0 ? (
                    <Text style={s.emptyLabel}>Ningún jugador aceptado aún.</Text>
                  ) : (
                    acceptedMembers.map((m) => (
                      <View key={m.id} style={s.memberRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.memberName}>{m.profiles?.username ?? 'Usuario'}</Text>
                          {m.active_character ? (
                            <Text style={s.memberMeta}>
                              {m.active_character.name} ·{' '}
                              {getSystem(m.active_character.system_id)?.name ?? m.active_character.system_id}
                            </Text>
                          ) : (
                            <Text style={s.memberMeta}>Sin personaje activo</Text>
                          )}
                        </View>
                        {m.active_character_id ? (
                          <View style={s.memberActions}>
                            <TouchableOpacity
                              style={s.acceptButton}
                              onPress={() => onDirectedRoll(m)}
                            >
                              <Text style={s.acceptButtonText}>Tirar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.acceptButton, { backgroundColor: 'rgba(124,58,237,0.25)' }]}
                              onPress={() => onViewPlayerSheet(m.active_character_id!)}
                            >
                              <Text style={[s.acceptButtonText, { color: '#a78bfa' }]}>Ficha</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
