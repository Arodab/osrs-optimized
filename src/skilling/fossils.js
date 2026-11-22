import market from './market.js';

const tiers = [
  { name: ['Small', 'Pequeno'], xp: 500 },
  { name: ['Medium', 'Médio'], xp: 1000 },
  { name: ['Large', 'Grande'], xp: 1500 },
  { name: ['Rare', 'Raro'], xp: 2500 },
];
const perTrip = 26;
const minutesPerTrip = 2.5;

export function fossilMarkup(t, prefs, integer) {
  const heading = t('Prayer from fossils', 'Oração com fósseis');
  const labels = [t('Fossil', 'Fóssil'), t('Owned', 'Disponíveis'), t('XP each', 'XP por unidade'), t('XP owned', 'XP disponível'), t('Use for goal', 'Usar na meta')];
  return `<section id="fossils" class="box fossils" aria-labelledby="fossil-title">
    <div class="table-head"><div><h2 id="fossil-title">${heading}</h2>
      <p>${t('Level 1 Prayer · Bone Voyage · Count spare fossils you already own.', 'Oração nível 1 · Bone Voyage · Conte os fósseis que já tem sobrando.')}</p></div></div>
    <div class="table-scroll" role="region" tabindex="0" aria-label="${heading}"><table>
      <thead><tr>${labels.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
      <tbody>${tiers.map(({ name, xp }, index) => `<tr><th scope="row">${t(...name)}</th>
        <td><input data-fossil="${index}" type="number" min="0" max="1000000" step="1" value="${prefs.counts[index]}" aria-label="${t(`${name[0]} fossils owned`, `Fósseis ${name[1].toLowerCase()}s disponíveis`)}"></td>
        <td>${integer.format(xp)}</td><td data-stock="${index}"></td><td data-use="${index}"></td></tr>`).join('')}</tbody>
    </table></div>
    <div class="fossil-decision">
      <label>${t('Compare with', 'Comparar com')}<select id="fossil-benchmark"></select></label>
      <div data-fossil-result role="status"></div>
    </div>
    <p class="table-note">${t('Estimates allow 2.5 min per trip of up to 26 fossils and budget calcite and pyrophosphite. Set aside fossils you want for museum exhibits.',
      'A estimativa usa 2,5 min por viagem de até 26 fósseis e inclui calcita e pirofosfita. Reserve os fósseis destinados às exposições do museu.')}
      <a href="https://oldschool.runescape.wiki/w/Mycelium_pool" target="_blank" rel="noreferrer">OSRS Wiki</a></p>
  </section>`;
}

export function attachFossils({ section, prefs, t, integer, decimal, escape, onSave, onChange }) {
  const inputs = Array.from(section.querySelectorAll('[data-fossil]'));
  const stockCells = Array.from(section.querySelectorAll('[data-stock]'));
  const useCells = Array.from(section.querySelectorAll('[data-use]'));
  const benchmark = section.querySelector('#fossil-benchmark');
  const result = section.querySelector('[data-fossil-result]');
  for (const [index, input] of inputs.entries()) {
    input.addEventListener('input', () => {
      const amount = input.valueAsNumber;
      if (input.value && (!Number.isInteger(amount) || amount < 0)) {
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      input.removeAttribute('aria-invalid');
      prefs.counts[index] = Math.min(1000000, amount || 0);
      if (amount > 1000000) input.value = prefs.counts[index];
      onSave();
      onChange();
    });
  }
  benchmark.addEventListener('change', () => {
    prefs.benchmark = benchmark.value;
    onSave();
    onChange();
  });

  return ({ remaining, gp, valid, quotes, methods, trade }) => {
    const eligible = methods.filter(({ combined, access }) => combined !== null && access === 'unlocked')
      .sort((a, b) => a.combined - b.combined);
    benchmark.innerHTML = `<option value="">${t('Fastest eligible Prayer method', 'Método de Oração disponível mais rápido')}</option>`
      + eligible.map((method) => `<option value="${escape(method.id)}">${escape(method.name)}${method.magic ? ` (${method.level} ${t('Magic', 'Magia')})` : ''}</option>`).join('');
    if (eligible.some((method) => method.id === prefs.benchmark)) benchmark.value = prefs.benchmark;
    const alternative = eligible.find((method) => method.id === benchmark.value) ?? eligible[0];

    let remainingXp = valid ? remaining : 0;
    let used = 0;
    let usedXp = 0;
    let totalXp = 0;
    for (let index = tiers.length - 1; index >= 0; index -= 1) {
      const { xp } = tiers[index];
      const count = prefs.counts[index];
      const use = Math.min(count, Math.ceil(remainingXp / xp));
      used += use;
      usedXp += use * xp;
      totalXp += count * xp;
      remainingXp = Math.max(0, remainingXp - use * xp);
      stockCells[index].textContent = integer.format(count * xp);
      useCells[index].textContent = integer.format(use);
    }
    if (!totalXp || !valid || remaining === 0) {
      result.textContent = !totalXp ? t('Enter your fossil counts to compare them with regular training.', 'Informe suas quantidades para comparar com o treino regular.')
        : !valid ? t('Set a valid XP goal and income to estimate the trade-off.', 'Defina uma meta de XP e uma renda válidas para comparar.')
          : t('Your Prayer XP goal is already reached.', 'Sua meta de XP em Oração já foi alcançada.');
      return;
    }

    const creditedXp = Math.min(usedXp, remaining);
    const trips = Math.ceil(used / perTrip);
    const supplyPairs = Math.max(trips * 3, Math.ceil(used * .46));
    const cost = supplyPairs * market.fossilSupplyPair(quotes, trade);
    const minutes = trips * minutesPerTrip;
    const summary = t(
      `${integer.format(creditedXp)} XP toward your goal · ${integer.format(used)} fossils · ${decimal.format(minutes)} min · ${integer.format(cost)} GP in supplies`,
      `${integer.format(creditedXp)} XP para a meta · ${integer.format(used)} fósseis · ${decimal.format(minutes)} min · ${integer.format(cost)} GP em materiais`,
    );
    if (!alternative) {
      result.textContent = summary;
      return;
    }

    const shareOfGoal = creditedXp / remaining;
    const minutesSaved = (alternative.combined * shareOfGoal - cost / (gp * 1000000)) * 60 - minutes;
    const gpSaved = -alternative.balance * 1000000 * shareOfGoal - cost;
    const verdict = minutesSaved > 0 ? t('Use fossils for a faster plan.', 'Use os fósseis para chegar mais rápido.')
      : gpSaved > 0 ? t('Use fossils to save GP, or skip them to save time.', 'Use os fósseis para economizar GP ou pule para economizar tempo.')
        : t('Skip fossils for this goal.', 'Pule os fósseis para esta meta.');
    const signed = (amount, format) => `${amount > 0 ? '+' : ''}${format.format(amount || 0)}`;
    result.innerHTML = `<strong>${verdict}</strong><p>${summary}</p><p>${t('Compared with', 'Em comparação com')} ${escape(alternative.name)} ·
      ${signed(minutesSaved, decimal)} ${t('adjusted min saved', 'min ajustados poupados')} · ${signed(gpSaved, integer)} ${t('GP saved', 'GP poupados')}</p>`;
  };
}
