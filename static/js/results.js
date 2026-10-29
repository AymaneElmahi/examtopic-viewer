// Per-question results (what you picked, and whether it matched the community answer).
// Stored per exam file: { [qid]: { p: 'C', ok: true | false | null } }  — ok is null when the community had no consensus.
const rkey = f => `et-res-${f}`;
const mkey = f => `et-meta-${f}`;

// Stable id from the server (includes the exam when a file holds several), with the old form as fallback.
export const qidOf = q => q.uid ?? `${q.topic}-${q.question_number}`;

export function loadResults(filename) {
  try { return JSON.parse(localStorage.getItem(rkey(filename)) || '{}'); }
  catch { return {}; }
}

export function saveResult(filename, qid, picked, ok) {
  if (!filename) return;
  const r = loadResults(filename);
  r[qid] = { p: picked, ok };
  localStorage.setItem(rkey(filename), JSON.stringify(r));
}

export function clearResults(filename) {
  localStorage.removeItem(rkey(filename));
}

export function summarize(results) {
  let ok = 0, miss = 0, seen = 0;
  for (const v of Object.values(results)) {
    seen++;
    if (v.ok === true) ok++;
    else if (v.ok === false) miss++;
  }
  return { seen, ok, miss };
}

// Flagged questions, per exam file: array of qids.
const fkey = f => `et-flags-${f}`;

export function loadFlags(filename) {
  try { return new Set(JSON.parse(localStorage.getItem(fkey(filename)) || '[]')); }
  catch { return new Set(); }
}

export function toggleFlag(filename, qid) {
  const flags = loadFlags(filename);
  const on = !flags.has(qid);
  on ? flags.add(qid) : flags.delete(qid);
  localStorage.setItem(fkey(filename), JSON.stringify([...flags]));
  return on;
}

const LAST_KEY = 'et-last-file';
export const saveLastFile = f => localStorage.setItem(LAST_KEY, f);
export const loadLastFile = () => localStorage.getItem(LAST_KEY) || '';
