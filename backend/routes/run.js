const express = require("express");
const { randomUUID } = require("crypto");
const { runPythonProject } = require("../services/executionService");
const { validateRunBody, limits } = require("../middleware/validate");
const { runLimiter } = require("../middleware/rateLimit");

const router = express.Router();

// Tracks in-flight requests so /api/stop can abort the outbound HTTP call.
// NOTE (honest limitation): aborting here cancels OUR request to the sandbox
// provider. Whether the remote process itself dies immediately depends on the
// provider - Piston's own run_timeout is what guarantees eventual termination
// even if a stop request is lost. This is documented in the README.
const inFlight = new Map(); // executionId -> AbortController

router.post("/run", runLimiter, validateRunBody, async (req, res) => {
  const { projectFiles, entryFile, timeoutMs } = req.body;
  const executionId = randomUUID();
  const controller = new AbortController();
  inFlight.set(executionId, controller);

  res.setHeader("X-Execution-Id", executionId);

  try {
    const result = await runPythonProject({
      projectFiles,
      entryFile,
      timeoutMs,
      signal: controller.signal,
    });

    if (result.aborted) {
      return res.status(200).json({
        executionId,
        stopped: true,
        message: "Execution stopped by user.",
      });
    }

    return res.status(200).json({
      executionId,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      timeoutMs,
    });
  } catch (err) {
    return res.status(502).json({
      executionId,
      error: err.message || "Execution failed.",
    });
  } finally {
    inFlight.delete(executionId);
  }
});

router.post("/stop", (req, res) => {
  const { executionId } = req.body || {};
  if (!executionId || !inFlight.has(executionId)) {
    return res
      .status(404)
      .json({ error: "No matching in-flight execution found." });
  }
  inFlight.get(executionId).abort();
  return res.status(200).json({ message: "Stop signal sent." });
});

router.get("/limits", (req, res) => {
  res.json(limits);
});

module.exports = router;
