import sheets from './sheets.json';
import market, { additionalPotions, additionalPotionQuotes } from './market.js';
import { effectivePrayerRate } from './praygility.js';
import { evaluateTree, treeGrowth, trees } from './trees.js';
import { cuttingMethods, evaluateGem, gemGrowth } from './gems.js';

const requirements = {
  cons: { 'oak door': 74, 'mahog tables': 52, benches: 77, 'mahog homes': 70 },
  craft: { green: 63, blue: 71, red: 77, black: 84, 'air bstaff': 66, 'fire bstaff': 62 },
  herblore: {
    'Super restore': 63, Ranging: 72, 'Sara brew': 81, 'Arma brew': 89, 'Ext. Super antifire': 98,
    Remedy: 88, Magic: 76, Prayer: 38, 'Prayer regen': 58, Goading: 54,
  },
  prayer: { Dragon: 1, Hydra: 1, Dagganoth: 1, Superior: 70, praygility: 84 },
  rc: { blood: 77, soul: 90, GotR: 27, 'solo lava': 23, '4 runners': 23, 'solo muds': 13, Nats: 44 },
};

const displayNames = {
  cons: { 'oak door': 'Oak dungeon doors', 'mahog tables': 'Mahogany tables', benches: 'Gnome benches', 'mahog homes': 'Mahogany Homes' },
  craft: { green: "Green d'hide bodies", blue: "Blue d'hide bodies", red: "Red d'hide bodies", black: "Black d'hide bodies",
    'air bstaff': 'Air battlestaves', 'fire bstaff': 'Fire battlestaves' },
  herblore: { Ranging: 'Ranging potion', 'Sara brew': 'Saradomin brew', 'Arma brew': 'Armadyl brew',
    'Ext. Super antifire': 'Extended super antifire', Remedy: 'Menaphite remedy', Magic: 'Magic potion',
    'Super combat': 'Super combat potion', Prayer: 'Prayer potion', 'Prayer regen': 'Prayer regeneration potion', Goading: 'Goading potion' },
  prayer: { Dragon: 'Dragon bones', Hydra: 'Hydra bones', Dagganoth: 'Dagannoth bones', Superior: 'Superior dragon bones', praygility: 'Praygility' },
  rc: { blood: 'Blood runes', soul: 'Soul runes', GotR: 'Guardians of the Rift', 'solo lava': 'Solo lava runes',
    '4 runners': 'Lava runes with 4 runners', 'solo muds': 'Solo mud runes', Nats: 'Nature runes' },
};

export const maxXp = 200000000;

export function catalog(skill, boats, protection = 'payment') {
  if (skill === 'farming') return trees.map((method) => ({ ...method, rate: treeGrowth(method.tree, protection).rate }));
  const levels = requirements[skill];
  const rows = sheets[skill].methods.filter(([name, , , , , , group]) => Object.hasOwn(levels, name) && (skill !== 'craft' || group === 1));
  const methods = rows.map(([name, rate, training, earn, total, cost, group]) => ({
    id: `${group}:${name}`, name: displayNames[skill]?.[name] ?? name, recipeName: name, rate, group: skill === 'cons' ? 'sheet' : group,
    level: levels[name], magic: name === 'praygility',
    recipeSnapshot: skill === 'craft',
    snapshot: { training, earn, total, cost, group },
  }));
  if (skill === 'cons') {
    methods.push(...boats.map((boat) => ({ ...boat, id: `${boat.group}:${boat.name}`, boat: true })));
  }
  if (skill === 'craft') {
    methods.push(...cuttingMethods.map((method) => ({ ...method, rate: gemGrowth(method).rate })));
  }
  if (skill === 'herblore') {
    methods.push(...Object.entries(additionalPotions).map(([name, recipe]) => ({
      id: `${name === 'Super combat' ? '0' : 'recipe'}:${name}`, name: displayNames.herblore[name] ?? name,
      recipeName: name, level: recipe.level, group: 0, recipeSnapshot: true,
      rate: recipe.xp * (recipe.mixesPerHour ?? 2500),
      balancePerXp: market.balancePerXp(additionalPotionQuotes, skill, name, 0, 1),
    })));
  }
  return methods;
}

export function evaluateMethod(method, skill, settings, quotes, plan, override, customSale) {
  const { remaining, gp, valid, agility, trade, skillLevel, protection = 'payment' } = plan;
  const tree = method.tree ? evaluateTree(method.tree, quotes, protection, trade) : null;
  const gem = method.gem ? evaluateGem(method, skillLevel, quotes, trade, customSale) : null;
  const recipeName = method.recipeName ?? method.name;
  const baselineRate = override ?? tree?.rate ?? gem?.rate ?? method.rate;
  const rate = skill === 'prayer' && method.magic && agility ? effectivePrayerRate(baselineRate, agility) : baselineRate;
  const ratio = remaining / (settings[1] - settings[0]);
  const practice = valid ? method.snapshot && rate === method.rate ? method.snapshot.training * ratio : remaining / rate : null;
  const boatQuote = method.boat ? market.boatValue(quotes, method.group, method.tier, method.quantity, trade) : null;
  const quote = method.boat
    ? boatQuote && (boatQuote.value - boatQuote.materials) / method.xp
    : method.custom || tree || gem ? null : market.balancePerXp(quotes, skill, recipeName, method.snapshot?.group ?? 0, method.rate, trade, customSale);

  if (method.snapshot && quote === null && !method.recipeSnapshot) {
    const { earn, total, cost, training } = method.snapshot;
    const gpRatio = settings[2] / gp;
    return { ...method, rate, practice, wikiPriced: false,
      gpHours: valid && earn !== null ? earn * ratio * gpRatio : null,
      combined: valid ? practice + (total - training + (earn ?? 0) * (gpRatio - 1)) * ratio : null,
      balance: valid && cost !== null ? -cost * ratio : null,
      netPerXp: cost === null ? null : -cost * 1000000 / (settings[1] - settings[0]),
    };
  }

  const snapshot = method.recipeSnapshot
    ? market.balancePerXp(additionalPotionQuotes, skill, recipeName, method.snapshot?.group ?? 0, method.rate, trade, customSale) : null;
  const netPerXp = tree?.netPerXp ?? gem?.netPerXp ?? quote ?? snapshot ?? method.balancePerXp ?? null;
  const balance = valid && netPerXp !== null ? netPerXp * remaining / 1000000 : null;
  const gpHours = balance === null ? null : -balance / gp;
  return { ...method, rate, practice, balance, gpHours, netPerXp, treeEstimate: tree, wikiPriced: (tree ?? gem)?.wikiPriced ?? (quote !== null),
    combined: practice === null || gpHours === null ? null : practice + gpHours,
  };
}

export function levelFromXp(xp) {
  return sheets.xp.rows.findLast(([, threshold]) => threshold <= xp)?.[0] ?? 1;
}

export function methodAccess(method, skillLevel, magicLevel) {
  const level = method.magic ? magicLevel : skillLevel;
  if (level == null) return 'unknown';
  return level < method.level ? 'locked' : 'unlocked';
}
