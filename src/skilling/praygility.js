export const defaultAgility = { combined: 62000, alternative: 65000 };

const remainingFraction = ({ combined, alternative }) => (alternative - combined) / alternative;
const originalFraction = remainingFraction(defaultAgility);

export function prayerRateBeforeCredit(baselineRate) {
  return baselineRate * originalFraction;
}

export function effectivePrayerRate(baselineRate, agility) {
  const fraction = remainingFraction(agility);
  // At equal or better Agility throughput, the Prayer session adds no training time.
  return fraction <= 0 ? Infinity : baselineRate * (originalFraction / fraction);
}
