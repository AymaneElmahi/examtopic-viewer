import { state } from './state.js';
import { esc, setView, qImagesHtml, optsHtml, revealOptions, discHtml, voteSplit, flagIcon } from './ui.js';
import { noteKey, loadNote, hasNote, noteHtml } from './notes.js';
import { loadResults, saveResult, loadFlags, toggleFlag, qidOf } from './results.js';
import { stepIn } from './queue.js';
import { topicHtml, caseBoxHtml } from './groups.js';
import { navInner, refreshNav, centerGrid, toggleNav } from './navigator.js';

const EXTERNAL = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const ARROW_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ARROW_R = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;

// ── Margin (right) ─────────────────────────────────────
function marginIdleHtml(prev) {
  return `
    <div class="margin-idle">
      <p>Pick an answer to see what the community chose, and read the discussion.</p>
      ${prev ? `<p>Last time you chose ${prev.p}${prev.ok === true ? ', which matched.' : prev.ok === false ? ', which did not match.' : '.'}</p>` : ''}
      <button class="link-btn" data-action="reveal">Just show me the answer</button>
    </div>`;
}

function marginAnswerHtml(q, picked) {
  const split = voteSplit(q);
  const top = split[0]?.n || 1;
  const hasCons = !!q.consensus_answer;
  const verdict = hasCons
    ? `<div class="verdict-line">Community chose <strong>${q.consensus_answer}</strong></div>
       <div class="verdict-sub">${q.consensus_votes} of ${q.consensus_total} vote${q.consensus_total !== 1 ? 's' : ''}</div>`
    : `<div class="verdict-none">No clear community answer.</div>
       <div class="verdict-sub">Nobody wrote “Selected Answer” in the comments. Read the discussion below.</div>`;
  const you = hasCons && picked
    ? `<div class="you-line ${picked === q.consensus_answer ? 'is-ok' : 'is-miss'}">
         You chose ${picked}${picked === q.consensus_answer ? ', which matches the community.' : ', which differs from the community.'}
       </div>`
    : '';
  const bars = split.length > 1 ? `
    <div class="split" aria-label="Votes per answer">
      ${split.map((s, i) => `
        <div class="split-row${i === 0 ? ' is-top' : ''}">
          <b>${s.letter}</b>
          <span class="split-track"><i class="split-fill" style="width:${s.n / top * 100}%"></i></span>
          <span>${s.n}</span>
        </div>`).join('')}
    </div>` : '';
  return `${verdict}${you}${bars}<div class="margin-disc">${discHtml(q, 'c-')}</div>`;
}

// ── Render ─────────────────────────────────────────────
function emptyQueueHtml() {
  const what = { unseen: 'You have seen every question in this exam.', missed: 'No missed questions. Nice work.', flagged: 'You have not flagged anything yet. Press Shift+F on a question to flag it.' }[state.filter];
  return `
    <section class="sheet sheet-empty">
      <p class="qtext">${what}</p>
      <button class="btn btn-submit" data-action="filter" data-f="all">Show all questions</button>
    </section>`;
}

export function renderCards() {
  state.cardPhase = 'unanswered';
  const results = loadResults(state.currentFile);

  if (state.queue && state.queue.length === 0) {
    setView(`<div class="study"><aside class="nav-pane" id="navPane">${navInner(results)}</aside>${emptyQueueHtml()}<div></div></div>`);
    return;
  }

  const q = state.questions[state.idx];
  const qid = qidOf(q);
  const nk = noteKey(state.currentFile, qid);
  const cardNote = noteHtml(qid, loadNote(nk), hasNote(nk));
  const flagged = loadFlags(state.currentFile).has(qid);
  const letters = Object.keys(q.options);

  setView(`
    <div class="study">
      <aside class="nav-pane" id="navPane">${navInner(results)}</aside>

      <section class="sheet" aria-label="Question">
        <div class="sheet-head">
          <span class="qnum">Question ${q.question_number}</span>
          ${topicHtml(q)}
          ${q.timestamp ? `<span class="qmeta-ts">${esc(q.timestamp)}</span>` : ''}
          <span class="sheet-tools">
            ${q.examtopics_url ? `<a class="qmeta-link" href="${esc(q.examtopics_url)}" target="_blank" rel="noopener">ExamTopics ${EXTERNAL}</a>` : ''}
            <button class="flag-btn${flagged ? ' on' : ''}" id="flagBtn" data-action="toggle-flag" aria-pressed="${flagged}" title="Flag this question (Shift+F)">${flagIcon}<span>Flag</span></button>
          </span>
        </div>

        ${caseBoxHtml(q)}
        <p class="qtext">${esc(q.question)}</p>
        ${qImagesHtml(q)}
        <div class="options" id="opts" role="group" aria-label="Answers">${optsHtml(q, 'o-')}</div>
        ${cardNote}

        <div class="nav-row">
          <button class="btn" data-action="prev" ${stepIn(-1) === null ? 'disabled' : ''}>${ARROW_L} Previous</button>
          <span class="kbd-hint"><kbd>←</kbd> <kbd>→</kbd> move · <kbd>${letters[0]}</kbd>–<kbd>${letters[letters.length - 1]}</kbd> answer · <kbd>⇧F</kbd> flag</span>
          <button class="btn" data-action="next" id="btnNext" ${stepIn(1) === null ? 'disabled' : ''}>Next ${ARROW_R}</button>
        </div>
      </section>

      <aside class="margin" id="margin" aria-live="polite">${marginIdleHtml(results[qid])}</aside>
    </div>
  `);
  centerGrid();
}

function afterReveal(q, picked) {
  document.getElementById('margin').innerHTML = marginAnswerHtml(q, picked);
  document.getElementById('btnNext')?.classList.add('btn-submit');
  refreshNav();
  // On narrow screens the margin sits below the question: bring the verdict into view.
  if (window.innerWidth < 1100) {
    const m = document.getElementById('margin');
    window.scrollTo({ top: m.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  }
}

export function pickCard(letter) {
  if (state.cardPhase !== 'unanswered') return;
  const q = state.questions[state.idx];
  if (!q || !q.options[letter]) return;
  state.cardPhase = 'answered';

  revealOptions(q, letter, 'o-');
  const ok = q.consensus_answer ? letter === q.consensus_answer : null;
  saveResult(state.currentFile, qidOf(q), letter, ok);
  afterReveal(q, letter);
}

// Show the community answer without recording a guess.
export function revealCard() {
  if (state.cardPhase !== 'unanswered') return;
  const q = state.questions[state.idx];
  if (!q) return;
  state.cardPhase = 'answered';
  revealOptions(q, null, 'o-');
  afterReveal(q, null);
}

export function toggleFlagCurrent() {
  const q = state.questions[state.idx];
  if (!q) return;
  const on = toggleFlag(state.currentFile, qidOf(q));
  const btn = document.getElementById('flagBtn');
  if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); }
  refreshNav();
}

export { toggleNav };
