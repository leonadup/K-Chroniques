import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { compressImage } from './compress-image.js';

// Capsules temporelles — espace strictement privé de Moi (jamais exposé aux
// cercles, voir supabase/migrations/013_capsule_temporelle.sql). Chaque
// capsule a sa propre date de déblocage libre ; avant cette date, le
// contenu (texte + photo éventuelle) reste masqué même à Moi, pour garder
// l'effet de surprise en se relisant plus tard.

export async function renderCapsuleTab(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('time_capsules').select('*').order('unlock_date');
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderView(container, data || []);
}

function renderView(container, capsules) {
  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Capsule temporelle</p>
    <p class="hint-text" style="margin-bottom:16px;">Strictement privé — écris un message pour ton "toi" futur, il restera verrouillé jusqu'à la date que tu choisis.</p>

    <div class="mf-panel">
      <div class="field">
        <label>Titre (optionnel)</label>
        <input type="text" id="tc-title" maxlength="120" />
      </div>
      <div class="field">
        <label>Se débloque le</label>
        <input type="date" id="tc-date" required />
      </div>
      <div class="field">
        <label>Ton message</label>
        <textarea id="tc-body" style="min-height:120px;"></textarea>
      </div>
      <div class="field">
        <label>Photo (optionnel)</label>
        <input type="file" accept="image/*" id="tc-photo" />
      </div>
      <p class="error-text" id="tc-error" style="display:none"></p>
      <button class="btn" id="tc-add">Créer la capsule</button>
    </div>

    <div class="adm-list" id="tc-list">
      ${capsules.length === 0 ? `<p class="hint-text">Pas encore de capsule.</p>` : capsules.map((c) => capsuleHtml(c)).join('')}
    </div>
  `;

  document.getElementById('tc-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('tc-error');
    errorEl.style.display = 'none';

    const body = document.getElementById('tc-body').value.trim();
    const unlockDate = document.getElementById('tc-date').value;
    const today = new Date().toISOString().slice(0, 10);

    if (!body) {
      errorEl.textContent = 'Écris un message avant de créer la capsule.';
      errorEl.style.display = 'block';
      return;
    }
    if (!unlockDate || unlockDate <= today) {
      errorEl.textContent = 'Choisis une date de déblocage dans le futur.';
      errorEl.style.display = 'block';
      return;
    }

    const addBtn = document.getElementById('tc-add');
    addBtn.disabled = true;
    try {
      const file = document.getElementById('tc-photo').files?.[0];
      let photoPath = null;
      if (file) {
        addBtn.textContent = 'Compression…';
        const compressed = await compressImage(file);
        addBtn.textContent = 'Envoi…';
        photoPath = `capsules/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(photoPath, compressed, { contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
      }

      const title = document.getElementById('tc-title').value.trim();
      const { data, error } = await supabase
        .from('time_capsules')
        .insert({ title: title || null, body, unlock_date: unlockDate, photo_path: photoPath })
        .select()
        .single();
      if (error) throw error;

      capsules.push(data);
      capsules.sort((a, b) => (a.unlock_date < b.unlock_date ? -1 : 1));
      renderView(container, capsules);
    } catch (err) {
      errorEl.textContent = err instanceof Error ? err.message : 'Échec de la création de la capsule.';
      errorEl.style.display = 'block';
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = 'Créer la capsule';
    }
  });

  container.querySelectorAll('[data-capsule-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette capsule définitivement ?')) return;
      const id = btn.dataset.capsuleDelete;
      await supabase.from('time_capsules').delete().eq('id', id);
      renderView(container, capsules.filter((c) => c.id !== id));
    });
  });
}

function isLocked(capsule) {
  const today = new Date().toISOString().slice(0, 10);
  return capsule.unlock_date > today;
}

function capsuleHtml(capsule) {
  const locked = isLocked(capsule);
  const title = capsule.title || 'Capsule sans titre';

  if (locked) {
    return `
      <div class="adm-list-item tc-capsule-locked" style="cursor:default; align-items:flex-start; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
          <span class="adm-list-item-title">${icon('lock', 15, 'icon-inline')} ${escapeHtml(title)}</span>
          <button class="mf-del" data-capsule-delete="${capsule.id}" title="Supprimer">${icon('x', 13)}</button>
        </div>
        <span class="adm-list-item-meta">Se débloque le ${formatDate(capsule.unlock_date)}</span>
      </div>
    `;
  }

  return `
    <div class="adm-list-item" style="cursor:default; align-items:flex-start; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <span class="adm-list-item-title">${escapeHtml(title)}</span>
        <button class="mf-del" data-capsule-delete="${capsule.id}" title="Supprimer">${icon('x', 13)}</button>
      </div>
      <span class="adm-list-item-meta">${icon('checkcircle', 13, 'icon-inline')} débloquée le ${formatDate(capsule.unlock_date)}</span>
      <p style="margin:0; font-size:14.5px; white-space:pre-wrap;">${escapeHtml(capsule.body)}</p>
      ${capsule.photo_path ? `<img src="${escapeHtml(resolvePhotoUrl(capsule.photo_path))}" alt="" style="max-width:280px; border-radius:6px;" />` : ''}
    </div>
  `;
}

function resolvePhotoUrl(path) {
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
