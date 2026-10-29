# ExamTopics Viewer

A free, offline local study tool for ExamTopics certification exams. No paywall, no account. Parse any ExamTopics-formatted Markdown file, study with community-consensus answers, take timed mock exams, and track your scores — all in the browser against a local Flask server.

## Features

### Study modes
- **Cards** — one question at a time, flashcard-style. Select an answer to reveal the community consensus, confidence bar, and discussion.
- **Feed** — scrollable list of all questions, each independently interactive.
- **Mock Exam** — 55 randomly-sampled questions, 2-hour countdown, answers hidden until you submit. Shows score, pass/fail, and per-question breakdown on completion.

### Persistence
- **Resume studying** — card/feed position is saved per file and restored when you reopen the app.
- **Resume exam** — mid-exam state (questions, answers, timer) is saved to `localStorage` and survives page reloads and server restarts. You'll be prompted to resume or start fresh.
- **Score history** — every completed exam with more than 20 questions answered is logged. View all past results from the header.

### Notes
- Add a personal note to any question in cards or feed mode. Notes are collapsed by default, per-question, and persisted to `localStorage`.

### Community consensus
- Derived by majority vote from `Selected Answer: X` tags in the comments — no relying on the (often blank) official Answer field.

### Other
- **Download exams** — pull any exam from ExamTopics via the [`examtopics-downloader`](https://github.com/thatonecodes/examtopics-downloader) Docker image (Docker Desktop required).
- **Jump to question** — type a number in the header input and press Enter.
- **Light / Dark theme** — toggle in the header; persisted to `localStorage`.
- **Multi-file support** — drop any `.md` file in the `exams/` folder and it appears in the file selector automatically.

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
├── server.py               # Flask backend — parses .md files, serves API
├── run.sh                  # One-command start script
├── requirements.txt
├── exams/                  # Drop .md exam files here
├── templates/
│   └── index.html
└── static/
    ├── css/app.css
    └── js/
        ├── main.js         # Entry point, event delegation, keyboard nav
        ├── api.js          # Fetch wrappers
        ├── state.js        # Shared mutable state
        ├── ui.js           # HTML builders (options, comments, consensus)
        ├── cards.js        # Card mode
        ├── feed.js         # Feed mode
        ├── exam.js         # Mock exam mode + session persistence
        ├── progress.js     # Card/feed position persistence
        ├── notes.js        # Per-question notes
        ├── history.js      # Score history
        └── download.js     # Exam download panel
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/files` | JSON array of `.md` filenames in `exams/` |
| `GET /api/questions?file=name.md` | JSON array of parsed question objects |
| `GET /api/download?provider=…&query=…` | SSE stream — runs the Docker downloader |

## Keyboard shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Previous / next question (cards mode) |
| `Enter` in jump input | Jump to question number |

## License

MIT
