/**
 * settings.js
 * -----------
 * Lightweight settings panel backed by localStorage via Store.
 */

import { Store } from "./store.js";

export function initSettingsPanel() {
  const panel = document.getElementById("settings-panel");
  document
    .getElementById("btn-settings")
    .addEventListener("click", () => panel.classList.toggle("open"));
  document
    .getElementById("settings-close")
    .addEventListener("click", () => panel.classList.remove("open"));

  const s = Store.state.settings;

  bindSelect("setting-theme", s.theme, (v) => Store.updateSetting("theme", v));
  bindRange("setting-font-size", s.editorFontSize, (v) =>
    Store.updateSetting("editorFontSize", Number(v)),
  );
  bindSelect("setting-tab-size", String(s.tabSize), (v) =>
    Store.updateSetting("tabSize", Number(v)),
  );
  bindSelect("setting-word-wrap", s.wordWrap, (v) =>
    Store.updateSetting("wordWrap", v),
  );
  bindCheckbox("setting-error-sound", s.errorSoundEnabled, (v) =>
    Store.updateSetting("errorSoundEnabled", v),
  );
  bindSelect("setting-output-mode", s.outputMode, (v) =>
    Store.updateSetting("outputMode", v),
  );
  bindCheckbox("setting-autosave", s.autoSave, (v) =>
    Store.updateSetting("autoSave", v),
  );

  checkApiStatus();
}

function bindSelect(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.addEventListener("change", () => onChange(el.value));
}

function bindRange(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  const label = document.getElementById(id + "-value");
  if (label) label.textContent = value;
  el.addEventListener("input", () => {
    if (label) label.textContent = el.value;
    onChange(el.value);
  });
}

function bindCheckbox(id, value, onChange) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = value;
  el.addEventListener("change", () => onChange(el.checked));
}

async function checkApiStatus() {
  const el = document.getElementById("settings-api-status");
  if (!el) return;
  try {
    const res = await fetch(`${Store.state.settings.apiBaseUrl}/health`);
    const data = await res.json();
    el.textContent = `Backend: ${data.status}. Python: ${data.pythonVersion || "unknown"}. AI: ${
      data.aiConfigured ? "configured" : "not configured"
    }.`;
    el.className = "status-line ok";
  } catch (err) {
    el.textContent =
      "Backend unreachable. Check EXECUTION backend URL / that it's running.";
    el.className = "status-line warn";
  }
}
