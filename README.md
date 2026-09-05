# PyTerminal

A lightweight, VS Code-inspired, browser-based Python IDE. Write multi-file
Python projects, run them against a real sandboxed execution service, and get
optional Gemini-powered AI help - all with no login, no database, and a
responsive layout that genuinely works on phones.

This is a working prototype, not a mockup: the Run button calls a real
backend, which calls a real sandboxed execution engine (Piston), which
actually runs your Python and returns real stdout/stderr/exit codes.

---

## 1. Features

- Multi-file / multi-folder Python projects with a VS Code-style file explorer
  (create, rename, delete, expand/collapse, active-file highlighting)
- Monaco editor: syntax highlighting, tabs, bracket matching, folding,
  search/replace, keyboard shortcuts, automatic layout
- Real Python execution via a sandboxed provider (Piston by default),
  including working imports between project files
- Three output modes: Terminal, Final Output, and clearly-labeled Simulated
  Live Output
- Stop button (best-effort abort + hard server-side timeout backstop)
- Readable tracebacks, exit codes, execution time, and an error sound
  (mutable, generated in-browser - no audio asset to host)
- Optional Gemini AI assistant: Explain Code, Explain Error, Fix Error,
  Suggest Improvement, Generate Code, Explain Selection - API key lives only
  on the backend
- Local file handling: File System Access API (Chrome/Edge desktop) for real
  open-folder/save-to-disk, with upload and ZIP fallbacks everywhere else
- IndexedDB autosave so your project survives a page reload
- Fully responsive: collapsible drawer file explorer and bottom-sheet output
  panel on mobile, resizable panel on desktop
- Settings panel: theme, font size, tab size, word wrap, error sound,
  output mode, autosave

## 2. Architecture

The Node backend **never executes user Python itself**. It only forwards
validated file sets to the execution provider and relays the result. This
keeps the "clone" honest to the brief: no `exec`/`eval` of user code inside
the Node process.

## 3. Local development

### Backend

```bash
cd backend
npm install
cp ../.env.example .env
# edit .env: set GEMINI_API_KEY if you want AI features, adjust limits if desired
npm run dev
# -> PyTerminal backend listening on port 4000
```

### Frontend

The frontend is static - no build step. Serve it with any static server, e.g.:

```bash
cd frontend
npx serve .
# or: python3 -m http.server 5173
```

Edit `frontend/js/config.js` to point `apiBaseUrl` at your backend
(`http://localhost:4000/api` by default). You can also change it live from
the Settings panel is not exposed in the UI by design (it's a deploy-time
config), so edit the file directly for a new environment.

Open the served URL - PyTerminal loads directly into the IDE with a starter
`main.py`, no login required.

## 4. Gemini API setup

1. Get a key at https://aistudio.google.com/app/apikey
2. Put it in `backend/.env` as `GEMINI_API_KEY=...`
3. Restart the backend

If the key is missing, the AI panel stays fully visible but clearly reports
"AI assistant not configured" instead of faking a response. The key is never
sent to or readable from the browser.

## 5. Python execution provider setup

See [`execution/README.md`](./execution/README.md) for full details. Short
version: PyTerminal ships pointed at the public Piston API by default, which
works out of the box for standard-library Python but is rate-limited (5
req/s) and has no numpy/pandas/scikit-learn/etc. For real package support or
production traffic, self-host Piston (a few Docker commands) and point
`EXECUTION_API_URL` at it, or swap the adapter for Judge0/AWS Lambda/your own
sandbox - only `backend/services/executionService.js` needs to change.

## 6. Environment variables

See `.env.example` for the full list. Key ones:

| Variable                                                            | Purpose                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `PORT`                                                              | Backend port                                                       |
| `ALLOWED_ORIGINS`                                                   | CORS allowlist for your deployed frontend                          |
| `GEMINI_API_KEY`                                                    | Enables the AI panel; leave blank to disable it gracefully         |
| `EXECUTION_API_URL`                                                 | Sandboxed execution provider base URL                              |
| `MAX_FILE_COUNT` / `MAX_FILE_SIZE_BYTES` / `MAX_PROJECT_SIZE_BYTES` | Upload/run limits, shown in the app rather than hardcoded silently |
| `MAX_TIMEOUT_MS`                                                    | Hard ceiling on execution time (infinite-loop protection)          |

