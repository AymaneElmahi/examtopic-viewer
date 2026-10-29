import { state } from './state.js';
import { esc, setView, fmtName, dotsHtml, questionStatus } from './ui.js';
import { loadResults, summarize, loadLastFile } from './results.js';
import { loadProgress } from './progress.js';

const PLUS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

function booklet(file) {
  const data = state.library[file];
  const name = esc(fmtName(file));

  if (!Array.isArray(data)) {
    const why = data?.error ? esc(data.error) : 'The file could not be read.';
    return `
      <article class="booklet booklet-bad">
        <h2 class="bk-name">${name}</h2>
        <p class="bk-meta">Couldn't open this exam. ${why}</p>
      </article>`;
  }

  const results = loadResults(file);
  const { seen, ok, miss } = summarize(results);
  const decided = ok + miss;
  const total = data.length;
  const unseen = total - seen;
  const pos = Math.min(loadProgress(file), total - 1);
  const pct = decided ? Math.round(ok / decided * 100) : null;

  const meta = seen
    ? `${seen} of ${total} answered${pct !== null ? `, ${pct}% matched the community` : ''}`
    : `${total} questions, not started yet`;

  return `
    <article class="booklet">
      <header class="bk-head">
        <h2 class="bk-name">${name}</h2>
        <p class="bk-meta">${meta}</p>
      </header>
      ${dotsHtml(data.map(q => questionStatus(results, q)), '', { file })}
      <div class="bk-actions">
        <button class="btn btn-submit" data-action="open-exam" data-file="${esc(file)}" data-filter="all">
          ${seen ? `Continue at question ${pos + 1}` : 'Start studying'}
        </button>
        ${miss ? `<button class="btn" data-action="open-exam" data-file="${esc(file)}" data-filter="missed">Review ${miss} missed</button>` : ''}
        ${seen && unseen ? `<button class="btn" data-action="open-exam" data-file="${esc(file)}" data-filter="unseen">${unseen} not seen yet</button>` : ''}
        <button class="btn btn-ghost" data-action="open-exam" data-file="${esc(file)}" data-mode="exam">Mock exam</button>
      </div>
    </article>`;
}

export function renderLibrary() {
  document.getElementById('view').className = 'welcome-wrap';
  const files = state.files;
  const readable = files.filter(f => Array.isArray(state.library[f]));

  let seen = 0, ok = 0, miss = 0;
  const all = [];
  readable.forEach(f => {
    const results = loadResults(f);
    const s = summarize(results);
    seen += s.seen; ok += s.ok; miss += s.miss;
    state.library[f].forEach(q => all.push(questionStatus(results, q)));
  });
  const pct = ok + miss ? `${Math.round(ok / (ok + miss) * 100)}%` : '–';

  // Primary action: carry on where you last were, else start the first exam.
  const last = readable.includes(loadLastFile()) ? loadLastFile() : readable[0];
  let cta = '';
  if (last) {
    const lastSeen = summarize(loadResults(last)).seen;
    const pos = Math.min(loadProgress(last), state.library[last].length - 1);
    cta = `<button class="btn btn-submit lib-cta" data-action="open-exam" data-file="${esc(last)}" data-filter="all">
      ${lastSeen ? `Continue ${esc(fmtName(last))} at question ${pos + 1}` : `Start ${esc(fmtName(last))}`}
    </button>`;
  }

  setView(`
    <section class="lib-hero">
      <div class="lib-hero-text">
        <h1 class="lib-title">Your exams</h1>
        <p class="lib-sub">${seen
          ? `${seen} of ${all.length} questions answered across ${readable.length} exam${readable.length !== 1 ? 's' : ''}. Keep filling in the dots.`
          : 'Pick an exam and fill in your first dot. Each one is a question.'}</p>
        <dl class="lib-stats">
          <div><dt>Answered</dt><dd>${seen}</dd></div>
          <div><dt>Matched the community</dt><dd>${pct}</dd></div>
          <div><dt>To revisit</dt><dd>${miss}</dd></div>
        </dl>
        ${cta}
      </div>
      <div class="lib-sheet" aria-label="All your questions">
        ${dotsHtml(all, 'dots-hero')}
        <p class="lib-sheet-cap">${all.length} questions in ${readable.length} exam${readable.length !== 1 ? 's' : ''}</p>
      </div>
    </section>

    <section class="lib-grid">
      ${files.map(booklet).join('')}
      <button class="lib-add" data-action="show-download">${PLUS}<span>Add an exam from ExamTopics</span></button>
    </section>

    <p class="lib-foot">Unofficial study tool, not affiliated with ExamTopics or any certification provider. <button class="link-btn" data-action="show-about">About and disclaimer</button></p>
  `);
}
