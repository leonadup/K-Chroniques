import { getMoiSession, signInMoi, signOutMoi } from './auth.js';
import { applySeason } from './season.js';
import { initFinances } from './finances.js';
import { renderEntryList } from './admin-entries.js';
import { renderBandeauAdmin } from './admin-bandeau.js';
import { renderDiscussionsAdmin, refreshDiscussionsBadge } from './admin-discussions.js';
import { renderCoreenTab } from './coreen.js';

applySeason();

const loadedTabs = new Set();

async function boot() {
  const session = await getMoiSession();
  if (session) {
    showAdmin();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-wrap').style.display = '';
  document.getElementById('adm-root').style.display = 'none';

  document.getElementById('moi-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('moi-email').value.trim();
    const password = document.getElementById('moi-password').value;
    const errorEl = document.getElementById('moi-login-error');
    errorEl.style.display = 'none';

    const errorMessage = await signInMoi(email, password);
    if (errorMessage) {
      errorEl.textContent = errorMessage;
      errorEl.style.display = 'block';
      return;
    }
    showAdmin();
  });
}

function showAdmin() {
  document.getElementById('login-wrap').style.display = 'none';
  document.getElementById('adm-root').style.display = '';

  document.getElementById('moi-logout-btn').addEventListener('click', signOutMoi);

  document.querySelectorAll('.adm-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  switchTab('finances');
  refreshDiscussionsBadge();
}

function switchTab(name) {
  document.querySelectorAll('.adm-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['finances', 'recits', 'lettres', 'bandeau', 'discussions', 'coreen'].forEach((n) => {
    document.getElementById('panel-' + n).style.display = n === name ? '' : 'none';
  });

  if (loadedTabs.has(name)) return;
  loadedTabs.add(name);

  const panel = document.getElementById('panel-' + name);
  if (name === 'finances') initFinances(panel);
  if (name === 'recits') renderEntryList(panel, 'recit');
  if (name === 'lettres') renderEntryList(panel, 'lettre');
  if (name === 'bandeau') renderBandeauAdmin(panel);
  if (name === 'discussions') renderDiscussionsAdmin(panel);
  if (name === 'coreen') renderCoreenTab(panel);
}

boot();
