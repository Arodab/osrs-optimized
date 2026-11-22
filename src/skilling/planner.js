import sheets from './sheets.json';
import market from './market.js';

export function mountSkilling(root, api) {
  const events = new AbortController();
  const { signal } = events;
  const on = (element, event, handler) => element.addEventListener(event, handler, { signal });

  let marketQuotes = null;
  let quoteTime = null;
  let priceStatus = 'idle';
  let playerName = '';
  let playerProfile = null;
  let playerStatus = 'idle';
  const languageKey = 'skilling-methods-language';
  let language = 'en';
  try {
    if (localStorage.getItem(languageKey) === 'pt-BR') language = 'pt-BR';
  } catch {
    // The file preview can deny access to browser storage.
  }
  const t = (en, pt) => language === 'pt-BR' ? pt : en;
  const sections = {
    cons: { name: ['Construction', 'Construction'], icon: '⚒', color: '#e8b882', description: ['Compare furniture, Mahogany Homes, repair kits, and hull parts.', 'Compare móveis, Mahogany Homes, kits de reparo e peças de casco.'] },
    craft: { name: ['Crafting', 'Crafting'], icon: '◇', color: '#efbf9b', description: ['Compare dragonhide bodies and battlestaves by sales channel.', 'Compare dragonhide bodies e battlestaves pelo canal de venda.'] },
    farming: { name: ['Fruit Trees', 'Fruit Trees'], icon: '♣', color: '#abd586', description: ['Compare XP rates for papaya, palm, and magic tree runs.', 'Compare o rendimento de runs de papaya, palm e magic.'] },
    herblore: { name: ['Herblore', 'Herblore'], icon: '⚗', color: '#9dd4b5', description: ['Compare potion costs, returns, and XP rates.', 'Compare o custo, o retorno e o XP das poções da planilha.'] },
    prayer: { name: ['Prayer', 'Prayer'], icon: '✦', color: '#f0d793', description: ['Compare bones, praygility, and Fossil Island fossils.', 'Compare bones, praygility e fósseis de Fossil Island.'] },
    rc: { name: ['Runecraft', 'Runecraft'], icon: '◈', color: '#d0b6ed', description: ['Compare solo routes, runners, and Guardians of the Rift.', 'Compare runs solo, runners e Guardians of the Rift.'] },
    flipping: { name: ['Flipping', 'Flipping'], icon: '◉', color: '#e7bf77', description: ['Check prices and margins for 3-dose and 4-dose potions.', 'Consulte preços e margens de poções de 3 e 4 doses.'] },
    xp: { name: ['XP Table', 'Tabela de XP'], icon: '▤', color: '#a6c9e9', description: ['Look up total XP and calculate the XP between two levels.', 'Consulte o XP acumulado e calcule o XP entre dois níveis.'] },
  };
  const training = ['cons', 'craft', 'farming', 'herblore', 'prayer', 'rc'];
  const reference = ['flipping', 'xp'];
  const craftGroups = ['W308 Anvil', 'Grand Exchange'];
  const constructionGroups = {
    sheet: ['Spreadsheet methods', 'Métodos da planilha'],
    kits: ['Repair kits', 'Kits de reparo'],
    hull: ['Hull parts', 'Peças de casco'],
  };

  // Each row preserves the screenshot's level, quantity, costs, XP, and hourly rate.
  const constructionInputs = {
    kits: [
      ['Repair kit', 1, 2, 372, 136, 43.5, 52200],
      ['Oak repair kit', 19, 2, 1262, 256, 90, 108000],
      ['Teak repair kit', 30, 2, 2070, 864, 135, 162000],
      ['Mahogany repair kit', 47, 2, 4518, 2372, 210, 252000],
      ['Camphor repair kit', 66, 2, 6796, 3382, 255, 306000],
      ['Ironwood repair kit', 80, 3, 11745, 6531, 300, 360000],
      ['Rosewood repair kit', 92, 3, 32608, 18282, 330, 396000],
    ],
    hull: [
      ['Wooden hull parts', 1, null, 480, 30, 72.5, 72500],
      ['Oak hull parts', 8, null, 2705, 209, 150, 150000],
      ['Teak hull parts', 23, null, 4375, 1150, 225, 225000],
      ['Mahogany hull parts', 41, null, 9245, 4289, 350, 350000],
      ['Camphor hull parts', 53, null, 14115, 7474, 400, 400000],
      ['Ironwood hull parts', 75, null, 18425, 10181, 437.5, 437500],
      ['Rosewood hull parts', 84, null, 21765, 12892, 475, 475000],
    ],
  };
  const constructionMethods = Object.entries(constructionInputs).flatMap(([group, rows]) =>
    rows.map(([name, level, quantity, materials, value, xp, rate], tier) => ({
      group, tier, name, level, quantity, materials, value, xp, rate, balancePerXp: (value - materials) / xp,
    })));
  const main = root.querySelector('#skilling-content');
  const searchDialog = root.querySelector('#search-dialog');
  const searchInput = root.querySelector('#site-search');
  const searchResults = root.querySelector('#search-results');
  let integer;
  let decimal;
  let precise;
  let editableNumber;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const normalize = (value) => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const valueText = (value, format, unit = '') => value === null ? '—' : `${format.format(value || 0)}${unit}`;
  const money = (amount) => amount === null ? '—' : `${amount > 0 ? '+' : ''}${decimal.format(amount || 0)} M`;

  function parseAmount(value, fractionAllowed) {
    const separator = language === 'pt-BR' ? ',' : '.';
    const grouped = language === 'pt-BR' ? /^\d{1,3}(?:\.\d{3})+$/ : /^\d{1,3}(?:,\d{3})+$/;
    const [whole, fraction, extra] = value.trim().split(separator);
    if (extra !== undefined || (fraction !== undefined && (!fractionAllowed || !/^\d+$/.test(fraction)))) return NaN;
    if (!/^\d+$/.test(whole) && !grouped.test(whole) && !(whole === '' && fraction)) return NaN;
    return Number(`${whole.replace(/[.,]/g, '')}.${fraction ?? '0'}`);
  }

  function renderPrices() {
    const button = root.querySelector('#refresh-prices');
    const status = root.querySelector('#market-status');
    button.disabled = priceStatus === 'loading';
    button.textContent = button.disabled ? t('Updating prices…', 'Atualizando preços…') : t('Update Wiki prices', 'Atualizar preços da Wiki');
    const time = quoteTime ? new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(quoteTime) : '';
    const label = priceStatus === 'loading' ? t('Requesting Grand Exchange quotes', 'Consultando cotações do Mercado Geral')
      : priceStatus === 'error' ? t('Wiki prices unavailable. Try again.', 'Preços da Wiki indisponíveis. Tente novamente.')
        : time ? t(`Wiki prices fetched ${time}`, `Preços da Wiki consultados em ${time}`) : t('Using source prices', 'Usando preços das fontes originais');
    status.textContent = priceStatus === 'error' && time ? `${label} ${t(`Last update: ${time}`, `Última atualização: ${time}`)}` : label;
  }
  const routeFor = (id, query = '') => `#${id}${query ? `?${new URLSearchParams({ busca: query })}` : ''}`;

  function currentRoute() {
    const [id, parameters] = location.hash.slice(1).split('?');
    return [Object.hasOwn(sections, id) ? id : 'inicio', new URLSearchParams(parameters).get('busca') ?? ''];
  }

  function icon(section) {
    return `<span class="card-icon" aria-hidden="true" style="--accent:${section.color}">${section.icon}</span>`;
  }

  function methodCount(id) {
    return sheets[id].methods.length + (id === 'cons' ? constructionMethods.length : 0);
  }

  function renderNavigation(active) {
    const link = (id, section) => `<a class="nav-link" href="${routeFor(id)}" ${active === id ? 'aria-current="page"' : ''}>
      <span class="nav-icon" style="--accent:${section.color}" aria-hidden="true">${section.icon}</span>${t(...section.name)}</a>`;
    const group = (label, ids) => `<div class="nav-group"><p class="nav-label">${label}</p>${ids.map((id) => link(id, sections[id])).join('')}</div>`;
    const overview = ['Overview', 'Visão geral'];
    root.querySelector('#navigation').innerHTML = link('inicio', { name: overview, icon: '▦', color: '#edbe70' })
      + group(t('Training', 'Treino'), training) + group(t('References', 'Referências'), reference);
    root.querySelector('#breadcrumb').textContent = t(...(sections[active]?.name ?? overview));
  }

  function overview() {
    const card = (id) => {
      const section = sections[id];
      const count = sheets[id].methods ? methodCount(id) : sheets[id].rows.length;
      const label = { xp: t('levels', 'níveis'), flipping: t('potions', 'poções') }[id] ?? t('methods', 'métodos');
      return `<a class="skill-card" style="--accent:${section.color}" href="${routeFor(id)}">
        <div class="card-top">${icon(section)}<h3>${t(...section.name)}</h3></div>
        <p>${t(...section.description)}</p><span class="card-meta">${count} ${label}</span></a>`;
    };
    const total = training.reduce((count, id) => count + methodCount(id), 0);
    main.innerHTML = `<section class="hero">
      <div class="hero-copy"><h1>Skilling Methods</h1><p>${t('Compare Old School RuneScape training methods and estimate the time and GP needed for your goal.', 'Compare métodos de treino de Old School RuneScape e veja quanto tempo e GP faltam para sua meta.')}</p></div>
      <div class="hero-art" aria-hidden="true"><span>✷</span></div>
    </section>
    <section class="overview-section" aria-labelledby="training-title">
      <div class="section-head"><h2 id="training-title">${t('Training methods', 'Métodos de treino')}</h2><span>${total} ${t('options', 'opções')}</span></div>
      <div class="card-grid">${training.map(card).join('')}</div>
    </section>
    <section class="overview-section" aria-labelledby="reference-title">
      <div class="section-head"><h2 id="reference-title">${t('References', 'Referências')}</h2></div>
      <div class="card-grid reference-grid">${reference.map(card).join('')}</div>
    </section>`;
  }

  function heading(id) {
    const section = sections[id];
    return `<header class="page-heading">${icon(section)}<div><h1>${t(...section.name)}</h1><p>${t(...section.description)}</p></div></header>`;
  }

  function rawTable(rows) {
    const width = Math.max(...rows.flatMap(([, cells]) => cells.map(([column, , span]) => column + span)));
    const occupied = new Map();
    const content = rows.map(([row, entries]) => {
      const cells = new Map(entries.map((entry) => [entry[0], entry]));
      let rowHtml = '';
      for (let column = 0; column < width; column += 1) {
        if (occupied.get(column) > row) continue;
        const cell = cells.get(column);
        if (!cell) {
          rowHtml += '<td></td>';
          continue;
        }
        const [, text, colSpan, originalHeight] = cell;
        const rowSpan = rows.filter(([candidate]) => candidate >= row && candidate < row + originalHeight).length;
        for (let offset = 0; offset < colSpan; offset += 1) occupied.set(column + offset, row + originalHeight);
        rowHtml += `<td colspan="${colSpan}" rowspan="${rowSpan}">${escapeHtml(text)}</td>`;
        column += colSpan - 1;
      }
      return `<tr><th scope="row">${row}</th>${rowHtml}</tr>`;
    }).join('');
    const columns = Array.from({ length: width }, (_, index) => `<th scope="col">${String.fromCharCode(65 + index)}</th>`).join('');
    return `<details class="raw box" id="sheet-source"><summary>${t('View original sheet data', 'Ver dados originais da aba')}</summary><div class="table-scroll" role="region" tabindex="0" aria-label="${t('Original data', 'Dados originais')}"><table><thead><tr><th scope="col">${t('Row', 'Linha')}</th>${columns}</tr></thead><tbody>${content}</tbody></table></div></details>`;
  }

  function tableFrame(title, placeholder, extra = '') {
    return `<section class="box" aria-label="${title}">
      <div class="table-head"><h2>${title}</h2><div class="table-tools">
        ${extra}<input id="filter" type="search" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off">
      </div></div>
      <div class="table-scroll" role="region" tabindex="0" aria-label="${title}"><table><thead id="columns"></thead><tbody id="rows"></tbody></table></div>
      <p class="table-note" id="table-note" aria-live="polite"></p>
    </section>`;
  }

  function makeTable(labels, filter, initialSort, defaultDirection, savedSort) {
    const head = root.querySelector('#columns');
    const body = root.querySelector('#rows');
    const note = root.querySelector('#table-note');
    let column = savedSort?.column ?? initialSort;
    let direction = savedSort?.direction ?? defaultDirection[column] ?? 1;
    let rows = [];
    let message = '';

    function renderRows() {
      const visible = rows.filter(filter);
      if (column !== null) visible.sort((a, b) => {
        const x = a.values[column];
        const y = b.values[column];
        if (x === null || y === null) return Number(x === null) - Number(y === null);
        return direction * (typeof x === 'number' ? x - y : x.localeCompare(y, 'pt-BR'));
      });
      body.innerHTML = visible.length
        ? visible.map(({ cells }) => `<tr>${cells.map((cell, index) => index ? `<td>${cell}</td>` : `<th scope="row">${cell}</th>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${labels.length}" class="notice">${t('No results match this filter.', 'Nenhum resultado para esse filtro.')}</td></tr>`;
      const total = `${visible.length} ${t('of', 'de')} ${rows.length} ${t('results', 'resultados')}`;
      note.textContent = message ? `${total} · ${message}` : total;
    }

    head.innerHTML = `<tr>${labels.map((label, index) => `<th class="sortable" scope="col"><button type="button" data-sort="${index}">${label}<span class="sort-mark" aria-hidden="true"></span></button></th>`).join('')}</tr>`;
    function renderSort() {
      head.querySelectorAll('button').forEach((button, index) => {
        const header = button.parentElement;
        if (index === column) header.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
        else header.removeAttribute('aria-sort');
        button.querySelector('span').textContent = index === column ? (direction === 1 ? '▴' : '▾') : '';
      });
    }
    head.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-sort]');
      if (!button) return;
      const next = Number(button.dataset.sort);
      direction = column === next ? -direction : (defaultDirection[next] ?? 1);
      column = next;
      renderSort();
      renderRows();
    });
    renderSort();
    return (next, text = '') => {
      rows = next;
      message = text;
      renderRows();
    };
  }

  function constructionSource() {
    const tables = ['kits', 'hull'].map((group) => {
      const labels = [t('Method', 'Método'), t('Level', 'Nível')];
      if (group === 'kits') labels.push(t('Number made', 'Unidades produzidas'));
      labels.push(t('Materials (GP)', 'Materiais (GP)'), t('Constructed value (GP)', 'Valor produzido (GP)'),
        t('Profit (GP)', 'Lucro (GP)'), 'XP', 'XP/h', 'GP/XP');
      const name = t(...constructionGroups[group]);
      const rows = constructionMethods.filter((method) => method.group === group).map((method) => {
        const amounts = market.boatValue(marketQuotes, method.group, method.tier, method.quantity) ?? method;
        const net = amounts.value - amounts.materials;
        const cells = [method.level];
        if (group === 'kits') cells.push(method.quantity);
        cells.push(amounts.materials, amounts.value, net, method.xp, method.rate, net / method.xp);
        return `<tr><th scope="row">${method.name}</th>${cells.map((value) => `<td>${decimal.format(value)}</td>`).join('')}</tr>`;
      }).join('');
      return `<h3>${name}</h3><div class="table-scroll" role="region" tabindex="0" aria-label="${name}">
        <table><thead><tr>${labels.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<details class="raw box method-source" id="construction-source">
      <summary>${t('Repair kit and hull part data', 'Dados de kits de reparo e peças de casco')}</summary>${tables}
      <p class="table-note">${marketQuotes ? t('Wiki estimates include Grand Exchange seller tax. Source values are used when a quote is missing.', 'As estimativas da Wiki incluem o imposto de venda do Mercado Geral. Valores originais são usados quando falta uma cotação.') : t('Materials, values, and XP rates from the supplied screenshot.', 'Materiais, valores e taxas de XP da imagem fornecida.')}</p>
    </details>`;
  }

  function hiscoresForm(id) {
    const xp = playerProfile?.xp[id];
    const label = {
      loading: t('Looking up the player…', 'Consultando o personagem…'),
      invalid: t('Enter a valid Old School RuneScape display name.', 'Digite um nome de personagem válido do Old School RuneScape.'),
      missing: t('Player not found on the main Old School Hiscores.', 'Personagem não encontrado no Hiscores principal do Old School.'),
      error: t('Hiscores is unavailable. Try again or enter your XP manually.', 'O Hiscores está indisponível. Tente de novo ou digite seu XP manualmente.'),
      found: xp === undefined ? t('Hiscores has no XP for this skill.', 'O Hiscores não tem XP para esta habilidade.')
        : t(`${playerProfile?.player} · ${integer.format(xp)} XP in Hiscores`, `${playerProfile?.player} · ${integer.format(xp)} XP no Hiscores`),
    }[playerStatus] ?? '';
    const error = playerStatus === 'invalid' || playerStatus === 'missing' || playerStatus === 'error';
    return `<form class="hiscores box" id="hiscores" novalidate>
      <label>${t('OSRS player name', 'Nome do personagem no OSRS')}<input name="player" placeholder="${t('Display name', 'Nome de exibição')}" value="${escapeHtml(playerName)}" maxlength="12" autocomplete="off" spellcheck="false"></label>
      <button class="ghost" type="submit" ${playerStatus === 'loading' ? 'disabled' : ''}>${t('Load XP from Hiscores', 'Buscar XP no Hiscores')}</button>
      <p${label ? '' : ' hidden'} class="plan-status${error ? ' error' : ''}" role="status">${escapeHtml(label)}</p>
    </form>`;
  }

  function planView(id, query, view) {
    const { settings, methods, raw } = sheets[id];
    const [, , initialGP] = settings;
    const fields = [t('Current XP', 'XP atual'), t('XP goal', 'Meta de XP'), t('Alternative income (M GP/h)', 'Renda alternativa (M GP/h)')];
    const groupOptions = id === 'craft'
      ? Object.entries(craftGroups)
      : id === 'cons' ? Object.entries(constructionGroups).map(([key, labels]) => [key, t(...labels)]) : [];
    const segment = groupOptions.length ? `<select id="segment" aria-label="${id === 'craft' ? t('Sales channel', 'Canal de venda') : t('Method group', 'Grupo de métodos')}">
      <option value="all">${id === 'craft' ? t('All channels', 'Todos os canais') : t('All groups', 'Todos os grupos')}</option>
      ${groupOptions.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select>` : '';
    main.innerHTML = `${heading(id)}${hiscoresForm(id)}<form class="planner box" id="planner" novalidate>
      <div class="planner-head"><h2>${t('XP planner', 'Planejador de XP')}</h2><button class="ghost" type="reset">${t('Restore defaults', 'Restaurar valores')}</button></div>
      <div class="fields">${fields.map((label, index) => `<label>${label}<input type="text" inputmode="${index === 2 ? 'decimal' : 'numeric'}" data-amount required autocomplete="off" value="${editableNumber.format(settings[index])}"></label>`).join('')}</div>
      <p class="plan-status" id="plan-status" aria-live="polite"></p>
    </form><div class="method-summary" id="metrics"></div>
    ${tableFrame(t('Method comparison', 'Comparação de métodos'), t('Filter methods', 'Filtrar métodos'), segment)}
    ${id === 'cons' ? constructionSource() : ''}${rawTable(raw)}`;

    const form = root.querySelector('#planner');
    const inputs = Array.from(form.querySelectorAll('input'));
    const status = root.querySelector('#plan-status');
    const metrics = root.querySelector('#metrics');
    const filter = root.querySelector('#filter');
    const channel = root.querySelector('#segment');
    const playerForm = root.querySelector('#hiscores');
    playerForm.elements.player.addEventListener('input', (event) => { playerName = event.target.value; });
    playerForm.addEventListener('submit', loadPlayer);
    filter.value = view.filter ?? query;
    if (view.inputs) inputs.forEach((input, index) => { input.value = view.inputs[index]; });
    const xpFromHiscores = playerProfile?.xp[id];
    if (xpFromHiscores !== undefined && (!view.inputs || view.applyPlayer)) inputs[0].value = editableNumber.format(xpFromHiscores);
    if (channel && view.channel) channel.value = view.channel;
    const inChannel = (group) => !channel || channel.value === 'all' || channel.value === String(group);
    const labels = [t('Method', 'Método'), 'XP/h', t('Training (h)', 'Treino (h)'), t('GP time (h)', 'Tempo de GP (h)'),
      t('Adjusted time (h)', 'Tempo ajustado (h)'), t('Net GP', 'Saldo (GP)')];
    if (id === 'cons') labels.push(t('Level', 'Nível'));
    if (id === 'craft') labels.push(t('Sales channel', 'Canal de venda'));
    const table = makeTable(labels, (row) => inChannel(row.group) && normalize(row.values[0]).includes(normalize(filter.value)),
      4, { 1: -1, 5: -1 }, view.sort);

    function update() {
      const [current, goal, gp] = inputs.map((input, index) => parseAmount(input.value, index === 2));
      const isXp = (xp) => Number.isInteger(xp) && xp >= 0 && xp <= 200000000;
      const validFields = [isXp(current), isXp(goal), Number.isFinite(gp) && gp >= .001 && gp <= 100000];
      const valid = validFields.every(Boolean);
      inputs.forEach((input, index) => input.setAttribute('aria-invalid', String(!validFields[index])));
      const remaining = Math.max(0, goal - current);
      const ratio = remaining / (settings[1] - settings[0]);
      const gpRatio = initialGP / gp;
      const matches = methods.map(([name, rate, trainingHours, earn, total, cost, group]) => {
        const practice = valid ? trainingHours * ratio : null;
        const groupKey = id === 'cons' ? 'sheet' : group;
        const netPerXp = market.balancePerXp(marketQuotes, id, name, group, rate);
        if (netPerXp !== null) {
          const balance = valid ? netPerXp * remaining / 1000000 : null;
          const gpHours = valid ? -balance / gp : null;
          return { name, rate, practice, gpHours, combined: valid ? practice + gpHours : null, balance, group: groupKey, level: null, wikiPriced: true };
        }
        const gpHours = valid && earn !== null ? earn * ratio * gpRatio : null;
        const combined = valid ? (total + (earn ?? 0) * (gpRatio - 1)) * ratio : null;
        const balance = valid && cost !== null ? -cost * ratio : null;
        return { name, rate, practice, gpHours, combined, balance, group: groupKey, level: null, wikiPriced: false };
      });
      if (id === 'cons') {
        for (const method of constructionMethods) {
          const practice = valid ? remaining / method.rate : null;
          const amounts = market.boatValue(marketQuotes, method.group, method.tier, method.quantity);
          const netPerXp = amounts ? (amounts.value - amounts.materials) / method.xp : method.balancePerXp;
          const balance = valid ? remaining * netPerXp / 1000000 : null;
          const gpHours = valid ? -balance / gp : null;
          const combined = valid ? practice + gpHours : null;
          matches.push({ ...method, practice, gpHours, combined, balance, wikiPriced: amounts !== null });
        }
      }
      const options = matches.filter((method) => inChannel(method.group) && normalize(method.name).includes(normalize(filter.value)));
      const quickest = options.reduce((best, method) => !best || method.combined < best.combined ? method : best, null);
      const topRate = options.reduce((best, method) => !best || method.rate > best.rate ? method : best, null);
      const bestBalance = options.filter((method) => method.balance !== null)
        .reduce((best, method) => !best || method.balance > best.balance ? method : best, null);
      status.classList.toggle('error', !valid);
      status.innerHTML = !valid ? t('Enter whole XP values from 0 to 200 million and a positive income rate.', 'Informe XP inteiro entre 0 e 200 milhões e uma renda positiva.')
        : remaining === 0 ? `<strong>${t('XP goal reached.', 'Meta de XP atingida.')}</strong>`
          : `${t('XP remaining', 'XP restante')} <strong>${integer.format(remaining)}</strong>`;

      const metric = (label, option, value) => `<div class="metric box"><span>${label}</span><strong>${option ? escapeHtml(option.name) : '—'}</strong>${option ? `<small>${value}</small>` : ''}</div>`;
      metrics.innerHTML = metric(t('Shortest adjusted time', 'Menor tempo ajustado'), valid && remaining ? quickest : null, valueText(quickest?.combined ?? null, decimal, ' h'))
        + metric(t('Highest XP rate', 'Maior taxa de XP'), topRate, valueText(topRate?.rate ?? null, integer, ' XP/h'))
        + metric(t('Best net GP', 'Melhor saldo'), valid && remaining ? bestBalance : null, money(bestBalance?.balance ?? null));
      table(matches.map((method) => {
        const badge = valid && remaining && method === quickest ? ` <span class="tag">${t('Shortest time', 'Menor tempo')}</span>` : '';
        const values = [method.name, method.rate, method.practice, method.gpHours, method.combined, method.balance];
        const originalPrice = marketQuotes && !method.wikiPriced ? `<sup class="quote-source" title="${t('Source price', 'Preço original')}">*</sup>` : '';
        const cells = [`<span class="row-name">${escapeHtml(method.name)}${badge}</span>`, integer.format(method.rate),
          valueText(method.practice, decimal), valueText(method.gpHours, decimal), valueText(method.combined, decimal),
          `<span class="${method.balance > 0 ? 'good' : method.balance < 0 ? 'warn' : ''}">${money(method.balance)}</span>${originalPrice}`];
        if (id === 'cons') {
          values.push(method.level);
          cells.push(valueText(method.level, integer));
        }
        if (id === 'craft') {
          values.push(craftGroups[method.group]);
          cells.push(craftGroups[method.group]);
        }
        return { values, cells, group: method.group };
      }), marketQuotes ? t('Wiki quotes use instant buy and sell prices, including seller tax. * Source estimate.',
        'Cotações da Wiki usam preços de compra e venda imediatas, com imposto de venda. * Estimativa original.')
        : t('Adjusted time includes the hours needed to earn GP and subtracts the equivalent hours for a profit.',
          'O tempo ajustado inclui as horas necessárias para obter GP e desconta as horas equivalentes ao lucro.'));
    }
    form.addEventListener('submit', (event) => event.preventDefault());
    form.addEventListener('input', update);
    inputs.forEach((input, index) => input.addEventListener('blur', () => {
      if (input.getAttribute('aria-invalid') === 'false') input.value = editableNumber.format(parseAmount(input.value, index === 2));
    }));
    form.addEventListener('reset', (event) => {
      event.preventDefault();
      inputs.forEach((input) => { input.value = input.defaultValue; });
      update();
    });
    filter.addEventListener('input', update);
    channel?.addEventListener('change', update);
    update();
  }

  function referenceView(id, query, view) {
    const { rows, raw } = sheets[id];
    const isXP = id === 'xp';
    const calculator = isXP ? `<form class="planner box" id="level-calculator" novalidate>
      <div class="planner-head"><h2>${t('XP between levels', 'XP entre níveis')}</h2></div>
      <div class="fields two"><label>${t('Current level', 'Nível atual')}<input type="number" min="1" max="99" required value="1"></label>
      <label>${t('Target level', 'Nível desejado')}<input type="number" min="1" max="99" required value="99"></label></div>
      <p class="plan-status" id="level-status" aria-live="polite"></p>
    </form>` : '';
    main.innerHTML = heading(id) + calculator + tableFrame(isXP ? t('Levels 1 to 99', 'Níveis 1 a 99') : t('Exported margins', 'Margens da exportação'),
      isXP ? t('Filter by level', 'Filtrar por nível') : t('Filter potions', 'Filtrar poções')) + rawTable(raw);
    const filter = root.querySelector('#filter');
    filter.value = view.filter ?? query;
    const usePrices = !isXP && marketQuotes !== null;
    const labels = isXP ? [t('Level', 'Nível'), t('Total XP', 'XP total'), t('XP for level', 'XP do nível'), t('Multiplier', 'Multiplicador')]
      : usePrices ? [t('Potion', 'Poção'), t('3-dose buy', 'Compra 3 doses'), t('3-dose sell', 'Venda 3 doses'),
        t('4-dose buy', 'Compra 4 doses'), t('4-dose sell', 'Venda 4 doses'), t('Net per batch (GP)', 'Saldo por lote (GP)')]
      : [t('Potion', 'Poção'), '3 doses · 1', '3 doses · 2', '4 doses · 1', '4 doses · 2', t('Profit (k GP)', 'Lucro (mil GP)')];
    const table = makeTable(labels, ({ values }) => normalize(values[0]).includes(normalize(filter.value)), isXP ? 0 : 5, { 5: -1 }, view.sort);
    const displayRows = rows.map((row) => {
      const values = usePrices ? [row[0], ...(market.flip(marketQuotes, row[0]) ?? Array(5).fill(null))] : row;
      const cells = values.map((value, index) => typeof value === 'string'
        ? `<span class="row-name">${escapeHtml(value)}</span>` : valueText(value, isXP && index === 3 ? precise : decimal));
      return { values, cells };
    });
    const note = isXP ? '' : usePrices
      ? t('One batch buys four 3-dose potions and sells three 4-dose potions after Grand Exchange tax.', 'Um lote compra quatro poções de 3 doses e vende três poções de 4 doses, descontando o imposto do Mercado Geral.')
      : t('The two quotes for each potion size follow the original sheet order.', 'As duas cotações de cada tamanho de poção seguem a ordem da exportação.');
    filter.addEventListener('input', () => table(displayRows, note));
    table(displayRows, note);

    if (isXP) {
      const form = root.querySelector('#level-calculator');
      const [start, end] = form.querySelectorAll('input');
      if (view.inputs) [start.value, end.value] = view.inputs;
      const status = root.querySelector('#level-status');
      const xpByLevel = new Map(rows.map(([level, xp]) => [level, xp]));
      function update() {
        const valid = start.validity.valid && end.validity.valid && end.valueAsNumber >= start.valueAsNumber;
        status.classList.toggle('error', !valid);
        status.innerHTML = valid
          ? `${t('XP needed', 'XP necessário')} <strong>${integer.format(xpByLevel.get(end.valueAsNumber) - xpByLevel.get(start.valueAsNumber))}</strong>`
          : t('Choose levels from 1 to 99, with the target at or above the current level.', 'Use níveis de 1 a 99 com a meta igual ou acima do nível atual.');
      }
      form.addEventListener('submit', (event) => event.preventDefault());
      form.addEventListener('input', update);
      update();
    }
  }

  function renderChrome() {
    root.lang = language;
    integer = new Intl.NumberFormat(language, { maximumFractionDigits: 0 });
    decimal = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
    precise = new Intl.NumberFormat(language, { maximumFractionDigits: 3 });
    editableNumber = new Intl.NumberFormat(language, { maximumFractionDigits: 20 });
    const text = (selector, en, pt) => { root.querySelector(selector).textContent = t(en, pt); };
    const label = (selector, en, pt) => { root.querySelector(selector).setAttribute('aria-label', t(en, pt)); };
    label('#navigation', 'Skilling sections', 'Seções de treino');
    label('#language-toggle', 'Language', 'Idioma');
    label('.dialog-head button', 'Close search', 'Fechar busca');
    label('#site-search', 'Method, sheet, or level', 'Método, aba ou nível');
    text('.skip', 'Skip to content', 'Ir para o conteúdo');
    if (marketQuotes) text('#footer-source', 'Source exports and OSRS Wiki quotes', 'Fontes originais e cotações da OSRS Wiki');
    else text('#footer-source', 'Values from the source exports', 'Valores das fontes originais');
    text('#search-title', 'Search site', 'Buscar no site');
    text('#search-label', 'Search site', 'Buscar no site');
    searchInput.placeholder = t('e.g. repair kit, herblore, level 99', 'Ex. repair kit, herblore, nível 99');
    root.querySelectorAll('[data-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    renderPrices();
  }

  function render(focus = false, view = {}) {
    const [id, query] = currentRoute();
    renderChrome();
    renderNavigation(id);
    document.title = id === 'inicio' ? 'Skilling Methods · OSRS Optimized' : `${t(...sections[id].name)} · OSRS Optimized`;
    if (id === 'inicio') overview();
    else if (training.includes(id)) planView(id, query, view);
    else referenceView(id, query, view);
    for (const id of view.openDetails ?? []) root.querySelector(`#${id}`).open = true;
    if (focus) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
      root.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function searchSite() {
    const query = normalize(searchInput.value);
    const level = query.match(/^(?:(?:level|nivel)\s+)?(\d+)$/)?.[1];
    const results = Object.entries(sections).flatMap(([id, section]) => {
      const sectionName = t(...section.name);
      const entries = section.name.some((name) => normalize(name).includes(query))
        ? [{ id, name: sectionName, context: t('Sheet', 'Aba') }] : [];
      if (query && id !== 'xp') {
        const matches = new Set((sheets[id].methods ?? sheets[id].rows).map(([name]) => name));
        if (id === 'cons') {
          for (const method of constructionMethods) matches.add(method.name);
        }
        for (const name of matches) if (normalize(name).includes(query)) entries.push({ id, name, context: sectionName, query: name });
      }
      if (id === 'xp' && level >= 1 && level <= 99) entries.push({ id, name: `${t('Level', 'Nível')} ${Number(level)}`, context: sectionName, query: String(Number(level)) });
      return entries;
    });
    searchResults.innerHTML = results.length ? results.slice(0, 12).map((result) => `<button type="button" data-route="${escapeHtml(routeFor(result.id, result.query))}">
      <span>${escapeHtml(result.name)}</span><small>${result.context}</small></button>`).join('') : `<p class="notice">${t('No results found.', 'Nenhum resultado encontrado.')}</p>`;
  }

  function openSearch() {
    if (!searchDialog.open) searchDialog.showModal();
    searchInput.value = '';
    searchSite();
    searchInput.focus();
  }

  function readView() {
    const sorted = main.querySelector('#columns th[aria-sort]');
    const inputs = Array.from(main.querySelectorAll('#planner input, #level-calculator input'), (input) => input.value);
    return {
      inputs: inputs.length ? inputs : undefined,
      filter: main.querySelector('#filter')?.value,
      channel: main.querySelector('#segment')?.value,
      openDetails: Array.from(main.querySelectorAll('details[open]'), (details) => details.id),
      sort: sorted ? { column: Number(sorted.querySelector('button').dataset.sort),
        direction: sorted.getAttribute('aria-sort') === 'ascending' ? 1 : -1 } : undefined,
    };
  }

  async function loadPlayer(event) {
    event.preventDefault();
    if (playerStatus === 'loading') return;
    const name = event.currentTarget.elements.player.value.replaceAll('_', ' ').trim();
    if (!/^[a-z\d -]{1,12}$/i.test(name) || !/[a-z\d]/i.test(name)) {
      playerStatus = 'invalid';
      render(false, readView());
      root.querySelector('#hiscores input').focus();
      return;
    }
    playerName = name;
    if (playerProfile?.player.toLowerCase() !== name.toLowerCase()) playerProfile = null;
    playerStatus = 'loading';
    render(false, readView());
    try {
      const response = await fetch(`${api}hiscores?${new URLSearchParams({ player: name })}`, { signal, credentials: 'omit' });
      if (response.status === 404) playerStatus = 'missing';
      else if (response.ok) {
        playerProfile = await response.json();
        playerStatus = 'found';
      } else playerStatus = 'error';
    } catch {
      playerStatus = 'error';
    }
    if (!signal.aborted) render(false, { ...readView(), applyPlayer: playerStatus === 'found' });
  }

  on(root.querySelector('#refresh-prices'), 'click', async () => {
    if (priceStatus === 'loading') return;
    priceStatus = 'loading';
    renderPrices();
    try {
      const response = await fetch(`${api}prices`, { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Price request failed');
      const { data } = await response.json();
      if (!data || !Object.keys(data).length) throw new Error('No quotes returned');
      if (signal.aborted) return;
      marketQuotes = data;
      quoteTime = new Date();
      priceStatus = 'ready';
      render(false, readView());
    } catch {
      if (signal.aborted) return;
      priceStatus = 'error';
      renderPrices();
    }
  });
  on(root.querySelector('#open-search'), 'click', openSearch);
  on(root.querySelector('#language-toggle'), 'click', (event) => {
    const next = event.target.closest('[data-language]')?.dataset.language;
    if (!next || next === language) return;

    const view = readView();
    if (main.querySelector('#planner')) {
      const nextFormat = new Intl.NumberFormat(next, { maximumFractionDigits: 20 });
      view.inputs = view.inputs.map((value, index) => {
        const amount = parseAmount(value, index === 2);
        return Number.isFinite(amount) ? nextFormat.format(amount) : value;
      });
    }
    language = next;
    try {
      localStorage.setItem(languageKey, next);
    } catch {
      // Language still applies in this tab when browser storage is unavailable.
    }
    render(false, view);
  });
  on(searchInput, 'input', searchSite);
  on(searchInput, 'keydown', (event) => {
    if (event.key === 'Enter') searchResults.querySelector('button')?.click();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      searchResults.querySelector('button')?.focus();
    }
  });
  on(searchResults, 'click', (event) => {
    const route = event.target.closest('[data-route]')?.dataset.route;
    if (!route) return;
    searchDialog.close();
    if (location.hash === route) render(true);
    else location.hash = route;
  });
  on(document, 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });
  on(root.querySelector('.skip'), 'click', (event) => {
    event.preventDefault();
    main.focus();
  });
  on(window, 'hashchange', () => render(true));
  render();
  return () => events.abort();
}
