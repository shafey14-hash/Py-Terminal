/**
 * execution.js
 * ------------
 * Talks to OUR backend (never to the sandbox provider directly), which in
 * turn forwards to the sandboxed execution service. Handles Run/Stop and
 * feeds results to terminal.js for rendering.
 */

import { Store } from "./store.js";
import {
  appendOutput,
  clearOutput,
  renderFinalOutput,
  renderSimulatedOutput,
  showTimedOut,
  showStopped,
} from "./terminal.js";
import { playErrorSound } from "./sound.js";

let currentExecutionId = null;
let runStartTime = null;

function apiBase() {
  return Store.state.settings.apiBaseUrl;
}

export async function runProject() {
  const project = Store.state.project;
  if (!project) return;
  if (!project.entryFile) {
    alert(
      "No entry Python file selected. Choose one in the file explorer or the Run File dropdown.",
    );
    return;
  }

  clearOutput();
  Store.setExecutionState("running");
  runStartTime = performance.now();

  const projectFiles = [...project.files.entries()].map(([path, f]) => ({
    path,
    content: f.content,
  }));

  const outputMode = Store.state.settings.outputMode;

  try {
    const res = await fetch(`${apiBase()}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectFiles,
        entryFile: project.entryFile,
        outputMode,
        timeoutMs: 10000,
      }),
    });

    currentExecutionId = res.headers.get("X-Execution-Id");
    const data = await res.json();

    if (!res.ok) {
      appendOutput(
        `\n[Backend error] ${data.error || "Run request failed."}\n`,
        "stderr",
      );
      Store.setExecutionState("error");
      playErrorSound();
      return;
    }

    if (data.stopped) {
      showStopped();
      Store.setExecutionState("stopped");
      return;
    }

    if (data.timedOut) {
      showTimedOut();
      Store.setExecutionState("error");
      playErrorSound();
      return;
    }

    const isError = data.exitCode !== 0 && data.exitCode !== null;

    if (outputMode === "final") {
      renderFinalOutput(
        data.stdout,
        data.stderr,
        data.exitCode,
        data.durationMs,
      );
    } else if (outputMode === "simulated") {
      await renderSimulatedOutput(
        data.stdout,
        data.stderr,
        data.exitCode,
        data.durationMs,
      );
    } else {
      // terminal mode: render what we have (Piston is non-streaming, so this
      // is a genuine complete result rendered in terminal style - not simulated)
      if (data.stdout) appendOutput(data.stdout, "stdout");
      if (data.stderr) appendOutput(data.stderr, "stderr");
      appendOutput(
        `\n[Process exited with code ${data.exitCode} in ${(data.durationMs / 1000).toFixed(2)}s]\n`,
        "meta",
      );
    }

    Store.setExecutionState(isError ? "error" : "completed", data);
    if (isError) playErrorSound();
  } catch (err) {
    appendOutput(
      `\n[Network error] Could not reach backend: ${err.message}\n`,
      "stderr",
    );
    Store.setExecutionState("error");
    playErrorSound();
  } finally {
    currentExecutionId = null;
  }
}

export async function stopExecution() {
  if (!currentExecutionId) return;
  try {
    await fetch(`${apiBase()}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId: currentExecutionId }),
    });
  } catch (err) {
    // Best-effort - the provider's own timeout is the real backstop.
  }
}

export function getRunElapsedSeconds() {
  if (!runStartTime) return 0;
  return ((performance.now() - runStartTime) / 1000).toFixed(1);
}
