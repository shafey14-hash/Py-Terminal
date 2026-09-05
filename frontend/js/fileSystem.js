/**
 * fileSystem.js
 * -------------
 * Everything related to getting a project INTO the browser and OUT again,
 * without a database:
 *   - IndexedDB: recover the last project automatically between sessions
 *   - File System Access API: open/save a real local folder where the
 *     browser supports it (Chrome/Edge desktop). We NEVER pretend this
 *     works where it doesn't - callers must feature-detect first.
 *   - Upload fallback: <input type=file webkitdirectory> for browsers
 *     without File System Access (Firefox, Safari, all mobile browsers).
 *   - ZIP export/import via JSZip (loaded from CDN in index.html).
 */

import { Store } from "./store.js";

const DB_NAME = "pyterminal";
const DB_VERSION = 1;
const STORE_NAME = "projects";
const AUTOSAVE_KEY = "autosave";

export const hasFileSystemAccess = "showDirectoryPicker" in window;

// ---------- IndexedDB ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function autosaveProject() {
  if (!Store.state.settings.autoSave || !Store.state.project) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(Store.serializeProject(), AUTOSAVE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAutosavedProject() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(AUTOSAVE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// ---------- File System Access API (desktop Chrome/Edge) ----------

let currentDirHandle = null;

export async function openLocalFolder() {
  if (!hasFileSystemAccess) {
    throw new Error(
      "Your browser does not support opening local folders directly.",
    );
  }
  const dirHandle = await window.showDirectoryPicker();
  currentDirHandle = dirHandle;
  const files = {};
  const folders = [];

  async function walk(handle, prefix) {
    for await (const [name, entry] of handle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === "file") {
        if (!isSupportedFile(name)) continue;
        const file = await entry.getFile();
        if (file.size > 2_000_000) continue; // skip huge files defensively
        const content = await file.text();
        files[path] = { content };
      } else if (entry.kind === "directory") {
        folders.push(path);
        await walk(entry, path);
      }
    }
  }
  await walk(dirHandle, "");

  return { name: dirHandle.name, files, folders };
}

export async function saveProjectToLocalFolder() {
  if (!currentDirHandle) {
    throw new Error('No local folder is open. Use "Open Folder" first.');
  }
  const p = Store.state.project;
  for (const [path, f] of p.files.entries()) {
    const handle = await getFileHandleForPath(currentDirHandle, path, true);
    const writable = await handle.createWritable();
    await writable.write(f.content);
    await writable.close();
  }
  p.dirty.clear();
}

async function getFileHandleForPath(rootHandle, path, create) {
  const parts = path.split("/");
  const fileName = parts.pop();
  let dir = rootHandle;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir.getFileHandle(fileName, { create });
}

export function hasOpenLocalFolder() {
  return Boolean(currentDirHandle);
}

// ---------- Upload fallback (works everywhere) ----------

export function isSupportedFile(name) {
  const supported = [
    "py",
    "txt",
    "csv",
    "json",
    "md",
    "html",
    "css",
    "js",
    "xml",
    "yaml",
    "yml",
  ];
  const ext = name.split(".").pop().toLowerCase();
  return supported.includes(ext);
}

export function readUploadedFiles(fileList) {
  return new Promise((resolve) => {
    const files = {};
    const folders = new Set();
    let remaining = fileList.length;
    if (remaining === 0) return resolve({ files, folders: [...folders] });

    [...fileList].forEach((file) => {
      const relPath = file.webkitRelativePath || file.name;
      if (!isSupportedFile(file.name)) {
        remaining--;
        if (remaining === 0) resolve({ files, folders: [...folders] });
        return;
      }
      const parts = relPath.split("/");
      parts.pop();
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        folders.add(acc);
      }
      const reader = new FileReader();
      reader.onload = () => {
        files[relPath] = { content: reader.result };
        remaining--;
        if (remaining === 0) resolve({ files, folders: [...folders] });
      };
      reader.onerror = () => {
        remaining--;
        if (remaining === 0) resolve({ files, folders: [...folders] });
      };
      reader.readAsText(file);
    });
  });
}

// ---------- ZIP export/import (JSZip, loaded via CDN in index.html) ----------

export async function downloadProjectAsZip() {
  const zip = new window.JSZip();
  const p = Store.state.project;
  for (const [path, f] of p.files.entries()) {
    zip.file(path, f.content);
  }
  for (const folder of p.folders) {
    if (![...p.files.keys()].some((f) => f.startsWith(folder + "/"))) {
      zip.folder(folder);
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.name || "project"}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importProjectFromZip(file) {
  const zip = await window.JSZip.loadAsync(file);
  const files = {};
  const folders = new Set();
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) {
      folders.add(entry.name.replace(/\/$/, ""));
      continue;
    }
    if (!isSupportedFile(entry.name)) continue;
    const content = await entry.async("text");
    files[entry.name] = { content };
  }
  return {
    name: file.name.replace(/\.zip$/i, ""),
    files,
    folders: [...folders],
  };
}
