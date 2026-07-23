import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

let leafletMap = null;
let leafletMarkersLayer = null;

export async function renderWishlist(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('wishlist_items').select('*').order('done').order('created_at', { ascending: false });
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  leafletMap = null; // le conteneur de la carte est recréé à chaque rendu
  renderView(container, data || []);
}

function renderView(container, items) {
  const withCoords = items.filter((it) => it.lat != null && it.lng != null);

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Envies</p>
    <p class="hint-text" style="margin-bottom:16px;">Lieux, restos, expériences à ne pas oublier — coche au fur et à mesure.</p>

    <div class="mf-panel">
      <div class="field"><label>Titre</label><input type="text" id="wl-title" placeholder="Jjimjilbang à Hongdae" /></div>
      <div class="field">
        <label>Catégorie</label>
        <select id="wl-category">
          <option value="lieu">Lieu</option>
          <option value="resto">Resto / bar</option>
          <option value="experience">Expérience</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      <div class="field"><label>Note (optionnel)</label><input type="text" id="wl-note" /></div>
      <div class="field">
        <label>Coordonnées GPS (optionnel, pour la carte)</label>
        <div style="display:flex; gap:10px;">
          <input type="number" step="any" id="wl-lat" placeholder="Latitude" />
          <input type="number" step="any" id="wl-lng" placeholder="Longitude" />
        </div>
        <p class="hint-text">Copie-colle depuis Google Maps (clic droit sur le lieu → les deux nombres tout en haut du menu).</p>
      </div>
      <button class="btn" id="wl-add">Ajouter</button>
    </div>

    ${withCoords.length > 0 ? `<div id="wl-map" class="fds-map" style="margin-bottom:20px;"></div>` : ''}

    <div class="adm-list" id="wl-list">
      ${items.length === 0 ? `<p class="hint-text">Rien pour l'instant.</p>` : items.map((it) => itemHtml(it)).join('')}
    </div>
  `;

  document.getElementById('wl-add').addEventListener('click', async () => {
    const title = document.getElementById('wl-title').value.trim();
    if (!title) return;
    const latRaw = document.getElementById('wl-lat').value.trim();
    const lngRaw = document.getElementById('wl-lng').value.trim();
    const payload = {
      title,
      category: document.getElementById('wl-category').value,
      note: document.getElementById('wl-note').value.trim() || null,
      lat: latRaw === '' ? null : Number(latRaw),
      lng: lngRaw === '' ? null : Number(lngRaw)
    };
    const { data, error } = await supabase.from('wishlist_items').insert(payload).select().single();
    if (!error && data) {
      items.unshift(data);
      renderView(container, items);
    }
  });

  container.querySelectorAll('[data-wl-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.wlToggle;
      const item = items.find((it) => it.id === id);
      if (!item) return;
      item.done = !item.done;
      await supabase.from('wishlist_items').update({ done: item.done }).eq('id', id);
      renderView(container, items);
    });
  });

  container.querySelectorAll('[data-wl-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.wlDelete;
      await supabase.from('wishlist_items').delete().eq('id', id);
      renderView(container, items.filter((it) => it.id !== id));
    });
  });

  if (withCoords.length > 0) initMap(withCoords);
}

function initMap(withCoords) {
  leafletMap = L.map('wl-map', { scrollWheelZoom: false }).setView([36.5, 127.8], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(leafletMap);
  leafletMarkersLayer = L.layerGroup().addTo(leafletMap);

  const bounds = [];
  withCoords.forEach((item) => {
    const icon = L.divIcon({
      className: `fds-map-marker ${item.done ? 'recit' : 'lettre'}`,
      html: '<span></span>',
      iconSize: [18, 18]
    });
    const marker = L.marker([item.lat, item.lng], { icon }).addTo(leafletMarkersLayer);
    marker.bindPopup(`
      <div class="fds-map-popup">
        <p class="fds-map-popup-title">${escapeHtml(item.title)}${item.done ? ' ' + icon('check', 13, 'icon-inline') : ''}</p>
        ${item.note ? `<p class="fds-map-popup-date">${escapeHtml(item.note)}</p>` : ''}
      </div>
    `);
    bounds.push([item.lat, item.lng]);
  });
  leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 10 });
}

function itemHtml(item) {
  return `
    <div class="adm-list-item" style="cursor:default;">
      <label style="display:flex; align-items:center; gap:10px; flex:1; cursor:pointer;">
        <input type="checkbox" data-wl-toggle="${item.id}" ${item.done ? 'checked' : ''} />
        <span>
          <span class="adm-list-item-title" style="${item.done ? 'text-decoration:line-through; color:var(--ink-soft);' : ''}">${escapeHtml(item.title)}</span>
          <span class="mf-tag" style="margin-left:8px;">${categoryLabel(item.category)}</span>
          ${item.note ? `<br /><span class="adm-list-item-meta">${escapeHtml(item.note)}</span>` : ''}
        </span>
      </label>
      <button class="mf-del" data-wl-delete="${item.id}" title="Supprimer">${icon('x', 13)}</button>
    </div>
  `;
}

function categoryLabel(cat) {
  return { lieu: 'Lieu', resto: 'Resto / bar', experience: 'Expérience', autre: 'Autre' }[cat] || 'Autre';
}
