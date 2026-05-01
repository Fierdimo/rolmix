import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonsterEntry } from '../components/chat/MonsterPickerModal';

const STORAGE_KEY = (sessionId: string) => `@rolmix:encounters:${sessionId}`;

/** Un monstruo/NPC dentro de un encuentro preparado. */
export interface EncounterMonsterEntry {
  /** Tipo base del monstruo (del catálogo). */
  monster: MonsterEntry;
  /** Nombre personalizado para este encuentro (ej. "Goblin Capitán"). */
  customName: string;
  /** Cuántas instancias de este tipo se despliegan. */
  count: number;
}

/** Encuentro diseñado por el DM, guardado localmente. */
export interface PreparedEncounter {
  id: string;
  name: string;
  description: string;
  monsters: EncounterMonsterEntry[];
  createdAt: string;
}

export interface SessionEncountersState {
  encounters: PreparedEncounter[];
}

export interface SessionEncountersActions {
  saveEncounter: (enc: PreparedEncounter) => void;
  deleteEncounter: (id: string) => void;
}

export function useSessionEncounters(sessionId: string): SessionEncountersState & SessionEncountersActions {
  const [encounters, setEncounters] = useState<PreparedEncounter[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY(sessionId)).then((raw) => {
      if (raw) {
        try { setEncounters(JSON.parse(raw)); } catch { /* JSON inválido — ignorar */ }
      }
    });
  }, [sessionId]);

  const persist = useCallback((next: PreparedEncounter[]) => {
    AsyncStorage.setItem(STORAGE_KEY(sessionId), JSON.stringify(next)).catch(() => {});
  }, [sessionId]);

  const saveEncounter = useCallback((enc: PreparedEncounter) => {
    setEncounters((prev) => {
      const idx = prev.findIndex((e) => e.id === enc.id);
      const next = idx >= 0
        ? prev.map((e) => (e.id === enc.id ? enc : e))
        : [...prev, enc];
      persist(next);
      return next;
    });
  }, [persist]);

  const deleteEncounter = useCallback((id: string) => {
    setEncounters((prev) => {
      const next = prev.filter((e) => e.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  return { encounters, saveEncounter, deleteEncounter };
}
