import { supabase } from './supabase-client.js';
import { requireCircleOrRedirect, logout } from './auth.js';
import { applySeason } from './season.js';
import { CIRCLES, canViewEntry, canViewPhoto } from './circles.js';
import { escapeHtml, fmtEuros } from './utils.js';
import { REACTION_PALETTE } from './reactions.js';

applySeason();

const circleId = requireCircleOrRedirect();
let allEntries = [];
let departDate = null;
let leafletMap = null;
let leafletMarkersLayer = null;
let answeredQuestionIds = [];

const MILESTONE_THRESHOLDS = [
  { days: 7, label: '1 semaine sur place' },
  { days: 30, label: '1 mois sur place' },
  { days: 90, label: '3 mois sur place' },
  { days: 180, label: '6 mois sur place' },
  { days: 365, label: '1 an sur place' }
];

if (circleId) {
  init();
}

async function init() {
  const circle = CIRCLES[circleId];
  document.getElementById('circle-tag').textContent = 'Espace ' + circle.label;
  document.getElementById('logout-btn').addEventListener('click', logout);

  if (circle.canReadLettres) {
    document.getElementById('lettres-tab').style.display = '';
  }

  setupTabs();
  setupQuestionBox();
  await loadBandeau();
  await loadEntries();
}

function setupTabs() {
  document.querySelectorAll('.fds-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.fds-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      ['timeline', 'recits', 'galerie', 'carte', 'lettres', 'questions'].forEach((name) => {
        const panel = document.getElementById('panel-' + name);
        if (panel) panel.style.display = name === tab.dataset.tab ? '' : 'none';
      });
      if (tab.dataset.tab === 'carte') initOrRefreshMap();
      if (tab.dataset.tab === 'questions') markQuestionsSeen();
    });
  });
}

async function loadBandeau() {
  const { data } = await supabase.from('status_banner').select('*').eq('id', true).maybeSingle();
  const el = document.getElementById('bandeau');
  const items = [];

  departDate = data?.depart_date || null;

  // Résumé ultra-simplifié : uniquement le reste à vivre, jamais le détail.
  if (circleId === 'parents') {
    const { data: reste } = await supabase.rpc('reste_a_vivre_du_mois');
    if (typeof reste === 'number') {
      items.push(
        `<div class="fds-bandeau-item"><span class="fds-bandeau-label">Reste à vivre ce mois-ci</span><span class="fds-bandeau-value">${fmtEuros(reste)}</span></div>`
      );
    }
  }

  if (data) {
    if (data.city) {
      items.push(
        `<div class="fds-bandeau-item"><span class="fds-bandeau-label">Où j'en suis</span><span class="fds-bandeau-value">${escapeHtml(data.city)}${data.status_note ? ' · ' + escapeHtml(data.status_note) : ''}</span></div>`
      );
    }
    if (data.music_title) {
      const value = data.music_url
        ? `<a href="${escapeHtml(data.music_url)}" target="_blank" rel="noreferrer">${escapeHtml(data.music_title)}</a>`
        : escapeHtml(data.music_title);
      items.push(
        `<div class="fds-bandeau-item"><span class="fds-bandeau-label">Musique du moment</span><span class="fds-bandeau-value">${value}</span></div>`
      );
    }
    if (data.note) {
      items.push(
        `<div class="fds-bandeau-item"><span class="fds-bandeau-label">Note</span><span class="fds-bandeau-value">${escapeHtml(data.note)}</span></div>`
      );
    }
  }

  if (items.length > 0) {
    el.innerHTML = items.join('');
    el.style.display = '';
  }
}

function resolvePhotoUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

async function loadEntries() {
  const { data, error } = await supabase
    .from('entries')
    .select('*, entry_photos(*), reactions(*), comments(*)')
    .order('entry_date', { ascending: false });

  if (error || !data) {
    console.error(error);
    return;
  }

  allEntries = data.filter((e) => canViewEntry(circleId, e));
  renderTimeline();
  renderList('recit', 'panel-recits');
  renderList('lettre', 'panel-lettres');
  renderGalerie();
  if (leafletMap) renderMapMarkers();
}

