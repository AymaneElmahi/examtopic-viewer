import { esc, fmtName } from './ui.js';

const HIST_KEY = 'et-history';

export function saveScore({ filename, score, total, answered, pct, pass, elapsed }) {
  if (answered <= 20) return;
  const history = loadHistory();
  history.unshift({ date: new Date().toISOString(), filename, score, total, answered, pct, pass, elapsed });
  localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0, 200)));
}

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); }
  catch { return []; }
}

export function clearHistory() {
  localStorage.removeItem(HIST_KEY);
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtElapsed(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function renderHistory() {
  const history = loadHistory();
  document.getElementById('view').className = 'card-wrap';

  if (!history.length) {
    document.getElementById('view').innerHTML = `
      <div class="hist-panel">
        <div class="hist-header">
          <h2 class="hist-title">Exam history</h2>
        </div>
        <div class="hist-empty">
          <p>No mock exams yet.</p>
          <p class="hist-empty-sub">Finish a mock exam with more than 20 questions answered and your score will show up here.</p>
        </div>
      </div>`;
    return;
  }

  const rows = history.map(e => {
    const cls = e.pass ? 'pass' : 'fail';
    return `
      <div class="hist-entry">
        <div class="hist-score ${cls}">${e.pct}%</div>
        <div class="hist-meta">
          <div class="hist-exam">${esc(fmtName(e.filename))}</div>
          <div class="hist-detail">${e.score} of ${e.total} correct, ${e.answered} answered, ${fmtElapsed(e.elapsed)}</div>
        </div>
        <div class="hist-right">
          <span class="hist-badge ${cls}">${e.pass ? 'Passed' : 'Failed'}</span>
          <span class="hist-date">${esc(fmtDate(e.date))}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="hist-panel">
      <div class="hist-header">
        <h2 class="hist-title">Exam history</h2>
        <button class="btn btn-ghost hist-clear-btn" data-action="hist-clear">Clear history</button>
      </div>
      <div class="hist-list">${rows}</div>
    </div>`;
}
