import { state, getFeedState } from './state.js';
import { esc, setView, qImagesHtml, optsHtml, revealOptions, discHtml, flagIcon } from './ui.js';
import { noteKey, loadNote, hasNote, noteHtml } from './notes.js';
import { loadResults, saveResult, loadFlags, toggleFlag, qidOf } from './results.js';
import { navInner, refreshNav } from './navigator.js';
import { saveProgress } from './progress.js';
import { topicHtml, caseBoxHtml } from './groups.js';

let observer = null;

function itemIndices() {
  return state.queue ?? state.questions.map((_, i) => i);
}

export function renderFeed() {
  const results = loadResults(state.currentFile);
  const flags = loadFlags(state.currentFile);
  const indices = itemIndices();

  const body = indices.length
    ? indices.map(qi => feedItem(state.questions[qi], qi, results, flags)).join('')
    : `<section class="feed-item feed-empty"><p class="fi-qtext">${{
        unseen: 'You have seen every question in this exam.',
        missed: 'No missed questions. Nice work.',
        flagged: 'You have not flagged anything yet. Use the flag on a question to find it here.',
      }[state.filter] || 'Nothing here.'}</p><button class="btn btn-submit" data-action="filter" data-f="all">Show all questions</button></section>`;

  setView(`
    <div class="study study-feed">
      <aside class="nav-pane" id="navPane">${navInner(results)}</aside>
      <div class="feed-col">${body}</div>
    </div>`);
  observeCurrent();
}

// Keep the navigator in step with what you are reading.
function observeCurrent() {
  observer?.disconnect();
  const items = document.querySelectorAll('.feed-item[data-qi]');
  if (!items.length) return;
  observer = new IntersectionObserver(entries => {
    const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!hit) return;
    const qi = parseInt(hit.target.dataset.qi, 10);
    if (qi === state.idx) return;
    state.idx = qi;
    if (state.filter === 'all') saveProgress(state.currentFile, qi);
    const grid = document.getElementById('nvGrid');
    if (!grid) return;
    grid.querySelector('.is-current')?.classList.remove('is-current');
    const cell = grid.querySelector(`[data-i="${qi}"]`);
    if (cell) {
      cell.classList.add('is-current');
      grid.scrollTop = cell.offsetTop - grid.clientHeight / 2 + cell.clientHeight / 2;
    }
    const label = document.querySelector('.nav-toggle span');
    if (label && !state.queue) label.textContent = `Question ${qi + 1} of ${state.questions.length}`;
  }, { rootMargin: '-80px 0px -65% 0px' });
  items.forEach(el => observer.observe(el));
}

export function stopFeedObserver() {
  observer?.disconnect();
  observer = null;
}

