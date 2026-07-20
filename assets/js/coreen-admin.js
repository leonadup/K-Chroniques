import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

/** Petit formulaire pour enrichir le contenu directement depuis le site,
 * sans repasser par le SQL Editor. `onAdded` recharge la vue d'ensemble. */
export function renderAddWordForm(container, units, onAdded) {
  container.innerHTML = `
    <details class="kr-add-word">
      <summary>+ Ajouter un mot</summary>
      <div class="mf-panel" style="margin-top:12px;">
        <div class="field">
          <label>Unité</label>
          <select id="kr-new-unit">
            ${units.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.title)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Coréen</label>
          <input type="text" id="kr-new-korean" placeholder="안녕하세요" />
        </div>
        <div class="field">
          <label>Romanisation</label>
          <input type="text" id="kr-new-romanization" placeholder="annyeonghaseyo" />
        </div>
        <div class="field">
          <label>Français</label>
          <input type="text" id="kr-new-french" placeholder="Bonjour" />
        </div>
        <div class="field">
          <label>Note (optionnel)</label>
          <input type="text" id="kr-new-note" placeholder="formel, contexte d'usage..." />
        </div>
        <p class="error-text" id="kr-new-error" style="display:none"></p>
        <button class="btn" id="kr-new-save">Ajouter</button>
      </div>
    </details>
  `;

  document.getElementById('kr-new-save').addEventListener('click', async () => {
    const errorEl = document.getElementById('kr-new-error');
    errorEl.style.display = 'none';

    const unitId = document.getElementById('kr-new-unit').value;
    const korean = document.getElementById('kr-new-korean').value.trim();
    const romanization = document.getElementById('kr-new-romanization').value.trim();
    const french = document.getElementById('kr-new-french').value.trim();
    const note = document.getElementById('kr-new-note').value.trim();

    if (!korean || !french) {
      errorEl.textContent = 'Coréen et Français sont requis.';
      errorEl.style.display = 'block';
      return;
    }

    const { data: countRows } = await supabase.from('coreen_items').select('id').eq('unit_id', unitId);
    const nextSortOrder = (countRows || []).length + 1;

    const { error } = await supabase.from('coreen_items').insert({
      unit_id: unitId,
      korean,
      romanization: romanization || null,
      french,
      note: note || null,
      sort_order: nextSortOrder
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
      return;
    }

    await onAdded();
  });
}
