import { describe, expect, it } from 'vitest';
import { readAmount } from './amounts.js';
import { catalog, evaluateMethod, maxXp } from './training.js';

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
