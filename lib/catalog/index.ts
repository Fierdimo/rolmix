// Loader de catálogos locales por sistema.
// Las JSONs viven en /data/<systemId>/*.json y se empaquetan con la app
// (Metro embebe los require de JSON estáticos en el bundle, sin red).
// Mantener offline-first y simple: añadir más datos = añadir más JSON.

import {
  SystemCatalog, CatalogSpell, CatalogEquipment, CatalogFeat,
  CatalogRace, CatalogSkill, CatalogClass, CatalogMagicItem, CatalogLanguage,
} from './types';

import dnd35Spells from '../../data/dnd35/spells.json';
import dnd35Equipment from '../../data/dnd35/equipment.json';
import dnd35Feats from '../../data/dnd35/feats.json';
import dnd35Races from '../../data/dnd35/races.json';
import dnd35Skills from '../../data/dnd35/skills.json';
import dnd35Classes from '../../data/dnd35/classes.json';
import dnd35Languages from '../../data/dnd35/languages.json';
import dnd35MagicItems from '../../data/dnd35/magic-items.json';
import dnd35Mundane from '../../data/dnd35/mundane-items.json';
import dnd5eSpells from '../../data/dnd5e/spells.json';
import dnd5eEquipment from '../../data/dnd5e/equipment.json';
import pfSpells from '../../data/pathfinder/spells.json';
import pfEquipment from '../../data/pathfinder/equipment.json';

// Combina equipo curado + objetos mundanos importados, sin duplicar por id.
function mergeEquipment(...lists: CatalogEquipment[][]): CatalogEquipment[] {
  const byId = new Map<string, CatalogEquipment>();
  for (const list of lists) for (const it of list) if (!byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Convierte CatalogMagicItem → CatalogEquipment para que aparezcan en el
// picker de equipo (con sus bonos automáticos ya mapeados por el importer).
function magicAsEquipment(items: CatalogMagicItem[]): CatalogEquipment[] {
  return items.map((m) => ({
    id: m.id,
    name: m.name,
    slot: m.slot ?? 'other',
    category: 'wondrous',
    bonuses: m.bonuses,
    notes: m.description,
    cost: m.cost,
  }));
}

const CATALOGS: Record<string, SystemCatalog> = {
  'dnd35': {
    systemId: 'dnd35',
    source: 'PHB 3.5 (importado de zellfaze-zz/dnd-generator, OGL)',
    spells: dnd35Spells as CatalogSpell[],
    equipment: mergeEquipment(
      dnd35Equipment as CatalogEquipment[],
      dnd35Mundane as CatalogEquipment[],
      magicAsEquipment(dnd35MagicItems as CatalogMagicItem[]),
    ),
    feats: dnd35Feats as CatalogFeat[],
    races: dnd35Races as CatalogRace[],
    skills: dnd35Skills as CatalogSkill[],
    classes: dnd35Classes as CatalogClass[],
    magicItems: dnd35MagicItems as CatalogMagicItem[],
    languages: dnd35Languages as CatalogLanguage[],
  },
  'dnd5e': {
    systemId: 'dnd5e',
    source: 'PHB 5e (semilla curada)',
    spells: dnd5eSpells as CatalogSpell[],
    equipment: dnd5eEquipment as CatalogEquipment[],
    feats: [],
  },
  'pathfinder': {
    systemId: 'pathfinder',
    source: 'Pathfinder 1e Core (semilla curada)',
    spells: pfSpells as CatalogSpell[],
    equipment: pfEquipment as CatalogEquipment[],
    feats: [],
  },
};

export function getCatalog(systemId: string): SystemCatalog | undefined {
  return CATALOGS[systemId];
}

export function listCatalogs(): SystemCatalog[] {
  return Object.values(CATALOGS);
}

export type {
  SystemCatalog, CatalogSpell, CatalogEquipment, CatalogFeat,
  CatalogRace, CatalogSkill, CatalogClass, CatalogMagicItem, CatalogLanguage,
};
