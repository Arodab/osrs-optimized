import { afterTax, buyPrice, materialCost, sellPrice } from './trade.js';
import currentQuotes from './market-snapshot.json';

// Standard potion estimates use 3.15 doses per mix and the sheet's 9.92 GP amulet charge.
const potion = (xp, base, secondary, output, amulet = true) => ({
  xp, inputs: [[base, 1], [secondary, 1]], output: [output, amulet ? .7875 : .75], fee: amulet ? 9.92 : 0,
});

export const additionalPotions = {
  Attack: { level: 3, ...potion(25, 91, 221, 2428) },
  Strength: { level: 12, ...potion(50, 95, 225, 113) },
  Restore: { level: 22, ...potion(62.5, 97, 223, 2430) },
  Energy: { level: 26, ...potion(67.5, 97, 1975, 3008) },
  'Super attack': { level: 45, ...potion(100, 101, 221, 2436) },
  'Super energy': { level: 52, ...potion(117.5, 103, 2970, 3016) },
  'Super strength': { level: 55, ...potion(125, 105, 225, 2440) },
  'Super defence': { level: 66, ...potion(150, 107, 239, 2442) },
  Antifire: { level: 69, ...potion(157.5, 2483, 241, 2452) },
  Stamina: { level: 77, xp: 102, mixesPerHour: 2750, inputs: [[3016, 1], [12640, 4]], output: [12625, 1] },
  'Super antifire': { level: 92, xp: 130, inputs: [[2452, 1], [21975, 1]], output: [21978, 1] },
  'Super combat': { level: 90, xp: 150, mixesPerHour: 2100, inputs: [[2436, 1], [2440, 1], [2442, 1], [269, 1]],
    output: [12695, 1], byproducts: [[229, 2]] },
};

// Wiki GE snapshot from 2026-11-21. The refresh button replaces these estimates.
export const additionalPotionQuotes = {
  91: { high: 524 }, 221: { high: 5 }, 2428: { low: 9 },
  95: { high: 404 }, 225: { high: 157 }, 113: { low: 106 },
  97: { high: 424 }, 223: { high: 144 }, 2430: { low: 63 },
  1975: { high: 49 }, 3008: { low: 113 },
  101: { high: 1535 }, 2436: { low: 1450 },
  103: { high: 1837 }, 2970: { high: 116 }, 3016: { high: 1618, low: 1610 },
  105: { high: 2534 }, 2440: { low: 3066 },
  107: { high: 2233 }, 239: { high: 815 }, 2442: { low: 3335 },
  2483: { high: 1400 }, 241: { high: 70 }, 2452: { high: 645, low: 641 },
  12640: { high: 403 }, 12625: { low: 2315 },
  21975: { high: 20590 }, 21978: { low: 18357 },
  ...currentQuotes,
};

