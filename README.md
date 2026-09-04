# CSV Doctor

[![CSV Doctor checks](https://github.com/busrabuseucar/csv-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/busrabuseucar/csv-doctor/actions/workflows/ci.yml)

A local-first CSV inspection and cleaning tool. Open a file, compare the original and cleaned records, and download a CSV plus a JSON audit report. The browser and Node.js CLI share the same JavaScript engine.

**Live demo:** [CSV Doctor](https://csv-doctor-buse.sleek-brush-8818.chatgpt.site). The hosted demo is public and can be opened by anyone with the link. It starts with fictional sample data; selected files are processed in your browser.

## What it does

- Reads UTF-8 CSV/TSV with comma, semicolon or tab separators, including quoted delimiters, escaped quotes and embedded newlines.
- Reports missing cells, whitespace, duplicate records and column type hints.
- Applies an explicit plan: trim edges → optionally remove fully blank records → optionally remove exact duplicate records. Keeps the first occurrence and the original record number.
- Shows original and cleaned previews. Changing the plan recomputes from the original text.
- Exports the complete cleaned dataset with its original delimiter and a UTF-8 BOM.
- Exports a JSON report containing options, counts, column profiles and record references, but no raw cell values. Column names and the filename are included.
- Processes browser data in a Web Worker; input files are not uploaded or stored by the application.
- Runs from the command line using the exact same engine. Output creation refuses to overwrite existing files.

## Run locally

Requirements: **Node.js 24+**, **Python 3.10+**, and a modern browser with module Web Worker support. There are no third-party runtime or development dependencies and no API keys. No install step is needed.

```bash
git clone https://github.com/busrabuseucar/csv-doctor.git
cd csv-doctor
npm run source
npm start
```

Open **http://localhost:8080**. Serve the directory over HTTP; opening `index.html` through `file://` cannot load its module worker reliably. Stop the local server with Ctrl+C.

Direct equivalents, if you do not use npm:

```bash
python3 scripts/package-source.py
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

### CLI

```bash
node scripts/cli.mjs dist/sample.csv --out cleaned.csv --report report.json
node scripts/cli.mjs input.csv --out cleaned.csv --delimiter semicolon --keep-duplicates
node scripts/cli.mjs --help
```

Every output path must be new. Input is never overwritten. If reserving multiple destinations fails, an empty reserved output can remain; remove or rename it before retrying. I/O failure can leave a partial newly created output. Review the process exit code before consuming output.

## Sample scenario

The bundled data is fictional workshop inventory with **14 data records** and **5 columns**.

| Selected default plan | Result |
| --- | --- |
| Trim field edges | 2 whitespace-bearing cells |
| Remove fully blank records | 1 record removed |
| Remove exact duplicates | 2 records removed |
| Output | 11 data records |
| Remaining missing cells | 2, left empty |
| Type hints needing review | `otuz` in `adet`, `2026-02-30` in `tarih` |

Record numbers count the header as record 1. A quoted newline stays inside one logical record; these numbers are not physical text line numbers.

## Safety and semantics

- **Limits:** 2 MiB encoded input; 20,000 data records; 100 columns; 200,000 cells including the header. Blank records are counted and expanded to the header width for the cell budget.
- **First record is the header.** Empty headers and duplicate headers after trimming are rejected. Case remains significant. A header-only file is valid.
- **No silent recovery:** malformed quoting and nonblank records with a different field count stop analysis. Fix the source file and reopen it.
- Automatic delimiter detection examines the first logical record outside quotes. Headers with multiple different separator characters require explicit selection. A single-column file defaults to comma.
- Fully blank physical records and records with only empty/whitespace cells are blank records. Literal values such as `NULL`, `NA`, and `0` are not missing.
- Deduplication compares complete rows after the selected preceding operations. If blank removal is off but deduplication is on, repeated blank records may still be removed as duplicates.
- **No type conversion or missing-value imputation.** Leading-zero identifiers and numeric precision remain strings. Type hints recognize conservative decimal syntax and valid `YYYY-MM-DD` dates. Mixed columns are flagged only if at least 70% of two or more nonempty values are numbers or ISO dates. This is a heuristic, not schema validation.
- Exports prefix spreadsheet formula triggers (`=`, `+`, `-`, `@`, leading tab/CR/LF, and whitespace before a trigger) with an apostrophe, including in headers. This also affects negative numbers and some phone numbers. The preview and report describe values *before* export protection. Review imports in your spreadsheet application; CSV alone cannot control automatic date or leading-zero conversion.
- The app inserts cell contents as text, never as HTML. It has no third-party analytics or scripts. Page assets and the bundled sample are served from the host; selected file contents stay in browser memory. Closing the tab discards the session.
- The JSON report excludes cell values but can still contain sensitive filenames and column names. Treat it as part of your dataset.

## Validation

```bash
npm test
npm run source
npm run check
```

**28 automated tests** cover parsing, structural errors, cleanup ordering, data preservation, delimiter/export round trips, type hints, evidence references, formula-prefix protection, resource limits, real CLI execution, UTF-8 rejection and overwrite prevention.

The check command validates JavaScript syntax, the static hosting entrypoint and local HTML asset references. The GitHub Actions workflow runs the same checks after push. A configured workflow is not a claim that a remote run has already passed. No browser-based visual or end-to-end test was performed for the initial release.

## Layout

```text
dist/engine.js       Pure parser, analysis, cleaning and export functions
dist/worker.js       Browser worker message handler
dist/app.js          Browser state, events, safe table rendering and downloads
dist/index.html     Accessible application shell
dist/styles.css     Responsive interface
dist/sample.csv     Fictional demonstration data
scripts/cli.mjs     Shared-engine CLI
tests/              Node built-in tests
docs/LEARNING.md    Guided exercises and interview questions
docs/CV.md          Truthful CV wording
```

The `dist/` directory contains authored static source; it is tracked in Git and does not require compilation. `npm run source` produces a downloadable ZIP under `dist/download/`. This generated ZIP is ignored by Git and excludes Site identity. The portable hosting manifest in the ZIP can be used for a new static deployment.

## Scope and attribution

Personal portfolio and learning project for **Büşra Buse Uçar**, developed with AI assistance. No AI model is called at runtime. Describe your own implementation, review and testing contributions accurately. This is an MVP for bounded files, not a replacement for spreadsheet software or a production ETL platform.

Not included: XLSX, non-UTF-8 decoding, arbitrary encodings, automatic data repair, schema editing, persistent storage, accounts, shared workspaces, or large-file streaming.

MIT license.
