/**
 * ai.js
 * -----
 * AI assistant panel. Calls our backend only - the Gemini key never
 * touches the browser. If the backend reports it's not configured, we
 * say so plainly instead of faking a response.
 */

import { Store } from "./store.js";
import {
  getEditorInstance,
  insertTextAtCursor,
  getSelectedText,
} from "./editor.js";

function apiBase() {
  return Store.state.settings.apiBaseUrl;
}

export function initAiPanel() {
  const panel = document.getElementById("ai-panel");
  const toggleBtn = document.getElementById("btn-ai");
  const closeBtn = document.getElementById("ai-close");

  toggleBtn.addEventListener("click", () => panel.classList.toggle("open"));
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  document
    .getElementById("ai-explain-code")
    .addEventListener("click", () => runAction("explain"));
  document
    .getElementById("ai-explain-error")
    .addEventListener("click", () => runAction("explain-error"));
  document
    .getElementById("ai-fix-error")
    .addEventListener("click", () => runAction("fix"));
  document
    .getElementById("ai-suggest")
    .addEventListener("click", () => runAction("suggest"));
  document
    .getElementById("ai-explain-selection")
    .addEventListener("click", () => runAction("explain-selection"));

  document
    .getElementById("ai-generate-btn")
    .addEventListener("click", async () => {
      const instruction = document
        .getElementById("ai-generate-input")
        .value.trim();
      if (!instruction) return;
      await runAction("generate", { instruction });
    });

  document.getElementById("ai-insert-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("ai-result");
    if (resultEl.dataset.raw) insertTextAtCursor(resultEl.dataset.raw);
  });

  document.getElementById("ai-copy-btn").addEventListener("click", () => {
    const resultEl = document.getElementById("ai-result");
    if (resultEl.dataset.raw)
      navigator.clipboard?.writeText(resultEl.dataset.raw).catch(() => {});
  });

  checkStatus();
}

async function checkStatus() {
  try {
    const res = await fetch(`${apiBase()}/ai/status`);
    const data = await res.json();
    const statusEl = document.getElementById("ai-status");
    statusEl.textContent = data.configured
      ? "AI assistant ready."
      : "AI assistant not configured (missing GEMINI_API_KEY on backend).";
    statusEl.className = data.configured ? "ai-status ok" : "ai-status warn";
  } catch (err) {
    const statusEl = document.getElementById("ai-status");
    statusEl.textContent = "Could not reach backend to check AI status.";
    statusEl.className = "ai-status warn";
  }
}

function currentCode() {
  return getEditorInstance()?.getValue() || "";
}

function lastError() {
  return Store.state.lastRunResult?.stderr || "";
}

async function runAction(action, extraBody = {}) {
  const resultEl = document.getElementById("ai-result");
  const insertBtn = document.getElementById("ai-insert-btn");
  resultEl.textContent = "Thinking...";
  resultEl.dataset.raw = "";
  insertBtn.disabled = true;

  const endpointMap = {
    explain: { url: "/ai/explain", body: { code: currentCode() } },
    "explain-error": {
      url: "/ai/explain-error",
      body: { code: currentCode(), error: lastError() },
    },
    fix: { url: "/ai/fix", body: { code: currentCode(), error: lastError() } },
    suggest: { url: "/ai/suggest", body: { code: currentCode() } },
    generate: { url: "/ai/generate", body: extraBody },
    "explain-selection": {
      url: "/ai/explain-selection",
      body: { selection: getSelectedText(), context: currentCode() },
    },
  };

  const cfg = endpointMap[action];
  if (action === "explain-selection" && !getSelectedText()) {
    resultEl.textContent = "Select some code in the editor first.";
    return;
  }
  if ((action === "explain-error" || action === "fix") && !lastError()) {
    resultEl.textContent = "No recent error to work from. Run your code first.";
    return;
  }

  try {
    const res = await fetch(`${apiBase()}${cfg.url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg.body),
    });
    const data = await res.json();
    if (!res.ok) {
      resultEl.textContent = data.error || "AI request failed.";
      return;
    }
    resultEl.textContent = data.result;
    resultEl.dataset.raw = data.result;
    if (action === "fix" || action === "generate") insertBtn.disabled = false;
  } catch (err) {
    resultEl.textContent = `Could not reach backend: ${err.message}`;
  }
}
