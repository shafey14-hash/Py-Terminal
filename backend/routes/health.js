const express = require("express");
const { isConfigured } = require("../services/geminiService");
const { getPythonVersion } = require("../services/executionService");

const router = express.Router();

router.get("/health", async (req, res) => {
  let executionProvider = "unreachable";
  let pythonVersion = null;
  try {
    pythonVersion = await getPythonVersion();
    executionProvider = "ok";
  } catch (err) {
    executionProvider = `error: ${err.message}`;
  }

  res.json({
    status: "ok",
    time: new Date().toISOString(),
    executionProvider,
    pythonVersion,
    aiConfigured: isConfigured(),
  });
});

module.exports = router;
