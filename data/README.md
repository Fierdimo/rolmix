# Catálogos locales

Este directorio contiene **datos de juego** (conjuros, equipo, dotes…) en
JSON, agrupados por sistema y empaquetados en la app. Todo es offline:
no hay llamadas de red en runtime.

## Estructura

```
data/
  dnd35/
    spells.json         # 600+ conjuros (importer)
    equipment.json      # equipo curado a mano (armas/armaduras con bonos)
    mundane-items.json  # objetos mundanos del PHB (importer)
    magic-items.json    # objetos mágicos del PHB (importer, upstream casi vacío)
    feats.json          # 100+ dotes (importer)
    races.json          # razas del PHB (importer)
    skills.json         # habilidades del PHB (importer)
    classes.json        # clases base con BAB/saves/habilidades por nivel (importer)
    languages.json      # idiomas (importer)
  dnd5e/
    spells.json
    equipment.json
  pathfinder/
    spells.json
    equipment.json
```

Cada archivo es un array. Los esquemas viven en
[`lib/catalog/types.ts`](../lib/catalog/types.ts):

- `CatalogSpell`, `CatalogEquipment`, `CatalogFeat`
- `CatalogRace`, `CatalogSkill`, `CatalogClass`
- `CatalogMagicItem`, `CatalogLanguage`

## Cómo extender

1. **Añadir entradas a un sistema existente**: edita el JSON correspondiente
   y añade nuevos objetos respetando el esquema. Mantén `id` único (slug).

2. **Importar de un repositorio externo** (p.ej.
   <https://github.com/zellfaze-zz/dnd-generator/tree/master/data/phb>):
   - Para todo el contenido del PHB 3.5 (dotes, razas, habilidades,
     clases, idiomas, objetos) hay un orquestador:
     ```sh
     node scripts/import-phb-all.mjs
     ```
     Descarga `feats.json`, `races.json`, `skills.json`, `classes.json`,
     `languages.json`, `magic_items.json` y `mundane_items.json` upstream
     y los vuelca en `data/dnd35/*.json` con el esquema `Catalog*`.
   - Para los conjuros (lista completa, 600+):
     ```sh
     node scripts/import-phb-spells.mjs
     ```
   - Para otros recursos: descarga el JSON original, mapea sus campos al
     esquema correspondiente y escribe un script `scripts/import-<source>.mjs`
     análogo.
   - **Respeta la licencia** del repo origen (OGL para 3.5/PF; revisa
     antes de importar contenido 5e).

3. **Añadir un sistema nuevo**:
   - Crea `data/<nuevoSistema>/`.
   - Añade los `import` y la entrada en `CATALOGS` dentro de
     [`lib/catalog/index.ts`](../lib/catalog/index.ts).

## Cómo se usa

El editor de personajes lee el catálogo del sistema actual con
`getCatalog(systemId)` y abre pickers para añadir conjuros / equipo desde
las listas. El usuario siempre puede crear entradas manuales también.
