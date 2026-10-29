import { state } from './state.js';
import { qidOf } from './results.js';

export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function setView(html) {
  document.getElementById('view').innerHTML = html;
}

export function fmtName(filename) {
  const special = { devops: 'DevOps', gcp: 'GCP', ai: 'AI', ml: 'ML' };
  return filename
    .replace(/\.md$/i, '')
    .split('-')
    .map(w => special[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Community votes per answer letter, most voted first.
export function voteSplit(q) {
  const counts = {};
  q.comments.forEach(c => {
    if (c.selected_answer) counts[c.selected_answer] = (counts[c.selected_answer] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([letter, n]) => ({ letter, n }));
}

export function topComment(q) {
  let topC = null, topI = -1;
  q.comments.forEach((c, i) => {
    if (!topC || c.upvotes > topC.upvotes) { topC = c; topI = i; }
  });
  return { topC, rest: q.comments.filter((_, i) => i !== topI) };
}

// Exhibit images that belong to the question itself (a Dockerfile, a stack trace, a diagram).
export function qImagesHtml(q) {
  return (q.question_images || []).length
    ? `<div class="q-imgs">${q.question_images.map((u, i) => `<img class="q-img" src="${esc(u)}" alt="Exhibit ${i + 1}" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>`
    : '';
}

// An option's content: its text, or its image for questions whose options are pictures.
export function optInner(q, l, text) {
  const img = q.option_images?.[l];
  return img
    ? `<img class="opt-img" src="${esc(img)}" alt="Option ${l} (image)" loading="lazy" referrerpolicy="no-referrer">`
    : esc(text);
}

export function optsHtml(q, idPrefix = 'o-') {
  return Object.entries(q.options).map(([l, t]) => `
    <div class="option" id="${idPrefix}${l}" data-l="${l}" role="button" tabindex="0">
      <span class="obubble">${l}</span>
      <span class="otext"><span class="otext-in">${optInner(q, l, t)}</span></span>
    </div>`).join('');
}

export function revealOptions(q, picked, idPrefix) {
  Object.keys(q.options).forEach(l => {
    const el = document.getElementById(`${idPrefix}${l}`);
    if (!el) return;
    el.classList.add('locked');
    if (l === picked) el.classList.add('picked');
    if (l === q.consensus_answer) el.classList.add('correct');
    else if (l === picked) el.classList.add('wrong');
  });
}

export function commentHtml(c, isTop) {
  return `
    <div class="comment ${isTop ? 'top' : 'reg'}">
      <div class="cmeta">
        <span class="cuser">${esc(c.username)}</span>
        ${c.badge === 'Highly Voted' ? '<span class="cbadge cbadge-voted">Top voted</span>' : ''}
        ${c.badge === 'Most Recent' ? '<span class="cbadge cbadge-recent">Recent</span>' : ''}
        <span class="cage">${esc(c.age)}</span>
        ${c.upvotes ? `<span class="cvotes">▲ ${c.upvotes}</span>` : ''}
      </div>
      ${c.selected_answer ? `<div class="csel">Answered ${c.selected_answer}</div>` : ''}
      <div class="ctext">${esc(c.text)}</div>
    </div>`;
}

export function discHtml(q, prefix) {
  const { topC, rest } = topComment(q);
  const listId = `${prefix}more`;
  const btnId = `${prefix}smBtn`;
  return `
    <div class="disc-header">
      <span>Discussion</span>
      <span class="disc-count">${q.comments.length} comment${q.comments.length !== 1 ? 's' : ''}</span>
    </div>
    ${topC ? commentHtml(topC, true) : '<p class="no-comments">No comments for this question.</p>'}
    ${rest.length ? `
      <button class="show-more" id="${btnId}"
        data-action="show-more" data-list="${listId}" data-count="${rest.length}">
        Show ${rest.length} more comment${rest.length !== 1 ? 's' : ''}
      </button>
      <div class="more-comments" id="${listId}">
        ${rest.map(c => commentHtml(c, false)).join('')}
      </div>` : ''}`;
}

// Two-step button: first click arms it (label changes), a second click within 4s confirms.
export function confirmClick(btn, armedLabel) {
  if (btn.dataset.armed === '1') { btn.dataset.armed = ''; return true; }
  const original = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = armedLabel;
  setTimeout(() => {
    if (btn.isConnected && btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = original; }
  }, 4000);
  return false;
}

// 'ok' (matched the community) | 'miss' | 'seen' (answered, no community answer) | 'none'
export function questionStatus(results, q) {
  const r = results[qidOf(q)];
  if (!r) return 'none';
  return r.ok === true ? 'ok' : r.ok === false ? 'miss' : 'seen';
}

const DOT_LABEL = { ok: 'matched the community', miss: 'missed', seen: 'answered', none: 'not answered yet' };

// One dot per question: a filled-in answer sheet. With `link`, each dot opens that question.
export function dotsHtml(statuses, cls = '', link = null) {
  const dots = statuses.map((st, i) => {
    const style = `style="--i:${Math.min(i, 400)}"`;
    if (!link) return `<i class="dot d-${st}" ${style}></i>`;
    const label = `Question ${i + 1}, ${DOT_LABEL[st]}`;
    return `<button class="dot d-${st}" ${style} data-action="open-q" data-file="${esc(link.file)}" data-i="${i}" aria-label="${label}" title="${label}"></button>`;
  }).join('');
  return `<div class="dots ${cls}"${link ? '' : ' aria-hidden="true"'}>${dots}</div>`;
}

export const flagIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>`;
