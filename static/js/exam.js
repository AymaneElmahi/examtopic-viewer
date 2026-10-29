import { state } from './state.js';
import { esc, setView, qImagesHtml, commentHtml, topComment, dotsHtml, flagIcon, optInner } from './ui.js';
import { topicHtml, caseBoxHtml } from './groups.js';
import { saveScore } from './history.js';
import { saveResult, qidOf } from './results.js';

const EXAM_N = 55;
const EXAM_SECS = 2 * 60 * 60; // 2 hours
const PASS_PCT = 70;
const SESSION_KEY = 'et-exam-session';

const ARROW_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ARROW_R = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>`;
const CHEVRON = `<svg class="nv-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

// Exam session state (separate from global state)
export const examState = {
  status: 'idle',  // 'idle' | 'active' | 'paused' | 'submitted'
  questions: [],   // shuffled subset
  answers: {},     // { qi: letter }
  flags: {},       // { qi: true }
  startTime: null,
  timerInterval: null,
  remaining: EXAM_SECS,
  currentIdx: 0,
  elapsed: 0,
  rfilter: 'missed',
};

const setWrap = cls => { document.getElementById('view').className = cls; };

// ── Session persistence ────────────────────────────────
function saveSession() {
  if (examState.status !== 'active' && examState.status !== 'paused') return;
  const questionIndices = examState.questions.map(q =>
    state.questions.findIndex(sq => qidOf(sq) === qidOf(q))
  );
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    filename: state.currentFile,
    questionIndices,
    answers: examState.answers,
    flags: examState.flags,
    remaining: examState.remaining,
    savedAt: Date.now(),
    currentIdx: examState.currentIdx,
    status: examState.status,
  }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.filename !== state.currentFile) return null;
    const questions = s.questionIndices.map(i => state.questions[i]).filter(Boolean);
    if (questions.length !== s.questionIndices.length) return null;
    let remaining = s.remaining;
    if (s.status === 'active') {
      const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
      remaining = Math.max(0, remaining - elapsed);
    }
    return { ...s, flags: s.flags || {}, questions, remaining };
  } catch { return null; }
}

let _pendingSession = null;

// Save on page unload
window.addEventListener('beforeunload', saveSession);

// ── Helpers ────────────────────────────────────────────
function sample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopTimer() {
  if (examState.timerInterval) {
    clearInterval(examState.timerInterval);
    examState.timerInterval = null;
  }
}

function newExam() {
  examState.status = 'idle';
  examState.questions = sample(state.questions, EXAM_N);
  examState.answers = {};
  examState.flags = {};
  examState.currentIdx = 0;
  examState.remaining = EXAM_SECS;
  examState.startTime = null;
  examState.elapsed = 0;
  examState.rfilter = 'missed';
}

function timerClass(secs) {
  if (secs < 300) return 'timer-crit';
  if (secs < 900) return 'timer-warn';
  return '';
}

const answeredCount = () => Object.keys(examState.answers).length;

// ── Ready / resume / paused screens ────────────────────
function renderReady() {
  setWrap('card-wrap');
  const total = examState.questions.length;
  setView(`
    <div class="exam-ready">
      <h2 class="exam-ready-title">Mock exam</h2>
      <p class="exam-ready-sub">Random questions from this exam, against the clock. You see the answers once you submit.</p>
      <div class="exam-ready-stats">
        <div class="exam-stat"><div class="exam-stat-val">${total}</div><div class="exam-stat-lbl">questions</div></div>
        <div class="exam-stat"><div class="exam-stat-val">2h</div><div class="exam-stat-lbl">time limit</div></div>
        <div class="exam-stat"><div class="exam-stat-val">${PASS_PCT}%</div><div class="exam-stat-lbl">to pass</div></div>
      </div>
      <button class="btn btn-submit exam-ready-btn" data-action="exam-start">Start exam</button>
    </div>
  `);
}

