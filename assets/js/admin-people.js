import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { CIRCLES } from './circles.js';

// Gestion des comptes personnels (un code par personne, voir
// supabase/migrations/014_personnes.sql) qui remplacent les 4 anciens
// codes partagés par cercle. Le code de chaque personne est affiché en
// clair dans la liste : Léona doit pouvoir le retrouver pour le
// communiquer — ce n'est pas un secret côté base (même logique que les
// anciens codes de cercle, voir la note de sécurité en haut de schema.sql).
const GROUPS = Object.values(CIRCLES).filter((c) => !c.isAdmin);

export async function renderPeopleAdmin(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data, error } = await supabase.from('people').select('*').order('circle_id').order('name');
  if (error) {
    container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    return;
  }
  renderView(container, data || []);
}

function renderView(container, people) {
  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Personnes</p>
    <p class="hint-text" style="margin-bottom:16px;">Un code personnel par personne — remplace les anciens codes partagés par cercle. Communique son code à chacun après l'avoir ajouté ici.</p>

    <div class="mf-panel">
      <div class="field">
        <label>Prénom</label>
        <input type="text" id="pp-name" maxlength="60" />
      </div>
      <div class="field">
        <label>Groupe</label>
        <select id="pp-circle">
          ${GROUPS.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Code personnel</label>
        <input type="text" id="pp-code" maxlength="80" />
      </div>
      <p class="error-text" id="pp-error" style="display:none"></p>
      <button class="btn" id="pp-add">Ajouter</button>
    </div>

    <div class="adm-list" id="pp-list">
      ${people.length === 0 ? `<p class="hint-text">Pas encore de personne ajoutée.</p>` : people.map((p) => personHtml(p)).join('')}
    </div>
  `;

  document.getElementById('pp-add').addEventListener('click', async () => {
    const errorEl = document.getElementById('pp-error');
    errorEl.style.display = 'none';

    const name = document.getElementById('pp-name').value.trim();
    const circleId = document.getElementById('pp-circle').value;
    const accessCode = document.getElementById('pp-code').value.trim();
    if (!name || !accessCode) {
      errorEl.textContent = 'Renseigne un prénom et un code.';
      errorEl.style.display = 'block';
      return;
    }

    const { data, error } = await supabase
      .from('people')
      .insert({ name, circle_id: circleId, access_code: accessCode })
      .select()
      .single();

    if (error) {
      errorEl.textContent = error.message.includes('duplicate') ? 'Ce code est déjà utilisé par quelqu\'un d\'autre.' : error.message;
      errorEl.style.display = 'block';
      return;
    }

    people.push(data);
    people.sort((a, b) => (a.circle_id + a.name).localeCompare(b.circle_id + b.name));
    renderView(container, people);
  });

  container.querySelectorAll('[data-person-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette personne ? Son code ne fonctionnera plus.')) return;
      const id = btn.dataset.personDelete;
      await supabase.from('people').delete().eq('id', id);
      renderView(container, people.filter((p) => p.id !== id));
    });
  });
}

function personHtml(person) {
  const groupLabel = CIRCLES[person.circle_id]?.label || person.circle_id;
  return `
    <div class="adm-list-item" style="cursor:default;">
      <div>
        <span class="adm-list-item-title">${escapeHtml(person.name)}</span>
        <span class="adm-list-item-meta" style="margin-left:8px;">${escapeHtml(groupLabel)} · code : ${escapeHtml(person.access_code)}</span>
      </div>
      <button class="mf-del" data-person-delete="${person.id}" title="Supprimer">${icon('x', 13)}</button>
    </div>
  `;
}
