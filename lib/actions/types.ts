// ── ActionDefinition ──────────────────────────────────────────────────────────
// Schema estructurado que el motor de mapa usa para interpretar conjuros,
// dotes y habilidades. Separado del catálogo de texto (CatalogSpell/CatalogFeat).

export type AoeShape = 'sphere' | 'cone' | 'line' | 'cylinder' | 'emanation'

/** Cómo interactúa la acción con el mapa al ejecutarse. */
export type TargetingMode =
  | 'none'          // sin efecto en el mapa (pasivo / solo stats)
  | 'single_token'  // el usuario toca un token objetivo
  | 'point_aoe'     // el usuario toca un punto → AOE se centra ahí
  | 'self_aoe'      // AOE centrado en el propio token (emanación)
  | 'self_cone'     // cono que sale del propio token en dirección elegida
  | 'line_aoe'      // línea desde el token en dirección elegida

export type RangeCategory = 'self' | 'touch' | 'close' | 'medium' | 'long' | 'fixed'

export type SaveType = 'Reflex' | 'Will' | 'Fortitude'
export type SaveEffect = 'negates' | 'half' | 'partial'

export interface DamageSpec {
  dice: string           // "1d6", "2d8", etc.
  type: string           // "fire" | "cold" | "force" | "lightning" | "acid" | ...
  per_level?: boolean    // multiplica el número de dados por nivel del lanzador
  max_dice?: number      // cap (ej. 10 para fireball → máximo 10d6)
  half_on_save?: boolean // si la salvación tiene éxito, el daño es la mitad
}

export interface AoeSpec {
  shape: AoeShape
  size_ft: number        // radio para sphere/cylinder, longitud para cone/line
  width_ft?: number      // para line (normalmente 5ft)
}

export interface ConditionEffect {
  condition: string      // 'sleep' | 'charmed' | 'stunned' | 'prone' | 'blinded' | ...
  duration?: string      // '1_round_per_level' | '1_minute' | 'permanent' | 'concentration'
  save_negates?: boolean
}

export interface ActionDefinition {
  id: string
  source_type: 'spell' | 'feat' | 'class_ability'

  // ── Comportamiento en el mapa ────────────────────────────────────────────
  targeting_mode: TargetingMode
  range: {
    category: RangeCategory
    fixed_ft?: number    // solo para category === 'fixed'
  }
  aoe?: AoeSpec
  affects_allies: boolean  // ¿el AOE puede golpear aliados?

  // ── Resolución ───────────────────────────────────────────────────────────
  damage?: DamageSpec[]
  saving_throw?: {
    type: SaveType
    effect: SaveEffect
    dc_formula: 'standard'  // 10 + nivel_conjuro + mod_característica
  }
  conditions?: ConditionEffect[]

  // ── Visual ───────────────────────────────────────────────────────────────
  overlay_color: string    // hex, ej. "#FF6B35"
  overlay_opacity?: number // 0-1, default 0.35
}
