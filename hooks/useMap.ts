import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MapData, MapToken, MapShape, Combatant, CombatEncounter, Character } from '../lib/types';

export interface MapSettings {
  grid_cols: number;
  grid_rows: number;
}

interface UseMapParams {
  sessionId: string;
  isDm: boolean;
  combatants: Combatant[];
  encounter: CombatEncounter | null;
  characterMap?: Record<string, Character>;
}

interface UseMapReturn {
  map: MapData | null;
  tokens: MapToken[];
  shapes: MapShape[];
  mapLoading: boolean;
  moveToken: (combatantId: string, col: number, row: number) => Promise<void>;
  placeOwnToken: (col: number, row: number) => Promise<void>;
  createMap: () => Promise<void>;
  addTokensForCombatants: (color?: string) => Promise<void>;
  updateMapSettings: (settings: MapSettings) => Promise<void>;
  updateBackground: (url: string | null, offsetX: number, offsetY: number, scale: number) => Promise<void>;
  addShape: (shape: Omit<MapShape, 'id' | 'created_at'>) => Promise<void>;
  removeShape: (shapeId: string) => Promise<void>;
  clearMyShapes: (mapId: string) => Promise<void>;
}

const NPC_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#06B6D4', '#8B5CF6', '#EC4899'];
let colorIndex = 0;
function nextNpcColor() {
  const c = NPC_COLORS[colorIndex % NPC_COLORS.length];
  colorIndex++;
  return c;
}

function sizeToSquares(size: unknown): number {
  switch (String(size ?? '').toLowerCase()) {
    case 'large':      return 2;
    case 'huge':       return 3;
    case 'gargantuan': return 4;
    case 'colossal':   return 4;
    default:           return 1;
  }
}

function enrichTokens(
  rawTokens: Omit<MapToken, 'name' | 'hp_current' | 'hp_max' | 'is_npc' | 'is_defeated' | 'is_active_turn' | 'portrait_url'>[],
  combatants: Combatant[],
  encounter: CombatEncounter | null,
  characterMap?: Record<string, Character>,
): MapToken[] {
  const combatantMap = Object.fromEntries(combatants.map((c) => [c.id, c]));
  return rawTokens
    .map((t) => {
      const c = combatantMap[t.combatant_id];
      if (!c) return null;
      const char = c.character_id ? characterMap?.[c.character_id] : undefined;
      return {
        ...t,
        name: c.name,
        hp_current: c.hp_current,
        hp_max: c.hp_max,
        is_npc: c.is_npc,
        is_defeated: c.is_defeated,
        is_active_turn: encounter ? c.turn_order === encounter.active_index : false,
        portrait_url: typeof char?.data?.portrait_url === 'string' ? char.data.portrait_url : undefined,
      };
    })
    .filter((t): t is MapToken => t !== null);
}

