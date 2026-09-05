/**
 * app.js
 * ------
 * Entry point. Loads Monaco (AMD loader from CDN), then wires up every module.
 */

import { Store } from "./store.js";
import { initEditor } from "./editor.js";
import { initFileExplorer } from "./fileExplorer.js";
import { initTerminal } from "./terminal.js";
import { runProject, stopExecution } from "./execution.js";
import { initAiPanel } from "./ai.js";
import { initSettingsPanel } from "./settings.js";
import { initProjectManager } from "./projectManager.js";
import { primeAudioOnFirstGesture } from "./sound.js";

primeAudioOnFirstGesture();

window.require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.47.0/min/vs",
  },
});

window.require(["vs/editor/editor.main"], (monaco) => {
  bootstrap(monaco);
});

function bootstrap(monaco) {
  initTerminal();
  initEditor(monaco, document.getElementById("monaco-container"));
  initFileExplorer();
  initProjectManager();
  initAiPanel();
  initSettingsPanel();
  initTopBar();
  initMobileChrome();
  initOutputTabs();
  initResizablePanel();

  Store.subscribe((event, payload) => {
    if (event === "execution:state") updateExecutionBadge(payload);
  });
}

function initTopBar() {
  document.getElementById("btn-run").addEventListener("click", runProject);
  document.getElementById("btn-stop").addEventListener("click", stopExecution);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runProject();
    }
  });
}

function updateExecutionBadge(state) {
  const badge = document.getElementById("execution-badge");
  const runBtn = document.getElementById("btn-run");
  const stopBtn = document.getElementById("btn-stop");
  const labels = {
    ready: "\u25CF Ready",
    running: "\u25CF Running",
    completed: "\u25CF Completed",
    error: "\u25CF Error",
    stopped: "\u25CF Stopped",
  };
  badge.textContent = labels[state] || state;
  badge.className = `exec-badge exec-${state}`;
  runBtn.disabled = state === "running";
  stopBtn.disabled = state !== "running";
}

// ---------- Mobile chrome: drawer, bottom sheet ----------

function initMobileChrome() {
  const explorer = document.getElementById("file-explorer");
  const toggleExplorer = document.getElementById("btn-toggle-explorer");
  const overlay = document.getElementById("mobile-overlay");

  toggleExplorer.addEventListener("click", () => {
    explorer.classList.toggle("open");
    overlay.classList.toggle("show", explorer.classList.contains("open"));
  });
  overlay.addEventListener("click", () => {
    explorer.classList.remove("open");
    overlay.classList.remove("show");
  });

  const bottomPanel = document.getElementById("bottom-panel");
  const handle = document.getElementById("bottom-panel-handle");
  handle.addEventListener("click", () =>
    bottomPanel.classList.toggle("expanded"),
  );
}

function initOutputTabs() {
  const tabs = document.querySelectorAll(".output-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document
        .querySelectorAll(".output-view")
        .forEach((v) => v.classList.remove("active"));
      document
        .getElementById(`output-view-${tab.dataset.view}`)
        .classList.add("active");
    });
  });
}

// ---------- Desktop draggable panel resize ----------

function initResizablePanel() {
  const resizer = document.getElementById("panel-resizer");
  const bottomPanel = document.getElementById("bottom-panel");
  if (!resizer) return;

  let dragging = false;

  resizer.addEventListener("pointerdown", (e) => {
    dragging = true;
    resizer.setPointerCapture(e.pointerId);
  });
  resizer.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const mainRect = document
      .getElementById("main-area")
      .getBoundingClientRect();
    const newHeight = mainRect.bottom - e.clientY;
    const clamped = Math.min(Math.max(newHeight, 100), mainRect.height - 120);
    bottomPanel.style.height = `${clamped}px`;
  });
  resizer.addEventListener("pointerup", () => (dragging = false));
}
