import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { MessageType, DiceMetadata } from '../lib/types';

interface Props {
  onSend: (content: string, type: MessageType, metadata?: Record<string, unknown>) => void;
  disabled?: boolean;
}

const TYPES: { type: MessageType; label: string; color: string }[] = [
  { type: 'message',   label: '💬',  color: '#217bf1' },
  { type: 'action',    label: '⚡',  color: '#fbbf24' },
  { type: 'narration', label: '📖', color: '#a78bfa' },
  { type: 'dice',      label: '🎲', color: '#34d399' },
  { type: 'whisper',   label: '🤫', color: '#94a3b8' },
];

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function rollDice(die: string): DiceMetadata {
  const sides = parseInt(die.slice(1), 10);
  const result = Math.floor(Math.random() * sides) + 1;
  return { die, result, total: result };
}

export default function MessageInput({ onSend, disabled = false }: Props) {
  const [text, setText] = useState('');
  const [selectedType, setSelectedType] = useState<MessageType>('message');
  const [showDice, setShowDice] = useState(false);
  const [modifier, setModifier] = useState('');
  const [selectedDie, setSelectedDie] = useState('d20');

  function handleSend() {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, selectedType);
    setText('');
  }

  function handleDiceRoll(die?: string) {
    if (disabled) return;
    const target = die ?? selectedDie;
    const meta = rollDice(target);
    const mod = parseInt(modifier, 10);
    if (!isNaN(mod) && mod !== 0) {
      meta.modifier = mod;
      meta.total = meta.result + mod;
    }
    const label =
      mod && !isNaN(mod) && mod !== 0
        ? `Tirada ${target}${mod > 0 ? '+' : ''}${mod}`
        : `Tirada ${target}`;
    onSend(label, 'dice', meta as unknown as Record<string, unknown>);
    setShowDice(false);
    setModifier('');
  }

  return (
    <View style={styles.wrapper}>
      {/* Type selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeRow}
        contentContainerStyle={styles.typeRowContent}
      >
        {TYPES.map(({ type, label, color }) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeBtn, selectedType === type && styles.typeBtnActive, selectedType === type && { borderColor: color }]}
            onPress={() => { if (!disabled) { setSelectedType(type); setShowDice(false); } }}
          >
            <Text style={{ fontSize: 18 }}>{label}</Text>
            <Text style={[styles.typeName, { color: selectedType === type ? color : '#64748b' }]}>
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Dice panel */}
      {selectedType === 'dice' && (
        <View style={styles.dicePanel}>
          {/* Die selector chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dieChipsRow}
          >
            {DICE.map((die) => (
              <TouchableOpacity
                key={die}
                style={[styles.dieChip, selectedDie === die && styles.dieChipActive]}
                onPress={() => setSelectedDie(die)}
              >
                <Text style={[styles.dieChipText, selectedDie === die && styles.dieChipTextActive]}>
                  {die}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Modifier + Roll row */}
          <View style={styles.diceInputRow}>
            <Text style={styles.modLabel}>Mod</Text>
            <TextInput
              style={styles.modInput}
              value={modifier}
              onChangeText={setModifier}
              keyboardType="numbers-and-punctuation"
              placeholder="+0"
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity
              style={[styles.rollBtn, disabled && styles.sendBtnDisabled]}
              onPress={() => handleDiceRoll()}
            >
              <Text style={styles.rollBtnText}>🎲 Tirar {selectedDie}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Text input row (hidden for dice-only mode) */}
      {selectedType !== 'dice' && (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={
              selectedType === 'action'    ? 'Describe tu acción...' :
              selectedType === 'narration' ? 'Narración del Máster...' :
              selectedType === 'whisper'   ? 'Susurro privado...' :
              'Escribe un mensaje...'
            }
            placeholderTextColor="#9ca3af"
            onSubmitEditing={handleSend}
            blurOnSubmit
            editable={!disabled}
          />
          <TouchableOpacity style={[styles.sendBtn, disabled && styles.sendBtnDisabled]} onPress={handleSend}>
            <Text style={styles.sendBtnText}>›</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(109,40,217,0.12)',
    paddingBottom:15
  },
  typeRow: { maxHeight: 60 },
  typeRowContent: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#f5f3ff',
  },
  typeBtnActive: { backgroundColor: '#ede9fe', borderColor: 'rgba(109,40,217,0.25)' },
  typeName: { fontSize: 11 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f3ff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#1e1b3a',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
  },
  sendBtn: {
    backgroundColor: '#6d28d9',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  dicePanel: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  dieChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  dieChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.25)',
    backgroundColor: '#f0fdf4',
  },
  dieChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  dieChipText: {
    color: '#065f46',
    fontWeight: '700',
    fontSize: 13,
  },
  dieChipTextActive: {
    color: '#ffffff',
  },
  diceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 6,
  },
  modLabel: { color: '#6b7280', fontSize: 13, flexShrink: 0 },
  modInput: {
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#1e1b3a',
    fontSize: 14,
    width: 64,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.18)',
  },
  rollBtn: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  rollBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
