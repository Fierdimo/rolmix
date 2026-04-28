/**
 * Definición declarativa de un sistema de rol.
 * Cada sistema describe qué campos puede llenar el usuario,
 * qué clases existen (con bonos automáticos por nivel),
 * qué slots de equipo tiene y qué objetivos puede tener un bono.
 *
 * Para añadir un sistema nuevo: crear un archivo en lib/systems/<id>.ts
 * que exporte una `SystemDefinition` y registrarlo en `index.ts`.
 */

export type FieldType = 'number' | 'text' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  group?: string;
  default?: string | number;
  min?: number;
  max?: number;
  options?: string[];
  help?: string;
}

export interface RollableAction {
  id: string;
  label: string;
  group?: string;
  die: string;          // 'd20', 'd100', '1d8', etc.
  modifier: number;     // bonus/penalty ya calculado
  /** Ataques iterativos adicionales (D&D 3.5): modificadores absolutos del 2.º, 3.º y 4.º
   *  ataque cuando BAB ≥ 6. Solo presente en acciones de ataque con arma o a cuerpo/distancia. */
  extraAttacks?: number[];
}

/**
 * Estructura del jsonb `data` de un personaje.
 * Las claves planas (str, dex, level, sk_*) las definen los `fields` del sistema.
 * Las colecciones siguientes son opcionales y comunes a todos los sistemas.
 */
export interface CharacterData {
  [key: string]: unknown;
  classes?: ClassEntry[];
  equipment?: EquipmentItem[];
  inventory?: InventoryItem[];
  spells?: SpellEntry[];
  feats?: FeatItem[];
  skills?: SkillEntry[];
}

/** Habilidad del personaje (D&D 3.5: transclase = mismo coste de bono pero techo /2). */
export interface SkillEntry {
  id: string;        // local uid, no el slug del catálogo
  name: string;
  ability?: string;  // 'Strength', 'Dexterity', … o abreviatura.
  ranks: number;
  classSkill?: boolean;
  miscMod?: number;  // bono varios (sinergias, raza, etc.)
  notes?: string;
}

/** Dote/talento que el personaje tiene activo y que puede otorgar bonos. */
export interface FeatItem {
  id: string;
  name: string;
  bonuses?: BonusEffect[];
  notes?: string;
}

/** Un nivel de clase del personaje. */
export interface ClassEntry {
  id: string;        // id local
  classId: string;   // id de ClassDef
  level: number;
}

/** Un objeto que el personaje puede equipar y que otorga bonos cuando está activo. */
export interface EquipmentItem {
  id: string;
  name: string;
  slot: string;             // ej. 'weapon', 'armor', 'shield', 'ring'
  equipped: boolean;        // si es false sólo "lo tiene"
  bonuses: BonusEffect[];   // efectos automáticos cuando equipped=true
  notes?: string;
}

/** Item de mochila sin efectos mecánicos. */
export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  notes?: string;
}

/** Conjuro / Habilidad de lanzador. */
export interface SpellEntry {
  id: string;
  name: string;
  level: number;            // 0 = truco / cantrip
  prepared?: boolean;       // @deprecated – usar data.preparedSlots
  used?: boolean;           // @deprecated
  notes?: string;
}

/** Una preparación de conjuro en un espacio de nivel concreto (lanzadores memorizadores) */
export interface PrepSlot {
  id: string;
  spellName: string;   // nombre del conjuro preparado
  spellLevel: number;  // nivel mínimo del conjuro
  slotLevel: number;   // nivel del espacio consumido (>= spellLevel)
  used: boolean;       // ya lanzado hoy
}

/**
 * Tipos de bonificación (D&D 3.5 / Pathfinder).
 * Salvo `dodge`, `circumstance` y `untyped`, dos bonos del MISMO tipo
 * que afectan al MISMO target NO se apilan: sólo cuenta el más alto.
 * Las penalizaciones del mismo tipo sí se acumulan (RAW).
 */
export type BonusType =
  | 'untyped'
  | 'alchemical'
  | 'armor'
  | 'circumstance'
  | 'competence'
  | 'deflection'
  | 'dodge'
  | 'enhancement'
  | 'insight'
  | 'luck'
  | 'morale'
  | 'natural'      // armadura natural
  | 'profane'
  | 'racial'
  | 'resistance'
  | 'sacred'
  | 'shield'
  | 'size';

/** Tipos cuyos bonos siempre se apilan entre sí. */
export const STACKING_BONUS_TYPES: ReadonlySet<BonusType> = new Set<BonusType>([
  'untyped', 'dodge', 'circumstance',
]);

/** Efecto numérico aplicado a una stat o acción. */
export interface BonusEffect {
  /** Id de stat (ej 'ac', 'mod_str') o de acción (ej 'sk_stealth', 'attack_melee'). */
  target: string;
  value: number;
  /** Tipo de bono para el cálculo de apilamiento (default: 'untyped'). */
  type?: BonusType;
}

/** Lo que una clase otorga al alcanzar cierto nivel total. */
export interface ClassGrant {
  /** Bonos sumados a `computeStats`. */
  statBonuses?: Record<string, number>;
  /** Bonos sumados al modificador de la acción cuyo id coincida. */
  actionBonuses?: Record<string, number>;
  /** Etiquetas informativas que se muestran en UI ("Ataque furtivo +2d6"). */
  features?: string[];
}

export interface ClassDef {
  id: string;
  name: string;
  description?: string;
  /** Calcula los bonos acumulados para `level` niveles en esta clase. */
  perLevel: (level: number) => ClassGrant;
}

/** Resultado del cálculo automático de espacios de conjuro. */
export interface SpellSlotBreakdown {
  className: string;
  castingType: 'prepared' | 'spontaneous';
  abilityLabel: string;
  mod: number;
  /** Nivel de conjuro → espacios base de la tabla de clase/nivel */
  base: Record<number, number>;
  /** Nivel de conjuro → bonus por atributo alto */
  bonus: Record<number, number>;
  /** Nivel de conjuro → espacio extra (dominio de clérigo / especialización) */
  extra: Record<number, number>;
}

export interface SpellSlotResult {
  /** Nivel de conjuro → total de espacios (suma de todas las clases) */
  totals: Record<number, number>;
  breakdown: SpellSlotBreakdown[];
}

export interface SystemDefinition {
  id: string;
  name: string;
  short: string;
  fields: FieldDef[];
  /** Clases disponibles (opcional). */
  classes?: ClassDef[];
  /** Slots de equipo disponibles. */
  equipmentSlots?: { id: string; label: string }[];
  /** Objetivos válidos para un bono de equipo (para el picker). */
  bonusTargets?: { id: string; label: string }[];
  /** Si true, se muestra la sección de conjuros en el editor. */
  hasSpells?: boolean;
  /** Calcula automáticamente los espacios de conjuro a partir de clase/nivel/atributo. */
  computeSpellSlots?: (data: CharacterData) => SpellSlotResult | null;
  /** Devuelve estadísticas derivadas SIN considerar equipo/clases. */
  computeStats: (data: CharacterData) => Record<string, number>;
  /** Devuelve acciones lanzables SIN considerar equipo/clases. */
  actions: (data: CharacterData) => RollableAction[];
}

/** Helper común: modificador estilo d20 (D&D 3.5/5e/Pathfinder 1e). */
export function abilityModifier(score: number | undefined): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  return Math.floor((score - 10) / 2);
}

/** Helper: lee un número del data o devuelve fallback. */
export function num(data: CharacterData, key: string, fallback = 0): number {
  const v = data[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}
