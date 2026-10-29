import { fetchFiles, fetchQuestions } from './api.js';
import { state, resetForFile } from './state.js';
import { esc, setView, fmtName, confirmClick } from './ui.js';
import { renderCards, pickCard, revealCard, toggleFlagCurrent, toggleNav } from './cards.js';
import { renderFeed, pickFeedItem, toggleDiscFeedItem, toggleFlagFeed, scrollToFeedItem, stopFeedObserver } from './feed.js';
import { saveProgress, loadProgress, clearProgress } from './progress.js';
import { examState, startExam, stopExam, showExam, handleExamAction, handleExamKey } from './exam.js';
import { renderDownload, closeDownload } from './download.js';
import { renderHistory, clearHistory } from './history.js';
import { noteKey, saveNote, noteIconHtml } from './notes.js';
import { clearResults, saveLastFile } from './results.js';
import { setFilter, stepIn } from './queue.js';
import { renderLibrary } from './library.js';
import { startRename } from './navigator.js';
import { saveCaseText } from './groups.js';
import { needsDisclaimer, showAbout } from './about.js';

const $ = id => document.getElementById(id);

// ── Theme ──────────────────────────────────────────────
function applyTheme(t, persist = true) {
  document.documentElement.setAttribute('data-theme', t);
  state.theme = t;
  if (persist) localStorage.setItem('theme', t);
  const icon = $('themeIcon');
  if (icon) icon.innerHTML = t === 'dark' ? moonSvg() : sunSvg();
}

function toggleTheme() {
  document.documentElement.classList.add('theme-transition');
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  setTimeout(() => document.documentElement.classList.remove('theme-transition'), 400);
}

function sunSvg() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </svg>`;
}

function moonSvg() {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;
}

// ── Toast ──────────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ── Tabs / mode ────────────────────────────────────────
function setTabs(m) {
  $('btnCards').classList.toggle('active', m === 'cards');
  $('btnFeed').classList.toggle('active', m === 'feed');
  $('btnExam').classList.toggle('active', m === 'exam');
  const jumpWrap = document.querySelector('.jump-wrap');
  if (jumpWrap) jumpWrap.style.display = m === 'exam' ? 'none' : '';
}

// Resume position only tracks the full list; browsing a filtered list must not overwrite it.
const savePos = () => { if (state.filter === 'all') saveProgress(state.currentFile, state.idx); };

const wrapFor = () => 'study-wrap';

function pauseExamIfRunning() {
  if (examState.status === 'active') handleExamAction('exam-pause');
}

function showLibrary() {
  pauseExamIfRunning();
  closeDownload();
  renderLibrary();
  window.scrollTo({ top: 0 });
}

function setMode(m) {
  closeDownload();
  if (!state.questions.length) { showLibrary(); return; }
  if (state.mode === 'exam' && m !== 'exam') stopExam();
  stopFeedObserver();
  state.mode = m;
  setTabs(m);
  if (m === 'exam') { showExam(); return; }
  $('view').className = wrapFor(m);
  render();
}

function render() {
  state.mode === 'feed' ? renderFeed() : renderCards();
}

// ── Navigation (cards) ─────────────────────────────────
function go(delta) {
  const next = stepIn(delta);
  if (next === null) return;
  state.idx = next;
  savePos();
  renderCards();
  window.scrollTo({ top: 0 });
}

function jumpTo() {
  const n = parseInt($('jumpInput').value, 10);
  if (!n || n < 1 || n > state.questions.length) return;
  if (state.mode === 'cards') {
    if (state.queue && !state.queue.includes(n - 1)) setFilter('all');
    state.idx = n - 1;
    savePos();
    renderCards();
  } else if (state.mode === 'feed') {
    if (state.queue && !state.queue.includes(n - 1)) { setFilter('all'); renderFeed(); }
    scrollToFeedItem(n - 1);
  }
  $('jumpInput').value = '';
}

// ── Loading ────────────────────────────────────────────
async function loadLibrary(only) {
  const targets = only ? [only] : state.files;
  await Promise.all(targets.map(async f => {
    try { state.library[f] = await fetchQuestions(f); }
    catch (e) { state.library[f] = { error: e.message }; }
  }));
}

function fillFileSelect(selected) {
  const sel = $('fileSelect');
  sel.innerHTML = '';
  state.files.forEach(f => {
    const o = document.createElement('option');
    o.value = f;
    o.textContent = fmtName(f);
    sel.appendChild(o);
  });
  if (selected) sel.value = selected;
}

async function loadFile(filename, opts = {}) {
  closeDownload();
  if (state.mode === 'exam') stopExam();
  if (opts.mode) state.mode = opts.mode;
  setTabs(state.mode);
  $('view').className = state.mode === 'exam' ? 'card-wrap' : wrapFor(state.mode);
  setView('<div class="state-loading"><div class="spinner"></div><p>Loading questions…</p></div>');
  $('fileSelect').value = filename;

  try {
    if (!Array.isArray(state.library[filename])) await loadLibrary(filename);
    const data = state.library[filename];
    if (!Array.isArray(data)) throw new Error(data?.error || 'Could not read this file');
    if (!data.length) {
      setView('<div class="state-empty"><p>No questions found in this file.</p></div>');
      return;
    }

    state.currentFile = filename;
    resetForFile(data);
    saveLastFile(filename);

    const filter = opts.filter || 'all';
    const saved = loadProgress(filename);
    const savedIdx = saved > 0 && saved < data.length ? saved : 0;
    if (opts.at != null) {
      state.idx = Math.min(Math.max(opts.at, 0), data.length - 1);
      saveProgress(filename, state.idx);
    } else if (filter === 'all') {
      state.idx = savedIdx;
    } else {
      state.idx = savedIdx;           // "back to all" returns here
      setFilter(filter);
      if (state.queue?.length) state.idx = state.queue[0];
    }

    const ji = $('jumpInput');
    const jt = $('jumpTotal');
    if (ji) ji.max = data.length;
    if (jt) jt.textContent = `of ${data.length}`;

    if (state.mode === 'exam') startExam();
    else render();
    window.scrollTo({ top: 0 });
  } catch (e) {
    setView(`<div class="state-error"><strong>Couldn't open this exam.</strong><p>${esc(e.message)}</p><button class="btn" data-action="show-library">Back to your exams</button></div>`);
  }
}

