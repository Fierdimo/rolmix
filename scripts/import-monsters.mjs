/**
 * import-monsters.mjs
 * Convierte los archivos monsters-part*.dd35 al formato Character de rolmix.
 * Cada .dd35 es un array de 10 elementos donde [9] contiene los monstruos.
 *
 * Salida: data/dnd35/monsters.json
 *
 * Uso:  node scripts/import-monsters.mjs [--dry]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const FILES = [
  'data/raw/monsters-part1.dd35',
  'data/raw/monsters-part2.dd35',
  'data/raw/monsters-part3.dd35',
  'data/raw/monsters-part4.dd35',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseAbilities(text) {
  // "Abilities: Str 18, Dex 12, Con 14, Int 10, Wis 11, Cha 8"
  // Some have "—" or "--" for no score (constructs/undead)
  const m = text.match(
    /Abilities?\s*[:.]?\s*Str\s*([\d\-—]+),?\s*Dex\s*([\d\-—]+),?\s*Con\s*([\d\-—]+),?\s*Int\s*([\d\-—]+),?\s*Wis\s*([\d\-—]+),?\s*Cha\s*([\d\-—]+)/i
  );
  if (!m) return null;
  const parse = (v) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? 10 : n;
  };
  return {
    str: parse(m[1]),
    dex: parse(m[2]),
    con: parse(m[3]),
    int: parse(m[4]),
    wis: parse(m[5]),
    cha: parse(m[6]),
  };
}

function parseHP(text) {
  // "Hit Dice: 6d8+18 (45 hp)" or "Hit Points 45 (6d8+18)"
  // Try average HP in parens first
  let m = text.match(/Hit Dice\s*[:.]?\s*[\dd\+\-\s]+\((\d+)\s*hp\)/i);
  if (m) return parseInt(m[1], 10);
  // Try "X hp" without parens
  m = text.match(/(\d+)\s*hp/i);
  if (m) return parseInt(m[1], 10);
  // Try "Hit Points X"
  m = text.match(/Hit Points\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}

function parseAC(text) {
  // "Armor Class: 17 (...), touch 12, flat-footed 15"  or  "AC: 17 (...)"
  const m = text.match(/\b(?:Armor\s+Class|AC)\s*[:.]?\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : 10;
}

function parseTouchAC(text) {
  const m = text.match(/\btouch\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseFlatFootedAC(text) {
  const m = text.match(/flat-footed\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function parseBAB(text) {
  // "Base Attack/Grapple: +9/+4" or "Base Attack: +6"
  const m = text.match(/Base Attack\s*(?:\/Grapple)?\s*[:.]?\s*([+\-]\d+)/i);
  if (m) return parseInt(m[1], 10);
  // Fallback: first attack bonus
  const a = text.match(/Attack\s*[:.]?\s*[^+\-]*([+\-]\d+)\s+melee/i);
  if (a) return parseInt(a[1], 10);
  return 0;
}

function parseSaves(text) {
  // "Fort +4, Ref +3, Will +7"
  const m = text.match(/Fort\s*([+\-]\d+)[,;]?\s*Ref\s*([+\-]\d+)[,;]?\s*Will\s*([+\-]\d+)/i);
  if (!m) return { fort: 0, ref: 0, will: 0 };
  return {
    fort: parseInt(m[1], 10),
    ref: parseInt(m[2], 10),
    will: parseInt(m[3], 10),
  };
}

function parseCR(ch) {
  if (!ch) return 1;
  const s = String(ch).trim();
  // Fractions
  if (s === '1/2' || s === '0.5') return 0.5;
  if (s === '1/3') return 0.33;
  if (s === '1/4' || s === '0.25') return 0.25;
  const n = parseFloat(s);
  return isNaN(n) ? 1 : n;
}

function parseSize(text) {
  const sizes = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
  for (const s of sizes) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(text.substring(0, 400))) return s;
  }
  return 'Medium';
}

/**
 * Parsea los ataques de un monstruo desde el texto limpio del stat block.
 * Usa "Full Attack" preferentemente; si está vacío, usa "Attack".
 * Devuelve un array de MonsterAttack.
 */
