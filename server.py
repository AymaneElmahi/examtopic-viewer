#!/usr/bin/env python3
import re
import os
import json
import subprocess
from structure import annotate
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
# Exam name inside either header, and the exam/topic/question encoded in the ExamTopics URL
_NEW_NAME_RE = re.compile(r'^##\s+Examtopics\s+(.*?)(?:_\d+)?\s+question\s+#', re.MULTILINE | re.IGNORECASE)
_OLD_NAME_RE = re.compile(r'^##\s+Exam\s+(.*?)\s+topic\s+\d+\s+question', re.MULTILINE | re.IGNORECASE)
_URL_EXAM_RE = re.compile(r'exam-(.+?)-topic-(\d+)-question-(\d+)')
_IMG_URL_RE = re.compile(r'^(https://www\.examtopics\.com/assets/media/\S+)$', re.MULTILINE)


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


def _next_nonempty(lines, start):
    for line in lines[start:]:
        if line.strip():
            return line.strip()
    return ''


def _stem(lines, first_option):
    """The question text (paragraphs kept) and any exhibit image URLs, from after the header to the first option."""
    head = lines[:first_option]
    start = 0
    for i, line in enumerate(head):
        t = line.strip()
        # new format: '## Examtopics ...'; old format: '[All ... Questions]' closes a fixed preamble
        if t.startswith('## ') or re.match(r'^\[All .*Questions\]$', t):
            start = i + 1
    body = [l.rstrip() for l in head[start:] if l.strip() != '//IMG//']
    images = [l.strip() for l in body if _IMG_URL_RE.match(l.strip())]
    text = '\n'.join(l for l in body if not _IMG_URL_RE.match(l.strip())).strip()
    return re.sub(r'\n{3,}', '\n\n', text), images


def _humanize(slug):
    return ' '.join(w.capitalize() for w in slug.split('-'))


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

    # Options — handle both "A. text" (old) and "**A:** text" (new).
    # Some questions have image options: "A." followed by "//IMG//"; the image URLs are listed after the options.
    options, opt_indices, image_letters = {}, [], []
    for i, line in enumerate(lines):
        s = line.strip()
        m = re.match(r'^\*\*([A-Z]):\*\*\s*(.+)$', s) or re.match(r'^([A-Z])\.\s+(.+)$', s)
        if m:
            options[m.group(1)] = m.group(2).strip()
            opt_indices.append(i)
            continue
        m = re.match(r'^([A-Z])\.\s*$', s)
        if m and _next_nonempty(lines, i + 1) == '//IMG//':
            options[m.group(1)] = 'Image'
            opt_indices.append(i)
            image_letters.append(m.group(1))
    if not options:
        return None
    body = block.split('\nComments:')[0]
    option_images = dict(zip(image_letters, _IMG_URL_RE.findall(body)))

    # Question text: everything between the header and the first option (a stem can span several paragraphs)
    question_text, question_images = _stem(lines, opt_indices[0])
    if not question_text:
        for line in reversed(lines[:opt_indices[0]]):
            s = line.strip()
            if s and '?' in s:
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

    # Which exam this question belongs to (a file can hold several)
    nm = (_NEW_NAME_RE if is_new else _OLD_NAME_RE).search(block)
    um = _URL_EXAM_RE.search(url or '')
    exam_name = nm.group(1).strip() if nm else (_humanize(um.group(1)) if um else '')
    exam_slug = um.group(1) if um else re.sub(r'[^a-z0-9]+', '-', exam_name.lower()).strip('-')

    return {
        'id': qnum,
        'exam_name': exam_name,
        'exam_slug': exam_slug,
        'option_images': option_images,
        'question_images': question_images,
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
    return annotate([q for q in (_parse_block(b) for b in blocks) if q])


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


def _normalize_query(raw):
    """'Professional Cloud Architect' -> 'professional-cloud-architect' (the form the downloader expects)."""
    return re.sub(r'\s+', '-', raw.strip()).lower()


def _sse_error(message):
    # Errors go out as a stream event: a browser EventSource cannot read a plain JSON error body.
    return Response(
        f'data: {json.dumps({"error": message})}\n\n',
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache'},
    )


@app.route('/api/download')
def download_exam():
    provider = request.args.get('provider', '').strip()
    query = _normalize_query(request.args.get('query', ''))
    comments = request.args.get('comments', 'true') == 'true'

    if provider not in _PROVIDERS:
        return _sse_error('Unknown provider.')
    if not query:
        return _sse_error('Type the name of the exam, for example "professional cloud architect".')
    if not re.match(r'^[\w\-\.]+$', query):
        return _sse_error('The exam name can only contain letters, numbers, spaces, hyphens and dots.')

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