function renderResumePrompt(session) {
  setWrap('card-wrap');
  setView(`
    <div class="exam-ready">
      <h2 class="exam-ready-title">Resume your exam?</h2>
      <p class="exam-ready-sub">You have an exam in progress for this file.</p>
      <div class="exam-ready-stats">
        <div class="exam-stat"><div class="exam-stat-val">${fmtTime(session.remaining)}</div><div class="exam-stat-lbl">remaining</div></div>
        <div class="exam-stat"><div class="exam-stat-val">${Object.keys(session.answers).length} of ${session.questions.length}</div><div class="exam-stat-lbl">answered</div></div>
      </div>
      <div class="exam-resume-actions">
        <button class="btn btn-submit exam-ready-btn" data-action="exam-resume-saved">Resume</button>
        <button class="btn btn-ghost" data-action="exam-new-exam">Start a new exam</button>
      </div>
    </div>
  `);
}

function renderPaused() {
  setWrap('card-wrap');
  setView(`
    <div class="exam-paused">
      <h2 class="exam-paused-title">Paused</h2>
      <div class="exam-paused-time">${fmtTime(examState.remaining)}</div>
      <div class="exam-paused-meta">${answeredCount()} of ${examState.questions.length} answered. The questions are hidden while paused.</div>
      <div class="exam-paused-actions">
        <button class="btn btn-submit" data-action="exam-resume">Resume</button>
        <button class="btn btn-ghost" data-action="exam-abandon">Abandon exam</button>
      </div>
    </div>
  `);
}

// ── Active exam ────────────────────────────────────────
function paletteInner() {
  const total = examState.questions.length;
  const qi = examState.currentIdx;
  const cells = examState.questions.map((_, i) => {
    let cls = 'nv-cell';
    if (examState.answers[i]) cls += ' is-answered';
    if (examState.flags[i]) cls += ' is-flagged';
    if (i === qi) cls += ' is-current';
    return `<button class="${cls}" data-action="exam-jump" data-qi="${i}" aria-label="Question ${i + 1}${examState.flags[i] ? ', flagged' : ''}"${i === qi ? ' aria-current="true"' : ''}>${i + 1}</button>`;
  }).join('');
  return `
    <button class="nav-toggle" data-action="toggle-nav" aria-label="Show question list">
      <span>Question ${qi + 1} of ${total}</span>${CHEVRON}
    </button>
    <div class="nav-body">
      <div class="exam-clock-wrap">
        <div class="exam-clock exam-timer-live ${timerClass(examState.remaining)}">${fmtTime(examState.remaining)}</div>
        <div class="nv-stats"><strong>${answeredCount()}</strong> of ${total} answered</div>
      </div>
      <div class="nv-grid" id="nvGrid">${cells}</div>
      <div class="nv-legend"><span class="l-ans">Answered</span><span class="l-flag">Flagged</span><span>Not yet</span></div>
      <div class="exam-palette-actions">
        <button class="btn btn-submit" data-action="exam-submit">Submit exam</button>
        <button class="btn btn-ghost" data-action="exam-pause">Pause</button>
      </div>
    </div>`;
}

function updatePalette() {
  const pane = document.getElementById('navPane');
  if (!pane) return;
  const top = document.getElementById('nvGrid')?.scrollTop ?? 0;
  pane.innerHTML = paletteInner();
  const grid = document.getElementById('nvGrid');
  if (grid) grid.scrollTop = top;
}

