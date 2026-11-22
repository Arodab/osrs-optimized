import { readAmount } from './amounts.js';

export function editorMarkup(t) {
  return `<details class="raw box method-editor" id="method-editor">
    <summary>${t('Customize methods', 'Personalizar métodos')}</summary>
    <form id="edit-method" class="editor-form" novalidate>
      <div class="editor-select">
        <label>${t('Method to edit', 'Método para editar')}<select name="selected"></select></label>
        <button type="button" class="ghost" data-add>${t('Add custom method', 'Adicionar método personalizado')}</button>
      </div>
      <div data-fields></div>
      <p class="plan-status" data-feedback role="status"></p>
    </form>
  </details>`;
}

export function attachMethodEditor({ form, methods, prefs, t, language, format, escape, groupLabel, onSave, selected, skill }) {
  const picker = form.elements.selected;
  const fields = form.querySelector('[data-fields]');
  const feedback = form.querySelector('[data-feedback]');
  const getMethod = () => methods().find((method) => method.id === picker.value);
  const setMessage = (text, error = false) => {
    feedback.textContent = text;
    feedback.classList.toggle('error', error);
  };

  function populate(next) {
    picker.innerHTML = `<option value="">${t('Choose a method', 'Escolha um método')}</option>` + methods().map((method) => {
      const group = groupLabel(method.group);
      const hidden = prefs.overrides[method.id]?.hidden ? ` · ${t('hidden', 'oculto')}` : '';
      const label = `${method.name}${group ? ` · ${group}` : ''}${hidden}`;
      return `<option value="${escape(method.id)}">${escape(label)}</option>`;
    }).join('') + `<option value="new">${t('New custom method', 'Novo método personalizado')}</option>`;
    picker.value = next ?? '';
    renderFields();
  }

  function renderFields() {
    const method = getMethod();
    const isNew = picker.value === 'new';
    if (!method && !isNew) {
      fields.innerHTML = '';
      return;
    }
    const override = method && prefs.overrides[method.id];
    const custom = isNew || method?.custom;
    const saleOverride = skill === 'craft' && method && !custom;
    const rateLabel = method?.magic ? t('Effective Prayer XP/h at 62k vs. 65k Agility', 'XP/h efetivo de Oração com 62k vs. 65k de Agilidade')
      : t('XP per hour', 'XP por hora');
    fields.innerHTML = `<div class="editor-fields">
      ${custom ? `<label>${t('Method name', 'Nome do método')}<input name="name" maxlength="64" value="${escape(method?.name ?? '')}"></label>` : ''}
      <label>${rateLabel}<input name="rate" value="${method ? format(override?.rate ?? method.rate) : ''}" placeholder="250k"></label>
      ${saleOverride ? `<label>${t('Custom sale GP per item (no GE tax)', 'Venda personalizada em GP por item (sem imposto)')}<input name="sale" inputmode="decimal" placeholder="${t('Use GE price', 'Usar preço do Mercado Geral')}" value="${override?.salePrice != null ? format(override.salePrice) : ''}"></label>` : ''}
      ${custom ? `<label>${t('GP/XP (negative = cost)', 'GP/XP (negativo = custo)')}<input name="net" inputmode="decimal" value="${method ? format(method.balancePerXp) : ''}"></label>
        <label>${t('Level requirement', 'Nível exigido')}<input name="level" type="number" min="1" max="99" value="${method?.level ?? 1}"></label>` : ''}
    </div>
    <div class="editor-actions">
      <label class="inline-check"><input name="hidden" type="checkbox" ${override?.hidden ? 'checked' : ''}>${t('Hide from comparisons', 'Ocultar das comparações')}</label>
      <button type="submit" class="ghost">${t('Save method', 'Salvar método')}</button>
      ${isNew ? '' : `<button type="button" class="ghost" data-reset>${custom ? t('Remove custom method', 'Remover método personalizado') : t('Restore method defaults', 'Restaurar padrão do método')}</button>`}
    </div>`;
  }

  picker.addEventListener('change', () => { setMessage(''); renderFields(); });
  form.querySelector('[data-add]').addEventListener('click', () => {
    picker.value = 'new';
    setMessage('');
    renderFields();
    form.elements.name.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const method = getMethod();
    if (!method && picker.value !== 'new') return;
    const rate = readAmount(form.elements.rate.value, language, 'rate');
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000000) {
      setMessage(t('Enter a positive XP rate up to 1 billion XP/h.', 'Informe uma taxa positiva de até 1 bilhão de XP/h.'), true);
      return;
    }

    const id = method?.id ?? `custom:${crypto.randomUUID()}`;
    const hidden = form.elements.hidden.checked;
    const saleText = form.elements.sale?.value.trim();
    const salePrice = saleText ? readAmount(saleText, language, 'rate') : undefined;
    if (saleText && (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > 1000000000)) {
      setMessage(t('Enter a sale price from 0 to 1 billion GP per item.', 'Informe um preço de venda de 0 a 1 bilhão de GP por item.'), true);
      return;
    }
    if (!method || method.custom) {
      const name = form.elements.name.value.trim();
      const balancePerXp = readAmount(form.elements.net.value, language, 'signed');
      const level = form.elements.level.valueAsNumber;
      if (!name || !Number.isFinite(balancePerXp) || Math.abs(balancePerXp) > 1000000000
        || !Number.isInteger(level) || level < 1 || level > 99) {
        setMessage(t('Enter a name, GP/XP between −1 billion and 1 billion, and a level from 1 to 99.', 'Informe nome, GP/XP entre −1 bilhão e 1 bilhão e um nível de 1 a 99.'), true);
        return;
      }
      const next = { id, name, rate, balancePerXp, level, custom: true, group: 'custom' };
      prefs.custom = method ? prefs.custom.map((item) => item.id === id ? next : item) : [...prefs.custom, next];
      prefs.overrides[id] = { hidden };
    } else {
      prefs.overrides[id] = { hidden, ...(rate === method.rate ? {} : { rate }), ...(salePrice === undefined ? {} : { salePrice }) };
    }
    onSave();
    populate(id);
    setMessage(t('Method settings saved.', 'Configurações do método salvas.'));
  });

  fields.addEventListener('click', (event) => {
    if (!event.target.closest('[data-reset]')) return;
    const method = getMethod();
    if (!method) return;
    if (method.custom) prefs.custom = prefs.custom.filter((item) => item.id !== method.id);
    delete prefs.overrides[method.id];
    onSave();
    populate(method.custom ? '' : method.id);
    picker.focus();
    setMessage(method.custom ? t('Custom method removed.', 'Método personalizado removido.') : t('Default method restored.', 'Método original restaurado.'));
  });

  populate(selected);
}
