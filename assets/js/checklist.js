import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

const CATEGORIES = {
  'avant-depart': 'Avant le départ',
  arrivee: 'À l\'arrivée',
  installation: 'Installation',
  autre: 'Autre'
};
export const STALE_DAYS = 10; // au-delà, on signale visuellement (et l'Edge Function checklist-reminder notifie)

export async function renderChecklist(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('checklist_items').select('*').order('created_at', { ascending: true });
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderView(container, data || []);
}

function renderView(container, items) {
  const done = items.filter((it) => it.done).length;
  const byCategory = {};
  items.forEach((it) => {
    const cat = it.category && CATEGORIES[it.category] ? it.category : 'autre';
    (byCategory[cat] ||= []).push(it);
  });
  const categoryOrder = Object.keys(CATEGORIES).filter((c) => byCategory[c]?.length);

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Checklist PVT</p>
    <p class="hint-text" style="margin-bottom:16px;">${done} / ${items.length} fait${done > 1 ? 's' : ''}. Supprime ce qui ne s'applique pas à ta situation, ajoute le reste.</p>

    ${categoryOrder
      .map(
        (cat) => `
      <div class="mf-panel">
        <p class="mf-section-title" style="font-size:15px;">${CATEGORIES[cat]}</p>
        <div class="adm-list">
          ${byCategory[cat].map((it) => itemHtml(it)).join('')}
        </div>
      </div>
    `
      )
      .join('')}

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">+ Ajouter un point</p>
      <div class="field"><label>Titre</label><input type="text" id="ck-title" /></div>
      <div class="field"><label>Note (optionnel)</label><input type="text" id="ck-note" /></div>
      <div class="field">
        <label>Catégorie</label>
        <select id="ck-category">
          ${Object.entries(CATEGORIES).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}
        </select>
      </div>
      <p class="error-text" id="ck-error" style="display:none"></p>
      <button class="btn" id="ck-add">Ajouter</button>
    </div>
  `;

  container.querySelectorAll('[data-ck-toggle]').forEach((box) => {
    box.addEventListener('change', async () => {
      const id = box.dataset.ckToggle;
      const item = items.find((it) => it.id === id);
      if (!item) return;
      item.done = box.checked;
      item.done_at = box.checked ? new Date().toISOString() : null;
      await supabase.from('checklist_items').update({ done: item.done, done_at: item.done_at }).eq('id', id);
      renderView(container, items);
    });
  });

  container.querySelectorAll('[data-ck-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.ckDelete;
      await supabase.from('checklist_items').delete().eq('id', id);
      renderView(container, items.filter((it) => it.id !== id));
    });
  });

  document.getElementById('ck-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('ck-error');
    errorEl.style.display = 'none';
    const title = document.getElementById('ck-title').value.trim();
    if (!title) {
      errorEl.textContent = 'Le titre est requis.';
      errorEl.style.display = 'block';
      return;
    }
    const payload = {
      title,
      note: document.getElementById('ck-note').value.trim() || null,
      category: document.getElementById('ck-category').value
    };
    const { data, error } = await supabase.from('checklist_items').insert(payload).select().single();
    if (error) {
      errorEl.textContent = error.message.includes('duplicate') ? 'Un point avec ce titre existe déjà.' : error.message;
      errorEl.style.display = 'block';
      return;
    }
    items.push(data);
    renderView(container, items);
  });
}

function itemHtml(item) {
  const daysOld = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 86400000);
  const stale = !item.done && daysOld >= STALE_DAYS;
  return `
    <div class="adm-list-item" style="cursor:default;">
      <label style="display:flex; align-items:flex-start; gap:10px; flex:1; cursor:pointer;">
        <input type="checkbox" data-ck-toggle="${item.id}" ${item.done ? 'checked' : ''} style="margin-top:3px;" />
        <span>
          <span class="adm-list-item-title" style="${item.done ? 'text-decoration:line-through; color:var(--ink-soft);' : ''}">${escapeHtml(item.title)}</span>
          ${stale ? `<span class="adm-draft-tag" style="color:var(--persimmon); border-color:var(--persimmon);">en attente depuis ${daysOld}j</span>` : ''}
          ${item.note ? `<br /><span class="adm-list-item-meta">${escapeHtml(item.note)}</span>` : ''}
        </span>
      </label>
      <button class="mf-del" data-ck-delete="${item.id}" title="Supprimer">✕</button>
    </div>
  `;
}
