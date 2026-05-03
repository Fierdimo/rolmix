import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { CombatEncounter, Combatant, Character } from '../lib/types';
import { useAuth } from './useAuth';
import { rollDie, getSystem } from '../lib/systems';
import { computeFinalStats } from '../lib/systems/aggregate';
import type { CharacterData } from '../lib/systems/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CombatParticipant {
  character: Character;
  isNpc: boolean;
}

export interface InitiativeEntry {
  character: Character;
  isNpc: boolean;
  initiative: number;
  roll: number;
  dexMod: number;
}

export interface CombatState {
  encounter: CombatEncounter | null;
  combatants: Combatant[];
  activeCombatant: Combatant | null;
  characterMap: Record<string, Character>;
  combatLoading: boolean;
}

export interface CombatActions {
  /** Inicia el combate: tira iniciativas, crea el encuentro y devuelve el orden. */
  startCombat: (participants: CombatParticipant[]) => Promise<InitiativeEntry[] | null>;
  endCombat: () => Promise<void>;
  nextTurn: () => Promise<void>;
  prevTurn: () => Promise<void>;
  /** Aplica un delta a los PG del combatiente (positivo = curación, negativo = daño). */
  updateHp: (combatantId: string, delta: number) => Promise<void>;
  /** Reordena la iniciativa: el combatiente pasa a actuar justo después de afterCombatantId. */
  delayAfter: (combatantId: string, afterCombatantId: string | null) => Promise<boolean>;
  /**
   * Descuenta el recurso de conjuro del personaje:
   * - Lanzadores preparados: marca el primer prepSlot sin usar con ese nombre como `used`.
   * - Lanzadores espontáneos o sin prepSlot coincidente: incrementa spellSlots[level].used.
   * Persiste en Supabase y actualiza characterMap localmente.
   */
  consumeSpell: (characterId: string, spellName: string, spellLevel: number) => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCombat(sessionId: string, isDm: boolean): CombatState & CombatActions {
  const { user } = useAuth();
  const [encounter, setEncounter]     = useState<CombatEncounter | null>(null);
  const [combatants, setCombatants]   = useState<Combatant[]>([]);
  const [characterMap, setCharacterMap] = useState<Record<string, Character>>({});
  const [combatLoading, setCombatLoading] = useState(true);

  const encounterIdRef = useRef<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeCombatant: Combatant | null = encounter
    ? (combatants.find(
        (c) => c.turn_order === encounter.active_index && !c.is_defeated,
      ) ?? null)
    : null;

  // ── Loaders ───────────────────────────────────────────────────────────────

  const loadCharactersForCombatants = useCallback(async (list: Combatant[]) => {
    const ids = list.map((c) => c.character_id).filter(Boolean) as string[];
    if (ids.length === 0) return;

    // Cargar datos base
    const { data: baseRows } = await supabase.from('characters').select('*').in('id', ids);
    if (!baseRows) return;

    // En modo partida, mezclar con datos de sesión (tienen HP/slots actualizados)
    const { data: scRows } = await supabase
      .from('session_characters')
      .select('character_id, data')
      .eq('session_id', sessionId)
      .in('character_id', ids);
    const scMap: Record<string, Record<string, unknown>> = {};
    for (const sc of scRows ?? []) scMap[sc.character_id] = sc.data as Record<string, unknown>;

    setCharacterMap((prev) => {
      const next = { ...prev };
      for (const ch of baseRows) {
        // Si existe copia de sesión, usar sus datos (slots, HP…) sobre la base
        next[ch.id] = scMap[ch.id]
          ? { ...ch, data: { ...(ch.data as object), ...scMap[ch.id] } }
          : ch;
      }
      return next;
    });
  }, [sessionId]);

  const fetchCombatants = useCallback(
    async (encounterId: string) => {
      const { data } = await supabase
        .from('combatants')
        .select('*')
        .eq('encounter_id', encounterId)
        .order('turn_order', { ascending: true });
      const list = (data ?? []) as Combatant[];
      setCombatants(list);
      await loadCharactersForCombatants(list);
    },
    [loadCharactersForCombatants],
  );

  const fetchEncounter = useCallback(async () => {
    const { data } = await supabase
      .from('combat_encounters')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .maybeSingle();
    const enc = (data as CombatEncounter | null) ?? null;
    setEncounter(enc);
    encounterIdRef.current = enc?.id ?? null;
    if (enc) {
      await fetchCombatants(enc.id);
    } else {
      setCombatants([]);
    }
    setCombatLoading(false);
  }, [sessionId, fetchCombatants]);

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchEncounter();

    // Canal de encuentros: detecta inicio/fin de combate
    const encChan = supabase
      .channel(`combat_enc_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'combat_encounters', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setEncounter(null);
            setCombatants([]);
            encounterIdRef.current = null;
            return;
          }
          const enc = payload.new as CombatEncounter;
          if (!enc.is_active) {
            setEncounter(null);
            setCombatants([]);
            encounterIdRef.current = null;
            return;
          }
          setEncounter(enc);
          encounterIdRef.current = enc.id;
          // Cargar combatientes si es un encuentro nuevo
          if (payload.eventType === 'INSERT') {
            fetchCombatants(enc.id);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(encChan); };
  }, [sessionId, fetchEncounter, fetchCombatants]);

  // Canal de combatientes: detecta cambios de HP/estado durante el combate
  useEffect(() => {
    if (!encounter) return;
    const combChan = supabase
      .channel(`combat_comb_${encounter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'combatants', filter: `encounter_id=eq.${encounter.id}` },
        () => { fetchCombatants(encounter.id); },
      )
      .subscribe();
    return () => { supabase.removeChannel(combChan); };
  }, [encounter?.id, fetchCombatants]);

  // Canal de session_characters: sincroniza datos (slots, HP, preps…) mientras el combate está activo
  useEffect(() => {
    const scChan = supabase
      .channel(`combat_sc_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_characters', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const sc = payload.new as { character_id: string; data: Record<string, unknown> };
          if (!sc?.character_id) return;
          setCharacterMap((prev) => {
            const existing = prev[sc.character_id];
            if (!existing) return prev;
            return {
              ...prev,
              [sc.character_id]: {
                ...existing,
                data: { ...(existing.data as object), ...sc.data },
              },
            };
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(scChan); };
  }, [sessionId]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const startCombat = useCallback(
    async (participants: CombatParticipant[]): Promise<InitiativeEntry[] | null> => {
      if (!isDm) return null;

      // Tirar iniciativas
      const withInit: InitiativeEntry[] = participants.map(({ character, isNpc }) => {
        const sys = getSystem(character.system_id);
        const stats = sys
          ? computeFinalStats(sys, character.data as CharacterData)
          : ({} as Record<string, number>);
        const dexMod = stats.mod_dex ?? Math.floor((Number(character.data.dex ?? 10) - 10) / 2);
        const roll   = rollDie('d20');
        return { character, isNpc, initiative: roll + dexMod, roll, dexMod };
      });

      // Ordenar por iniciativa DESC, luego DEX mod DESC en caso de empate
      withInit.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod);

      // Preparar mapa de personajes
      const map: Record<string, Character> = {};
      for (const e of withInit) map[e.character.id] = e.character;
      setCharacterMap(map);

      // Construir payload para el RPC
      const combatantPayload = withInit.map((e, i) => ({
        character_id: e.character.id,
        name:         e.character.name,
        initiative:   e.initiative,
        dex_mod:      e.dexMod,
        turn_order:   i,
        hp_max:       Number(e.character.data.hp_max ?? 8),
        hp_current:   Number(e.character.data.hp_max ?? 8),
        is_npc:       e.isNpc,
      }));

      const { error } = await supabase.rpc('start_combat', {
        p_session_id: sessionId,
        p_combatants: combatantPayload,
      });

      if (error) {
        console.error('[useCombat] start_combat error:', error);
        return null;
      }

      await fetchEncounter();
      return withInit;
    },
    [isDm, sessionId, fetchEncounter],
  );

  const endCombat = useCallback(async () => {
    if (!isDm || !encounter) return;
    await supabase.rpc('end_combat', { p_encounter_id: encounter.id });
    setEncounter(null);
    setCombatants([]);
    encounterIdRef.current = null;
  }, [isDm, encounter]);

  const nextTurn = useCallback(async () => {
    if (!isDm || !encounter) return;
    const { data } = await supabase.rpc('next_combat_turn', {
      p_encounter_id: encounter.id,
    });
    if (data?.[0]) {
      setEncounter((prev) =>
        prev ? { ...prev, active_index: data[0].new_index, round: data[0].new_round } : null,
      );
    }
  }, [isDm, encounter]);

  const prevTurn = useCallback(async () => {
    if (!isDm || !encounter) return;
    const { data } = await supabase.rpc('prev_combat_turn', {
      p_encounter_id: encounter.id,
    });
    if (data?.[0]) {
      setEncounter((prev) =>
        prev ? { ...prev, active_index: data[0].new_index, round: data[0].new_round } : null,
      );
    }
  }, [isDm, encounter]);

  const updateHp = useCallback(
    async (combatantId: string, delta: number) => {
      if (!isDm) return;
      const { data: newHp } = await supabase.rpc('update_combatant_hp', {
        p_combatant_id: combatantId,
        p_hp_delta:     delta,
      });
      if (newHp !== null && newHp !== undefined) {
        setCombatants((prev) =>
          prev.map((c) =>
            c.id === combatantId
              ? { ...c, hp_current: newHp as number, is_defeated: (newHp as number) === 0 }
              : c,
          ),
        );
      }
    },
    [isDm],
  );

  const delayAfter = useCallback(
    async (combatantId: string, afterCombatantId: string | null) => {
      if (!encounter) return false;
      const { data, error } = await supabase.rpc('delay_after', {
        p_encounter_id: encounter.id,
        p_mover_id:     combatantId,
        p_after_id:     afterCombatantId,
      });
      if (error) {
        console.error('[useCombat] delay_after error:', error.message);
        return false;
      }
      if (data?.[0]) {
        setEncounter((prev) =>
          prev ? { ...prev, active_index: data[0].new_index, round: data[0].new_round } : null,
        );
      }
      // Recargar siempre: turn_order ha cambiado para varios combatientes
      await fetchCombatants(encounter.id);
      return true;
    },
    [encounter, fetchCombatants],
  );

  const consumeSpell = useCallback(
    async (characterId: string, spellName: string, spellLevel: number) => {
      const ch = characterMap[characterId];
      if (!ch) return;

      const data = { ...(ch.data as Record<string, unknown>) };

      // ── 1. Intentar consumir un espacio preparado (Mago, Clérigo, Druida…) ──
      const prepSlots = Array.isArray(data.preparedSlots)
        ? [...(data.preparedSlots as Array<Record<string, unknown>>)]
        : [];
      const prepIdx = prepSlots.findIndex(
        (p) => !p.used && String(p.spellName).toLowerCase() === spellName.toLowerCase(),
      );
      if (prepIdx !== -1) {
        prepSlots[prepIdx] = { ...prepSlots[prepIdx], used: true };
        data.preparedSlots = prepSlots;
      } else {
        // ── 2. Fallback: consumir espacio espontáneo (Hechicero, Bardo…) ──
        const spellSlots = { ...((data.spellSlots as Record<number, { max: number; used: number }>) ?? {}) };
        const cur = spellSlots[spellLevel] ?? { max: 0, used: 0 };
        if (cur.max > 0 && cur.used < cur.max) {
          spellSlots[spellLevel] = { ...cur, used: cur.used + 1 };
          data.spellSlots = spellSlots;
        }
      }

      // Persistir en Supabase (en modo sesión → session_characters vía RPC)
      const { data: scCheck } = await supabase
        .from('session_characters')
        .select('character_id')
        .eq('session_id', sessionId)
        .eq('character_id', characterId)
        .maybeSingle();

      if (scCheck) {
        // Hay copia de sesión: actualizar ahí (misma ruta que CharacterEditorScreen)
        const { error } = await supabase.rpc('update_session_character_data', {
          p_session_id: sessionId,
          p_character_id: characterId,
          p_data: data,
        });
        if (error) { console.error('[useCombat] consumeSpell (session) error:', error.message); return; }
      } else {
        // Sin copia de sesión: actualizar directamente en characters
        const { error } = await supabase
          .from('characters')
          .update({ data })
          .eq('id', characterId);
        if (error) { console.error('[useCombat] consumeSpell error:', error.message); return; }
      }

      // Actualizar characterMap local
      setCharacterMap((prev) => ({
        ...prev,
        [characterId]: { ...ch, data },
      }));
    },
    [characterMap],
  );

  return {
    encounter,
    combatants,
    activeCombatant,
    characterMap,
    combatLoading,
    startCombat,
    endCombat,
    nextTurn,
    prevTurn,
    updateHp,
    delayAfter,
    consumeSpell,
  };
}
