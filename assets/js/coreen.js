import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';

// Espace personnel d'apprentissage du coréen (accessible uniquement depuis
// moi.html, protégé par les mêmes policies RLS que les Finances — voir
// supabase/migrations/006_coreen.sql). Répétition espacée façon Leitner :
// 6 "boîtes", plus une boîte est haute, plus l'intervalle avant la
// prochaine révision est long.
const BOX_INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 16, 6: 35 };
const MASTERED_BOX = 5;
const DAILY_NEW_ITEMS = 8;
const DAILY_SESSION_SIZE = 20;

let state = null; // { units, items, progressByItem, stats } — rechargé à chaque ouverture de l'onglet

export async function renderCoreenTab(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  await loadAll();
  renderOverview(container);
}

async function loadAll() {
  const [{ data: units }, { data: items }, { data: progress }, { data: stats }] = await Promise.all([
    supabase.from('coreen_units').select('*').order('sort_order'),
    supabase.from('coreen_items').select('*').order('sort_order'),
    supabase.from('coreen_progress').select('*'),
    supabase.from('coreen_stats').select('*').eq('id', true).maybeSingle()
  ]);

  const progressByItem = {};
  (progress || []).forEach((p) => (progressByItem[p.item_id] = p));

  state = {
    units: units || [],
    items: items || [],
    progressByItem,
    stats: stats || { xp: 0, streak_days: 0, last_practice_date: null }
  };
}

function isDue(item) {
  const p = state.progressByItem[item.id];
  if (!p) return false; // "nouveau", pas "à réviser"
  return new Date(p.next_review_at) <= new Date();
}
function isNew(item) {
  return !state.progressByItem[item.id];
}
function isMastered(item) {
  const p = state.progressByItem[item.id];
  return !!p && p.box >= MASTERED_BOX;
}

function unitStats(unitId) {
  const unitItems = state.items.filter((it) => it.unit_id === unitId);
  const due = unitItems.filter(isDue).length;
  const mastered = unitItems.filter(isMastered).length;
  return { total: unitItems.length, due, mastered };
}