// After a download: refresh the list, then open the new file.
async function refreshFiles(selectFilename) {
  try {
    state.files = await fetchFiles();
    if (selectFilename) delete state.library[selectFilename];
    fillFileSelect(selectFilename);
    if (selectFilename) loadFile(selectFilename, { mode: 'cards' });
  } catch (_) { /* ignore */ }
}

// ── Boot ───────────────────────────────────────────────
async function boot() {
  applyTheme(state.theme, false);

  try {
    state.files = await fetchFiles();
    fillFileSelect();

    if (!state.files.length) {
      $('view').className = 'welcome-wrap';
      setView(`
        <section class="onboard">
          <h1 class="lib-title">Add your first exam</h1>
          <p class="lib-sub">The app comes without any exam. There are two ways to add one.</p>
          <ol class="onboard-steps">
            <li><strong>Download it here.</strong> Pick a provider and an exam name. This needs Docker Desktop running.</li>
            <li><strong>Drop a file in.</strong> Put an ExamTopics export (a <code>.md</code> file) in the <code>exams/</code> folder, then reload this page.</li>
          </ol>
          <button class="btn btn-submit lib-cta" data-action="show-download">Add an exam</button>
          <p class="lib-foot"><button class="link-btn" data-action="show-about">About and disclaimer</button></p>
        </section>`);
      if (needsDisclaimer()) showAbout({ first: true });
      return;
    }

    $('fileSelect').addEventListener('change', e => loadFile(e.target.value));
    await loadLibrary();
    renderLibrary();
    if (needsDisclaimer()) showAbout({ first: true });
  } catch (e) {
    setView(`<div class="state-error"><strong>Could not connect to the server.</strong><p>${esc(e.message)}</p></div>`);
  }
}

