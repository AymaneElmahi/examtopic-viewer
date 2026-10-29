import { fetchFiles, fetchQuestions } from './api.js';
import { state, getFeedState, resetForFile } from './state.js';
import { esc, setView } from './ui.js';
import { renderCards, pickCard, openDiscCard, closeDiscCard } from './cards.js';
import { renderFeed, pickFeedItem, toggleDiscFeedItem } from './feed.js';
import { saveProgress, loadProgress, clearProgress } from './progress.js';
import { examState, startExam, stopExam, handleExamAction } from './exam.js';
import { renderDownload, closeDownload } from './download.js';
import { renderHistory, clearHistory } from './history.js';
import { noteKey, saveNote, noteIconHtml } from './notes.js';

// ── Theme ──────────────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  state.theme = t;
  localStorage.setItem('theme', t);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.innerHTML = t === 'dark' ? moonSvg() : sunSvg();
}

function toggleTheme() {
  document.documentElement.classList.add('theme-transition');
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
}

function sunSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>`;
}

function moonSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ── Filename → Display name ────────────────────────────
function formatFileName(name) {
  const special = { devops: 'DevOps', gcp: 'GCP', ai: 'AI', ml: 'ML' };
  return name
    .replace(/\.md$/i, '')
    .split('-')
    .map(w => special[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// ── Welcome page ───────────────────────────────────────
function renderWelcome(files) {
  document.getElementById('view').className = 'welcome-wrap';

  const examCards = files.map(f => `
    <button class="exam-card" data-action="load-file" data-file="${esc(f)}">
      <div class="exam-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
      </div>
      <div class="exam-info">
        <div class="exam-name">${esc(formatFileName(f))}</div>
        <div class="exam-cert">Google Cloud Certification</div>
      </div>
      <svg class="exam-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`).join('');

  setView(`
    <div class="welcome">
      <div class="welcome-hero">
        <div class="welcome-logo-wrap">
          <img src="/static/img/logo.svg" width="54" height="54" alt="" />
        </div>
        <h1 class="welcome-title">ExamTopics Viewer</h1>
        <p class="welcome-sub">Your <strong>free, offline</strong> ExamTopics viewer — no paywall, no account. Download any certification exam and study with community-consensus answers derived from real comment votes.</p>
      </div>

      <div class="welcome-features">
        <div class="wf-item">
          <div class="wf-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div>
            <div class="wf-label">Community Consensus</div>
            <div class="wf-desc">Majority vote from "Selected Answer" comments</div>
          </div>
        </div>
        <div class="wf-item">
          <div class="wf-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="7" height="7"/><rect x="15" y="3" width="7" height="7"/><rect x="15" y="14" width="7" height="7"/><rect x="2" y="14" width="7" height="7"/></svg>
          </div>
          <div>
            <div class="wf-label">Cards & Feed modes</div>
            <div class="wf-desc">Flashcards or scrollable Reddit-style feed</div>
          </div>
        </div>
        <div class="wf-item">
          <div class="wf-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div>
            <div class="wf-label">Threaded Discussion</div>
            <div class="wf-desc">Top comment pinned, rest collapsible</div>
          </div>
        </div>
      </div>

      <div class="welcome-exams-section">
        <p class="welcome-section-label">Choose an exam to begin</p>
        <div class="welcome-exams">
          ${examCards}
          <button class="exam-card exam-card-dl" data-action="show-download">
            <div class="exam-icon exam-icon-dl">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="11" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
            </div>
            <div class="exam-info">
              <div class="exam-name">Download New Exam</div>
              <div class="exam-cert">From ExamTopics via Docker</div>
            </div>
            <svg class="exam-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>
  `);
}

