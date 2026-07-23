import { supabase } from './supabase-client.js';
import { CIRCLES } from './circles.js';
import { escapeHtml, slugify } from './utils.js';
import { compressImage } from './compress-image.js';
import { icon } from './icons.js';

const NON_ADMIN_CIRCLES = Object.values(CIRCLES).filter((c) => !c.isAdmin);

/** Nombre d'entrées (par type) ayant au moins un commentaire pas encore vu
 * par Moi — alimente les badges rouges des onglets Récits/Lettres. */
export async function countUnreadComments() {
  const { data } = await supabase.from('comments').select('entry_id, entries!inner(type)').eq('seen_by_moi', false);
  const counts = { recit: 0, lettre: 0 };
  const seenEntries = new Set();
  (data || []).forEach((c) => {
    if (seenEntries.has(c.entry_id)) return;
    seenEntries.add(c.entry_id);
    const type = c.entries?.type;
    if (type === 'recit' || type === 'lettre') counts[type] += 1;
  });
  return counts;
}

export async function refreshEntryCommentBadges() {
  const counts = await countUnreadComments();
  [
    ['recits-badge', counts.recit],
    ['lettres-badge', counts.lettre]
  ].forEach(([id, count]) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  });
}

export async function renderEntryList(container, type) {
  const { data, error } = await supabase
    .from('entries')
    .select('id, title, entry_date, published, comments(count), reactions(count)')
    .eq('type', type)
    .order('entry_date', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }

  const label = type === 'lettre' ? 'Lettres' : 'Récits';
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
      <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0;">${label}</p>
      <button class="btn-link" id="entry-new-btn">${type === 'lettre' ? '+ Nouvelle lettre' : '+ Nouveau récit'}</button>
    </div>
    <div class="adm-list">
      ${
        (data || []).length === 0
          ? `<p class="hint-text">Rien pour l'instant.</p>`
          : data
              .map((e) => {
                const commentCount = e.comments?.[0]?.count ?? 0;
                const reactionCount = e.reactions?.[0]?.count ?? 0;
                const engagement = [
                  commentCount > 0 ? `${icon('chat', 13, 'icon-inline')} ${commentCount}` : '',
                  reactionCount > 0 ? `${icon('heart', 13, 'icon-inline')} ${reactionCount}` : ''
                ]
                  .filter(Boolean)
                  .join(' · ');
                return `
        <div class="adm-list-item" data-entry-open="${e.id}">
          <span class="adm-list-item-title">${escapeHtml(e.title)}${!e.published ? '<span class="adm-draft-tag">Brouillon</span>' : ''}</span>
          <span class="adm-list-item-meta">${new Date(e.entry_date + 'T00:00:00').toLocaleDateString('fr-FR')}${engagement ? ' · ' + engagement : ''}</span>
        </div>
      `;
              })
              .join('')
      }
    </div>
  `;

  container.querySelector('#entry-new-btn').addEventListener('click', () => renderEntryEditor(container, type, null));
  container.querySelectorAll('[data-entry-open]').forEach((el) => {
    el.addEventListener('click', () => renderEntryEditor(container, type, el.dataset.entryOpen));
  });
}

async function renderEntryEditor(container, type, entryId) {
  let entry = null;
  let photos = [];

  if (entryId) {
    const { data } = await supabase.from('entries').select('*').eq('id', entryId).maybeSingle();
    entry = data;
    const { data: photoRows } = await supabase
      .from('entry_photos')
      .select('*')
      .eq('entry_id', entryId)
      .order('sort_order', { ascending: true });
    photos = photoRows || [];
  }

  const allowedVisibility = type === 'lettre' ? NON_ADMIN_CIRCLES.filter((c) => c.canReadLettres) : NON_ADMIN_CIRCLES;
  const visibility = new Set(entry?.visibility ?? allowedVisibility.map((c) => c.id));

  container.innerHTML = `
    <button class="btn-link" id="entry-back-btn" style="margin-bottom:14px;">← Retour à la liste</button>
    <div class="mf-panel">
      <div class="field">
        <label>Titre</label>
        <input type="text" id="f-title" maxlength="80" value="${escapeHtml(entry?.title ?? '')}" />
      </div>
      <div class="field">
        <label>Date</label>
        <input type="date" id="f-date" value="${entry?.entry_date ?? new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="field">
        <label>Lieu (optionnel)</label>
        <input type="text" id="f-location" value="${escapeHtml(entry?.location ?? '')}" />
      </div>
      <div class="field">
        <label>Coordonnées GPS (optionnel, pour la Carte)</label>
        <div style="display:flex; gap:10px;">
          <input type="number" step="any" id="f-lat" placeholder="Latitude" value="${entry?.lat ?? ''}" />
          <input type="number" step="any" id="f-lng" placeholder="Longitude" value="${entry?.lng ?? ''}" />
        </div>
        <p class="hint-text">Copie-colle depuis Google Maps (clic droit sur le lieu → les deux nombres tout en haut du menu).</p>
      </div>
      <div class="field">
        <label>Extrait (pour la Timeline, optionnel)</label>
        <input type="text" id="f-excerpt" maxlength="200" value="${escapeHtml(entry?.excerpt ?? '')}" />
      </div>
      <div class="field">
        <label>${type === 'lettre' ? 'Lettre' : 'Récit'}</label>
        <textarea id="f-body">${escapeHtml(entry?.body ?? '')}</textarea>
      </div>

      <div class="field">
        <label>Visible par</label>
        <div class="check-row">
          ${allowedVisibility
            .map(
              (c) => `
            <label class="check-item">
              <input type="checkbox" data-vis-circle="${c.id}" ${visibility.has(c.id) ? 'checked' : ''} />
              ${c.label}
            </label>
          `
            )
            .join('')}
        </div>
        ${type === 'lettre' ? `<p class="hint-text">Les Lettres ne sont jamais proposées à Famille et Amis.</p>` : ''}
      </div>

      <div class="field">
        <label class="check-item"><input type="checkbox" id="f-published" ${entry?.published ? 'checked' : ''} /> Publié (sinon brouillon)</label>
      </div>

      <p class="error-text" id="f-error" style="display:none;"></p>

      <div style="display:flex; gap:10px; margin-top:14px;">
        <button class="btn" id="f-save">${entry ? 'Enregistrer' : 'Créer'}</button>
        ${entry ? `<button class="btn btn-danger" id="f-delete">Supprimer</button>` : ''}
      </div>

      ${entry?.published ? `<div id="notify-editor" style="margin-top:24px; border-top:1px solid var(--line); padding-top:18px;"></div>` : ''}
      ${entry ? `<div id="engagement-editor" style="margin-top:24px; border-top:1px solid var(--line); padding-top:18px;"></div>` : ''}
      ${entry && type === 'recit' ? `<div id="photos-editor" style="margin-top:24px; border-top:1px solid var(--line); padding-top:18px;"></div>` : ''}
    </div>
  `;

  container.querySelector('#entry-back-btn').addEventListener('click', () => renderEntryList(container, type));

  container.querySelector('#f-save').addEventListener('click', async () => {
    const title = document.getElementById('f-title').value.trim();
    const errorEl = document.getElementById('f-error');
    if (!title) {
      errorEl.textContent = 'Le titre est requis.';
      errorEl.style.display = 'block';
      return;
    }

    const latRaw = document.getElementById('f-lat').value.trim();
    const lngRaw = document.getElementById('f-lng').value.trim();

    const payload = {
      type,
      title,
      entry_date: document.getElementById('f-date').value,
      location: document.getElementById('f-location').value.trim() || null,
      lat: latRaw === '' ? null : Number(latRaw),
      lng: lngRaw === '' ? null : Number(lngRaw),
      excerpt: document.getElementById('f-excerpt').value.trim() || null,
      body: document.getElementById('f-body').value,
      published: document.getElementById('f-published').checked,
      visibility: allowedVisibility.filter((c) => document.querySelector(`[data-vis-circle="${c.id}"]`).checked).map((c) => c.id)
    };

    const saveBtn = document.getElementById('f-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement…';

    if (entry) {
      const { error } = await supabase.from('entries').update(payload).eq('id', entry.id);
      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Enregistrer';
        return;
      }
      renderEntryEditor(container, type, entry.id);
    } else {
      payload.slug = await uniqueSlug(title);
      const { data, error } = await supabase.from('entries').insert(payload).select('id').single();
      if (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Créer';
        return;
      }
      renderEntryEditor(container, type, data.id);
    }
  });

  if (entry) {
    container.querySelector('#f-delete')?.addEventListener('click', async () => {
      if (!confirm('Supprimer cette entrée définitivement ?')) return;
      await supabase.from('entries').delete().eq('id', entry.id);
      renderEntryList(container, type);
    });
  }

  if (entry?.published) {
    renderNotifyEditor(document.getElementById('notify-editor'), entry);
  }

  if (entry) {
    renderEngagementEditor(document.getElementById('engagement-editor'), entry.id);
  }

  if (entry && type === 'recit') {
    renderPhotosEditor(document.getElementById('photos-editor'), entry.id, photos, allowedVisibility);
  }
}

/** Envoi manuel d'une notif push, cercle par cercle : rien n'est notifié
 * automatiquement à la publication (voir supabase/functions/send-push).
 * Rappelable plusieurs fois — utile si Léona a oublié un cercle. */
function renderNotifyEditor(el, entry, successMessage) {
  const notified = new Set(entry.notified_circles || []);
  const targetCircles = NON_ADMIN_CIRCLES.filter((c) => (entry.visibility || []).includes(c.id));

  el.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:18px; font-weight:600; margin:0 0 6px;">Notifier</p>
    <p class="hint-text" style="margin-bottom:12px;">Rien n'est envoyé automatiquement. Coche les cercles à prévenir, puis envoie.</p>
    ${
      targetCircles.length === 0
        ? `<p class="hint-text">Aucun cercle n'a accès à cette entrée.</p>`
        : `
    <div class="check-row" style="margin-bottom:14px;">
      ${targetCircles
        .map(
          (c) => `
        <label class="check-item">
          <input type="checkbox" data-notify-circle="${c.id}" />
          ${c.label}${notified.has(c.id) ? ` <span class="hint-text">(déjà notifié)</span>` : ''}
        </label>
      `
        )
        .join('')}
    </div>
    <p class="error-text" id="notify-error" style="display:none;"></p>
    <p class="hint-text" id="notify-success" style="${successMessage ? '' : 'display:none;'}">${escapeHtml(successMessage || '')}</p>
    <button class="btn" id="notify-send">${icon('bell', 14, 'icon-inline')} Envoyer la notification</button>
    `
    }
  `;

  el.querySelector('#notify-send')?.addEventListener('click', async () => {
    const errorEl = document.getElementById('notify-error');
    errorEl.style.display = 'none';

    const circleIds = targetCircles.filter((c) => el.querySelector(`[data-notify-circle="${c.id}"]`).checked).map((c) => c.id);
    if (circleIds.length === 0) {
      errorEl.textContent = 'Sélectionne au moins un cercle.';
      errorEl.style.display = 'block';
      return;
    }

    const sendBtn = document.getElementById('notify-send');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Envoi…';

    const { data, error } = await supabase.functions.invoke('send-push', { body: { entryId: entry.id, circleIds } });

    if (error) {
      errorEl.textContent = "Échec de l'envoi — " + error.message;
      errorEl.style.display = 'block';
      sendBtn.disabled = false;
      sendBtn.innerHTML = `${icon('bell', 14, 'icon-inline')} Envoyer la notification`;
      return;
    }

    entry.notified_circles = Array.from(new Set([...(entry.notified_circles || []), ...(data?.notifiedCircles || circleIds)]));
    const count = data?.subscriptionsSent ?? 0;
    renderNotifyEditor(el, entry, `Notification envoyée (${count} abonné${count > 1 ? 's' : ''}).`);
  });
}

async function renderEngagementEditor(el, entryId) {
  const [{ data: comments }, { data: reactions }] = await Promise.all([
    supabase.from('comments').select('id, circle_id, author_name, body, reply_text, created_at, seen_by_moi').eq('entry_id', entryId).order('created_at', { ascending: true }),
    supabase.from('reactions').select('emoji').eq('entry_id', entryId)
  ]);

  // Ouvrir l'entrée = les commentaires sont considérés vus : éteint le
  // badge de l'onglet et réarme la notif push pour un futur commentaire
  // (voir countUnreadComments / notify-comment).
  const hasUnseen = (comments || []).some((c) => c.seen_by_moi === false);
  if (hasUnseen) {
    await supabase.from('comments').update({ seen_by_moi: true }).eq('entry_id', entryId).eq('seen_by_moi', false);
    refreshEntryCommentBadges();
  }

  const tally = {};
  (reactions || []).forEach((r) => (tally[r.emoji] = (tally[r.emoji] || 0) + 1));
  const tallyHtml = Object.entries(tally)
    .map(([emoji, count]) => `<span class="adm-reaction-tally">${emoji} ${count}</span>`)
    .join(' ');

  el.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:18px; font-weight:600; margin:0 0 10px;">Réactions & commentaires</p>
    ${tallyHtml ? `<div style="margin-bottom:14px;">${tallyHtml}</div>` : `<p class="hint-text">Pas encore de réaction.</p>`}
    ${
      (comments || []).length === 0
        ? `<p class="hint-text">Pas encore de commentaire.</p>`
        : `<div class="adm-list">
        ${comments
          .map(
            (c) => `
          <div class="adm-list-item" style="flex-direction:column; align-items:flex-start; gap:8px; cursor:default;">
            <span class="adm-list-item-meta">${CIRCLES[c.circle_id]?.label ?? c.circle_id} · ${escapeHtml(c.author_name)} · ${new Date(c.created_at).toLocaleDateString('fr-FR')}</span>
            <p style="margin:0; font-size:14px;">${escapeHtml(c.body)}</p>
            <div class="adm-reply-form">
              <textarea placeholder="Ta réponse (visible sous son commentaire)..." data-comment-reply-text="${c.id}">${escapeHtml(c.reply_text || '')}</textarea>
              <button class="btn-link" data-comment-save-reply="${c.id}">Enregistrer la réponse</button>
              <span class="hint-text" data-comment-reply-saved="${c.id}" style="display:none;">Réponse enregistrée.</span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>`
    }
  `;

  el.querySelectorAll('[data-comment-save-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.commentSaveReply;
      const textarea = el.querySelector(`[data-comment-reply-text="${id}"]`);
      const reply = textarea.value.trim();
      const { error } = await supabase.from('comments').update({ reply_text: reply || null }).eq('id', id);
      if (!error) {
        const saved = el.querySelector(`[data-comment-reply-saved="${id}"]`);
        saved.style.display = 'inline';
        setTimeout(() => (saved.style.display = 'none'), 2000);
      }
    });
  });
}

async function uniqueSlug(title) {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await supabase.from('entries').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  return slug;
}

function renderPhotosEditor(el, entryId, photos, allowedVisibility) {
  el.innerHTML = `
    <p class="hint-text" style="margin-bottom:12px;">
      Les photos sont redimensionnées et compressées automatiquement dans le navigateur avant l'envoi.
      Laisse la visibilité vide pour qu'elle suive celle de l'entrée.
    </p>
    <div id="photos-list">
      ${photos
        .map(
          (p) => `
        <div class="adm-photo-row">
          <span class="adm-photo-path">${escapeHtml(p.storage_path)}</span>
          <span style="font-size:11px; color:var(--ink-soft);">${p.visibility && p.visibility.length ? p.visibility.join(', ') : "hérite de l'entrée"}</span>
          <button class="mf-del" data-del-photo="${p.id}">${icon('x', 13)}</button>
        </div>
      `
        )
        .join('')}
    </div>

    <div class="field" style="margin-top:14px;">
      <label>Légende (optionnel, s'applique à la prochaine photo)</label>
      <input type="text" id="photo-caption" />
    </div>
    <div class="field">
      <label>Visibilité spécifique (optionnel)</label>
      <div class="check-row">
        ${allowedVisibility.map((c) => `<label class="check-item"><input type="checkbox" data-photo-vis="${c.id}" /> ${c.label}</label>`).join('')}
      </div>
    </div>

    <p class="error-text" id="photo-error" style="display:none;"></p>

    <input type="file" accept="image/*" id="photo-file" style="display:none;" />
    <button class="btn" id="photo-add-btn">Ajouter une photo</button>
  `;

  el.querySelectorAll('[data-del-photo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('entry_photos').delete().eq('id', btn.dataset.delPhoto);
      const { data } = await supabase.from('entry_photos').select('*').eq('entry_id', entryId).order('sort_order');
      renderPhotosEditor(el, entryId, data || [], allowedVisibility);
    });
  });

  const fileInput = el.querySelector('#photo-file');
  const addBtn = el.querySelector('#photo-add-btn');
  addBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const errorEl = document.getElementById('photo-error');
    errorEl.style.display = 'none';
    addBtn.disabled = true;

    try {
      addBtn.textContent = 'Compression…';
      const compressed = await compressImage(file);

      addBtn.textContent = 'Envoi…';
      const path = `${entryId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('photos').upload(path, compressed, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const caption = document.getElementById('photo-caption').value.trim();
      const visibility = allowedVisibility
        .filter((c) => document.querySelector(`[data-photo-vis="${c.id}"]`)?.checked)
        .map((c) => c.id);

      const { data: countRows } = await supabase.from('entry_photos').select('id').eq('entry_id', entryId);
      const sortOrder = (countRows || []).length;

      await supabase.from('entry_photos').insert({
        entry_id: entryId,
        storage_path: path,
        caption: caption || null,
        sort_order: sortOrder,
        visibility: visibility.length > 0 ? visibility : null
      });

      const { data } = await supabase.from('entry_photos').select('*').eq('entry_id', entryId).order('sort_order');
      renderPhotosEditor(el, entryId, data || [], allowedVisibility);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : "Échec de l'ajout de la photo.";
      errorEl.style.display = 'block';
      addBtn.disabled = false;
      addBtn.textContent = 'Ajouter une photo';
      fileInput.value = '';
    }
  });
}
