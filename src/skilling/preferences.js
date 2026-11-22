import { defaultAgility } from './praygility.js';
import { protectionModes } from './trees.js';

const storageKey = 'skilling-methods.preferences.v1';

export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) return saved;
  } catch {
    // The planner still works when storage is blocked or cleared.
  }
  return {};
}

export function skillPreferences(book, skill) {
  const saved = book[skill] ?? {};
  const custom = (Array.isArray(saved.custom) ? saved.custom : []).filter((method) => method
    && typeof method.id === 'string' && method.id.startsWith('custom:')
    && typeof method.name === 'string' && Number.isFinite(method.rate) && method.rate > 0
    && Number.isFinite(method.balancePerXp) && Number.isInteger(method.level) && method.level >= 1 && method.level <= 99);
  return book[skill] = {
    custom, overrides: saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {},
    top: saved.top === true, topCount: Number.isInteger(saved.topCount) && saved.topCount > 0 && saved.topCount <= 999 ? saved.topCount : 5,
    counts: Array.from({ length: 4 }, (_, index) => Math.max(0, Math.min(1000000, Math.floor(Number(saved.counts?.[index]) || 0)))),
    benchmark: typeof saved.benchmark === 'string' ? saved.benchmark : '',
    ...(skill === 'farming' ? { protection: Object.hasOwn(protectionModes, saved.protection) ? saved.protection : 'payment' } : {}),
    ...(skill === 'prayer' ? { agility: {
      combined: Number.isFinite(saved.agility?.combined) && saved.agility.combined >= 0 ? saved.agility.combined : defaultAgility.combined,
      alternative: Number.isFinite(saved.agility?.alternative) && saved.agility.alternative > 0 ? saved.agility.alternative : defaultAgility.alternative,
      magicLevel: Number.isInteger(saved.agility?.magicLevel) && saved.agility.magicLevel >= 1 && saved.agility.magicLevel <= 99 ? saved.agility.magicLevel : null,
    } } : {}),
  };
}

export function savePreferences(book) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(book));
  } catch {
    // Changes remain available in memory for the active planner.
  }
}
