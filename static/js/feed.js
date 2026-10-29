import { state, getFeedState } from './state.js';
import { esc, setView, optsHtml, revealOptions, discHtml } from './ui.js';
import { noteKey, loadNote, hasNote, noteHtml } from './notes.js';

export function renderFeed() {
  setView(state.questions.map((q, qi) => feedItem(q, qi)).join(''));
}

function feedItem(q, qi) {
  const st = getFeedState(qi);
  const answered = st.phase !== 'unanswered';
  const hasCons = !!q.consensus_answer;
  const consPct = hasCons && q.consensus_total
    ? Math.round(q.consensus_votes / q.consensus_total * 100) : 0;
  const qid = `${q.topic}-${q.question_number}`;
  const nk = noteKey(state.currentFile, qid);
  const itemNote = noteHtml(qid, loadNote(nk), hasNote(nk));

  return `
  <article class="feed-item${answered ? ' fi-answered' : ''}" id="fi-${qi}" data-qi="${qi}">
    <header class="fi-head">
      <span class="q-badge">Q${q.question_number}</span>
      <span class="fi-topic">Topic ${q.topic}</span>
      ${q.timestamp ? `<span class="fi-ts">${esc(q.timestamp)}</span>` : ''}
      ${q.examtopics_url
        ? `<a class="qmeta-link" href="${q.examtopics_url}" target="_blank" rel="noopener">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
             ExamTopics
           </a>`
        : ''}
    </header>

    <p class="fi-qtext">${esc(q.question)}</p>

    <div class="fi-options">
      <div class="options">${optsHtml(q, `fo-${qi}-`)}</div>
    </div>

    <div class="fi-note">${itemNote}</div>

    <div class="fi-revealed" id="frev-${qi}" style="${answered ? '' : 'display:none'}">
      ${answered ? feedRevealedHtml(q, qi, consPct) : ''}
    </div>

    <footer class="fi-footer" id="ffoot-${qi}">
      ${answered
        ? `<button class="btn btn-disc" data-action="toggle-disc" data-qi="${qi}">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
             Discussion (${q.comments.length})
           </button>`
        : `<span class="fi-hint">Select an answer to reveal</span>`
      }
      <span class="fi-pill">${q.comments.length} comments</span>
    </footer>

    <div class="fi-disc" id="fdisc-${qi}"></div>
  </article>`;
}

function feedRevealedHtml(q, qi, consPct) {
  if (!q.consensus_answer) {
    return `<div class="no-consensus show">No community consensus — read the discussion.</div>`;
  }
  return `
    <div class="consensus-wrap show">
      <div class="clabel">
        <span>Community answer: <strong>${q.consensus_answer}</strong></span>
        <span class="cvote-count">${q.consensus_votes} of ${q.consensus_total} · ${consPct}%</span>
      </div>
      <div class="ctrack"><div class="cfill" style="width:${consPct}%"></div></div>
    </div>`;
}

export function pickFeedItem(qi, letter) {
  const st = getFeedState(qi);
  if (st.phase !== 'unanswered') return;
  st.phase = 'answered';
  st.picked = letter;
  const q = state.questions[qi];
  const consPct = q.consensus_total ? Math.round(q.consensus_votes / q.consensus_total * 100) : 0;

  // Mark answered
  document.getElementById(`fi-${qi}`).classList.add('fi-answered');

  // Reveal options
  revealOptions(q, letter, `fo-${qi}-`);

  // Show consensus
  const rev = document.getElementById(`frev-${qi}`);
  rev.innerHTML = feedRevealedHtml(q, qi, consPct);
  rev.style.display = '';

  // Update footer
  document.getElementById(`ffoot-${qi}`).innerHTML = `
    <button class="btn btn-disc" data-action="toggle-disc" data-qi="${qi}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Discussion (${q.comments.length})
    </button>
    <span class="fi-pill">${q.comments.length} comments</span>`;
}

export function toggleDiscFeedItem(qi) {
  const st = getFeedState(qi);
  const disc = document.getElementById(`fdisc-${qi}`);
  const foot = document.getElementById(`ffoot-${qi}`);
  const q = state.questions[qi];

  const discBtn = `
    <button class="btn btn-disc" data-action="toggle-disc" data-qi="${qi}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Discussion (${q.comments.length})
    </button>
    <span class="fi-pill">${q.comments.length} comments</span>`;

  if (st.phase === 'discussion') {
    st.phase = 'answered';
    disc.classList.remove('show');
    foot.innerHTML = discBtn;
  } else {
    st.phase = 'discussion';
    if (!disc.dataset.rendered) {
      disc.innerHTML = `<div class="discussion show">${discHtml(q, `f${qi}-`)}</div>`;
      disc.dataset.rendered = '1';
    }
    disc.classList.add('show');
    foot.innerHTML = `
      <button class="btn btn-ghost" data-action="toggle-disc" data-qi="${qi}">✕ Close discussion</button>
      <span class="fi-pill">${q.comments.length} comments</span>`;
  }
}
