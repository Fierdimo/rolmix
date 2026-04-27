import { SystemDefinition, abilityModifier, num, FieldDef, ClassDef, BonusEffect, SpellSlotResult, CharacterData, ClassEntry } from './types';
import { resolveBonusStack } from './aggregate';
import _dnd35Races from '../../data/dnd35/races.json';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'Fuerza', dex: 'Destreza', con: 'Constitución',
  int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma',
};

// ── Bonos raciales ────────────────────────────────────────────
const ABILITY_NAME_TO_KEY: Record<string, (typeof ABILITIES)[number]> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

interface RaceBonus {
  abilityMods: Partial<Record<(typeof ABILITIES)[number], number>>;
  /** sk_* target id → racial bonus value */
  skillBonuses: Record<string, number>;
}

function slugifySkill(name: string): string {
  return 'sk_' + name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getRaceBonus(raceName: string): RaceBonus {
  const empty: RaceBonus = { abilityMods: {}, skillBonuses: {} };
  if (!raceName) return empty;
  const normalized = raceName.trim().toLowerCase();
  const race = (_dnd35Races as Array<Record<string, unknown>>).find(
    (r) => (r.name as string)?.toLowerCase() === normalized ||
            (r.id as string)?.toLowerCase() === normalized
  );
  if (!race) return empty;
  const abilityMods: Partial<Record<(typeof ABILITIES)[number], number>> = {};
  for (const [eng, val] of Object.entries(race.abilityMods ?? {})) {
    const key = ABILITY_NAME_TO_KEY[eng.toLowerCase()];
    if (key) abilityMods[key] = val as number;
  }
  const skillBonuses: Record<string, number> = {};
  for (const [skillName, val] of Object.entries(race.skillBonuses ?? {})) {
    skillBonuses[slugifySkill(skillName)] = val as number;
  }
  return { abilityMods, skillBonuses };
}

const fields: FieldDef[] = [
  { key: 'race', label: 'Raza', type: 'text', group: 'Identidad' },
  { key: 'level', label: 'Nivel total', type: 'number', group: 'Identidad', default: 1, min: 1, max: 20 },
  { key: 'xp', label: 'Experiencia (PX)', type: 'number', group: 'Identidad', default: 0, min: 0 },
  { key: 'ac', label: 'CA base', type: 'number', group: 'Combate', default: 10, help: 'Sin contar armadura/escudo: el equipo aporta su bono.' },
  { key: 'hp_max', label: 'PG Máximos', type: 'number', group: 'Combate', default: 8 },
  ...ABILITIES.map<FieldDef>((a) => ({
    key: a, label: ABILITY_LABEL[a], type: 'number', group: 'Atributos', default: 10, min: 1, max: 40,
  })),
  { key: 'sk_listen', label: 'Escuchar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_spot', label: 'Avistar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_hide', label: 'Esconderse (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_move_silently', label: 'Moverse Sigilosamente (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_search', label: 'Buscar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_diplomacy', label: 'Diplomacia (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_bluff', label: 'Engañar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_jump', label: 'Saltar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
];

const SKILL_TO_ABILITY: Record<string, (typeof ABILITIES)[number]> = {
  sk_listen: 'wis', sk_spot: 'wis', sk_hide: 'dex', sk_move_silently: 'dex',
  sk_search: 'int', sk_diplomacy: 'cha', sk_bluff: 'cha', sk_jump: 'str',
};
const SKILL_LABEL: Record<string, string> = {
  sk_listen: 'Escuchar', sk_spot: 'Avistar', sk_hide: 'Esconderse',
  sk_move_silently: 'Moverse Sigilosamente', sk_search: 'Buscar',
  sk_diplomacy: 'Diplomacia', sk_bluff: 'Engañar', sk_jump: 'Saltar',
};

// Catálogo completo de habilidades del PHB 3.5 expuesto como bonus targets
// para que las dotes/objetos puedan apuntar a cualquiera de ellas
// (no sólo a las 8 rápidas con campo dedicado). Los bonos se aplican a las
// habilidades adicionales del usuario vía emparejamiento por slug del nombre.
const ALL_PHB_SKILLS: Array<{ id: string; label: string; ability: (typeof ABILITIES)[number] }> = [
  { id: 'sk_appraise', label: 'Tasación', ability: 'int' },
  { id: 'sk_balance', label: 'Equilibrio', ability: 'dex' },
  { id: 'sk_bluff', label: 'Engañar', ability: 'cha' },
  { id: 'sk_climb', label: 'Trepar', ability: 'str' },
  { id: 'sk_concentration', label: 'Concentración', ability: 'con' },
  { id: 'sk_craft', label: 'Artesanía', ability: 'int' },
  { id: 'sk_decipher_script', label: 'Descifrar Escritura', ability: 'int' },
  { id: 'sk_diplomacy', label: 'Diplomacia', ability: 'cha' },
  { id: 'sk_disable_device', label: 'Inutilizar Mecanismo', ability: 'int' },
  { id: 'sk_disguise', label: 'Disfrazarse', ability: 'cha' },
  { id: 'sk_escape_artist', label: 'Escapismo', ability: 'dex' },
  { id: 'sk_forgery', label: 'Falsificar', ability: 'int' },
  { id: 'sk_gather_information', label: 'Recopilar Información', ability: 'cha' },
  { id: 'sk_handle_animal', label: 'Trato con Animales', ability: 'cha' },
  { id: 'sk_heal', label: 'Sanar', ability: 'wis' },
  { id: 'sk_hide', label: 'Esconderse', ability: 'dex' },
  { id: 'sk_intimidate', label: 'Intimidar', ability: 'cha' },
  { id: 'sk_jump', label: 'Saltar', ability: 'str' },
  { id: 'sk_knowledge_arcana', label: 'Conocimiento (Arcano)', ability: 'int' },
  { id: 'sk_knowledge_architecture_and_engineering', label: 'Conocimiento (Arquitectura)', ability: 'int' },
  { id: 'sk_knowledge_dungeoneering', label: 'Conocimiento (Mazmorras)', ability: 'int' },
  { id: 'sk_knowledge_geography', label: 'Conocimiento (Geografía)', ability: 'int' },
  { id: 'sk_knowledge_history', label: 'Conocimiento (Historia)', ability: 'int' },
  { id: 'sk_knowledge_local', label: 'Conocimiento (Local)', ability: 'int' },
  { id: 'sk_knowledge_nature', label: 'Conocimiento (Naturaleza)', ability: 'int' },
  { id: 'sk_knowledge_nobility_and_royalty', label: 'Conocimiento (Nobleza)', ability: 'int' },
  { id: 'sk_knowledge_religion', label: 'Conocimiento (Religión)', ability: 'int' },
  { id: 'sk_knowledge_the_planes', label: 'Conocimiento (Planos)', ability: 'int' },
  { id: 'sk_listen', label: 'Escuchar', ability: 'wis' },
  { id: 'sk_move_silently', label: 'Moverse Sigilosamente', ability: 'dex' },
  { id: 'sk_open_lock', label: 'Abrir Cerraduras', ability: 'dex' },
  { id: 'sk_perform', label: 'Interpretar', ability: 'cha' },
  { id: 'sk_profession', label: 'Profesión', ability: 'wis' },
  { id: 'sk_ride', label: 'Montar', ability: 'dex' },
  { id: 'sk_search', label: 'Buscar', ability: 'int' },
  { id: 'sk_sense_motive', label: 'Averiguar Intenciones', ability: 'wis' },
  { id: 'sk_sleight_of_hand', label: 'Juego de Manos', ability: 'dex' },
  { id: 'sk_speak_language', label: 'Hablar Idioma', ability: 'int' },
  { id: 'sk_spellcraft', label: 'Conocimiento de Conjuros', ability: 'int' },
  { id: 'sk_spot', label: 'Avistar', ability: 'wis' },
  { id: 'sk_survival', label: 'Supervivencia', ability: 'wis' },
  { id: 'sk_swim', label: 'Nadar', ability: 'str' },
  { id: 'sk_tumble', label: 'Acrobacias', ability: 'dex' },
  { id: 'sk_use_magic_device', label: 'Usar Objeto Mágico', ability: 'cha' },
  { id: 'sk_use_rope', label: 'Usar Cuerdas', ability: 'dex' },
];

/** BAB progressions */
function babFull(lvl: number) { return lvl; }
function babThreeQuarters(lvl: number) { return Math.floor((lvl * 3) / 4); }
function babHalf(lvl: number) { return Math.floor(lvl / 2); }
/** Saves */
function saveGood(lvl: number) { return Math.floor(lvl / 2) + 2; }
function savePoor(lvl: number) { return Math.floor(lvl / 3); }

function makeClass(
  id: string, name: string,
  bab: (l: number) => number,
  saves: { fort: 'good' | 'poor'; ref: 'good' | 'poor'; will: 'good' | 'poor' },
  features: (level: number) => string[],
): ClassDef {
  return {
    id, name,
    perLevel(level) {
      if (level <= 0) return {};
      const fnFort = saves.fort === 'good' ? saveGood : savePoor;
      const fnRef = saves.ref === 'good' ? saveGood : savePoor;
      const fnWill = saves.will === 'good' ? saveGood : savePoor;
      return {
        statBonuses: {
          bab: bab(level),
          fort: fnFort(level),
          ref: fnRef(level),
          will: fnWill(level),
        },
        features: features(level),
      };
    },
  };
}

const CLASSES_35: ClassDef[] = [
  makeClass('fighter', 'Guerrero', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => {
    const dotes = 1 + Math.floor(lvl / 2);
    return [`Dotes adicionales: ${dotes}`];
  }),
  makeClass('rogue', 'Pícaro', babThreeQuarters, { fort: 'poor', ref: 'good', will: 'poor' }, (lvl) => {
    const dice = Math.ceil(lvl / 2);
    const out = [`Ataque furtivo ${dice}d6`, 'Detección de trampas'];
    if (lvl >= 3) out.push('Esquiva asombrosa');
    if (lvl >= 4) out.push('Sentido de las trampas');
    return out;
  }),
  makeClass('wizard', 'Mago', babHalf, { fort: 'poor', ref: 'poor', will: 'good' }, () => ['Lanzamiento de conjuros (Int)', 'Familiar']),
  makeClass('cleric', 'Clérigo', babThreeQuarters, { fort: 'good', ref: 'poor', will: 'good' }, () => ['Lanzamiento de conjuros (Sab)', 'Expulsar/dominar muertos vivientes']),
  makeClass('druid', 'Druida', babThreeQuarters, { fort: 'good', ref: 'poor', will: 'good' }, () => ['Lanzamiento de conjuros (Sab)', 'Compañero animal']),
  makeClass('sorcerer', 'Hechicero', babHalf, { fort: 'poor', ref: 'poor', will: 'good' }, (lvl) => {
    const known = 4 + Math.floor(lvl * 1.5);
    return [`Conjuros conocidos aprox.: ${known}`, 'Lanzamiento espontáneo (Car)'];
  }),
  makeClass('bard', 'Bardo', babThreeQuarters, { fort: 'poor', ref: 'good', will: 'good' }, () => ['Lanzamiento espontáneo (Car)', 'Música de bardo']),
  makeClass('paladin', 'Paladín', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => {
    const out = ['Detectar el mal', 'Imposición de manos'];
    if (lvl >= 4) out.push('Lanzamiento de conjuros (Sab)');
    return out;
  }),
  makeClass('ranger', 'Explorador', babFull, { fort: 'good', ref: 'good', will: 'poor' }, (lvl) => {
    const out = ['Estilo de combate', 'Enemigo favorito'];
    if (lvl >= 4) out.push('Lanzamiento de conjuros (Sab)');
    return out;
  }),
  makeClass('barbarian', 'Bárbaro', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => {
    const rages = 1 + Math.floor(lvl / 4);
    return [`Furia ${rages}/día`, 'Movimiento rápido'];
  }),
  makeClass('monk', 'Monje', babThreeQuarters, { fort: 'good', ref: 'good', will: 'good' }, () => ['Golpe desarmado', 'Movimiento mejorado']),
];

// ─── Tablas de conjuros por día (D&D 3.5 PHB) ────────────────────────────────
// Índice: [nivelDeClase-1][nivelDeConjuro]
// -1 = sin acceso todavía  |  0 = tiene acceso pero 0 usos base
//
// Lanzador completo: Mago, Clérigo, Druida  (niveles 0-9 en columnas 0-9)
const FULL_CASTER_TABLE: number[][] = [
  [ 3, 1,-1,-1,-1,-1,-1,-1,-1,-1], // nivel 1
  [ 4, 2,-1,-1,-1,-1,-1,-1,-1,-1], // nivel 2
  [ 4, 2, 1,-1,-1,-1,-1,-1,-1,-1], // nivel 3
  [ 4, 3, 2,-1,-1,-1,-1,-1,-1,-1], // nivel 4
  [ 4, 3, 2, 1,-1,-1,-1,-1,-1,-1], // nivel 5
  [ 4, 3, 3, 2,-1,-1,-1,-1,-1,-1], // nivel 6
  [ 4, 4, 3, 2, 1,-1,-1,-1,-1,-1], // nivel 7
  [ 4, 4, 3, 3, 2,-1,-1,-1,-1,-1], // nivel 8
  [ 4, 4, 4, 3, 2, 1,-1,-1,-1,-1], // nivel 9
  [ 4, 4, 4, 3, 3, 2,-1,-1,-1,-1], // nivel 10
  [ 4, 4, 4, 4, 3, 2, 1,-1,-1,-1], // nivel 11
  [ 4, 4, 4, 4, 3, 3, 2,-1,-1,-1], // nivel 12
  [ 4, 4, 4, 4, 4, 3, 2, 1,-1,-1], // nivel 13
  [ 4, 4, 4, 4, 4, 3, 3, 2,-1,-1], // nivel 14
  [ 4, 4, 4, 4, 4, 4, 3, 2, 1,-1], // nivel 15
  [ 4, 4, 4, 4, 4, 4, 3, 3, 2,-1], // nivel 16
  [ 4, 4, 4, 4, 4, 4, 4, 3, 2, 1], // nivel 17
  [ 4, 4, 4, 4, 4, 4, 4, 3, 3, 2], // nivel 18
  [ 4, 4, 4, 4, 4, 4, 4, 4, 3, 3], // nivel 19
  [ 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], // nivel 20
];

// Hechicero (conjuros espontáneos, niveles 0-9, más usos/día que el Mago)
const SORCERER_TABLE: number[][] = [
  [ 5, 3,-1,-1,-1,-1,-1,-1,-1,-1], // nivel 1
  [ 6, 4,-1,-1,-1,-1,-1,-1,-1,-1], // nivel 2
  [ 6, 5,-1,-1,-1,-1,-1,-1,-1,-1], // nivel 3
  [ 6, 6, 3,-1,-1,-1,-1,-1,-1,-1], // nivel 4
  [ 6, 6, 4,-1,-1,-1,-1,-1,-1,-1], // nivel 5
  [ 6, 6, 5, 3,-1,-1,-1,-1,-1,-1], // nivel 6
  [ 6, 6, 6, 4,-1,-1,-1,-1,-1,-1], // nivel 7
  [ 6, 6, 6, 5, 3,-1,-1,-1,-1,-1], // nivel 8
  [ 6, 6, 6, 6, 4,-1,-1,-1,-1,-1], // nivel 9
  [ 6, 6, 6, 6, 5, 3,-1,-1,-1,-1], // nivel 10
  [ 6, 6, 6, 6, 6, 4,-1,-1,-1,-1], // nivel 11
  [ 6, 6, 6, 6, 6, 5, 3,-1,-1,-1], // nivel 12
  [ 6, 6, 6, 6, 6, 6, 4,-1,-1,-1], // nivel 13
  [ 6, 6, 6, 6, 6, 6, 5, 3,-1,-1], // nivel 14
  [ 6, 6, 6, 6, 6, 6, 6, 4,-1,-1], // nivel 15
  [ 6, 6, 6, 6, 6, 6, 6, 5, 3,-1], // nivel 16
  [ 6, 6, 6, 6, 6, 6, 6, 6, 4,-1], // nivel 17
  [ 6, 6, 6, 6, 6, 6, 6, 6, 5, 3], // nivel 18
  [ 6, 6, 6, 6, 6, 6, 6, 6, 6, 4], // nivel 19
  [ 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], // nivel 20
];

// Bardo (espontáneo, sólo niveles 0-6, columnas 0-6)
const BARD_TABLE: number[][] = [
  [ 2,-1,-1,-1,-1,-1,-1], // nivel 1
  [ 3, 0,-1,-1,-1,-1,-1], // nivel 2  (tiene acceso al 1er nivel pero 0 usos)
  [ 3, 1,-1,-1,-1,-1,-1], // nivel 3
  [ 3, 2, 0,-1,-1,-1,-1], // nivel 4
  [ 3, 3, 1,-1,-1,-1,-1], // nivel 5
  [ 3, 3, 2,-1,-1,-1,-1], // nivel 6
  [ 3, 3, 2, 0,-1,-1,-1], // nivel 7
  [ 3, 3, 3, 1,-1,-1,-1], // nivel 8
  [ 3, 3, 3, 2,-1,-1,-1], // nivel 9
  [ 3, 3, 3, 2, 0,-1,-1], // nivel 10
  [ 3, 3, 3, 3, 1,-1,-1], // nivel 11
  [ 3, 3, 3, 3, 2,-1,-1], // nivel 12
  [ 3, 3, 3, 3, 2, 0,-1], // nivel 13
  [ 3, 3, 3, 3, 3, 1,-1], // nivel 14
  [ 3, 3, 3, 3, 3, 2,-1], // nivel 15
  [ 3, 3, 3, 3, 3, 2, 0], // nivel 16
  [ 3, 3, 3, 3, 3, 3, 1], // nivel 17
  [ 3, 3, 3, 3, 3, 3, 2], // nivel 18
  [ 3, 3, 3, 3, 3, 3, 3], // nivel 19
  [ 3, 3, 3, 3, 3, 3, 3], // nivel 20
];

// Paladín / Explorador (semi-lanzador, sólo niveles 1-4, columnas 0-3)
// Sin oraciones: la columna 0 representa el nivel de conjuro 1.
const HALF_CASTER_TABLE: number[][] = [
  [-1,-1,-1,-1], // nivel 1
  [-1,-1,-1,-1], // nivel 2
  [-1,-1,-1,-1], // nivel 3
  [ 0,-1,-1,-1], // nivel 4  (acceso al nivel 1 pero 0 usos)
  [ 0,-1,-1,-1], // nivel 5
  [ 1,-1,-1,-1], // nivel 6
  [ 1,-1,-1,-1], // nivel 7
  [ 1, 0,-1,-1], // nivel 8
  [ 1, 0,-1,-1], // nivel 9
  [ 1, 1,-1,-1], // nivel 10
  [ 1, 1, 0,-1], // nivel 11
  [ 1, 1, 1,-1], // nivel 12
  [ 1, 1, 1, 0], // nivel 13
  [ 2, 1, 1, 1], // nivel 14
  [ 2, 1, 1, 1], // nivel 15
  [ 2, 2, 1, 1], // nivel 16
  [ 2, 2, 2, 1], // nivel 17
  [ 3, 2, 2, 1], // nivel 18
  [ 3, 3, 3, 2], // nivel 19
  [ 3, 3, 3, 3], // nivel 20
];

type CasterInfo = {
  table: number[][];
  ability: 'int' | 'wis' | 'cha';
  /** A qué nivel de conjuro corresponde la columna 0 de la tabla */
  spellLevelOffset: number;
  /** Prepared = memorizan conjuros; spontaneous = lanzan libremente de los conocidos */
  castingType: 'prepared' | 'spontaneous';
  /** El clérigo obtiene +1 espacio de dominio por nivel de conjuro accesible */
  hasDomain?: boolean;
  /** El mago especialista obtiene +1 espacio por nivel de conjuro accesible */
  hasSpecialty?: boolean;
};

const CASTER_MAP: Record<string, CasterInfo> = {
  wizard:   { table: FULL_CASTER_TABLE, ability: 'int', spellLevelOffset: 0, castingType: 'prepared',    hasSpecialty: true },
  cleric:   { table: FULL_CASTER_TABLE, ability: 'wis', spellLevelOffset: 0, castingType: 'prepared',    hasDomain: true },
  druid:    { table: FULL_CASTER_TABLE, ability: 'wis', spellLevelOffset: 0, castingType: 'prepared' },
  sorcerer: { table: SORCERER_TABLE,    ability: 'cha', spellLevelOffset: 0, castingType: 'spontaneous' },
  bard:     { table: BARD_TABLE,        ability: 'cha', spellLevelOffset: 0, castingType: 'spontaneous' },
  paladin:  { table: HALF_CASTER_TABLE, ability: 'wis', spellLevelOffset: 1, castingType: 'prepared' },
  ranger:   { table: HALF_CASTER_TABLE, ability: 'wis', spellLevelOffset: 1, castingType: 'prepared' },
};

/**
 * Bonus de conjuros de atributo alto (PHB 3.5, Tabla 1-1).
 * Modificador N → +1 espacio a cada nivel de conjuro de 1 a N (máx 9).
 * Para modificadores >= 10 el primer nivel obtiene +2, etc.
 */
function bonusSpellsFromMod(mod: number): Record<number, number> {
  if (mod <= 0) return {};
  const out: Record<number, number> = {};
  for (let sl = 1; sl <= 9; sl++) {
    if (sl > mod) break;
    out[sl] = Math.floor((mod - sl) / 9) + 1;
  }
  return out;
}

function computeSpellSlots35(data: CharacterData): SpellSlotResult | null {
  const classes = Array.isArray(data.classes) ? (data.classes as ClassEntry[]) : [];
  const hasCaster = classes.some((c) => !!CASTER_MAP[c.classId]);
  if (!hasCaster) return null;

  // Especialización de Mago: el usuario puede activarla en data.wizardSpecialty
  const wizardSpecialty = !!(data as Record<string, unknown>).wizardSpecialty;

  const breakdown: SpellSlotResult['breakdown'] = [];
  const totals: Record<number, number> = {};

  function addTo(rec: Record<number, number>, sl: number, v: number) {
    if (v > 0) rec[sl] = (rec[sl] ?? 0) + v;
  }

  for (const entry of classes) {
    const info = CASTER_MAP[entry.classId];
    if (!info) continue;

    const lvl = Math.max(1, Math.min(20, entry.level));
    const row = info.table[lvl - 1];
    const abilityScore = num(data, info.ability, 10);
    const mod = abilityModifier(abilityScore);
    const bonusFromMod = bonusSpellsFromMod(mod);

    const base: Record<number, number> = {};
    const bonus: Record<number, number> = {};
    const extra: Record<number, number> = {};

    for (let col = 0; col < row.length; col++) {
      const slots = row[col];
      if (slots < 0) continue; // sin acceso aún
      const sl = col + info.spellLevelOffset; // nivel de conjuro real

      // Usos base
      if (slots > 0) addTo(base, sl, slots);

      // Bonus por atributo (sólo para niveles 1+)
      if (sl >= 1 && bonusFromMod[sl]) addTo(bonus, sl, bonusFromMod[sl]);

      // Espacio extra: dominio de clérigo (siempre 1 por nivel accesible ≥1)
      if (info.hasDomain && sl >= 1) addTo(extra, sl, 1);

      // Espacio extra: especialización de mago (si activado, 1 por nivel ≥1)
      if (info.hasSpecialty && wizardSpecialty && sl >= 1) addTo(extra, sl, 1);
    }

    // Acumular en totals
    const allLevels = new Set([
      ...Object.keys(base), ...Object.keys(bonus), ...Object.keys(extra),
    ].map(Number));
    for (const sl of allLevels) {
      const t = (base[sl] ?? 0) + (bonus[sl] ?? 0) + (extra[sl] ?? 0);
      addTo(totals, sl, t);
    }

    breakdown.push({
      className: entry.classId,
      castingType: info.castingType,
      abilityLabel: info.ability.toUpperCase(),
      mod,
      base,
      bonus,
      extra,
    });
  }

  return { totals, breakdown };
}

const dnd35: SystemDefinition = {
  id: 'dnd35',
  name: 'D&D 3.5',
  short: 'Dungeons & Dragons 3.5',
  fields,
  classes: CLASSES_35,
  hasSpells: true,
  computeSpellSlots: computeSpellSlots35,
  equipmentSlots: [
    { id: 'weapon_main', label: 'Arma principal' },
    { id: 'weapon_off', label: 'Arma secundaria' },
    { id: 'armor', label: 'Armadura' },
    { id: 'shield', label: 'Escudo' },
    { id: 'cloak', label: 'Capa' },
    { id: 'amulet', label: 'Amuleto' },
    { id: 'belt', label: 'Cinturón' },
    { id: 'gloves', label: 'Guantes' },
    { id: 'boots', label: 'Botas' },
    { id: 'ring1', label: 'Anillo 1' },
    { id: 'ring2', label: 'Anillo 2' },
    { id: 'other', label: 'Otro' },
  ],
  bonusTargets: [
    { id: 'ac', label: 'CA' },
    { id: 'hp_max', label: 'PG máximos' },
    { id: 'bab', label: 'BAB' },
    { id: 'fort', label: 'Fortaleza' },
    { id: 'ref', label: 'Reflejos' },
    { id: 'will', label: 'Voluntad' },
    ...ABILITIES.map((a) => ({ id: `mod_${a}`, label: `Mod. ${ABILITY_LABEL[a]}` })),
    { id: 'attack_melee', label: 'C. a cuerpo' },
    { id: 'attack_ranged', label: 'A distancia' },
    { id: 'damage', label: 'Daño (arma)' },
    { id: '__attack_with__', label: '⚔ Ataque con arma específica…' },
    { id: 'initiative', label: 'Iniciativa' },
    ...Object.keys(SKILL_LABEL).map((k) => ({ id: k, label: SKILL_LABEL[k] })),
    // Bonus targets para todas las habilidades del PHB (las dotes/objetos pueden apuntar a sk_balance, sk_escape_artist, etc.).
    ...ALL_PHB_SKILLS
      .filter((s) => !SKILL_LABEL[s.id])
      .map((s) => ({ id: s.id, label: s.label })),
  ],
  computeStats(data) {
    const raceBonus = getRaceBonus(String(data.race ?? ''));
    const out: Record<string, number> = {};
    for (const a of ABILITIES) {
      const racialMod = raceBonus.abilityMods[a] ?? 0;
      out[`mod_${a}`] = abilityModifier(num(data, a, 10) + racialMod);
    }
    out.bab = 0;          // las clases lo suben vía aggregate
    out.fort = out.mod_con ?? 0;
    out.ref = out.mod_dex ?? 0;
    out.will = out.mod_wis ?? 0;
    out.ac = num(data, 'ac', 10);
    out.hp_max = num(data, 'hp_max', 8);
    return out;
  },
  actions(data) {
    const raceBonus = getRaceBonus(String(data.race ?? ''));
    const stats: Record<string, number> = {};
    for (const a of ABILITIES) {
      const racialMod = raceBonus.abilityMods[a] ?? 0;
      stats[`mod_${a}`] = abilityModifier(num(data, a, 10) + racialMod);
    }
    const raceSkill = raceBonus.skillBonuses;
    const acts = [];
    for (const a of ABILITIES) {
      acts.push({ id: `check_${a}`, label: ABILITY_LABEL[a], group: 'Atributos', die: 'd20', modifier: stats[`mod_${a}`] ?? 0 });
    }
    // bab=0 base; lo suma aggregate via class statBonuses → action.modifier no se ve afectado.
    // En su lugar, salvaciones y ataques se exponen con su modificador base de atributo,
    // y el bonus de clase se aplica como actionBonuses en perLevel. Pero hicimos statBonuses
    // a "fort/ref/will/bab" (claves de stat). Para que el modificador de la acción los recoja,
    // exponemos también action ids gemelos: 'fort','ref','will','attack_melee','attack_ranged'.
    acts.push({ id: 'fort', label: 'Fortaleza', group: 'Salvaciones', die: 'd20', modifier: stats.mod_con ?? 0 });
    acts.push({ id: 'ref', label: 'Reflejos', group: 'Salvaciones', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'will', label: 'Voluntad', group: 'Salvaciones', die: 'd20', modifier: stats.mod_wis ?? 0 });
    acts.push({ id: 'attack_melee', label: 'C. a cuerpo', group: 'Combate', die: 'd20', modifier: stats.mod_str ?? 0 });
    acts.push({ id: 'attack_ranged', label: 'A distancia', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'initiative', label: 'Iniciativa', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });

    // Todas las habilidades del PHB — las 8 con campo dedicado usan sus rangos guardados;
    // el resto aparece con 0 rangos para que el jugador siempre pueda tirar cualquier skill.
    for (const sk of ALL_PHB_SKILLS) {
      const ability = sk.ability;
      // Si tiene campo dedicado usamos los rangos guardados, si no, 0
      const ranks = SKILL_TO_ABILITY[sk.id] !== undefined ? num(data, sk.id, 0) : 0;
      const racialSkMod = raceSkill[sk.id] ?? 0;
      acts.push({ id: sk.id, label: sk.label, group: 'Habilidades', die: 'd20', modifier: ranks + (stats[`mod_${ability}`] ?? 0) + racialSkMod });
    }

    // Habilidades adicionales (incluye transclase) introducidas por el usuario
    // en la pestaña "Habilidades". Cada entrada calcula su modificador final.
    const ABIL_KEYS: Record<string, (typeof ABILITIES)[number]> = {
      str: 'str', strength: 'str', fuerza: 'str',
      dex: 'dex', dexterity: 'dex', destreza: 'dex',
      con: 'con', constitution: 'con', constitucion: 'con',
      int: 'int', intelligence: 'int', inteligencia: 'int',
      wis: 'wis', wisdom: 'wis', sabiduria: 'wis',
      cha: 'cha', charisma: 'cha', carisma: 'cha',
    };
    const userSkills = Array.isArray((data as { skills?: unknown }).skills)
      ? ((data as { skills: Array<{ id: string; name: string; ability?: string; ranks?: number; miscMod?: number }> }).skills)
      : [];

    // Bonos provenientes de dotes y equipo equipado, indexados por target.
    // Permite que una dote como Agile (target sk_balance, sk_escape_artist)
    // sume al modificador de la habilidad adicional correspondiente del usuario,
    // emparejando por slug del nombre de la habilidad.
    const feats = Array.isArray((data as { feats?: unknown }).feats)
      ? ((data as { feats: Array<{ bonuses?: Array<{ target: string; value: number; type?: string }> }> }).feats)
      : [];
    const equipment = Array.isArray((data as { equipment?: unknown }).equipment)
      ? ((data as { equipment: Array<{ equipped?: boolean; bonuses?: Array<{ target: string; value: number; type?: string }> }> }).equipment)
      : [];
    const skillTargetBonuses: Record<string, Array<{ target: string; value: number; type?: string }>> = {};
    const collect = (b?: Array<{ target: string; value: number; type?: string }>) => {
      if (!b) return;
      for (const x of b) {
        if (!x?.target?.startsWith('sk_') || typeof x.value !== 'number') continue;
        (skillTargetBonuses[x.target] ??= []).push(x);
      }
    };
    for (const f of feats) collect(f.bonuses);
    for (const it of equipment) if (it.equipped) collect(it.bonuses);
    // Aplica reglas de apilamiento de bonos por tipo (mismo tipo no apila).
    const skillTargetBonus: Record<string, number> = {};
    for (const [k, list] of Object.entries(skillTargetBonuses)) {
      skillTargetBonus[k] = resolveBonusStack(list as BonusEffect[]);
    }

    const slugify = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['’()]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    for (const sk of userSkills) {
      if (!sk?.id || !sk?.name) continue;
      const k = (sk.ability ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const ab = ABIL_KEYS[k];
      const abilMod = ab ? (stats[`mod_${ab}`] ?? 0) : 0;
      const ranks = Number(sk.ranks) || 0;
      const misc = Number(sk.miscMod) || 0;
      const targetId = `sk_${slugify(sk.name)}`;
      const extra = skillTargetBonus[targetId] ?? 0;
      const racialSkMod = raceSkill[targetId] ?? 0;
      acts.push({
        id: `skill_${sk.id}`,
        label: sk.name,
        group: 'Habilidades',
        die: 'd20',
        modifier: ranks + abilMod + misc + extra + racialSkMod,
      });
    }
    return acts;
  },
};

// Truco: las clases en 3.5 deben aportar bonos a las **acciones** (fort/ref/will/attack/bab),
// no sólo a las stats. Reescribimos perLevel para cubrir ambas cosas.
for (const c of CLASSES_35) {
  const original = c.perLevel;
  c.perLevel = (level) => {
    const g = original(level);
    const ab = g.statBonuses ?? {};
    return {
      statBonuses: ab,
      actionBonuses: {
        attack_melee: ab.bab ?? 0,
        attack_ranged: ab.bab ?? 0,
        fort: ab.fort ?? 0,
        ref: ab.ref ?? 0,
        will: ab.will ?? 0,
      },
      features: g.features,
    };
  };
}

export default dnd35;
