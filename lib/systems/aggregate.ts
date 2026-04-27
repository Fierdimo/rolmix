import {
  SystemDefinition,
  CharacterData,
  RollableAction,
  ClassGrant,
  ClassEntry,
  EquipmentItem,
  FeatItem,
  BonusEffect,
  BonusType,
  STACKING_BONUS_TYPES,
} from './types';

/**
 * Resuelve una pila de bonos sobre un mismo target aplicando las reglas
 * de D&D 3.5 / Pathfinder:
 *   - Bonos `dodge`, `circumstance` y sin tipo (`untyped`) siempre se apilan.
 *   - Para el resto de tipos, sólo el bono positivo MÁS ALTO de cada tipo
 *     cuenta; las penalizaciones (valores negativos) sí se acumulan.
 *   - El total final es la suma a través de todos los tipos.
 */
export function resolveBonusStack(effects: BonusEffect[]): number {
  if (!effects || effects.length === 0) return 0;
  const buckets: Record<string, BonusEffect[]> = {};
  for (const e of effects) {
    if (!e || typeof e.value !== 'number' || e.value === 0) continue;
    const t: BonusType = e.type ?? 'untyped';
    (buckets[t] ??= []).push(e);
  }
  let total = 0;
  for (const [type, list] of Object.entries(buckets)) {
    if (STACKING_BONUS_TYPES.has(type as BonusType)) {
      for (const e of list) total += e.value;
      continue;
    }
    // Mismo tipo no apila: el bono positivo más alto + todas las penalizaciones.
    let bestPositive = 0;
    for (const e of list) {
      if (e.value > 0) {
        if (e.value > bestPositive) bestPositive = e.value;
      } else {
        total += e.value;
      }
    }
    total += bestPositive;
  }
  return total;
}

/** Resuelve un mapa target -> lista de bonos a target -> total efectivo. */
function resolveStackMap(map: Record<string, BonusEffect[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, list] of Object.entries(map)) out[k] = resolveBonusStack(list);
  return out;
}

/** Combina varios mapas target -> BonusEffect[] en uno solo. */
function mergeStackMaps(
  ...maps: Array<Record<string, BonusEffect[]>>
): Record<string, BonusEffect[]> {
  const out: Record<string, BonusEffect[]> = {};
  for (const m of maps) {
    for (const [k, list] of Object.entries(m)) {
      (out[k] ??= []).push(...list);
    }
  }
  return out;
}

/**
 * Devuelve los grants acumulados de todas las clases del personaje.
 * Suma `statBonuses`, `actionBonuses` y concatena `features`.
 * Los bonos de clase se consideran sin tipo (apilan siempre).
 */
export function aggregateClassGrants(
  system: SystemDefinition,
  data: CharacterData,
): ClassGrant {
  const out: ClassGrant = { statBonuses: {}, actionBonuses: {}, features: [] };
  const entries: ClassEntry[] = Array.isArray(data.classes) ? data.classes : [];
  if (!system.classes) return out;

  for (const entry of entries) {
    const def = system.classes.find((c) => c.id === entry.classId);
    if (!def) continue;
    const grant = def.perLevel(Math.max(0, entry.level | 0));
    if (grant.statBonuses) {
      for (const [k, v] of Object.entries(grant.statBonuses)) {
        out.statBonuses![k] = (out.statBonuses![k] ?? 0) + v;
      }
    }
    if (grant.actionBonuses) {
      for (const [k, v] of Object.entries(grant.actionBonuses)) {
        out.actionBonuses![k] = (out.actionBonuses![k] ?? 0) + v;
      }
    }
    if (grant.features) out.features!.push(...grant.features.map((f) => `${def.name}: ${f}`));
  }
  return out;
}

/** Devuelve los bonos del equipo equipado agrupados por target (sin resolver apilamiento).
 *  Los ítems en slot 'weapon*' NO aportan bonos a attack_melee / attack_ranged en el pool
 *  general, porque el bono de mejora de un arma sólo aplica a los ataques con esa arma. */
export function aggregateEquipmentBonusList(data: CharacterData): Record<string, BonusEffect[]> {
  const out: Record<string, BonusEffect[]> = {};
  const items: EquipmentItem[] = Array.isArray(data.equipment) ? data.equipment : [];
  for (const it of items) {
    if (!it.equipped) continue;
    const isWeaponSlot = typeof it.slot === 'string' && it.slot.startsWith('weapon');
    for (const b of it.bonuses ?? []) {
      if (!b.target || typeof b.value !== 'number') continue;
      // Los bonos de ataque y daño de las armas no son generales
      if (isWeaponSlot && (b.target === 'attack_melee' || b.target === 'attack_ranged' || b.target === 'damage')) continue;
      (out[b.target] ??= []).push(b);
    }
  }
  return out;
}