function parseMonsterAttacks(text) {
  // Extraer la línea de Full Attack (hasta la siguiente sección)
  const NEXT_SECTION = /\s+(?:Space\/Reach|Special\s+Attacks|Special\s+Qualities|Saves|Speed)\s*:/i;

  let attackText = '';
  const fullM = text.match(/Full\s+Attack\s*:\s*(.*?)(?=\s+(?:Space\/Reach|Special\s+Attacks|Special\s+Qualities|Saves|Speed)\s*:|$)/i);
  const singleM = text.match(/\bAttack\s*:\s*(.*?)(?=\s+Full\s+Attack\s*:|(?=\s+Space\/Reach\s*:)|(?=\s+Special\s+Attacks\s*:)|(?=\s+Special\s+Qualities\s*:)|(?=\s+Saves\s*:)|$)/i);

  const fullText = fullM ? fullM[1].trim() : '';
  const singleText = singleM ? singleM[1].trim() : '';

  // Usar Full Attack si tiene contenido útil (contiene paréntesis de daño)
  if (fullText && /\(/.test(fullText)) {
    attackText = fullText;
  } else if (singleText && /\(/.test(singleText)) {
    attackText = singleText;
  } else {
    return [];
  }

  // Separar los tipos de ataque por " and "
  const parts = attackText.split(/\s+and\s+/i);
  const attacks = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Patrón: [count] [name] <bonus>[/bonus2/...] melee|ranged (<damage>)
    // Ejemplos:
    //   "4 tentacles +40 melee (4d8+18 plus slime)"
    //   "Claw +28 melee (2d4+9/19-20)"
    //   "Slam +4 melee (1d4+2)"
    //   "+9/+4 melee (1d8+5, longsword)"
    const m = trimmed.match(
      /^(?:(\d+)\s+)?([\w][\w\s'-]*?)\s*([+\-]\d+(?:\/[+\-]\d+)*)\s+(melee|ranged)\s*\(([^)]+)\)/i
    );
    if (!m) continue;

    const count   = m[1] ? parseInt(m[1], 10) : 1;
    const rawName = m[2].trim();
    const bonusStr = m[3]; // e.g. "+9/+4" or "+40"
    const atkType  = m[4].toLowerCase();
    const damageStr = m[5]; // e.g. "4d8+18 plus slime" or "1d8+5, longsword"

    // Bonos iterativos
    const bonusParts = bonusStr.split('/');
    const primaryBonus = parseInt(bonusParts[0], 10);
    const extraBonuses = bonusParts.slice(1).map(b => parseInt(b, 10)).filter(n => !isNaN(n));

    // Dado de daño y modificador
    const dmgM = damageStr.match(/(\d+d\d+)([+\-]\d+)?/i);
    const damageDie = dmgM ? dmgM[1] : '1d4';
    const damageMod = dmgM && dmgM[2] ? parseInt(dmgM[2], 10) : 0;

    // Capitalizar nombre
    const cleanName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

    const atk = {
      name: cleanName,
      bonus: primaryBonus,
      damage_die: damageDie,
      damage_mod: damageMod,
      type: atkType,
      count,
      notes: trimmed,
    };
    if (extraBonuses.length > 0) atk.extra_attacks = extraBonuses;

    attacks.push(atk);
  }

  return attacks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const allMonsters = [];
let totalRaw = 0;
let totalConverted = 0;

for (const relPath of FILES) {
  const filePath = path.join(ROOT, relPath);
  console.log(`Reading ${relPath}...`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // The actual monsters are at index 9
  const monsters = Array.isArray(raw[9]) ? raw[9] : [];
  totalRaw += monsters.length;
  console.log(`  → ${monsters.length} monsters found`);

  for (const m of monsters) {
    if (!m || !m.name) continue;

    const text = stripHtml(m.full_text || '');
    const abilities = parseAbilities(text) || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const saves = parseSaves(text);
    const hp = parseHP(text);
    const ac = parseAC(text);
    const touchAc = parseTouchAC(text);
    const flatAc  = parseFlatFootedAC(text);
    const bab = parseBAB(text);
    const cr = parseCR(m.ch || m.challenge_rating);
    const size = parseSize(text);
    const monsterAttacks = parseMonsterAttacks(text);

    const slug = m.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const converted = {
      id: `${slug}-${totalConverted}`,
      name: m.name.trim(),
      system_id: 'dnd35',
      data: {
        str: abilities.str,
        dex: abilities.dex,
        con: abilities.con,
        int: abilities.int,
        wis: abilities.wis,
        cha: abilities.cha,
        hp_max: hp,
        ac,
        ...(touchAc !== null ? { touch_ac: touchAc } : {}),
        ...(flatAc  !== null ? { flat_footed_ac: flatAc } : {}),
        bab,
        fort: saves.fort,
        ref: saves.ref,
        will: saves.will,
        cr,
        size,
        type: (m.type || '').trim(),
        family: (m.family || '').trim(),
        alignment: (m.alignment || '').trim(),
        environment: (m.environment || '').trim(),
        classes: [],
        equipment: [],
        feats: [],
        skills: [],
        ...(monsterAttacks.length > 0 ? { monster_attacks: monsterAttacks } : {}),
        is_monster: true,
      },
    };

    allMonsters.push(converted);
    totalConverted++;
  }
}

allMonsters.sort((a, b) => a.name.localeCompare(b.name));

console.log(`\nTotal raw: ${totalRaw}`);
console.log(`Total converted: ${totalConverted}`);

if (!DRY) {
  const outPath = path.join(ROOT, 'data/dnd35/monsters.json');
  fs.writeFileSync(outPath, JSON.stringify(allMonsters, null, 2), 'utf8');
  console.log(`\nEscrito en ${outPath}`);
} else {
  console.log('\n[DRY RUN] Primeros 3 monstruos:');
  console.log(JSON.stringify(allMonsters.slice(0, 3), null, 2));
}
