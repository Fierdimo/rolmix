import {
  SystemDefinition, abilityModifier, num, FieldDef, ClassDef, CharacterData,
} from './types';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'Fuerza', dex: 'Destreza', con: 'Constitución',
  int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma',
};

const SKILLS_5E: { key: string; label: string; ability: (typeof ABILITIES)[number] }[] = [
  { key: 'sk_acrobatics', label: 'Acrobacias', ability: 'dex' },
  { key: 'sk_arcana', label: 'Arcanos', ability: 'int' },
  { key: 'sk_athletics', label: 'Atletismo', ability: 'str' },
  { key: 'sk_deception', label: 'Engaño', ability: 'cha' },
  { key: 'sk_history', label: 'Historia', ability: 'int' },
  { key: 'sk_insight', label: 'Perspicacia', ability: 'wis' },
  { key: 'sk_intimidation', label: 'Intimidación', ability: 'cha' },
  { key: 'sk_investigation', label: 'Investigación', ability: 'int' },
  { key: 'sk_medicine', label: 'Medicina', ability: 'wis' },
  { key: 'sk_nature', label: 'Naturaleza', ability: 'int' },
  { key: 'sk_perception', label: 'Percepción', ability: 'wis' },
  { key: 'sk_performance', label: 'Interpretación', ability: 'cha' },
  { key: 'sk_persuasion', label: 'Persuasión', ability: 'cha' },
  { key: 'sk_religion', label: 'Religión', ability: 'int' },
  { key: 'sk_stealth', label: 'Sigilo', ability: 'dex' },
  { key: 'sk_survival', label: 'Supervivencia', ability: 'wis' },
];

const fields: FieldDef[] = [
  { key: 'race', label: 'Raza', type: 'text', group: 'Identidad' },
  { key: 'background', label: 'Trasfondo', type: 'text', group: 'Identidad' },
  { key: 'level', label: 'Nivel total', type: 'number', group: 'Identidad', default: 1, min: 1, max: 20, help: 'Se calcula sumando los niveles de cada clase, pero puedes ajustarlo manualmente.' },
  { key: 'ac', label: 'Clase de Armadura', type: 'number', group: 'Combate', default: 10 },
  { key: 'hp_max', label: 'PG Máximos', type: 'number', group: 'Combate', default: 10 },
  ...ABILITIES.map<FieldDef>((a) => ({
    key: a, label: ABILITY_LABEL[a], type: 'number', group: 'Atributos', default: 10, min: 1, max: 30,
  })),
  ...SKILLS_5E.map<FieldDef>((s) => ({
    key: `${s.key}_prof`,
    label: `${s.label} (competente)`,
    type: 'select',
    group: 'Habilidades',
    options: ['no', 'sí', 'experto'],
    default: 'no',
    help: `Modificador base: ${ABILITY_LABEL[s.ability]}`,
  })),
];

/** Bono de competencia 5e por nivel de personaje. */
function profBonus(totalLevel: number): number {
  if (totalLevel >= 17) return 6;
  if (totalLevel >= 13) return 5;
  if (totalLevel >= 9) return 4;
  if (totalLevel >= 5) return 3;
  return 2;
}

/** Define una clase 5e con sus dos salvaciones competentes y rasgos clave. */
function makeClass(id: string, name: string, saves: (typeof ABILITIES)[number][], features: (level: number) => string[]): ClassDef {
  return {
    id, name,
    description: `Salvaciones competentes: ${saves.map((s) => ABILITY_LABEL[s]).join(' y ')}`,
    perLevel(level) {
      if (level <= 0) return {};
      // En 5e el bono de competencia es por nivel TOTAL (lo añade el sistema, no la clase),
      // pero la clase sí concede competencia: la modelamos como bono igual a "prof" en esa salvación.
      // Para no duplicar al multiclasear, usamos un valor "marcador" 1 que el sistema multiplica por el prof actual.
      const grant: ReturnType<ClassDef['perLevel']> = {
        actionBonuses: {},
        features: features(level),
      };
      for (const s of saves) {
        grant.actionBonuses![`save_${s}__profmark`] = 1;
      }
      return grant;
    },
  };
}

const CLASSES_5E: ClassDef[] = [
  makeClass('fighter', 'Guerrero', ['str', 'con'], (lvl) => {
    const out = ['Estilo de combate', 'Recobrarse (1d10 + nivel)'];
    if (lvl >= 2) out.push('Oleada de acción');
    if (lvl >= 3) out.push('Arquetipo marcial');
    if (lvl >= 5) out.push('Ataque adicional ×2');
    if (lvl >= 11) out.push('Ataque adicional ×3');
    if (lvl >= 20) out.push('Ataque adicional ×4');
    return out;
  }),
  makeClass('wizard', 'Mago', ['int', 'wis'], (lvl) => {
    const out = ['Lanzamiento de conjuros (Int)', 'Recuperación arcana'];
    if (lvl >= 2) out.push('Tradición arcana');
    if (lvl >= 18) out.push('Dominio de conjuros');
    return out;
  }),
  makeClass('rogue', 'Pícaro', ['dex', 'int'], (lvl) => {
    const dice = Math.ceil(lvl / 2);
    const out = [`Ataque furtivo ${dice}d6`, 'Pericia', 'Jerga de ladrones'];
    if (lvl >= 2) out.push('Acción astuta');
    if (lvl >= 5) out.push('Esquiva asombrosa');
    if (lvl >= 7) out.push('Evasión');
    return out;
  }),
  makeClass('cleric', 'Clérigo', ['wis', 'cha'], (lvl) => {
    const out = ['Lanzamiento de conjuros (Sab)', 'Dominio divino'];
    if (lvl >= 2) out.push('Canalizar divinidad');
    if (lvl >= 5) out.push('Disipar lo no muerto');
    return out;
  }),
  makeClass('barbarian', 'Bárbaro', ['str', 'con'], (lvl) => {
    const dmg = lvl >= 16 ? 4 : lvl >= 9 ? 3 : 2;
    const out = ['Furia', 'Defensa sin armadura', `Daño de furia +${dmg}`];
    if (lvl >= 5) out.push('Ataque adicional ×2');
    if (lvl >= 7) out.push('Instinto salvaje');
    return out;
  }),
];

