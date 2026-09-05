const { validateRunRequest } = require("../utils/sanitize");

const limits = {
  maxFileCount: Number(process.env.MAX_FILE_COUNT || 60),
  maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_BYTES || 1_000_000), // 1MB per file
  maxProjectSizeBytes: Number(process.env.MAX_PROJECT_SIZE_BYTES || 5_000_000), // 5MB per project
  maxTimeoutMs: Number(process.env.MAX_TIMEOUT_MS || 10_000),
  minTimeoutMs: 1000,
};

function validateRunBody(req, res, next) {
  const result = validateRunRequest(req.body, limits);
  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  // Clamp timeout to configured bounds regardless of what client sent.
  const requested = Number(req.body.timeoutMs) || limits.maxTimeoutMs;
  req.body.timeoutMs = Math.min(
    Math.max(requested, limits.minTimeoutMs),
    limits.maxTimeoutMs,
  );

  next();
}

module.exports = { validateRunBody, limits };
