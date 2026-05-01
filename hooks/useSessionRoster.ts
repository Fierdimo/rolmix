import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonsterEntry } from '../components/chat/MonsterPickerModal';

const STORAGE_KEY = (sessionId: string) => `@rolmix:roster:${sessionId}`;

export interface SessionRosterState {
  roster: MonsterEntry[];
}

export interface SessionRosterActions {
  addToRoster: (monster: MonsterEntry) => void;
  removeFromRoster: (monsterId: string) => void;
}

export function useSessionRoster(sessionId: string): SessionRosterState & SessionRosterActions {
  const [roster, setRoster] = useState<MonsterEntry[]>([]);

  // Cargar roster persistido al montar
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY(sessionId)).then((raw) => {
      if (raw) {
        try { setRoster(JSON.parse(raw)); } catch { /* JSON inválido — ignorar */ }
      }
    });
  }, [sessionId]);

  const persist = useCallback((next: MonsterEntry[]) => {
    AsyncStorage.setItem(STORAGE_KEY(sessionId), JSON.stringify(next)).catch(() => {});
  }, [sessionId]);

  const addToRoster = useCallback((monster: MonsterEntry) => {
    setRoster((prev) => {
      // No duplicar si ya está en el roster
      if (prev.find((m) => m.id === monster.id)) return prev;
      const next = [...prev, monster];
      persist(next);
      return next;
    });
  }, [persist]);

  const removeFromRoster = useCallback((monsterId: string) => {
    setRoster((prev) => {
      const next = prev.filter((m) => m.id !== monsterId);
      persist(next);
      return next;
    });
  }, [persist]);

  return { roster, addToRoster, removeFromRoster };
}
