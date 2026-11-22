import { describe, expect, it } from 'vitest';
import { readAmount } from './amounts.js';
import { catalog, evaluateMethod, maxXp, methodAccess } from './training.js';
import { defaultAgility } from './praygility.js';
import { afterTax, buyPrice, sellPrice } from './trade.js';

describe('planner amounts', () => {
  it('reads XP shorthand and localized grouping, clipping values above the XP cap', () => {
    expect(readAmount('750k', 'en', 'xp')).toBe(750000);
    expect(readAmount('2.5M', 'en', 'xp')).toBe(2500000);
    expect(readAmount('2,5m', 'pt-BR', 'xp')).toBe(2500000);
    expect(readAmount('5.000.000', 'pt-BR', 'xp')).toBe(5000000);
    expect(readAmount('250M', 'en', 'xp')).toBe(maxXp);
    expect(readAmount('201,111,000', 'en', 'xp')).toBe(maxXp);
    expect(readAmount('1.5', 'en', 'xp')).toBeNaN();
  });

  it('keeps unsuffixed income in millions and accepts signed GP per XP', () => {
    expect(readAmount('750K', 'en', 'income')).toBe(.75);
    expect(readAmount('2.5m', 'en', 'income')).toBe(2.5);
    expect(readAmount('2,5', 'pt-BR', 'income')).toBe(2.5);
    expect(readAmount('-3,25', 'pt-BR', 'signed')).toBe(-3.25);
    expect(readAmount('+2.5', 'en', 'signed')).toBe(2.5);
  });
});

describe('Praygility opportunity cost', () => {
  const praygility = catalog('prayer', []).find(({ recipeName }) => recipeName === 'praygility');
  const settings = [50000000, 200000000, .4];
  const plan = { remaining: 150000000, gp: .4, valid: true };
  const evaluate = (agility, override) => evaluateMethod(praygility, 'prayer', settings, null, { ...plan, agility }, override);

  it('keeps the original estimate at 62k versus 65k and applies the alternative rate to training time only', () => {
    const prif = evaluate(defaultAgility);
    const ardy = evaluate({ ...defaultAgility, alternative: 70000 });
    const sepulchre = evaluate({ ...defaultAgility, alternative: 100000 });
    expect(prif.rate).toBe(4277800);
    expect(prif.practice).toBe(35.1);
    expect(ardy.rate).toBeCloseTo(1727573.08);
    expect(sepulchre.rate).toBeCloseTo(519570.85);
    expect(sepulchre.practice).toBeGreaterThan(ardy.practice);
    expect(sepulchre.gpHours).toBe(prif.gpHours);
    expect(sepulchre.balance).toBe(prif.balance);
  });

  it('uses adjusted training time with edited rates and preserves GP cost when Agility fully offsets training', () => {
    const override = evaluate({ combined: 0, alternative: 70000 }, 6500000);
    const noExtraTime = evaluate({ combined: 65000, alternative: 65000 });
    expect(override.rate).toBe(300000);
    expect(noExtraTime.rate).toBe(Infinity);
    expect(noExtraTime.practice).toBe(0);
    expect(noExtraTime.combined).toBeCloseTo(noExtraTime.gpHours);
  });
});

