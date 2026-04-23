import { SystemDefinition, abilityModifier, num, FieldDef, ClassDef, BonusEffect } from './types';
import { resolveBonusStack } from './aggregate';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABEL: Record<(typeof ABILITIES)[number], string> = {
  str: 'Fuerza', dex: 'Destreza', con: 'Constitución',
  int: 'Inteligencia', wis: 'Sabiduría', cha: 'Carisma',
};

const fields: FieldDef[] = [
  { key: 'race', label: 'Raza', type: 'text', group: 'Identidad' },
  { key: 'level', label: 'Nivel total', type: 'number', group: 'Identidad', default: 1, min: 1, max: 20 },
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
  makeClass('barbarian', 'Bárbaro', babFull, { fort: 'good', ref: 'poor', will: 'poor' }, (lvl) => {
    const rages = 1 + Math.floor(lvl / 4);
    return [`Furia ${rages}/día`, 'Movimiento rápido'];
  }),
];

const dnd35: SystemDefinition = {
  id: 'dnd35',
  name: 'D&D 3.5',
  short: 'Dungeons & Dragons 3.5',
  fields,
  classes: CLASSES_35,
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
    { id: 'bab', label: 'BAB' },
    { id: 'fort', label: 'Salvación Fortaleza' },
    { id: 'ref', label: 'Salvación Reflejos' },
    { id: 'will', label: 'Salvación Voluntad' },
    ...ABILITIES.map((a) => ({ id: `mod_${a}`, label: `Mod. ${ABILITY_LABEL[a]}` })),
    { id: 'attack_melee', label: 'Ataque cuerpo a cuerpo' },
    { id: 'attack_ranged', label: 'Ataque a distancia' },
    { id: 'initiative', label: 'Iniciativa' },
    ...Object.keys(SKILL_LABEL).map((k) => ({ id: k, label: SKILL_LABEL[k] })),
    // Bonus targets para todas las habilidades del PHB (las dotes/objetos pueden apuntar a sk_balance, sk_escape_artist, etc.).
    ...ALL_PHB_SKILLS
      .filter((s) => !SKILL_LABEL[s.id])
      .map((s) => ({ id: s.id, label: s.label })),
  ],
  computeStats(data) {
    const out: Record<string, number> = {};
    for (const a of ABILITIES) out[`mod_${a}`] = abilityModifier(num(data, a, 10));
    out.bab = 0;          // las clases lo suben vía aggregate
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
    // bab=0 base; lo suma aggregate via class statBonuses → action.modifier no se ve afectado.
    // En su lugar, salvaciones y ataques se exponen con su modificador base de atributo,
    // y el bonus de clase se aplica como actionBonuses en perLevel. Pero hicimos statBonuses
    // a "fort/ref/will/bab" (claves de stat). Para que el modificador de la acción los recoja,
    // exponemos también action ids gemelos: 'fort','ref','will','attack_melee','attack_ranged'.
    acts.push({ id: 'fort', label: 'Salvación Fortaleza', group: 'Salvaciones', die: 'd20', modifier: stats.mod_con ?? 0 });
    acts.push({ id: 'ref', label: 'Salvación Reflejos', group: 'Salvaciones', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'will', label: 'Salvación Voluntad', group: 'Salvaciones', die: 'd20', modifier: stats.mod_wis ?? 0 });
    acts.push({ id: 'attack_melee', label: 'Ataque cuerpo a cuerpo', group: 'Combate', die: 'd20', modifier: stats.mod_str ?? 0 });
    acts.push({ id: 'attack_ranged', label: 'Ataque a distancia', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });
    acts.push({ id: 'initiative', label: 'Iniciativa', group: 'Combate', die: 'd20', modifier: stats.mod_dex ?? 0 });

    for (const skKey of Object.keys(SKILL_TO_ABILITY)) {
      const ability = SKILL_TO_ABILITY[skKey];
      const ranks = num(data, skKey, 0);
      acts.push({ id: skKey, label: SKILL_LABEL[skKey], group: 'Habilidades', die: 'd20', modifier: ranks + (stats[`mod_${ability}`] ?? 0) });
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
      acts.push({
        id: `skill_${sk.id}`,
        label: sk.name,
        group: 'Habilidades',
        die: 'd20',
        modifier: ranks + abilMod + misc + extra,
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
