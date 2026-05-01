import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Character } from '../../lib/types';
import { getSystem } from '../../lib/systems';
import { chatStyles as s } from './chatStyles';

interface Props {
  visible: boolean;
  characters: Character[];
  activeCharacter: Character | null;
  onPick: (characterId: string | null) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet modal para elegir o cambiar el personaje activo en la partida.
 */
export default function CharacterPickerModal({
  visible,
  characters,
  activeCharacter,
  onPick,
  onClose,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Personaje activo</Text>

          {characters.length === 0 ? (
            <Text style={s.emptyLabel}>
              No tienes personajes. Crea uno desde "Mis personajes".
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }}>
              {characters.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    s.charPickRow,
                    activeCharacter?.id === c.id && { borderWidth: 1, borderColor: '#6d28d9' },
                  ]}
                  onPress={() => onPick(c.id)}
                >
                  <Text style={s.charPickName}>{c.name}</Text>
                  <Text style={s.charPickSys}>
                    {getSystem(c.system_id)?.name ?? c.system_id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {activeCharacter ? (
            <TouchableOpacity
              style={[s.modalAction, { backgroundColor: 'rgba(239,68,68,0.15)' }]}
              onPress={() => onPick(null)}
            >
              <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Quitar personaje</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={s.modalAction} onPress={onClose}>
            <Text style={{ color: '#6b7280', fontWeight: '600' }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
