# EER Lab — Generalization & Specialization Visualizer

An interactive, browser-based learning platform for the Enhanced Entity-Relationship (EER) model — the part of database design that covers superclass/subclass hierarchies, generalization, specialization, inheritance, and constraints like disjoint/overlapping and total/partial.

At its core is a live diagram visualizer: build an EER diagram by hand, or import existing tables/SQL and let the app detect the structure — then watch the relational schema and SQL generate automatically underneath it. Around that sits a full learning path, worked examples, a practice question bank, an AI-generated quiz, and progress tracking.

No installation, no backend, no accounts. Open `index.html` and it runs.

---

## Features

**Visualizer** — Add entities and attributes, mark keys. Generalize (combine entities with shared attributes into a superclass) or specialize (split an entity into subclasses). Set disjoint/overlapping and total/partial constraints using standard EER notation. The relational schema and SQL regenerate live, with four selectable mapping strategies. Includes undo/redo, auto-layout, pan/zoom, and PNG/SVG/SQL export.

**Table / SQL Import workbench** — Paste tables, upload a CSV, or paste SQL `CREATE TABLE` statements. The app analyzes column names and patterns to suggest entities, relationships, and possible generalization groupings. Every suggestion must be reviewed and confirmed before anything is generated.

**Student Profile** — Academic profile dashboard with student photo upload/change, register number, department, semester, and course information, with live progress meters, question accuracy, competitive scores, and learning milestones.

**Contributors Page** — Fully dynamic. Add, edit, delete and reorder contributors (students, faculty mentors, others) with photo, name, role and optional register number, department and contribution in **Admin → Contributors**. Records and photos live in IndexedDB; nothing is hardcoded.

**Learn / Progress Path** — 30 curriculum modules from ER fundamentals through full EER mapping, with progress cards grouped by module, topic accuracy tables, and curated YouTube video lectures (verified IDs, click-to-play, direct-link fallback) with student completion tracking.

**Competitive Questions** — Challenging competitive examination question bank (GATE CS & University style) across 12 EER & DBMS topics with marks (+2M / +4M), difficulty filters, detailed step-by-step solutions, and timed test mode.

**Personal Performance Leaderboard** — Real-time assessment rankings of your own exam attempts sorted by score, accuracy, and completion time, with explicit transparency regarding local storage vs shared multi-user server ranking.

**Admin / Content Manager** — Add/edit/preview/delete competitive questions (Preview shows the exact student card, as answer key or student view, for saved, unsaved and JSON-imported questions), curate YouTube video lectures, manage diagram images, and backup/restore data via JSON.

---

## Quick start

Open `index.html` in any browser, or serve the folder (recommended):

```bash
python -m http.server 8000      # then open http://localhost:8000
```

Serving over http is required for **embedded YouTube playback** (YouTube refuses embeds from `file://` pages; the app then opens the video on YouTube instead). Everything else works from `file://`.

### Reading an ER/EER diagram from an image

Table / SQL Import → **ER diagram image**. Upload a PNG/JPG/WebP: it is validated and previewed immediately. *Reading* it needs a vision model, which this app does not bundle:

- inside Claude, it uses Claude's built-in image support automatically; otherwise
- paste your own **Anthropic API key** in *Recognition settings* (stored only in this browser, sent only to `api.anthropic.com`).

With neither, the page says recognition is unavailable and the upload still works as a reference image. A successful read opens a review screen (image beside the result, uncertain items flagged, missing cardinalities/constraints shown as visible defaults). Nothing reaches the Visualizer until you confirm items, tick the “I compared this with my original” box and press Generate.

All data — profile, progress, quiz history, uploaded images, admin content — is stored locally via `localStorage` and `IndexedDB`. No external server or complex setup is required.

---

## Project Structure

```text
├── index.html                  # Standalone bundled application (HTML, CSS, JS)
├── build.py                    # Concatenation & build script
├── README.md                   # Documentation
├── 01_style.css                # Academic UI styling & design system
├── 02_core.js                 # Utility helpers, storage engine & icons
├── 03_eer.js                  # EER visualizer canvas & relational mapping
├── 04_import.js               # SQL / CSV import workbench
├── 04b_vision.js              # Image validation + AI diagram recognition
├── 05a_content.js             # Worked examples, seeds (questions, verified videos)
├── 05b_topics.js              # Topic curriculum modules (Part 1)
├── 05c_topics.js              # Topic curriculum modules (Part 2)
├── 06_views1.js               # Dashboard & core navigation
├── 07_views2.js               # Visualizer, workbench, learn views
├── 08_views3.js               # Profile, contributors, competitive, progress, admin
└── assets/
    └── contributors/          # Unused placeholder art (contributors are now managed in Admin)
        ├── student1.jpg
        ├── student2.jpg
        ├── student3.jpg
        └── faculty.jpg
```

---

## Rebuilding

If you edit any of the source modular files (`01_style.css` through `08_views3.js`), regenerate `index.html` by running:

```bash
python build.py
```
