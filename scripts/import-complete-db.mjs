/**
 * import-complete-db.mjs
 * Extrae datos de complete_db.json y los adapta al formato de rolmix.
 *
 * Secciones del archivo fuente:
 *   [0]  3   magic items (5e)
 *   [1]  117 conjuros (5e)
 *   [3]  95  equipo/armas/armaduras (campos 3.5 style)  ← se importa
 *   [4]  531 feats (5e con algunos General/Fighter)      ← solo General + General,Fighter
 *   [5]  47  sub-razas 5e (Mountain Dwarf…)             ← pendiente
 *   [7]  85  clases + arquetipos 5e                      ← pendiente
 *   [9]  449 monstruos (3.5/PF)                          ← pendiente
 *
 * Uso:  node scripts/import-complete-db.mjs [--feats] [--dry]
 *   --feats  también importa feats compatibles con 3.5
 *   --dry    solo imprime sin escribir archivos
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'complete_db.json');

const DO_FEATS = process.argv.includes('--feats');
const DRY_RUN = process.argv.includes('--dry');

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Convierte un nombre en slug kebab-case */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Elimina etiquetas HTML y decodifica entidades básicas */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Convierte "19-20 x2" → "19-20/×2" al estilo PHB 3.5 */
function fmtCritical(raw) {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/\s+x(\d)/i, '/×$1')
    .replace(/(\d+)-(\d+)\//, '$1-$2/')
    .replace(/^20\/?×/, '20/×'); // "20 x2" → "20/×2"
}