const dnd5e: SystemDefinition = {
  id: 'dnd5e',
  name: 'D&D 5e',
  short: 'Dungeons & Dragons 5ª edición',
  fields,
  classes: CLASSES_5E,
  hasSpells: true,
  equipmentSlots: [
    { id: 'weapon_main', label: 'Arma principal' },
    { id: 'weapon_off', label: 'Arma secundaria' },
    { id: 'armor', label: 'Armadura' },
    { id: 'shield', label: 'Escudo' },
    { id: 'cloak', label: 'Capa' },
    { id: 'amulet', label: 'Amuleto' },
    { id: 'ring1', label: 'Anillo 1' },
    { id: 'ring2', label: 'Anillo 2' },
    { id: 'other', label: 'Otro' },
  ],
  bonusTargets: [
    { id: 'ac', label: 'Clase de Armadura' },
    { id: 'hp_max', label: 'PG máximos' },
    { id: 'prof', label: 'Bono de competencia' },
    { id: 'initiative', label: 'Iniciativa' },
    ...ABILITIES.map((a) => ({ id: `mod_${a}`, label: `Mod. ${ABILITY_LABEL[a]}` })),
    ...ABILITIES.map((a) => ({ id: `save_${a}`, label: `Salvación de ${ABILITY_LABEL[a]}` })),
    ...SKILLS_5E.map((s) => ({ id: s.key, label: s.label })),
    { id: 'attack_melee', label: 'Ataque cuerpo a cuerpo' },
    { id: 'attack_ranged', label: 'Ataque a distancia' },
  ],
  computeStats(data) {
    const out: Record<string, number> = {};
    const totalLevel = num(data, 'level', 1);
    const prof = profBonus(totalLevel);
    for (const a of ABILITIES) out[`mod_${a}`] = abilityModifier(num(data, a, 10));
    out.prof = prof;
    out.ac = num(data, 'ac', 10);
    out.hp_max = num(data, 'hp_max', 10);
    return out;
  },
  actions(data) {
    // Stats puros (sin equipo). Usamos el helper local para evitar ciclo.
    const totalLevel = num(data, 'level', 1);
    const prof = profBonus(totalLevel);
    const mod: Record<(typeof ABILITIES)[number], number> = {} as never;
    for (const a of ABILITIES) mod[a] = abilityModifier(num(data, a, 10));

    // Procesar marcas de competencia inyectadas por las clases
    const classes = Array.isArray((data as CharacterData).classes) ? (data as CharacterData).classes! : [];
    const profSaves = new Set<string>();
    for (const ce of classes) {
      const def = CLASSES_5E.find((c) => c.id === ce.classId);
      if (!def) continue;
      const grant = def.perLevel(ce.level);
      for (const k of Object.keys(grant.actionBonuses ?? {})) {
        if (k.endsWith('__profmark')) profSaves.add(k.replace('__profmark', ''));
      }
    }

    const acts = [];
    acts.push({ id: 'initiative', label: 'Iniciativa', group: 'Combate', die: 'd20', modifier: mod.dex });
    acts.push({ id: 'attack_melee', label: 'Ataque cuerpo a cuerpo', group: 'Combate', die: 'd20', modifier: mod.str + prof });
    acts.push({ id: 'attack_ranged', label: 'Ataque a distancia', group: 'Combate', die: 'd20', modifier: mod.dex + prof });

    for (const a of ABILITIES) {
      acts.push({ id: `check_${a}`, label: `Tirada de ${ABILITY_LABEL[a]}`, group: 'Atributos', die: 'd20', modifier: mod[a] });
      const isProf = profSaves.has(`save_${a}`);
      acts.push({
        id: `save_${a}`,
        label: `Salvación de ${ABILITY_LABEL[a]}${isProf ? ' (✦)' : ''}`,
        group: 'Salvaciones',
        die: 'd20',
        modifier: mod[a] + (isProf ? prof : 0),
      });
    }

    for (const s of SKILLS_5E) {
      const profMode = String(data[`${s.key}_prof`] ?? 'no');
      const profBonusVal = profMode === 'experto' ? prof * 2 : profMode === 'sí' ? prof : 0;
      acts.push({
        id: s.key, label: s.label, group: 'Habilidades', die: 'd20', modifier: mod[s.ability] + profBonusVal,
      });
    }
    return acts;
  },
};

export default dnd5e;