function formatDateLong(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateShort(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function computeMilestones() {
  if (!departDate) return [];
  const start = new Date(departDate + 'T00:00:00');
  const today = new Date();
  return MILESTONE_THRESHOLDS.map((m) => {
    const date = new Date(start);
    date.setDate(date.getDate() + m.days);
    return { ...m, date };
  })
    .filter((m) => m.date <= today)
    .map((m) => ({
      _milestone: true,
      entry_date: m.date.toISOString().slice(0, 10),
      label: m.label
    }));
}

function renderTimeline() {
  const panel = document.getElementById('panel-timeline');
  const items = [...allEntries, ...computeMilestones()].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));

  if (items.length === 0) {
    panel.innerHTML = `<div class="fds-empty">Rien à lire ici pour l'instant.</div>`;
    return;
  }
  panel.innerHTML = items
    .map((item) => {
      if (item._milestone) {
        return `
          <div class="fds-timeline-milestone">
            <span class="fds-milestone-badge">🎉 ${escapeHtml(item.label)}</span>
            <span class="fds-timeline-date">${formatDateShort(item.entry_date)}</span>
          </div>
        `;
      }
      const excerpt = item.excerpt || (item.body.length > 160 ? item.body.slice(0, 160).trimEnd() + '…' : item.body);
      return `
        <div class="fds-timeline-item" data-entry-id="${item.id}" data-type="${item.type}" role="button" tabindex="0">
          <div class="fds-timeline-top">
            <span class="fds-timeline-date">${formatDateShort(item.entry_date)}</span>
            <span class="fds-timeline-type">${item.type === 'lettre' ? 'Lettre' : 'Récit'}</span>
          </div>
          <p class="fds-timeline-title">${escapeHtml(item.title)}</p>
          <p class="fds-timeline-excerpt">${escapeHtml(excerpt)}</p>
        </div>
      `;
    })
    .join('');

  panel.querySelectorAll('[data-entry-id]').forEach((el) => {
    el.addEventListener('click', () => openEntryModal(el.dataset.entryId));
  });
}

function renderList(type, panelId) {
  const panel = document.getElementById(panelId);
  const entries = allEntries.filter((e) => e.type === type);
  if (entries.length === 0) {
    panel.innerHTML = `<div class="fds-empty">${type === 'lettre' ? "Pas encore de lettre publiée." : "Rien à lire ici pour l'instant."}</div>`;
    return;
  }
  panel.innerHTML = entries.map((entry) => entryCardHtml(entry)).join('');
  wireEntryCards(panel);
}