## 7. Deployment

**Frontend -> Vercel:** deploy the `frontend/` directory as a static site
(a `vercel.json` is included). Set `apiBaseUrl` in `js/config.js` to your
backend's public URL before deploying, or template it at build time in your
own CI if you prefer.

**Backend -> anywhere that runs Node** (Render, Fly.io, Railway, a VPS, etc).
Vercel's serverless functions are not a good fit for long-running or
timeout-sensitive execution orchestration, so the backend is deployed
separately, as the brief requires. Set all variables from `.env.example` in
your host's environment/secrets manager - never commit a real `.env`.

## 8. Security considerations

- User Python code is never run inside the Node process; it is only ever
  forwarded to an external sandboxed provider.
- All file paths from the client are validated against path traversal
  (`../`, absolute paths, null bytes) before use - see
  `backend/utils/sanitize.js`.
- File count, per-file size, and total project size are capped and
  configurable via environment variables, not hardcoded.
- API rate limiting is applied per-route (`/api/run`, `/api/ai/*`).
- The Gemini API key and execution-provider key (if any) live only in backend
  environment variables and are never sent to the browser.
- CORS is restricted to an explicit origin allowlist.
- Execution has a hard timeout enforced by the execution provider; an
  infinite loop terminates with "Execution timed out." rather than hanging
  the server.

## 9. Known limitations (stated plainly, not hidden)

- **Stop is best-effort.** Clicking Stop aborts the backend's outbound
  request to the execution provider. Whether the sandboxed process itself
  dies instantly depends on the provider; the guaranteed backstop is the
  provider's own run timeout, which is why a timeout is always enforced.
- **Public Piston has no scientific-computing packages.** numpy/pandas/etc.
  will `ModuleNotFoundError` unless you self-host Piston with those packages
  installed (see `execution/README.md`).
- **Terminal mode is genuine but not streamed token-by-token** - Piston's
  public API returns output only once a run completes, so "Terminal" mode
  shows the real, complete result rather than a live character-by-character
  stream. "Simulated Live Output" mode is explicitly labeled as a replay, not
  real-time streaming, per the spec.
- **File System Access API (real "Open Folder"/"Save to disk") only works in
  Chromium-based desktop browsers.** Firefox, Safari, and all mobile browsers
  fall back to Upload Files / Open ZIP / Download ZIP, which is clearly
  reflected in the UI (the Open Folder button disables itself with an
  explanatory tooltip where unsupported).
- No extension marketplace, no full OS-level terminal, no user accounts - all
  intentionally out of scope per the brief.

## 10. Supported file types

`.py .txt .csv .json .md .html .css .js .xml .yaml .yml`

## 11. Supported Python packages (execution-provider dependent)

Standard library always works. `numpy, pandas, matplotlib, scikit-learn,
scipy, sympy, requests, Pillow, openpyxl, beautifulsoup4, flask, fastapi` are
supported **only if the execution provider has them installed** - true by
default on nothing, achievable by self-hosting Piston (or another provider)
with those packages baked in. The app does not claim otherwise anywhere in
the UI.

## 12. Manual acceptance checklist

- [ ] `print("Hello World")` in `main.py` → prints `Hello World`
- [ ] `main.py` importing from `calculator.py` → import resolves
- [ ] `main.py` reading `dataset.csv` in the same project → file is readable
      during execution
- [ ] `while True: print(...)` → terminates with "Execution timed out."
- [ ] Syntax error → readable traceback + error sound (if enabled)
- [ ] Runtime error (e.g. `NameError`) → traceback + error state badge
- [ ] Open Folder (Chromium desktop) → files populate the explorer
- [ ] Edit + Save → changes persist to the opened folder
- [ ] Download ZIP → produces a ZIP with the full project structure
- [ ] Load on a phone → drawer explorer, bottom-sheet output, no broken
      horizontal scroll, Run/Stop reachable and tappable
- [ ] AI → Explain Error → response appears without any key visible in
      DevTools network tab request/response bodies