// ---------------------------------------------------------------------------
// Vue d'ensemble
// ---------------------------------------------------------------------------
function renderOverview(container) {
  const { units, items, stats } = state;
  const dueItems = items.filter(isDue);
  const dailyQueue = buildDailyQueue();

  const masteredCount = items.filter(isMastered).length;

  container.innerHTML = `
    <div class="kr-stats-bar">
      <div class="kr-stat"><span class="kr-stat-value">${stats.xp}</span><span class="kr-stat-label">XP</span></div>
      <div class="kr-stat"><span class="kr-stat-value">🔥 ${stats.streak_days}</span><span class="kr-stat-label">${stats.streak_days > 1 ? 'jours de suite' : 'jour'}</span></div>
      <div class="kr-stat"><span class="kr-stat-value">${masteredCount} / ${items.length}</span><span class="kr-stat-label">mots maîtrisés</span></div>
    </div>

    ${
      dailyQueue.length > 0
        ? `<button class="btn kr-daily-btn" id="kr-daily-btn">▶ Session du jour (${dailyQueue.length} mots — ${dueItems.length} à réviser, ${dailyQueue.length - Math.min(dueItems.length, dailyQueue.length)} nouveaux)</button>`
        : `<p class="hint-text">Tout est à jour pour aujourd'hui 🎉 Reviens demain, ou entraîne-toi sur une unité précise ci-dessous.</p>`
    }

    <div class="kr-units-grid">
      ${units.map((u) => unitCardHtml(u)).join('')}
    </div>

    <div id="kr-add-word-mount"></div>
  `;

  document.getElementById('kr-daily-btn')?.addEventListener('click', () => {
    startPractice(container, dailyQueue, () => renderOverview(container));
  });

  container.querySelectorAll('[data-unit-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const unitId = el.dataset.unitCard;
      const unitItems = items.filter((it) => it.unit_id === unitId && (isDue(it) || isNew(it)));
      const queue = unitItems.length > 0 ? shuffle(unitItems) : shuffle(items.filter((it) => it.unit_id === unitId));
      startPractice(container, queue.slice(0, 30), () => renderOverview(container));
    });
  });

  import('./coreen-admin.js').then(({ renderAddWordForm }) => {
    renderAddWordForm(document.getElementById('kr-add-word-mount'), units, async () => {
      await loadAll();
      renderOverview(container);
    });
  });
}

function unitCardHtml(unit) {
  const { total, due, mastered } = unitStats(unit.id);
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
  return `
    <div class="kr-unit-card" data-unit-card="${unit.id}">
      <span class="kr-unit-icon">${unit.icon || '📘'}</span>
      <p class="kr-unit-title">${escapeHtml(unit.title)}</p>
      <div class="kr-unit-bar-track"><div class="kr-unit-bar-fill" style="width:${pct}%"></div></div>
      <p class="kr-unit-meta">${mastered}/${total} maîtrisés${due > 0 ? ` · <span class="kr-unit-due">${due} à réviser</span>` : ''}</p>
    </div>
  `;
}

function buildDailyQueue() {
  const due = shuffle(state.items.filter(isDue));
  const capped = due.slice(0, DAILY_SESSION_SIZE);
  const remaining = DAILY_SESSION_SIZE - capped.length;
  const newOnes = remaining > 0 ? state.items.filter(isNew).slice(0, Math.min(DAILY_NEW_ITEMS, remaining)) : [];
  return shuffle([...capped, ...newOnes]);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Synthèse vocale (gratuite, native au navigateur — pas de fichier audio à
// héberger). Silencieusement indisponible si aucune voix coréenne n'est
// installée : le bouton 🔊 ne s'affiche simplement pas dans ce cas.
// ---------------------------------------------------------------------------
let koreanVoice = null;
function checkKoreanVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang?.toLowerCase().startsWith('ko')) || null;
}
if ('speechSynthesis' in window) {
  koreanVoice = checkKoreanVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    koreanVoice = checkKoreanVoice();
  };
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'ko-KR';
  if (koreanVoice) utter.voice = koreanVoice;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// ---------------------------------------------------------------------------
// Session de pratique
// ---------------------------------------------------------------------------
function startPractice(container, initialQueue, onExit) {
  if (initialQueue.length === 0) {
    onExit();
    return;
  }

  const queue = [...initialQueue];
  const total = queue.length;
  const session = { correctFirstTry: 0, wrongAnswers: 0, xpGained: 0, seenItemIds: new Set() };

  renderNextCard();

  function renderNextCard() {
    if (queue.length === 0) {
      finishSession();
      return;
    }
    const item = queue.shift();
    const progressed = Math.min(total - queue.length, total);
    // isNew() reste vrai tant qu'aucune progression n'a été enregistrée
    // (ça n'arrive qu'au premier passage en quiz) : _forceQuiz évite de
    // rejouer indéfiniment la carte de découverte pour le même mot.
    const wasNew = isNew(item) && !item._forceQuiz;
    session.seenItemIds.add(item.id);

    if (wasNew) {
      renderDiscoverCard(container, item, progressed, total, () => {
        // Après la découverte, on remet immédiatement l'item en tête de
        // file pour le quizzer une première fois dans la foulée.
        queue.unshift({ ...item, _forceQuiz: true });
        renderNextCard();
      });
      return;
    }

    const exerciseType = pickExerciseType();
    renderQuizCard(container, item, exerciseType, progressed, total, (correct) => {
      handleAnswer(item, correct, wasNew);
      if (!correct) {
        // Remise en jeu un peu plus tard dans la session, comme Duolingo.
        const insertAt = Math.min(queue.length, 3 + Math.floor(Math.random() * 3));
        queue.splice(insertAt, 0, item);
      }
      renderNextCard();
    });
  }

  function handleAnswer(item, correct, wasNew) {
    if (correct) {
      session.xpGained += wasNew ? 15 : 10;
      if (!session.wrongAnswersFor?.has(item.id)) session.correctFirstTry += 1;
    } else {
      session.wrongAnswers += 1;
      (session.wrongAnswersFor ||= new Set()).add(item.id);
    }
    updateItemProgress(item, correct);
  }

  async function finishSession() {
    await flushStats(session.xpGained);
    renderSummary(container, session, total, () => onExit());
  }
}

function pickExerciseType() {
  const options = ['qcm-kr-fr', 'qcm-fr-kr', 'type-romanization'];
  if (koreanVoice) options.push('listen');
  return options[Math.floor(Math.random() * options.length)];
}

function renderDiscoverCard(container, item, progressed, total, onContinue) {
  container.innerHTML = `
    <div class="kr-practice">
      ${progressBarHtml(progressed, total)}
      <div class="kr-card kr-card-discover">
        <p class="kr-card-label">Nouveau mot</p>
        <div class="kr-korean-row">
          <p class="kr-korean-big">${escapeHtml(item.korean)}</p>
          ${koreanVoice ? `<button class="kr-listen-btn" id="kr-listen">🔊</button>` : ''}
        </div>
        <p class="kr-romanization">${escapeHtml(item.romanization || '')}</p>
        <p class="kr-french-big">${escapeHtml(item.french)}</p>
        ${item.note ? `<p class="kr-note">${escapeHtml(item.note)}</p>` : ''}
        <button class="btn kr-continue-btn" id="kr-continue">Continuer</button>
      </div>
    </div>
  `;
  document.getElementById('kr-listen')?.addEventListener('click', () => speak(item.korean));
  document.getElementById('kr-continue').addEventListener('click', onContinue);
}

function renderQuizCard(container, item, exerciseType, progressed, total, onAnswered) {
  const unitItems = state.items.filter((it) => it.unit_id === item.unit_id);

  if (exerciseType === 'type-romanization') {
    renderTypingCard(container, item, progressed, total, onAnswered);
    return;
  }

  const isListen = exerciseType === 'listen';
  const showKoreanAsPrompt = exerciseType === 'qcm-kr-fr';

  const correctOption = item;
  const distractors = pickDistractors(item, unitItems, state.items, 3);
  const optionsField = isListen || exerciseType === 'qcm-kr-fr' ? 'french' : 'korean';
  const options = shuffle([correctOption, ...distractors]);

  const promptHtml = isListen
    ? `<p class="kr-card-label">Écoute et choisis la bonne traduction</p><button class="kr-listen-btn kr-listen-btn-big" id="kr-listen">🔊 Écouter</button>`
    : showKoreanAsPrompt
      ? `<p class="kr-card-label">Que veut dire ce mot ?</p>
         <div class="kr-korean-row"><p class="kr-korean-big">${escapeHtml(item.korean)}</p>${koreanVoice ? `<button class="kr-listen-btn" id="kr-listen">🔊</button>` : ''}</div>
         <p class="kr-romanization">${escapeHtml(item.romanization || '')}</p>`
      : `<p class="kr-card-label">Comment dit-on ceci en coréen ?</p><p class="kr-french-big">${escapeHtml(item.french)}</p>`;

  container.innerHTML = `
    <div class="kr-practice">
      ${progressBarHtml(progressed, total)}
      <div class="kr-card">
        ${promptHtml}
        <div class="kr-options-grid" id="kr-options">
          ${options
            .map(
              (opt, i) => `
            <button class="kr-option-btn" data-option-id="${opt.id}" data-index="${i}">
              ${escapeHtml(optionsField === 'korean' ? opt.korean : opt.french)}
            </button>
          `
            )
            .join('')}
        </div>
        <p class="kr-feedback" id="kr-feedback" style="display:none"></p>
        <button class="btn kr-continue-btn" id="kr-continue" style="display:none">Continuer</button>
      </div>
    </div>
  `;

  document.getElementById('kr-listen')?.addEventListener('click', () => speak(item.korean));

  let answered = false;
  container.querySelectorAll('[data-option-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const correct = btn.dataset.optionId === item.id;
      revealAnswer(container, item, correct, optionsField);
      document.getElementById('kr-continue').addEventListener('click', () => onAnswered(correct), { once: true });
    });
  });
}

function renderTypingCard(container, item, progressed, total, onAnswered) {
  container.innerHTML = `
    <div class="kr-practice">
      ${progressBarHtml(progressed, total)}
      <div class="kr-card">
        <p class="kr-card-label">Écris la romanisation</p>
        <p class="kr-french-big">${escapeHtml(item.french)}</p>
        <input type="text" class="kr-type-input" id="kr-type-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ex : annyeonghaseyo" />
        <p class="kr-feedback" id="kr-feedback" style="display:none"></p>
        <button class="btn" id="kr-validate">Valider</button>
        <button class="btn kr-continue-btn" id="kr-continue" style="display:none">Continuer</button>
      </div>
    </div>
  `;

  const input = document.getElementById('kr-type-input');
  input.focus();
  let answered = false;

  function submit() {
    if (answered) return;
    answered = true;
    const correct = normalize(input.value) === normalize(item.romanization || '');
    input.disabled = true;
    document.getElementById('kr-validate').style.display = 'none';
    const feedback = document.getElementById('kr-feedback');
    feedback.style.display = 'block';
    feedback.className = `kr-feedback ${correct ? 'correct' : 'wrong'}`;
    feedback.textContent = correct ? '✔ Exact !' : `✘ Réponse : ${item.romanization} (${item.korean})`;
    document.getElementById('kr-continue').style.display = 'inline-block';
    document.getElementById('kr-continue').addEventListener('click', () => onAnswered(correct), { once: true });
  }

  document.getElementById('kr-validate').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?'']/g, '');
}

function revealAnswer(container, item, correct, optionsField) {
  container.querySelectorAll('[data-option-id]').forEach((btn) => {
    btn.classList.add(btn.dataset.optionId === item.id ? 'correct' : 'disabled');
  });
  const feedback = document.getElementById('kr-feedback');
  feedback.style.display = 'block';
  feedback.className = `kr-feedback ${correct ? 'correct' : 'wrong'}`;
  feedback.textContent = correct ? '✔ Exact !' : `✘ La bonne réponse était : ${optionsField === 'korean' ? item.korean : item.french}`;
  document.getElementById('kr-continue').style.display = 'inline-block';
}

function pickDistractors(item, unitItems, allItems, n) {
  const sameUnitPool = unitItems.filter((it) => it.id !== item.id);
  const pool = sameUnitPool.length >= n ? sameUnitPool : [...sameUnitPool, ...allItems.filter((it) => it.id !== item.id && !sameUnitPool.includes(it))];
  return shuffle(pool).slice(0, n);
}

function progressBarHtml(progressed, total) {
  const pct = Math.max(0, Math.min(100, Math.round(((progressed - 1) / total) * 100)));
  return `
    <div class="kr-session-top">
      <div class="kr-session-bar-track"><div class="kr-session-bar-fill" style="width:${pct}%"></div></div>
      <span class="kr-session-count">${progressed} / ${total}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Progression (Leitner) & stats
