import market from './market.js';
import { cuttingMethods } from './gems.js';
import { protectionModes, trees } from './trees.js';

export const priceItems = [...new Set([
  ...market.itemIds,
  ...cuttingMethods.flatMap(({ gem }) => [gem.input, gem.output]),
  ...trees.flatMap(({ tree }) => [tree.sapling, ...tree.payment.map(([id]) => id)]),
  ...Object.values(protectionModes).map(({ item }) => item),
].filter(Number.isInteger))].sort((a, b) => a - b);

export function selectQuotes(data) {
  const quotes = {};
  for (const id of priceItems) {
    const quote = data?.[id];
    const high = Number.isSafeInteger(quote?.high) && quote.high > 0 ? quote.high : null;
    const low = Number.isSafeInteger(quote?.low) && quote.low > 0 ? quote.low : null;
    if (high !== null || low !== null) quotes[id] = { high, low };
  }
  return quotes;
}

export function parseSnapshot(snapshot, now = Date.now()) {
  if (typeof snapshot?.fetchedAt !== 'string') return null;
  const time = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(time) || time > now + 300000) return null;
  const data = selectQuotes(snapshot.data);
  return Object.keys(data).length ? { fetchedAt: new Date(time).toISOString(), data } : null;
}
