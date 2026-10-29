import { state } from './state.js';
import { loadResults, loadFlags, qidOf } from './results.js';

// Which questions belong to a filter right now.
export function buildQueue(filter) {
  if (filter === 'all') return null;
  const results = loadResults(state.currentFile);
  const flags = loadFlags(state.currentFile);
  const out = [];
  state.questions.forEach((q, i) => {
    const qid = qidOf(q);
    const r = results[qid];
    const keep = filter === 'unseen' ? !r
      : filter === 'missed' ? r && r.ok === false
      : filter === 'flagged' ? flags.has(qid)
      : filter === 'cases' ? q.group_kind === 'case_study'
      : true;
    if (keep) out.push(i);
  });
  return out;
}

export function filterCounts() {
  const results = loadResults(state.currentFile);
  const flags = loadFlags(state.currentFile);
  let unseen = 0, missed = 0, flagged = 0, cases = 0;
  state.questions.forEach(q => {
    const qid = qidOf(q);
    const r = results[qid];
    if (!r) unseen++;
    else if (r.ok === false) missed++;
    if (flags.has(qid)) flagged++;
    if (q.group_kind === 'case_study') cases++;
  });
  return { all: state.questions.length, unseen, missed, flagged, cases };
}

// Apply a filter. The queue is a snapshot, so a question you just answered stays visible until you change filter.
export function setFilter(filter) {
  // A filter is a temporary lens: remember where you were, and go back there when you leave it.
  if (filter === 'all') {
    if (state.anchor != null) state.idx = state.anchor;
    state.anchor = null;
  } else if (state.filter === 'all') {
    state.anchor = state.idx;
  }
  state.filter = filter;
  state.queue = buildQueue(filter);
  if (state.queue && state.queue.length && !state.queue.includes(state.idx)) {
    state.idx = state.queue.find(i => i >= state.idx) ?? state.queue[0];
  }
  state.cardPhase = 'unanswered';
}

// Next question index in the given direction (inside the queue), or null at the ends.
export function stepIn(delta) {
  const q = state.queue;
  if (!q) {
    const n = state.idx + delta;
    return n >= 0 && n < state.questions.length ? n : null;
  }
  if (delta > 0) return q.find(i => i > state.idx) ?? null;
  for (let k = q.length - 1; k >= 0; k--) if (q[k] < state.idx) return q[k];
  return null;
}
