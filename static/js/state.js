export const state = {
  files: [],
  library: {},              // { [filename]: questions[] | { error } } loaded at boot for the library view
  questions: [],
  idx: 0,
  currentFile: '',
  mode: 'cards',
  theme: document.documentElement.getAttribute('data-theme') || 'light',
  cardPhase: 'unanswered', // 'unanswered' | 'answered'
  filter: 'all',            // 'all' | 'unseen' | 'missed' | 'flagged'
  queue: null,              // snapshot of question indices for the active filter (null = all)
  anchor: null,             // where you were before entering a filter, so "back to all" returns there
  feedStates: {},           // { [qi]: { phase, picked } }
};

export function getFeedState(qi) {
  if (!state.feedStates[qi]) {
    state.feedStates[qi] = { phase: 'unanswered', picked: null };
  }
  return state.feedStates[qi];
}

export function resetForFile(questions) {
  state.questions = questions;
  state.idx = 0;
  state.cardPhase = 'unanswered';
  state.filter = 'all';
  state.queue = null;
  state.anchor = null;
  state.feedStates = {};
}
