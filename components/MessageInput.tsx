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
  { type: 'message',   label: '💬',  color: '#e2e8f0' },
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

  function handleSend() {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, selectedType);
    setText('');
  }

  function handleDiceRoll(die: string) {
    if (disabled) return;
    const meta = rollDice(die);
    const mod = parseInt(modifier, 10);
    if (!isNaN(mod) && mod !== 0) {
      meta.modifier = mod;
      meta.total = meta.result + mod;
    }
    const label =
      mod && !isNaN(mod) && mod !== 0
        ? `Tirada ${die}${mod > 0 ? '+' : ''}${mod}`
        : `Tirada ${die}`;
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
          <View style={styles.diceRow}>
            {DICE.map((die) => (
              <TouchableOpacity key={die} style={styles.dieBtn} onPress={() => handleDiceRoll(die)}>
                <Text style={styles.dieBtnText}>{die}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modifierRow}>
            <Text style={styles.modLabel}>Modificador:</Text>
            <TextInput
              style={styles.modInput}
              value={modifier}
              onChangeText={setModifier}
              keyboardType="numeric"
              placeholder="+0"
              placeholderTextColor="#64748b"
            />
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
            placeholderTextColor="#64748b"
            multiline
            returnKeyType="send"
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
    backgroundColor: '#1e1b4b',
    borderTopWidth: 1,
    borderTopColor: 'rgba(167,139,250,0.15)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  typeBtnActive: { backgroundColor: 'rgba(167,139,250,0.1)' },
  typeName: { fontSize: 11 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e2e8f0',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
  sendBtn: {
    backgroundColor: '#7c3aed',
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  dicePanel: { padding: 12 },
  diceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  dieBtn: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.3)',
  },
  dieBtnText: { color: '#34d399', fontWeight: '700', fontSize: 14 },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
    justifyContent: 'center',
  },
  modLabel: { color: '#94a3b8', fontSize: 13 },
  modInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 14,
    width: 70,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },
});
