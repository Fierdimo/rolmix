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
  message:   { label: '',        color: '#e2e8f0', bg: 'rgba(255,255,255,0.07)' },
  action:    { label: '* ',      color: '#fbbf24', bg: 'rgba(251,191,36,0.08)'  },
  narration: { label: '📖 ',    color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  dice:      { label: '🎲 ',    color: '#34d399', bg: 'rgba(52,211,153,0.10)'  },
  whisper:   { label: '🔒 ',    color: '#fbbf24', bg: 'rgba(251,191,36,0.08)' },
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
            <Text style={[styles.content, { color: '#64748b', fontStyle: 'italic' }]}>
              {message.content}
            </Text>
            <View style={[styles.diceResult, { backgroundColor: 'rgba(100,116,139,0.15)' }]}>
              <Text style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>🔒 Tirada secreta</Text>
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
              {(meta.character_name || meta.action_label) ? (
                <Text style={styles.diceTag}>
                  {meta.action_label ?? ''}{meta.character_name ? ` · ${meta.character_name}` : ''}
                  {meta.target_name ? ` → ${meta.target_name}` : ''}
                </Text>
              ) : null}
              {meta.combat_rolls.map((r, i) => {
                const isCrit   = r.d20 === 20;
                const isFumble = r.d20 === 1;
                const label    = meta.combat_rolls!.length > 1 ? `Ataque ${i + 1}: ` : '';
                return (
                  <View key={i} style={[styles.diceResult, isCrit && styles.diceResultCrit, isFumble && styles.diceResultFumble]}>
                    <Text style={styles.diceResultText}>
                      {label}d20 [{r.d20}]
                      {r.modifier !== 0 ? ` ${r.modifier > 0 ? '+' : ''}${r.modifier}` : ''}
                      {' '}= <Text style={[styles.diceTotal, isCrit && { color: '#fbbf24' }, isFumble && { color: '#f87171' }]}>{r.total}</Text>
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
            {(meta.character_name || meta.action_label) ? (
              <Text style={styles.diceTag}>
                {meta.directed ? '🎯 Tirada dirigida · ' : ''}
                {isSecretRoll ? '🔒 Secreta · ' : ''}
                {meta.action_label ?? ''}{meta.character_name ? ` · ${meta.character_name}` : ''}
                {meta.target_name ? ` → ${meta.target_name}` : ''}
              </Text>
            ) : null}
            <View style={[styles.diceResult, meta.result === 20 && styles.diceResultCrit, meta.result === 1 && styles.diceResultFumble]}>
              <Text style={styles.diceResultText}>
                {meta.die}: {meta.result}
                {meta.modifier !== undefined && meta.modifier !== 0
                  ? ` ${meta.modifier > 0 ? '+' : ''}${meta.modifier}` : ''}
                {' '}= <Text style={[styles.diceTotal, meta.result === 20 && { color: '#fbbf24' }, meta.result === 1 && { color: '#f87171' }]}>{meta.total}</Text>
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
        <Text style={styles.fullWidthMeta}>
          — {message.profiles?.username ?? 'Anon'}
        </Text>
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
      <View style={[styles.bubble, { backgroundColor: isOwn ? '#4c1d95' : cfg.bg }, isOwn && styles.bubbleOwn]}>
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
  },
  bubbleOwn: { borderBottomRightRadius: 4 },
  username: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  content: { fontSize: 15, lineHeight: 21 },
  time: { fontSize: 10, color: '#64748b', marginTop: 4, textAlign: 'right' },
  fullWidthWrapper: {
    marginVertical: 6,
    marginHorizontal: 12,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
  },
  fullWidthMeta: { color: '#64748b', fontSize: 11, marginTop: 4 },
  diceResult: {
    marginTop: 6,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  diceResultCrit: {
    backgroundColor: 'rgba(251,191,36,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
  },
  diceResultFumble: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  diceResultText: { color: '#34d399', fontSize: 14, fontWeight: '600' },
  diceTotal: { fontSize: 18, fontWeight: '800' },
  diceTag: { color: '#fbbf24', fontSize: 11, marginTop: 4, fontWeight: '600' },
});
