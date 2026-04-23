// Tipos para los catálogos de datos locales.
// Cada sistema (dnd5e, dnd35, pathfinder, …) puede aportar listas
// curadas de conjuros, equipo y dotes. Se usan como semilla en los
// pickers del editor de personajes; el usuario siempre puede crear
// items manuales también.

import { BonusEffect } from '../systems/types';

export interface CatalogSpell {
  id: string;          // slug único, ej. 'magic-missile'
  name: string;
  level: number;       // 0..9
  school?: string;     // Evocation, Abjuration, …
  classes?: string[];  // ids de clase que pueden lanzarlo
  range?: string;
  duration?: string;
  description?: string;
}

export interface CatalogEquipment {
  id: string;          // slug
  name: string;
  slot: string;        // debe coincidir con system.equipmentSlots[].id
  category?: 'weapon' | 'armor' | 'shield' | 'wondrous' | 'consumable' | 'tool' | 'other';
  bonuses?: BonusEffect[];
  notes?: string;
  weight?: number;     // libras (informativo)
  cost?: string;       // ej. "15 gp"
}

export interface CatalogFeat {
  id: string;
  name: string;
  type?: string;       // General, Metamagic, Item Creation, …
  description?: string;
  prereq?: string;
  prereqs?: string[];
  bonuses?: BonusEffect[];
}

export interface CatalogRace {
  id: string;
  name: string;
  size?: string;
  speed?: number;
  favoredClass?: string;
  languages?: string[];
  bonusLanguages?: string[];
  abilityMods?: Record<string, number>;
  skillBonuses?: Record<string, number>;
  abilities?: string[];
  notes?: string;
}

export interface CatalogSkill {
  id: string;
  name: string;
  ability?: string;
  trainedOnly?: boolean;
  armorCheck?: boolean;
  synergy?: string[];
}

export interface CatalogClass {
  id: string;
  name: string;
  hitDice?: string;
  skillPoints?: number;
  keyStat?: string;
  spellCaster?: boolean;
  classSkills?: string[];
  proficiencies?: string[];
  alignment?: string;
  bab?: number[];
  saves?: { fort: number[]; ref: number[]; will: number[] };
  abilitiesByLevel?: Record<string, string[]>;
}

export interface CatalogMagicItem {
  id: string;
  name: string;
  slot?: string;
  cost?: string;
  weight?: string;
  description?: string;
  bonuses?: BonusEffect[];
}

export interface CatalogLanguage {
  id: string;
  name: string;
  alphabet?: string;
}

export interface SystemCatalog {
  systemId: string;
  source?: string;     // p.ej. 'PHB 3.5 (zellfaze-zz/dnd-generator)'
  spells?: CatalogSpell[];
  equipment?: CatalogEquipment[];
  feats?: CatalogFeat[];
  races?: CatalogRace[];
  skills?: CatalogSkill[];
  classes?: CatalogClass[];
  magicItems?: CatalogMagicItem[];
  languages?: CatalogLanguage[];
}
