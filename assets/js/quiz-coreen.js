import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';

// Quiz coréen ouvert aux cercles — lecture seule sur le vocabulaire que
// Léona apprend (coreen_units/coreen_items, voir supabase/migrations/
// 012_quiz_coreen_cercles.sql). Contrairement à assets/js/coreen.js (son
// espace perso d'apprentissage), rien n'est jamais écrit en base ici : pas
// de progression, pas de score, pas de classement entre cercles — juste
// pour le fun, une session se rejoue autant de fois qu'on veut.
const SESSION_SIZE = 10;

let allItems = [];

export async function renderQuizTab(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const [{ data: units }, { data: items }] = await Promise.all([
    supabase.from('coreen_units').select('*').order('sort_order'),
    supabase.from('coreen_items').select('*').order('sort_order')
  ]);
  allItems = items || [];
  renderOverview(container, units || []);
}

function renderOverview(container, units) {
  container.innerHTML = `
    <p style="font-family:var(--font-serif); font-size:24px; font-weight:600; margin:0 0 6px;">Quiz coréen</p>
    <p class="hint-text" style="margin-bottom:16px;">Apprends quelques mots de coréen en même temps que Léona — choisis une unité, ou lance un mélange de tout.</p>

    <button class="btn kr-daily-btn" id="quiz-mix-btn">${icon('play', 13, 'icon-inline')} Mélange de tout</button>

    <div class="kr-units-grid">
      ${units.map((u) => unitCardHtml(u)).join('')}
    </div>
  `;

  document.getElementById('quiz-mix-btn').addEventListener('click', () => {
    startQuiz(container, shuffle(allItems).slice(0, SESSION_SIZE), () => renderOverview(container, units));
  });

  container.querySelectorAll('[data-unit-card]').forEach((el) => {
    el.addEventListener('click', () => {
      const unitId = el.dataset.unitCard;
      const unitItems = shuffle(allItems.filter((it) => it.unit_id === unitId)).slice(0, SESSION_SIZE);
      startQuiz(container, unitItems, () => renderOverview(container, units));
    });
  });
}

function unitCardHtml(unit) {
  const count = allItems.filter((it) => it.unit_id === unit.id).length;
  return `
    <div class="kr-unit-card" data-unit-card="${unit.id}">
      <span class="kr-unit-icon">${icon('book', 22)}</span>
      <p class="kr-unit-title">${escapeHtml(unit.title)}</p>
      <p class="kr-unit-meta">${count} mot${count !== 1 ? 's' : ''}</p>
    </div>
  `;
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
// Synthèse vocale (identique à coreen.js) — silencieusement indisponible si
// aucune voix coréenne n'est installée sur l'appareil.
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
// Session de quiz (QCM uniquement — pas de Leitner, pas d'écriture en base)
// ---------------------------------------------------------------------------
function startQuiz(container, initialQueue, onExit) {
  if (initialQueue.length === 0) {
    onExit();
    return;
  }

  const queue = [...initialQueue];
  const total = queue.length;
  let correctCount = 0;

  renderNextCard();

  function renderNextCard() {
    if (queue.length === 0) {
      renderSummary(container, correctCount, total, onExit);
      return;
    }
    const item = queue.shift();
    const progressed = total - queue.length;
    const showKoreanAsPrompt = Math.random() < 0.5;
    renderQuizCard(container, item, showKoreanAsPrompt, progressed, total, (correct) => {
      if (correct) correctCount += 1;
      renderNextCard();
    });
  }
}

function pickDistractors(item, unitItems, allItems, n) {
  const sameUnitPool = unitItems.filter((it) => it.id !== item.id);
  const pool = sameUnitPool.length >= n ? sameUnitPool : [...sameUnitPool, ...allItems.filter((it) => it.id !== item.id && !sameUnitPool.includes(it))];
  return shuffle(pool).slice(0, n);
}

function renderQuizCard(container, item, showKoreanAsPrompt, progressed, total, onAnswered) {
  const unitItems = allItems.filter((it) => it.unit_id === item.unit_id);
  const distractors = pickDistractors(item, unitItems, allItems, 3);
  const optionsField = showKoreanAsPrompt ? 'french' : 'korean';
  const options = shuffle([item, ...distractors]);

  const promptHtml = showKoreanAsPrompt
    ? `<p class="kr-card-label">Que veut dire ce mot ?</p>
       <div class="kr-korean-row"><p class="kr-korean-big">${escapeHtml(item.korean)}</p>${koreanVoice ? `<button class="kr-listen-btn" id="quiz-listen" aria-label="Écouter">${icon('volume', 18)}</button>` : ''}</div>
       <p class="kr-romanization">${escapeHtml(item.romanization || '')}</p>`
    : `<p class="kr-card-label">Comment dit-on ceci en coréen ?</p><p class="kr-french-big">${escapeHtml(item.french)}</p>`;

  container.innerHTML = `
    <div class="kr-practice">
      ${progressBarHtml(progressed, total)}
      <div class="kr-card">
        ${promptHtml}
        <div class="kr-options-grid" id="quiz-options">
          ${options
            .map(
              (opt) => `
            <button class="kr-option-btn" data-option-id="${opt.id}">
              ${escapeHtml(optionsField === 'korean' ? opt.korean : opt.french)}
            </button>
          `
            )
            .join('')}
        </div>
        <p class="kr-feedback" id="quiz-feedback" style="display:none"></p>
        <button class="btn kr-continue-btn" id="quiz-continue" style="display:none">Continuer</button>
      </div>
    </div>
  `;

  document.getElementById('quiz-listen')?.addEventListener('click', () => speak(item.korean));

  let answered = false;
  container.querySelectorAll('[data-option-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const correct = btn.dataset.optionId === item.id;
      revealAnswer(container, item, correct, optionsField);
      document.getElementById('quiz-continue').addEventListener('click', () => onAnswered(correct), { once: true });
    });
  });
}

function revealAnswer(container, item, correct, optionsField) {
  container.querySelectorAll('[data-option-id]').forEach((btn) => {
    btn.classList.add(btn.dataset.optionId === item.id ? 'correct' : 'disabled');
  });
  const feedback = document.getElementById('quiz-feedback');
  feedback.style.display = 'block';
  feedback.className = `kr-feedback ${correct ? 'correct' : 'wrong'}`;
  feedback.innerHTML = correct
    ? `${icon('check', 13, 'icon-inline')} Exact !`
    : `${icon('x', 13, 'icon-inline')} La bonne réponse était : ${escapeHtml(optionsField === 'korean' ? item.korean : item.french)}`;
  document.getElementById('quiz-continue').style.display = 'inline-block';
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

function renderSummary(container, correctCount, total, onDone) {
  container.innerHTML = `
    <div class="kr-summary">
      <p class="kr-summary-emoji">${icon('star', 44)}</p>
      <p class="kr-summary-title">Quiz terminé !</p>
      <div class="kr-summary-stats">
        <div class="kr-stat"><span class="kr-stat-value">${correctCount}/${total}</span><span class="kr-stat-label">bonnes réponses</span></div>
      </div>
      <button class="btn" id="quiz-summary-done">Rejouer</button>
    </div>
  `;
  document.getElementById('quiz-summary-done').addEventListener('click', onDone);
}
