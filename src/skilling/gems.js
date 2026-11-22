import snapshot from './market-snapshot.json';
import { afterTax, buyPrice, sellPrice } from './trade.js';

// Chisel cutting at 2,700 attempts/h. Semi-precious gems use the Wiki's 1–99 success curve.
const gems = [
  ['Opal', 1, 1625, 1609, 15, [3.8, 129, 251]],
  ['Jade', 13, 1627, 1611, 20, [5, 101, 246]],
  ['Red topaz', 16, 1629, 1613, 25, [6.3, 91, 241]],
  ['Sapphire', 20, 1623, 1607, 50],
  ['Emerald', 27, 1621, 1605, 67.5],
  ['Ruby', 34, 1619, 1603, 85],
  ['Diamond', 43, 1617, 1601, 107.5],
  ['Dragonstone', 55, 1631, 1615, 137.5],
  ['Onyx', 67, 6571, 6573, 167.5],
  ['Zenyte', 89, 19496, 19493, 200],
];

export const cuttingMethods = gems.map(([name, level, input, output, xp, crush]) => ({
  id: `gem:${name}`, name: `Cut ${name.toLowerCase()}`, level, gem: { input, output, xp, crush },
}));

export function gemGrowth(method, skillLevel) {
  const { xp, crush } = method.gem;
  const level = Math.max(method.level, skillLevel ?? method.level);
  const success = crush ? Math.round(crush[1] + (crush[2] - crush[1]) * (level - 1) / 98) / 256 : 1;
  const expectedXp = xp * success + (crush?.[0] ?? 0) * (1 - success);
  return { success, expectedXp, rate: expectedXp * 2700 };
}

export function evaluateGem(method, skillLevel, quotes, trade, customSale) {
  const { input, output } = method.gem;
  const growth = gemGrowth(method, skillLevel);
  function values(source) {
    const materials = buyPrice(source, input, trade);
    const sale = customSale ?? sellPrice(source, output, trade);
    if (materials === null || sale === null) return null;
    return { materials, value: (customSale ?? afterTax(sale, output)) * growth.success };
  }
  const live = quotes && values(quotes);
  const estimate = live ?? values(snapshot);
  return { ...growth, wikiPriced: Boolean(live),
    netPerXp: estimate ? (estimate.value - estimate.materials) / growth.expectedXp : null };
}
