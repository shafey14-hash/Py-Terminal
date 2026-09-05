/**
 * editor.js
 * ---------
 * Thin wrapper around Monaco: creates one editor instance, swaps its model
 * per open tab (so undo history / scroll position is preserved per file),
 * and renders the tab strip.
 */

import { Store } from "./store.js";
import { autosaveProject } from "./fileSystem.js";

let editorInstance = null;
let monacoRef = null;
const models = new Map(); // path -> monaco.editor.ITextModel

export function initEditor(monaco, containerEl) {
  monacoRef = monaco;

  monaco.editor.defineTheme("pyterminal-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1e1e1e",
    },
  });

  editorInstance = monaco.editor.create(containerEl, {
    theme: "pyterminal-dark",
    fontSize: Store.state.settings.editorFontSize,
    tabSize: Store.state.settings.tabSize,
    wordWrap: Store.state.settings.wordWrap,
    automaticLayout: true,
    minimap: { enabled: window.innerWidth > 900 },
    scrollBeyondLastLine: false,
  });

  editorInstance.onDidChangeModelContent(() => {
    const path = Store.state.project?.activePath;
    if (!path) return;
    const value = editorInstance.getValue();
    Store.updateFileContent(path, value);
    scheduleAutosave();
  });

  // Ctrl/Cmd+S -> local save (handled by projectManager via a custom event)
  editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    window.dispatchEvent(new CustomEvent("pyterminal:save-requested"));
  });

  renderActiveFile();

  Store.subscribe((event, payload) => {
    if (event === "tab:activated") renderActiveFile();
    if (event === "file:deleted" || event === "file:renamed")
      syncModelsWithProject();
    if (event === "project:loaded") {
      disposeAllModels();
      renderActiveFile();
    }
    if (event === "settings:changed") applySettings();
  });

  return editorInstance;
}

let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => autosaveProject().catch(() => {}), 800);
}

function getOrCreateModel(path) {
  const project = Store.state.project;
  const file = project.files.get(path);
  if (!file) return null;

  if (models.has(path)) return models.get(path);

  const uri = monacoRef.Uri.parse(`file:///${encodeURI(path)}`);
  const model = monacoRef.editor.createModel(file.content, file.language, uri);
  models.set(path, model);
  return model;
}

function renderActiveFile() {
  const project = Store.state.project;
  if (!project || !project.activePath) {
    editorInstance?.setModel(null);
    renderTabs();
    return;
  }
  const model = getOrCreateModel(project.activePath);
  if (model) editorInstance.setModel(model);
  renderTabs();
}

function syncModelsWithProject() {
  const project = Store.state.project;
  for (const path of [...models.keys()]) {
    if (!project.files.has(path)) {
      models.get(path).dispose();
      models.delete(path);
    }
  }
  renderTabs();
}

function disposeAllModels() {
  for (const model of models.values()) model.dispose();
  models.clear();
}

function applySettings() {
  const s = Store.state.settings;
  editorInstance?.updateOptions({
    fontSize: s.editorFontSize,
    tabSize: s.tabSize,
    wordWrap: s.wordWrap,
  });
}

export function insertTextAtCursor(text) {
  if (!editorInstance) return;
  const selection = editorInstance.getSelection();
  editorInstance.executeEdits("ai-insert", [
    { range: selection, text, forceMoveMarkers: true },
  ]);
  editorInstance.focus();
}

export function getSelectedText() {
  if (!editorInstance) return "";
  const sel = editorInstance.getSelection();
  return editorInstance.getModel()?.getValueInRange(sel) || "";
}

// ---------- Tab strip UI ----------

function renderTabs() {
  const el = document.getElementById("tab-strip");
  if (!el) return;
  const project = Store.state.project;
  el.innerHTML = "";
  if (!project) return;

  for (const path of project.openTabs) {
    const tab = document.createElement("div");
    tab.className = "tab" + (path === project.activePath ? " active" : "");
    tab.title = path;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = path.split("/").pop();
    if (project.dirty.has(path)) label.textContent += " \u25CF";
    tab.appendChild(label);

    const close = document.createElement("button");
    close.className = "tab-close";
    close.setAttribute("aria-label", `Close ${path}`);
    close.textContent = "\u00D7";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      Store.closeTab(path);
    });
    tab.appendChild(close);

    tab.addEventListener("click", () => Store.openFile(path));
    el.appendChild(tab);
  }
}

export function getEditorInstance() {
  return editorInstance;
}
