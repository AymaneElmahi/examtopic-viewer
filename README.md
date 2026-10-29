# ExamTopics Viewer

A free, offline local study tool for ExamTopics certification exams. No paywall, no account. Parse any ExamTopics-formatted Markdown file, study with community-consensus answers, take timed mock exams, and track your scores — all in the browser against a local Flask server.

## Disclaimer

This is an **unofficial, independent tool**. It is not affiliated with ExamTopics, Google or any certification provider. **It ships with no exam content**: you add the exam files yourself, and you are responsible for following the terms of ExamTopics and of the certification program you study for. Material that reproduces real exam questions can break the rules of some programs, so check yours.

The community answer is what commenters voted for. It can be wrong or out of date: check the official documentation before relying on it. The same notice is shown the first time you open the app.

## Features

### Your exams
- **Library** — every exam as a sheet with one dot per question (matched the community, missed, or not seen yet). Click a dot to open that question. Buttons jump straight to *Continue*, *Review N missed*, *N not seen yet* or a *Mock exam*.
- **Several exams in one file** — a file that mixes exams (for example Associate Cloud Engineer and Associate Data Practitioner) is split into one section per exam, and progress never collides between them.
- **Case studies** — for exams that use extra topics for case studies, questions are sorted and grouped. Groups are named from the question text ("refer to the *X* case study", or the company name that runs through the group) and you can rename any group. The case study text is not in the export, so each group has a box where you can paste it once (kept in your browser) to read it next to the questions.
- **Full questions and images** — multi-paragraph questions are shown whole, and exhibit images and picture options are displayed (loaded from examtopics.com, so they need a connection).

### Study modes
- **Cards** — one question at a time. Pick an answer to see the community answer (highlighted), how the votes split, and the discussion. Or choose *Just show me the answer* without recording a guess.
- **Feed** — scrollable list of questions, with the same progress sidebar. The sidebar follows your scrolling.
- **Filters** — All, Unseen, Missed, Flagged, and Case studies, in both Cards and Feed. Flag any question with `Shift+F`.
- **Mock exam** — 55 random questions, 2-hour countdown, question palette with flags, answers hidden until you submit. Results show the questions you missed or skipped first. Submit and abandon ask for a second click.

### Persistence (all in your browser)
- **Resume** — position per exam, your answers, flags, notes, renamed groups and pasted case studies.
- **Resume exam** — mid-exam state survives reloads. You are asked whether to resume.
- **Score history** — every mock exam with more than 20 questions answered.

### Other
- **Download exams** — pull an exam from ExamTopics with the [`examtopics-downloader`](https://github.com/thatonecodes/examtopics-downloader) Docker image (Docker Desktop required), or drop a `.md` file into `exams/`.
- **Light / dark theme**, following your system by default.

## Setup

**Requires Python 3.9+**

```bash
git clone https://github.com/AymaneElmahi/examtopic-viewer.git
cd examtopic-viewer
./run.sh
```

Open **http://localhost:7654** in your browser. The script creates a virtual environment on first run, installs dependencies, and starts the server. Re-run `./run.sh` any time to restart.

## Adding exam files

Place any `.md` file with the ExamTopics question format in the `exams/` folder. The file selector in the header lists all `.md` files found automatically.

You can also use the in-app **Download** button (cloud icon in the header) to fetch exams directly — requires Docker Desktop running.

### Supported Markdown formats

Two formats are supported:

**Old format (manual scrape)**
```
## Exam topic 1 question 42

Some question text?

A. First option
B. Second option
C. Third option
D. Fourth option
E. Fifth option

Comments:
username1 Highly Voted 2 years ago
Selected Answer: B
Explanation here upvoted 120 times
...
```

**New format ([examtopics-downloader](https://github.com/thatonecodes/examtopics-downloader))**
```
## Examtopics Professional Data Engineer question #42

**Timestamp: ...**

Some question text?

**A:** First option
**B:** Second option
...

[View on ExamTopics](https://www.examtopics.com/...)

Comments:
[username1] Selected Answer: B Explanation here
```

Questions are separated by a line of 10+ dashes (`----------`).

## Project structure

```
examtopic-viewer/
├── server.py               # Flask backend: parses .md files, serves the API
├── structure.py            # Sorting, exam/case study detection, stable question ids
├── run.sh                  # One-command start script
├── exams/                  # Your exam .md files (not in git)
├── templates/index.html
├── static/
│   ├── css/app.css
│   └── js/                 # main.js (entry, events), library.js, cards.js, feed.js,
│                           # exam.js, navigator.js, groups.js, queue.js, results.js,
│                           # about.js, notes.js, history.js, download.js, ...
└── tests/
    ├── test_structure.py   # unit tests (python3 -m unittest discover tests)
    └── e2e/smoke.mjs       # drives a real Chrome through every screen
```

## Tests

```bash
python3 -m unittest discover tests -v          # parser, sorting, groups, ids, image options
BASE=http://localhost:7654 node tests/e2e/smoke.mjs   # full browser run (needs Chrome and the server running)
```

The browser test uses a throwaway profile, so your own progress is never touched.

## API

| Endpoint | Description |
|---|---|
| `GET /api/files` | JSON array of `.md` filenames in `exams/` |
| `GET /api/questions?file=name.md` | JSON array of parsed, sorted question objects (with `uid`, `exam_name`, `group_kind`, `group_name`, `option_images`) |
| `GET /api/download?provider=…&query=…` | SSE stream — runs the Docker downloader |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Previous / next question |
| `A`–`E` … | Answer (Cards and Mock exam) |
| `Enter` | Next question, once you have answered (Cards) |
| `Shift+F` | Flag the question |

## License

MIT