// ---------------------------------------------------------------------------
async function updateItemProgress(item, correct) {
  const existing = state.progressByItem[item.id];
  const currentBox = existing?.box || 0;
  const nextBox = correct ? Math.min(currentBox + 1, 6) : 1;
  const intervalDays = BOX_INTERVAL_DAYS[nextBox] ?? 0;
  const nextReviewAt = new Date(Date.now() + intervalDays * 86400000).toISOString();

  const row = {
    item_id: item.id,
    box: nextBox,
    correct_count: (existing?.correct_count || 0) + (correct ? 1 : 0),
    wrong_count: (existing?.wrong_count || 0) + (correct ? 0 : 1),
    next_review_at: nextReviewAt,
    last_seen_at: new Date().toISOString()
  };

  state.progressByItem[item.id] = row; // optimiste, avant confirmation serveur
  await supabase.from('coreen_progress').upsert(row, { onConflict: 'item_id' });
}

async function flushStats(xpGained) {
  const today = new Date().toISOString().slice(0, 10);
  const last = state.stats.last_practice_date;
  let streak = state.stats.streak_days || 0;

  if (last !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = last === yesterday ? streak + 1 : 1;
  }

  const updated = {
    xp: (state.stats.xp || 0) + xpGained,
    streak_days: streak,
    last_practice_date: today,
    updated_at: new Date().toISOString()
  };

  state.stats = { ...state.stats, ...updated };
  await supabase.from('coreen_stats').update(updated).eq('id', true);
}

function renderSummary(container, session, total, onDone) {
  container.innerHTML = `
    <div class="kr-summary">
      <p class="kr-summary-emoji">🎉</p>
      <p class="kr-summary-title">Session terminée !</p>
      <div class="kr-summary-stats">
        <div class="kr-stat"><span class="kr-stat-value">+${session.xpGained}</span><span class="kr-stat-label">XP</span></div>
        <div class="kr-stat"><span class="kr-stat-value">${session.correctFirstTry}/${session.seenItemIds.size}</span><span class="kr-stat-label">du premier coup</span></div>
        <div class="kr-stat"><span class="kr-stat-value">🔥 ${state.stats.streak_days}</span><span class="kr-stat-label">${state.stats.streak_days > 1 ? 'jours de suite' : 'jour'}</span></div>
      </div>
      <button class="btn" id="kr-summary-done">Retour</button>
    </div>
  `;
  document.getElementById('kr-summary-done').addEventListener('click', onDone);
}
