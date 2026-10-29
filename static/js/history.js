import { esc } from './ui.js';

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

function fmtName(filename) {
  const special = { devops: 'DevOps', gcp: 'GCP', ai: 'AI', ml: 'ML' };
  return filename
    .replace(/\.md$/i, '')
    .split('-')
    .map(w => special[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
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
          <h2 class="hist-title">Exam History</h2>
        </div>
        <div class="hist-empty">
          <p>No exam history yet.</p>
          <p class="hist-empty-sub">Complete an exam with more than 20 questions answered to record a score.</p>
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
          <div class="hist-detail">${e.score}/${e.total} correct · ${e.answered} answered · ${fmtElapsed(e.elapsed)}</div>
        </div>
        <div class="hist-right">
          <span class="hist-badge ${cls}">${e.pass ? 'PASS' : 'FAIL'}</span>
          <span class="hist-date">${esc(fmtDate(e.date))}</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('view').innerHTML = `
    <div class="hist-panel">
      <div class="hist-header">
        <h2 class="hist-title">Exam History</h2>
        <button class="btn btn-ghost hist-clear-btn" data-action="hist-clear">Clear history</button>
      </div>
      <div class="hist-list">${rows}</div>
    </div>`;
}
