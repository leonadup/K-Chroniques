import { supabase } from './supabase-client.js';
import { CIRCLES } from './circles.js';
import { escapeHtml } from './utils.js';

export async function countUnreadDiscussions() {
  const { data } = await supabase.from('discussions').select('id, last_message_at, last_seen_by_moi_at').eq('last_message_is_moi', false);
  if (!data) return 0;
  return data.filter((d) => !d.last_seen_by_moi_at || d.last_message_at > d.last_seen_by_moi_at).length;
}

export async function refreshDiscussionsBadge() {
  const badge = document.getElementById('discussions-badge');
  if (!badge) return;
  const count = await countUnreadDiscussions();
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

export async function renderDiscussionsAdmin(container) {
  const { data, error } = await supabase
    .from('discussions')
    .select('*, discussion_messages(*)')
    .order('last_message_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }

  const discussions = data || [];

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 18px;">Discussions</p>
    ${
      discussions.length === 0
        ? `<p class="hint-text">Aucune discussion pour l'instant.</p>`
        : `<div class="adm-list">${discussions.map((d) => threadRowHtml(d)).join('')}</div>`
    }
  `;

  container.querySelectorAll('[data-thread-open]').forEach((el) => {
    el.addEventListener('click', () => renderThreadDetailAdmin(container, el.dataset.threadOpen));
  });

  await refreshDiscussionsBadge();
}

function isUnreadForMoi(d) {
  if (d.last_message_is_moi) return false;
  return !d.last_seen_by_moi_at || d.last_message_at > d.last_seen_by_moi_at;
}

function threadRowHtml(d) {
  const messages = d.discussion_messages || [];
  return `
    <div class="adm-list-item" data-thread-open="${d.id}">
      <span class="adm-list-item-title">
        ${escapeHtml(CIRCLES[d.circle_id]?.label ?? d.circle_id)} · ${escapeHtml(d.title)}
        ${isUnreadForMoi(d) ? '<span class="adm-unread-dot"></span>' : ''}
      </span>
      <span class="adm-list-item-meta">${messages.length} message${messages.length !== 1 ? 's' : ''} · ${new Date(d.last_message_at).toLocaleDateString('fr-FR')}</span>
    </div>
  `;
}

async function renderThreadDetailAdmin(container, discussionId) {
  await supabase.from('discussions').update({ last_seen_by_moi_at: new Date().toISOString() }).eq('id', discussionId);

  const { data: discussion } = await supabase.from('discussions').select('*').eq('id', discussionId).maybeSingle();
  const { data: messages } = await supabase
    .from('discussion_messages')
    .select('*')
    .eq('discussion_id', discussionId)
    .order('created_at', { ascending: true });

  await refreshDiscussionsBadge();

  if (!discussion) {
    renderDiscussionsAdmin(container);
    return;
  }

  container.innerHTML = `
    <button class="btn-link" id="thread-back-btn" style="margin-bottom:14px;">← Retour à la liste</button>
    <div class="mf-panel">
      <p class="adm-list-item-meta" style="margin-bottom:10px;">${escapeHtml(CIRCLES[discussion.circle_id]?.label ?? discussion.circle_id)}</p>
      <div class="adm-title-edit">
        <input type="text" id="thread-title-input" value="${escapeHtml(discussion.title)}" />
        <button class="btn-link" id="thread-title-save">Enregistrer le titre</button>
        <span class="hint-text" id="thread-title-saved" style="display:none;">Enregistré.</span>
      </div>

      <div class="adm-thread-messages">
        ${
          (messages || []).length === 0
            ? `<p class="hint-text">Pas encore de message.</p>`
            : messages
                .map(
                  (m) => `
          <div class="adm-thread-message ${m.is_moi ? 'moi' : ''}">
            <div class="adm-thread-message-top">
              <span class="adm-thread-message-author">${escapeHtml(m.author_name)}</span>
              <span class="adm-thread-message-date">${new Date(m.created_at).toLocaleString('fr-FR')}</span>
            </div>
            <p class="adm-thread-message-body">${escapeHtml(m.body)}</p>
          </div>
        `
                )
                .join('')
        }
      </div>

      <div class="adm-reply-form" style="margin-top:14px;">
        <textarea id="thread-reply-body" placeholder="Ta réponse..."></textarea>
        <button class="btn-link" id="thread-reply-submit">Envoyer</button>
      </div>
    </div>
  `;

  container.querySelector('#thread-back-btn').addEventListener('click', () => renderDiscussionsAdmin(container));

  container.querySelector('#thread-title-save').addEventListener('click', async () => {
    const title = document.getElementById('thread-title-input').value.trim();
    if (!title) return;
    await supabase.from('discussions').update({ title }).eq('id', discussionId);
    const saved = document.getElementById('thread-title-saved');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });

  container.querySelector('#thread-reply-submit').addEventListener('click', async () => {
    const bodyInput = document.getElementById('thread-reply-body');
    const body = bodyInput.value.trim();
    if (!body) return;
    await supabase.from('discussion_messages').insert({ discussion_id: discussionId, author_name: 'Léona', body, is_moi: true });
    renderThreadDetailAdmin(container, discussionId);
  });
}