export function scrollToFeedItem(qi) {
  document.getElementById(`fi-${qi}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function prevBadge(r) {
  if (!r) return '';
  const cls = r.ok === true ? 'ok' : r.ok === false ? 'miss' : 'seen';
  const txt = r.ok === true ? `You chose ${r.p}, it matched` : r.ok === false ? `You chose ${r.p}, it missed` : `You chose ${r.p}`;
  return `<span class="fi-prev ${cls}">${txt}</span>`;
}

function feedItem(q, qi, results, flags) {
  const st = getFeedState(qi);
  const answered = st.phase !== 'unanswered';
  const hasCons = !!q.consensus_answer;
  const consPct = hasCons && q.consensus_total
    ? Math.round(q.consensus_votes / q.consensus_total * 100) : 0;
  const qid = qidOf(q);
  const nk = noteKey(state.currentFile, qid);
  const itemNote = noteHtml(qid, loadNote(nk), hasNote(nk));
  const flagged = flags.has(qid);

  return `
  <article class="feed-item${answered ? ' fi-answered' : ''}" id="fi-${qi}" data-qi="${qi}">
    <header class="fi-head">
      <span class="q-badge">Question ${q.question_number}</span>
      ${topicHtml(q, 'fi-topic')}
      ${q.timestamp ? `<span class="fi-ts">${esc(q.timestamp)}</span>` : ''}
      ${prevBadge(results[qid])}
      <span class="sheet-tools">
        ${q.examtopics_url ? `<a class="qmeta-link" href="${esc(q.examtopics_url)}" target="_blank" rel="noopener">ExamTopics</a>` : ''}
        <button class="flag-btn${flagged ? ' on' : ''}" data-action="feed-flag" data-qi="${qi}" aria-pressed="${flagged}" title="Flag this question">${flagIcon}<span>Flag</span></button>
      </span>
    </header>

    ${caseBoxHtml(q)}
    <p class="fi-qtext">${esc(q.question)}</p>
    ${qImagesHtml(q)}

    <div class="fi-options">
      <div class="options">${optsHtml(q, `fo-${qi}-`)}</div>
    </div>

    <div class="fi-note">${itemNote}</div>

    <div class="fi-revealed" id="frev-${qi}" style="${answered ? '' : 'display:none'}">
      ${answered ? feedRevealedHtml(q, qi, consPct) : ''}
    </div>

    <footer class="fi-footer" id="ffoot-${qi}">
      ${answered
        ? `<button class="btn btn-disc" data-action="toggle-disc" data-qi="${qi}">Discussion (${q.comments.length})</button>`
        : `<span class="fi-hint">Pick an answer to reveal</span>`
      }
      <span class="fi-pill">${q.comments.length} comments</span>
    </footer>

    <div class="fi-disc" id="fdisc-${qi}"></div>
  </article>`;
}

function feedRevealedHtml(q, qi, consPct) {
  if (!q.consensus_answer) {
    return `<div class="no-consensus show">No clear community answer. Read the discussion.</div>`;
  }
  return `
    <div class="consensus-wrap show">
      <div class="clabel">
        <span>Community chose <strong>${q.consensus_answer}</strong></span>
        <span class="cvote-count">${q.consensus_votes} of ${q.consensus_total} votes</span>
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
  saveResult(state.currentFile, qidOf(q), letter, q.consensus_answer ? letter === q.consensus_answer : null);

  document.getElementById(`fi-${qi}`).classList.add('fi-answered');
  revealOptions(q, letter, `fo-${qi}-`);

  const rev = document.getElementById(`frev-${qi}`);
  rev.innerHTML = feedRevealedHtml(q, qi, consPct);
  rev.style.display = '';

  document.getElementById(`ffoot-${qi}`).innerHTML = `
    <button class="btn btn-disc" data-action="toggle-disc" data-qi="${qi}">Discussion (${q.comments.length})</button>
    <span class="fi-pill">${q.comments.length} comments</span>`;
  refreshNav();
}

export function toggleFlagFeed(qi) {
  const q = state.questions[qi];
  const on = toggleFlag(state.currentFile, qidOf(q));
  const btn = document.querySelector(`.flag-btn[data-qi="${qi}"]`);
  if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); }
  refreshNav();
}

export function toggleDiscFeedItem(qi) {
  const st = getFeedState(qi);
  const disc = document.getElementById(`fdisc-${qi}`);
  const foot = document.getElementById(`ffoot-${qi}`);
  const q = state.questions[qi];

  const discBtn = (label) => `
    <button class="btn ${label === 'Hide discussion' ? 'btn-ghost' : 'btn-disc'}" data-action="toggle-disc" data-qi="${qi}">${label === 'Hide discussion' ? label : `Discussion (${q.comments.length})`}</button>
    <span class="fi-pill">${q.comments.length} comments</span>`;

  if (st.phase === 'discussion') {
    st.phase = 'answered';
    disc.classList.remove('show');
    foot.innerHTML = discBtn('Discussion');
  } else {
    st.phase = 'discussion';
    if (!disc.dataset.rendered) {
      disc.innerHTML = `<div class="discussion show">${discHtml(q, `f${qi}-`)}</div>`;
      disc.dataset.rendered = '1';
    }
    disc.classList.add('show');
    foot.innerHTML = discBtn('Hide discussion');
  }
}
