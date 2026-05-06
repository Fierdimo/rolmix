export type MessageType = 'message' | 'action' | 'dice' | 'narration' | 'whisper';
export type SessionRole = 'dm' | 'player';
export type MemberStatus = 'invited' | 'pending' | 'accepted' | 'rejected';
export type SessionAccess = 'open' | 'invite';

export interface Profile {
  id: string;
  username: string;
  avatar_color: string;
  created_at: string;
}

/** Partida de rol. El DM es quien la crea (dm_id). */
export interface Session {
  id: string;
  name: string;
  description: string | null;
  system: string | null;          // "D&D 5e", "Pathfinder", etc.
  access: SessionAccess;
  dm_id: string;
  created_at: string;
  dm?: Profile;
  member?: SessionMember | null;
  session_members?: SessionMember[];
}

/** Miembro de una partida. El rol y estado son por partida, no globales. */
export interface SessionMember {
  id: string;
  session_id: string;
  user_id: string;
  role: SessionRole;
  status: MemberStatus;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  active_character_id: string | null;
  profiles?: Profile;
  /** Datos básicos del personaje activo (join con characters). Solo presente en queries que lo solicitan. */
  active_character?: { id: string; name: string; system_id: string } | null;
}

/**
 * Copia de trabajo de un personaje para una partida concreta.
 * El personaje original (tabla characters) nunca se modifica durante la partida.
 * El DM y el jugador pueden editar esta copia.
 */
export interface SessionCharacter {
  id: string;
  session_id: string;
  character_id: string;
  owner_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  type: MessageType;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles?: Profile;
}

export interface CombatRoll {
  d20: number;
  modifier: number;
  total: number;
}

export interface DiceMetadata {
  die: string;
  result: number;
  modifier?: number;
  total: number;
  /** Si la tirada se hizo en nombre de un personaje (lanzamiento dirigido). */
  character_name?: string;
  /** Etiqueta de la acción/competencia tirada (ej: "Sigilo"). */
  action_label?: string;
  /** Si fue lanzada por el DM en nombre del jugador. */
  directed?: boolean;
  /** Tirada en secreto: sólo visible para los user_ids listados en whisper_to. */
  secret?: boolean;
  /** Lista de user_ids que pueden ver el resultado de la tirada secreta. */
  whisper_to?: string[];
  /** Múltiples tiradas de ataque (Ataque completo D&D 3.5). */
  combat_rolls?: CombatRoll[];
  /** Nombre del objetivo del ataque. */
  target_name?: string;
  /** Tipo de acción de combate: 'standard', 'full', 'total_defense', 'defensive'. */
  combat_action_type?: string;
  /** Ataques por turno con objetivo individual (ataque completo con múltiples blancos). */
  per_attacks?: PerAttackEntry[];
  /** Dado de daño del arma (ej. '1d8') para resolución post-tirada. */
  damage_die?: string;
  /** Modificador de daño ya calculado. */
  damage_mod?: number;
}

/** Un ataque individual dentro de un ataque completo (permite objetivos distintos). */
export interface PerAttackEntry {
  /** Índice del ataque (0 = primer ataque al BAB completo). */
  index: number;
  modifier: number;
  roll: CombatRoll;
  targetId: string | null;
  targetName: string | null;
}

/** Encuentro de combate activo en una sesión. */
export interface CombatEncounter {
  id: string;
  session_id: string;
  round: number;
  active_index: number;
  is_active: boolean;
  started_at: string;
  ended_at: string | null;
}

/** Combatiente dentro de un encuentro (snapshot de nombre, iniciativa y PG). */
export interface Combatant {
  id: string;
  encounter_id: string;
  character_id: string | null;
  name: string;
  initiative: number;
  dex_mod: number;
  turn_order: number;
  hp_max: number;
  hp_current: number;
  is_npc: boolean;
  is_defeated: boolean;
}

// ── Mapa ──────────────────────────────────────────────────────────────────────

export interface MapData {
  id: string;
  session_id: string;
  name: string;
  background_url: string | null;
  bg_offset_x: number;
  bg_offset_y: number;
  bg_scale: number;
  grid_cols: number;
  grid_rows: number;
  grid_size_px: number;
  feet_per_square: number;
  is_active: boolean;
  created_at: string;
}

/** Marca de área dibujada sobre el mapa (círculo o rectángulo semitransparente). */
export interface MapShape {
  id: string;
  map_id: string;
  user_id: string;
  shape_type: 'circle' | 'rect' | 'cone';
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  created_at: string;
}

/** Token de un combatiente en el mapa. Enriquecido con datos del combatiente. */
export interface MapToken {
  id: string;
  map_id: string;
  combatant_id: string;
  col: number;
  row: number;
  size_squares: number;
  color: string;
  is_visible: boolean;
  updated_at: string;
  // Denormalizados del combatante para renderizado
  name: string;
  hp_current: number;
  hp_max: number;
  is_npc: boolean;
  is_defeated: boolean;
  is_active_turn: boolean;
  portrait_url?: string;
}

export type MapEventType = 'aoe_cast' | 'token_moved' | 'marker';

export interface MapEvent {
  id: string;
  map_id: string;
  session_id: string;
  type: MapEventType;
  action_id: string | null;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

// ── Hoja de personaje ─────────────────────────────────────────────────────────

/** Hoja de personaje. La forma de `data` la define la SystemDefinition. */
export interface Character {
  id: string;
  owner_id: string;
  system_id: string;
  name: string;
  data: Record<string, string | number>;
  is_npc: boolean;
  created_at: string;
  updated_at: string;
}