function renderGalerie() {
  const panel = document.getElementById('panel-galerie');
  const photos = [];
  allEntries.forEach((entry) => {
    (entry.entry_photos || [])
      .filter((p) => canViewPhoto(circleId, entry, p))
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((p) => photos.push({ entry, photo: p }));
  });

  if (photos.length === 0) {
    panel.innerHTML = `<div class="fds-empty">Pas encore de photo à montrer ici.</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="fds-gallery-grid">
      ${photos
        .map(
          ({ entry, photo }) => `
        <div class="fds-gallery-item" data-gallery-entry="${entry.id}" role="button" tabindex="0">
          <img class="fds-gallery-photo" src="${escapeHtml(resolvePhotoUrl(photo.storage_path))}" alt="${escapeHtml(photo.caption || entry.title)}" loading="lazy" />
        </div>
      `
        )
        .join('')}
    </div>
  `;

  panel.querySelectorAll('[data-gallery-entry]').forEach((el) => {
    el.addEventListener('click', () => openEntryModal(el.dataset.galleryEntry));
  });
}

function initOrRefreshMap() {
  if (!leafletMap) {
    leafletMap = L.map('carte-map', { scrollWheelZoom: false }).setView([36.5, 127.8], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(leafletMap);
    leafletMarkersLayer = L.layerGroup().addTo(leafletMap);
    renderMapMarkers();
  }
  // Le conteneur est caché via display:none jusqu'à la première ouverture de
  // l'onglet : Leaflet mesure alors une taille de 0x0. invalidateSize() force
  // le recalcul une fois le panneau visible (le setTimeout laisse le
  // navigateur appliquer le display avant la mesure).
  setTimeout(() => leafletMap && leafletMap.invalidateSize(), 0);
}

function renderMapMarkers() {
  leafletMarkersLayer.clearLayers();
  document.getElementById('carte-empty')?.remove();
  const withCoords = allEntries.filter((e) => e.lat != null && e.lng != null);

  if (withCoords.length === 0) {
    document
      .getElementById('carte-map')
      .insertAdjacentHTML('afterend', `<div class="fds-empty" id="carte-empty">Pas encore de lieu placé sur la carte.</div>`);
    return;
  }

  const bounds = [];
  withCoords.forEach((entry) => {
    const icon = L.divIcon({
      className: `fds-map-marker ${entry.type === 'lettre' ? 'lettre' : 'recit'}`,
      html: '<span></span>',
      iconSize: [18, 18]
    });
    const marker = L.marker([entry.lat, entry.lng], { icon }).addTo(leafletMarkersLayer);
    marker.bindPopup(`
      <div class="fds-map-popup">
        <p class="fds-map-popup-title">${escapeHtml(entry.title)}</p>
        <p class="fds-map-popup-date">${formatDateShort(entry.entry_date)}</p>
        <button class="btn-link" data-map-open="${entry.id}">Voir →</button>
      </div>
    `);
    marker.on('popupopen', () => {
      document.querySelector(`[data-map-open="${entry.id}"]`)?.addEventListener('click', () => openEntryModal(entry.id));
    });
    bounds.push([entry.lat, entry.lng]);
  });
  leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
}

function entryCardHtml(entry) {
  const visiblePhotos = (entry.entry_photos || [])
    .filter((p) => canViewPhoto(circleId, entry, p))
    .sort((a, b) => a.sort_order - b.sort_order);

  const photosHtml =
    entry.type === 'recit' && visiblePhotos.length > 0
      ? `<div class="fds-photo-grid">${visiblePhotos
          .map((p) => `<img class="fds-photo" src="${escapeHtml(resolvePhotoUrl(p.storage_path))}" alt="${escapeHtml(p.caption || '')}" />`)
          .join('')}</div>`
      : '';

  return `
    <article class="fds-entry ${entry.type === 'lettre' ? 'lettre' : ''}" data-entry-card="${entry.id}">
      <div class="fds-entry-top">
        <span class="fds-entry-date">${formatDateLong(entry.entry_date)}</span>
        ${entry.location ? `<span class="fds-entry-loc">${escapeHtml(entry.location)}</span>` : ''}
      </div>
      <h2 class="fds-entry-title">${escapeHtml(entry.title)}</h2>
      ${photosHtml}
      <p class="fds-entry-text">${escapeHtml(entry.body)}</p>
      ${reactionBarHtml(entry)}
      ${commentThreadHtml(entry)}
    </article>
  `;
}

function reactionBarHtml(entry) {
  const counts = {};
  const active = new Set();
  (entry.reactions || []).forEach((r) => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.circle_id === circleId) active.add(r.emoji);
  });

  return `
    <div class="fds-reaction-bar">
      ${REACTION_PALETTE.map(
        (emoji) => `
        <button class="fds-reaction-btn ${active.has(emoji) ? 'active' : ''}" data-reaction="${entry.id}" data-emoji="${emoji}">
          <span>${emoji}</span>${counts[emoji] ? `<span class="fds-reaction-count">${counts[emoji]}</span>` : ''}
        </button>
      `
      ).join('')}
    </div>
  `;
}

