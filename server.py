#!/usr/bin/env python3
import re
import os
import json
import subprocess
from flask import Flask, jsonify, render_template, request, abort, make_response, Response, stream_with_context

app = Flask(__name__, template_folder='templates', static_folder='static')
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXAMS_DIR = os.path.join(BASE_DIR, 'exams')

_AGE = r'\d+\s+(?:years?|months?|weeks?|days?|hours?)(?:,\s*\d+\s+(?:years?|months?|weeks?|days?|hours?))?\s+ago'
_BADGE = r'(?:Highly Voted|Most Recent)'
_COMMENT_RE = re.compile(
    rf'^(\S+)\s+(?:({_BADGE})\s+)?({_AGE})\s+(.*?)upvoted\s+(\d+)\s+times\s*$',
    re.DOTALL | re.IGNORECASE,
)

# Old format: ## Exam <name> topic N question N
_OLD_HEADER_RE = re.compile(
    r'^##\s+Exam\s+.*?topic\s+(\d+)\s+question\s+(\d+)',
    re.MULTILINE | re.IGNORECASE,
)
# New format (examtopics-downloader): ## Examtopics <Name> question #N
_NEW_HEADER_RE = re.compile(
    r'^##\s+Examtopics\s+.*?question\s+#(\d+)',
    re.MULTILINE | re.IGNORECASE,
)


def _parse_comment(text):
    text = text.strip()
    if not text or 'Load full discussion' in text:
        return None
    m = _COMMENT_RE.match(text)
    if not m:
        return None
    username, badge, age, body, upvotes = m.group(1), m.group(2), m.group(3), m.group(4).strip(), int(m.group(5))
    selected_answer = None
    sa = re.search(r'Selected Answer:\s*([A-Z])', body)
    if sa:
        selected_answer = sa.group(1)
        body = (body[:sa.start()] + body[sa.end():]).strip()
    return {
        'username': username,
        'badge': badge,
        'age': age.strip(),
        'selected_answer': selected_answer,
        'text': body,
        'upvotes': upvotes,
    }


def _parse_comments(raw):
    """Old format: comments separated by '...' with upvote counts."""
    if not raw:
        return []
    chunks = re.split(r'\s*\.\.\.\s*', raw)
    return [c for c in (_parse_comment(ch) for ch in chunks) if c]


def _parse_comments_new(raw):
    """New format (examtopics-downloader): [username] Selected Answer: X text [user2] ..."""
    if not raw:
        return []
    parts = re.split(r'\s*\[([^\]]+)\]\s*', raw.strip())
    comments = []
    for i in range(1, len(parts), 2):
        if i + 1 >= len(parts):
            break
        username = parts[i].strip()
        text = parts[i + 1].strip()
        if not username or not text:
            continue
        selected_answer = None
        sa = re.search(r'Selected Answer:\s*([A-Z])', text)
        if sa:
            selected_answer = sa.group(1)
            text = (text[:sa.start()] + text[sa.end():]).strip()
        comments.append({
            'username': username,
            'badge': None,
            'age': '',
            'selected_answer': selected_answer,
            'text': text,
            'upvotes': 0,
        })
    return comments


def _parse_block(block):
    hm_new = _NEW_HEADER_RE.search(block)
    hm_old = _OLD_HEADER_RE.search(block)

    if not hm_new and not hm_old:
        return None

    is_new = bool(hm_new)
    if is_new:
        topic, qnum = 1, int(hm_new.group(1))
    else:
        topic, qnum = int(hm_old.group(1)), int(hm_old.group(2))

    lines = block.split('\n')

    # Options — handle both "A. text" (old) and "**A:** text" (new)
    options, opt_indices = {}, []
    for i, line in enumerate(lines):
        s = line.strip()
        m = re.match(r'^\*\*([A-Z]):\*\*\s*(.+)$', s) or re.match(r'^([A-Z])\.\s+(.+)$', s)
        if m:
            options[m.group(1)] = m.group(2).strip()
            opt_indices.append(i)
    if not options:
        return None

    # Question text: last non-empty line before first option that contains '?'
    question_text = ''
    for line in reversed(lines[:opt_indices[0]]):
        s = line.strip()
        if s and '?' in s:
            question_text = s
            break
    if not question_text:
        skip = re.compile(r'^(##|Question #|Topic #|\[All|Actual|Google|Examtopics|@)')
        for line in reversed(lines[:opt_indices[0]]):
            s = line.strip()
            if s and not skip.match(s) and s not in ("Google's", "Professional Data Engineer", "Associate Cloud Engineer"):
                question_text = s
                break

    # Timestamp and ExamTopics URL
    timestamp, url = None, None
    ts_m = re.search(r'\*\*Timestamp:\s*(.+?)\*\*', block)
    if ts_m:
        timestamp = ts_m.group(1).strip()
    url_m = re.search(r'\[View on ExamTopics\]\((.+?)\)', block)
    if url_m:
        url = url_m.group(1)

    # For new format, extract the real question number and topic from the URL
    if is_new and url:
        qm = re.search(r'question-(\d+)', url)
        tm = re.search(r'topic-(\d+)-question', url)
        if qm:
            qnum = int(qm.group(1))
        if tm:
            topic = int(tm.group(1))

    # Comments
    cm = re.search(r'^Comments:\s*(.+)', block, re.DOTALL | re.MULTILINE)
    raw_comments = cm.group(1).strip() if cm else ''
    comments = _parse_comments_new(raw_comments) if is_new else _parse_comments(raw_comments)

    # Consensus: majority of "Selected Answer: X" votes
    votes = {}
    for c in comments:
        if c['selected_answer']:
            votes[c['selected_answer']] = votes.get(c['selected_answer'], 0) + 1
    consensus_answer, consensus_votes, consensus_total = None, 0, sum(votes.values())
    if votes:
        consensus_answer = max(votes, key=votes.get)
        consensus_votes = votes[consensus_answer]

    return {
        'id': qnum,
        'topic': topic,
        'question_number': qnum,
        'question': question_text,
        'options': options,
        'timestamp': timestamp,
        'examtopics_url': url,
        'consensus_answer': consensus_answer,
        'consensus_votes': consensus_votes,
        'consensus_total': consensus_total,
        'comments': comments,
    }


