import quotesSnapshot from './market-snapshot.json' with { type: 'json' };
import { materialCost } from './trade.js';

export const treeGroups = {
  tree: ['Regular trees', 'Árvores comuns'],
  fruit: ['Fruit trees', 'Árvores frutíferas'],
  hardwood: ['Hardwood trees', 'Árvores de madeira dura'],
  special: ['Special trees', 'Árvores especiais'],
};

export const protectionModes = {
  payment: { name: ['Pay gardener', 'Pagar jardineiro'] },
  super: { name: ['Supercompost', 'Supercomposto'], item: 6034, xp: 26 },
  ultra: { name: ['Ultracompost', 'Ultracomposto'], item: 21483, xp: 36 },
};

// Planting and health-check data from the OSRS Wiki Farming training and Seeds tables.
// XP/h uses active run time. The original sheet implies 5 regular or 6 fruit patches per 2.5-minute run.
const patchesPerRun = { tree: 5, fruit: 6, hardwood: 3, special: 1 };
const entries = {
  tree: [
    ['Oak', 15, 5370, 14, 467.3, 200, [5968, 1]],
    ['Willow', 30, 5371, 25, 1456.5, 240, [5386, 1]],
    ['Maple', 45, 5372, 45, 3403.4, 320, [5396, 1]],
    ['Yew', 60, 5373, 81, 7069.9, 400, [6016, 10]],
    ['Magic', 75, 5374, 145.5, 13768.3, 480, [5974, 25]],
  ],
  fruit: [
    ['Apple', 27, 5496, 22, 1199.5, 960, [5986, 9]],
    ['Banana', 33, 5497, 28, 1750.5, 960, [5386, 4]],
    ['Orange', 39, 5498, 35.5, 2470.2, 960, [5406, 3]],
    ['Curry', 42, 5499, 40, 2906.9, 960, [5416, 5]],
    ['Pineapple', 51, 5500, 57, 4605.7, 960, [5982, 10]],
    ['Papaya', 57, 5501, 72, 6146.4, 960, [2114, 10]],
    ['Palm', 68, 5502, 110.5, 10150.1, 960, [5972, 15]],
    ['Dragonfruit', 81, 22866, 140, 17335, 960, [5974, 15]],
  ],
  hardwood: [
    ['Teak', 35, 21477, 35, 7290, 4480, [225, 15]],
    ['Mahogany', 55, 21480, 63, 15720, 5120, [5998, 25]],
    ['Camphor', 66, 31502, 88, 17840, 5120, [239, 10]],
    ['Ironwood', 80, 31505, 145, 20380, 5120, [5970, 10]],
    ['Rosewood', 92, 31508, 252, 23100, 6400, [22929, 8]],
  ],
  special: [
    ['Calquat', 72, 5503, 129.5, 12096, 1280, [6018, 8]],
    ['Crystal', 74, null, 126, 13240, 480, null, 0],
    ['Spirit', 83, null, 199.5, 19301.8, 3840, [[4012, 5], [4014, 1]], 0],
    ['Celastrus', 85, 22856, 204, 14130, 800, [3138, 8]],
    ['Redwood', 90, 22859, 230, 22450, 6400, [22929, 6], 2000],
  ],
};

export const trees = Object.entries(entries).flatMap(([group, rows]) => rows.map(([
  name, level, sapling, plantXp, healthXp, growthMinutes, payment, removal = 200,
]) => ({
  id: `0:${name}`, name, group, level,
  tree: { name, group, sapling, plantXp, healthXp, growthMinutes, removal,
    payment: !payment ? [] : Array.isArray(payment[0]) ? payment : [payment] },
})));

// Disease probabilities per eligible growth cycle published on the Wiki.
const disease = { fruit: [4, 4, 2], Maple: [7, 3, 2], Magic: [11, 2, 1] };

export function treeGrowth(tree, protection) {
  const treated = protection !== 'payment';
  const profile = disease[tree.name] ?? disease[tree.group];
  const survival = !treated || tree.name === 'Crystal' ? 1
    : profile ? (1 - profile[protection === 'super' ? 1 : 2] / 128) ** profile[0] : null;
  const xp = tree.plantXp + (protectionModes[protection].xp ?? 0) + tree.healthXp * (survival ?? 1);
  return { survival, xp, rate: xp * patchesPerRun[tree.group] * 24 };
}

export function evaluateTree(tree, quotes, protection, trade) {
  const growth = treeGrowth(tree, protection);
  const mode = protectionModes[protection];
  const inputs = mode.item ? [[mode.item, 1]] : tree.payment;
  const prices = [
    tree.sapling ? [[tree.sapling, 1]] : [],
    inputs,
  ];
  const live = quotes && prices.map((items) => materialCost(quotes, items, trade));
  const wikiPriced = Boolean(live && live.every((cost) => cost !== null));
  const [sapling, protectionCost] = wikiPriced ? live : prices.map((items) => materialCost(quotesSnapshot, items, trade));
  const cost = sapling === null || protectionCost === null ? null : sapling + protectionCost + tree.removal * (growth.survival ?? 1);
  return { ...growth, protectionCost, netPerXp: cost === null ? null : -cost / growth.xp, wikiPriced };
}
