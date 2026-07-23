import { supabase } from './supabase-client.js';
import { escapeHtml, fmtEuros } from './utils.js';
import { icon } from './icons.js';

const CATEGORY_LABELS = {
  logement: 'Logement',
  charges: 'Charges',
  nourriture: 'Nourriture',
  transport: 'Transport',
  telephone: 'Téléphone',
  loisirs: 'Loisirs/sorties',
  shopping: 'Shopping',
  sante: 'Santé',
  imprevus: 'Imprévus'
};
const CATEGORIES = Object.keys(CATEGORY_LABELS);
const INCOME_SOURCES = ['Preply', 'Job', 'Économies', 'Autre'];

let state = { budget: {}, expenses: [], incomes: [] };
let root = null;
let activeTab = 'dashboard';

export async function initFinances(container) {
  root = container;
  await reload();
}

async function reload() {
  const [budgetRes, expensesRes, incomesRes] = await Promise.all([
    supabase.from('budget_targets').select('category, target_amount'),
    supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
    supabase.from('incomes').select('*').order('income_date', { ascending: false })
  ]);

  state.budget = {};
  CATEGORIES.forEach((c) => (state.budget[c] = 0));
  (budgetRes.data || []).forEach((row) => (state.budget[row.category] = Number(row.target_amount)));
  state.expenses = expensesRes.data || [];
  state.incomes = incomesRes.data || [];

  render();
}

function currentMonthKey(d = new Date()) {
  return d.toISOString().slice(0, 10).slice(0, 7);
}
function daysInMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function render() {
  root.innerHTML = `
    <div id="mf-root">
      <div style="margin-bottom: 24px;">
        <p style="font-family: var(--font-serif); font-size: 24px; font-weight: 600; margin: 0 0 4px;">Finances</p>
        <p style="font-size: 13.5px; color: var(--ink-soft); margin: 0;">Ton budget PVT, jour après jour.</p>
      </div>
      <div class="adm-tabs" style="margin: 0 0 22px;">
        ${['dashboard', 'budget', 'depenses', 'revenus']
          .map(
            (t) =>
              `<button class="adm-tab ${t === activeTab ? 'active' : ''}" data-mf-tab="${t}">${
                { dashboard: 'Tableau de bord', budget: 'Budget cible', depenses: 'Dépenses', revenus: 'Revenus' }[t]
              }</button>`
          )
          .join('')}
      </div>
      <div id="mf-tab-content"></div>
    </div>
  `;

  root.querySelectorAll('[data-mf-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.mfTab;
      render();
    });
  });

  const content = document.getElementById('mf-tab-content');
  if (activeTab === 'dashboard') renderDashboard(content);
  if (activeTab === 'budget') renderBudget(content);
  if (activeTab === 'depenses') renderDepenses(content);
  if (activeTab === 'revenus') renderRevenus(content);
}

function renderDashboard(el) {
  const monthKey = currentMonthKey();
  const monthExpenses = state.expenses.filter((e) => e.expense_date.startsWith(monthKey));
  const monthIncomes = state.incomes.filter((i) => i.income_date.startsWith(monthKey));

  const totalSpent = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = monthIncomes.reduce((s, i) => s + Number(i.amount), 0);
  const totalBudget = Object.values(state.budget).reduce((s, v) => s + Number(v), 0);
  const resteAVivre = totalIncome - totalSpent;

  const dim = daysInMonth(monthKey);
  const dayNow = Math.min(new Date().getDate(), dim);
  const dailyAvg = dayNow > 0 ? totalSpent / dayNow : 0;
  const projection = dailyAvg * dim;

  const pastMonths = {};
  state.expenses.forEach((e) => {
    const mk = e.expense_date.slice(0, 7);
    if (mk !== monthKey) pastMonths[mk] = (pastMonths[mk] || 0) + Number(e.amount);
  });
  const pastValues = Object.values(pastMonths);
  const pastAvg = pastValues.length ? pastValues.reduce((a, b) => a + b, 0) / pastValues.length : null;

  const byCategory = {};
  monthExpenses.forEach((e) => (byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount)));

  el.innerHTML = `
    <div class="mf-grid">
      <div class="mf-card">
        <p class="mf-card-label">Reste à vivre ce mois-ci</p>
        <p class="mf-card-value ${resteAVivre < 0 ? 'negative' : 'positive'}">${fmtEuros(resteAVivre)}</p>
        <p class="mf-card-note">${fmtEuros(totalIncome)} de revenus − ${fmtEuros(totalSpent)} dépensés</p>
      </div>
      <div class="mf-card">
        <p class="mf-card-label">Projection fin de mois</p>
        <p class="mf-card-value ${projection > totalBudget ? 'negative' : ''}">${fmtEuros(projection)}</p>
        <p class="mf-card-note">Basé sur ${fmtEuros(dailyAvg)}/jour depuis le début du mois</p>
      </div>
      <div class="mf-card">
        <p class="mf-card-label">Moyenne des mois précédents</p>
        <p class="mf-card-value">${pastAvg !== null ? fmtEuros(pastAvg) : '—'}</p>
        <p class="mf-card-note">${pastValues.length} mois de données</p>
      </div>
    </div>
    <div class="mf-panel">
      <p class="mf-section-title">Répartition par catégorie — ${monthKey}</p>
      ${CATEGORIES.map((cat) => {
        const spent = byCategory[cat] || 0;
        const target = Number(state.budget[cat] || 0);
        const pct = target > 0 ? Math.min(100, (spent / target) * 100) : 0;
        const over = target > 0 && spent > target;
        return `
          <div class="mf-cat-row">
            <span>${CATEGORY_LABELS[cat]}</span>
            <div class="mf-bar-track"><div class="mf-bar-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
            <span class="mf-cat-amount">${fmtEuros(spent)} / ${fmtEuros(target)}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBudget(el) {
  el.innerHTML = `
    <div class="mf-panel">
      <p class="mf-section-title">Objectifs mensuels par catégorie</p>
      <p class="hint-text" style="margin-bottom: 14px;">Ajuste-les librement — elles servent de repère dans le tableau de bord.</p>
      ${CATEGORIES.map(
        (cat) => `
        <div class="mf-form-row" style="align-items:center;">
          <span style="flex:1 1 140px; font-size:13.5px;">${CATEGORY_LABELS[cat]}</span>
          <input type="number" min="0" step="1" data-budget-cat="${cat}" value="${state.budget[cat] ?? 0}" style="flex:0 0 100px;" />
        </div>
      `
      ).join('')}
      <button class="btn" id="mf-save-budget" style="margin-top: 10px;">Enregistrer le budget</button>
    </div>
  `;

  document.getElementById('mf-save-budget').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';

    const rows = CATEGORIES.map((cat) => ({
      category: cat,
      target_amount: Number(document.querySelector(`[data-budget-cat="${cat}"]`).value) || 0
    }));
    await supabase.from('budget_targets').upsert(rows, { onConflict: 'category' });
    await reload();
  });
}