// ── Mode ───────────────────────────────────────────────
function setMode(m) {
  if (state.mode === m) return;
  if (state.mode === 'exam') stopExam();
  state.mode = m;
  document.getElementById('btnCards').classList.toggle('active', m === 'cards');
  document.getElementById('btnFeed').classList.toggle('active', m === 'feed');
  document.getElementById('btnExam').classList.toggle('active', m === 'exam');
  const jumpWrap = document.querySelector('.jump-wrap');
  if (jumpWrap) jumpWrap.style.display = m === 'exam' ? 'none' : '';
  if (m === 'exam') {
    document.getElementById('view').className = 'card-wrap';
    if (state.questions.length) startExam();
    return;
  }
  if (!state.questions.length) return;
  document.getElementById('view').className = m === 'cards' ? 'card-wrap' : 'feed-wrap';
  render();
}

// ── Jump ───────────────────────────────────────────────
function jumpTo() {
  const n = parseInt(document.getElementById('jumpInput').value, 10);
  if (!n || n < 1 || n > state.questions.length) return;
  if (state.mode === 'cards') {
    state.idx = n - 1;
    state.cardPhase = 'unanswered';
    renderCards();
  } else {
    document.getElementById(`fi-${n - 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.getElementById('jumpInput').value = '';
}

// ── Navigation ─────────────────────────────────────────
export function go(delta) {
  const next = state.idx + delta;
  if (next < 0 || next >= state.questions.length) return;
  state.idx = next;
  state.cardPhase = 'unanswered';
  saveProgress(state.currentFile, state.idx);
  renderCards();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Render ─────────────────────────────────────────────
function render() {
  state.mode === 'cards' ? renderCards() : renderFeed();
}

// ── Load ───────────────────────────────────────────────
async function loadFile(filename) {
  document.getElementById('view').className = state.mode === 'cards' ? 'card-wrap' : 'feed-wrap';
  setView('<div class="state-loading"><div class="spinner"></div><p>Loading questions…</p></div>');
  try {
    const data = await fetchQuestions(filename);
    if (!data.length) {
      setView('<div class="state-empty"><p>No questions found in this file.</p></div>');
      return;
    }
    state.currentFile = filename;
    resetForFile(data);

    // Restore saved position
    const savedIdx = loadProgress(filename);
    if (savedIdx > 0 && savedIdx < data.length) {
      state.idx = savedIdx;
      showToast(`Resumed from Q${savedIdx + 1}`);
    }

    const total = data.length;
    const ji = document.getElementById('jumpInput');
    const jt = document.getElementById('jumpTotal');
    if (ji) ji.max = total;
    if (jt) jt.textContent = `/ ${total}`;
    render();
  } catch (e) {
    setView(`<div class="state-error"><strong>Error:</strong> ${esc(e.message)}</div>`);
  }
}

// ── Refresh file list after download ──────────────────
async function refreshFiles(selectFilename) {
  try {
    const files = await fetchFiles();
    const sel = document.getElementById('fileSelect');
    sel.innerHTML = '';
    files.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = formatFileName(f);
      sel.appendChild(o);
    });
    if (selectFilename) {
      sel.value = selectFilename;
      loadFile(selectFilename);
    }
  } catch (_) { /* ignore */ }
}

// ── Boot ───────────────────────────────────────────────
async function boot() {
  applyTheme(state.theme);

  try {
    const files = await fetchFiles();
    const sel = document.getElementById('fileSelect');
    sel.innerHTML = '';

    if (!files.length) {
      sel.innerHTML = '<option value="">No .md files found</option>';
      setView('<div class="state-empty"><p>No exam files found in the <code>exams/</code> folder.</p></div>');
      return;
    }

    files.forEach(f => {
      const o = document.createElement('option');
      o.value = f;
      o.textContent = formatFileName(f);
      sel.appendChild(o);
    });

    sel.addEventListener('change', e => loadFile(e.target.value));

    renderWelcome(files);
  } catch (e) {
    setView(`<div class="state-error"><strong>Could not connect:</strong> ${esc(e.message)}</div>`);
  }
}

// ── Event delegation ────────────────────────────────────
document.getElementById('view').addEventListener('click', e => {
  // Download panel from welcome page
  const dlBtn = e.target.closest('[data-action="show-download"]');
  if (dlBtn) {
    renderDownload(f => refreshFiles(f));
    return;
  }

  // Load exam from welcome page
  const loadBtn = e.target.closest('[data-action="load-file"]');
  if (loadBtn) {
    const file = loadBtn.dataset.file;
    document.getElementById('fileSelect').value = file;
    loadFile(file);
    return;
  }

  // Option click
  const opt = e.target.closest('.option:not(.locked)');
  if (opt) {
    const l = opt.dataset.l;
    if (state.mode === 'exam') {
      handleExamAction('exam-pick', { l });
    } else if (state.mode === 'cards') {
      pickCard(l);
      saveProgress(state.currentFile, state.idx);
    } else {
      const fi = opt.closest('[data-qi]');
      if (fi) pickFeedItem(parseInt(fi.dataset.qi), l);
    }
    return;
  }

  // Action buttons
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'reset-progress') {
    clearProgress(state.currentFile);
    state.idx = 0;
    state.cardPhase = 'unanswered';
    renderCards();
    showToast('Progress cleared — starting from Q1');
    return;
  }
  if (action === 'toggle-note') {
    const targetId = btn.dataset.noteTarget;
    const body = document.getElementById(targetId);
    if (body) {
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      if (!open) body.querySelector('textarea')?.focus();
    }
    return;
  }
  if (action === 'hist-clear') {
    clearHistory();
    renderHistory();
    return;
  }
  if (action === 'prev') { go(-1); return; }
  if (action === 'next') { go(1); return; }
  if (action === 'open-disc') { openDiscCard(); return; }
  if (action === 'close-disc') { closeDiscCard(); return; }
  if (action === 'toggle-disc') {
    toggleDiscFeedItem(parseInt(btn.dataset.qi));
    return;
  }
  if (action.startsWith('exam-')) { handleExamAction(action, btn.dataset); return; }
  if (action === 'show-more') {
    const el = document.getElementById(btn.dataset.list);
    const count = parseInt(btn.dataset.count);
    const open = el.style.display === 'block';
    el.style.display = open ? 'none' : 'block';
    btn.textContent = open
      ? `Show ${count} more comment${count !== 1 ? 's' : ''}`
      : `Hide ${count} comment${count !== 1 ? 's' : ''}`;
  }
});

// Note textarea: save on blur
document.getElementById('view').addEventListener('blur', e => {
  const ta = e.target;
  if (!ta.classList.contains('note-textarea')) return;
  const qid = ta.dataset.noteQid;
  const k = noteKey(state.currentFile, qid);
  saveNote(k, ta.value);
  const toggle = document.querySelector(`.note-toggle[data-note-qid="${qid}"]`);
  if (toggle) {
    const has = !!ta.value.trim();
    toggle.classList.toggle('has-note', has);
    toggle.innerHTML = `${noteIconHtml(has)} ${has ? 'Note' : 'Add note'}`;
  }
}, true);

// Header events
document.getElementById('btnHistory').addEventListener('click', renderHistory);
document.getElementById('btnDownload').addEventListener('click', () => {
  closeDownload();
  renderDownload(f => refreshFiles(f));
});
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('btnCards').addEventListener('click', () => setMode('cards'));
document.getElementById('btnFeed').addEventListener('click', () => setMode('feed'));
document.getElementById('btnExam').addEventListener('click', () => setMode('exam'));
document.getElementById('jumpGo').addEventListener('click', jumpTo);
document.getElementById('jumpInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') jumpTo();
});

// Keyboard nav (card mode only, not when typing)
document.addEventListener('keydown', e => {
  if (state.mode !== 'cards') return;
  if (state.cardPhase === 'discussion') return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft' && !e.metaKey) go(-1);
  if (e.key === 'ArrowRight' && !e.metaKey) go(1);
});

boot();
