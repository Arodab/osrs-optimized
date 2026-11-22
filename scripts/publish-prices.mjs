import { writeFile } from 'node:fs/promises';
import { parseSnapshot, priceItems, selectQuotes } from '../src/skilling/quote-snapshot.js';

const endpoints = {
  published: 'https://arodab.github.io/osrs-optimized/prices.json',
  wiki: 'https://prices.runescape.wiki/api/v2/osrs/latest',
};
const output = new URL('../dist/prices.json', import.meta.url);
const minimumInterval = 25 * 60 * 1000;

async function request(url) {
  return fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'OSRS Optimized (https://github.com/Arodab/osrs-optimized; shared scheduled quotes)',
    },
  });
}

async function getPublished() {
  const response = await request(endpoints.published);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Published price snapshot returned HTTP ${response.status}`);
  const snapshot = parseSnapshot(await response.json());
  if (!snapshot) throw new Error('Published price snapshot is invalid');
  return snapshot;
}

async function getLatest() {
  const response = await request(endpoints.wiki);
  if (!response.ok) throw new Error(`Wiki price API returned HTTP ${response.status}`);
  const { data } = await response.json();
  const quotes = selectQuotes(data);
  if (Object.keys(quotes).length < priceItems.length * .8) throw new Error('Wiki snapshot is incomplete');
  return { fetchedAt: new Date().toISOString(), data: quotes };
}

const published = await getPublished();
const refresh = process.argv.includes('--refresh');
let snapshot = published;
if (refresh && (!published || Date.now() - Date.parse(published.fetchedAt) >= minimumInterval)) {
  try {
    snapshot = await getLatest();
  } catch (error) {
    if (!published) throw error;
    console.warn(`${error.message}. Keeping the last published snapshot.`);
  }
}

if (snapshot) {
  await writeFile(output, `${JSON.stringify(snapshot)}\n`);
  console.log(`Prepared ${Object.keys(snapshot.data).length} quotes from ${snapshot.fetchedAt}.`);
} else {
  console.log('The planner will use its bundled prices until the first scheduled snapshot.');
}
