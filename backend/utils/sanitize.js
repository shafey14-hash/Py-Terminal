/**
 * sanitize.js
 * -----------
 * Path and payload sanitization for anything that came from the browser.
 * NEVER trust a file path or filename supplied by the client.
 */

const MAX_PATH_LENGTH = 260;

/**
 * Validates a relative project file path.
 * Rejects: absolute paths, parent-directory traversal, null bytes,
 * empty segments, and anything that isn't plain ASCII-ish text.
 */
function isSafeRelativePath(p) {
  if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_LENGTH) {
    return false;
  }
  if (p.includes("\0")) return false;
  // Reject absolute paths (unix or windows) and home-dir expansion
  if (
    p.startsWith("/") ||
    p.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(p) ||
    p.startsWith("~")
  ) {
    return false;
  }
  const segments = p.split(/[\\/]/);
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return false;
    // Disallow control characters and characters unsafe on common filesystems
    if (/[\x00-\x1f<>:"|?*]/.test(seg)) return false;
  }
  return true;
}

/**
 * Normalizes a path to forward slashes and strips any leading slash.
 * Only call this AFTER isSafeRelativePath() has returned true.
 */
function normalizeRelativePath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Validates the overall shape of a run request body.
 * Returns { valid: boolean, error?: string }
 */
function validateRunRequest(body, limits) {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object." };
  }
  const { projectFiles, entryFile } = body;

  if (!Array.isArray(projectFiles) || projectFiles.length === 0) {
    return { valid: false, error: "projectFiles must be a non-empty array." };
  }
  if (projectFiles.length > limits.maxFileCount) {
    return {
      valid: false,
      error: `Project exceeds max file count (${limits.maxFileCount}).`,
    };
  }
  if (typeof entryFile !== "string" || !isSafeRelativePath(entryFile)) {
    return { valid: false, error: "entryFile is missing or invalid." };
  }

  let totalSize = 0;
  const seenPaths = new Set();

  for (const f of projectFiles) {
    if (!f || typeof f !== "object") {
      return { valid: false, error: "Each project file must be an object." };
    }
    const { path, content } = f;
    if (!isSafeRelativePath(path)) {
      return {
        valid: false,
        error: `Unsafe or invalid file path: ${String(path)}`,
      };
    }
    if (typeof content !== "string") {
      return {
        valid: false,
        error: `File content must be a string for: ${path}`,
      };
    }
    const normalized = normalizeRelativePath(path);
    if (seenPaths.has(normalized)) {
      return { valid: false, error: `Duplicate file path: ${path}` };
    }
    seenPaths.add(normalized);

    const size = Buffer.byteLength(content, "utf8");
    if (size > limits.maxFileSizeBytes) {
      return {
        valid: false,
        error: `File "${path}" exceeds max individual size.`,
      };
    }
    totalSize += size;
  }

  if (totalSize > limits.maxProjectSizeBytes) {
    return {
      valid: false,
      error: "Total project size exceeds the configured limit.",
    };
  }

  const entryNormalized = normalizeRelativePath(entryFile);
  if (!seenPaths.has(entryNormalized)) {
    return {
      valid: false,
      error: "entryFile does not match any provided project file.",
    };
  }
  if (!entryNormalized.endsWith(".py")) {
    return { valid: false, error: "entryFile must be a .py file." };
  }

  return { valid: true };
}

module.exports = {
  isSafeRelativePath,
  normalizeRelativePath,
  validateRunRequest,
};
