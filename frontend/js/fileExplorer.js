/**
 * fileExplorer.js
 * ---------------
 * Renders the file/folder tree from Store state and wires up
 * New File / New Folder / Rename / Delete / Open actions.
 */

import { Store } from "./store.js";

const expanded = new Set(); // folder paths currently expanded

export function initFileExplorer() {
  render();
  Store.subscribe((event) => {
    if (
      [
        "project:loaded",
        "file:created",
        "folder:created",
        "file:deleted",
        "folder:deleted",
        "file:renamed",
        "folder:renamed",
        "tab:activated",
        "project:entryChanged",
        "file:changed",
      ].includes(event)
    ) {
      render();
    }
  });

  document
    .getElementById("btn-new-file")
    .addEventListener("click", () => handleNewFile());
  document
    .getElementById("btn-new-folder")
    .addEventListener("click", () => handleNewFolder());
}

function buildTree() {
  const project = Store.state.project;
  const root = { name: "", path: "", type: "folder", children: [] };
  if (!project) return root;

  const nodeMap = new Map([["", root]]);

  function ensureFolder(path) {
    if (nodeMap.has(path)) return nodeMap.get(path);
    const parts = path.split("/");
    const name = parts.pop();
    const parentPath = parts.join("/");
    const parent = ensureFolder(parentPath);
    const node = { name, path, type: "folder", children: [] };
    parent.children.push(node);
    nodeMap.set(path, node);
    return node;
  }

  for (const folder of project.folders) ensureFolder(folder);

  for (const path of project.files.keys()) {
    const parts = path.split("/");
    const name = parts.pop();
    const parentPath = parts.join("/");
    const parent = ensureFolder(parentPath);
    parent.children.push({ name, path, type: "file" });
  }

  sortTree(root);
  return root;
}

function sortTree(node) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach((c) => c.type === "folder" && sortTree(c));
}

function render() {
  const container = document.getElementById("file-tree");
  if (!container) return;
  container.innerHTML = "";
  const project = Store.state.project;
  if (!project) {
    container.innerHTML = '<div class="empty-hint">No project open.</div>';
    return;
  }
  const tree = buildTree();
  container.appendChild(renderNode(tree, 0));
  renderEntrySelector();
}

function renderNode(node, depth) {
  const wrapper = document.createDocumentFragment();
  for (const child of node.children) {
    wrapper.appendChild(renderEntry(child, depth));
    if (child.type === "folder" && expanded.has(child.path)) {
      const childList = document.createElement("div");
      childList.appendChild(renderNode(child, depth + 1));
      wrapper.appendChild(childList);
    }
  }
  const el = document.createElement("div");
  el.appendChild(wrapper);
  return el;
}

function renderEntry(node, depth) {
  const project = Store.state.project;
  const row = document.createElement("div");
  row.className =
    "tree-row" +
    (node.type === "file" && node.path === project.activePath ? " active" : "");
  row.style.paddingLeft = `${10 + depth * 14}px`;
  row.dataset.path = node.path;

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  if (node.type === "folder") {
    icon.textContent = expanded.has(node.path) ? "\u{1F4C2}" : "\u{1F4C1}";
  } else {
    icon.textContent = iconFor(node.name);
  }
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.name;
  if (node.path === project.entryFile) label.title = "Entry point";
  row.appendChild(label);

  if (node.path === project.entryFile) {
    const badge = document.createElement("span");
    badge.className = "entry-badge";
    badge.textContent = "entry";
    row.appendChild(badge);
  }

  const actions = document.createElement("span");
  actions.className = "tree-actions";

  if (node.type === "file" && node.name.endsWith(".py")) {
    const setEntryBtn = smallBtn("\u25B6", "Set as run file", (e) => {
      e.stopPropagation();
      Store.setEntryFile(node.path);
    });
    actions.appendChild(setEntryBtn);
  }

  actions.appendChild(
    smallBtn("\u270E", "Rename", (e) => {
      e.stopPropagation();
      handleRename(node);
    }),
  );
  actions.appendChild(
    smallBtn("\u{1F5D1}", "Delete", (e) => {
      e.stopPropagation();
      handleDelete(node);
    }),
  );
  row.appendChild(actions);

  row.addEventListener("click", () => {
    if (node.type === "folder") {
      expanded.has(node.path)
        ? expanded.delete(node.path)
        : expanded.add(node.path);
      render();
    } else {
      Store.openFile(node.path);
      closeMobileDrawerIfOpen();
    }
  });

  return row;
}

function smallBtn(symbol, title, onClick) {
  const btn = document.createElement("button");
  btn.className = "icon-btn small";
  btn.title = title;
  btn.textContent = symbol;
  btn.addEventListener("click", onClick);
  return btn;
}

function iconFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  const map = {
    py: "\u{1F40D}",
    json: "{}",
    md: "\u{1F4DD}",
    csv: "\u{1F4CA}",
    html: "\u{1F310}",
    css: "\u{1F3A8}",
    js: "\u{1F4DC}",
  };
  return map[ext] || "\u{1F4C4}";
}

function handleNewFile() {
  const project = Store.state.project;
  const parent = currentFolderContext();
  const name = prompt("New file name (e.g. utils/helper.py):", "");
  if (!name) return;
  const path = parent ? `${parent}/${name}` : name;
  try {
    Store.createFile(path, defaultContentFor(path));
  } catch (err) {
    alert(err.message);
  }
}

function handleNewFolder() {
  const parent = currentFolderContext();
  const name = prompt("New folder name:", "");
  if (!name) return;
  const path = parent ? `${parent}/${name}` : name;
  try {
    Store.createFolder(path);
    expanded.add(path);
  } catch (err) {
    alert(err.message);
  }
}

function currentFolderContext() {
  // Simple heuristic: if the active file lives in a folder, default new items there.
  const active = Store.state.project?.activePath;
  if (!active || !active.includes("/")) return "";
  return active.split("/").slice(0, -1).join("/");
}

function defaultContentFor(path) {
  if (path.endsWith(".py")) return "";
  if (path.endsWith(".json")) return "{}\n";
  if (path.endsWith(".md")) return `# ${path.split("/").pop()}\n`;
  return "";
}

function handleRename(node) {
  const newName = prompt("Rename to:", node.name);
  if (!newName || newName === node.name) return;
  const parts = node.path.split("/");
  parts[parts.length - 1] = newName;
  const newPath = parts.join("/");
  try {
    Store.renamePath(node.path, newPath);
  } catch (err) {
    alert(err.message);
  }
}

function handleDelete(node) {
  const label =
    node.type === "folder" ? "folder (and everything inside it)" : "file";
  if (!confirm(`Delete this ${label}? "${node.path}"`)) return;
  Store.deletePath(node.path);
}

function renderEntrySelector() {
  const select = document.getElementById("entry-file-select");
  if (!select) return;
  const project = Store.state.project;
  if (!project) {
    select.innerHTML = "";
    return;
  }
  const pyFiles = [...project.files.keys()].filter((p) => p.endsWith(".py"));
  select.innerHTML = pyFiles
    .map((p) => `<option value="${p}">${p}</option>`)
    .join("");
  if (project.entryFile) select.value = project.entryFile;
  select.onchange = () => Store.setEntryFile(select.value);
}

function closeMobileDrawerIfOpen() {
  const explorer = document.getElementById("file-explorer");
  if (window.innerWidth <= 900) explorer.classList.remove("open");
}
