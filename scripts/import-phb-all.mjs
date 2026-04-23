// Importa todo el contenido del PHB 3.5 desde zellfaze-zz/dnd-generator
// y lo convierte a nuestros esquemas Catalog* (lib/catalog/types.ts).
//
// Uso (desde la raíz del repo):
//   node scripts/import-phb-all.mjs
//
// Salidas (todas en data/dnd35/, sobrescriben):
//   feats.json            (con bonuses[] mapeados automáticamente)
//   races.json
//   skills.json
//   classes.json
//   languages.json
//   magic-items.json      (upstream + curado, con bonuses[] automáticos)
//   mundane-items.json
//
// Para los conjuros usar: node scripts/import-phb-spells.mjs
//
// Mapeo de bonos (Numeric.Skills + Numeric.CharacterAbilities → BonusEffect[]):
//  - Skills (Listen, Spot, Hide, Move Silently, Search, Diplomacy, Bluff, Jump)
//    → sk_* del sistema dnd35.
//  - "Save (Fortitude/Reflex/Will)" → fort/ref/will.
//  - "Hit points" → hp_max, "Initiative" → initiative.
//  - "Strength"/"Dexterity"/… → mod_str/mod_dex/… (÷2 para items, raw para dotes).
//
// Licencia: contenido OGL del PHB 3.5.

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/zellfaze-zz/dnd-generator/master/data/phb';
const OUT_DIR = path.resolve('data/dnd35');

// --- Mapeos de bonos --------------------------------------------------------

const SKILL_TARGET = {
  'Appraise': 'sk_appraise',
  'Balance': 'sk_balance',
  'Bluff': 'sk_bluff',
  'Climb': 'sk_climb',
  'Concentration': 'sk_concentration',
  'Craft': 'sk_craft',
  'Decipher Script': 'sk_decipher_script',
  'Diplomacy': 'sk_diplomacy',
  'Disable Device': 'sk_disable_device',
  'Disguise': 'sk_disguise',
  'Escape Artist': 'sk_escape_artist',
  'Forgery': 'sk_forgery',
  'Gather Information': 'sk_gather_information',
  'Handle Animal': 'sk_handle_animal',
  'Heal': 'sk_heal',
  'Hide': 'sk_hide',
  'Intimidate': 'sk_intimidate',
  'Jump': 'sk_jump',
  'Knowledge (Arcana)': 'sk_knowledge_arcana',
  'Knowledge (Architecture and Engineering)': 'sk_knowledge_architecture_and_engineering',
  'Knowledge (Dungeoneering)': 'sk_knowledge_dungeoneering',
  'Knowledge (Geography)': 'sk_knowledge_geography',
  'Knowledge (History)': 'sk_knowledge_history',
  'Knowledge (Local)': 'sk_knowledge_local',
  'Knowledge (Nature)': 'sk_knowledge_nature',
  'Knowledge (Nobility and Royalty)': 'sk_knowledge_nobility_and_royalty',
  'Knowledge (Religion)': 'sk_knowledge_religion',
  'Knowledge (The Planes)': 'sk_knowledge_the_planes',
  'Listen': 'sk_listen',
  'Move Silently': 'sk_move_silently',
  'Open Lock': 'sk_open_lock',
  'Perform': 'sk_perform',
  'Profession': 'sk_profession',
  'Ride': 'sk_ride',
  'Search': 'sk_search',
  'Sense Motive': 'sk_sense_motive',
  'Sleight of Hand': 'sk_sleight_of_hand',
  'Speak Language': 'sk_speak_language',
  'Spellcraft': 'sk_spellcraft',
  'Spot': 'sk_spot',
  'Survival': 'sk_survival',
  'Swim': 'sk_swim',
  'Tumble': 'sk_tumble',
  'Use Magic Device': 'sk_use_magic_device',
  'Use Rope': 'sk_use_rope',
};

const ABILITY_TARGET = {
  'Save (Fortitude)': 'fort',
  'Save (Reflex)': 'ref',
  'Save (Will)': 'will',
  'Hit points': 'hp_max',
  'Initiative': 'initiative',
};

const STAT_MOD = {
  Strength: 'mod_str', Dexterity: 'mod_dex', Constitution: 'mod_con',
  Intelligence: 'mod_int', Wisdom: 'mod_wis', Charisma: 'mod_cha',
};

