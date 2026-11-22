import { describe, expect, it } from 'vitest';
import { readAmount } from './amounts.js';
import { catalog, evaluateMethod, maxXp } from './training.js';
import { defaultAgility } from './praygility.js';

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
  const praygility = catalog('prayer', []).find(({ name }) => name === 'praygility');
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
    const door = catalog('cons', []).find(({ name }) => name === 'oak door');
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
});
