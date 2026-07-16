import { supabase } from './supabase-client.js';
import { CIRCLES } from './circles.js';
import { escapeHtml } from './utils.js';

export async function countPendingQuestions() {
  const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  return count || 0;
}

export async function renderQuestionsAdmin(container) {
  const { data, error } = await supabase
    .from('questions')
    .select('id, circle_id, author_name, question_text, status, reply_text, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }

  const questions = data || [];

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 18px;">Boîte à questions</p>
    ${
      questions.length === 0
        ? `<p class="hint-text">Aucune question pour l'instant.</p>`
        : `<div class="adm-list">
        ${questions
          .map(
            (q) => `
          <div class="adm-list-item" style="flex-direction:column; align-items:flex-start; gap:8px; cursor:default;">
            <div style="display:flex; justify-content:space-between; width:100%;">
              <span class="adm-list-item-meta">
                ${CIRCLES[q.circle_id]?.label ?? q.circle_id}${q.author_name ? ' · ' + escapeHtml(q.author_name) : ''} ·
                ${new Date(q.created_at).toLocaleDateString('fr-FR')}
              </span>
              <button class="btn-link" data-toggle-question="${q.id}" data-status="${q.status}">
                ${q.status === 'pending' ? 'Marquer répondue' : 'Remettre en attente'}
              </button>
            </div>
            <p style="margin:0; font-size:14px;">${escapeHtml(q.question_text)}</p>
            ${q.status === 'answered' ? `<span class="adm-answered-tag">Répondue</span>` : ''}
            <div class="adm-reply-form">
              <textarea placeholder="Ta réponse (visible par la personne qui a posé la question)..." data-reply-text="${q.id}">${escapeHtml(q.reply_text || '')}</textarea>
              <button class="btn-link" data-save-reply="${q.id}">Enregistrer la réponse</button>
              <span class="hint-text" data-reply-saved="${q.id}" style="display:none;">Réponse enregistrée.</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>`
    }
  `;

  container.querySelectorAll('[data-toggle-question]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextStatus = btn.dataset.status === 'pending' ? 'answered' : 'pending';
      await supabase.from('questions').update({ status: nextStatus }).eq('id', btn.dataset.toggleQuestion);
      await renderQuestionsAdmin(container);
      await refreshQuestionsBadge();
    });
  });

  container.querySelectorAll('[data-save-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.saveReply;
      const textarea = container.querySelector(`[data-reply-text="${id}"]`);
      const reply = textarea.value.trim();
      const { error: saveError } = await supabase
        .from('questions')
        .update({ reply_text: reply || null, status: reply ? 'answered' : 'pending' })
        .eq('id', id);
      if (!saveError) {
        const saved = container.querySelector(`[data-reply-saved="${id}"]`);
        saved.style.display = 'inline';
        setTimeout(() => (saved.style.display = 'none'), 2000);
        await refreshQuestionsBadge();
      }
    });
  });

  await refreshQuestionsBadge();
}

export async function refreshQuestionsBadge() {
  const badge = document.getElementById('questions-badge');
  if (!badge) return;
  const count = await countPendingQuestions();
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}
