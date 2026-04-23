/**
 * import-dd35-raw.mjs
 * Importa feats y conjuros desde los archivos .dd35 en data/raw/
 * y escribe los resultados en data/dnd35/ con el formato del catálogo.
 *
 * Uso:
 *   node scripts/import-dd35-raw.mjs --what=spells [--dry-run]
 *   node scripts/import-dd35-raw.mjs --what=feats  [--dry-run]
 *   node scripts/import-dd35-raw.mjs --what=all    [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const RAW    = join(ROOT, 'data', 'raw');
const OUT    = join(ROOT, 'data', 'dnd35');

const args   = process.argv.slice(2);
const WHAT   = (args.find(a => a.startsWith('--what='))  ?? '--what=all').split('=')[1];
const DRY    = args.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades comunes
// ─────────────────────────────────────────────────────────────────────────────

/** Elimina etiquetas HTML y decodifica entidades básicas */
function stripHtml(str = '') {
  return str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Genera un slug a partir de un nombre */
function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Lee un .dd35 y extrae el slot no vacío por índice */
function readDD35(filename, slotIndex) {
  const raw = readFileSync(join(RAW, filename), 'utf8');
  const arr = JSON.parse(raw);
  const slot = arr[slotIndex];
  if (!Array.isArray(slot) || slot.length === 0) {
    throw new Error(`Slot [${slotIndex}] vacío en ${filename}`);
  }
  return slot;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae BonusEffects del texto del beneficio de una dote.
 * Captura patrones como "+2 to Str", "+4 dodge bonus to AC", etc.
 * No intenta extraer bonos complejos — los deja como descripción.
 */
const BONUS_RE = /[+\-]\d+\s+(?:(\w+)\s+)?bonus\s+(?:to|on)\s+([\w\s]+?)(?:[,;.]|$)/gi;

function extractBonuses(benefit = '') {
  const bonuses = [];
  const KNOWN_TYPES = new Set([
    'alchemical','armor','circumstance','competence','deflection',
    'dodge','enhancement','insight','luck','morale','natural',
    'profane','racial','resistance','sacred','shield','size',
  ]);
  let m;
  BONUS_RE.lastIndex = 0;
  while ((m = BONUS_RE.exec(benefit)) !== null) {
    const sign  = m[0].trim().startsWith('-') ? -1 : 1;
    const digits = parseInt(m[0].match(/\d+/)[0], 10);
    const value  = sign * digits;
    const rawType = (m[1] ?? '').toLowerCase().trim();
    const rawTarget = (m[2] ?? '').toLowerCase().trim().replace(/\s+/g, '_');
    const type   = KNOWN_TYPES.has(rawType) ? rawType : 'untyped';
    if (rawTarget) {
      bonuses.push({ target: rawTarget, value, ...(type !== 'untyped' ? { type } : {}) });
    }
  }
  return bonuses;
}

/** Normaliza el tipo de feat al union de la app */
function normalizeFeatType(raw = '') {
  // Gashren usa "General, Fighter" → tomamos el primer token principal
  const first = raw.split(',')[0].trim();
  const MAP = {
    'fighter bonus feat': 'Fighter',
    'general'           : 'General',
    'epic'              : 'Epic',
    'metamagic'         : 'Metamagic',
    'item creation'     : 'Item Creation',
    'psionic'           : 'Psionic',
    'metapsionic'       : 'Metapsionic',
    'regional'          : 'Regional',
    'monster'           : 'Monster',
    'divine'            : 'Divine',
    'exalted'           : 'Exalted',
    'corrupt'           : 'Corrupt',
    'fighter'           : 'Fighter',
    'ancestor'          : 'Ancestor',
  };
  return MAP[first.toLowerCase()] ?? first;
}

async function importFeats() {
  console.log('\n── FEATS ─────────────────────────────────────');

  const cleaned  = readDD35('CleanedFeats.dd35', 4);
  const gashren  = readDD35('featsGashren.dd35',  4);
  console.log(`  CleanedFeats : ${cleaned.length}`);
  console.log(`  Gashren      : ${gashren.length}`);

  // Combinar; deduplicar por nombre (CleanedFeats tiene precedencia)
  const byName = new Map();
  for (const f of cleaned)  byName.set(f.name.toLowerCase(), { src: 'cleaned', ...f });
  for (const f of gashren)  {
    const key = f.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { src: 'gashren', ...f });
  }
  console.log(`  Total únicos : ${byName.size}`);

  // Generar slugs únicos
  const slugCount = new Map();
  const catalog   = [];

  for (const f of byName.values()) {
    let base = slugify(f.name);
    const count = (slugCount.get(base) ?? 0) + 1;
    slugCount.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;

    const bonuses = extractBonuses(f.benefit ?? '');
    const entry = {
      id,
      name       : f.name,
      type       : normalizeFeatType(f.type ?? ''),
      description: stripHtml(f.benefit ?? '').trim() || undefined,
      ...(f.prerequisite ? { prereq: f.prerequisite } : {}),
      ...(bonuses.length  ? { bonuses }                : {}),
    };
    // Limpiar undefined
    Object.keys(entry).forEach(k => entry[k] === undefined && delete entry[k]);
    catalog.push(entry);
  }

  // Estadísticas de bonos extraídos
  const withBonuses = catalog.filter(f => f.bonuses?.length);
  console.log(`  Con bonos parseados : ${withBonuses.length}`);
  console.log(`  Muestra (primeros 3 con bonos):`);
  withBonuses.slice(0, 3).forEach(f =>
    console.log(`    ${f.name}: ${JSON.stringify(f.bonuses)}`)
  );

  if (DRY) {
    console.log('  [dry-run] NO se escribió feats.json');
    console.log('  Muestra 5 entries:');
    catalog.slice(0, 5).forEach(f => console.log('   ', JSON.stringify(f).slice(0, 200)));
    return;
  }

  const outPath = join(OUT, 'feats.json');
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`  ✓ Escribió ${catalog.length} feats → data/dnd35/feats.json`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SPELLS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea el campo level de un conjuro.
 * Formatos encontrados:
 *   "Sorcerer/Wizard 3, Cleric 4"
 *   "Apostle of Peace 7 / Cleric 7"
 *   "Bard 6"
 *   ""  (vacío → nivel desconocido)
 *
 * Devuelve { level: number, classes: string[] }
 *  - level  = mínimo nivel entre todas las clases que lo tienen
 *  - classes = lista de nombres de clase normalizados
 */
function parseSpellLevel(raw = '') {
  if (!raw || !raw.trim()) return { level: 0, classes: [] };

  // Separar por coma o barra inclinada no precedida de dígito
  const parts = raw.split(/,|(?<!\d)\/(?!\d)/).map(s => s.trim()).filter(Boolean);
  const classes = [];
  const levels  = [];

  for (const part of parts) {
    // Último token si es número → es el nivel
    const m = part.match(/^(.+?)\s+(\d+)$/);
    if (m) {
      classes.push(m[1].trim());
      levels.push(parseInt(m[2], 10));
    }
    // "Sor/Wiz 3" — la barra aquí SÍ va entre nombres de clase
    const slashM = part.match(/^(.+?)\s*\/\s*(.+?)\s+(\d+)$/);
    if (slashM && !m) {
      classes.push(slashM[1].trim(), slashM[2].trim());
      const lvl = parseInt(slashM[3], 10);
      levels.push(lvl, lvl);
    }
  }

  const level = levels.length ? Math.min(...levels) : 0;
  return { level, classes: [...new Set(classes)] };
}

async function importSpells() {
  console.log('\n── SPELLS ────────────────────────────────────');

  const raw = readDD35('all-spells-big.dd35', 1);
  console.log(`  Total raw : ${raw.length}`);

  const slugCount = new Map();
  const catalog   = [];

  for (const s of raw) {
    let base = slugify(s.name ?? 'spell');
    const count = (slugCount.get(base) ?? 0) + 1;
    slugCount.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;

    const { level, classes } = parseSpellLevel(s.level ?? '');

    const entry = {
      id,
      name        : s.name,
      level,
      ...(classes.length       ? { classes }                : {}),
      ...(s.school             ? { school: s.school }       : {}),
      ...(s.subschool          ? { subschool: s.subschool } : {}),
      ...(s.components         ? { components: s.components }         : {}),
      ...(s.casting_time       ? { casting_time: s.casting_time }     : {}),
      ...(s.range              ? { range: s.range }                   : {}),
      ...(s.duration           ? { duration: s.duration }             : {}),
      ...(s.saving_throw       ? { saving_throw: s.saving_throw }     : {}),
      ...(s.spell_resistance   ? { spell_resistance: s.spell_resistance } : {}),
      ...(s.short_description  ? { description: stripHtml(s.short_description) } : {}),
    };
    catalog.push(entry);
  }

  // Estadísticas
  const noLevel  = catalog.filter(s => s.level === 0 && (!s.classes || s.classes.length === 0)).length;
  const with_classes = catalog.filter(s => s.classes?.length > 0).length;
  console.log(`  Con clases identificadas : ${with_classes}`);
  console.log(`  Sin nivel/clase          : ${noLevel}`);
  console.log(`  Muestra (10 conjuros):`);
  catalog.slice(0, 10).forEach(s =>
    console.log(`    ${s.name} → level=${s.level} classes=${JSON.stringify(s.classes ?? [])}`)
  );

  if (DRY) {
    console.log('  [dry-run] NO se escribió spells.json');
    return;
  }

  const outPath = join(OUT, 'spells.json');
  writeFileSync(outPath, JSON.stringify(catalog, null, 2), 'utf8');
  console.log(`  ✓ Escribió ${catalog.length} conjuros → data/dnd35/spells.json`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

console.log(`import-dd35-raw.mjs  what=${WHAT}  dry=${DRY}`);

if (WHAT === 'feats' || WHAT === 'all') await importFeats();
if (WHAT === 'spells' || WHAT === 'all') await importSpells();

console.log('\nListo.');
