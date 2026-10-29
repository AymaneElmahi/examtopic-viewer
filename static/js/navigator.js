import { state } from './state.js';
import { esc, fmtName } from './ui.js';
import { loadResults, summarize, qidOf } from './results.js';
import { filterCounts } from './queue.js';
import { hasSections, sectionOf, groupLabel, groupKey, groupChipText, renameGroup } from './groups.js';

const CHEVRON = `<svg class="nv-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const PENCIL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>`;
const FILTERS = [['all', 'All'], ['unseen', 'Unseen'], ['missed', 'Missed'], ['flagged', 'Flagged']];
const FILTER_NAME = { unseen: 'unseen', missed: 'missed', flagged: 'flagged', cases: 'in case studies' };

// Shared by Cards and Feed: progress, filters and a grid of every question, grouped by exam / case study.
export function navInner(results) {
  const total = state.questions.length;
  const { seen, ok, miss } = summarize(results);
  const decided = ok + miss;
  const pct = decided ? Math.round(ok / decided * 100) : null;
  const counts = filterCounts();
  const indices = state.queue ?? state.questions.map((_, i) => i);
  const sectioned = hasSections();
  const hasCases = counts.cases > 0;
  const filters = hasCases ? [...FILTERS, ['cases', 'Case studies']] : FILTERS;
  const go = state.mode === 'feed' ? 'feed-goto' : 'goto';

  let lastKey = null;
  const cells = indices.map(i => {
    const q = state.questions[i];
    let head = '';
    if (sectioned) {
      const sec = sectionOf(q);
      if (sec.key !== lastKey) {
        lastKey = sec.key;
        head = `<div class="nv-group"><span class="nv-group-title">${esc(sec.title)}</span>${sec.renamable
          ? `<button class="nv-rename" data-action="rename-group" data-i="${i}" aria-label="Rename ${esc(sec.title)}" title="Rename">${PENCIL}</button>` : ''}</div>`;
      }
    }
    const r = results[qidOf(q)];
    let cls = 'nv-cell';
    if (r) cls += r.ok === true ? ' is-ok' : r.ok === false ? ' is-miss' : ' is-seen';
    if (i === state.idx) cls += ' is-current';
    return `${head}<button class="${cls}" data-action="${go}" data-i="${i}" aria-label="Question ${i + 1}"${i === state.idx ? ' aria-current="true"' : ''}>${i + 1}</button>`;
  }).join('');

  const pos = state.queue
    ? `${Math.max(1, state.queue.indexOf(state.idx) + 1)} of ${state.queue.length} ${FILTER_NAME[state.filter]}`
    : `Question ${state.idx + 1} of ${total}`;

  return `
    <button class="nav-toggle" data-action="toggle-nav" aria-label="Show question list">
      <span>${pos}</span>${CHEVRON}
    </button>
    <div class="nav-body">
      <div>
        <div class="nv-title">${esc(fmtName(state.currentFile))}</div>
        <div class="nv-stats" style="margin-top:6px">
          <strong>${seen}</strong> of ${total} answered${pct !== null ? ` · <strong>${pct}%</strong> matched the community` : ''}
        </div>
        <div class="nv-bar" aria-hidden="true">
          <i class="b-ok" style="width:${ok / total * 100}%"></i><i class="b-miss" style="width:${miss / total * 100}%"></i>
        </div>
      </div>
      <div class="seg" role="group" aria-label="Show">
        ${filters.map(([f, label]) => `
          <button class="seg-btn${state.filter === f ? ' on' : ''}${f === 'cases' ? ' wide' : ''}" data-action="filter" data-f="${f}"${f !== 'all' && !counts[f] && state.filter !== f ? ' disabled' : ''}>
            ${label}<span>${counts[f]}</span>
          </button>`).join('')}
      </div>
      ${state.filter !== 'all' && state.anchor != null
        ? `<button class="nv-back" data-action="filter" data-f="all">← Back to question ${state.anchor + 1}</button>` : ''}
      <div class="nv-grid" id="nvGrid">${cells || '<p class="nv-empty">Nothing in this list yet.</p>'}</div>
      <div class="nv-legend"><span class="l-ok">Matched</span><span class="l-miss">Missed</span><span>Not yet</span></div>
      ${seen ? `<button class="nv-reset" data-action="reset-progress">Reset progress</button>` : ''}
    </div>`;
}

export function centerGrid() {
  const grid = document.getElementById('nvGrid');
  const cur = grid?.querySelector('.is-current');
  if (grid && cur) grid.scrollTop = cur.offsetTop - grid.clientHeight / 2 + cur.clientHeight / 2;
}

export function refreshNav() {
  const pane = document.getElementById('navPane');
  if (!pane) return;
  const top = document.getElementById('nvGrid')?.scrollTop ?? 0;
  pane.innerHTML = navInner(loadResults(state.currentFile));
  const grid = document.getElementById('nvGrid');
  if (grid) grid.scrollTop = top;
}

export function toggleNav() {
  document.getElementById('navPane')?.classList.toggle('open');
}

// Rename a group in place: the heading turns into a text field.
export function startRename(i) {
  const q = state.questions[i];
  const head = document.querySelector(`.nv-rename[data-i="${i}"]`)?.closest('.nv-group');
  if (!q || !head) return;
  const input = document.createElement('input');
  input.className = 'nv-rename-input';
  input.value = groupLabel(q);
  input.maxLength = 60;
  input.setAttribute('aria-label', 'Group name');
  head.replaceChildren(input);
  input.focus();
  input.select();

  let done = false;
  const finish = save => {
    if (done) return;
    done = true;
    if (save) {
      renameGroup(q, input.value.trim());
      document.querySelectorAll(`.chip-group[data-gk="${CSS.escape(groupKey(q))}"]`).forEach(el => { el.textContent = groupChipText(q); });
      document.querySelectorAll('.case-title').forEach(el => {
        if (el.closest('.case-box')?.dataset.gk === groupKey(q)) el.textContent = groupLabel(q);
      });
    }
    refreshNav();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}