/** Parsea el bonus numérico de armor_shield_bonus o armor_check_penalty */
function toNum(v) {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

// ─── [3] EQUIPO ──────────────────────────────────────────────────────────────

/**
 * Determina slot, category y type de bono a partir de family/category/subcategory.
 *
 * family: "Weapons" | "Armor" | "Shields" | "Adventuring Gear" | ...
 * category: "Simple Weapons" | "Martial Weapons" | "Exotic Weapons" |
 *           "Light Armor" | "Medium Armor" | "Heavy Armor" |
 *           "Shields" | "Ammunition" | "Special" | ...
 */
function classifyItem(item) {
  const family = (item.family ?? '').toLowerCase();
  const cat = (item.category ?? '').toLowerCase();
  const subcat = (item.subcategory ?? '').toLowerCase();

  const isRanged = cat.includes('ranged') || subcat.includes('ranged') ||
    (item.dmg_m === '' && (cat.includes('amm') || subcat.includes('amm')));

  if (family === 'weapons' || cat.includes('weapon')) {
    return {
      slot: 'weapon_main',
      category: 'weapon',
      bonusTarget: isRanged ? 'attack_ranged' : 'attack_melee',
      bonusType: 'enhancement',
    };
  }
  if (family === 'shields' || cat.includes('shield')) {
    return { slot: 'shield', category: 'shield', bonusTarget: 'ac', bonusType: 'shield' };
  }
  if (family === 'armor' || cat.includes('armor')) {
    return { slot: 'armor', category: 'armor', bonusTarget: 'ac', bonusType: 'armor' };
  }
  // Adventuring gear, special → wondrous/gear
  return { slot: 'gear', category: 'gear', bonusTarget: null, bonusType: null };
}

function transformEquipment(rawItems) {
  const seen = new Set();
  return rawItems.map((item) => {
    const { slot, category, bonusTarget, bonusType } = classifyItem(item);

    // Slug único
    let id = slugify(item.name);
    if (seen.has(id)) id = `${id}-${item.id}`;
    seen.add(id);

    // Notas limpias
    const noteParts = [];
    if (item.dmg_m && item.dmg_m.trim()) {
      noteParts.push(`Daño: ${item.dmg_m.trim()}`);
      if (item.dmg_s && item.dmg_s.trim()) noteParts.push(`(S ${item.dmg_s.trim()})`);
    }
    if (item.type && item.type.trim() && item.type !== 'None') {
      noteParts.push(item.type.trim());
    }
    if (item.critical && item.critical.trim()) {
      noteParts.push(`Crítico: ${fmtCritical(item.critical)}`);
    }
    const armorBonus = toNum(item.armor_shield_bonus);
    if (armorBonus > 0) noteParts.push(`Armadura/Escudo: +${armorBonus}`);
    const maxDex = item.maximum_dex_bonus ? item.maximum_dex_bonus.trim() : '';
    if (maxDex && maxDex !== '' && maxDex !== 'None') noteParts.push(`Máx Des +${maxDex}`);
    const acp = toNum(item.armor_check_penalty);
    if (acp < 0) noteParts.push(`Penalización: ${acp}`);

    // Si no hay notas estructuradas, extraer del full_text
    let notes = noteParts.join(', ');
    if (!notes && item.full_text) {
      notes = stripHtml(item.full_text).slice(0, 200);
    }

    // Bonos estructurados
    const bonuses = [];
    if (bonusTarget) {
      if (bonusTarget === 'ac' && armorBonus > 0) {
        bonuses.push({ target: bonusTarget, value: armorBonus, type: bonusType });
      } else if (bonusTarget.startsWith('attack_')) {
        // Armas base: bono 0 (el encantamiento lo añade el usuario manualmente)
        bonuses.push({ target: bonusTarget, value: 0, type: bonusType });
      }
    }

    const out = {
      id,
      name: item.name,
      slot,
      category,
      bonuses,
      notes,
    };
    if (item.weight && String(item.weight).trim()) out.weight = String(item.weight).trim();
    if (item.cost && String(item.cost).trim()) out.cost = String(item.cost).trim();

    return out;
  });
}

// ─── [4] FEATS (solo General + General, Fighter) ─────────────────────────────

/**
 * Intenta extraer bonos estructurados del campo `benefit` de feats 3.5/5e.
 * Patrones reconocidos (case-insensitive):
 *   "+N bonus on/to <target>"
 *   "+N to <target>"
 *   "+N on <target>"
 * Targets mapeados a nuestros ids.
 */
const BENEFIT_TARGET_MAP = {
  'initiative':           'initiative',
  'will saving':          'will',
  'will save':            'will',
  'fortitude saving':     'fort',
  'fortitude save':       'fort',
  'reflex saving':        'ref',
  'reflex save':          'ref',
  'saving throw':         null,      // genérico, no mapeado
  'attack roll':          'attack_melee',
  'melee attack':         'attack_melee',
  'ranged attack':        'attack_ranged',
  'armor class':          'ac',
  ' ac ':                 'ac',
  'hit point':            'hp_max',
};

function extractBonusesFromBenefit(benefit) {
  if (!benefit) return [];
  const bonuses = [];
  // +N bonus (on|to|on saving throws against)
  const re = /\+(\d+)\s+(?:bonus\s+)?(?:on|to)\s+([\w\s]+?)(?:\.|,|;|$)/gi;
  let m;
  while ((m = re.exec(benefit)) !== null) {
    const value = parseInt(m[1], 10);
    const raw = m[2].toLowerCase().trim();
    let target = null;
    for (const [k, v] of Object.entries(BENEFIT_TARGET_MAP)) {
      if (raw.includes(k)) { target = v; break; }
    }
    if (target && value > 0) {
      bonuses.push({ target, value, type: 'untyped' });
    }
  }
  return bonuses;
}

const FEAT_3_5_TYPES = new Set(['general', 'general, fighter']);

function transformFeats(rawFeats) {
  const seen = new Set();
  return rawFeats
    .filter((f) => {
      const t = (f.type ?? '').toLowerCase();
      return FEAT_3_5_TYPES.has(t);
    })
    .map((feat) => {
      let id = slugify(feat.name);
      if (seen.has(id)) id = `${id}-${feat.id}`;
      seen.add(id);

      const bonuses = extractBonusesFromBenefit(feat.benefit);
      const description = feat.benefit
        ? feat.benefit.replace(/\s+/g, ' ').trim()
        : stripHtml(feat.full_text).slice(0, 300);

      return {
        id,
        name: feat.name,
        type: feat.type,
        prerequisite: feat.prerequisite ?? '',
        description,
        ...(bonuses.length > 0 ? { bonuses } : {}),
      };
    });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Equipment [3]
const equipment = transformEquipment(raw[3]);
const eqPath = path.join(ROOT, 'data', 'dnd35', 'equipment.json');
console.log(`\n✔ ${equipment.length} items de equipo`);
const eqWeapons = equipment.filter((e) => e.category === 'weapon');
const eqArmors  = equipment.filter((e) => e.category === 'armor');
const eqShields = equipment.filter((e) => e.category === 'shield');
const eqGear    = equipment.filter((e) => e.category === 'gear');
console.log(`  Armas: ${eqWeapons.length}  Armaduras: ${eqArmors.length}  Escudos: ${eqShields.length}  Equipo: ${eqGear.length}`);
if (!DRY_RUN) {
  fs.writeFileSync(eqPath, JSON.stringify(equipment, null, 2), 'utf8');
  console.log(`  → ${eqPath}`);
}

// Feats [4] (opcional)
if (DO_FEATS) {
  const feats = transformFeats(raw[4]);
  const featPath = path.join(ROOT, 'data', 'dnd35', 'feats-extended.json');
  console.log(`\n✔ ${feats.length} feats (General/Fighter) de ${raw[4].length} totales`);
  if (!DRY_RUN) {
    fs.writeFileSync(featPath, JSON.stringify(feats, null, 2), 'utf8');
    console.log(`  → ${featPath}`);
  } else {
    console.log('  Ejemplos:');
    feats.slice(0, 3).forEach((f) => console.log(`   • ${f.name} [${f.type}] bonuses=${JSON.stringify(f.bonuses ?? [])}`));
  }
}

if (DRY_RUN) {
  console.log('\n[DRY RUN] Sin escrituras. Muestra de equipo:');
  equipment.slice(0, 5).forEach((e) =>
    console.log(`  ${e.id.padEnd(28)} slot=${e.slot.padEnd(12)} bonus=${JSON.stringify(e.bonuses)}`)
  );
}
