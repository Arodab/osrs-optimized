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
    green: { xp: 186, inputs: [[1745, 3]], output: [1135, 1], w308: 4200 },
    blue: { xp: 210, inputs: [[2505, 3]], output: [2499, 1], w308: 5200 },
    red: { xp: 234, inputs: [[2507, 3]], output: [2501, 1], w308: 6300 },
    black: { xp: 258, inputs: [[2509, 3]], output: [2503, 1], w308: 7600 },
    'air bstaff': { xp: 137.5, inputs: [[573, 1], [1391, 1]], output: [1397, 1] },
    'fire bstaff': { xp: 125, inputs: [[569, 1], [1391, 1]], output: [1393, 1] },
  };
  const farming = {
    Papaya: { xp: 6218.4, inputs: [[5501, 1], [2114, 10]] },
    Palm: { xp: 10260.6, inputs: [[5502, 1]] },
    Magic: { xp: 13913.8, inputs: [[5374, 1]] },
  };
  const prayer = {
    Dragon: { xp: 504, inputs: [[536, 1]] },
    Hydra: { xp: 770, inputs: [[22786, 1]] },
    Dagganoth: { xp: 875, inputs: [[6729, 1]] },
    Superior: { xp: 1050, inputs: [[22124, 1]] },
    praygility: { xp: 585, inputs: [[25772, 3], [21880, 1], [566, 1]] },
  };
  // Keep the sheet's expected 3.15 doses and charge cost for amulet recipes.
  const potion = (xp, base, secondary, output, amulet = true) => ({
    xp, inputs: [[base, 1], [secondary, 1]], output: [output, amulet ? .7875 : .75], fee: amulet ? 9.92 : 0,
  });
  const herblore = {
    'Super restore': potion(142.5, 3004, 223, 3024),
    Ranging: potion(162.5, 109, 245, 2444),
    'Sara brew': potion(180, 3002, 6693, 6685),
    'Arma brew': potion(205, 31668, 31710, 31650, false),
    'Ext. Super antifire': { xp: 160, inputs: [[21978, 1], [11994, 4]], output: [22209, 1] },
    Remedy: potion(200, 109, 27272, 27202),
    Magic: potion(172.5, 2483, 3138, 3040),
    'Super combat': { xp: 150, inputs: [[2436, 1], [2440, 1], [2442, 1], [269, 1]], output: [12695, 1] },
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
  const recipes = { cons: construction, craft: crafting, farming, prayer, herblore };

  function price(quotes, id, side) {
    const amount = quotes?.[id]?.[side];
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
  }

  function afterTax(amount) {
    return amount - Math.min(Math.floor(amount / 50), 5000000);
  }

  function recipeValue(quotes, { inputs, output, fee = 0 }, fixedValue) {
    let materials = fee;
    for (const [id, quantity] of inputs) {
      const amount = price(quotes, id, 'high');
      if (amount === null) return null;
      materials += quantity * amount;
    }
    if (fixedValue !== undefined) return { materials, value: fixedValue };
    if (!output) return { materials, value: 0 };
    const [id, quantity] = output;
    const sale = price(quotes, id, 'low');
    return sale === null ? null : { materials, value: quantity * afterTax(sale) };
  }

  function balancePerXp(quotes, sheet, name, group, rate) {
    if (!quotes) return null;
    if (sheet === 'rc') {
      if (!Object.hasOwn(runecraft, name)) return null;
      const [id, quantity, basePrice, baseProfit] = runecraft[name];
      const sale = price(quotes, id, 'low');
      return sale === null ? null : (baseProfit + quantity * (afterTax(sale) - basePrice)) / rate;
    }
    const items = recipes[sheet];
    if (!items || !Object.hasOwn(items, name)) return null;
    const recipe = items[name];
    const totals = recipeValue(quotes, recipe, sheet === 'craft' && group === 0 ? recipe.w308 : undefined);
    return totals === null ? null : (totals.value - totals.materials) / recipe.xp;
  }

  function boatValue(quotes, group, tier, quantity) {
    if (!quotes) return null;
    const [plank, nails, planksUsed, nailsUsed, kit, hull] = wood[tier];
    const recipe = group === 'kits'
      ? { inputs: [[plank, planksUsed], [nails, nailsUsed], [1941, 5]], output: [kit, quantity] }
      : { inputs: [[plank, 5]], output: [hull, 1] };
    return recipeValue(quotes, recipe);
  }

  function flip(quotes, name) {
    if (!quotes || !Object.hasOwn(flipping, name)) return null;
    const [three, four] = flipping[name];
    const high3 = price(quotes, three, 'high');
    const low3 = price(quotes, three, 'low');
    const high4 = price(quotes, four, 'high');
    const low4 = price(quotes, four, 'low');
    if ([high3, low3, high4, low4].includes(null)) return null;
    return [high3, low3, high4, low4, 3 * afterTax(low4) - 4 * high3];
  }

  return { balancePerXp, boatValue, flip };
})();
