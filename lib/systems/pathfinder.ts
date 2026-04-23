import { SystemDefinition, abilityModifier, num, FieldDef, ClassDef } from './types';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'Fuerza', dex: 'Destreza', con: 'Constitución',
  int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma',
};

const fields: FieldDef[] = [
  { key: 'race', label: 'Raza', type: 'text', group: 'Identidad' },
  { key: 'level', label: 'Nivel total', type: 'number', group: 'Identidad', default: 1, min: 1, max: 20 },
  { key: 'ac', label: 'CA base', type: 'number', group: 'Combate', default: 10 },
  { key: 'hp_max', label: 'PG Máximos', type: 'number', group: 'Combate', default: 8 },
  ...ABILITIES.map<FieldDef>((a) => ({
    key: a, label: ABILITY_LABEL[a], type: 'number', group: 'Atributos', default: 10, min: 1, max: 40,
  })),
  { key: 'sk_perception', label: 'Percepción (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_stealth', label: 'Sigilo (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_acrobatics', label: 'Acrobacias (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_diplomacy', label: 'Diplomacia (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_bluff', label: 'Engañar (rangos)', type: 'number', group: 'Habilidades', default: 0 },
  { key: 'sk_knowledge_arcana', label: 'Conocimiento Arcano (rangos)', type: 'number', group: 'Habilidades', default: 0 },
];

const SKILL_TO_ABILITY: Record<string, (typeof ABILITIES)[number]> = {
  sk_perception: 'wis', sk_stealth: 'dex', sk_acrobatics: 'dex',
  sk_diplomacy: 'cha', sk_bluff: 'cha', sk_knowledge_arcana: 'int',
};
const SKILL_LABEL: Record<string, string> = {
  sk_perception: 'Percepción', sk_stealth: 'Sigilo', sk_acrobatics: 'Acrobacias',
  sk_diplomacy: 'Diplomacia', sk_bluff: 'Engañar', sk_knowledge_arcana: 'Conocimiento Arcano',
};

function babFull(l: number) { return l; }
function babThreeQuarters(l: number) { return Math.floor((l * 3) / 4); }
function babHalf(l: number) { return Math.floor(l / 2); }
function saveGood(l: number) { return Math.floor(l / 2) + 2; }
function savePoor(l: number) { return Math.floor(l / 3); }

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
      const babVal = bab(level);
      const fortVal = fnFort(level);
      const refVal = fnRef(level);
      const willVal = fnWill(level);
      return {
        statBonuses: { bab: babVal, fort: fortVal, ref: refVal, will: willVal },
        actionBonuses: {
          attack_melee: babVal, attack_ranged: babVal, cmb: babVal,
          fort: fortVal, ref: refVal, will: willVal,
        },
        features: features(level),
      };
    },
  };
}

const CLASSES_PF: ClassDef[] = [
  makeClass('fighter', 'Guerrero', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => {
    const dotes = 1 + Math.floor(lvl / 2);
    return [`Dotes adicionales: ${dotes}`, lvl >= 2 ? 'Adiestramiento de armas' : ''].filter(Boolean) as string[];
  }),
  makeClass('rogue', 'Pícaro', babThreeQuarters, { fort: 'poor', ref: 'good', will: 'poor' }, (lvl) => {
    const dice = Math.ceil(lvl / 2);
    return [`Ataque furtivo ${dice}d6`, 'Detección de trampas', lvl >= 2 ? 'Talento de pícaro' : ''].filter(Boolean) as string[];
  }),
  makeClass('wizard', 'Mago', babHalf, { fort: 'poor', ref: 'poor', will: 'good' }, () => ['Lanzamiento de conjuros (Int)', 'Vínculo arcano']),
  makeClass('cleric', 'Clérigo', babThreeQuarters, { fort: 'good', ref: 'poor', will: 'good' }, () => ['Lanzamiento de conjuros (Sab)', 'Canalizar energía']),
  makeClass('barbarian', 'Bárbaro', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => [`Furia ${4 + lvl}/día`, lvl >= 2 ? 'Esquiva increíble' : ''].filter(Boolean) as string[]),
];

const pathfinder: SystemDefinition = {
  id: 'pathfinder',
  name: 'Pathfinder 1e',
  short: 'Pathfinder Roleplaying Game',
  fields,
  classes: CLASSES_PF,
  hasSpells: true,
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
    { id: 'fort', label: 'Salvación Fortaleza' },
    { id: 'ref', label: 'Salvación Reflejos' },
    { id: 'will', label: 'Salvación Voluntad' },
    ...ABILITIES.map((a) => ({ id: `mod_${a}`, label: `Mod. ${ABILITY_LABEL[a]}` })),
    { id: 'attack_melee', label: 'Ataque cuerpo a cuerpo' },
    { id: 'attack_ranged', label: 'Ataque a distancia' },
    { id: 'cmb', label: 'CMB' },
    { id: 'initiative', label: 'Iniciativa' },
    ...Object.keys(SKILL_LABEL).map((k) => ({ id: k, label: SKILL_LABEL[k] })),
  ],
  computeStats(data) {
    const out: Record<string, number> = {};
    for (const a of ABILITIES) out[`mod_${a}`] = abilityModifier(num(data, a, 10));
    out.bab = 0;
    out.fort = out.mod_con ?? 0;
    out.ref = out.mod_dex ?? 0;
    out.will = out.mod_wis ?? 0;
    out.ac = num(data, 'ac', 10);
    out.hp_max = num(data, 'hp_max', 8);
    return out;
  },
  actions(data) {
    const stats: Record<string, number> = {};
    for (const a of ABILITIES) stats[`mod_${a}`] = abilityModifier(num(data, a, 10));
    const acts = [];
    for (const a of ABILITIES) {
      acts.push({ id: `check_${a}`, label: `Chequeo de ${ABILITY_LABEL[a]}`, group: 'Atributos', die: 'd20', modifier: stats[`mod_${a}`] ?? 0 });
    }
    acts.push({ id: 'fort', label: 'Salvación Fortaleza', group: 'Salvaciones', die: 'd20', modifier: stats.mod_con ?? 0 });
    acts.push({ id: 'ref', label: 'Salvación Reflejos', group: 'Salvaciones', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'will', label: 'Salvación Voluntad', group: 'Salvaciones', die: 'd20', modifier: stats.mod_wis ?? 0 });
    acts.push({ id: 'attack_melee', label: 'Ataque cuerpo a cuerpo', group: 'Combate', die: 'd20', modifier: stats.mod_str ?? 0 });
    acts.push({ id: 'attack_ranged', label: 'Ataque a distancia', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'cmb', label: 'Maniobra (CMB)', group: 'Combate', die: 'd20', modifier: stats.mod_str ?? 0 });
    acts.push({ id: 'initiative', label: 'Iniciativa', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });
    for (const skKey of Object.keys(SKILL_TO_ABILITY)) {
      const ability = SKILL_TO_ABILITY[skKey];
      const ranks = num(data, skKey, 0);
      acts.push({ id: skKey, label: SKILL_LABEL[skKey], group: 'Habilidades', die: 'd20', modifier: ranks + (stats[`mod_${ability}`] ?? 0) });
    }
    return acts;
  },
};

export default pathfinder;
