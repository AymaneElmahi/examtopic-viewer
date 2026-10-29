import { state } from './state.js';
import { esc } from './ui.js';

// Case studies and exams inside a file: labels, renames and the pasted case study text.
const namesKey = f => `et-groups-${f}`;
const caseKey = (f, k) => `et-case-${f}-${k}`;

export const groupKey = q => `${q.exam_slug || ''}|${q.group_topic}`;

function readNames() {
  try { return JSON.parse(localStorage.getItem(namesKey(state.currentFile)) || '{}'); }
  catch { return {}; }
}

// The group's display name: your rename, else the name found in the questions, else "Case study N" / "Topic N".
export function groupLabel(q) {
  if (!q.group_kind) return null;
  return readNames()[groupKey(q)] || q.group_name
    || (q.group_kind === 'case_study' ? `Case study ${q.group_topic}` : `Topic ${q.group_topic}`);
}

export function renameGroup(q, name) {
  const names = readNames();
  const key = groupKey(q);
  if (name) names[key] = name; else delete names[key];
  localStorage.setItem(namesKey(state.currentFile), JSON.stringify(names));
}

export function groupChipText(q) {
  const label = groupLabel(q);
  if (!label) return '';
  return q.group_kind === 'case_study' && !/case study/i.test(label) ? `Case study: ${label}` : label;
}

// Small labels shown next to a question: its exam (when a file holds several) and its group.
export function topicHtml(q, cls = 'qmeta-label') {
  const parts = [];
  if (q.multi_exam && q.exam_name) parts.push(`<span class="${cls} chip-exam">${esc(q.exam_name)}</span>`);
  if (q.group_kind) parts.push(`<span class="${cls} chip-group" data-gk="${esc(groupKey(q))}">${esc(groupChipText(q))}</span>`);
  return parts.join('');
}

export const hasSections = () => state.questions.some(q => q.multi_exam || q.group_kind);

// Heading for the navigator: which section of the exam a question belongs to.
export function sectionOf(q) {
  if (q.group_kind) {
    const label = groupLabel(q);
    return { key: groupKey(q), title: q.multi_exam ? `${q.exam_name} · ${label}` : label, renamable: true };
  }
  return { key: `${q.exam_slug || ''}|base`, title: q.multi_exam ? q.exam_name : 'Questions', renamable: false };
}

// ── Case study text (pasted by the user, kept in this browser) ──
export const loadCaseText = q => localStorage.getItem(caseKey(state.currentFile, groupKey(q))) || '';

export function saveCaseText(key, text) {
  const k = caseKey(state.currentFile, key);
  text.trim() ? localStorage.setItem(k, text) : localStorage.removeItem(k);
}

export function caseBoxHtml(q) {
  if (q.group_kind !== 'case_study') return '';
  const label = groupLabel(q);
  const text = loadCaseText(q);
  const named = !/^Case study \d+$/.test(label);
  const search = named
    ? `<a class="case-search" href="https://www.google.com/search?q=${encodeURIComponent(`${label} case study`)}" target="_blank" rel="noopener">Search for the official text</a>`
    : '';
  return `
    <details class="case-box" data-gk="${esc(groupKey(q))}"${text ? ' open' : ''}>
      <summary>
        <span class="case-title">${esc(label)}</span>
        <span class="case-state">${text ? 'Text saved' : 'Text not added'}</span>
      </summary>
      <div class="case-body">
        ${text ? '' : `<p class="case-help">Questions in this group refer to a case study that is not part of the exam file. Paste its text here to read it next to the questions. It stays on your computer.</p>`}
        <textarea class="case-textarea" data-case-key="${esc(groupKey(q))}" rows="${text ? 9 : 5}" placeholder="Paste the case study text here">${esc(text)}</textarea>
        ${search}
      </div>
    </details>`;
}