describe('method comparisons', () => {
  const settings = [5000000, 13000000, 1.3];
  const plan = { remaining: 8000000, gp: 1.3, valid: true };

  it('changes training time while preserving the GP estimate when a method rate is overridden', () => {
    const door = catalog('cons', []).find(({ recipeName }) => recipeName === 'oak door');
    const original = evaluateMethod(door, 'cons', settings, null, plan);
    const edited = evaluateMethod(door, 'cons', settings, null, plan, 1000000);
    expect(edited.practice).toBe(8);
    expect(edited.combined).toBeCloseTo(original.combined - 8);
    expect(edited.balance).toBe(original.balance);
  });

  it('uses a custom GP/XP value for net cost and adjusted time', () => {
    const method = { name: 'Custom', rate: 1000000, balancePerXp: -2, custom: true };
    const result = evaluateMethod(method, 'cons', settings, null, plan);
    expect(result.balance).toBe(-16);
    expect(result.combined).toBeCloseTo(8 + 16 / 1.3);
  });

  it('keeps fossils out of regular Prayer results and prices new potions before refresh', () => {
    expect(catalog('prayer', []).every(({ name }) => !name.includes('fossil'))).toBe(true);
    const potion = catalog('herblore', []).find(({ name }) => name === 'Stamina');
    expect(potion.level).toBe(77);
    expect(potion.rate).toBe(280500);
    expect(Number.isFinite(potion.balancePerXp)).toBe(true);
  });

  it('prices Super combat as one 4-dose potion and two empty vials at level 90', () => {
    const potion = catalog('herblore', []).find(({ name }) => name === 'Super combat potion');
    expect(potion.rate).toBe(315000);
    expect(methodAccess(potion, 89)).toBe('locked');
    expect(methodAccess(potion, 90)).toBe('unlocked');
    expect(evaluateMethod(potion, 'herblore', settings, null, plan).netPerXp).toBeCloseTo(-530 / 150);
  });

  it('keeps one row for each GE recipe and uses an untaxed manual sale price when supplied', () => {
    const crafting = catalog('craft', []);
    expect(crafting).toHaveLength(16);
    const [redBody] = crafting.filter(({ name }) => name === "Red d'hide bodies");
    const quotes = { 2507: { high: 2000, low: 1800 }, 2501: { high: 8500, low: 8000 } };
    expect(crafting.filter(({ name }) => name === redBody.name)).toHaveLength(1);
    expect(evaluateMethod(redBody, 'craft', settings, quotes, plan).netPerXp).toBeCloseTo(1840 / 234);
    const slow = { ...plan, trade: { buy: 'slow', sell: 'slow' } };
    expect(evaluateMethod(redBody, 'craft', settings, quotes, slow, undefined, 8000).netPerXp).toBeCloseTo(2600 / 234);
    expect(evaluateMethod(redBody, 'craft', settings, quotes, slow, undefined, 0).netPerXp).toBeCloseTo(-5400 / 234);
  });

  it('includes precious and semi-precious gems and scales crushing with Crafting level', () => {
    const crafting = catalog('craft', []);
    const opal = crafting.find(({ name }) => name === 'Cut opal');
    const zenyte = crafting.find(({ name }) => name === 'Cut zenyte');
    const low = evaluateMethod(opal, 'craft', settings, null, { ...plan, skillLevel: 1 });
    const high = evaluateMethod(opal, 'craft', settings, null, { ...plan, skillLevel: 99 });
    expect(low.rate).toBeLessThan(high.rate);
    expect(Number.isFinite(low.netPerXp)).toBe(true);
    expect(zenyte.rate).toBe(540000);
    expect(methodAccess(zenyte, 88)).toBe('locked');
  });

  it('includes the four tree groups and recalculates protection with the selected option', () => {
    const trees = catalog('farming', []);
    expect(trees).toHaveLength(23);
    expect(new Set(trees.map(({ group }) => group)).size).toBe(4);
    const apple = trees.find(({ name }) => name === 'Apple');
    const quotes = { 5496: { high: 10 }, 5986: { high: 8 }, 6034: { high: 50 }, 21483: { high: 100 } };
    const estimate = (protection) => evaluateMethod(apple, 'farming', settings, quotes, { ...plan, protection }).treeEstimate;
    expect(estimate('payment')).toMatchObject({ survival: 1, protectionCost: 72, wikiPriced: true });
    expect(estimate('super').survival).toBeCloseTo(.881);
    expect(estimate('ultra').survival).toBeCloseTo(.939);
    expect(estimate('ultra').protectionCost).toBe(100);
  });
});

it('uses each trade side independently and applies the rounded GE seller tax with exemptions', () => {
  const quotes = { 1: { low: 149, high: 200 } };
  const slowSell = { buy: 'instant', sell: 'slow' };
  const slowBuy = { buy: 'slow', sell: 'instant' };
  expect([buyPrice(quotes, 1, slowSell), sellPrice(quotes, 1, slowSell)]).toEqual([200, 200]);
  expect([buyPrice(quotes, 1, slowBuy), sellPrice(quotes, 1, slowBuy)]).toEqual([149, 149]);
  expect(afterTax(149, 1)).toBe(147);
  expect(afterTax(149, 3008)).toBe(149);
  expect(afterTax(500000000, 1)).toBe(495000000);
});
