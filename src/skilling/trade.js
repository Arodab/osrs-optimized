export const defaultTrade = { buy: 'instant', sell: 'instant' };

function price(quotes, id, side) {
  const amount = quotes?.[id]?.[side];
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function buyPrice(quotes, id, trade = defaultTrade) {
  return price(quotes, id, trade.buy === 'slow' ? 'low' : 'high');
}

export function sellPrice(quotes, id, trade = defaultTrade) {
  return price(quotes, id, trade.sell === 'slow' ? 'high' : 'low');
}

export function afterTax(amount, id) {
  // Energy potion(4) is the only tax-exempt output among the priced recipes.
  return id === 3008 ? amount : amount - Math.min(Math.floor(amount / 50), 5000000);
}

export function materialCost(quotes, ingredients, trade) {
  let total = 0;
  for (const [id, quantity] of ingredients) {
    const gp = buyPrice(quotes, id, trade);
    if (gp === null) return null;
    total += gp * quantity;
  }
  return total;
}