export function useMap({ sessionId, isDm, combatants, encounter, characterMap }: UseMapParams): UseMapReturn {
  const [map, setMap] = useState<MapData | null>(null);
  const [rawTokens, setRawTokens] = useState<
    Omit<MapToken, 'name' | 'hp_current' | 'hp_max' | 'is_npc' | 'is_defeated' | 'is_active_turn'>[]
  >([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mapChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const shapesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const tokens: MapToken[] = enrichTokens(rawTokens, combatants, encounter, characterMap);

  const fetchMap = useCallback(async () => {
    const { data, error } = await supabase
      .from('maps')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && data) {
      setMap(data as MapData);
      await fetchTokens(data.id);
    }
    setMapLoading(false);
  }, [sessionId]);

  const fetchTokens = useCallback(async (mapId: string) => {
    const { data, error } = await supabase
      .from('map_tokens')
      .select('id, map_id, combatant_id, col, row, size_squares, color, is_visible, updated_at')
      .eq('map_id', mapId);

    if (!error && data) {
      setRawTokens(data as typeof rawTokens);
    }
  }, []);

  // Realtime: cambios en map_tokens
  const subscribeToTokens = useCallback((mapId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const channel = supabase
      .channel(`map_tokens:${mapId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_tokens', filter: `map_id=eq.${mapId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const updated = payload.new as typeof rawTokens[0];
            setRawTokens((prev) => {
              const idx = prev.findIndex((t) => t.id === updated.id);
              return idx >= 0 ? prev.map((t) => (t.id === updated.id ? updated : t)) : [...prev, updated];
            });
          } else if (payload.eventType === 'DELETE') {
            setRawTokens((prev) => prev.filter((t) => t.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();
    channelRef.current = channel;
  }, []);

  // Realtime: cambios en la configuración del mapa (dimensiones)
  const subscribeToMap = useCallback((mapId: string) => {
    if (mapChannelRef.current) supabase.removeChannel(mapChannelRef.current);
    const channel = supabase
      .channel(`maps:${mapId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'maps', filter: `id=eq.${mapId}` },
        (payload) => {
          setMap(payload.new as MapData);
        },
      )
      .subscribe();
    mapChannelRef.current = channel;
  }, []);

  // ── Marcas de área (map_shapes) ────────────────────────────────────────────

  const fetchShapes = useCallback(async (mapId: string) => {
    const { data } = await supabase.from('map_shapes').select('*').eq('map_id', mapId);
    if (data) setShapes(data as MapShape[]);
  }, []);

  const subscribeToShapes = useCallback((mapId: string) => {
    if (shapesChannelRef.current) supabase.removeChannel(shapesChannelRef.current);
    const channel = supabase
      .channel(`map_shapes:${mapId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_shapes', filter: `map_id=eq.${mapId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setShapes((prev) => [...prev, payload.new as MapShape]);
          } else if (payload.eventType === 'DELETE') {
            setShapes((prev) => prev.filter((s) => s.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();
    shapesChannelRef.current = channel;
  }, []);

  const addShape = useCallback(async (shape: Omit<MapShape, 'id' | 'created_at'>) => {
    await supabase.from('map_shapes').insert(shape);
  }, []);

  const removeShape = useCallback(async (shapeId: string) => {
    setShapes((prev) => prev.filter((s) => s.id !== shapeId));
    await supabase.from('map_shapes').delete().eq('id', shapeId);
  }, []);

  const clearMyShapes = useCallback(async (mapId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setShapes((prev) => prev.filter((s) => !(s.map_id === mapId && s.user_id === user.id)));
    await supabase.from('map_shapes').delete().eq('map_id', mapId).eq('user_id', user.id);
  }, []);

  useEffect(() => {
    fetchMap();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (mapChannelRef.current) supabase.removeChannel(mapChannelRef.current);
      if (shapesChannelRef.current) supabase.removeChannel(shapesChannelRef.current);
    };
  }, [fetchMap]);

  useEffect(() => {
    if (map) {
      subscribeToTokens(map.id);
      subscribeToMap(map.id);
      fetchShapes(map.id);
      subscribeToShapes(map.id);
    }
  }, [map?.id, subscribeToTokens, subscribeToMap, fetchShapes, subscribeToShapes]);

  const createMap = useCallback(async () => {
    if (!isDm) return;
    setMapLoading(true);
    const { data, error } = await supabase.rpc('get_or_create_map', { p_session_id: sessionId });
    if (!error && data?.[0]) {
      setMap(data[0] as MapData);
      await fetchTokens(data[0].id);
      subscribeToTokens(data[0].id);
      subscribeToMap(data[0].id);
      await fetchShapes(data[0].id);
      subscribeToShapes(data[0].id);
    }
    setMapLoading(false);
  }, [isDm, sessionId, fetchTokens, subscribeToTokens, subscribeToMap, fetchShapes, subscribeToShapes]);

  const moveToken = useCallback(
    async (combatantId: string, col: number, row: number) => {
      if (!isDm || !map) return;
      const existing = rawTokens.find((t) => t.combatant_id === combatantId);
      const color = existing?.color ?? nextNpcColor();
      const combatant = combatants.find((c) => c.id === combatantId);
      const charSize = combatant?.character_id ? characterMap?.[combatant.character_id]?.data?.size : undefined;
      const sizeSquares = existing?.size_squares ?? sizeToSquares(charSize);

      await supabase.rpc('upsert_map_token', {
        p_map_id: map.id,
        p_combatant_id: combatantId,
        p_col: col,
        p_row: row,
        p_color: color,
        p_size_squares: sizeSquares,
      });
    },
    [isDm, map, rawTokens, combatants, characterMap],
  );

  const addTokensForCombatants = useCallback(
    async (color?: string) => {
      if (!isDm || !map) return;
      const existingIds = new Set(rawTokens.map((t) => t.combatant_id));
      let col = 0;
      const row = 0;
      for (const c of combatants) {
        if (existingIds.has(c.id)) continue;
        const tokenColor = color ?? (c.is_npc ? nextNpcColor() : '#6D28D9');
        const charSize = c.character_id ? characterMap?.[c.character_id]?.data?.size : undefined;
        const sizeSquares = sizeToSquares(charSize);
        await supabase.rpc('upsert_map_token', {
          p_map_id: map.id,
          p_combatant_id: c.id,
          p_col: col,
          p_row: row,
          p_color: tokenColor,
          p_size_squares: sizeSquares,
        });
        col += sizeSquares + 1;
      }
    },
    [isDm, map, rawTokens, combatants, characterMap],
  );

  const placeOwnToken = useCallback(
    async (col: number, row: number) => {
      if (!map) return;
      await supabase.rpc('place_own_token', {
        p_map_id: map.id,
        p_col: col,
        p_row: row,
      });
    },
    [map],
  );

  const updateMapSettings = useCallback(
    async (settings: MapSettings) => {
      if (!isDm || !map) return;
      const { data } = await supabase
        .from('maps')
        .update(settings)
        .eq('id', map.id)
        .select()
        .single();
      if (data) setMap(data as MapData);
    },
    [isDm, map],
  );

  const updateBackground = useCallback(
    async (url: string | null, offsetX: number, offsetY: number, bgScaleVal: number) => {
      if (!isDm || !map) return;
      const { data } = await supabase
        .from('maps')
        .update({ background_url: url, bg_offset_x: Math.round(offsetX), bg_offset_y: Math.round(offsetY), bg_scale: bgScaleVal })
        .eq('id', map.id)
        .select()
        .single();
      if (data) setMap(data as MapData);
    },
    [isDm, map],
  );

  return { map, tokens, shapes, mapLoading, moveToken, placeOwnToken, createMap, addTokensForCombatants, updateMapSettings, updateBackground, addShape, removeShape, clearMyShapes };
}
