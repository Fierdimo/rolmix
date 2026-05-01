import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message, MessageType } from '../lib/types';
import { DiceMetadata } from '../lib/types';

interface Props {
  message: Message;
  isOwn: boolean;
  /** ID del usuario actual, necesario para evaluar visibilidad de tiradas secretas. */
  currentUserId?: string;
}

const TYPE_STYLES: Record<MessageType, { label: string; color: string; bg: string }> = {
  message:   { label: '',        color: '#1e1b3a', bg: '#f1f0ff'               },
  action:    { label: '* ',      color: '#92400e', bg: '#fef3c7'               },
  narration: { label: '📖 ',    color: '#5b21b6', bg: '#f5f3ff'               },
  dice:      { label: '🎲 ',    color: '#065f46', bg: '#d1fae5'               },
  whisper:   { label: '🔒 ',    color: '#92400e', bg: '#fff7ed'               },
};

export default function MessageBubble({ message, isOwn, currentUserId }: Props) {
  const cfg = TYPE_STYLES[message.type] ?? TYPE_STYLES.message;

  // Solo los whispers que tienen metadata de dado (campo `die`) son tiradas secretas.
  // Un whisper sin metadata de dado es un mensaje de texto privado ordinario.
  const isDiceMsg = message.type === 'dice' || message.type === 'whisper';
  const meta = isDiceMsg
    ? (message.metadata as DiceMetadata | null)
    : null;
  const hasDiceMeta = !!meta?.die;
  const isSecretRoll = (message.type === 'whisper' && hasDiceMeta) || !!(meta?.secret);
  // El RLS ya filtra los whispers en el servidor; este guard es sólo por si el mensaje
  // llega igualmente (p.ej. propio mensaje en tiempo real antes de guardarse).
  const canSeeSecret = !isSecretRoll || !currentUserId ||
    !!(meta?.whisper_to?.includes(currentUserId));

  function renderContent() {
    if (hasDiceMeta || message.type === 'dice') {
      if (!canSeeSecret) {
        // El rol no permite ver este resultado: mostrar aviso
        return (
          <View>
            <Text style={[styles.content, { color: '#9ca3af', fontStyle: 'italic' }]}>
              {message.content}
            </Text>
            <View style={[styles.diceResult, { backgroundColor: 'rgba(156,163,175,0.15)' }]}>
              <Text style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>🔒 Tirada secreta</Text>
            </View>
          </View>
        );
      }
      if (meta) {
        // Múltiples tiradas de ataque (Ataque completo D&D 3.5)
        if (meta.combat_rolls && meta.combat_rolls.length > 0) {
          return (
            <View>
              <Text style={[styles.content, { color: cfg.color }]}>{message.content}</Text>
              {meta.combat_rolls.map((r, i) => {
                const isCrit   = r.d20 === 20;
                const isFumble = r.d20 === 1;
                const label    = meta.combat_rolls!.length > 1 ? `Ataque ${i + 1}: ` : '';
                return (
                  <View key={i} style={[styles.diceResult, isCrit && styles.diceResultCrit, isFumble && styles.diceResultFumble]}>
                    <Text style={styles.diceResultText}>
                      {label}d20 [{r.d20}]
                      {r.modifier !== 0 ? ` ${r.modifier > 0 ? '+' : ''}${r.modifier}` : ''}
                      {' '}= <Text style={[styles.diceTotal, isCrit && { color: '#d97706' }, isFumble && { color: '#b91c1c' }]}>{r.total}</Text>
                      {isCrit ? ' ✨ ¡Crítico!' : isFumble ? ' 💀 ¡Pifia!' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }
        // Tirada de ataque simple o habilidad
        return (
          <View>
            <Text style={[styles.content, { color: cfg.color }]}>
              {message.content}
            </Text>
           
            <View style={[styles.diceResult, meta.result === 20 && styles.diceResultCrit, meta.result === 1 && styles.diceResultFumble]}>
              <Text style={styles.diceResultText}>
                {meta.die}: {meta.result}
                {meta.modifier !== undefined && meta.modifier !== 0
                  ? ` ${meta.modifier > 0 ? '+' : ''}${meta.modifier}` : ''}
                {' '}= <Text style={[styles.diceTotal, meta.result === 20 && { color: '#d97706' }, meta.result === 1 && { color: '#b91c1c' }]}>{meta.total}</Text>
                {meta.result === 20 ? ' ✨ ¡Crítico!' : meta.result === 1 ? ' 💀 ¡Pifia!' : ''}
              </Text>
            </View>
          </View>
        );
      }
    }
    return (
      <Text style={[styles.content, { color: cfg.color }]}>
        {cfg.label}{message.content}
      </Text>
    );
  }

  // Narration, dice and whisper-dice are full-width, centered
  const isFullWidth = message.type === 'narration' || message.type === 'dice'
    || (message.type === 'whisper' && hasDiceMeta);

  if (isFullWidth) {
    return (
      <View style={[styles.fullWidthWrapper, { backgroundColor: cfg.bg }]}>
        {renderContent()}
        {/* <Text style={styles.fullWidthMeta}>
          — {message.profiles?.username ?? 'Anon'}
        </Text> */}
      </View>
    );
  }

  return (
    <View style={[styles.row, isOwn ? styles.rowOwn : styles.rowOther]}>
      {!isOwn && (
        <View style={[styles.avatar, { backgroundColor: message.profiles?.avatar_color ?? '#7c3aed' }]}>
          <Text style={styles.avatarText}>
            {(message.profiles?.username ?? '?')[0].toUpperCase()}
          </Text>
        </View>
      )}
      <View style={[styles.bubble, { backgroundColor: isOwn ? '#ede9fe' : cfg.bg }, isOwn && styles.bubbleOwn]}>
        {!isOwn && (
          <Text style={[styles.username, { color: message.profiles?.avatar_color ?? '#a78bfa' }]}>
            {message.profiles?.username ?? 'Anon'}
          </Text>
        )}
        {renderContent()}
        <Text style={styles.time}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4, paddingHorizontal: 12 },
  rowOwn: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bubble: {
    maxWidth: '75%',
    borderRadius: 16,
    padding: 10,
    paddingHorizontal: 14,
    shadowColor: '#6d28d9',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleOwn: { borderBottomRightRadius: 4 },
  username: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  content: { fontSize: 12 },
  time: { fontSize: 10, color: '#9ca3af', marginTop: 4, textAlign: 'right' },
  fullWidthWrapper: {
    marginVertical: 6,
    marginHorizontal: 12,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(109,40,217,0.12)',
  },
  fullWidthMeta: { color: '#9ca3af', fontSize: 11, marginTop: 4 },
  diceResult: {
    marginTop: 6,
    backgroundColor: '#d1fae5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  diceResultCrit: {
    backgroundColor: '#fef9c3',
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.35)',
  },
  diceResultFumble: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
  },
  diceResultText: { color: '#065f46', fontSize: 10, fontWeight: '600' },
  diceTotal: { fontSize: 12, fontWeight: '800' },
  diceTag: { color: '#d97706', fontSize: 11, marginTop: 4, fontWeight: '600' },
});
