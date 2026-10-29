import { state } from './state.js';
import { esc, setView, optsHtml, commentHtml, topComment } from './ui.js';
import { saveScore } from './history.js';

const EXAM_N = 55;
const EXAM_SECS = 2 * 60 * 60; // 2 hours
const SESSION_KEY = 'et-exam-session';

// Exam session state (separate from global state)
export const examState = {
  status: 'idle',  // 'idle' | 'active' | 'paused' | 'submitted'
  questions: [],   // shuffled subset
  answers: {},     // { qi: letter }
  startTime: null,
  timerInterval: null,
  remaining: EXAM_SECS,
  currentIdx: 0,
};

// ── Session persistence ────────────────────────────────
function saveSession() {
  if (examState.status !== 'active' && examState.status !== 'paused') return;
  const questionIndices = examState.questions.map(q =>
    state.questions.findIndex(sq => sq.topic === q.topic && sq.question_number === q.question_number)
  );
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    filename: state.currentFile,
    questionIndices,
    answers: examState.answers,
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
    return { ...s, questions, remaining };
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

// ── Ready screen ───────────────────────────────────────
function renderReady() {
  const total = examState.questions.length;
  setView(`
    <div class="exam-ready">
      <div class="exam-ready-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <h2 class="exam-ready-title">Mock Exam</h2>
      <p class="exam-ready-sub">Randomly selected questions, timed under real conditions.<br>Answers are only revealed after you submit.</p>
      <div class="exam-ready-stats">
        <div class="exam-stat"><div class="exam-stat-val">${total}</div><div class="exam-stat-lbl">questions</div></div>
        <div class="exam-stat"><div class="exam-stat-val">2h</div><div class="exam-stat-lbl">time limit</div></div>
        <div class="exam-stat"><div class="exam-stat-val">70%</div><div class="exam-stat-lbl">to pass</div></div>
      </div>
      <button class="btn btn-submit exam-ready-btn" data-action="exam-start">Start Exam</button>
    </div>
  `);
}

// ── Resume prompt ──────────────────────────────────────
function renderResumePrompt(session) {
  const answered = Object.keys(session.answers).length;
  const total = session.questions.length;
  setView(`
    <div class="exam-ready">
      <div class="exam-ready-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <h2 class="exam-ready-title">Resume Exam?</h2>
      <p class="exam-ready-sub">You have an exam in progress for this file.</p>
      <div class="exam-ready-stats">
        <div class="exam-stat"><div class="exam-stat-val">${fmtTime(session.remaining)}</div><div class="exam-stat-lbl">remaining</div></div>
        <div class="exam-stat"><div class="exam-stat-val">${answered}/${total}</div><div class="exam-stat-lbl">answered</div></div>
      </div>
      <div class="exam-resume-actions">
        <button class="btn btn-submit exam-ready-btn" data-action="exam-resume-saved">Resume</button>
        <button class="btn btn-ghost" data-action="exam-new-exam">New exam</button>
      </div>
    </div>
  `);
}

// ── Paused screen ──────────────────────────────────────
function renderPaused() {
  const answered = Object.keys(examState.answers).length;
  const total = examState.questions.length;
  setView(`
    <div class="exam-paused">
      <div class="exam-paused-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
      </div>
      <h2 class="exam-paused-title">Paused</h2>
      <div class="exam-paused-time">${fmtTime(examState.remaining)}</div>
      <div class="exam-paused-meta">${answered} of ${total} answered</div>
      <div class="exam-paused-actions">
        <button class="btn btn-submit" data-action="exam-resume">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Resume
        </button>
        <button class="btn btn-ghost" data-action="exam-abandon">Abandon exam</button>
      </div>
    </div>
  `);
}

// ── Render ─────────────────────────────────────────────
function timerClass(secs) {
  if (secs < 300) return 'timer-crit';
  if (secs < 900) return 'timer-warn';
  return '';
}

function renderCurrent() {
  const qi = examState.currentIdx;
  const q = examState.questions[qi];
  const picked = examState.answers[qi];
  const total = examState.questions.length;
  const answered = Object.keys(examState.answers).length;
  const pct = ((qi + 1) / total * 100).toFixed(2);

  const optRows = Object.entries(q.options).map(([l, t]) => {
    const sel = picked === l ? ' exam-opt-selected' : '';
    return `<div class="option exam-opt${sel}" id="eo-${l}" data-l="${l}" data-action="exam-pick">
      <div class="oletter">${l}</div>
      <div class="otext">${esc(t)}</div>
    </div>`;
  }).join('');

  setView(`
    <div class="ptop"><div class="ptop-fill" style="width:${pct}%"></div></div>

    <div class="exam-bar">
      <span class="exam-progress">${qi + 1} / ${total} &nbsp;·&nbsp; ${answered} answered</span>
      <button class="btn exam-pause-btn" data-action="exam-pause" title="Pause exam">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        Pause
      </button>
      <span id="examTimer" class="exam-timer ${timerClass(examState.remaining)}">${fmtTime(examState.remaining)}</span>
    </div>

    <div class="qbody">
      <div class="qmeta">
        <span class="q-badge">Q${q.question_number}</span>
        <span class="qmeta-dot">·</span>
        <span class="qmeta-label">Topic ${q.topic}</span>
      </div>
      <p class="qtext">${esc(q.question)}</p>
      <div class="options" id="opts">${optRows}</div>
    </div>

    <div class="nav-row">
      <button class="btn nav-btn" data-action="exam-prev" ${qi === 0 ? 'disabled' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Prev
      </button>
      <div class="nav-center">
        <button class="btn btn-disc exam-review-btn" data-action="exam-review">
          Review answers
        </button>
      </div>
      <button class="btn nav-btn" data-action="exam-next" ${qi === total - 1 ? 'disabled' : ''}>
        Next
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  `);
}

function renderReview() {
  const total = examState.questions.length;
  const answered = Object.keys(examState.answers).length;
  const unanswered = total - answered;

  const rows = examState.questions.map((q, qi) => {
    const a = examState.answers[qi];
    const statusClass = a ? 'exam-rv-answered' : 'exam-rv-unanswered';
    return `<button class="exam-rv-row ${statusClass}" data-action="exam-jump" data-qi="${qi}">
      <span class="exam-rv-qnum">Q${q.question_number}</span>
      <span class="exam-rv-status">${a ? `Answered: ${a}` : 'Not answered'}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;
  }).join('');

  setView(`
    <div class="exam-bar">
      <span class="exam-progress">Review · ${answered}/${total} answered</span>
      <span id="examTimer" class="exam-timer ${timerClass(examState.remaining)}">${fmtTime(examState.remaining)}</span>
    </div>

    <div class="exam-review">
      <div class="exam-review-header">
        <h2 class="exam-review-title">Answer review</h2>
        <p class="exam-review-sub">${unanswered > 0 ? `${unanswered} question${unanswered !== 1 ? 's' : ''} unanswered` : 'All questions answered'}</p>
      </div>
      <div class="exam-rv-list">${rows}</div>
      <div class="exam-review-actions">
        <button class="btn btn-ghost" data-action="exam-back">← Back to exam</button>
        <button class="btn btn-ghost exam-abandon-btn" data-action="exam-abandon">Abandon</button>
        <button class="btn btn-submit" data-action="exam-submit">Submit exam</button>
      </div>
    </div>
  `);
}

function renderResults() {
  const qs = examState.questions;
  const answers = examState.answers;
  let correct = 0, wrong = 0, skipped = 0;

  const items = qs.map((q, qi) => {
    const picked = answers[qi];
    const consensus = q.consensus_answer;
    let status, statusLabel;
    if (!picked) {
      skipped++;
      status = 'skipped';
      statusLabel = 'Skipped';
    } else if (consensus && picked === consensus) {
      correct++;
      status = 'correct';
      statusLabel = '✓ Correct';
    } else if (consensus) {
      wrong++;
      status = 'wrong';
      statusLabel = '✗ Wrong';
    } else {
      status = 'no-consensus';
      statusLabel = '? No consensus';
    }

    const optRows = Object.entries(q.options).map(([l, t]) => {
      let cls = 'option locked';
      if (l === consensus) cls += ' correct';
      else if (l === picked && picked !== consensus) cls += ' wrong';
      return `<div class="${cls}"><div class="oletter">${l}</div><div class="otext">${esc(t)}</div></div>`;
    }).join('');

    const { topC } = topComment(q);

    return `
      <div class="exam-result-item result-${status}">
        <div class="exam-ri-head">
          <span class="q-badge">Q${q.question_number}</span>
          <span class="exam-ri-status ${status}">${statusLabel}</span>
          ${picked ? `<span class="exam-ri-pick">You: ${picked}</span>` : ''}
          ${consensus ? `<span class="exam-ri-cons">Community: ${consensus}</span>` : ''}
        </div>
        <p class="exam-ri-qtext">${esc(q.question)}</p>
        <div class="options">${optRows}</div>
        ${topC ? `<div class="exam-ri-disc">${commentHtml(topC, true)}</div>` : ''}
      </div>`;
  }).join('');

  const score = qs.filter((q, qi) => answers[qi] && answers[qi] === q.consensus_answer).length;
  const pct = Math.round(score / qs.length * 100);
  const pass = pct >= 70;
  const elapsed = Math.round((Date.now() - examState.startTime) / 1000);

  setView(`
    <div class="exam-results">
      <div class="exam-score-card ${pass ? 'pass' : 'fail'}">
        <div class="exam-score-pct">${pct}%</div>
        <div class="exam-score-label">${pass ? 'PASS' : 'FAIL'}</div>
        <div class="exam-score-breakdown">
          <span class="score-correct">✓ ${correct} correct</span>
          <span class="score-wrong">✗ ${wrong} wrong</span>
          <span class="score-skipped">— ${skipped} skipped</span>
        </div>
        <div class="exam-score-meta">${score} / ${qs.length} · ${fmtTime(elapsed)} elapsed</div>
        <button class="btn exam-retake-btn" data-action="exam-retake">Take another exam</button>
      </div>
      <div class="exam-results-list">${items}</div>
    </div>
  `);
}

// ── Timer tick ─────────────────────────────────────────
function tick() {
  examState.remaining--;
  const el = document.getElementById('examTimer');
  if (el) {
    el.textContent = fmtTime(examState.remaining);
    el.className = `exam-timer ${timerClass(examState.remaining)}`;
  }
  if (examState.remaining % 30 === 0) saveSession();
  if (examState.remaining <= 0) {
    stopTimer();
    submitExam();
  }
}

// ── Public API ─────────────────────────────────────────
export function startExam() {
  stopTimer();
  const pool = state.questions;
  if (!pool.length) return;

  const session = loadSession();
  if (session) {
    _pendingSession = session;
    renderResumePrompt(session);
    return;
  }

  _pendingSession = null;
  examState.status = 'idle';
  examState.questions = sample(pool, EXAM_N);
  examState.answers = {};
  examState.currentIdx = 0;
  examState.remaining = EXAM_SECS;
  examState.startTime = null;
  renderReady();
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
  const pass = pct >= 70;
  const elapsed = examState.startTime ? Math.round((Date.now() - examState.startTime) / 1000) : 0;
  saveScore({ filename: state.currentFile, score, total: qs.length, answered, pct, pass, elapsed });
  renderResults();
}

export function handleExamAction(action, dataset) {
  switch (action) {
    case 'exam-start':
      examState.status = 'active';
      examState.startTime = Date.now();
      examState.timerInterval = setInterval(tick, 1000);
      renderCurrent();
      break;

    case 'exam-resume-saved': {
      const session = _pendingSession;
      _pendingSession = null;
      if (!session) { startExam(); return; }
      examState.status = 'active';
      examState.questions = session.questions;
      examState.answers = { ...session.answers };
      examState.currentIdx = session.currentIdx;
      examState.remaining = session.remaining;
      examState.startTime = Date.now() - (EXAM_SECS - session.remaining) * 1000;
      examState.timerInterval = setInterval(tick, 1000);
      renderCurrent();
      break;
    }

    case 'exam-new-exam':
      _pendingSession = null;
      clearSession();
      examState.status = 'idle';
      examState.questions = sample(state.questions, EXAM_N);
      examState.answers = {};
      examState.currentIdx = 0;
      examState.remaining = EXAM_SECS;
      examState.startTime = null;
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
      examState.timerInterval = setInterval(tick, 1000);
      renderCurrent();
      break;

    case 'exam-abandon':
      clearSession();
      startExam();
      break;

    case 'exam-pick': {
      if (examState.status !== 'active') return;
      const l = dataset.l;
      const qi = examState.currentIdx;
      examState.answers[qi] = l;
      document.querySelectorAll('.exam-opt').forEach(el => {
        el.classList.toggle('exam-opt-selected', el.dataset.l === l);
      });
      break;
    }
    case 'exam-prev':
      if (examState.currentIdx > 0) {
        examState.currentIdx--;
        renderCurrent();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      break;
    case 'exam-next':
      if (examState.currentIdx < examState.questions.length - 1) {
        examState.currentIdx++;
        renderCurrent();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      break;
    case 'exam-review':
      renderReview();
      break;
    case 'exam-back':
      renderCurrent();
      break;
    case 'exam-jump': {
      const qi = parseInt(dataset.qi, 10);
      examState.currentIdx = qi;
      renderCurrent();
      break;
    }
    case 'exam-submit':
      submitExam();
      break;
    case 'exam-retake':
      startExam();
      break;
  }
}