function pushBonusesFromBenefits(out, benefits, { halveAbility = false } = {}) {
  if (!benefits) return;
  const num = benefits.Numeric || benefits.numeric || {};
  const skills = num.Skills || num.skills || {};
  for (const [name, val] of Object.entries(skills)) {
    if (typeof val !== 'number') continue;
    const target = SKILL_TARGET[name];
    if (target) out.push({ target, value: val });
  }
  const abil = num.CharacterAbilities || num.characterAbilities || {};
  for (const [name, val] of Object.entries(abil)) {
    if (typeof val !== 'number') continue;
    const direct = ABILITY_TARGET[name];
    if (direct) { out.push({ target: direct, value: val }); continue; }
    const stat = STAT_MOD[name];
    if (stat) out.push({ target: stat, value: halveAbility ? Math.floor(val / 2) : val });
  }
}

// --- Utilidades -------------------------------------------------------------

function slug(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchJson(file) {
  const url = `${BASE}/${file}`;
  console.log(`→ ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function writeOut(name, data) {
  const out = path.join(OUT_DIR, name);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`✓ ${data.length} → ${out}`);
}

// --- Mappers ----------------------------------------------------------------

function mapFeats(raw) {
  return raw
    .filter((f) => f.Name)
    .map((f) => {
      const bonuses = [];
      pushBonusesFromBenefits(bonuses, f.Benefits, { halveAbility: false });
      return {
        id: slug(f.Name),
        name: f.Name,
        type: f.Type || undefined,
        description: f['Short Text'] || f['Long Text'] || undefined,
        prereqs:
          Array.isArray(f.Prerequisites) && f.Prerequisites.length && f.Prerequisites[0] !== 'None'
            ? f.Prerequisites
            : undefined,
        bonuses: bonuses.length ? bonuses : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapRaces(raw) {
  return raw
    .filter((r) => r.Name)
    .map((r) => {
      const t = r.Traits || {};
      return {
        id: slug(r.Name),
        name: r.Name,
        size: r.Size || undefined,
        speed: typeof r.Speed === 'number' ? r.Speed : undefined,
        favoredClass: r['Favored Class'] || undefined,
        languages: Array.isArray(r.Languages) ? r.Languages : undefined,
        bonusLanguages: Array.isArray(r['Bonus Languages']) ? r['Bonus Languages'] : undefined,
        abilityMods: t.Stats && Object.keys(t.Stats).length ? t.Stats : undefined,
        skillBonuses: t.Skills && Object.keys(t.Skills).length ? t.Skills : undefined,
        abilities: Array.isArray(t.Abilities) && t.Abilities.length ? t.Abilities : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const ABILITY_FULL = {
  Str: 'Strength', Dex: 'Dexterity', Con: 'Constitution',
  Int: 'Intelligence', Wis: 'Wisdom', Cha: 'Charisma',
};
function mapSkills(raw) {
  return raw
    .filter((s) => s.name)
    .map((s) => ({
      id: slug(s.name),
      name: s.name,
      ability: s.key ? (ABILITY_FULL[s.key] || s.key) : undefined,
      trainedOnly: !!s.trained || undefined,
      armorCheck: !!s.armorcheck || undefined,
      synergy: Array.isArray(s.synergy) && s.synergy.length ? s.synergy : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapClasses(raw) {
  return raw
    .filter((c) => c.Class)
    .map((c) => {
      const ab = c.ClassAbilities || {};
      const levels = Object.keys(ab).map((k) => parseInt(k, 10)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      const bab = []; const fort = []; const ref = []; const will = [];
      const abilitiesByLevel = {};
      for (const lvl of levels) {
        const row = ab[String(lvl)] || {};
        bab.push(row.BAB ?? 0);
        fort.push(row.Fort ?? 0);
        ref.push(row.Ref ?? 0);
        will.push(row.Will ?? 0);
        if (Array.isArray(row.Abilities) && row.Abilities.length) {
          abilitiesByLevel[String(lvl)] = row.Abilities;
        }
      }
      return {
        id: slug(c.Class),
        name: c.Class,
        hitDice: c.HitDice || undefined,
        skillPoints: typeof c.SkillPoints === 'number' ? c.SkillPoints : undefined,
        keyStat: c.KeyStat || undefined,
        spellCaster: !!c.SpellCaster,
        classSkills: Array.isArray(c.ClassSkills) ? c.ClassSkills : undefined,
        proficiencies: Array.isArray(c['Weapon and armor proficiency']) ? c['Weapon and armor proficiency'] : undefined,
        alignment: c.Alignment || undefined,
        bab, saves: { fort, ref, will },
        abilitiesByLevel: Object.keys(abilitiesByLevel).length ? abilitiesByLevel : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mapLanguages(raw) {
  return raw
    .filter((l) => l.name)
    .map((l) => ({ id: slug(l.name), name: l.name, alphabet: l.alphabet || undefined }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const ITEM_SLOT_MAP = {
  neck: 'amulet', amulet: 'amulet',
  ring: 'ring1', finger: 'ring1',
  cloak: 'cloak', shoulders: 'cloak',
  belt: 'belt', waist: 'belt',
  hands: 'gloves', gloves: 'gloves',
  feet: 'boots', boots: 'boots',
  head: 'other', headband: 'other', face: 'other',
  body: 'armor', torso: 'armor', armor: 'armor',
  shield: 'shield',
  weapon: 'weapon_main',
};
function normalizeSlot(s) {
  if (!s) return undefined;
  const k = String(s).toLowerCase().trim();
  return ITEM_SLOT_MAP[k] || k;
}

function mapMagicItemsUpstream(raw) {
  return raw
    .filter((i) => i.Name)
    .map((i) => {
      const bonuses = [];
      pushBonusesFromBenefits(bonuses, i.Benefits, { halveAbility: true });
      return {
        id: slug(i.Name),
        name: i.Name,
        slot: normalizeSlot(i.Location),
        cost: i.Cost || undefined,
        weight: i.Weight && i.Weight !== 'n/a' ? String(i.Weight) : undefined,
        description: i.Description || undefined,
        bonuses: bonuses.length ? bonuses : undefined,
      };
    });
}

function mapMundane(raw) {
  return raw
    .filter((i) => i.Name)
    .map((i) => ({
      id: slug(i.Name),
      name: i.Name,
      slot: 'inventory',
      category: 'other',
      cost: i.Cost || undefined,
      weight: typeof i.Weight === 'number' ? i.Weight : undefined,
      notes: i.Text || undefined,
    }));
}

// --- Catálogo curado de objetos mágicos --------------------------------------
// El upstream sólo trae 1 ejemplo. Añadimos los más comunes del PHB 3.5
// con bonos automáticos que el sistema entiende (lib/systems/dnd35.ts).
const CURATED_MAGIC_ITEMS = [
  { name: 'Capa de Resistencia +1', slot: 'cloak', cost: '1000 gp',
    bonuses: [{ target: 'fort', value: 1 }, { target: 'ref', value: 1 }, { target: 'will', value: 1 }] },
  { name: 'Capa de Resistencia +2', slot: 'cloak', cost: '4000 gp',
    bonuses: [{ target: 'fort', value: 2 }, { target: 'ref', value: 2 }, { target: 'will', value: 2 }] },
  { name: 'Capa de Resistencia +3', slot: 'cloak', cost: '9000 gp',
    bonuses: [{ target: 'fort', value: 3 }, { target: 'ref', value: 3 }, { target: 'will', value: 3 }] },
  { name: 'Capa de Resistencia +4', slot: 'cloak', cost: '16000 gp',
    bonuses: [{ target: 'fort', value: 4 }, { target: 'ref', value: 4 }, { target: 'will', value: 4 }] },
  { name: 'Capa de Resistencia +5', slot: 'cloak', cost: '25000 gp',
    bonuses: [{ target: 'fort', value: 5 }, { target: 'ref', value: 5 }, { target: 'will', value: 5 }] },

  { name: 'Amuleto de Salud +2', slot: 'amulet', cost: '4000 gp',
    description: '+2 mejora a Constitución', bonuses: [{ target: 'mod_con', value: 1 }] },
  { name: 'Amuleto de Salud +4', slot: 'amulet', cost: '16000 gp',
    description: '+4 mejora a Constitución', bonuses: [{ target: 'mod_con', value: 2 }] },
  { name: 'Amuleto de Salud +6', slot: 'amulet', cost: '36000 gp',
    description: '+6 mejora a Constitución', bonuses: [{ target: 'mod_con', value: 3 }] },

  { name: 'Cinturón de Fuerza Gigantesca +2', slot: 'belt', cost: '4000 gp',
    bonuses: [{ target: 'mod_str', value: 1 }, { target: 'attack_melee', value: 1 }] },
  { name: 'Cinturón de Fuerza Gigantesca +4', slot: 'belt', cost: '16000 gp',
    bonuses: [{ target: 'mod_str', value: 2 }, { target: 'attack_melee', value: 2 }] },
  { name: 'Cinturón de Fuerza Gigantesca +6', slot: 'belt', cost: '36000 gp',
    bonuses: [{ target: 'mod_str', value: 3 }, { target: 'attack_melee', value: 3 }] },

  { name: 'Guantes de Destreza +2', slot: 'gloves', cost: '4000 gp',
    bonuses: [{ target: 'mod_dex', value: 1 }, { target: 'ref', value: 1 }, { target: 'ac', value: 1 }] },
  { name: 'Guantes de Destreza +4', slot: 'gloves', cost: '16000 gp',
    bonuses: [{ target: 'mod_dex', value: 2 }, { target: 'ref', value: 2 }, { target: 'ac', value: 2 }] },
  { name: 'Guantes de Destreza +6', slot: 'gloves', cost: '36000 gp',
    bonuses: [{ target: 'mod_dex', value: 3 }, { target: 'ref', value: 3 }, { target: 'ac', value: 3 }] },

  { name: 'Diadema de Intelecto +2', slot: 'other', cost: '4000 gp', bonuses: [{ target: 'mod_int', value: 1 }] },
  { name: 'Periapto de Sabiduría +2', slot: 'amulet', cost: '4000 gp',
    bonuses: [{ target: 'mod_wis', value: 1 }, { target: 'will', value: 1 }] },
  { name: 'Capa de Carisma +2', slot: 'cloak', cost: '4000 gp', bonuses: [{ target: 'mod_cha', value: 1 }] },

  { name: 'Amuleto de Armadura Natural +1', slot: 'amulet', cost: '2000 gp', bonuses: [{ target: 'ac', value: 1 }] },
  { name: 'Amuleto de Armadura Natural +2', slot: 'amulet', cost: '8000 gp', bonuses: [{ target: 'ac', value: 2 }] },
  { name: 'Amuleto de Armadura Natural +3', slot: 'amulet', cost: '18000 gp', bonuses: [{ target: 'ac', value: 3 }] },
  { name: 'Amuleto de Armadura Natural +4', slot: 'amulet', cost: '32000 gp', bonuses: [{ target: 'ac', value: 4 }] },

  { name: 'Anillo de Protección +1', slot: 'ring1', cost: '2000 gp', bonuses: [{ target: 'ac', value: 1 }] },
  { name: 'Anillo de Protección +2', slot: 'ring1', cost: '8000 gp', bonuses: [{ target: 'ac', value: 2 }] },
  { name: 'Anillo de Protección +3', slot: 'ring1', cost: '18000 gp', bonuses: [{ target: 'ac', value: 3 }] },
  { name: 'Anillo de Protección +4', slot: 'ring1', cost: '32000 gp', bonuses: [{ target: 'ac', value: 4 }] },
  { name: 'Anillo de Protección +5', slot: 'ring1', cost: '50000 gp', bonuses: [{ target: 'ac', value: 5 }] },

  { name: 'Botas Élficas', slot: 'boots', cost: '2500 gp', bonuses: [{ target: 'sk_move_silently', value: 5 }] },
  { name: 'Botas de Velocidad', slot: 'boots', cost: '12000 gp',
    bonuses: [{ target: 'initiative', value: 1 }, { target: 'ac', value: 1 }] },
  { name: 'Capa Élfica', slot: 'cloak', cost: '2500 gp', bonuses: [{ target: 'sk_hide', value: 5 }] },

  { name: 'Poción de Curar Heridas Leves', slot: 'inventory', cost: '50 gp', description: 'Cura 1d8+1' },
  { name: 'Poción de Curar Heridas Moderadas', slot: 'inventory', cost: '300 gp', description: 'Cura 2d8+3' },
  { name: 'Poción de Curar Heridas Graves', slot: 'inventory', cost: '750 gp', description: 'Cura 3d8+5' },
];

function buildCuratedMagic() {
  return CURATED_MAGIC_ITEMS.map((it) => ({
    id: slug(it.name),
    name: it.name,
    slot: it.slot,
    cost: it.cost,
    description: it.description,
    bonuses: it.bonuses,
  }));
}

function dedupById(...lists) {
  const byId = new Map();
  for (const list of lists) for (const it of list) if (!byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function main() {
  const [feats, races, skills, classes, languages, magic, mundane] = await Promise.all([
    fetchJson('feats.json'),
    fetchJson('races.json'),
    fetchJson('skills.json'),
    fetchJson('classes.json'),
    fetchJson('languages.json'),
    fetchJson('magic_items.json'),
    fetchJson('mundane_items.json'),
  ]);

  await writeOut('feats.json', mapFeats(feats));
  await writeOut('races.json', mapRaces(races));
  await writeOut('skills.json', mapSkills(skills));
  await writeOut('classes.json', mapClasses(classes));
  await writeOut('languages.json', mapLanguages(languages));
  await writeOut('magic-items.json',
    dedupById(buildCuratedMagic(), mapMagicItemsUpstream(magic)));
  await writeOut('mundane-items.json',
    mapMundane(mundane).sort((a, b) => a.name.localeCompare(b.name)));

  console.log('\n→ Para los conjuros, ejecuta también:');
  console.log('    node scripts/import-phb-spells.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
