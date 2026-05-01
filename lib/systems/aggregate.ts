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
  MonsterAttack,
  SpellEntry,
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

  // Calcular CA de toque y desprevenido para PJs (los monstruos las traen precalculadas
  // en data y ya están en `merged` vía computeStats).
  if (!('touch_ac' in merged) || !('flat_footed_ac' in merged)) {
    // Bonos del equipo/dotes tipados que van a 'ac'
    const acBonusList: BonusEffect[] = stackMap['ac'] ?? [];
    // No-toque: armadura, escudo y armadura natural no aplican a CA de toque
    const NON_TOUCH: ReadonlySet<string> = new Set(['armor', 'shield', 'natural']);
    const nonTouchTotal = resolveBonusStack(acBonusList.filter((b) => NON_TOUCH.has(b.type ?? '')));
    // Esquiva no aplica a desprevenido
    const dodgeTotal = resolveBonusStack(acBonusList.filter((b) => b.type === 'dodge'));
    const baseAc = merged['ac'] ?? 10;
    const dexMod = merged['mod_dex'] ?? 0;
    if (!('touch_ac' in merged)) {
      // Para PJs el campo 'ac' es la base sin DEX; la CA normal y la de toque suman el modificador de DES.
      merged['ac'] = baseAc + dexMod;
      merged['touch_ac'] = baseAc - nonTouchTotal + dexMod;
    }
    if (!('flat_footed_ac' in merged)) {
      // Desprevenido = base + equipo - esquiva (DEX no se aplica al desprevenido)
      merged['flat_footed_ac'] = baseAc - dodgeTotal;
    }
  }

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
  const grants = aggregateClassGrants(system, data);
  const cls = grants.actionBonuses ?? {};
  // BAB acumulado de todas las clases (necesario para ataques iterativos D&D 3.5/PF)
  const bab = grants.statBonuses?.bab ?? 0;
  const stackMap = mergeStackMaps(
    aggregateEquipmentBonusList(data),
    aggregateFeatBonusList(data),
  );
  const resolved = resolveStackMap(stackMap);

  // Paso 1: aplicar bonos de clase + equipo/dotes a las acciones base
  const baseActions: RollableAction[] = base.map((a) => {
    const extra = (cls[a.id] ?? 0) + (resolved[a.id] ?? 0);
    return extra ? { ...a, modifier: a.modifier + extra } : a;
  });

  // Paso 2: añadir ataques iterativos a acciones de ataque base (BAB >= 6)
  const actions: RollableAction[] = baseActions.map((a) => {
    if (a.id !== 'attack_melee' && a.id !== 'attack_ranged') return a;
    const extra: number[] = [];
    for (let p = 5; bab - p > 0; p += 5) extra.push(a.modifier - p);
    return extra.length > 0 ? { ...a, extraAttacks: extra } : a;
  });

  // Paso 3: una acción por cada arma equipada (con sus propios ataques iterativos)
  const meleeMod  = actions.find((a) => a.id === 'attack_melee')?.modifier  ?? 0;
  const rangedMod = actions.find((a) => a.id === 'attack_ranged')?.modifier ?? 0;

  const weapons: EquipmentItem[] = Array.isArray(data.equipment)
    ? (data.equipment as EquipmentItem[]).filter(
        (it) => it.equipped && typeof it.slot === 'string' && it.slot.startsWith('weapon'),
      )
    : [];

  for (const weapon of weapons) {
    const bonuses = weapon.bonuses ?? [];
    const meleeBon  = resolveBonusStack(bonuses.filter((b) => b.target === 'attack_melee'));
    const rangedBon = resolveBonusStack(bonuses.filter((b) => b.target === 'attack_ranged'));
    const damageBon = resolveBonusStack(bonuses.filter((b) => b.target === 'damage'));
    const isRanged  = rangedBon > 0 && meleeBon === 0;
    const modifier  = isRanged ? rangedMod + rangedBon : meleeMod + meleeBon;
    const strMod = isRanged ? 0 : (actions.find((a) => a.id === 'attack_melee')?.modifier ?? 0) - bab;
    const damageMod = strMod + damageBon;

    // damageDie: campo explícito o extracción del campo notes (fallback para armas ya guardadas)
    const damageDie: string | undefined =
      weapon.damageDie ||
      (String(weapon.notes ?? '').match(/(\d+d\d+)/i)?.[1] ?? undefined);

    const extra: number[] = [];
    for (let p = 5; bab - p > 0; p += 5) extra.push(modifier - p);

    actions.push({
      id: `weapon_${weapon.id}`,
      label: weapon.name,
      group: 'Combate',
      die: 'd20',
      modifier,
      ...(extra.length > 0 ? { extraAttacks: extra } : {}),
      ...(damageDie ? { damageDie, damageMod } : {}),
    });
  }

  // Ordenar las habilidades alfabéticamente por label
  actions.sort((a, b) => {
    if (a.group === 'Habilidades' && b.group === 'Habilidades') {
      return a.label.localeCompare(b.label, 'es');
    }
    return 0;
  });

  // Paso 4: ataques de monstruo (monster_attacks) → acciones directas con bonos absolutos
  // Se añaden ANTES de devolver para que aparezcan en la sección Combate.
  const monsterAttacks: MonsterAttack[] = Array.isArray(data.monster_attacks)
    ? (data.monster_attacks as MonsterAttack[])
    : [];
  for (let i = 0; i < monsterAttacks.length; i++) {
    const atk = monsterAttacks[i];
    if (!atk || typeof atk.bonus !== 'number') continue;
    const extra: number[] = Array.isArray(atk.extra_attacks) ? atk.extra_attacks : [];
    actions.unshift({
      id: `monster_atk_${i}`,
      label: atk.name,
      group: 'Combate',
      die: 'd20',
      modifier: atk.bonus,
      ...(extra.length > 0 ? { extraAttacks: extra } : {}),
      damageDie: atk.damage_die,
      damageMod: atk.damage_mod ?? 0,
    });
  }

  // Paso 5: conjuros/habilidades sortilegas con tirada de ataque o salvación.
  // Solo se generan acciones para conjuros que tengan attack_type o save_type.
  const spells: SpellEntry[] = Array.isArray(data.spells)
    ? (data.spells as SpellEntry[])
    : [];
  const spellSaveDCMod = system.spellSaveDCMod ? system.spellSaveDCMod(data) : 0;

  for (const sp of spells) {
    const hasAttack = sp.attack_type && sp.attack_type !== 'none';
    const hasSave = !!sp.save_type;
    if (!hasAttack && !hasSave) continue;

    let modifier = 0;
    let attackTarget: RollableAction['attackTarget'] = undefined;

    if (hasAttack) {
      if (sp.attack_type === 'melee_touch') {
        modifier = meleeMod;    // BAB + STR (ya calculado con bonos de clase/equipo)
        attackTarget = 'touch_ac';
      } else if (sp.attack_type === 'ranged_touch') {
        modifier = rangedMod;   // BAB + DEX
        attackTarget = 'touch_ac';
      } else if (sp.attack_type === 'ranged') {
        modifier = rangedMod;
        attackTarget = 'ac';
      }
    }

    const saveDC = sp.save_dc_override != null
      ? sp.save_dc_override
      : hasSave
        ? 10 + sp.level + spellSaveDCMod
        : undefined;

    actions.push({
      id: `spell_${sp.id}`,
      label: sp.name,
      group: 'Conjuros',
      die: 'd20',
      modifier,
      ...(sp.damage_die ? { damageDie: sp.damage_die, damageMod: 0 } : {}),
      ...(attackTarget ? { attackTarget } : {}),
      ...(saveDC != null ? { saveDC } : {}),
      ...(sp.save_type ? { saveType: sp.save_type } : {}),
      ...(sp.effect_label ? { effectLabel: sp.effect_label } : {}),
    });
  }

  return actions;
}