function renderDepenses(el) {
  const sorted = [...state.expenses].sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1));

  el.innerHTML = `
    <div class="mf-panel">
      <p class="mf-section-title">Ajouter une dépense</p>
      <div class="mf-form-row">
        <input type="date" id="ed-date" value="${new Date().toISOString().slice(0, 10)}" />
        <select id="ed-cat">${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('')}</select>
        <input type="number" id="ed-amount" placeholder="Montant €" min="0" step="0.01" />
        <input type="text" id="ed-note" placeholder="Note (optionnel)" />
        <button class="btn" id="ed-add">Ajouter</button>
      </div>
    </div>
    <div class="mf-panel">
      <p class="mf-section-title">Historique</p>
      <table class="mf-table">
        <thead><tr><th>Date</th><th>Catégorie</th><th>Note</th><th style="text-align:right;">Montant</th><th></th></tr></thead>
        <tbody>
          ${
            sorted.length === 0
              ? `<tr><td colspan="5" class="mf-empty">Aucune dépense enregistrée pour l'instant.</td></tr>`
              : sorted
                  .map(
                    (e) => `
              <tr>
                <td>${new Date(e.expense_date).toLocaleDateString('fr-FR')}</td>
                <td><span class="mf-tag">${CATEGORY_LABELS[e.category] || e.category}</span></td>
                <td>${escapeHtml(e.note || '')}</td>
                <td class="amount">${fmtEuros(Number(e.amount))}</td>
                <td><button class="mf-del" data-del-expense="${e.id}">${icon('x', 13)}</button></td>
              </tr>
            `
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('ed-add').addEventListener('click', async () => {
    const date = document.getElementById('ed-date').value;
    const category = document.getElementById('ed-cat').value;
    const amount = Number(document.getElementById('ed-amount').value);
    const note = document.getElementById('ed-note').value.trim();
    if (!date || !amount || amount <= 0) return;
    await supabase.from('expenses').insert({ expense_date: date, category, amount, note: note || null });
    await reload();
  });

  el.querySelectorAll('[data-del-expense]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('expenses').delete().eq('id', btn.dataset.delExpense);
      await reload();
    });
  });
}

function renderRevenus(el) {
  const sorted = [...state.incomes].sort((a, b) => (a.income_date < b.income_date ? 1 : -1));

  el.innerHTML = `
    <div class="mf-panel">
      <p class="mf-section-title">Ajouter un revenu</p>
      <div class="mf-form-row">
        <input type="date" id="er-date" value="${new Date().toISOString().slice(0, 10)}" />
        <select id="er-source">${INCOME_SOURCES.map((s) => `<option value="${s}">${s}</option>`).join('')}</select>
        <input type="number" id="er-amount" placeholder="Montant €" min="0" step="0.01" />
        <input type="text" id="er-note" placeholder="Note (optionnel)" />
        <button class="btn" id="er-add">Ajouter</button>
      </div>
    </div>
    <div class="mf-panel">
      <p class="mf-section-title">Historique</p>
      <table class="mf-table">
        <thead><tr><th>Date</th><th>Source</th><th>Note</th><th style="text-align:right;">Montant</th><th></th></tr></thead>
        <tbody>
          ${
            sorted.length === 0
              ? `<tr><td colspan="5" class="mf-empty">Aucun revenu enregistré pour l'instant.</td></tr>`
              : sorted
                  .map(
                    (i) => `
              <tr>
                <td>${new Date(i.income_date).toLocaleDateString('fr-FR')}</td>
                <td><span class="mf-tag">${escapeHtml(i.source)}</span></td>
                <td>${escapeHtml(i.note || '')}</td>
                <td class="amount">${fmtEuros(Number(i.amount))}</td>
                <td><button class="mf-del" data-del-income="${i.id}">${icon('x', 13)}</button></td>
              </tr>
            `
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('er-add').addEventListener('click', async () => {
    const date = document.getElementById('er-date').value;
    const source = document.getElementById('er-source').value;
    const amount = Number(document.getElementById('er-amount').value);
    const note = document.getElementById('er-note').value.trim();
    if (!date || !amount || amount <= 0) return;
    await supabase.from('incomes').insert({ income_date: date, source, amount, note: note || null });
    await reload();
  });

  el.querySelectorAll('[data-del-income]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await supabase.from('incomes').delete().eq('id', btn.dataset.delIncome);
      await reload();
    });
  });
}
