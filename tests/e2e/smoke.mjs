// End-to-end smoke test: drives a real Chrome through every screen of the app.
//
//   BASE=http://localhost:7654 node tests/e2e/smoke.mjs
//
// Needs the server running, at least 2 exam files in exams/, and Chrome
// (override the binary with CHROME=...). Uses a throwaway browser profile,
// so your own progress is never touched.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://localhost:7654';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9500 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'et-e2e-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60 && !targets?.length; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); }
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));

let msgId = 0;
const pending = new Map();
const problems = [];       // JS errors and bad network responses
const networkFailures = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text}`);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push(`console.error: ${d.params.args.map(a => a.value ?? a.description).join(' ')}`);
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && d.params.response.url.startsWith(BASE)) problems.push(`HTTP ${d.params.response.status}: ${d.params.response.url}`);
  if (d.method === 'Network.loadingFailed' && !d.params.canceled && !d.params.blockedReason) networkFailures.push(d.requestId);
};
const send = (method, params = {}) => new Promise(r => { const i = ++msgId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(`eval failed: ${expr}\n${r.result.exceptionDetails.exception?.description}`);
  return r.result.result.value;
};
const waitFor = async (expr, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await ev(expr)) return true; } catch { /* page navigating */ }
    await sleep(60);
  }
  return false;
};
const click = sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element: ' + ${JSON.stringify(sel)}); e.click(); return true; })()`);
// A real mouse click (moves focus like a user would), unlike element.click().
const realClick = async sel => {
  const r = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no element: ' + ${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await sleep(120);
};
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const text = sel => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
const key = async (k, shift = false) => {
  const base = { key: k, code: k.length === 1 ? `Key${k.toUpperCase()}` : k, modifiers: shift ? 8 : 0 };
  const vk = { ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 }[k] ?? k.toUpperCase().charCodeAt(0);
  const text = k.length === 1 ? k : k === 'Enter' ? '\r' : undefined;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base, windowsVirtualKeyCode: vk });
  await sleep(80);
};
const qnum = () => text('.qnum');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok    ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`); }
};
const section = name => console.log(`\n${name}`);

const overflow = () => ev(`(() => {
  const w = innerWidth, bad = [];
  document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.right > w + 1 && getComputedStyle(e).position !== 'fixed') bad.push(e.className || e.tagName); });
  return { sw: document.documentElement.scrollWidth, w, bad: [...new Set(bad)].slice(0, 5) };
})()`);
const noOverflow = async name => {
  const o = await overflow();
  check(`${name}: no horizontal overflow`, o.sw <= o.w + 1, `scrollWidth ${o.sw} > ${o.w}; ${o.bad.join(', ')}`);
};

const reload = async () => { await send('Page.reload'); await sleep(300); await waitFor(`document.readyState === 'complete' && document.querySelector('.lib-title, .state-error, .state-empty')`); };
const viewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
const resultsCount = () => ev(`Object.keys(JSON.parse(localStorage.getItem('et-res-professional-data-engineer.md') || '{}')).length`);

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }); // headless pages otherwise never fire blur
  await viewport(1360, 880);
  await send('Page.navigate', { url: BASE });
  await waitFor(`document.querySelector('.booklet, .state-error')`, 8000);

  // ── First run ────────────────────────────────────────
  section('First run and disclaimer');
  check('a fresh browser sees the disclaimer', await waitFor(`document.querySelector('dialog.about[open]')`));
  check('it says who is not affiliated', /not affiliated/.test(await text('dialog.about')));
  await key('Escape');
  check('Escape does not dismiss it on first run', (await count('dialog.about[open]')) === 1);
  await click('[data-about="ok"]');
  check('"I understand" closes it', await waitFor(`!document.querySelector('dialog.about')`));
  await reload();
  await sleep(300);
  check('it does not come back after acknowledging', (await count('dialog.about')) === 0);
  await click('[data-action="show-about"]');
  check('About reopens it from the library footer', await waitFor(`document.querySelector('dialog.about[open]')`));
  await key('Escape');
  check('and Escape closes it this time', await waitFor(`!document.querySelector('dialog.about')`));

  // ── Library ──────────────────────────────────────────
  section('Library');
  const booklets = await count('.booklet');
  check('shows one booklet per exam file', booklets >= 2, `${booklets} booklets`);
  check('first exam has 339 dots', await ev(`document.querySelector('.booklet').querySelectorAll('.dot').length`) === 339);
  check('study controls are hidden on the library', await ev(`['.tabs', '.jump-wrap', '.file-select'].every(s => getComputedStyle(document.querySelector(s)).display === 'none')`));
  check('hero shows three stats', await count('.lib-stats dd') === 3);
  check('hero sheet has a dot for every question of every exam', await count('.lib-hero .dot') === await ev(`[...document.querySelectorAll('.booklet')].reduce((n, b) => n + b.querySelectorAll('.dot').length, 0)`));
  check('exams fill the width in a grid (no empty sides)', await ev(`(() => { const g = document.querySelector('.lib-grid').getBoundingClientRect(); const w = innerWidth; return g.width > w * 0.6; })()`));
  await noOverflow('library');
  await click('.booklet [data-action="open-q"][data-i="49"]');
  check('clicking a dot opens that question', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 50'`));
  await ev(`localStorage.removeItem('et-pos-professional-data-engineer.md')`);
  await click('.logo');
  await waitFor(`document.querySelector('.lib-title')`);

  // ── Cards ────────────────────────────────────────────
  section('Cards');
  await click('[data-action="open-exam"][data-filter="all"]');
  check('opens the study view', await waitFor(`document.querySelector('.study .sheet')`));
  check('tabs are back, library controls shown', await ev(`getComputedStyle(document.querySelector('.tabs')).display !== 'none'`));
  check('navigator has one cell per question', await count('#navPane .nv-cell') === 339);
  check('starts at question 1', (await qnum()) === 'Question 1');
  check('community column is idle before answering', (await text('.margin-idle')) !== null);

  await realClick('.option[data-l="B"]');
  check('clicking an answer reveals the community verdict', await waitFor(`document.querySelector('.verdict-line, .verdict-none')`));
  check('picked option is marked', await count('.option.picked') === 1);
  check('result is saved', await resultsCount() === 1);
  check('navigator cell turns matched/missed', await ev(`/is-(ok|miss)/.test(document.querySelector('.nv-cell.is-current').className)`));

  await key('ArrowRight');
  check('→ moves to question 2 (focus was on the clicked option)', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 2'`));
  await key('a');
  check('letter key answers', await waitFor(`document.querySelector('.option.picked')`));
  await key('Enter');
  check('Enter moves to the next question after answering', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 3'`));
  await key('Enter');
  check('Enter does nothing before answering', (await qnum()) === 'Question 3');
  await key('ArrowLeft');
  check('← goes back', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 2'`));
  check('previously answered question starts fresh but remembers the pick', /Last time you chose A/.test(await text('.margin-idle')));

  await key('ArrowRight'); await key('ArrowRight');
  await key('F', true);
  check('Shift+F flags the question', await ev(`document.getElementById('flagBtn').getAttribute('aria-pressed') === 'true'`));
  check('Flagged filter shows 1', (await ev(`document.querySelector('[data-f="flagged"] span').textContent`)) === '1');

  await click('[data-f="flagged"]');
  check('flagged filter lists 1 question', await waitFor(`document.querySelectorAll('#navPane .nv-cell').length === 1`));
  await key('F', true);
  check('unflagging keeps the question visible until you change filter', await count('#navPane .nv-cell') === 1);
  await click('[data-f="missed"]');
  const missedExpected = await ev(`Object.values(JSON.parse(localStorage.getItem('et-res-professional-data-engineer.md'))).filter(r => r.ok === false).length`);
  check('missed filter matches saved misses', await waitFor(`document.querySelectorAll('#navPane .nv-cell').length === ${missedExpected}`), `expected ${missedExpected}`);
  await click('[data-f="all"]');
  check('All restores the full list', await waitFor(`document.querySelectorAll('#navPane .nv-cell').length === 339`));

  await click('[data-action="goto"][data-i="49"]');
  check('clicking a navigator cell jumps there', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 50'`));
  const before = await resultsCount();
  await click('[data-action="reveal"]');
  check('"Just show me the answer" reveals without recording', await waitFor(`document.querySelector('.option.correct')`) && (await resultsCount()) === before);

  await ev(`(() => { const i = document.getElementById('jumpInput'); i.value = '100'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  check('Go to jumps to a question', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 100'`));

  await ev(`(() => { const b = document.createElement('button'); b.dataset.action = 'filter'; b.dataset.f = 'flagged'; document.getElementById('view').appendChild(b); b.click(); })()`);
  check('empty filter shows a helpful message', await waitFor(`document.querySelector('.sheet-empty')`) && /not flagged/.test(await text('.sheet-empty')));
  await key('a');
  check('typing a letter on the empty state does not break', (await count('.sheet-empty')) === 1);
  await click('.sheet-empty [data-f="all"]');
  check('"Show all questions" recovers', await waitFor(`document.querySelector('.sheet:not(.sheet-empty) .qtext')`));

  // ── Persistence ──────────────────────────────────────
  section('Persistence');
  await click('[data-f="missed"]');
  await reload();
  const meta = await text('.booklet .bk-meta');
  check('library remembers progress', /answered/.test(meta), meta);
  check('library dots reflect results', await ev(`document.querySelectorAll('.booklet .d-ok, .booklet .d-miss').length > 0`));
  check('Continue goes to the saved question', /Continue at question 100/.test(await text('.booklet .btn-submit')));
  const reviewBtn = await ev(`!!document.querySelector('[data-filter="missed"]')`);
  check('library offers "Review N missed"', reviewBtn);
  if (reviewBtn) {
    await click('[data-filter="missed"]');
    check('opens directly on the missed list', await waitFor(`document.querySelector('.seg-btn.on')?.dataset.f === 'missed'`));
    await click('[data-f="all"]');
  }

  // ── Feed ─────────────────────────────────────────────
  section('Feed');
  await click('#btnFeed');
  check('feed lists every question', await waitFor(`document.querySelectorAll('.feed-item').length === 339`));
  await click('.feed-item .option');
  check('answering in the feed reveals the community answer', await waitFor(`document.querySelector('.fi-answered .consensus-wrap, .fi-answered .no-consensus')`));
  await click('[data-action="toggle-disc"]');
  check('feed discussion opens', await waitFor(`document.querySelector('.fi-disc.show')`));
  check('feed has a navigator with every question', await count('#navPane .nv-cell') === 339);
  check('feed shows how you did before on answered questions', await count('.fi-prev') > 0);
  await click('[data-action="feed-goto"][data-i="200"]');
  check('navigator follows the feed as you scroll', await waitFor(`Math.abs(+document.querySelector('.nv-cell.is-current').dataset.i - 200) <= 2`, 6000));
  const flagsBefore = await ev(`+document.querySelector('[data-f="flagged"] span').textContent`);
  await click('.feed-item [data-action="feed-flag"]');
  check('flagging in the feed updates the counts', await waitFor(`+document.querySelector('[data-f="flagged"] span').textContent === ${flagsBefore + 1}`));
  const missedNow = await ev(`Object.values(JSON.parse(localStorage.getItem('et-res-professional-data-engineer.md') || '{}')).filter(r => r.ok === false).length`);
  if (missedNow) {
    await click('[data-f="missed"]');
    check('feed can show only missed questions', await waitFor(`document.querySelectorAll('.feed-item').length === ${missedNow}`));
    await click('[data-f="all"]');
    check('and back to all', await waitFor(`document.querySelectorAll('.feed-item').length === 339`));
  }
  await noOverflow('feed');
  await click('#btnCards');
  check('back to cards after the feed', await waitFor(`document.querySelector('.study .sheet')`));
  await key('a');
  check('keyboard still works after switching modes', await waitFor(`document.querySelector('.option.picked')`));

  // ── Mock exam ────────────────────────────────────────
  section('Mock exam');
  await click('#btnExam');
  check('exam ready screen', await waitFor(`document.querySelector('.exam-ready')`) && (await text('.exam-stat-val')) === '55');
  await click('[data-action="exam-start"]');
  check('exam starts with a 55-cell palette', await waitFor(`document.querySelectorAll('#navPane .nv-cell').length === 55`));
  for (let i = 0; i < 25; i++) { await key('a'); await key('ArrowRight'); }
  check('answered questions are marked in the palette', await count('#navPane .nv-cell.is-answered') === 25);
  await key('F', true);
  check('flagging marks the palette', await count('#navPane .nv-cell.is-flagged') === 1);
  const t1 = await text('.exam-clock');
  await sleep(2200);
  check('timer is ticking', (await text('.exam-clock')) !== t1);
  await click('[data-action="exam-jump"][data-qi="9"]');
  check('palette jumps to a question', await waitFor(`document.querySelector('.qnum')?.textContent.includes('Question 10 of 55')`));
  check('earlier answer is still selected', await count('.exam-opt-selected[data-l="A"]') === 1);
  await key('a');
  check('picking the same answer again clears it', await count('.exam-opt-selected') === 0 && await count('#navPane .nv-cell.is-answered') === 24);
  await key('a');

  await click('#navPane [data-action="exam-submit"]');
  check('first Submit click only asks to confirm', /unanswered/.test(await text('#navPane [data-action="exam-submit"]')) && (await count('.exam-results')) === 0);
  await click('#navPane [data-action="exam-submit"]');
  check('second click submits', await waitFor(`document.querySelector('.exam-results')`));
  check('score is shown', /\d+%/.test(await text('.exam-score-pct')));
  check('results map has one dot per question', await count('.exam-score-card .dot') === 55);
  const needs = await count('.exam-result-item');
  check('results default to missed and skipped', needs >= 30, `${needs} items`);
  await click('[data-action="exam-rfilter"][data-f="all"]');
  check('"All" shows all 55', await waitFor(`document.querySelectorAll('.exam-result-item').length === 55`));
  check('score saved to history', await ev(`JSON.parse(localStorage.getItem('et-history') || '[]').length === 1`));
  check('exam answers feed the question results', (await resultsCount()) > 20);
  await click('[data-action="exam-retake"]');
  check('retake returns to the ready screen', await waitFor(`document.querySelector('.exam-ready')`));

  await click('[data-action="exam-start"]');
  await waitFor(`document.querySelector('.study-exam')`);
  for (let i = 0; i < 4; i++) { await key('b'); await key('ArrowRight'); }
  await click('[data-action="exam-pause"]');
  check('pause hides the questions', await waitFor(`document.querySelector('.exam-paused')`) && (await count('.qtext')) === 0);
  await click('#btnHistory');
  check('history opens while paused', await waitFor(`document.querySelector('.hist-panel')`));
  await click('#btnExam');
  check('Exam tab returns to the paused exam', await waitFor(`document.querySelector('.exam-paused')`));
  await click('[data-action="exam-resume"]');
  check('resume continues with answers intact', await waitFor(`document.querySelectorAll('#navPane .nv-cell.is-answered').length === 4`));

  await reload();
  await click('[data-action="open-exam"][data-mode="exam"]');
  check('reload offers to resume the exam', await waitFor(`document.querySelector('.exam-ready')`) && /Resume your exam/.test(await text('.exam-ready-title')));
  await click('[data-action="exam-resume-saved"]');
  check('resumed exam keeps answers', await waitFor(`document.querySelectorAll('#navPane .nv-cell.is-answered').length === 4`));

  await ev(`(() => { const s = document.getElementById('fileSelect'); s.value = s.options[1].value; s.dispatchEvent(new Event('change')); })()`);
  check('switching exam file while in exam mode stays in exam mode', await waitFor(`document.querySelector('.exam-ready')`) && (await count('.feed-item')) === 0);

  await click('[data-action="exam-start"]');
  await waitFor(`document.querySelector('.study-exam')`);
  await click('[data-action="exam-pause"]');
  await waitFor(`document.querySelector('.exam-paused')`);
  await click('[data-action="exam-abandon"]');
  check('abandon asks for confirmation first', (await count('.exam-paused')) === 1);
  await click('[data-action="exam-abandon"]');
  check('second click abandons', await waitFor(`document.querySelector('.exam-ready')`));

  // ── Case studies and multi-exam files ────────────────
  section('Case studies and exams');
  await click('.logo');
  await waitFor(`document.querySelector('.lib-title')`);
  const hasArchitect = await ev(`!!document.querySelector('[data-file="google-architect.md"]')`);
  if (hasArchitect) {
    const api = file => ev(`fetch('/api/questions?file=${file}').then(r => r.json())`);
    const qs = await api('google-architect.md');
    await click('[data-action="open-exam"][data-file="google-architect.md"][data-filter="all"]');
    await waitFor(`document.querySelector('.study .sheet')`);
    check('questions come in order (not the file order)', ((await ev(`window.__q = null; document.querySelector('.qnum').textContent.trim()`)) === 'Question 1'));
    // A filter is a temporary lens: leaving it must bring you back to where you were.
    await click('[data-action="goto"][data-i="10"]');
    await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 11'`);
    await click('[data-f="cases"]');
    check('the case studies filter shows a way back', await waitFor(`/Back to question 11/.test(document.querySelector('.nv-back')?.textContent || '')`));
    check('entering the filter did not overwrite your place', (await ev(`localStorage.getItem('et-pos-google-architect.md')`)) !== null && (await ev(`localStorage.getItem('et-pos-google-architect.md')`)) === '10');
    await click('.nv-back');
    check('going back returns to the question you were on', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 11'`) && (await count('#navPane .nv-cell')) === qs.length);
    check('and keeps your saved position', (await ev(`localStorage.getItem('et-pos-google-architect.md')`)) === '10');
    const groups = new Set(qs.filter(q => q.group_kind).map(q => q.group_topic)).size;
    check('navigator has a heading for the questions and each case study', await count('.nv-group') === groups + 1, `${await count('.nv-group')} headings, ${groups} groups`);
    const cases = qs.filter(q => q.group_kind === 'case_study').length;
    check('"Case studies" filter shows the right count', (await ev(`document.querySelector('[data-f="cases"] span').textContent`)) === String(cases));
    await click('[data-f="cases"]');
    check('filter lists only case study questions', await waitFor(`document.querySelectorAll('#navPane .nv-cell').length === ${cases}`));
    check('case study questions show a case study label', await count('.sheet .chip-group') === 1);
    check('and a box for the case study text', await count('.case-box') === 1);
    const open = () => ev(`document.querySelector('.case-box').open`);
    const was = await open();
    await click('.case-box summary');
    check('the case study box opens', (await open()) === !was);
    await click('.case-box summary');
    check('and closes again', (await open()) === was);

    await click('.case-box summary');
    await ev(`(() => { const t = document.querySelector('.case-textarea'); t.focus(); t.value = 'Company overview: test text'; t.blur(); })()`);
    check('pasting the case study text saves it', await ev(`document.querySelector('.case-state').textContent === 'Text saved'`));
    await key('ArrowRight');
    await waitFor(`document.querySelector('.case-textarea')`);
    check('the text is still there on the next question of the same group', (await ev(`document.querySelector('.case-textarea').value`)) === 'Company overview: test text');

    await click('.nv-rename');
    check('rename turns the heading into a field', await waitFor(`document.querySelector('.nv-rename-input')`));
    await ev(`(() => { const i = document.querySelector('.nv-rename-input'); i.value = 'My renamed study'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
    check('renaming updates the heading and the question label', await waitFor(`[...document.querySelectorAll('.nv-group-title')].some(e => e.textContent === 'My renamed study')`) && /My renamed study/.test(await text('.sheet .chip-group')));
    await reload();
    await click('[data-action="open-exam"][data-file="google-architect.md"][data-filter="all"]');
    await waitFor(`document.querySelector('.study .sheet')`);
    check('renames survive a reload', await ev(`[...document.querySelectorAll('.nv-group-title')].some(e => e.textContent === 'My renamed study')`));

    const longIdx = qs.findIndex(q => q.question.includes('\n') && /refer to the/.test(q.question));
    await click('[data-f="all"]');
    if (longIdx >= 0) {
      await click(`[data-action="goto"][data-i="${longIdx}"]`);
      await waitFor(`document.querySelector('.qtext')`);
      check('the whole question is shown, not just its last line', await ev(`document.querySelector('.qtext').textContent.includes('refer to the')`));
    }
    const exhIdx = qs.findIndex(q => (q.question_images || []).length);
    if (exhIdx >= 0) {
      await click(`[data-action="goto"][data-i="${exhIdx}"]`);
      check('exhibit images show as images, not as raw links', await waitFor(`document.querySelectorAll('.q-img').length >= 1`) && await ev(`!/examtopics\\.com\\/assets/.test(document.querySelector('.qtext').textContent)`));
    }
    const imgIdx = qs.findIndex(q => Object.keys(q.option_images || {}).length);
    check('image-option questions are no longer dropped', imgIdx >= 0);
    await click('[data-f="all"]');
    await click(`[data-action="goto"][data-i="${imgIdx}"]`);
    check('their options show as images', await waitFor(`document.querySelectorAll('.option .opt-img').length >= 2`));
    await noOverflow('architect cards');
  }
  const hasAssociate = await ev(`!!document.querySelector('[data-file="google-associate.md"]')`);
  if (hasAssociate) {
    await click('.logo');
    await waitFor(`document.querySelector('.lib-title')`);
    await click('[data-action="open-exam"][data-file="google-associate.md"][data-filter="all"]');
    await waitFor(`document.querySelector('.study .sheet')`);
    check('a file with two exams gets a heading per exam', await count('.nv-group') === 2);
    check('each question names its exam', await count('.sheet .chip-exam') === 1);
    const before = await ev(`Object.keys(JSON.parse(localStorage.getItem('et-res-google-associate.md') || '{}')).length`);
    await key('a');
    await sleep(200);
    check('answering one question marks only one question (ids no longer collide)', (await ev(`Object.keys(JSON.parse(localStorage.getItem('et-res-google-associate.md') || '{}')).length`)) === before + 1);
    check('and exactly one navigator cell is marked', await ev(`document.querySelectorAll('#navPane .nv-cell.is-ok, #navPane .nv-cell.is-miss, #navPane .nv-cell.is-seen').length`) === 1);
  }

  // ── Navigation & chrome ──────────────────────────────
  section('Navigation');
  await click('#btnHistory');
  check('history view', await waitFor(`document.querySelector('.hist-panel')`));
  await noOverflow('history');
  await click('#btnCards');
  check('Cards tab leaves history', await waitFor(`document.querySelector('.study .sheet')`));
  await click('#btnDownload');
  check('add-exam panel', await waitFor(`document.querySelector('.dl-panel')`));
  await noOverflow('download');
  await ev(`(() => { document.getElementById('dlQuery').value = 'bad/query'; document.getElementById('dlStart').click(); })()`);
  check('a bad exam name shows a clear message (not "lost connection")', await waitFor(`/letters, numbers/.test(document.querySelector('.dl-log-error')?.textContent || '')`));
  await click('#btnFeed');
  check('Feed tab leaves the download panel', await waitFor(`document.querySelector('.feed-item')`));
  await click('.logo');
  check('logo goes back to the library', await waitFor(`document.querySelector('.lib-title')`));

  const theme0 = await ev(`document.documentElement.dataset.theme`);
  await click('#themeToggle');
  check('theme toggles', (await ev(`document.documentElement.dataset.theme`)) !== theme0);
  await reload();
  check('theme persists across reloads', (await ev(`document.documentElement.dataset.theme`)) !== theme0);
  await click('#themeToggle');

  // ── Reset ────────────────────────────────────────────
  section('Reset progress');
  await click('[data-action="open-exam"][data-file="professional-data-engineer.md"][data-filter="all"]');
  await waitFor(`document.querySelector('.study .sheet')`);
  await click('[data-action="reset-progress"]');
  check('first click only asks to confirm', /again/.test(await text('[data-action="reset-progress"]')) && (await resultsCount()) > 0);
  await click('[data-action="reset-progress"]');
  check('second click erases progress', await waitFor(`document.querySelector('.qnum')?.textContent.trim() === 'Question 1'`) && (await resultsCount()) === 0);

  // ── Small screens ────────────────────────────────────
  section('Mobile (390px)');
  await viewport(390, 844);
  await click('.logo');
  await waitFor(`document.querySelector('.lib-title')`);
  await noOverflow('library');
  await click('[data-action="open-exam"][data-filter="all"]');
  await waitFor(`document.querySelector('.study .sheet')`);
  await noOverflow('cards');
  await click('.nav-toggle');
  check('question list opens from the toggle', await waitFor(`document.querySelector('.nav-pane.open .nv-grid')`));
  await noOverflow('cards with list open');
  await click('.nav-toggle');
  await click('.option[data-l="A"]');
  await sleep(700);
  check('verdict scrolls into view after answering', await ev(`document.getElementById('margin').getBoundingClientRect().top < innerHeight - 100`));
  await noOverflow('cards answered');
  await click('#btnFeed');
  await waitFor(`document.querySelector('.feed-item')`);
  await noOverflow('feed');
  check('feed navigator opens from the toggle on mobile', await ev(`!!document.querySelector('.nav-toggle')`));
  await click('#btnExam');
  await waitFor(`document.querySelector('.exam-ready')`);
  await ev(`localStorage.removeItem('et-exam-session')`);
  await click('[data-action="exam-new-exam"], [data-action="exam-start"]');
  await waitFor(`document.querySelector('.study-exam')`);
  await noOverflow('exam');
  check('timer visible on mobile', await ev(`document.querySelector('.exam-timer-inline').getBoundingClientRect().width > 0`));
  await viewport(820, 1100);
  await noOverflow('exam at tablet width');

  section('Console and network');
  check('no JS errors or failed requests during the whole run', problems.length === 0, problems.slice(0, 5).join(' | '));
} catch (e) {
  failed++;
  console.log(`\n  CRASH ${e.stack || e}`);
} finally {
  console.log(`\n${passed} passed, ${failed} failed`);
  ws.close(); chrome.kill();
  process.exit(failed ? 1 : 0);
}
