import { supabase } from './supabase-client.js';
import { escapeHtml } from './utils.js';
import { icon } from './icons.js';
import { getPersonId, getPersonName } from './auth.js';

// Quiz coréen ouvert aux cercles — lecture seule sur le vocabulaire que
// Léona apprend (coreen_units/coreen_items, voir supabase/migrations/
// 012_quiz_coreen_cercles.sql). Volontairement très léger : pas de "cours"
// façon Duolingo comme dans l'espace perso de Léona (assets/js/coreen.js),
// juste quelques questions rapides à chaque visite. Pas de progression ni
// de classement entre cercles — juste le résultat de la manche, journalisé
// dans `quiz_attempts` pour que tout le monde voie qui a joué et son score
// (voir supabase/migrations/014_personnes.sql).
const QUESTIONS_PER_ROUND = 2;

let allItems = [];

export async function renderQuizTab(container) {
  container.innerHTML = `<p class="hint-text">Chargement…</p>`;
  const { data: items } = await supabase.from('coreen_items').select('*');
  allItems = items || [];
  startRound(container);
}

function startRound(container) {
  if (allItems.length === 0) {
    container.innerHTML = `<p class="hint-text">Pas encore de vocabulaire à proposer.</p>`;
    return;
  }
  const queue = shuffle(allItems).slice(0, QUESTIONS_PER_ROUND);
  const total = queue.length;
  let correctCount = 0;

  renderNextCard();

  function renderNextCard() {
    if (queue.length === 0) {
      renderSummary(container, correctCount, total, () => startRound(container));
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

function pickDistractors(item, allItems, n) {
  const pool = allItems.filter((it) => it.id !== item.id);
  return shuffle(pool).slice(0, n);
}

function renderQuizCard(container, item, showKoreanAsPrompt, progressed, total, onAnswered) {
  const distractors = pickDistractors(item, allItems, 3);
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

async function renderSummary(container, correctCount, total, onReplay) {
  await supabase.from('quiz_attempts').insert({
    person_id: getPersonId(),
    person_name: getPersonName() || 'Quelqu\'un',
    correct_count: correctCount,
    total
  });

  const { data: attempts } = await supabase
    .from('quiz_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  container.innerHTML = `
    <div class="kr-summary">
      <p class="kr-summary-emoji">${icon('star', 44)}</p>
      <p class="kr-summary-title">${correctCount}/${total} bonnes réponses !</p>
      <button class="btn" id="quiz-summary-done">Rejouer (${QUESTIONS_PER_ROUND} nouvelles questions)</button>
      ${recentAttemptsHtml(attempts || [])}
    </div>
  `;
  document.getElementById('quiz-summary-done').addEventListener('click', onReplay);
}

function recentAttemptsHtml(attempts) {
  if (attempts.length === 0) return '';
  return `
    <div class="kr-quiz-recent">
      <p class="kr-card-label">Derniers résultats</p>
      ${attempts
        .map((a) => `<p class="kr-quiz-recent-row">${escapeHtml(a.person_name)} — ${a.correct_count}/${a.total}</p>`)
        .join('')}
    </div>
  `;
}
