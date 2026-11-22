import sheets from './sheets.json';
import market, { additionalPotions, additionalPotionQuotes } from './market.js';
import { effectivePrayerRate } from './praygility.js';

const requirements = {
  cons: { 'oak door': 74, 'mahog tables': 52, benches: 77, 'mahog homes': 70 },
  craft: { green: 63, blue: 71, red: 77, black: 84, 'air bstaff': 66, 'fire bstaff': 62 },
  farming: { Papaya: 57, Palm: 68, Magic: 75 },
  herblore: {
    'Super restore': 63, Ranging: 72, 'Sara brew': 81, 'Arma brew': 89, 'Ext. Super antifire': 98,
    Remedy: 88, Magic: 76, 'Super combat': 90, Prayer: 38, 'Prayer regen': 58, Goading: 54,
  },
  prayer: { Dragon: 1, Hydra: 1, Dagganoth: 1, Superior: 70, praygility: 84 },
  rc: { blood: 77, soul: 90, GotR: 27, 'solo lava': 23, '4 runners': 23, 'solo muds': 13, Nats: 44 },
};

export const maxXp = 200000000;

export function catalog(skill, boats) {
  const levels = requirements[skill];
  const rows = sheets[skill].methods.filter(([name]) => Object.hasOwn(levels, name));
  const methods = rows.map(([name, rate, training, earn, total, cost, group]) => ({
    id: `${group}:${name}`, name, rate, group: skill === 'cons' ? 'sheet' : group,
    level: levels[name], magic: name === 'praygility',
    snapshot: { training, earn, total, cost, group },
  }));
  if (skill === 'cons') {
    methods.push(...boats.map((boat) => ({ ...boat, id: `${boat.group}:${boat.name}`, boat: true })));
  }
  if (skill === 'herblore') {
    methods.push(...Object.entries(additionalPotions).map(([name, recipe]) => ({
      id: `recipe:${name}`, name, level: recipe.level, group: 0,
      rate: recipe.xp * (recipe.mixesPerHour ?? 2500),
      balancePerXp: market.balancePerXp(additionalPotionQuotes, skill, name, 0, 1),
    })));
  }
  return methods;
}

export function evaluateMethod(method, skill, settings, quotes, plan, override) {
  const baselineRate = override ?? method.rate;
  const { remaining, gp, valid, agility } = plan;
  const rate = skill === 'prayer' && method.magic && agility ? effectivePrayerRate(baselineRate, agility) : baselineRate;
  const ratio = remaining / (settings[1] - settings[0]);
  const practice = valid ? method.snapshot && rate === method.rate ? method.snapshot.training * ratio : remaining / rate : null;
  const boatQuote = method.boat ? market.boatValue(quotes, method.group, method.tier, method.quantity) : null;
  const quote = method.boat
    ? boatQuote && (boatQuote.value - boatQuote.materials) / method.xp
    : method.custom ? null : market.balancePerXp(quotes, skill, method.name, method.snapshot?.group ?? 0, method.rate);

  if (method.snapshot && quote === null) {
    const { earn, total, cost, training } = method.snapshot;
    const gpRatio = settings[2] / gp;
    return { ...method, rate, practice, wikiPriced: false,
      gpHours: valid && earn !== null ? earn * ratio * gpRatio : null,
      combined: valid ? practice + (total - training + (earn ?? 0) * (gpRatio - 1)) * ratio : null,
      balance: valid && cost !== null ? -cost * ratio : null,
      netPerXp: cost === null ? null : -cost * 1000000 / (settings[1] - settings[0]),
    };
  }

  const netPerXp = quote ?? method.balancePerXp ?? null;
  const balance = valid && netPerXp !== null ? netPerXp * remaining / 1000000 : null;
  const gpHours = balance === null ? null : -balance / gp;
  return { ...method, rate, practice, balance, gpHours, netPerXp, wikiPriced: quote !== null,
    combined: practice === null || gpHours === null ? null : practice + gpHours,
  };
}

export function levelFromXp(xp) {
  return sheets.xp.rows.findLast(([, threshold]) => threshold <= xp)?.[0] ?? 1;
}
