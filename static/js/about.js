const KEY = 'et-disclaimer-ack';
const VERSION = '1';

export function needsDisclaimer() {
  try { return localStorage.getItem(KEY) !== VERSION; }
  catch { return true; }
}

// The disclaimer. First run: must be acknowledged. Later: reachable from the library footer.
export function showAbout({ first = false } = {}) {
  document.getElementById('aboutDialog')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'aboutDialog';
  dlg.className = 'about';
  dlg.setAttribute('aria-labelledby', 'aboutTitle');
  dlg.innerHTML = `
    <h2 id="aboutTitle">${first ? 'Before you start' : 'About ExamTopics Viewer'}</h2>
    <ul class="about-list">
      <li><strong>Unofficial.</strong> This is an independent tool. It is not affiliated with ExamTopics, Google or any certification provider.</li>
      <li><strong>You bring the exams.</strong> The app ships with no exam content. You add the files yourself, and you are responsible for following the terms of ExamTopics and of your certification program. Material that reproduces real exam questions can break the rules of some programs, so check yours.</li>
      <li><strong>Answers are opinions.</strong> The community answer is what commenters voted for. It can be wrong or out of date. Check the official documentation before relying on it.</li>
      <li><strong>Private by default.</strong> Your progress, notes and flags stay in this browser. Some questions show images loaded from examtopics.com, which needs an internet connection.</li>
    </ul>
    <div class="about-actions"><button class="btn btn-submit" data-about="ok">${first ? 'I understand' : 'Close'}</button></div>`;
  document.body.appendChild(dlg);

  let acknowledged = false;
  dlg.querySelector('[data-about="ok"]').addEventListener('click', () => {
    acknowledged = true;
    if (first) { try { localStorage.setItem(KEY, VERSION); } catch { /* storage blocked */ } }
    dlg.close();
    dlg.remove();
  });
  // On first run the notice has to be read and acknowledged. Browsers can ignore preventDefault on
  // Escape until the page has been interacted with, so reopen it if it gets closed any other way.
  dlg.addEventListener('cancel', e => { if (first) e.preventDefault(); });
  dlg.addEventListener('close', () => {
    if (first && !acknowledged && dlg.isConnected) setTimeout(() => dlg.showModal(), 0);
    else if (!first) dlg.remove();
  });
  dlg.showModal();
  dlg.querySelector('[data-about="ok"]').focus();
}
