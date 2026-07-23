import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

export async function renderQuickNotes(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('quick_notes').select('*').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderList(container, data || []);
}

function renderList(container, notes) {
  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 16px;">Bloc-notes</p>
    <div class="mf-panel">
      <textarea id="qn-input" placeholder="Un mot entendu dans la rue, une idée de récit, un truc à acheter..." style="min-height:70px;"></textarea>
      <button class="btn" id="qn-add" style="margin-top:10px;">Ajouter</button>
    </div>
    <div class="adm-list" id="qn-list">
      ${
        notes.length === 0
          ? `<p class="hint-text">Rien pour l'instant.</p>`
          : notes.map((n) => noteHtml(n)).join('')
      }
    </div>
  `;

  document.getElementById('qn-add').addEventListener('click', async () => {
    const input = document.getElementById('qn-input');
    const body = input.value.trim();
    if (!body) return;
    const { data, error } = await supabase.from('quick_notes').insert({ body }).select().single();
    if (!error && data) {
      notes.unshift(data);
      renderList(container, notes);
    }
  });

  container.querySelectorAll('[data-note-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.noteDelete;
      await supabase.from('quick_notes').delete().eq('id', id);
      renderList(container, notes.filter((n) => n.id !== id));
    });
  });
}

function noteHtml(note) {
  return `
    <div class="adm-list-item" style="cursor:default; align-items:flex-start;">
      <span style="white-space:pre-wrap; font-size:14px;">${escapeHtml(note.body)}</span>
      <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
        <span class="adm-list-item-meta">${new Date(note.created_at).toLocaleDateString('fr-FR')}</span>
        <button class="mf-del" data-note-delete="${note.id}" title="Supprimer">${icon('x', 13)}</button>
      </div>
    </div>
  `;
}
