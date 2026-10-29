export const state = {
  questions: [],
  idx: 0,
  currentFile: '',
  mode: 'cards',
  theme: localStorage.getItem('theme') || 'dark',
  cardPhase: 'unanswered', // 'unanswered' | 'answered' | 'discussion'
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
  state.feedStates = {};
}
