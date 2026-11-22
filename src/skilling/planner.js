import sheets from './sheets.json';
import market from './market.js';
import { readAmount } from './amounts.js';
import { catalog, evaluateMethod, levelFromXp, maxXp, methodAccess } from './training.js';
import { loadPreferences, savePreferences, skillPreferences } from './preferences.js';
import { attachMethodEditor, editorMarkup } from './method-editor.js';
import { attachFossils, fossilMarkup } from './fossils.js';
import { attachPraygility, praygilityMarkup } from './praygility-controls.js';
import { defaultTrade } from './trade.js';
import { protectionModes, treeGroups } from './trees.js';

export function mountSkilling(root, api) {
  const events = new AbortController();
  const { signal } = events;
  const on = (element, event, handler) => element.addEventListener(event, handler, { signal });
  const preferences = loadPreferences();
  const trade = preferences.trade = {
    buy: preferences.trade?.buy === 'slow' ? 'slow' : defaultTrade.buy,
    sell: preferences.trade?.sell === 'slow' ? 'slow' : defaultTrade.sell,
  };

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
    craft: { name: ['Crafting', 'Crafting'], icon: '◇', color: '#efbf9b', description: ['Compare dragonhide bodies, battlestaves, and gem cutting.', 'Compare armaduras de couro de dragão, cajados de batalha e corte de gemas.'] },
    farming: { name: ['Trees', 'Árvores'], icon: '♣', color: '#abd586', description: ['Compare regular, fruit, hardwood, and special trees with your choice of protection.', 'Compare árvores comuns, frutíferas, de madeira dura e especiais com a proteção que escolher.'] },
    herblore: { name: ['Herblore', 'Herblore'], icon: '⚗', color: '#9dd4b5', description: ['Compare potion costs, returns, and XP rates.', 'Compare o custo, o retorno e o XP das poções da planilha.'] },
    prayer: { name: ['Prayer', 'Prayer'], icon: '✦', color: '#f0d793', description: ['Compare regular Prayer training and assess the fossils you own.', 'Compare o treino de Oração e avalie os fósseis que você tem.'] },
    rc: { name: ['Runecraft', 'Runecraft'], icon: '◈', color: '#d0b6ed', description: ['Compare solo routes, runners, and Guardians of the Rift.', 'Compare runs solo, runners e Guardians of the Rift.'] },
    flipping: { name: ['Flipping', 'Flipping'], icon: '◉', color: '#e7bf77', description: ['Check prices and margins for 3-dose and 4-dose potions.', 'Consulte preços e margens de poções de 3 e 4 doses.'] },
    xp: { name: ['XP Table', 'Tabela de XP'], icon: '▤', color: '#a6c9e9', description: ['Look up total XP and calculate the XP between two levels.', 'Consulte o XP acumulado e calcule o XP entre dois níveis.'] },
  };
  const training = ['cons', 'craft', 'farming', 'herblore', 'prayer', 'rc'];
  const prefsFor = Object.fromEntries(training.map((id) => [id, skillPreferences(preferences, id)]));
  const reference = ['flipping', 'xp'];
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
  let oneDecimal;
  let precise;
  let editableNumber;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const normalize = (value) => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const valueText = (value, format, unit = '') => value === null ? '—' : `${format.format(value || 0)}${unit}`;
  const money = (amount) => amount === null ? '—' : `${amount > 0 ? '+' : ''}${decimal.format(amount || 0)} M`;
  const xpRate = (rate) => rate === null ? '—' : Number.isFinite(rate) ? `${oneDecimal.format(rate / 1000)}k` : integer.format(rate);

  const plannerAmount = (value, index) => readAmount(value, language, index === 2 ? 'income' : 'xp');

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
    for (const group of root.querySelectorAll('[data-trade-group]')) {
      const buy = group.dataset.tradeGroup === 'buy';
      group.setAttribute('aria-label', buy ? t('Buy speed', 'Velocidade de compra') : t('Sell speed', 'Velocidade de venda'));
      group.querySelector('span').textContent = buy ? t('Buy', 'Comprar') : t('Sell', 'Vender');
    }
    for (const option of root.querySelectorAll('[data-trade]')) {
      const { trade: side, speed } = option.dataset;
      option.setAttribute('aria-pressed', String(trade[side] === speed));
      option.textContent = speed === 'instant' ? t('Instant', 'Imediata') : t('Slow', 'Lenta');
    }
    root.querySelector('#trade-tax').textContent = t('2% GE seller tax where applicable', 'Imposto de venda de 2% no Mercado Geral quando aplicável');
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
    const prefs = prefsFor[id];
    return [...catalog(id, constructionMethods), ...prefs.custom].filter((method) => !prefs.overrides[method.id]?.hidden).length;
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
        return direction * (typeof x === 'number' ? x - y : x.localeCompare(y, language));
      });
      body.innerHTML = visible.length
        ? visible.map(({ cells, access }) => `<tr${access && access !== 'unlocked' ? ' class="method-locked"' : ''}>${cells.map((cell, index) => index ? `<td>${cell}</td>` : `<th scope="row">${cell}</th>`).join('')}</tr>`).join('')
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
        const amounts = market.boatValue(marketQuotes, method.group, method.tier, method.quantity, trade) ?? method;
        const net = amounts.value - amounts.materials;
        const cells = [method.level];
        if (group === 'kits') cells.push(method.quantity);
        cells.push(amounts.materials, amounts.value, net, method.xp, method.rate, net / method.xp);
        return `<tr><th scope="row">${method.name}</th>${cells.map((value, index) => `<td>${index === cells.length - 2 ? xpRate(value) : decimal.format(value)}</td>`).join('')}</tr>`;
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
    const { settings, raw } = sheets[id];
    const prefs = prefsFor[id];
    const builtIn = catalog(id, constructionMethods, prefs.protection);
    const praygility = builtIn.find((method) => method.magic);
    const allMethods = () => [...builtIn, ...prefs.custom];
    const persist = () => savePreferences(preferences);
    const rateOverride = (method) => {
      const rate = prefs.overrides[method.id]?.rate;
      return Number.isFinite(rate) && rate > 0 ? rate : undefined;
    };
    const fields = [t('Current XP', 'XP atual'), t('XP goal', 'Meta de XP'), t('Alternative income (M GP/h)', 'Renda alternativa (M GP/h)')];
    const groupOptions = id === 'cons' || id === 'farming'
      ? Object.entries(id === 'cons' ? constructionGroups : treeGroups).map(([key, labels]) => [key, t(...labels)]) : [];
    const segment = groupOptions.length ? `<select id="segment" aria-label="${t('Method group', 'Grupo de métodos')}">
      <option value="all">${t('All groups', 'Todos os grupos')}</option>
      ${groupOptions.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select>` : '';
    const protection = id === 'farming' ? `<section class="box planner">
      <div class="planner-head"><h2>${t('Tree protection', 'Proteção das árvores')}</h2></div>
      <div class="protection-options" id="tree-protection" role="group" aria-label="${t('Tree protection method', 'Método de proteção das árvores')}">
        ${Object.entries(protectionModes).map(([key, mode]) => `<button type="button" class="ghost" data-protection="${key}" aria-pressed="${prefs.protection === key}">${t(...mode.name)}</button>`).join('')}
      </div>
      <p class="amount-hint">${t('XP rates count active run time and exclude harvesting. Where survival is unknown, rates assume no losses. Untradeable supplies are excluded from GP costs.',
        'As taxas de XP contam o tempo ativo das rotas e excluem a colheita. Quando a sobrevivência é desconhecida, a estimativa desconsidera perdas. Materiais não negociáveis ficam fora dos custos.')}</p>
    </section>` : '';
    const topControls = `<div class="top-control"><button class="ghost" id="top-methods" type="button" aria-pressed="${prefs.top}">${t('Show top', 'Ver melhores')}</button>
      <input id="top-count" type="number" min="1" max="999" step="1" value="${prefs.topCount}" aria-label="${t('Number of top methods', 'Número de melhores métodos')}"></div>`;
    main.innerHTML = `${heading(id)}${hiscoresForm(id)}<form class="planner box" id="planner" novalidate>
      <div class="planner-head"><h2>${t('XP planner', 'Planejador de XP')}</h2><button class="ghost" type="reset">${t('Restore defaults', 'Restaurar valores')}</button></div>
      <div class="fields">${fields.map((label, index) => `<label>${label}<input type="text" data-amount required autocomplete="off" value="${editableNumber.format(settings[index])}"></label>`).join('')}</div>
      <p class="amount-hint">${t('Use k or m, for example 2.5m XP or 750k GP/h.', 'Use k ou m, por exemplo 2,5m de XP ou 750k GP/h.')}</p>
      <p class="plan-status" id="plan-status" aria-live="polite"></p>
    </form>${praygility ? praygilityMarkup(t, prefs.agility, editableNumber.format) : ''}${protection}
    ${editorMarkup(t)}<div class="method-summary" id="metrics"></div>
    ${tableFrame(t('Method comparison', 'Comparação de métodos'), t('Filter methods', 'Filtrar métodos'), segment + topControls)}
    ${id === 'craft' ? `<p class="amount-hint">${t('Gem cutting assumes 2,700 attempts per hour with a regular chisel. Semi-precious gems account for crushing at your Crafting level.',
      'O corte usa 2.700 tentativas por hora com um cinzel comum. Gemas semipreciosas consideram a chance de quebrar no seu nível de Artesanato.')}</p>` : ''}
    ${id === 'herblore' ? `<p class="amount-hint">${t('Super Combat uses one Torstol and one each of 4-dose Super attack, strength, and defence. It earns 150 XP and returns two empty vials per mix.',
      'Super Combat usa um Torstol e uma poção de 4 doses de cada tipo: Super attack, strength e defence. Cada mistura concede 150 XP e devolve dois frascos vazios.')}</p>` : ''}
    ${id === 'prayer' ? fossilMarkup(t, prefs, integer) : ''}
    ${id === 'cons' ? constructionSource() : ''}${rawTable(raw)}`;

    const form = root.querySelector('#planner');
    const inputs = Array.from(form.querySelectorAll('input'));
    const status = root.querySelector('#plan-status');
    const metrics = root.querySelector('#metrics');
    const filter = root.querySelector('#filter');
    const channel = root.querySelector('#segment');
    const topButton = root.querySelector('#top-methods');
    const topCount = root.querySelector('#top-count');
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
    labels.push(t('Level req.', 'Nível exigido'), 'GP/XP');
    if (id === 'farming') labels.push(t('Growth (h)', 'Crescimento (h)'), t('Protection (GP)', 'Proteção (GP)'), t('Survival', 'Sobrevivência'));
    const groupLabel = (group) => id === 'farming' && treeGroups[group] ? t(...treeGroups[group]) : '';
    let visibleIds = new Set();
    const table = makeTable(labels, (row) => visibleIds.has(row.id), 4, { 1: -1, 5: -1, 7: -1 }, view.sort);
    const save = () => { persist(); update(); };
    const updatePraygility = praygility ? attachPraygility({ section: root.querySelector('#praygility-controls'),
      agility: prefs.agility, language, t, format: editableNumber.format, formatRate: xpRate, onChange: save }) : null;
    attachMethodEditor({ form: root.querySelector('#edit-method'), methods: allMethods, prefs, t, language,
      format: (value) => editableNumber.format(value), escape: escapeHtml, groupLabel, onSave: save, selected: view.editor, skill: id });
    const updateFossils = id === 'prayer' ? attachFossils({ section: root.querySelector('#fossils'), prefs, t,
      integer, decimal: oneDecimal, escape: escapeHtml, onSave: persist, onChange: update }) : null;

    function update() {
      const [current, goal, gp] = inputs.map((input, index) => plannerAmount(input.value, index));
      const isXp = (xp) => Number.isInteger(xp) && xp >= 0 && xp <= maxXp;
      const validFields = [isXp(current), isXp(goal), Number.isFinite(gp) && gp >= .001 && gp <= 100000];
      const valid = validFields.every(Boolean);
      inputs.forEach((input, index) => input.setAttribute('aria-invalid', String(!validFields[index])));
      const remaining = Math.max(0, goal - current);
      const skillLevel = validFields[0] ? levelFromXp(current) : null;
      const plan = { remaining, gp, valid, agility: prefs.agility, trade, protection: prefs.protection, skillLevel };
      const matches = allMethods().filter((method) => !prefs.overrides[method.id]?.hidden)
        .map((method) => ({ ...evaluateMethod(method, id, settings, marketQuotes, plan, rateOverride(method), prefs.overrides[method.id]?.salePrice),
          access: methodAccess(method, skillLevel, prefs.agility?.magicLevel) }));
      const query = normalize(filter.value);
      const ranked = matches.filter((method) => inChannel(method.group)
        && (normalize(method.name).includes(query) || (method.recipeName && normalize(method.recipeName).includes(query))))
        .sort((a, b) => (a.combined ?? Infinity) - (b.combined ?? Infinity) || b.rate - a.rate);
      const unlocked = ranked.filter((method) => method.access === 'unlocked');
      const options = prefs.top ? unlocked.slice(0, prefs.topCount) : ranked;
      visibleIds = new Set(options.map(({ id }) => id));
      const considered = prefs.top ? options : unlocked;
      const quickest = considered.find((method) => method.combined !== null);
      const topRate = considered.reduce((best, method) => !best || method.rate > best.rate ? method : best, null);
      const bestBalance = considered.filter((method) => method.balance !== null)
        .reduce((best, method) => !best || method.balance > best.balance ? method : best, null);
      status.classList.toggle('error', !valid);
      status.innerHTML = !valid ? t('Enter whole XP values from 0 to 200 million and a positive income rate.', 'Informe XP inteiro entre 0 e 200 milhões e uma renda positiva.')
        : remaining === 0 ? `<strong>${t('XP goal reached.', 'Meta de XP atingida.')}</strong>`
        : `${t('XP remaining', 'XP restante')} <strong>${integer.format(remaining)}</strong> · ${t('Current level', 'Nível atual')} <strong>${skillLevel}</strong>`;

      const metric = (label, option, value) => `<div class="metric box"><span>${label}</span><strong>${option ? escapeHtml(option.name) : '—'}</strong>${option ? `<small>${value}</small>` : ''}</div>`;
      metrics.innerHTML = metric(t('Shortest adjusted time', 'Menor tempo ajustado'), valid && remaining ? quickest : null, valueText(quickest?.combined ?? null, oneDecimal, ' h'))
        + metric(t('Highest XP rate', 'Maior taxa de XP'), topRate, `${xpRate(topRate?.rate ?? null)} XP/h`)
        + metric(t('Best net GP', 'Melhor saldo'), valid && remaining ? bestBalance : null, money(bestBalance?.balance ?? null));
      table(matches.map((method) => {
        const badge = valid && remaining && method === quickest ? ` <span class="tag">${t('Shortest time', 'Menor tempo')}</span>` : '';
        const values = [method.name, method.rate, method.practice, method.gpHours, method.combined, method.balance];
        const originalPrice = marketQuotes && !method.wikiPriced && !method.custom ? `<sup class="quote-source" title="${t('Source price', 'Preço original')}">*</sup>` : '';
        const cells = [`<span class="row-name">${escapeHtml(method.name)}${badge}</span>`, xpRate(method.rate),
          valueText(method.practice, oneDecimal), valueText(method.gpHours, oneDecimal), valueText(method.combined, oneDecimal),
          `<span class="${method.balance > 0 ? 'good' : method.balance < 0 ? 'warn' : ''}">${money(method.balance)}</span>${originalPrice}`];
        values.push(method.level, method.netPerXp);
        const lock = method.access === 'locked' ? t('Locked', 'Bloqueado')
          : method.access === 'unknown' ? t('Level unknown', 'Nível desconhecido') : '';
        cells.push(`${integer.format(method.level)}${method.magic ? ` ${t('Magic', 'Magia')}` : ''}${lock ? ` <small>${lock}</small>` : ''}`, valueText(method.netPerXp, decimal));
        if (id === 'farming') {
          const growth = method.tree ? method.tree.growthMinutes / 60 : null;
          const expected = method.treeEstimate;
          values.push(growth, expected?.protectionCost ?? null, expected?.survival ?? null);
          cells.push(valueText(growth, oneDecimal), valueText(expected?.protectionCost ?? null, integer),
            valueText(expected?.survival == null ? null : 100 * expected.survival, oneDecimal, '%'));
        }
        return { id: method.id, values, cells, access: method.access };
      }), prefs.top ? t('Showing the shortest adjusted times among unlocked methods.', 'Exibindo os menores tempos ajustados entre os métodos desbloqueados.')
        : marketQuotes ? t('Wiki quotes use the selected buy and sell speeds. GE proceeds include 2% seller tax where applicable. * Source estimate.',
        'As cotações da Wiki usam as velocidades de compra e venda escolhidas. A receita do Mercado Geral inclui imposto de 2% quando aplicável. * Estimativa original.')
        : t('Adjusted time includes the hours needed to earn GP and subtracts the equivalent hours for a profit.',
          'O tempo ajustado inclui as horas necessárias para obter GP e desconta as horas equivalentes ao lucro.'));
      updateFossils?.({ remaining, gp, valid, quotes: marketQuotes, methods: matches, trade });
      if (updatePraygility) updatePraygility(rateOverride(praygility) ?? praygility.rate);
    }
    form.addEventListener('submit', (event) => event.preventDefault());
    form.addEventListener('input', () => {
      for (const input of inputs.slice(0, 2)) {
        if (plannerAmount(input.value, 0) === maxXp) input.value = editableNumber.format(maxXp);
      }
      update();
    });
    inputs.forEach((input, index) => input.addEventListener('blur', () => {
      if (input.getAttribute('aria-invalid') === 'false') input.value = editableNumber.format(plannerAmount(input.value, index));
    }));
    form.addEventListener('reset', (event) => {
      event.preventDefault();
      inputs.forEach((input) => { input.value = input.defaultValue; });
      update();
    });
    filter.addEventListener('input', update);
    channel?.addEventListener('change', update);
    topButton.addEventListener('click', () => {
      prefs.top = !prefs.top;
      topButton.setAttribute('aria-pressed', String(prefs.top));
      save();
    });
    topCount.addEventListener('input', () => {
      if (!topCount.validity.valid || !topCount.value) return;
      prefs.topCount = topCount.valueAsNumber;
      save();
    });
    topCount.addEventListener('blur', () => { topCount.value = prefs.topCount; });
    root.querySelector('#tree-protection')?.addEventListener('click', (event) => {
      const key = event.target.closest('[data-protection]')?.dataset.protection;
      if (!Object.hasOwn(protectionModes, key) || prefs.protection === key) return;
      prefs.protection = key;
      persist();
      render(false, readView());
      root.querySelector(`[data-protection="${key}"]`).focus();
    });
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
    if (!isXP) labels.push(t('Level req.', 'Nível exigido'));
    const table = makeTable(labels, ({ values }) => normalize(values[0]).includes(normalize(filter.value)), isXP ? 0 : 5, { 5: -1 }, view.sort);
    const displayRows = rows.map((row) => {
      const values = usePrices ? [row[0], ...(market.flip(marketQuotes, row[0], trade) ?? Array(5).fill(null))] : [...row];
      const cells = values.map((value, index) => typeof value === 'string'
        ? `<span class="row-name">${escapeHtml(value)}</span>` : valueText(value, isXP && index === 3 ? precise : decimal));
      if (!isXP) {
        values.push(null);
        cells.push(t('None', 'Nenhum'));
      }
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
    oneDecimal = new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
        const prefs = prefsFor[id];
        const names = prefs ? [...catalog(id, constructionMethods), ...prefs.custom]
          .filter((method) => !prefs.overrides[method.id]?.hidden).map(({ name }) => name)
          : sheets[id].rows.map(([name]) => name);
        const matches = new Set(names);
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
      editor: main.querySelector('#edit-method select')?.value,
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
        const magic = playerProfile.xp?.magic;
        prefsFor.prayer.agility.magicLevel = Number.isFinite(magic) ? levelFromXp(magic) : null;
        savePreferences(preferences);
        playerStatus = 'found';
      } else playerStatus = 'error';
    } catch {
      playerStatus = 'error';
    }
    if (!signal.aborted) render(false, { ...readView(), applyPlayer: playerStatus === 'found' });
  }

  async function updatePrices() {
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
  }
  on(root.querySelector('#refresh-prices'), 'click', updatePrices);
  on(root.querySelector('#trade-options'), 'click', (event) => {
    const option = event.target.closest('[data-trade]');
    if (!option) return;
    const { trade: side, speed } = option.dataset;
    if (trade[side] === speed) return;
    trade[side] = speed;
    savePreferences(preferences);
    render(false, readView());
    if (!marketQuotes) updatePrices();
  });
  on(root.querySelector('#open-search'), 'click', openSearch);
  on(root.querySelector('#language-toggle'), 'click', (event) => {
    const next = event.target.closest('[data-language]')?.dataset.language;
    if (!next || next === language) return;

    const view = readView();
    if (main.querySelector('#planner')) {
      const nextFormat = new Intl.NumberFormat(next, { maximumFractionDigits: 20 });
      view.inputs = view.inputs.map((value, index) => {
        const amount = plannerAmount(value, index);
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
  if (trade.buy !== defaultTrade.buy || trade.sell !== defaultTrade.sell) updatePrices();
  return () => events.abort();
}
