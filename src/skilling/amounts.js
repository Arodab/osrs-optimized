import { maxXp } from './training.js';

function readDecimal(value, portuguese, fractional) {
  const parts = value.split(portuguese ? ',' : '.');
  const [whole, fraction] = parts;
  const grouped = portuguese ? /^\d{1,3}(?:\.\d{3})+$/ : /^\d{1,3}(?:,\d{3})+$/;
  if (parts.length > 2 || (fraction !== undefined && (!fractional || !/^\d+$/.test(fraction)))) return NaN;
  if (!/^\d+$/.test(whole) && !grouped.test(whole) && !(whole === '' && fraction)) return NaN;
  return Number(`${whole.replace(/[.,]/g, '')}.${fraction ?? '0'}`);
}

export function readAmount(value, language, kind) {
  const match = value.trim().match(/^([+-]?)([\d.,]+)\s*([km])?$/i);
  if (!match || (match[1] === '-' && kind !== 'signed')) return NaN;
  const [, sign, digits, suffix = ''] = match;
  const portuguese = language === 'pt-BR';
  const fractional = kind !== 'xp' || Boolean(suffix);
  let amount = readDecimal(digits, portuguese, fractional);
  if (suffix && Number.isNaN(amount)) amount = readDecimal(digits, !portuguese, true);
  if (amount === Infinity && kind === 'xp') return maxXp;
  if (!Number.isFinite(amount)) return NaN;
  if (suffix) {
    const multiplier = suffix.toLowerCase() === 'k' ? 1000 : 1000000;
    const scaled = amount * multiplier;
    amount = kind === 'income' ? scaled / 1000000 : Number(scaled.toPrecision(15));
  }
  if (kind === 'xp') return Math.min(maxXp, amount);
  return sign === '-' ? -amount : amount;
}