def parse_md(filepath):
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    blocks = re.split(r'\n-{10,}\n', content)
    return [q for q in (_parse_block(b) for b in blocks) if q]


@app.route('/')
def index():
    resp = make_response(render_template('index.html'))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route('/api/files')
def list_files():
    os.makedirs(EXAMS_DIR, exist_ok=True)
    files = sorted(f for f in os.listdir(EXAMS_DIR) if f.endswith('.md'))
    default = 'professional-data-engineer.md'
    if default in files:
        files = [default] + [f for f in files if f != default]
    return jsonify(files)


@app.route('/api/questions')
def get_questions():
    filename = request.args.get('file', '')
    if not filename:
        return jsonify({'error': 'file parameter required'}), 400
    filepath = os.path.abspath(os.path.join(EXAMS_DIR, filename))
    if os.path.dirname(filepath) != EXAMS_DIR or not filename.endswith('.md'):
        return abort(403)
    if not os.path.isfile(filepath):
        return abort(404)
    try:
        return jsonify(parse_md(filepath))
    except Exception as e:
        return jsonify({'error': str(e)}), 400


_PROVIDERS = {
    'amazon', 'cisco', 'comptia', 'ec-council', 'fortinet',
    'google', 'isaca', 'isc2', 'juniper', 'microsoft',
    'oracle', 'paloaltonetworks', 'salesforce', 'servicenow', 'vmware',
}
_ANSI = re.compile(r'\x1b\[[0-9;]*[mGKHF]')


@app.route('/api/download')
def download_exam():
    provider = request.args.get('provider', '').strip()
    query = request.args.get('query', '').strip()
    comments = request.args.get('comments', 'true') == 'true'

    if provider not in _PROVIDERS:
        return jsonify({'error': 'Invalid provider'}), 400
    if not query or not re.match(r'^[\w\-\.]+$', query):
        return jsonify({'error': 'Invalid query — use letters, numbers, hyphens or dots only'}), 400

    slug = re.sub(r'[^\w]', '-', query.lower()).strip('-')
    filename = f'{provider}-{slug}.md'
    os.makedirs(EXAMS_DIR, exist_ok=True)

    def generate():
        cmd = [
            'docker', 'run', '--rm',
            '-v', f'{EXAMS_DIR}:/output',
            'ghcr.io/thatonecodes/examtopics-downloader:latest',
            '-p', provider, '-s', query,
            '-o', f'/output/{filename}',
        ]
        if comments:
            cmd.append('-c')
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
            for line in proc.stdout:
                clean = _ANSI.sub('', line).rstrip()
                if clean:
                    yield f'data: {json.dumps({"log": clean})}\n\n'
            proc.wait()
            out = os.path.join(EXAMS_DIR, filename)
            if proc.returncode == 0 and os.path.isfile(out):
                yield f'data: {json.dumps({"done": True, "file": filename})}\n\n'
            else:
                yield f'data: {json.dumps({"error": "Download failed or produced no output. Try a different search term."})}\n\n'
        except FileNotFoundError:
            yield f'data: {json.dumps({"error": "Docker not found — is Docker Desktop installed and running?"})}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"error": str(e)})}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


if __name__ == '__main__':
    print('ExamTopics Viewer → http://localhost:7654')
    app.run(debug=False, port=7654)