function renderCurrent() {
  setWrap('study-wrap');
  const qi = examState.currentIdx;
  const q = examState.questions[qi];
  const picked = examState.answers[qi];
  const total = examState.questions.length;
  const flagged = !!examState.flags[qi];
  const last = qi === total - 1;

  const optRows = Object.entries(q.options).map(([l, t]) => {
    const sel = picked === l ? ' exam-opt-selected' : '';
    return `<div class="option exam-opt${sel}" id="eo-${l}" data-l="${l}" data-action="exam-pick" role="button" tabindex="0">
      <span class="obubble">${l}</span>
      <span class="otext"><span class="otext-in">${optInner(q, l, t)}</span></span>
    </div>`;
  }).join('');

  setView(`
    <div class="study study-exam">
      <aside class="nav-pane" id="navPane">${paletteInner()}</aside>

      <section class="sheet" aria-label="Exam question">
        <div class="sheet-head">
          <span class="qnum">Question ${qi + 1} of ${total}</span>
          ${topicHtml(q)}
          <span class="sheet-tools">
            <span class="exam-timer exam-timer-live exam-timer-inline ${timerClass(examState.remaining)}">${fmtTime(examState.remaining)}</span>
            <button class="flag-btn${flagged ? ' on' : ''}" id="flagBtn" data-action="exam-flag" aria-pressed="${flagged}" title="Flag for review (Shift+F)">${flagIcon}<span>Flag</span></button>
          </span>
        </div>

        ${caseBoxHtml(q)}
        <p class="qtext">${esc(q.question)}</p>
        ${qImagesHtml(q)}
        <div class="options" id="opts" role="group" aria-label="Answers">${optRows}</div>

        <div class="nav-row">
          <button class="btn" data-action="exam-prev" ${qi === 0 ? 'disabled' : ''}>${ARROW_L} Previous</button>
          <span class="kbd-hint"><kbd>←</kbd> <kbd>→</kbd> move · <kbd>${Object.keys(q.options)[0]}</kbd>–<kbd>${Object.keys(q.options).slice(-1)[0]}</kbd> answer · <kbd>⇧F</kbd> flag</span>
          ${last
            ? `<button class="btn btn-submit" data-action="exam-submit">Submit exam</button>`
            : `<button class="btn" data-action="exam-next">Next ${ARROW_R}</button>`}
        </div>
      </section>
      <div></div>
    </div>
  `);
}

// ── Results ────────────────────────────────────────────
function evaluate() {
  const qs = examState.questions;
  return qs.map((q, qi) => {
    const picked = examState.answers[qi];
    const consensus = q.consensus_answer;
    let status;
    if (!picked) status = 'skipped';
    else if (!consensus) status = 'no-consensus';
    else status = picked === consensus ? 'correct' : 'wrong';
    return { q, qi, picked, consensus, status };
  });
}

