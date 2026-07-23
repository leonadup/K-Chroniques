import { supabase } from './supabase-client.js';
import { escapeHtml, fmtEuros } from './utils.js';
import { countUnreadDiscussions } from './admin-discussions.js';
import { STALE_DAYS } from './checklist.js';
import { icon } from './icons.js';

/** Page d'accueil de l'espace Moi : résumé de chaque onglet en un coup
 * d'œil, accessible en cliquant sur "Moi" (pas un onglet à part entière —
 * voir moi-page.js). `goToTab` permet à chaque carte d'ouvrir l'onglet
 * correspondant. */
export async function renderDashboard(container, goToTab) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;

  const [
    { data: reste },
    { data: entries },
    { data: banner },
    unreadDiscussions,
    { data: coreenStats },
    { count: dueCount },
    { data: journalLast },
    { data: checklist },
    { data: emergency },
    { data: wishlist },
    { count: notesCount },
    { data: lastNote }
  ] = await Promise.all([
    supabase.rpc('reste_a_vivre_du_mois'),
    supabase.from('entries').select('id, type, published'),
    supabase.from('status_banner').select('city, status_note').eq('id', true).maybeSingle(),
    countUnreadDiscussions(),
    supabase.from('coreen_stats').select('xp, streak_days').eq('id', true).maybeSingle(),
    supabase.from('coreen_progress').select('id', { count: 'exact', head: true }).lte('next_review_at', new Date().toISOString()),
    supabase.from('journal_entries').select('entry_date, mood').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    supabase.from('checklist_items').select('done, created_at'),
    supabase.from('emergency_info').select('contact_france_phone, embassy_phone, insurance_name').eq('id', true).maybeSingle(),
    supabase.from('wishlist_items').select('done'),
    supabase.from('quick_notes').select('id', { count: 'exact', head: true }),
    supabase.from('quick_notes').select('body').order('created_at', { ascending: false }).limit(1)
  ]);

  const draftCount = (entries || []).filter((e) => !e.published).length;
  const publishedCount = (entries || []).filter((e) => e.published).length;

  const checklistDone = (checklist || []).filter((c) => c.done).length;
  const checklistTotal = (checklist || []).length;
  const staleCount = (checklist || []).filter((c) => !c.done && Date.now() - new Date(c.created_at).getTime() >= STALE_DAYS * 86400000).length;

  const wishlistDone = (wishlist || []).filter((w) => w.done).length;
  const wishlistTotal = (wishlist || []).length;

  const emergencyFilled = !!(emergency?.contact_france_phone || emergency?.embassy_phone || emergency?.insurance_name);

  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:26px; font-weight:600; margin:0 0 4px; display:flex; align-items:center; gap:8px;">Bonjour Léona ${icon('wave', 22)}</p>
    <p class="hint-text" style="margin-bottom:20px;">Un coup d'œil sur tout, clique une carte pour ouvrir l'onglet.</p>
    <div class="dash-grid">
      ${dashCard('finances', icon('wallet'), 'Finances', typeof reste === 'number' ? fmtEuros(reste) : '—', 'reste à vivre ce mois-ci')}
      ${dashCard(
        'recits',
        icon('filetext'),
        'Récits & Lettres',
        draftCount > 0 ? `${draftCount} brouillon${draftCount > 1 ? 's' : ''}` : 'Tout est publié',
        `${publishedCount} publié${publishedCount > 1 ? 's' : ''} au total`,
        draftCount > 0
      )}
      ${dashCard('bandeau', icon('pin'), 'Où j\'en suis', escapeHtml(banner?.city || 'Non renseigné'), escapeHtml(banner?.status_note || ''))}
      ${dashCard(
        'discussions',
        icon('chat'),
        'Discussions',
        unreadDiscussions > 0 ? `${unreadDiscussions} non lu${unreadDiscussions > 1 ? 's' : ''}` : 'À jour',
        'depuis tes proches',
        unreadDiscussions > 0
      )}
      ${dashCard(
        'coreen',
        icon('flag'),
        'Coréen',
        `${icon('flame', 14, 'icon-inline')} ${coreenStats?.streak_days ?? 0} · ${coreenStats?.xp ?? 0} XP`,
        dueCount > 0 ? `${dueCount} mot${dueCount > 1 ? 's' : ''} à réviser` : 'Rien à réviser aujourd\'hui'
      )}
      ${dashCard('journal', icon('book'), 'Journal', journalDateLabel(journalLast?.[0]), journalLast?.[0]?.mood ? `Dernière humeur : ${escapeHtml(journalLast[0].mood)}` : "Pas encore d'entrée")}
      ${dashCard(
        'checklist',
        icon('checkcircle'),
        'Checklist PVT',
        `${checklistDone} / ${checklistTotal} faits`,
        staleCount > 0 ? `${icon('clock', 13, 'icon-inline')} ${staleCount} en attente depuis longtemps` : 'Rien qui traîne',
        staleCount > 0
      )}
      ${dashCard('urgence', icon('alert'), 'Urgence', emergencyFilled ? 'Complétée' : 'À compléter', 'contacts, assurance, santé', !emergencyFilled)}
      ${dashCard('envies', icon('compass'), 'Envies', `${wishlistDone} / ${wishlistTotal} faites`, 'lieux, restos, expériences')}
      ${dashCard('notes', icon('notes'), 'Notes', notesCount > 0 ? `${notesCount} note${notesCount > 1 ? 's' : ''}` : 'Rien pour l\'instant', lastNote?.[0]?.body ? escapeHtml(truncate(lastNote[0].body, 60)) : '')}
    </div>
  `;

  container.querySelectorAll('[data-dash-card]').forEach((card) => {
    card.addEventListener('click', () => goToTab(card.dataset.dashCard));
  });
}

function dashCard(tab, iconHtml, title, value, note, flagged = false) {
  return `
    <div class="dash-card ${flagged ? 'flagged' : ''}" data-dash-card="${tab}">
      <span class="dash-card-icon">${iconHtml}</span>
      <p class="dash-card-title">${title}</p>
      <p class="dash-card-value">${value}</p>
      ${note ? `<p class="dash-card-note">${note}</p>` : ''}
    </div>
  `;
}

function journalDateLabel(last) {
  if (!last) return "Pas encore d'entrée";
  const days = Math.floor((Date.now() - new Date(last.entry_date + 'T00:00:00').getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days} jours`;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n).trimEnd() + '…' : s;
}
