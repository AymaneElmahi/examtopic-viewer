import { state } from './state.js';

export function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function setView(html) {
  document.getElementById('view').innerHTML = html;
}

export function topComment(q) {
  let topC = null, topI = -1;
  q.comments.forEach((c, i) => {
    if (!topC || c.upvotes > topC.upvotes) { topC = c; topI = i; }
  });
  return { topC, rest: q.comments.filter((_, i) => i !== topI) };
}

export function optsHtml(q, idPrefix = 'o-') {
  return Object.entries(q.options).map(([l, t]) => `
    <div class="option" id="${idPrefix}${l}" data-l="${l}">
      <div class="oletter">${l}</div>
      <div class="otext">${esc(t)}</div>
    </div>`).join('');
}

export function revealOptions(q, picked, idPrefix) {
  Object.keys(q.options).forEach(l => {
    const el = document.getElementById(`${idPrefix}${l}`);
    if (!el) return;
    el.classList.add('locked');
    if (l === q.consensus_answer) el.classList.add('correct');
    else if (l === picked) el.classList.add('wrong');
  });
}

export function commentHtml(c, isTop) {
  return `
    <div class="comment ${isTop ? 'top' : 'reg'}">
      <div class="cmeta">
        <span class="cuser">${esc(c.username)}</span>
        ${c.badge === 'Highly Voted' ? '<span class="cbadge cbadge-voted">Top</span>' : ''}
        ${c.badge === 'Most Recent' ? '<span class="cbadge cbadge-recent">Recent</span>' : ''}
        <span class="cage">${esc(c.age)}</span>
        <span class="cvotes">▲ ${c.upvotes}</span>
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
    ${topC ? commentHtml(topC, true) : '<p class="no-comments">No comments available.</p>'}
    ${rest.length ? `
      <button class="show-more" id="${btnId}"
        data-action="show-more" data-list="${listId}" data-count="${rest.length}">
        Show ${rest.length} more comment${rest.length !== 1 ? 's' : ''}
      </button>
      <div class="more-comments" id="${listId}">
        ${rest.map(c => commentHtml(c, false)).join('')}
      </div>` : ''}`;
}