function renderResults() {
  setWrap('card-wrap');
  const rows = evaluate();
  const correct = rows.filter(r => r.status === 'correct').length;
  const wrong = rows.filter(r => r.status === 'wrong').length;
  const skipped = rows.filter(r => r.status === 'skipped').length;
  const total = rows.length;
  const pct = Math.round(correct / total * 100);
  const pass = pct >= PASS_PCT;

  const needsWork = rows.filter(r => r.status === 'wrong' || r.status === 'skipped');
  const filter = examState.rfilter === 'missed' && needsWork.length ? 'missed' : 'all';
  const shown = filter === 'missed' ? needsWork : rows;

  const dotStatus = { correct: 'ok', wrong: 'miss', 'no-consensus': 'seen', skipped: 'none' };
  const labels = { correct: 'Matched', wrong: 'Missed', skipped: 'Skipped', 'no-consensus': 'No clear answer' };

  const items = shown.map(({ q, picked, consensus, status }) => {
    const optRows = Object.entries(q.options).map(([l, t]) => {
      let cls = 'option locked';
      if (l === picked) cls += ' picked';
      if (l === consensus) cls += ' correct';
      else if (l === picked) cls += ' wrong';
      return `<div class="${cls}"><span class="obubble">${l}</span><span class="otext"><span class="otext-in">${optInner(q, l, t)}</span></span></div>`;
    }).join('');
    const { topC } = topComment(q);
    return `
      <div class="exam-result-item result-${status}">
        <div class="exam-ri-head">
          <span class="q-badge">Question ${q.question_number}</span>
          <span class="exam-ri-status ${status}">${labels[status]}</span>
          ${picked ? `<span class="exam-ri-pick">You chose ${picked}</span>` : ''}
          ${consensus ? `<span class="exam-ri-cons">Community chose ${consensus}</span>` : ''}
        </div>
        <p class="exam-ri-qtext">${esc(q.question)}</p>
        ${qImagesHtml(q)}
        <div class="options">${optRows}</div>
        ${topC ? `<div class="exam-ri-disc">${commentHtml(topC, true)}</div>` : ''}
      </div>`;
  }).join('');

  setView(`
    <div class="exam-results">
      <div class="exam-score-card ${pass ? 'pass' : 'fail'}">
        <div class="exam-score-pct">${pct}%</div>
        <div class="exam-score-label">${pass ? 'Passed' : 'Failed'} <span>(${PASS_PCT}% needed)</span></div>
        <div class="exam-score-breakdown">
          <span class="score-correct">${correct} matched</span>
          <span class="score-wrong">${wrong} missed</span>
          <span class="score-skipped">${skipped} skipped</span>
        </div>
        ${dotsHtml(rows.map(r => dotStatus[r.status]), 'dots-lg')}
        <div class="exam-score-meta">${fmtTime(examState.elapsed)} elapsed</div>
        <button class="btn btn-submit exam-retake-btn" data-action="exam-retake">Take another exam</button>
      </div>

      <div class="exam-results-bar">
        <h3 class="exam-results-title">${filter === 'missed' ? 'Questions to revisit' : 'All questions'}</h3>
        ${needsWork.length ? `
          <div class="seg" role="group" aria-label="Show">
            <button class="seg-btn${filter === 'missed' ? ' on' : ''}" data-action="exam-rfilter" data-f="missed">Missed and skipped<span>${needsWork.length}</span></button>
            <button class="seg-btn${filter === 'all' ? ' on' : ''}" data-action="exam-rfilter" data-f="all">All<span>${total}</span></button>
          </div>` : '<span class="nv-stats">Nothing missed. Clean sheet.</span>'}
      </div>
      <div class="exam-results-list">${items}</div>
    </div>
  `);
}

// ── Timer tick ─────────────────────────────────────────
function tick() {
  examState.remaining--;
  document.querySelectorAll('.exam-timer-live').forEach(el => {
    el.textContent = fmtTime(examState.remaining);
    el.classList.toggle('timer-warn', examState.remaining < 900 && examState.remaining >= 300);
    el.classList.toggle('timer-crit', examState.remaining < 300);
  });
  if (examState.remaining % 30 === 0) saveSession();
  if (examState.remaining <= 0) {
    stopTimer();
    submitExam();
  }
}

function startTimer() {
  stopTimer();
  examState.timerInterval = setInterval(tick, 1000);
}

// ── Public API ─────────────────────────────────────────
export function startExam() {
  stopTimer();
  if (!state.questions.length) return;

  const session = loadSession();
  if (session) {
    _pendingSession = session;
    renderResumePrompt(session);
    return;
  }

  _pendingSession = null;
  newExam();
  renderReady();
}

// Re-display the exam wherever it currently is (e.g. coming back from History).
export function showExam() {
  if (examState.status === 'active') renderCurrent();
  else if (examState.status === 'paused') renderPaused();
  else if (examState.status === 'submitted') renderResults();
  else startExam();
}

export function stopExam() {
  stopTimer();
  if (examState.status === 'active' || examState.status === 'paused') {
    saveSession();
  }
  examState.status = 'idle';
}

export function submitExam() {
  stopTimer();
  clearSession();
  examState.status = 'submitted';
  const qs = examState.questions;
  const answers = examState.answers;
  const answered = qs.filter((_, qi) => !!answers[qi]).length;
  const score = qs.filter((q, qi) => answers[qi] && answers[qi] === q.consensus_answer).length;
  const pct = Math.round(score / qs.length * 100);
  const pass = pct >= PASS_PCT;
  examState.elapsed = examState.startTime ? Math.round((Date.now() - examState.startTime) / 1000) : 0;
  examState.rfilter = 'missed';
  saveScore({ filename: state.currentFile, score, total: qs.length, answered, pct, pass, elapsed: examState.elapsed });
  // Mock exam answers also feed the Missed / Unseen lists.
  qs.forEach((q, qi) => {
    if (answers[qi]) saveResult(state.currentFile, qidOf(q), answers[qi], q.consensus_answer ? answers[qi] === q.consensus_answer : null);
  });
  renderResults();
}

