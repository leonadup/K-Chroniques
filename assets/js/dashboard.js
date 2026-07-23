import { supabase } from './supabase-client.js';
import { escapeHtml, fmtEuros } from './utils.js';
import { countUnreadDiscussions } from './admin-discussions.js';
import { STALE_DAYS } from './checklist.js';
import { MASTERED_BOX } from './coreen.js';
import { icon } from './icons.js';

/** Page d'accueil de l'espace Moi : un coup d'œil visuel (jauges, barres,
 * liste "à traiter") plutôt qu'une grille de cartes uniformes, accessible en
 * cliquant sur "Moi" (pas un onglet à part entière — voir moi-page.js).
 * `goToTab` permet à chaque bloc/ligne d'ouvrir l'onglet correspondant. */
export async function renderDashboard(container, goToTab) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;

  const monthKey = new Date().toISOString().slice(0, 7);

  const [
    { data: entries },
    { data: banner },
    unreadDiscussions,
    { data: coreenStats },
    { data: coreenProgress },
    { count: itemsCount },
    { count: dueCount },
    { data: journalLast },
    { data: checklist },
    { data: emergency },
    { data: wishlist },
    { count: notesCount },
    { data: lastNote },
    { data: expenses },
    { data: incomes }
  ] = await Promise.all([
    supabase.from('entries').select('id, type, published'),
    supabase.from('status_banner').select('city, status_note').eq('id', true).maybeSingle(),
    countUnreadDiscussions(),
    supabase.from('coreen_stats').select('xp, streak_days').eq('id', true).maybeSingle(),
    supabase.from('coreen_progress').select('box'),
    supabase.from('coreen_items').select('id', { count: 'exact', head: true }),
    supabase.from('coreen_progress').select('id', { count: 'exact', head: true }).lte('next_review_at', new Date().toISOString()),
    supabase.from('journal_entries').select('entry_date, mood').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    supabase.from('checklist_items').select('done, created_at'),
    supabase.from('emergency_info').select('contact_france_phone, embassy_phone, insurance_name').eq('id', true).maybeSingle(),
    supabase.from('wishlist_items').select('done'),
    supabase.from('quick_notes').select('id', { count: 'exact', head: true }),
    supabase.from('quick_notes').select('body').order('created_at', { ascending: false }).limit(1),
    supabase.from('expenses').select('expense_date, amount'),
    supabase.from('incomes').select('income_date, amount')
  ]);

  const draftCount = (entries || []).filter((e) => !e.published).length;
  const publishedCount = (entries || []).filter((e) => e.published).length;

  const staleCount = (checklist || []).filter((c) => !c.done && Date.now() - new Date(c.created_at).getTime() >= STALE_DAYS * 86400000).length;

  const wishlistDone = (wishlist || []).filter((w) => w.done).length;
  const wishlistTotal = (wishlist || []).length;

  const emergencyFilled = !!(emergency?.contact_france_phone || emergency?.embassy_phone || emergency?.insurance_name);

  const totalIncome = (incomes || []).filter((i) => i.income_date.startsWith(monthKey)).reduce((s, i) => s + Number(i.amount), 0);
  const totalSpent = (expenses || []).filter((e) => e.expense_date.startsWith(monthKey)).reduce((s, e) => s + Number(e.amount), 0);
  const resteAVivre = totalIncome - totalSpent;
  const spentPct = totalIncome > 0 ? Math.min(100, Math.round((totalSpent / totalIncome) * 100)) : 0;

  const masteredCount = (coreenProgress || []).filter((p) => p.box >= MASTERED_BOX).length;
  const masteryPct = itemsCount > 0 ? Math.round((masteredCount / itemsCount) * 100) : 0;

  const publishedPct = draftCount + publishedCount > 0 ? Math.round((publishedCount / (draftCount + publishedCount)) * 100) : 0;

  container.innerHTML = `
    <p class="dash-greeting">Bonjour Léona ${icon('wave', 22)}</p>
    <p class="hint-text" style="margin-bottom:20px;">Aperçu du mois, ce qui attend une réponse, où tu en es.</p>

    <div class="dash-grid">
      <section class="dash-card dash-c-finances clickable" data-dash-card="finances">
        <div class="dash-card-head">
          <p class="dash-card-title">${icon('wallet', 14)} Finances</p>
        </div>
        <div class="dash-fin-hero">
          <span class="dash-fin-value">${fmtEuros(resteAVivre)}</span>
          <span class="dash-fin-label">reste à vivre ce mois-ci</span>
        </div>
        <div class="dash-meter"><div class="dash-meter-fill" style="width:${spentPct}%"></div></div>
        <div class="dash-meter-caption"><span>${fmtEuros(totalSpent)} dépensés</span><span>sur ${fmtEuros(totalIncome)} de revenus</span></div>
        <div class="dash-cmp-row">
          <span class="dash-cmp-label"><span class="dash-cmp-dot" style="background:var(--celadon)"></span>Revenus</span>
          <div class="dash-cmp-track"><div class="dash-cmp-fill" style="width:100%; background:var(--celadon)"></div></div>
          <span class="dash-cmp-value">${fmtEuros(totalIncome)}</span>
        </div>
        <div class="dash-cmp-row">
          <span class="dash-cmp-label"><span class="dash-cmp-dot" style="background:var(--persimmon)"></span>Dépenses</span>
          <div class="dash-cmp-track"><div class="dash-cmp-fill" style="width:${spentPct}%; background:var(--persimmon)"></div></div>
          <span class="dash-cmp-value">${fmtEuros(totalSpent)}</span>
        </div>
      </section>

      <section class="dash-card dash-c-todo">
        <div class="dash-card-head">
          <p class="dash-card-title">${icon('bell', 14)} À traiter</p>
        </div>
        ${todoListHtml({ unreadDiscussions, staleCount, draftCount })}
      </section>

      <section class="dash-card dash-c-coreen clickable" data-dash-card="coreen">
        <div class="dash-card-head">
          <p class="dash-card-title">${icon('flag', 14)} Coréen</p>
        </div>
        <div class="dash-kr-top">
          <div>
            <div class="dash-kr-mastery-value">${masteredCount} / ${itemsCount || 0}</div>
            <div class="dash-kr-mastery-label">mots maîtrisés</div>
          </div>
          <div class="dash-kr-mastery-label" style="text-align:right;">${dueCount > 0 ? `${dueCount} mot${dueCount > 1 ? 's' : ''}<br>à réviser` : 'Rien à réviser<br>aujourd\'hui'}</div>
        </div>
        <div class="dash-meter"><div class="dash-meter-fill" style="width:${masteryPct}%; background:var(--celadon)"></div></div>
        <div class="dash-kr-stats">
          <div class="dash-kr-stat">${icon('flame', 15)}<span class="dash-kr-stat-value">${coreenStats?.streak_days ?? 0}</span><span class="dash-kr-stat-label">${(coreenStats?.streak_days ?? 0) > 1 ? 'jours de suite' : 'jour'}</span></div>
          <div class="dash-kr-stat"><span class="dash-kr-stat-value">${coreenStats?.xp ?? 0}</span><span class="dash-kr-stat-label">XP</span></div>
        </div>
      </section>

      <section class="dash-card dash-c-recits clickable" data-dash-card="recits">
        <div class="dash-card-head">
          <p class="dash-card-title">${icon('filetext', 14)} Récits &amp; lettres</p>
        </div>
        ${
          draftCount + publishedCount > 0
            ? `
        <div class="dash-rc-stack">
          ${publishedCount > 0 ? `<div class="dash-rc-seg published" style="width:${publishedPct}%">${publishedCount}</div>` : ''}
          ${draftCount > 0 ? `<div class="dash-rc-seg draft" style="width:${100 - publishedPct}%">${draftCount}</div>` : ''}
        </div>
        <div class="dash-rc-legend">
          <span class="dash-rc-legend-item"><span class="dash-rc-legend-dot" style="background:var(--celadon)"></span>Publiés</span>
          <span class="dash-rc-legend-item"><span class="dash-rc-legend-dot" style="background:var(--persimmon)"></span>Brouillons</span>
        </div>`
            : `<p class="hint-text">Rien pour l'instant.</p>`
        }
      </section>

      <section class="dash-card dash-c-mini clickable" data-dash-card="bandeau">
        <p class="dash-mini-label">${icon('pin', 13)} Où j'en suis</p>
        <p class="dash-mini-value">${escapeHtml(banner?.city || 'Non renseigné')}</p>
        <p class="dash-mini-note">${escapeHtml(banner?.status_note || '')}</p>
      </section>

      <div class="dash-section-break"><p>Secondaire</p></div>

      <section class="dash-card dash-c-mini clickable" data-dash-card="urgence">
        <p class="dash-mini-label">${icon('alert', 13)} Urgence</p>
        <p class="dash-mini-value">${emergencyFilled ? 'Complétée' : 'À compléter'}</p>
        <p class="dash-mini-note ${!emergencyFilled ? 'flag' : ''}">contacts, assurance, santé</p>
      </section>

      <section class="dash-card dash-c-mini clickable" data-dash-card="envies">
        <p class="dash-mini-label">${icon('compass', 13)} Envies</p>
        <p class="dash-mini-value">${wishlistDone} / ${wishlistTotal}</p>
        <p class="dash-mini-note">lieux, restos, expériences</p>
      </section>

      <section class="dash-card dash-c-mini clickable" data-dash-card="notes">
        <p class="dash-mini-label">${icon('notes', 13)} Notes</p>
        <p class="dash-mini-value">${notesCount > 0 ? `${notesCount} note${notesCount > 1 ? 's' : ''}` : "Rien pour l'instant"}</p>
        <p class="dash-mini-note">${lastNote?.[0]?.body ? escapeHtml(truncate(lastNote[0].body, 40)) : ''}</p>
      </section>

      <section class="dash-card dash-c-mini clickable" data-dash-card="journal">
        <p class="dash-mini-label">${icon('book', 13)} Journal</p>
        <p class="dash-mini-value">${journalDateLabel(journalLast?.[0])}</p>
        <p class="dash-mini-note">${journalLast?.[0]?.mood ? `Dernière humeur : ${escapeHtml(journalLast[0].mood)}` : "Pas encore d'entrée"}</p>
      </section>
    </div>
  `;

  container.querySelectorAll('[data-dash-card]').forEach((card) => {
    card.addEventListener('click', () => goToTab(card.dataset.dashCard));
  });
  container.querySelectorAll('[data-dash-todo]').forEach((row) => {
    row.addEventListener('click', () => goToTab(row.dataset.dashTodo));
  });
}

function todoListHtml({ unreadDiscussions, staleCount, draftCount }) {
  const rows = [
    unreadDiscussions > 0 && {
      tab: 'discussions',
      icon: icon('chat', 15),
      text: `Discussion${unreadDiscussions > 1 ? 's' : ''} non lue${unreadDiscussions > 1 ? 's' : ''}`,
      count: unreadDiscussions
    },
    staleCount > 0 && {
      tab: 'checklist',
      icon: icon('clock', 15),
      text: 'Checklist en attente depuis longtemps',
      count: staleCount
    },
    draftCount > 0 && {
      tab: 'recits',
      icon: icon('filetext', 15),
      text: `Brouillon${draftCount > 1 ? 's' : ''} à publier`,
      count: draftCount
    }
  ].filter(Boolean);

  if (rows.length === 0) {
    return `<p class="hint-text">${icon('checkcircle', 14, 'icon-inline')} Rien à traiter, tout est à jour.</p>`;
  }

  return `
    <div class="dash-todo-list">
      ${rows
        .map(
          (r) => `
        <div class="dash-todo-row active" data-dash-todo="${r.tab}">
          <span class="dash-todo-icon">${r.icon}</span>
          <span class="dash-todo-text">${r.text}</span>
          <span class="dash-todo-count">${r.count}</span>
        </div>
      `
        )
        .join('')}
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
