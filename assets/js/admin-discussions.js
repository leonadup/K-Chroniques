import { supabase } from './supabase-client.js';
import { CIRCLES } from './circles.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

export async function countUnreadDiscussions() {
  const { data } = await supabase
    .from('discussions')
    .select('id, last_message_at, last_seen_by_moi_at')
    .eq('last_message_is_moi', false)
    .eq('archived', false);
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

export async function renderDiscussionsAdmin(container, showArchived = false) {
  const { data, error } = await supabase
    .from('discussions')
    .select('*, discussion_messages(*)')
    .eq('archived', showArchived)
    .order('last_message_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }

  const discussions = data || [];

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
      <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0;">${showArchived ? 'Discussions archivées' : 'Discussions'}</p>
      <button class="btn-link" id="toggle-archived-btn">${showArchived ? '← Discussions actives' : 'Voir les archivées'}</button>
    </div>
    ${
      discussions.length === 0
        ? `<p class="hint-text">${showArchived ? 'Aucune discussion archivée.' : "Aucune discussion pour l'instant."}</p>`
        : `<div class="adm-list">${discussions.map((d) => threadRowHtml(d)).join('')}</div>`
    }
  `;

  container.querySelector('#toggle-archived-btn').addEventListener('click', () => renderDiscussionsAdmin(container, !showArchived));

  container.querySelectorAll('[data-thread-open]').forEach((el) => {
    el.addEventListener('click', () => renderThreadDetailAdmin(container, el.dataset.threadOpen, showArchived));
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
        ${escapeHtml(CIRCLES[d.circle_id]?.label ?? d.circle_id)} · ${d.is_private ? icon('lock', 12, 'icon-inline') + ' ' : ''}${escapeHtml(d.title)}
        ${isUnreadForMoi(d) ? '<span class="adm-unread-dot"></span>' : ''}
      </span>
      <span class="adm-list-item-meta">${messages.length} message${messages.length !== 1 ? 's' : ''} · ${new Date(d.last_message_at).toLocaleDateString('fr-FR')}</span>
    </div>
  `;
}

async function renderThreadDetailAdmin(container, discussionId, showArchived = false) {
  await supabase.from('discussions').update({ last_seen_by_moi_at: new Date().toISOString() }).eq('id', discussionId);

  const { data: discussion } = await supabase.from('discussions').select('*').eq('id', discussionId).maybeSingle();
  const { data: messages } = await supabase
    .from('discussion_messages')
    .select('*')
    .eq('discussion_id', discussionId)
    .order('created_at', { ascending: true });

  await refreshDiscussionsBadge();

  if (!discussion) {
    renderDiscussionsAdmin(container, showArchived);
    return;
  }

  // Le fil privé se déverrouille avec le code personnel de son créateur
  // (owner_person_id, voir migration 017) — pas un code séparé à afficher.
  // Le premier message du fil est toujours celui de la personne qui l'a
  // créé (voir createThread dans discussions.js), donc son nom suffit ici.
  const creatorName = (messages || [])[0]?.author_name;

  container.innerHTML = `
    <button class="btn-link" id="thread-back-btn" style="margin-bottom:14px;">← Retour à la liste</button>
    <div class="mf-panel">
      <p class="adm-list-item-meta" style="margin-bottom:10px;">${escapeHtml(CIRCLES[discussion.circle_id]?.label ?? discussion.circle_id)}${discussion.is_private ? ` · ${icon('lock', 11, 'icon-inline')} Privée — s'ouvre avec le code personnel de ${escapeHtml(creatorName || 'son créateur')}` : ''}</p>
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
            <p class="adm-thread-message-body" data-message-body="${m.id}">${escapeHtml(m.body)}</p>
            ${
              m.is_moi
                ? `<div style="display:flex; gap:10px; margin-top:4px;">
              <button class="btn-link" data-message-edit="${m.id}">Modifier</button>
              <button class="btn-link" data-message-delete="${m.id}">Supprimer</button>
            </div>`
                : ''
            }
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

      <div style="display:flex; gap:10px; margin-top:20px; border-top:1px solid var(--line); padding-top:16px;">
        <button class="btn btn-ghost" id="thread-archive-btn">${discussion.archived ? 'Désarchiver' : 'Archiver'}</button>
        <button class="btn btn-danger" id="thread-delete-btn">Supprimer</button>
      </div>
    </div>
  `;

  container.querySelector('#thread-back-btn').addEventListener('click', () => renderDiscussionsAdmin(container, showArchived));

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
    renderThreadDetailAdmin(container, discussionId, showArchived);
  });

  container.querySelector('#thread-archive-btn').addEventListener('click', async () => {
    await supabase.from('discussions').update({ archived: !discussion.archived }).eq('id', discussionId);
    renderDiscussionsAdmin(container, showArchived);
  });

  container.querySelector('#thread-delete-btn').addEventListener('click', async () => {
    if (!confirm('Supprimer cette discussion et tous ses messages, définitivement ?')) return;
    await supabase.from('discussions').delete().eq('id', discussionId);
    renderDiscussionsAdmin(container, showArchived);
  });

  container.querySelectorAll('[data-message-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditMessage(container, messages, btn.dataset.messageEdit, discussionId, showArchived));
  });
  container.querySelectorAll('[data-message-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce message ?')) return;
      await supabase.from('discussion_messages').delete().eq('id', btn.dataset.messageDelete);
      renderThreadDetailAdmin(container, discussionId, showArchived);
    });
  });
}

function startEditMessage(container, messages, messageId, discussionId, showArchived) {
  const message = (messages || []).find((m) => m.id === messageId);
  const bodyEl = container.querySelector(`[data-message-body="${messageId}"]`);
  if (!message || !bodyEl) return;

  bodyEl.outerHTML = `
    <div class="adm-thread-message-body" data-message-body="${messageId}">
      <textarea maxlength="1000" style="width:100%; resize:vertical; min-height:60px;" data-message-edit-input="${messageId}">${escapeHtml(message.body)}</textarea>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn-link" data-message-save="${messageId}">Enregistrer</button>
        <button class="btn-link" data-message-cancel="${messageId}">Annuler</button>
      </div>
    </div>
  `;

  container.querySelector(`[data-message-save="${messageId}"]`).addEventListener('click', async () => {
    const textarea = container.querySelector(`[data-message-edit-input="${messageId}"]`);
    const body = textarea.value.trim();
    if (!body) return;
    await supabase.from('discussion_messages').update({ body }).eq('id', messageId);
    renderThreadDetailAdmin(container, discussionId, showArchived);
  });
  container.querySelector(`[data-message-cancel="${messageId}"]`).addEventListener('click', () => {
    renderThreadDetailAdmin(container, discussionId, showArchived);
  });
}