function goTo(qi) {
  if (qi < 0 || qi >= examState.questions.length) return;
  examState.currentIdx = qi;
  renderCurrent();
  window.scrollTo({ top: 0 });
}

function pick(l) {
  if (examState.status !== 'active') return;
  const qi = examState.currentIdx;
  if (!examState.questions[qi].options[l]) return;
  // Picking the same answer again clears it.
  if (examState.answers[qi] === l) delete examState.answers[qi];
  else examState.answers[qi] = l;
  const now = examState.answers[qi];
  document.querySelectorAll('.exam-opt').forEach(el => {
    el.classList.toggle('exam-opt-selected', el.dataset.l === now);
  });
  updatePalette();
}

function flag() {
  if (examState.status !== 'active') return;
  const qi = examState.currentIdx;
  examState.flags[qi] = !examState.flags[qi];
  if (!examState.flags[qi]) delete examState.flags[qi];
  const btn = document.getElementById('flagBtn');
  if (btn) { btn.classList.toggle('on', !!examState.flags[qi]); btn.setAttribute('aria-pressed', String(!!examState.flags[qi])); }
  updatePalette();
}

export function handleExamKey(e) {
  if (examState.status !== 'active') return false;
  if (e.key === 'ArrowLeft') { goTo(examState.currentIdx - 1); return true; }
  if (e.key === 'ArrowRight') { goTo(examState.currentIdx + 1); return true; }
  if (e.key === 'F' && e.shiftKey) { flag(); return true; }
  if (/^[a-zA-Z]$/.test(e.key) && !e.shiftKey) { pick(e.key.toUpperCase()); return true; }
  return false;
}

export function handleExamAction(action, dataset) {
  switch (action) {
    case 'exam-start':
      examState.status = 'active';
      examState.startTime = Date.now();
      startTimer();
      renderCurrent();
      break;

    case 'exam-resume-saved': {
      const session = _pendingSession;
      _pendingSession = null;
      if (!session) { startExam(); return; }
      examState.status = 'active';
      examState.questions = session.questions;
      examState.answers = { ...session.answers };
      examState.flags = { ...session.flags };
      examState.currentIdx = Math.min(session.currentIdx, session.questions.length - 1);
      examState.remaining = session.remaining;
      examState.startTime = Date.now() - (EXAM_SECS - session.remaining) * 1000;
      if (examState.remaining <= 0) { submitExam(); return; }
      startTimer();
      renderCurrent();
      break;
    }

    case 'exam-new-exam':
      _pendingSession = null;
      clearSession();
      newExam();
      renderReady();
      break;

    case 'exam-pause':
      if (examState.status !== 'active') return;
      stopTimer();
      examState.status = 'paused';
      saveSession();
      renderPaused();
      break;

    case 'exam-resume':
      if (examState.status !== 'paused') return;
      examState.status = 'active';
      startTimer();
      renderCurrent();
      break;

    case 'exam-abandon':
      stopTimer();
      clearSession();
      examState.status = 'idle';
      startExam();
      break;

    case 'exam-pick':
      pick(dataset.l);
      break;
    case 'exam-flag':
      flag();
      break;
    case 'exam-prev':
      goTo(examState.currentIdx - 1);
      break;
    case 'exam-next':
      goTo(examState.currentIdx + 1);
      break;
    case 'exam-jump':
      goTo(parseInt(dataset.qi, 10));
      break;
    case 'exam-submit':
      if (examState.status === 'active') submitExam();
      break;
    case 'exam-rfilter':
      examState.rfilter = dataset.f;
      renderResults();
      break;
    case 'exam-retake':
      startExam();
      break;
  }
}
