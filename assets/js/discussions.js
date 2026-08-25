import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { deriveDiscussionTitle } from './discussion-title.js';
import { getPersonName, getPersonId } from './auth.js';

let circleId = null;
let discussions = [];

// Discussions privées : le déverrouillage n'est mémorisé que le temps de
// l'onglet (sessionStorage), pas façon "souviens-toi de moi" — utile sur un
// appareil partagé par plusieurs personnes du même cercle.
function getUnlockedSet() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(`fds_unlocked_${circleId}`) || '[]'));
  } catch {
    return new Set();
  }
}

function markUnlocked(discussionId) {
  const set = getUnlockedSet();
  set.add(discussionId);
  sessionStorage.setItem(`fds_unlocked_${circleId}`, JSON.stringify([...set]));
}

function isLocked(d) {
  return d.is_private && !getUnlockedSet().has(d.id);
}

function normalizeCode(code) {
  return (code || '').trim().toLowerCase();
}

export async function setupDiscussionsBox(circle) {
  circleId = circle;
  await loadDiscussions();
}

async function loadDiscussions() {
  const { data, error } = await supabase
    .from('discussions')
    .select('*, discussion_messages(*)')
    .eq('circle_id', circleId)
    .eq('archived', false)
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
        <textarea placeholder="De quoi veux-tu parler ?" maxlength="1000" id="new-thread-body"></textarea>
        <label class="check-item" style="margin:8px 0;"><input type="checkbox" id="new-thread-private" /> ${icon('lock', 13, 'icon-inline')} Discussion privée (protégée par un code que tu choisis)</label>
        <div class="field" id="new-thread-private-code-field" style="display:none; flex:1 1 100%; margin:0 0 8px;">
          <label>Code d'accès à choisir</label>
          <input type="text" id="new-thread-private-code" maxlength="80" placeholder="Ex : un mot que toi seule et la personne concernée connaîtrez" />
          <p class="hint-text">Léona voit toujours le contenu sans code. Ce code sert à protéger le fil des autres personnes de ton cercle — communique-le toi-même à qui doit pouvoir le lire.</p>
        </div>
        <p class="error-text" id="new-thread-error" style="display:none; flex:1 1 100%; margin:0;"></p>
        <button class="btn btn-ghost" id="new-thread-submit">Créer</button>
      </div>
      <div class="fds-thread-list">
        ${discussions.length === 0 ? `<p class="hint-text">Pas encore de discussion ici. Lance-toi !</p>` : discussions.map(threadCardHtml).join('')}
      </div>
    </div>
  `;

  document.getElementById('new-thread-submit').addEventListener('click', createThread);
  document.getElementById('new-thread-private').addEventListener('change', (e) => {
    document.getElementById('new-thread-private-code-field').style.display = e.target.checked ? '' : 'none';
  });
  box.querySelectorAll('[data-thread-open]').forEach((el) => {
    el.addEventListener('click', () => openThread(el.dataset.threadOpen));
  });
}

function threadCardHtml(d) {
  if (isLocked(d)) {
    return `
      <div class="fds-thread-card locked" data-thread-open="${d.id}" role="button" tabindex="0">
        <div class="fds-thread-card-top">
          <span class="fds-thread-card-title">${icon('lock', 13, 'icon-inline')} Discussion privée</span>
        </div>
        <p class="fds-thread-card-preview">Code d'accès requis pour l'ouvrir.</p>
      </div>
    `;
  }

  const messages = sortedMessages(d);
  const lastMsg = messages[messages.length - 1];
  const preview = lastMsg ? (lastMsg.body.length > 80 ? lastMsg.body.slice(0, 80).trimEnd() + '…' : lastMsg.body) : '';
  return `
    <div class="fds-thread-card" data-thread-open="${d.id}" role="button" tabindex="0">
      <div class="fds-thread-card-top">
        <span class="fds-thread-card-title">${d.is_private ? icon('lock', 12, 'icon-inline') + ' ' : ''}${escapeHtml(d.title)}</span>
        ${isUnseen(d) ? '<span class="fds-thread-unseen-dot"></span>' : ''}
      </div>
      ${lastMsg ? `<p class="fds-thread-card-preview"><b>${escapeHtml(lastMsg.is_moi ? 'Léona' : lastMsg.author_name)}</b> — ${escapeHtml(preview)}</p>` : ''}
      <span class="fds-thread-card-meta">${messages.length} message${messages.length !== 1 ? 's' : ''} · ${formatDate(d.last_message_at)}</span>
    </div>
  `;
}

async function createThread() {
  const bodyInput = document.getElementById('new-thread-body');
  const author = getPersonName();
  const body = bodyInput.value.trim();
  if (!author || !body) return;

  const isPrivate = document.getElementById('new-thread-private').checked;
  const privateCode = document.getElementById('new-thread-private-code').value.trim();
  const errorEl = document.getElementById('new-thread-error');
  errorEl.style.display = 'none';
  if (isPrivate && !privateCode) {
    errorEl.textContent = 'Choisis un code pour protéger cette discussion privée.';
    errorEl.style.display = 'block';
    return;
  }

  const title = deriveDiscussionTitle(body);
  const { data: discussion, error } = await supabase
    .from('discussions')
    .insert({ circle_id: circleId, title, is_private: isPrivate, private_code: isPrivate ? privateCode : null })
    .select()
    .single();
  if (error || !discussion) return;

  const { data: message } = await supabase
    .from('discussion_messages')
    .insert({ discussion_id: discussion.id, author_name: author, body, is_moi: false, author_person_id: getPersonId() })
    .select()
    .single();

  discussion.discussion_messages = message ? [message] : [];
  discussions = [discussion, ...discussions];
  if (isPrivate) markUnlocked(discussion.id);
  openThread(discussion.id);
}

function openThread(discussionId) {
  const d = discussions.find((x) => x.id === discussionId);
  if (!d) return;

  if (isLocked(d)) {
    renderUnlockForm(d);
    return;
  }

  const messages = sortedMessages(d);
  setSeenCount(d.id, messages.length);
  updateDiscussionsBadge();

  const myId = getPersonId();
  const box = document.getElementById('discussion-box');
  box.innerHTML = `
    <div class="fds-question-panel">
      <button class="btn-link fds-thread-back" id="thread-back-btn">← Retour aux discussions</button>
      <p class="fds-question-title">${d.is_private ? icon('lock', 14, 'icon-inline') + ' ' : ''}${escapeHtml(d.title)}</p>
      <div class="fds-thread-messages">
        ${
          messages.length === 0
            ? `<p class="hint-text">Pas encore de message.</p>`
            : messages
                .map((m) => {
                  const canEdit = !!m.author_person_id && m.author_person_id === myId;
                  return `
          <div class="fds-thread-message ${m.is_moi ? 'moi' : ''}">
            <div class="fds-thread-message-top">
              <span class="fds-thread-message-author">${escapeHtml(m.is_moi ? 'Léona' : m.author_name)}</span>
              <span class="fds-thread-message-date">${formatDate(m.created_at)}</span>
            </div>
            <p class="fds-thread-message-body" data-message-body="${m.id}">${escapeHtml(m.body)}</p>
            ${
              canEdit
                ? `<div style="display:flex; gap:10px; margin-top:4px;">
              <button class="btn-link" data-message-edit="${m.id}">Modifier</button>
              <button class="btn-link" data-message-delete="${m.id}">Supprimer</button>
            </div>`
                : ''
            }
          </div>
        `;
                })
                .join('')
        }
      </div>
      <div class="fds-comment-form" style="margin-top:14px;">
        <textarea placeholder="Ta réponse..." maxlength="1000" id="thread-reply-body"></textarea>
        <button class="btn btn-ghost" id="thread-reply-submit">Envoyer</button>
      </div>
    </div>
  `;

  document.getElementById('thread-back-btn').addEventListener('click', renderThreadList);
  document.getElementById('thread-reply-submit').addEventListener('click', () => replyToThread(d.id));
  box.querySelectorAll('[data-message-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditMessage(d, btn.dataset.messageEdit));
  });
  box.querySelectorAll('[data-message-delete]').forEach((btn) => {
    btn.addEventListener('click', () => deleteMessage(d, btn.dataset.messageDelete));
  });
}

function renderUnlockForm(d) {
  const box = document.getElementById('discussion-box');
  box.innerHTML = `
    <div class="fds-question-panel">
      <button class="btn-link fds-thread-back" id="thread-back-btn">← Retour aux discussions</button>
      <p class="fds-question-title">${icon('lock', 15, 'icon-inline')} Discussion privée</p>
      <p class="hint-text" style="margin-bottom:12px;">Cette discussion est protégée par un code choisi par la personne qui l'a créée (ce n'est pas ton code personnel de connexion) — demande-le-lui si tu ne l'as pas.</p>
      <div class="field">
        <label>Code d'accès</label>
        <div class="pw-wrap">
          <input type="password" id="unlock-code-input" maxlength="80" />
          <button type="button" class="pw-toggle" id="unlock-code-toggle" aria-label="Afficher le code"></button>
        </div>
      </div>
      <p class="error-text" id="unlock-error" style="display:none">Code invalide.</p>
      <button class="btn" id="unlock-submit">Déverrouiller</button>
    </div>
  `;

  document.getElementById('thread-back-btn').addEventListener('click', renderThreadList);
  const unlockInput = document.getElementById('unlock-code-input');
  const unlockToggle = document.getElementById('unlock-code-toggle');
  unlockToggle.innerHTML = icon('eye', 18);
  unlockToggle.addEventListener('click', () => {
    const showing = unlockInput.type === 'text';
    unlockInput.type = showing ? 'password' : 'text';
    unlockToggle.innerHTML = icon(showing ? 'eye' : 'eyeOff', 18);
  });
  document.getElementById('unlock-submit').addEventListener('click', () => {
    const code = document.getElementById('unlock-code-input').value;
    const errorEl = document.getElementById('unlock-error');
    errorEl.style.display = 'none';
    if (!code || normalizeCode(code) !== normalizeCode(d.private_code)) {
      errorEl.style.display = 'block';
      return;
    }
    markUnlocked(d.id);
    openThread(d.id);
  });
}

function startEditMessage(d, messageId) {
  const message = (d.discussion_messages || []).find((m) => m.id === messageId);
  const bodyEl = document.querySelector(`[data-message-body="${messageId}"]`);
  if (!message || !bodyEl) return;

  bodyEl.outerHTML = `
    <div class="fds-thread-message-body" data-message-body="${messageId}">
      <textarea maxlength="1000" style="width:100%; resize:vertical; min-height:60px;" data-message-edit-input="${messageId}">${escapeHtml(message.body)}</textarea>
      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn-link" data-message-save="${messageId}">Enregistrer</button>
        <button class="btn-link" data-message-cancel="${messageId}">Annuler</button>
      </div>
    </div>
  `;
  document.querySelector(`[data-message-save="${messageId}"]`).addEventListener('click', () => saveMessageEdit(d, messageId));
  document.querySelector(`[data-message-cancel="${messageId}"]`).addEventListener('click', () => openThread(d.id));
}

async function saveMessageEdit(d, messageId) {
  const textarea = document.querySelector(`[data-message-edit-input="${messageId}"]`);
  const body = textarea.value.trim();
  if (!body) return;

  const { error } = await supabase.from('discussion_messages').update({ body }).eq('id', messageId);
  if (error) return;

  const message = (d.discussion_messages || []).find((m) => m.id === messageId);
  if (message) message.body = body;
  openThread(d.id);
}

async function deleteMessage(d, messageId) {
  if (!confirm('Supprimer ce message ?')) return;

  const { error } = await supabase.from('discussion_messages').delete().eq('id', messageId);
  if (error) return;

  d.discussion_messages = (d.discussion_messages || []).filter((m) => m.id !== messageId);
  openThread(d.id);
}

async function replyToThread(discussionId) {
  const d = discussions.find((x) => x.id === discussionId);
  if (!d) return;
  const bodyInput = document.getElementById('thread-reply-body');
  const author = getPersonName();
  const body = bodyInput.value.trim();
  if (!author || !body) return;

  const { data, error } = await supabase
    .from('discussion_messages')
    .insert({ discussion_id: discussionId, author_name: author, body, is_moi: false, author_person_id: getPersonId() })
    .select()
    .single();
  if (error || !data) return;

  d.discussion_messages = [...(d.discussion_messages || []), data];
  d.last_message_at = data.created_at;
  d.last_message_is_moi = false;
  openThread(discussionId);
}
