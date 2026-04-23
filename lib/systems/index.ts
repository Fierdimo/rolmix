import dnd5e from './dnd5e';
import dnd35 from './dnd35';
import pathfinder from './pathfinder';
import { SystemDefinition, CharacterData, RollableAction } from './types';

const REGISTRY: Record<string, SystemDefinition> = {
  [dnd5e.id]: dnd5e,
  [dnd35.id]: dnd35,
  [pathfinder.id]: pathfinder,
};

export function getSystem(id: string | null | undefined): SystemDefinition | null {
  if (!id) return null;
  return REGISTRY[id] ?? null;
}

export function listSystems(): SystemDefinition[] {
  return Object.values(REGISTRY);
}

/**
 * Tira un dado del estilo "d20", "d6", "1d8", "2d6".
 * Devuelve la suma del lanzamiento (sin modificador).
 */
export function rollDie(die: string): number {
  const m = die.trim().toLowerCase().match(/^(\d*)d(\d+)$/);
  if (!m) return 0;
  const count = m[1] === '' ? 1 : Math.max(1, parseInt(m[1], 10));
  const sides = Math.max(2, parseInt(m[2], 10));
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

/** Resultado completo de un lanzamiento dirigido. */
export interface ResolvedRoll {
  die: string;
  result: number;
  modifier: number;
  total: number;
}

export function resolveAction(action: RollableAction): ResolvedRoll {
  const result = rollDie(action.die);
  return {
    die: action.die,
    result,
    modifier: action.modifier,
    total: result + action.modifier,
  };
}

export {
  computeFinalStats,
  computeFinalActions,
  aggregateClassGrants,
  aggregateEquipmentBonuses,
} from './aggregate';
export { resolveBonusStack } from './aggregate';

export type { SystemDefinition, CharacterData, RollableAction };