function commentThreadHtml(entry) {
  const comments = [...(entry.comments || [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  return `
    <div class="fds-comments">
      <p class="fds-comments-label">${comments.length} commentaire${comments.length !== 1 ? 's' : ''}</p>
      <div>
        ${comments
          .map(
            (c) => `
          <div class="fds-comment">
            <b>${escapeHtml(c.author_name)}</b> — ${escapeHtml(c.body)}
            ${c.reply_text ? `<div class="fds-question-reply">${escapeHtml(c.reply_text)}</div>` : ''}
          </div>
        `
          )
          .join('')}
      </div>
      <div class="fds-comment-form">
        <input type="text" placeholder="Ton prénom" maxlength="40" data-comment-author="${entry.id}" />
        <textarea placeholder="Un petit mot..." maxlength="1000" data-comment-body="${entry.id}"></textarea>
        <button class="btn btn-ghost" data-comment-submit="${entry.id}">Envoyer</button>
      </div>
    </div>
  `;
}

function wireEntryCards(container) {
  container.querySelectorAll('[data-reaction]').forEach((btn) => {
    btn.addEventListener('click', () => toggleReaction(btn.dataset.reaction, btn.dataset.emoji));
  });
  container.querySelectorAll('[data-comment-submit]').forEach((btn) => {
    btn.addEventListener('click', () => submitComment(btn.dataset.commentSubmit));
  });
}

async function toggleReaction(entryId, emoji) {
  const entry = allEntries.find((e) => e.id === entryId);
  if (!entry) return;
  const existing = (entry.reactions || []).find((r) => r.circle_id === circleId && r.emoji === emoji);

  if (existing) {
    await supabase.from('reactions').delete().eq('id', existing.id);
    entry.reactions = entry.reactions.filter((r) => r.id !== existing.id);
  } else {
    const { data } = await supabase.from('reactions').insert({ entry_id: entryId, circle_id: circleId, emoji }).select().single();
    if (data) entry.reactions = [...(entry.reactions || []), data];
  }

  refreshEntryCard(entry);
}

async function submitComment(entryId) {
  const entry = allEntries.find((e) => e.id === entryId);
  if (!entry) return;
  const authorInput = document.querySelector(`[data-comment-author="${entryId}"]`);
  const bodyInput = document.querySelector(`[data-comment-body="${entryId}"]`);
  const author = authorInput.value.trim();
  const body = bodyInput.value.trim();
  if (!author || !body) return;

  const { data, error } = await supabase
    .from('comments')
    .insert({ entry_id: entryId, circle_id: circleId, author_name: author, body })
    .select()
    .single();

  if (!error && data) {
    entry.comments = [...(entry.comments || []), data];
    refreshEntryCard(entry);
  }
}

function refreshEntryCard(entry) {
  // Met à jour toutes les occurrences visibles de cette entrée (liste + modale éventuelle).
  document.querySelectorAll(`[data-entry-card="${entry.id}"]`).forEach((el) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = entryCardHtml(entry);
    const fresh = wrapper.firstElementChild;
    el.replaceWith(fresh);
    wireEntryCards(fresh);
  });
}

function openEntryModal(entryId) {
  const entry = allEntries.find((e) => e.id === entryId);
  if (!entry) return;
  const mount = document.getElementById('entry-modal-mount');
  mount.innerHTML = `
    <div class="fds-modal-backdrop" id="entry-modal-backdrop">
      <div class="fds-modal-content">${entryCardHtml(entry)}</div>
    </div>
  `;
  wireEntryCards(mount);
  document.getElementById('entry-modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'entry-modal-backdrop') mount.innerHTML = '';
  });
}

async function setupQuestionBox() {
  const box = document.getElementById('question-box');
  box.innerHTML = `
    <div class="fds-question-panel">
      <p class="fds-question-title">Questions & réponses</p>
      <div id="question-history"></div>
      <p class="fds-question-title" style="margin-top:18px;">Une question ?</p>
      <p class="hint-text" style="margin-bottom:12px;">Elle trouvera sa réponse ici ou dans une prochaine entrée.</p>
      <div class="fds-comment-form">
        <input type="text" placeholder="Ton prénom (optionnel)" maxlength="40" id="question-author" />
        <textarea placeholder="Ta question..." maxlength="500" id="question-text"></textarea>
        <button class="btn btn-ghost" id="question-submit">Envoyer</button>
      </div>
      <p class="hint-text" id="question-sent" style="display:none; margin-top:8px;">Question envoyée, merci !</p>
    </div>
  `;

  await loadQuestionHistory();

  document.getElementById('question-submit').addEventListener('click', async () => {
    const author = document.getElementById('question-author').value.trim();
    const text = document.getElementById('question-text').value.trim();
    if (!text) return;
    const { error } = await supabase.from('questions').insert({ circle_id: circleId, author_name: author || null, question_text: text });
    if (!error) {
      document.getElementById('question-text').value = '';
      document.getElementById('question-sent').style.display = 'block';
    }
  });
}

async function loadQuestionHistory() {
  const historyEl = document.getElementById('question-history');
  const { data, error } = await supabase
    .from('questions')
    .select('id, circle_id, author_name, question_text, reply_text, created_at')
    .eq('circle_id', circleId)
    .not('reply_text', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) {
    historyEl.innerHTML = `<p class="hint-text">Pas encore de question répondue ici.</p>`;
    answeredQuestionIds = [];
    updateQuestionsBadge();
    return;
  }

  historyEl.innerHTML = data
    .map(
      (q) => `
      <div class="fds-comment">
        <b>${q.author_name ? escapeHtml(q.author_name) : 'Anonyme'}</b> — ${escapeHtml(q.question_text)}
        <div class="fds-question-reply">${escapeHtml(q.reply_text)}</div>
      </div>
    `
    )
    .join('');

  answeredQuestionIds = data.map((q) => q.id);
  updateQuestionsBadge();
}

function getSeenQuestionIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(`fds_questions_seen_${circleId}`) || '[]'));
  } catch {
    return new Set();
  }
}

function updateQuestionsBadge() {
  const badge = document.getElementById('questions-badge');
  if (!badge) return;
  const seen = getSeenQuestionIds();
  const unseenCount = answeredQuestionIds.filter((id) => !seen.has(id)).length;
  badge.textContent = unseenCount;
  badge.style.display = unseenCount > 0 ? '' : 'none';
}

function markQuestionsSeen() {
  localStorage.setItem(`fds_questions_seen_${circleId}`, JSON.stringify(answeredQuestionIds));
  updateQuestionsBadge();
}
