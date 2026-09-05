/**
 * executionService.js
 * --------------------
 * Adapter layer between PyTerminal's backend and an external, ALREADY-SANDBOXED
 * code execution provider. The Node process here never runs user code itself -
 * it only forwards project files to the provider and relays the result.
 *
 * Provider: Wandbox (https://wandbox.org), a long-running (since 2013), free,
 * publicly accessible online compiler/execution service. No signup, no API
 * key, no card, no per-request billing - genuinely anonymous public access.
 * This project moved here after Piston's public API went whitelist-only
 * (Feb 2026), Judge0's RapidAPI tier turned out to bill per request, and
 * glot.io was unreachable/unusable when tested.
 *
 * Known trade-offs of Wandbox, stated plainly rather than hidden:
 *   - It is a small, community-run free service with no SLA - it can be
 *     slower under load, and there is no guarantee of long-term uptime any
 *     more than any other free option in this list.
 *   - Its "codes" (additional files) mechanism is documented and tested for
 *     flat filenames. Deeply nested folder imports (e.g. utils/helper.py)
 *     are not guaranteed to resolve the same way Piston's did - flat
 *     multi-file projects (all .py files at the project root) are the
 *     best-supported case.
 *   - There is no official documented configurable timeout - we enforce our
 *     own client-side timeout by aborting the request, which stops us from
 *     waiting forever but does not guarantee the remote process is killed
 *     immediately (the same category of limitation noted for every provider
 *     in this file's history - see execution/README.md).
 *
 * Swappable: only this file needs to change to use a different provider.
 * The exported function signatures (runPythonProject, getPythonVersion)
 * are the contract the rest of the app depends on.
 */

const fetch = require("node-fetch");

const WANDBOX_BASE = process.env.WANDBOX_API_URL || "https://wandbox.org/api";
const FALLBACK_COMPILER = "cpython-3.9.1"; // long-lived id, used only if the live list lookup fails

let cachedCompiler = null;
let cachedAt = 0;
const CACHE_MS = 10 * 60 * 1000;

async function getPythonVersion() {
  const compiler = await resolveCompiler();
  return `Python (Wandbox "${compiler}")`;
}

async function resolveCompiler() {
  const now = Date.now();
  if (cachedCompiler && now - cachedAt < CACHE_MS) return cachedCompiler;

  try {
    const res = await fetch(`${WANDBOX_BASE}/list.json`);
    if (!res.ok) throw new Error(`list.json returned ${res.status}`);
    const list = await res.json();
    const pythonCompilers = list.filter(
      (c) => c.language === "Python" && /^cpython-/.test(c.name),
    );
    if (pythonCompilers.length === 0)
      throw new Error("no cpython compilers found");

    // Pick the highest version-looking name (simple string sort works well
    // enough for typical "cpython-3.X.Y" naming).
    pythonCompilers.sort((a, b) => (a.name > b.name ? -1 : 1));
    cachedCompiler = pythonCompilers[0].name;
    cachedAt = now;
    return cachedCompiler;
  } catch (err) {
    // Fall back rather than fail outright - Wandbox keeps old compilers
    // available for a very long time, so this is a reasonable safety net.
    cachedCompiler = FALLBACK_COMPILER;
    cachedAt = now;
    return cachedCompiler;
  }
}

/**
 * Runs a multi-file Python project in the sandbox via Wandbox.
 *
 * @param {Object} opts
 * @param {Array<{path: string, content: string}>} opts.projectFiles
 * @param {string} opts.entryFile
 * @param {number} opts.timeoutMs - enforced client-side (see file header note)
 * @param {AbortSignal} [opts.signal] - external abort, e.g. the Stop button
 */
async function runPythonProject({
  projectFiles,
  entryFile,
  timeoutMs,
  signal,
}) {
  const start = Date.now();
  const compiler = await resolveCompiler();

  const entry = projectFiles.find((f) => f.path === entryFile);
  const others = projectFiles.filter((f) => f.path !== entryFile);

  const body = {
    compiler,
    code: entry.content,
    codes: others.map((f) => ({ file: f.path, code: f.content })),
    stdin: "",
    options: "",
    "compiler-option-raw": "",
    "runtime-option-raw": "",
    save: false,
  };

  // Merge the caller's abort signal (Stop button) with our own timeout into
  // a single controller, since fetch only accepts one signal.
  const localController = new AbortController();
  let timedOutByUs = false;
  const onExternalAbort = () => localController.abort();
  if (signal) {
    if (signal.aborted) localController.abort();
    else signal.addEventListener("abort", onExternalAbort);
  }
  const timer = setTimeout(() => {
    timedOutByUs = true;
    localController.abort();
  }, timeoutMs);

  let res;
  try {
    res = await fetch(`${WANDBOX_BASE}/compile.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: localController.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);

    if (err.name === "AbortError") {
      if (timedOutByUs) {
        return {
          stdout: "",
          stderr: "",
          exitCode: null,
          signal: null,
          timedOut: true,
          aborted: false,
          durationMs: Date.now() - start,
        };
      }
      return {
        stdout: "",
        stderr: "",
        exitCode: null,
        signal: "SIGABRT",
        timedOut: false,
        aborted: true,
        durationMs: Date.now() - start,
      };
    }
    throw new Error(`Could not reach execution provider: ${err.message}`);
  }

  clearTimeout(timer);
  if (signal) signal.removeEventListener("abort", onExternalAbort);

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Execution provider returned ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  const data = await res.json();

  const stdout = data.program_output || "";
  const stderr = [data.compiler_error, data.program_error]
    .filter(Boolean)
    .join("\n");

  const exitCode =
    data.status !== undefined && data.status !== null && data.status !== ""
      ? parseInt(data.status, 10)
      : null;

  // A signal (e.g. SIGKILL/SIGXCPU) with no clean exit status usually means
  // Wandbox's own internal limits killed the process.
  const timedOut = Boolean(data.signal) && exitCode === null;

  return {
    stdout,
    stderr,
    exitCode,
    signal: data.signal || null,
    timedOut,
    aborted: false,
    durationMs,
  };
}

module.exports = { runPythonProject, getPythonVersion };
