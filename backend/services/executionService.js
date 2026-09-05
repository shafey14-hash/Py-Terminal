/**
 * executionService.js
 * --------------------
 * Adapter layer between PyTerminal's backend and an external, ALREADY-SANDBOXED
 * code execution provider. The Node process here never runs user code itself -
 * it only forwards project files to the provider and relays the result.
 *
 * Default provider: Piston (https://github.com/engineer-man/piston), a real
 * open-source sandboxed execution engine. The public instance at emkc.org is
 * used by default for convenience, but it is rate-limited (5 req/s) and only
 * has base language runtimes installed (no numpy/pandas/sklearn). For
 * production or full package support, self-host Piston (see /execution/README.md)
 * and point EXECUTION_API_URL at your own instance, or swap this file's
 * implementation for another provider (Judge0, a Firecracker/gVisor service,
 * AWS Lambda with a locked-down runtime, etc). The rest of the app only
 * depends on the exported function signatures below, so the provider is
 * swappable without touching routes/ or the frontend.
 */

const fetch = require("node-fetch");

const PISTON_BASE =
  process.env.EXECUTION_API_URL || "https://emkc.org/api/v2/piston";
const PISTON_KEY = process.env.EXECUTION_API_KEY || ""; // only needed for self-hosted/keyed instances

let cachedPythonVersion = null;
let cachedAt = 0;
const VERSION_CACHE_MS = 10 * 60 * 1000;

async function getPythonVersion() {
  const now = Date.now();
  if (cachedPythonVersion && now - cachedAt < VERSION_CACHE_MS) {
    return cachedPythonVersion;
  }
  const res = await fetch(`${PISTON_BASE}/runtimes`, {
    headers: PISTON_KEY ? { Authorization: PISTON_KEY } : {},
  });
  if (!res.ok) {
    throw new Error(
      `Execution provider unavailable (runtimes lookup failed: ${res.status})`,
    );
  }
  const runtimes = await res.json();
  const py = runtimes.find(
    (r) =>
      r.language === "python" || (r.aliases && r.aliases.includes("python3")),
  );
  if (!py)
    throw new Error("Execution provider has no Python runtime available.");
  cachedPythonVersion = py.version;
  cachedAt = now;
  return cachedPythonVersion;
}

/**
 * Runs a multi-file Python project in the sandbox.
 *
 * @param {Object} opts
 * @param {Array<{path: string, content: string}>} opts.projectFiles - already validated/sanitized
 * @param {string} opts.entryFile - already validated relative path, must be within projectFiles
 * @param {number} opts.timeoutMs - hard run timeout enforced by the provider
 * @param {AbortSignal} [opts.signal] - allows the caller (Stop button) to abort the *request*
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number|null, signal: string|null, timedOut: boolean, durationMs: number}>}
 */
async function runPythonProject({
  projectFiles,
  entryFile,
  timeoutMs,
  signal,
}) {
  const version = await getPythonVersion();

  // Piston wants the entry file first in the files array.
  const orderedFiles = [
    ...projectFiles.filter((f) => f.path === entryFile),
    ...projectFiles.filter((f) => f.path !== entryFile),
  ].map((f) => ({ name: f.path, content: f.content }));

  const body = {
    language: "python",
    version,
    files: orderedFiles,
    run_timeout: timeoutMs,
    compile_timeout: 10000,
    run_memory_limit: -1, // provider-side default/limit applies; public API ignores overrides above its cap
  };

  const start = Date.now();
  let res;
  try {
    res = await fetch(`${PISTON_BASE}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(PISTON_KEY ? { Authorization: PISTON_KEY } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
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

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Execution provider returned ${res.status}: ${text.slice(0, 300)}`,
    );
  }

  const data = await res.json();
  const run = data.run || {};
  const compile = data.compile || {};

  // Piston reports its own timeout via signal === 'SIGKILL' with no clean exit code in some
  // configurations; we treat run_timeout truncation heuristically via duration proximity.
  const timedOut = run.signal === "SIGKILL" && durationMs >= timeoutMs - 250;

  return {
    stdout: (compile.stdout || "") + (run.stdout || ""),
    stderr: (compile.stderr || "") + (run.stderr || ""),
    exitCode: typeof run.code === "number" ? run.code : null,
    signal: run.signal || null,
    timedOut,
    aborted: false,
    durationMs,
  };
}

module.exports = { runPythonProject, getPythonVersion };
