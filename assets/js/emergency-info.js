import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

export async function renderEmergencyInfo(container) {
  const { data } = await supabase.from('emergency_info').select('*').eq('id', true).maybeSingle();
  const e = data || {};

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">En cas d'urgence</p>
    <p class="hint-text" style="margin-bottom:18px;">Rien ici n'est jamais visible des cercles — uniquement pour toi, à garder à jour.</p>

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">Numéros valables partout en Corée</p>
      <div class="check-row" style="margin-bottom:4px;">
        <span class="mf-tag">112 — Police</span>
        <span class="mf-tag">119 — Pompiers / Urgences médicales</span>
        <span class="mf-tag">1330 — Assistance touristique multilingue</span>
      </div>
      <p class="hint-text">Numéros nationaux fixes, à connaître par cœur. Pense à vérifier le numéro à jour de l'ambassade ci-dessous une fois sur place (il peut changer).</p>
    </div>

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">Contact d'urgence en France</p>
      <div class="field"><label>Nom</label><input type="text" id="ei-contact-name" value="${escapeHtml(e.contact_france_name ?? '')}" /></div>
      <div class="field"><label>Téléphone (avec indicatif +33)</label><input type="text" id="ei-contact-phone" value="${escapeHtml(e.contact_france_phone ?? '')}" /></div>
    </div>

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">Assurance</p>
      <div class="field"><label>Assureur</label><input type="text" id="ei-insurance-name" value="${escapeHtml(e.insurance_name ?? '')}" /></div>
      <div class="field"><label>Numéro de contrat</label><input type="text" id="ei-insurance-policy" value="${escapeHtml(e.insurance_policy_number ?? '')}" /></div>
      <div class="field"><label>Téléphone assistance</label><input type="text" id="ei-insurance-phone" value="${escapeHtml(e.insurance_phone ?? '')}" /></div>
    </div>

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">Ambassade de France en Corée</p>
      <div class="field"><label>Téléphone</label><input type="text" id="ei-embassy-phone" value="${escapeHtml(e.embassy_phone ?? '')}" placeholder="à vérifier sur diplomatie.gouv.fr" /></div>
      <div class="field"><label>Adresse</label><input type="text" id="ei-embassy-address" value="${escapeHtml(e.embassy_address ?? '')}" /></div>
    </div>

    <div class="mf-panel">
      <p class="mf-section-title" style="font-size:15px;">Sur place & santé</p>
      <div class="field"><label>Adresse actuelle en Corée</label><input type="text" id="ei-home-address" value="${escapeHtml(e.home_address_korea ?? '')}" /></div>
      <div class="field"><label>Groupe sanguin (optionnel)</label><input type="text" id="ei-blood-type" value="${escapeHtml(e.blood_type ?? '')}" /></div>
      <div class="field"><label>Allergies</label><input type="text" id="ei-allergies" value="${escapeHtml(e.allergies ?? '')}" /></div>
      <div class="field"><label>Notes médicales (traitements en cours...)</label><textarea id="ei-medical-notes">${escapeHtml(e.medical_notes ?? '')}</textarea></div>
    </div>

    <button class="btn" id="ei-save">Enregistrer</button>
    <span id="ei-saved" style="display:none; margin-left:10px; font-size:12.5px; color:var(--celadon);">Enregistré.</span>
  `;

  document.getElementById('ei-save').addEventListener('click', async () => {
    const payload = {
      contact_france_name: val('ei-contact-name'),
      contact_france_phone: val('ei-contact-phone'),
      insurance_name: val('ei-insurance-name'),
      insurance_policy_number: val('ei-insurance-policy'),
      insurance_phone: val('ei-insurance-phone'),
      embassy_phone: val('ei-embassy-phone'),
      embassy_address: val('ei-embassy-address'),
      home_address_korea: val('ei-home-address'),
      blood_type: val('ei-blood-type'),
      allergies: val('ei-allergies'),
      medical_notes: val('ei-medical-notes'),
      updated_at: new Date().toISOString()
    };
    await supabase.from('emergency_info').update(payload).eq('id', true);
    const saved = document.getElementById('ei-saved');
    saved.style.display = 'inline';
    setTimeout(() => (saved.style.display = 'none'), 2000);
  });
}

function val(id) {
  return document.getElementById(id).value.trim() || null;
}
