import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

const MOODS = [
  { emoji: '😢', label: 'Difficile', color: 'var(--red)' },
  { emoji: '😕', label: 'Pas terrible', color: 'var(--persimmon)' },
  { emoji: '😐', label: 'Neutre', color: 'var(--gold)' },
  { emoji: '🙂', label: 'Bien', color: 'var(--celadon)' },
  { emoji: '😄', label: 'Top', color: 'var(--celadon)' }
];
const moodColor = (emoji) => MOODS.find((m) => m.emoji === emoji)?.color || 'var(--line)';

export async function renderJournal(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderView(container, data || []);
}

function renderView(container, entries) {
  let selectedMood = null;

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Journal</p>
    <p class="hint-text" style="margin-bottom:16px;">Strictement privé — jamais visible des cercles, même pas "Moi" ne le partage nulle part ailleurs.</p>

    ${moodStripHtml(entries)}

    <div class="mf-panel">
      <div class="field">
        <label>Date</label>
        <input type="date" id="jr-date" value="${new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="field">
        <label>Humeur (optionnel)</label>
        <div class="jr-mood-picker" id="jr-mood-picker">
          ${MOODS.map((m) => `<button type="button" class="jr-mood-btn" data-mood="${m.emoji}" title="${m.label}">${m.emoji}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Comment tu te sens, ce qui s'est passé...</label>
        <textarea id="jr-body" style="min-height:120px;"></textarea>
      </div>
      <button class="btn" id="jr-add">Écrire</button>
    </div>

    <div class="adm-list" id="jr-list">
      ${entries.length === 0 ? `<p class="hint-text">Pas encore d'entrée.</p>` : entries.map((e) => entryHtml(e)).join('')}
    </div>
  `;

  document.getElementById('jr-mood-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mood]');
    if (!btn) return;
    selectedMood = selectedMood === btn.dataset.mood ? null : btn.dataset.mood;
    container.querySelectorAll('.jr-mood-btn').forEach((b) => b.classList.toggle('active', b.dataset.mood === selectedMood));
  });

  document.getElementById('jr-add').addEventListener('click', async () => {
    const body = document.getElementById('jr-body').value.trim();
    if (!body) return;
    const payload = {
      entry_date: document.getElementById('jr-date').value || new Date().toISOString().slice(0, 10),
      mood: selectedMood,
      body
    };
    const { data, error } = await supabase.from('journal_entries').insert(payload).select().single();
    if (!error && data) {
      entries.unshift(data);
      renderView(container, entries);
    }
  });

  container.querySelectorAll('[data-journal-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette entrée définitivement ?')) return;
      const id = btn.dataset.journalDelete;
      await supabase.from('journal_entries').delete().eq('id', id);
      renderView(container, entries.filter((e) => e.id !== id));
    });
  });
}

function moodStripHtml(entries) {
  const recent = entries.filter((e) => e.mood).slice(0, 30).reverse();
  if (recent.length === 0) return '';
  return `
    <div class="jr-mood-strip" title="Ton humeur au fil du temps (les plus récentes à droite)">
      ${recent.map((e) => `<span class="jr-mood-dot" style="background:${moodColor(e.mood)}" title="${escapeHtml(formatDate(e.entry_date))} — ${escapeHtml(e.mood)}"></span>`).join('')}
    </div>
  `;
}

function entryHtml(entry) {
  return `
    <div class="adm-list-item" style="cursor:default; align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <span class="adm-list-item-meta">${formatDate(entry.entry_date)} ${entry.mood ? `· ${entry.mood}` : ''}</span>
        <button class="mf-del" data-journal-delete="${entry.id}" title="Supprimer">${icon('x', 13)}</button>
      </div>
      <p style="margin:0; font-size:14.5px; white-space:pre-wrap;">${escapeHtml(entry.body)}</p>
    </div>
  `;
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
