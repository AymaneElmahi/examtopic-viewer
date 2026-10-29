"""Works out how the questions of an exam file are organised.

An ExamTopics export can hold several exams (the same question number appears in
each), and one exam can have several topics. For most exams every topic above the
first is a case study. Nothing here is specific to one certification: it only
relies on the exam name, the topic number and the wording of the questions.
"""
import math
import re
from collections import Counter

_CASE_RE = re.compile(r'refer to the (.+?) case study', re.IGNORECASE | re.DOTALL)


def _clean(name):
    return re.sub(r'\s+', ' ', name).strip(' .,:;')


def infer_case_study_name(questions):
    """Most common 'refer to the X case study' name in a group, or None."""
    names = Counter()
    for q in questions:
        m = _CASE_RE.search(q['question'])
        if m:
            names[_clean(m.group(1))] += 1
    return names.most_common(1)[0][0] if names else None


_CAPS = re.compile(r'\b[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)*')
_LEADING = {'The', 'A', 'An', 'At', 'For', 'In', 'On', 'Your', 'You', 'Our', 'We', 'Their', 'This', 'That', 'These',
            'It', 'If', 'When', 'What', 'Which', 'How', 'Why', 'To', 'Is', 'Are', 'Do', 'Does', 'And', 'Or', 'But'}


def _proper_nouns(text):
    """Capitalised words and short phrases in a text ('Mountkirk Games', 'TerramEarth')."""
    found = set()
    for m in _CAPS.finditer(text.replace('\u2019', "'")):
        words = m.group(0).split()
        while words and words[0] in _LEADING:
            words.pop(0)
        for n in (1, 2, 3):
            if len(words) >= n:
                found.add(' '.join(words[:n]))
        found.update(words)
    return {w for w in found if len(w) >= 4}


def infer_company_name(group, baseline):
    """For case study questions that never say "case study": the name that runs through the group.

    A name qualifies if it is in at least half of the group's questions and almost never in the
    exam's ordinary questions (so product names like "Compute Engine" are ruled out).
    """
    if len(group) < 2:
        return None
    in_group = Counter()
    for q in group:
        in_group.update(_proper_nouns(q['question']))
    in_base = Counter()
    for q in baseline:
        in_base.update(_proper_nouns(q['question']))
    # A real name is never written in lower case. A capitalised ordinary word ("Use", "Always") that starts
    # a sentence is, elsewhere in the text, so it can't be the name.
    lowercase = set()
    for q in list(group) + list(baseline):
        lowercase.update(re.findall(r'\b[a-z][a-z0-9]*\b', q['question']))
    need = max(2, math.ceil(len(group) / 2))
    allowed_in_base = max(1, int(len(baseline) * 0.02))
    ok = [(n, c) for n, c in in_group.items()
          if c >= need and in_base[n] <= allowed_in_base and n.split()[0].lower() not in lowercase]
    if not ok:
        return None
    return sorted(ok, key=lambda x: (-x[1], -len(x[0])))[0][0]


def _mentions_case_study(questions):
    return any(re.search(r'case study', q['question'], re.IGNORECASE) for q in questions)


def annotate(questions):
    """Sort questions (exam, topic, number) and add organisation fields. Returns a new list.

    Adds to every question: uid, exam_slug, multi_exam, group_topic, group_kind
    ('case_study' | 'topic' | None for the first topic of an exam) and group_name.
    """
    qs = sorted(questions, key=lambda q: (q.get('exam_name', '').lower(), q['topic'], q['question_number']))

    exams = []
    for q in qs:
        if q['exam_slug'] not in exams:
            exams.append(q['exam_slug'])
    multi_exam = len(exams) > 1

    groups = {}
    for q in qs:
        groups.setdefault((q['exam_slug'], q['topic']), []).append(q)

    base_topic = {}
    for (slug, topic) in groups:
        base_topic[slug] = min(topic, base_topic.get(slug, topic))

    info = {}
    taken = Counter()
    for (slug, topic) in sorted(groups, key=lambda k: (exams.index(k[0]), k[1])):
        if topic == base_topic[slug]:
            info[(slug, topic)] = (None, None)
            continue
        members = groups[(slug, topic)]
        name = infer_case_study_name(members)
        kind = 'case_study' if (name or _mentions_case_study(members)) else 'topic'
        if name:
            taken[(slug, name)] += 1
            if taken[(slug, name)] > 1:
                name = f'{name} ({taken[(slug, name)]})'
        info[(slug, topic)] = (kind, name)

    # If an exam already has named case studies, its other extra topics are case studies too
    # (their questions just don't repeat the phrase "case study").
    for slug in exams:
        keys = [k for k in info if k[0] == slug and info[k][0]]
        if any(info[k][0] == 'case_study' for k in keys):
            baseline = [q for q in qs if q['exam_slug'] == slug and q['topic'] == base_topic[slug]]
            for k in sorted(keys, key=lambda k: k[1]):
                kind, name = info[k]
                if kind == 'topic':
                    kind = 'case_study'
                if kind == 'case_study' and not name:
                    name = infer_company_name(groups[k], baseline)
                    if name:
                        taken[(slug, name)] += 1
                        if taken[(slug, name)] > 1:
                            name = f'{name} ({taken[(slug, name)]})'
                info[k] = (kind, name)

    # Stable ids. Keep the simple "topic-number" form unless numbers collide
    # (a file with several exams), in which case the exam is part of the id.
    collide = len({(q['topic'], q['question_number']) for q in qs}) != len(qs)
    seen = Counter()
    for q in qs:
        kind, name = info[(q['exam_slug'], q['topic'])]
        q['group_topic'] = q['topic']
        q['group_kind'] = kind
        q['group_name'] = name
        q['multi_exam'] = multi_exam
        uid = f"{q['exam_slug']}~{q['topic']}-{q['question_number']}" if collide else f"{q['topic']}-{q['question_number']}"
        seen[uid] += 1
        q['uid'] = uid if seen[uid] == 1 else f'{uid}#{seen[uid]}'
    return qs
