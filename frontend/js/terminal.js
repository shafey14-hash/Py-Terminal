/**
 * terminal.js
 * -----------
 * Renders execution output in the bottom panel. Supports the three
 * output modes described in the spec. "Simulated Live Output" is always
 * clearly labeled as simulated - it is not real process streaming, since
 * the underlying provider returns output only once the run has finished.
 */

let outputEl = null;

export function initTerminal() {
  outputEl = document.getElementById("output-content");
}

export function clearOutput() {
  if (outputEl) outputEl.innerHTML = "";
  appendOutput("$ Running...\n", "meta");
}

export function appendOutput(text, kind = "stdout") {
  if (!outputEl) return;
  const span = document.createElement("span");
  span.className = `out-${kind}`;
  span.textContent = text;
  outputEl.appendChild(span);
  outputEl.scrollTop = outputEl.scrollHeight;
}

export function renderFinalOutput(stdout, stderr, exitCode, durationMs) {
  clearForFinal();
  if (stdout) appendOutput(stdout, "stdout");
  if (stderr) appendOutput(stderr, "stderr");
  appendOutput(
    `\n[Finished. Exit code ${exitCode} - ${(durationMs / 1000).toFixed(2)}s]\n`,
    "meta",
  );
}

function clearForFinal() {
  if (outputEl) outputEl.innerHTML = "";
}

export async function renderSimulatedOutput(
  stdout,
  stderr,
  exitCode,
  durationMs,
) {
  clearForFinal();
  appendOutput(
    "[Simulated Live Output - not real-time streaming, replayed for readability]\n",
    "meta",
  );
  const combined = stdout + (stderr ? stderr : "");
  const lines = combined.split("\n");
  for (const line of lines) {
    appendOutput(line + "\n", "stdout");
    // eslint-disable-next-line no-await-in-loop
    await sleep(35);
  }
  appendOutput(
    `\n[Finished. Exit code ${exitCode} - ${(durationMs / 1000).toFixed(2)}s]\n`,
    "meta",
  );
}

export function showTimedOut() {
  appendOutput("\nExecution timed out.\n", "stderr");
}

export function showStopped() {
  clearForFinal();
  appendOutput("Execution stopped by user.\n", "meta");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
