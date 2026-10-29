import { state } from './state.js';
import { esc, setView, optsHtml, revealOptions, discHtml } from './ui.js';
import { noteKey, loadNote, hasNote, noteHtml } from './notes.js';

export function renderCards() {
  const q = state.questions[state.idx];
  const pct = ((state.idx + 1) / state.questions.length * 100).toFixed(2);
  const hasCons = !!q.consensus_answer;
  const consPct = hasCons && q.consensus_total
    ? Math.round(q.consensus_votes / q.consensus_total * 100) : 0;
  const qid = `${q.topic}-${q.question_number}`;
  const nk = noteKey(state.currentFile, qid);
  const cardNote = noteHtml(qid, loadNote(nk), hasNote(nk));

  setView(`
    <div class="ptop"><div class="ptop-fill" style="width:${pct}%"></div></div>

    <div class="qbody">
      <div class="qmeta">
        <span class="q-badge">Q${q.question_number}</span>
        <span class="qmeta-dot">·</span>
        <span class="qmeta-label">Topic ${q.topic}</span>
        ${q.timestamp ? `<span class="qmeta-dot">·</span><span class="qmeta-ts">${esc(q.timestamp)}</span>` : ''}
        ${q.examtopics_url
          ? `<a class="qmeta-link" href="${q.examtopics_url}" target="_blank" rel="noopener">
               <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
               ExamTopics
             </a>`
          : ''}
        <button class="qmeta-reset" data-action="reset-progress" title="Reset progress">↺</button>
      </div>

      <p class="qtext">${esc(q.question)}</p>

      <div class="options" id="opts">
        ${optsHtml(q, 'o-')}
      </div>
      ${cardNote}
    </div>

    <div class="consensus-wrap" id="cbar">
      <div class="clabel">
        <span>Community answer: <strong>${q.consensus_answer}</strong></span>
        <span class="cvote-count">${q.consensus_votes} of ${q.consensus_total} · ${consPct}%</span>
      </div>
      <div class="ctrack"><div class="cfill" id="cfill" style="width:0%"></div></div>
    </div>
    <div class="no-consensus" id="nocons">No community consensus — read the discussion.</div>

    <div class="nav-row">
      <button class="btn nav-btn" data-action="prev" ${state.idx === 0 ? 'disabled' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        Prev
      </button>
      <div class="nav-center" id="navc">
        <span class="nav-hint">Select an answer to reveal</span>
      </div>
      <button class="btn nav-btn" data-action="next" ${state.idx === state.questions.length - 1 ? 'disabled' : ''}>
        Next
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>

    <div class="discussion" id="disc">
      ${discHtml(q, 'c-')}
    </div>
  `);
}

export function pickCard(letter) {
  if (state.cardPhase !== 'unanswered') return;
  state.cardPhase = 'answered';
  const q = state.questions[state.idx];

  revealOptions(q, letter, 'o-');

  if (q.consensus_answer) {
    document.getElementById('cbar').classList.add('show');
    const pct = q.consensus_total ? Math.round(q.consensus_votes / q.consensus_total * 100) : 0;
    setTimeout(() => { document.getElementById('cfill').style.width = pct + '%'; }, 40);
  } else {
    document.getElementById('nocons').classList.add('show');
  }

  document.getElementById('navc').innerHTML = q.comments.length
    ? `<button class="btn btn-disc" data-action="open-disc">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
         Discussion (${q.comments.length})
       </button>`
    : `<span class="nav-hint">No discussion available</span>`;
}

export function openDiscCard() {
  if (state.cardPhase !== 'answered') return;
  state.cardPhase = 'discussion';
  document.getElementById('disc').classList.add('show');
  document.getElementById('navc').innerHTML =
    `<button class="btn btn-ghost" data-action="close-disc">✕ Close discussion</button>`;
}

export function closeDiscCard() {
  state.cardPhase = 'answered';
  document.getElementById('disc').classList.remove('show');
  const q = state.questions[state.idx];
  document.getElementById('navc').innerHTML = q.comments.length
    ? `<button class="btn btn-disc" data-action="open-disc">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
         Discussion (${q.comments.length})
       </button>`
    : `<span class="nav-hint">No discussion available</span>`;
}