// ── Event delegation ────────────────────────────────────
$('view').addEventListener('click', e => {
  // Option click
  const opt = e.target.closest('.option:not(.locked)');
  if (opt) {
    const l = opt.dataset.l;
    if (state.mode === 'exam') {
      handleExamAction('exam-pick', { l });
    } else if (state.mode === 'cards') {
      pickCard(l);
      savePos();
    } else {
      const fi = opt.closest('[data-qi]');
      if (fi) pickFeedItem(parseInt(fi.dataset.qi, 10), l);
    }
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  switch (action) {
    case 'show-library': showLibrary(); return;
    case 'show-download':
      pauseExamIfRunning();
      closeDownload();
      renderDownload(f => refreshFiles(f));
      return;
    case 'open-q':
      loadFile(btn.dataset.file, { mode: 'cards', at: parseInt(btn.dataset.i, 10) });
      return;
    case 'open-exam':
      loadFile(btn.dataset.file, { mode: btn.dataset.mode || 'cards', filter: btn.dataset.filter || 'all' });
      return;
    case 'reset-progress':
      if (!confirmClick(btn, 'Click again to erase your progress')) return;
      clearProgress(state.currentFile);
      clearResults(state.currentFile);
      setFilter('all');
      state.idx = 0;
      state.feedStates = {};
      render();
      showToast('Progress erased. Back to question 1.');
      return;
    case 'goto':
      state.idx = parseInt(btn.dataset.i, 10);
      savePos();
      renderCards();
      window.scrollTo({ top: 0 });
      return;
    case 'filter':
      setFilter(btn.dataset.f);
      savePos();
      render();
      window.scrollTo({ top: 0 });
      return;
    case 'rename-group': startRename(parseInt(btn.dataset.i, 10)); return;
    case 'show-about': showAbout(); return;
    case 'feed-goto': scrollToFeedItem(parseInt(btn.dataset.i, 10)); return;
    case 'feed-flag': toggleFlagFeed(parseInt(btn.dataset.qi, 10)); return;
    case 'toggle-nav': toggleNav(); return;
    case 'toggle-flag': toggleFlagCurrent(); return;
    case 'reveal': revealCard(); return;
    case 'toggle-note': {
      const body = $(btn.dataset.noteTarget);
      if (body) {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if (!open) body.querySelector('textarea')?.focus();
      }
      return;
    }
    case 'hist-clear':
      if (!confirmClick(btn, 'Click again to clear')) return;
      clearHistory();
      renderHistory();
      return;
    case 'prev': go(-1); return;
    case 'next': go(1); return;
    case 'toggle-disc': toggleDiscFeedItem(parseInt(btn.dataset.qi, 10)); return;
    case 'show-more': {
      const el = $(btn.dataset.list);
      const count = parseInt(btn.dataset.count, 10);
      const open = el.style.display === 'block';
      el.style.display = open ? 'none' : 'block';
      btn.textContent = open
        ? `Show ${count} more comment${count !== 1 ? 's' : ''}`
        : `Hide ${count} comment${count !== 1 ? 's' : ''}`;
      return;
    }
  }

  if (action.startsWith('exam-')) {
    if (action === 'exam-submit') {
      const left = examState.questions.length - Object.keys(examState.answers).length;
      if (!confirmClick(btn, left ? `${left} unanswered. Submit anyway?` : 'Click again to submit')) return;
    }
    if (action === 'exam-abandon' && !confirmClick(btn, 'Click again to abandon')) return;
    handleExamAction(action, btn.dataset);
  }
});

// Note textarea: save on blur
$('view').addEventListener('blur', e => {
  const ta = e.target;
  if (ta.classList?.contains('case-textarea')) {
    saveCaseText(ta.dataset.caseKey, ta.value);
    const label = ta.closest('.case-box')?.querySelector('.case-state');
    if (label) label.textContent = ta.value.trim() ? 'Text saved' : 'Text not added';
    const help = ta.closest('.case-box')?.querySelector('.case-help');
    if (help) help.hidden = !!ta.value.trim();
    return;
  }
  if (!ta.classList?.contains('note-textarea')) return;
  const qid = ta.dataset.noteQid;
  saveNote(noteKey(state.currentFile, qid), ta.value);
  const toggle = document.querySelector(`.note-toggle[data-note-qid="${qid}"]`);
  if (toggle) {
    const has = !!ta.value.trim();
    toggle.classList.toggle('has-note', has);
    toggle.innerHTML = `${noteIconHtml(has)} ${has ? 'Note' : 'Add note'}`;
  }
}, true);

// Enter / Space on a focused answer
$('view').addEventListener('keydown', e => {
  const opt = e.target.closest?.('.option:not(.locked)');
  if (opt && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    opt.click();
  }
});

// Header events
$('btnHistory').addEventListener('click', () => { pauseExamIfRunning(); closeDownload(); renderHistory(); });
$('btnDownload').addEventListener('click', () => {
  pauseExamIfRunning();
  closeDownload();
  renderDownload(f => refreshFiles(f));
});
$('themeToggle').addEventListener('click', toggleTheme);
$('btnCards').addEventListener('click', () => setMode('cards'));
$('btnFeed').addEventListener('click', () => setMode('feed'));
$('btnExam').addEventListener('click', () => setMode('exam'));
document.querySelector('.logo').addEventListener('click', e => {
  e.preventDefault();
  if (state.files.length) showLibrary();
});
$('jumpInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') jumpTo();
});

// Keyboard: ← → move, letters answer, Shift+F flag, Enter next
document.addEventListener('keydown', e => {
  if (!state.questions.length) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const active = document.activeElement;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(active?.tagName)) return;

  if (state.mode === 'exam') {
    if (handleExamKey(e)) e.preventDefault();
    return;
  }
  if (state.mode !== 'cards' || !document.querySelector('.study')) return;
  const onOption = !!active?.closest?.('.option');

  if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 'Enter' && state.cardPhase === 'answered' && !onOption && !['BUTTON', 'A'].includes(active?.tagName)) go(1);
  else if (e.key === 'F' && e.shiftKey) toggleFlagCurrent();
  else if (/^[a-zA-Z]$/.test(e.key) && !e.shiftKey && state.queue?.length !== 0) pickCard(e.key.toUpperCase());
});

boot();
