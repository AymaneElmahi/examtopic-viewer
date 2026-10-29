import { esc } from './ui.js';

export const noteKey = (filename, qid) => `et-note-${filename}-${qid}`;

export function saveNote(key, text) {
  text.trim() ? localStorage.setItem(key, text) : localStorage.removeItem(key);
}

export function loadNote(key) {
  return localStorage.getItem(key) || '';
}

export function hasNote(key) {
  return !!localStorage.getItem(key);
}

export function noteIconHtml(has) {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="${has ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
}

export function noteHtml(qid, noteText, has) {
  return `
    <div class="note-widget">
      <button class="note-toggle${has ? ' has-note' : ''}" data-action="toggle-note" data-note-target="note-${qid}" data-note-qid="${qid}">
        ${noteIconHtml(has)} ${has ? 'Note' : 'Add note'}
      </button>
      <div id="note-${qid}" class="note-body" style="display:none">
        <textarea class="note-textarea" data-note-qid="${qid}" placeholder="Write your notes here…" rows="3">${esc(noteText)}</textarea>
      </div>
    </div>`;
}
