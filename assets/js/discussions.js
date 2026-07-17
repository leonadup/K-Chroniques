import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { deriveDiscussionTitle } from './discussion-title.js';

let circleId = null;
let discussions = [];

export async function setupDiscussionsBox(circle) {
  circleId = circle;
  await loadDiscussions();
}

async function loadDiscussions() {
  const { data, error } = await supabase
    .from('discussions')
    .select('*, discussion_messages(*)')
    .eq('circle_id', circleId)
    .order('last_message_at', { ascending: false });

  discussions = error || !data ? [] : data;
  updateDiscussionsBadge();
  renderThreadList();
}

function sortedMessages(d) {
  return [...(d.discussion_messages || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

function getSeenMap() {
  try {
    return JSON.parse(localStorage.getItem(`fds_discussions_seen_${circleId}`) || '{}');
  } catch {
    return {};
  }
}

function setSeenCount(discussionId, count) {
  const map = getSeenMap();
  map[discussionId] = count;
  localStorage.setItem(`fds_discussions_seen_${circleId}`, JSON.stringify(map));
}

function isUnseen(d) {
  const messages = sortedMessages(d);
  if (messages.length === 0) return false;
  const last = messages[messages.length - 1];
  if (!last.is_moi) return false;
  const seenCount = getSeenMap()[d.id] || 0;
  return messages.length > seenCount;
}

function updateDiscussionsBadge() {
  const badge = document.getElementById('discussions-badge');
  if (!badge) return;
  const count = discussions.filter(isUnseen).length;
  badge.textContent = count;
  badge.style.display = count > 0 ? '' : 'none';
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function renderThreadList() {
  const box = document.getElementById('discussion-box');
  box.innerHTML = `
    <div class="fds-question-panel">
      <p class="fds-question-title">Discussions</p>
      <p class="hint-text" style="margin-bottom:12px;">Pose une question, raconte-lui un truc, lance une conversation.</p>
      <div class="fds-comment-form" style="margin-bottom:18px;">
        <input type="text" placeholder="Ton prénom" maxlength="40" id="new-thread-author" />
        <textarea placeholder="De quoi veux-tu parler ?" maxlength="1000" id="new-thread-body"></textarea>
        <button class="btn btn-ghost" id="new-thread-submit">Créer</button>
      </div>
      <div class="fds-thread-list">
        ${discussions.length === 0 ? `<p class="hint-text">Pas encore de discussion ici. Lance-toi !</p>` : discussions.map(threadCardHtml).join('')}
      </div>
    </div>
  `;

  document.getElementById('new-thread-submit').addEventListener('click', createThread);
  box.querySelectorAll('[data-thread-open]').forEach((el) => {
    el.addEventListener('click', () => openThread(el.dataset.threadOpen));
  });
}

function threadCardHtml(d) {
  const messages = sortedMessages(d);
  const lastMsg = messages[messages.length - 1];
  const preview = lastMsg ? (lastMsg.body.length > 80 ? lastMsg.body.slice(0, 80).trimEnd() + '…' : lastMsg.body) : '';
  return `
    <div class="fds-thread-card" data-thread-open="${d.id}" role="button" tabindex="0">
      <div class="fds-thread-card-top">
        <span class="fds-thread-card-title">${escapeHtml(d.title)}</span>
        ${isUnseen(d) ? '<span class="fds-thread-unseen-dot"></span>' : ''}
      </div>
      ${lastMsg ? `<p class="fds-thread-card-preview"><b>${escapeHtml(lastMsg.is_moi ? 'Léona' : lastMsg.author_name)}</b> — ${escapeHtml(preview)}</p>` : ''}
      <span class="fds-thread-card-meta">${messages.length} message${messages.length !== 1 ? 's' : ''} · ${formatDate(d.last_message_at)}</span>
    </div>
  `;
}

async function createThread() {
  const authorInput = document.getElementById('new-thread-author');
  const bodyInput = document.getElementById('new-thread-body');
  const author = authorInput.value.trim();
  const body = bodyInput.value.trim();
  if (!author || !body) return;

  const title = deriveDiscussionTitle(body);
  const { data: discussion, error } = await supabase.from('discussions').insert({ circle_id: circleId, title }).select().single();
  if (error || !discussion) return;

  const { data: message } = await supabase
    .from('discussion_messages')
    .insert({ discussion_id: discussion.id, author_name: author, body, is_moi: false })
    .select()
    .single();

  discussion.discussion_messages = message ? [message] : [];
  discussions = [discussion, ...discussions];
  openThread(discussion.id);
}

function openThread(discussionId) {
  const d = discussions.find((x) => x.id === discussionId);
  if (!d) return;
  const messages = sortedMessages(d);
  setSeenCount(d.id, messages.length);
  updateDiscussionsBadge();

  const box = document.getElementById('discussion-box');
  box.innerHTML = `
    <div class="fds-question-panel">
      <button class="btn-link fds-thread-back" id="thread-back-btn">← Retour aux discussions</button>
      <p class="fds-question-title">${escapeHtml(d.title)}</p>
      <div class="fds-thread-messages">
        ${
          messages.length === 0
            ? `<p class="hint-text">Pas encore de message.</p>`
            : messages
                .map(
                  (m) => `
          <div class="fds-thread-message ${m.is_moi ? 'moi' : ''}">
            <div class="fds-thread-message-top">
              <span class="fds-thread-message-author">${escapeHtml(m.is_moi ? 'Léona' : m.author_name)}</span>
              <span class="fds-thread-message-date">${formatDate(m.created_at)}</span>
            </div>
            <p class="fds-thread-message-body">${escapeHtml(m.body)}</p>
          </div>
        `
                )
                .join('')
        }
      </div>
      <div class="fds-comment-form" style="margin-top:14px;">
        <input type="text" placeholder="Ton prénom" maxlength="40" id="thread-reply-author" />
        <textarea placeholder="Ta réponse..." maxlength="1000" id="thread-reply-body"></textarea>
        <button class="btn btn-ghost" id="thread-reply-submit">Envoyer</button>
      </div>
    </div>
  `;

  document.getElementById('thread-back-btn').addEventListener('click', renderThreadList);
  document.getElementById('thread-reply-submit').addEventListener('click', () => replyToThread(d.id));
}

async function replyToThread(discussionId) {
  const d = discussions.find((x) => x.id === discussionId);
  if (!d) return;
  const authorInput = document.getElementById('thread-reply-author');
  const bodyInput = document.getElementById('thread-reply-body');
  const author = authorInput.value.trim();
  const body = bodyInput.value.trim();
  if (!author || !body) return;

  const { data, error } = await supabase
    .from('discussion_messages')
    .insert({ discussion_id: discussionId, author_name: author, body, is_moi: false })
    .select()
    .single();
  if (error || !data) return;

  d.discussion_messages = [...(d.discussion_messages || []), data];
  d.last_message_at = data.created_at;
  d.last_message_is_moi = false;
  openThread(discussionId);
}
