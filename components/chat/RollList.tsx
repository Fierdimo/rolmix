import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Character } from '../../lib/types';
import { getSystem, computeFinalActions } from '../../lib/systems';
import { RollableAction } from '../../lib/systems/types';
import { chatStyles as s } from './chatStyles';

interface Props {
  character: Character | null;
  onPick: (action: RollableAction) => void;
}

/**
 * Lista de acciones tirables de un personaje, agrupadas por categoría.
 * Muestra el dado y el modificador calculado en cada chip.
 */
export default function RollList({ character, onPick }: Props) {
  if (!character) return null;

  const sys = getSystem(character.system_id);
  if (!sys) return <Text style={s.emptyLabel}>Sistema desconocido.</Text>;

  const actions = computeFinalActions(sys, character.data);

  const grouped = actions.reduce<Record<string, RollableAction[]>>((acc, a) => {
    const g = a.group ?? 'Acciones';
    (acc[g] ??= []).push(a);
    return acc;
  }, {});

  return (
    <ScrollView style={{ maxHeight: 380 }}>
      {Object.entries(grouped).map(([group, list]) => (
        <View key={group} style={{ marginBottom: 10 }}>
          <Text style={s.rollGroup}>{group}</Text>
          <View style={s.rollWrap}>
            {list.map((a) => (
              <TouchableOpacity key={a.id} style={s.rollChip} onPress={() => onPick(a)}>
                <Text style={s.rollChipLabel}>{a.label}</Text>
                <Text style={s.rollChipMod}>
                  {a.die} {a.modifier >= 0 ? `+${a.modifier}` : a.modifier}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
