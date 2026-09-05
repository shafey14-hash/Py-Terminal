/**
 * store.js
 * --------
 * Single source of truth for the currently open project.
 * A tiny pub/sub store - no framework needed for this scope.
 *
 * Project shape:
 *   {
 *     name: string,
 *     files: Map<path, { content: string, language: string }>,
 *     folders: Set<path>,          // explicit empty folders
 *     openTabs: string[],          // ordered list of open file paths
 *     activePath: string | null,
 *     entryFile: string | null,
 *     dirty: Set<path>             // unsaved-to-local changes
 *   }
 */

const listeners = new Set();

const state = {
  project: null,
  executionState: "ready", // ready | running | completed | error | stopped
  lastRunResult: null,
  settings: loadSettings(),
};

function loadSettings() {
  try {
    const raw = localStorage.getItem("pyterminal:settings");
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch (e) {
    /* ignore corrupt settings */
  }
  return defaultSettings();
}

function defaultSettings() {
  return {
    theme: "dark",
    editorFontSize: 14,
    tabSize: 4,
    wordWrap: "off",
    errorSoundEnabled: true,
    outputMode: "terminal", // terminal | final | simulated
    autoSave: true,
    apiBaseUrl:
      window.PYTERMINAL_CONFIG?.apiBaseUrl || "http://localhost:4000/api",
  };
}

function saveSettings() {
  localStorage.setItem("pyterminal:settings", JSON.stringify(state.settings));
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(eventName, payload) {
  for (const fn of listeners) fn(eventName, payload, state);
}

function languageForPath(path) {
  const ext = path.split(".").pop().toLowerCase();
  const map = {
    py: "python",
    txt: "plaintext",
    csv: "plaintext",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    js: "javascript",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext] || "plaintext";
}

function newProject(name = "my-project") {
  state.project = {
    name,
    files: new Map([
      [
        "main.py",
        { content: 'print("Hello from PyTerminal!")\n', language: "python" },
      ],
    ]),
    folders: new Set(),
    openTabs: ["main.py"],
    activePath: "main.py",
    entryFile: "main.py",
    dirty: new Set(),
  };
  emit("project:loaded", state.project);
}

function loadProject(projectData) {
  const files = new Map();
  for (const [path, f] of Object.entries(projectData.files || {})) {
    files.set(path, { content: f.content, language: languageForPath(path) });
  }
  const pyFiles = [...files.keys()].filter((p) => p.endsWith(".py"));
  const entryFile =
    projectData.entryFile && files.has(projectData.entryFile)
      ? projectData.entryFile
      : files.has("main.py")
        ? "main.py"
        : pyFiles[0] || null;

  state.project = {
    name: projectData.name || "project",
    files,
    folders: new Set(projectData.folders || []),
    openTabs: entryFile ? [entryFile] : [],
    activePath: entryFile,
    entryFile,
    dirty: new Set(),
  };
  emit("project:loaded", state.project);
}

function serializeProject() {
  const p = state.project;
  const files = {};
  for (const [path, f] of p.files.entries())
    files[path] = { content: f.content };
  return {
    name: p.name,
    files,
    folders: [...p.folders],
    entryFile: p.entryFile,
    savedAt: new Date().toISOString(),
  };
}

function createFile(path, content = "") {
  const p = state.project;
  if (p.files.has(path)) throw new Error("A file already exists at that path.");
  p.files.set(path, { content, language: languageForPath(path) });
  // Implicitly materialize parent folders
  materializeParents(path);
  emit("file:created", path);
  openFile(path);
}

function createFolder(path) {
  const p = state.project;
  const normalized = path.replace(/\/+$/, "");
  if (p.folders.has(normalized))
    throw new Error("A folder already exists at that path.");
  p.folders.add(normalized);
  materializeParents(normalized + "/x");
  emit("folder:created", normalized);
}

function materializeParents(path) {
  const parts = path.split("/");
  parts.pop();
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    state.project.folders.add(acc);
  }
}

function renamePath(oldPath, newPath) {
  const p = state.project;
  if (p.files.has(oldPath)) {
    if (p.files.has(newPath)) throw new Error("Target path already exists.");
    const f = p.files.get(oldPath);
    p.files.delete(oldPath);
    p.files.set(newPath, { ...f, language: languageForPath(newPath) });
    p.openTabs = p.openTabs.map((t) => (t === oldPath ? newPath : t));
    if (p.activePath === oldPath) p.activePath = newPath;
    if (p.entryFile === oldPath) p.entryFile = newPath;
    materializeParents(newPath);
    emit("file:renamed", { oldPath, newPath });
  } else if (p.folders.has(oldPath)) {
    // Rename folder: update folder set + all descendant file/folder paths
    const prefix = oldPath + "/";
    p.folders.delete(oldPath);
    p.folders.add(newPath);
    for (const f of [...p.folders]) {
      if (f.startsWith(prefix)) {
        p.folders.delete(f);
        p.folders.add(newPath + "/" + f.slice(prefix.length));
      }
    }
    for (const [filePath, data] of [...p.files.entries()]) {
      if (filePath.startsWith(prefix)) {
        const updated = newPath + "/" + filePath.slice(prefix.length);
        p.files.delete(filePath);
        p.files.set(updated, data);
        p.openTabs = p.openTabs.map((t) => (t === filePath ? updated : t));
        if (p.activePath === filePath) p.activePath = updated;
        if (p.entryFile === filePath) p.entryFile = updated;
      }
    }
    emit("folder:renamed", { oldPath, newPath });
  } else {
    throw new Error("Path not found.");
  }
}

function deletePath(path) {
  const p = state.project;
  if (p.files.has(path)) {
    p.files.delete(path);
    closeTab(path);
    emit("file:deleted", path);
  } else if (p.folders.has(path)) {
    const prefix = path + "/";
    for (const f of [...p.folders])
      if (f === path || f.startsWith(prefix)) p.folders.delete(f);
    for (const filePath of [...p.files.keys()]) {
      if (filePath.startsWith(prefix)) {
        p.files.delete(filePath);
        closeTab(filePath);
      }
    }
    emit("folder:deleted", path);
  }
}

function updateFileContent(path, content) {
  const p = state.project;
  const f = p.files.get(path);
  if (!f) return;
  f.content = content;
  p.dirty.add(path);
  emit("file:changed", path);
}

function openFile(path) {
  const p = state.project;
  if (!p.openTabs.includes(path)) p.openTabs.push(path);
  p.activePath = path;
  emit("tab:activated", path);
}

function closeTab(path) {
  const p = state.project;
  const idx = p.openTabs.indexOf(path);
  if (idx === -1) return;
  p.openTabs.splice(idx, 1);
  if (p.activePath === path) {
    p.activePath = p.openTabs[idx] || p.openTabs[p.openTabs.length - 1] || null;
    emit("tab:activated", p.activePath);
  }
  emit("tab:closed", path);
}

function setEntryFile(path) {
  state.project.entryFile = path;
  emit("project:entryChanged", path);
}

function setExecutionState(next, result = null) {
  state.executionState = next;
  if (result) state.lastRunResult = result;
  emit("execution:state", next);
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  emit("settings:changed", { key, value });
}

export const Store = {
  state,
  subscribe,
  languageForPath,
  newProject,
  loadProject,
  serializeProject,
  createFile,
  createFolder,
  renamePath,
  deletePath,
  updateFileContent,
  openFile,
  closeTab,
  setEntryFile,
  setExecutionState,
  updateSetting,
};
