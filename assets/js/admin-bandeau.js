import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

export async function renderBandeauAdmin(container) {
  const { data } = await supabase
    .from('status_banner')
    .select('city, status_note, music_title, music_url, note')
    .eq('id', true)
    .maybeSingle();

  const b = data || {};

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 18px;">Où j'en suis</p>
    <div class="mf-panel">
      <div class="field">
        <label>Ville / statut actuel</label>
        <input type="text" id="b-city" value="${escapeHtml(b.city ?? '')}" placeholder="Séoul, Sillim" />
      </div>
      <div class="field">
        <label>Précision (optionnel)</label>
        <input type="text" id="b-status-note" value="${escapeHtml(b.status_note ?? '')}" placeholder="entre deux cours de coréen" />
      </div>
      <div class="field">
        <label>Musique du moment</label>
        <input type="text" id="b-music-title" value="${escapeHtml(b.music_title ?? '')}" />
      </div>
      <div class="field">
        <label>Lien Spotify / YouTube (optionnel)</label>
        <input type="text" id="b-music-url" value="${escapeHtml(b.music_url ?? '')}" placeholder="https://..." />
      </div>
      <div class="field">
        <label>Note courte</label>
        <input type="text" id="b-note" maxlength="140" value="${escapeHtml(b.note ?? '')}" />
      </div>
      <button class="btn" id="b-save">Enregistrer</button>
      <span id="b-saved" style="display:none; margin-left:10px; font-size:12.5px; color:var(--celadon);">Enregistré.</span>
    </div>
  `;

  document.getElementById('b-save').addEventListener('click', async () => {
    const payload = {
      city: document.getElementById('b-city').value.trim() || null,
      status_note: document.getElementById('b-status-note').value.trim() || null,
      music_title: document.getElementById('b-music-title').value.trim() || null,
      music_url: document.getElementById('b-music-url').value.trim() || null,
      note: document.getElementById('b-note').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    await supabase.from('status_banner').update(payload).eq('id', true);
    document.getElementById('b-saved').style.display = 'inline';
  });
}
