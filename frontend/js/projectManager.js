/**
 * projectManager.js
 * -----------------
 * New Project / Open (local folder, upload fallback, ZIP) / Save / Download.
 */

import { Store } from "./store.js";
import {
  hasFileSystemAccess,
  openLocalFolder,
  saveProjectToLocalFolder,
  hasOpenLocalFolder,
  readUploadedFiles,
  downloadProjectAsZip,
  importProjectFromZip,
  autosaveProject,
  loadAutosavedProject,
} from "./fileSystem.js";

export function initProjectManager() {
  document
    .getElementById("btn-new-project")
    .addEventListener("click", handleNewProject);
  document
    .getElementById("btn-open-folder")
    .addEventListener("click", handleOpenFolder);
  document
    .getElementById("btn-open-upload")
    .addEventListener("click", () =>
      document.getElementById("upload-input").click(),
    );
  document
    .getElementById("btn-open-zip")
    .addEventListener("click", () =>
      document.getElementById("zip-input").click(),
    );
  document.getElementById("btn-save").addEventListener("click", handleSave);
  document
    .getElementById("btn-download-zip")
    .addEventListener("click", () => downloadProjectAsZip());

  document
    .getElementById("upload-input")
    .addEventListener("change", (e) => handleUpload(e.target.files));
  document
    .getElementById("zip-input")
    .addEventListener("change", (e) => handleZipImport(e.target.files[0]));

  window.addEventListener("pyterminal:save-requested", handleSave);

  if (!hasFileSystemAccess) {
    document.getElementById("btn-open-folder").title =
      "Not supported in this browser - use Upload Folder or Open ZIP instead.";
    document.getElementById("btn-open-folder").disabled = true;
  }

  document
    .getElementById("project-name-label")
    .addEventListener("click", () => {
      const project = Store.state.project;
      if (!project) return;
      const name = prompt("Project name:", project.name);
      if (name) {
        project.name = name;
        document.getElementById("project-name-label").textContent = name;
      }
    });

  Store.subscribe((event, payload) => {
    if (event === "project:loaded") {
      document.getElementById("project-name-label").textContent =
        Store.state.project.name;
      autosaveProject().catch(() => {});
    }
  });

  bootstrapInitialProject();
}

async function bootstrapInitialProject() {
  try {
    const saved = await loadAutosavedProject();
    if (saved) {
      Store.loadProject(saved);
      return;
    }
  } catch (err) {
    // IndexedDB unavailable or empty - fall through to a fresh project.
  }
  Store.newProject();
}

function handleNewProject() {
  if (
    Store.state.project &&
    !confirm(
      "Start a new project? Unsaved local-folder changes are kept, but the current editor session will be replaced.",
    )
  ) {
    return;
  }
  const name = prompt("Project name:", "my-project") || "my-project";
  Store.newProject(name);
}

async function handleOpenFolder() {
  try {
    const data = await openLocalFolder();
    Store.loadProject(data);
  } catch (err) {
    if (err.name !== "AbortError") alert(err.message);
  }
}

function handleUpload(fileList) {
  if (!fileList || fileList.length === 0) return;
  readUploadedFiles(fileList).then((data) => {
    Store.loadProject({ name: "uploaded-project", ...data });
  });
}

async function handleZipImport(file) {
  if (!file) return;
  try {
    const data = await importProjectFromZip(file);
    Store.loadProject(data);
  } catch (err) {
    alert(`Could not read ZIP: ${err.message}`);
  }
}

async function handleSave() {
  await autosaveProject().catch(() => {});
  if (hasOpenLocalFolder()) {
    try {
      await saveProjectToLocalFolder();
      flashStatus("Saved to local folder.");
      return;
    } catch (err) {
      alert(err.message);
      return;
    }
  }
  flashStatus(
    "Saved to browser storage. Use Download ZIP or Open Folder to save to disk.",
  );
}

function flashStatus(message) {
  const el = document.getElementById("status-flash");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}