export default (() => {
  // Plank, nails, quantities per kit batch, and tradeable outputs by wood tier.
  const wood = [
    [960, 4819, 2, 10, 31964, 32041],
    [8778, 4820, 2, 10, 31967, 32044],
    [8780, 1539, 2, 10, 31970, 32047],
    [8782, 4822, 2, 10, 31973, 32050],
    [31432, 4823, 2, 10, 31976, 32053],
    [31435, 4824, 1, 10, 31979, 32056],
    [31438, 31406, 1, 5, 31982, 32059],
  ];
  const construction = {
    'oak door': { xp: 60, inputs: [[8778, 1]], fee: 60 * 1.04 },
    'mahog tables': { xp: 140, inputs: [[8782, 1]], fee: 140 * .37 },
    benches: { xp: 140, inputs: [[8782, 1]], fee: 140 * .37 },
    'mahog homes': { xp: 385, inputs: [[8782, 1], [2353, .5 / 12.7]] },
  };
  const crafting = {
    green: { xp: 186, inputs: [[1745, 3]], output: [1135, 1] },
    blue: { xp: 210, inputs: [[2505, 3]], output: [2499, 1] },
    red: { xp: 234, inputs: [[2507, 3]], output: [2501, 1] },
    black: { xp: 258, inputs: [[2509, 3]], output: [2503, 1] },
    'air bstaff': { xp: 137.5, inputs: [[573, 1], [1391, 1]], output: [1397, 1] },
    'fire bstaff': { xp: 125, inputs: [[569, 1], [1391, 1]], output: [1393, 1] },
  };
  const prayer = {
    Dragon: { xp: 504, inputs: [[536, 1]] },
    Hydra: { xp: 770, inputs: [[22786, 1]] },
    Dagganoth: { xp: 875, inputs: [[6729, 1]] },
    Superior: { xp: 1050, inputs: [[22124, 1]] },
    praygility: { xp: 585, inputs: [[25772, 3], [21880, 1], [566, 1]] },
  };
  const herblore = {
    ...additionalPotions,
    'Super restore': potion(142.5, 3004, 223, 3024),
    Ranging: potion(162.5, 109, 245, 2444),
    'Sara brew': potion(180, 3002, 6693, 6685),
    'Arma brew': potion(205, 31668, 31710, 31650, false),
    'Ext. Super antifire': { xp: 160, inputs: [[21978, 1], [11994, 4]], output: [22209, 1] },
    Remedy: potion(200, 109, 27272, 27202),
    Magic: potion(172.5, 2483, 3138, 3040),
    Prayer: potion(87.5, 99, 231, 2434),
    'Prayer regen': potion(132, 30100, 29993, 30125),
    Goading: potion(132, 97, 29993, 30137),
  };
  // Keep the spreadsheet's non-rune revenue and costs fixed when repricing output.
  const runecraft = {
    blood: [565, 1550, 331, 903000],
    soul: [566, 1550, 287, 711800],
    'solo muds': [4698, 11000, 115, 2024000],
    Nats: [561, 8500, 170, 4577800],
  };
  const flipping = { 'Super restore': [3026, 3024], 'Sara brew': [6687, 6685], Prayer: [139, 2434] };
  const recipes = { cons: construction, craft: crafting, prayer, herblore };

  function recipeValue(quotes, { inputs, output, byproducts = [], fee = 0 }, trade, fixedValue) {
    const cost = materialCost(quotes, inputs, trade);
    if (cost === null) return null;
    const materials = cost + fee;
    if (fixedValue !== undefined) return { materials, value: fixedValue };
    let value = 0;
    for (const [id, quantity] of output ? [output, ...byproducts] : byproducts) {
      const sale = sellPrice(quotes, id, trade);
      if (sale === null) return null;
      value += quantity * afterTax(sale, id);
    }
    return { materials, value };
  }

  function balancePerXp(quotes, sheet, name, group, rate, trade, customSale) {
    if (!quotes) return null;
    if (sheet === 'rc') {
      if (!Object.hasOwn(runecraft, name)) return null;
      const [id, quantity, basePrice, baseProfit] = runecraft[name];
      const sale = sellPrice(quotes, id, trade);
      return sale === null ? null : (baseProfit + quantity * (afterTax(sale, id) - basePrice)) / rate;
    }
    const items = recipes[sheet];
    if (!items || !Object.hasOwn(items, name)) return null;
    const recipe = items[name];
    const totals = recipeValue(quotes, recipe, trade, sheet === 'craft' && group === 1 ? customSale : undefined);
    return totals === null ? null : (totals.value - totals.materials) / recipe.xp;
  }

  function boatValue(quotes, group, tier, quantity, trade) {
    if (!quotes) return null;
    const [plank, nails, planksUsed, nailsUsed, kit, hull] = wood[tier];
    const recipe = group === 'kits'
      ? { inputs: [[plank, planksUsed], [nails, nailsUsed], [1941, 5]], output: [kit, quantity] }
      : { inputs: [[plank, 5]], output: [hull, 1] };
    return recipeValue(quotes, recipe, trade);
  }

  function flip(quotes, name, trade) {
    if (!quotes || !Object.hasOwn(flipping, name)) return null;
    const [three, four] = flipping[name];
    const buy3 = buyPrice(quotes, three, trade);
    const sell3 = sellPrice(quotes, three, trade);
    const buy4 = buyPrice(quotes, four, trade);
    const sell4 = sellPrice(quotes, four, trade);
    if ([buy3, sell3, buy4, sell4].includes(null)) return null;
    return [buy3, sell3, buy4, sell4, 3 * afterTax(sell4, four) - 4 * buy3];
  }

  function fossilSupplyPair(quotes, trade) {
    return materialCost(quotes, [[21543, 1], [21545, 1]], trade) ?? 188;
  }

  return { balancePerXp, boatValue, flip, fossilSupplyPair };
})();
