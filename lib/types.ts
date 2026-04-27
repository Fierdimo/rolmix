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
}

/** Hoja de personaje. La forma de `data` la define la SystemDefinition. */
export interface Character {
  id: string;
  owner_id: string;
  system_id: string;
  name: string;
  data: Record<string, string | number>;
  created_at: string;
  updated_at: string;
}

