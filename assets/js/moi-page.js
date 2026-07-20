import { getMoiSession, signInMoi, signOutMoi } from './auth.js';
import { applySeason } from './season.js';
import { initFinances } from './finances.js';
import { renderEntryList } from './admin-entries.js';
import { renderBandeauAdmin } from './admin-bandeau.js';
import { renderDiscussionsAdmin, refreshDiscussionsBadge } from './admin-discussions.js';
import { renderCoreenTab } from './coreen.js';
import { renderJournal } from './journal.js';
import { renderChecklist } from './checklist.js';
import { renderEmergencyInfo } from './emergency-info.js';
import { renderWishlist } from './wishlist.js';
import { renderQuickNotes } from './quick-notes.js';
import { renderDashboard } from './dashboard.js';
import { pushSupportStatus, getExistingSubscription, enablePushNotifications, disablePushNotifications } from './push-notifications.js';

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
  document.getElementById('adm-home-link').addEventListener('click', () => switchTab('accueil'));

  document.querySelectorAll('.adm-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  switchTab('accueil');
  refreshDiscussionsBadge();
  setupNotifButton();
}

const TAB_NAMES = ['accueil', 'bandeau', 'checklist', 'coreen', 'discussions', 'envies', 'finances', 'journal', 'lettres', 'notes', 'recits', 'urgence'];

function switchTab(name) {
  document.querySelectorAll('.adm-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  TAB_NAMES.forEach((n) => {
    document.getElementById('panel-' + n).style.display = n === name ? '' : 'none';
  });

  // L'accueil résume les autres onglets : on le recharge à chaque visite
  // pour rester à jour, contrairement aux autres onglets mis en cache.
  if (name === 'accueil') {
    renderDashboard(document.getElementById('panel-accueil'), switchTab);
    return;
  }

  if (loadedTabs.has(name)) return;
  loadedTabs.add(name);

  const panel = document.getElementById('panel-' + name);
  if (name === 'finances') initFinances(panel);
  if (name === 'recits') renderEntryList(panel, 'recit');
  if (name === 'lettres') renderEntryList(panel, 'lettre');
  if (name === 'bandeau') renderBandeauAdmin(panel);
  if (name === 'discussions') renderDiscussionsAdmin(panel);
  if (name === 'coreen') renderCoreenTab(panel);
  if (name === 'journal') renderJournal(panel);
  if (name === 'checklist') renderChecklist(panel);
  if (name === 'urgence') renderEmergencyInfo(panel);
  if (name === 'envies') renderWishlist(panel);
  if (name === 'notes') renderQuickNotes(panel);
}

async function setupNotifButton() {
  const btn = document.getElementById('notif-btn');
  const status = pushSupportStatus();
  if (status === 'unsupported') return;

  btn.style.display = '';
  const subscription = status === 'ready' ? await getExistingSubscription() : null;
  setNotifBtnLabel(btn, !!subscription);

  btn.addEventListener('click', async () => {
    if (pushSupportStatus() === 'needs-install') {
      alert("Sur iPhone : ajoute d'abord ce site à l'écran d'accueil (Partager → Sur l'écran d'accueil) pour pouvoir activer les notifications.");
      return;
    }
    const isEnabled = btn.dataset.enabled === 'true';
    btn.disabled = true;
    try {
      if (isEnabled) {
        await disablePushNotifications();
        setNotifBtnLabel(btn, false);
      } else {
        await enablePushNotifications('moi');
        setNotifBtnLabel(btn, true);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Impossible d'activer les notifications.");
    } finally {
      btn.disabled = false;
    }
  });
}

function setNotifBtnLabel(btn, enabled) {
  btn.dataset.enabled = String(enabled);
  btn.textContent = enabled ? '🔔 Notifs activées' : '🔕 Activer les notifs';
}

boot();