/** Devuelve los bonos de las dotes activas agrupados por target (sin resolver apilamiento). */
export function aggregateFeatBonusList(data: CharacterData): Record<string, BonusEffect[]> {
  const out: Record<string, BonusEffect[]> = {};
  const feats: FeatItem[] = Array.isArray(data.feats) ? data.feats : [];
  for (const f of feats) {
    for (const b of f.bonuses ?? []) {
      if (!b.target || typeof b.value !== 'number') continue;
      (out[b.target] ??= []).push(b);
    }
  }
  return out;
}

/**
 * Versiones legacy que devuelven la suma directa por target (sin reglas de
 * apilamiento). Se mantienen para no romper consumidores externos pero el
 * pipeline interno usa el resolver con tipos.
 */
export function aggregateEquipmentBonuses(data: CharacterData): Record<string, number> {
  return resolveStackMap(aggregateEquipmentBonusList(data));
}
export function aggregateFeatBonuses(data: CharacterData): Record<string, number> {
  return resolveStackMap(aggregateFeatBonusList(data));
}

/** Stats finales = base + clases + (equipo + dotes resueltos con apilamiento). */
export function computeFinalStats(
  system: SystemDefinition,
  data: CharacterData,
): Record<string, number> {
  const base = system.computeStats(data);
  const cls = aggregateClassGrants(system, data).statBonuses ?? {};
  const stackMap = mergeStackMaps(
    aggregateEquipmentBonusList(data),
    aggregateFeatBonusList(data),
  );
  const resolved = resolveStackMap(stackMap);
  const merged: Record<string, number> = { ...base };
  for (const k of Object.keys(cls)) merged[k] = (merged[k] ?? 0) + cls[k];
  for (const k of Object.keys(resolved)) merged[k] = (merged[k] ?? 0) + resolved[k];
  return merged;
}

/** Acciones finales = base + bonos de clase y de equipo cuyo target coincida con el id.
 *  Además añade una acción por cada arma equipada, usando el modificador final
 *  de attack_melee / attack_ranged (que ya incluye BAB) más el bono del arma. */
export function computeFinalActions(
  system: SystemDefinition,
  data: CharacterData,
): RollableAction[] {
  const base = system.actions(data);
  const cls = aggregateClassGrants(system, data).actionBonuses ?? {};
  const stackMap = mergeStackMaps(
    aggregateEquipmentBonusList(data),
    aggregateFeatBonusList(data),
  );
  const resolved = resolveStackMap(stackMap);

  const actions: RollableAction[] = base.map((a) => {
    const extra = (cls[a.id] ?? 0) + (resolved[a.id] ?? 0);
    return extra ? { ...a, modifier: a.modifier + extra } : a;
  });

  // Modificadores de ataque final (ya incluyen BAB / bono de competencia)
  const meleeMod  = actions.find((a) => a.id === 'attack_melee')?.modifier  ?? 0;
  const rangedMod = actions.find((a) => a.id === 'attack_ranged')?.modifier ?? 0;

  // Una acción por cada arma equipada
  const weapons: EquipmentItem[] = Array.isArray(data.equipment)
    ? (data.equipment as EquipmentItem[]).filter(
        (it) => it.equipped && typeof it.slot === 'string' && it.slot.startsWith('weapon'),
      )
    : [];

  for (const weapon of weapons) {
    const bonuses = weapon.bonuses ?? [];
    const meleeBon  = resolveBonusStack(bonuses.filter((b) => b.target === 'attack_melee'));
    const rangedBon = resolveBonusStack(bonuses.filter((b) => b.target === 'attack_ranged'));
    // Si solo tiene bono de disparo (y no de melé) se trata como arma a distancia
    const isRanged = rangedBon > 0 && meleeBon === 0;
    const modifier = isRanged ? rangedMod + rangedBon : meleeMod + meleeBon;
    actions.push({
      id: `weapon_${weapon.id}`,
      label: weapon.name,
      group: 'Combate',
      die: 'd20',
      modifier,
    });
  }

  // Ordenar las habilidades alfabéticamente por label
  actions.sort((a, b) => {
    if (a.group === 'Habilidades' && b.group === 'Habilidades') {
      return a.label.localeCompare(b.label, 'es');
    }
    return 0;
  });

  return actions;
}

