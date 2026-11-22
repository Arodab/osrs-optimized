import { readAmount } from './amounts.js';
import { effectivePrayerRate, prayerRateBeforeCredit } from './praygility.js';

const presets = [
  { name: 'Prif', rate: 65000 },
  { name: 'Ardy', rate: 70000 },
  { name: 'Sepulchre', rate: 100000 },
];

export function praygilityMarkup(t, agility, format) {
  return `<section class="planner box praygility-controls" id="praygility-controls" aria-labelledby="praygility-title">
    <div class="planner-head"><h2 id="praygility-title">Praygility</h2></div>
    <div class="fields two">
      <label>${t('Agility XP/h during Praygility', 'XP/h de Agilidade durante Praygility')}
        <input type="text" data-agility="combined" data-amount autocomplete="off" value="${format(agility.combined)}"></label>
      <label>${t('Alternative Agility XP/h', 'XP/h da alternativa de Agilidade')}
        <input type="text" data-agility="alternative" data-amount autocomplete="off" value="${format(agility.alternative)}"></label>
    </div>
    <div class="agility-presets" role="group" aria-label="${t('Alternative Agility presets', 'Predefinições de Agilidade alternativa')}">
      ${presets.map(({ name, rate }) => `<button class="ghost" type="button" data-agility-preset="${rate}" aria-pressed="${agility.alternative === rate}">${rate / 1000}k ${name}</button>`).join('')}
    </div>
    <p class="plan-status" data-agility-status role="status"></p>
  </section>`;
}

export function attachPraygility({ section, agility, language, t, format, integer, onChange }) {
  const inputs = Array.from(section.querySelectorAll('[data-agility]'));
  const presets = Array.from(section.querySelectorAll('[data-agility-preset]'));
  const alternative = section.querySelector('[data-agility="alternative"]');
  const status = section.querySelector('[data-agility-status]');

  function updateInput(input) {
    const key = input.dataset.agility;
    const rate = readAmount(input.value, language, 'rate');
    const valid = Number.isFinite(rate) && (key === 'alternative' ? rate > 0 : rate >= 0);
    input.setAttribute('aria-invalid', String(!valid));
    if (valid) agility[key] = rate;
    onChange();
  }

  for (const input of inputs) {
    input.addEventListener('input', () => updateInput(input));
    input.addEventListener('blur', () => {
      if (input.getAttribute('aria-invalid') !== 'true') input.value = format(agility[input.dataset.agility]);
    });
  }
  for (const button of presets) {
    button.addEventListener('click', () => {
      alternative.value = format(Number(button.dataset.agilityPreset));
      updateInput(alternative);
    });
  }

  return (baselineRate) => {
    for (const button of presets) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.agilityPreset) === agility.alternative));
    }
    const invalid = inputs.some((input) => input.getAttribute('aria-invalid') === 'true');
    status.classList.toggle('error', invalid);
    if (invalid) {
      status.textContent = t('Enter a nonnegative combined rate and a positive alternative rate. Results use the last valid rates.',
        'Informe uma taxa combinada não negativa e uma taxa alternativa positiva. Os resultados usam as últimas taxas válidas.');
      return;
    }

    const rate = effectivePrayerRate(baselineRate, agility);
    const raw = integer.format(prayerRateBeforeCredit(baselineRate));
    status.textContent = Number.isFinite(rate)
      ? t(`${integer.format(rate)} effective Prayer XP/h · ${raw} Prayer XP/h before Agility credit.`,
        `${integer.format(rate)} XP/h efetivo de Oração · ${raw} XP/h de Oração antes do crédito de Agilidade.`)
      : t('Praygility adds no net training time at these Agility rates. GP cost still applies.',
        'Praygility não adiciona tempo líquido de treino com essas taxas de Agilidade. O custo em GP continua valendo.');
  };
}
