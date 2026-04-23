// Importa el listado completo de conjuros del PHB 3.5 desde
// zellfaze-zz/dnd-generator y lo convierte a nuestro esquema CatalogSpell.
//
// Uso (desde la raíz del repo):
//   node scripts/import-phb-spells.mjs
//
// Salida: data/dnd35/spells.json (sobrescribe).
//
// Mapeo:
//  - "Sorcerer/Wizard" -> classes ['wizard'] (también aplica a sorcerer si existiera)
//  - "Cleric"          -> ['cleric']
//  - "Druid"           -> ['druid']
//  - "Bard"            -> ['bard']
//  - "Paladin"         -> ['paladin']
//  - "Ranger"          -> ['ranger']
//
// Si un conjuro aparece en varias listas, se deduplica por nombre,
// el `level` final es el mínimo entre las clases que lo aprenden y
// `classes` lista todas. La fuente sigue siendo OGL (PHB 3.5).

import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/zellfaze-zz/dnd-generator/master/data/phb/spell_list.json';
const OUT_PATH = path.resolve('data/dnd35/spells.json');

const CLASS_MAP = {
  'Sorcerer/Wizard': ['wizard'],
  'Cleric': ['cleric'],
  'Druid': ['druid'],
  'Bard': ['bard'],
  'Paladin': ['paladin'],
  'Ranger': ['ranger'],
};

function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log(`→ descargando ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();

  /** @type {Map<string, { id:string, name:string, level:number, classes:Set<string> }>} */
  const byId = new Map();

  for (const block of raw) {
    const source = block.Source;
    const classes = CLASS_MAP[source];
    if (!classes) continue; // entradas vacías o no soportadas

    for (let lvl = 0; lvl <= 9; lvl++) {
      const list = block[`Level ${lvl}`];
      if (!Array.isArray(list)) continue;
      for (const rawName of list) {
        const name = String(rawName).trim();
        if (!name) continue;
        const id = slug(name);
        if (!id) continue;
        // Dedup por id (slug) para fusionar duplicados que sólo difieren
        // en mayúsculas/minúsculas (p.ej. "Symbol of pain" vs "Symbol of Pain").
        const existing = byId.get(id);
        if (existing) {
          existing.level = Math.min(existing.level, lvl);
          for (const c of classes) existing.classes.add(c);
          // Preferir el nombre con capitalización título (más mayúsculas).
          const upper = (s) => (s.match(/[A-Z]/g) || []).length;
          if (upper(name) > upper(existing.name)) existing.name = name;
        } else {
          byId.set(id, {
            id,
            name,
            level: lvl,
            classes: new Set(classes),
          });
        }
      }
    }
  }

  const out = [...byId.values()]
    .map((s) => ({
      id: s.id,
      name: s.name,
      level: s.level,
      classes: [...s.classes].sort(),
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ escritos ${out.length} conjuros en ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
