import { esc } from './ui.js';

const PROVIDERS = [
  ['amazon',           'Amazon (AWS)'],
  ['cisco',            'Cisco'],
  ['comptia',          'CompTIA'],
  ['ec-council',       'EC-Council'],
  ['fortinet',         'Fortinet'],
  ['google',           'Google Cloud'],
  ['isaca',            'ISACA'],
  ['isc2',             'ISC2'],
  ['juniper',          'Juniper'],
  ['microsoft',        'Microsoft'],
  ['oracle',           'Oracle'],
  ['paloaltonetworks', 'Palo Alto Networks'],
  ['salesforce',       'Salesforce'],
  ['servicenow',       'ServiceNow'],
  ['vmware',           'VMware'],
];

let _es = null;

function closeEs() {
  if (_es) { _es.close(); _es = null; }
}

export function closeDownload() { closeEs(); }

export function renderDownload(onFileDone) {
  closeEs();
  document.getElementById('view').className = 'card-wrap';

  const opts = PROVIDERS.map(([v, l]) =>
    `<option value="${v}"${v === 'google' ? ' selected' : ''}>${l}</option>`
  ).join('');

  const dlIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="11" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>`;

  document.getElementById('view').innerHTML = `
    <div class="dl-panel">
      <div class="dl-hero">
        <div class="dl-hero-icon">${dlIcon}</div>
        <div>
          <div class="dl-hero-title">Add an exam</div>
          <div class="dl-hero-sub">Downloads an exam from ExamTopics with the <code>examtopics-downloader</code> Docker image. Docker Desktop needs to be running.</div>
        </div>
      </div>

      <div class="dl-form">
        <div class="dl-row">
          <div class="dl-field">
            <label class="dl-label" for="dlProvider">Provider</label>
            <select id="dlProvider" class="dl-select">${opts}</select>
          </div>
          <div class="dl-field dl-field-grow">
            <label class="dl-label" for="dlQuery">Exam name</label>
            <input id="dlQuery" class="dl-input" type="text"
              placeholder="e.g. professional cloud architect, devops, 200-301" autocomplete="off" />
          </div>
        </div>
        <label class="dl-check-label">
          <input type="checkbox" id="dlComments" checked />
          <span>Include comments <em class="dl-check-hint">(needed to find the community answer)</em></span>
        </label>
        <button class="btn btn-submit dl-submit" id="dlStart">
          ${dlIcon} Download
        </button>
      </div>

      <div class="dl-log">
        <div class="dl-log-header">
          <span class="dl-log-label">Output</span>
          <span id="dlStatus" class="dl-log-status"></span>
        </div>
        <div class="dl-log-body" id="dlLogBody">
          <span class="dl-log-hint">Progress shows up here once the download starts.</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('dlStart').addEventListener('click', () => run(onFileDone));
  document.getElementById('dlQuery').addEventListener('keydown', e => {
    if (e.key === 'Enter') run(onFileDone);
  });
}

function appendLog(text, cls = 'dl-log-line') {
  const body = document.getElementById('dlLogBody');
  if (!body) return;
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

const DL_ICON_HTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="11" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg> Download`;

function setBtn(disabled, text) {
  const btn = document.getElementById('dlStart');
  if (!btn) return;
  btn.disabled = disabled;
  btn.innerHTML = text;
}

function setStatus(text, cls) {
  const el = document.getElementById('dlStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `dl-log-status ${cls}`;
}

function run(onFileDone) {
  const provider = document.getElementById('dlProvider')?.value || 'google';
  const query = (document.getElementById('dlQuery')?.value || '').trim();
  const comments = document.getElementById('dlComments')?.checked ?? true;

  if (!query) { document.getElementById('dlQuery')?.focus(); return; }

  document.getElementById('dlLogBody').innerHTML = '';
  setBtn(true, 'Downloading…');
  setStatus('running', 'running');

  closeEs();
  const url = `/api/download?provider=${encodeURIComponent(provider)}&query=${encodeURIComponent(query)}&comments=${comments}`;
  _es = new EventSource(url);

  _es.onmessage = ev => {
    const d = JSON.parse(ev.data);

    if (d.log) appendLog(d.log);

    if (d.done) {
      closeEs();
      setBtn(false, DL_ICON_HTML);
      setStatus('done', 'done');
      appendLog(`Saved as ${d.file}`, 'dl-log-success');

      const body = document.getElementById('dlLogBody');
      if (body) {
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn btn-disc dl-load-btn';
        loadBtn.textContent = `Open ${d.file.replace(/\.md$/i, '')}`;
        loadBtn.addEventListener('click', () => { if (onFileDone) onFileDone(d.file); });
        body.appendChild(loadBtn);
        body.scrollTop = body.scrollHeight;
      }
    }

    if (d.error) {
      closeEs();
      setBtn(false, DL_ICON_HTML);
      setStatus('error', 'error');
      appendLog(`${d.error}`, 'dl-log-error');
    }
  };

  _es.onerror = () => {
    closeEs();
    setBtn(false, DL_ICON_HTML);
    setStatus('error', 'error');
    appendLog('The download stopped unexpectedly. Check that the server is still running, then try again.', 'dl-log-error');
  };
}
