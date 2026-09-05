const express = require("express");
const {
  askGemini,
  isConfigured,
  PROMPTS,
} = require("../services/geminiService");
const { aiLimiter } = require("../middleware/rateLimit");

const router = express.Router();

const MAX_CODE_LEN = 20000;

function trim(s) {
  return typeof s === "string" ? s.slice(0, MAX_CODE_LEN) : "";
}

router.get("/status", (req, res) => {
  res.json({ configured: isConfigured() });
});

router.post("/explain", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(PROMPTS.explainCode(trim(req.body?.code)));
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post("/explain-error", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(
      PROMPTS.explainError(trim(req.body?.code), trim(req.body?.error)),
    );
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post("/fix", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(
      PROMPTS.fixError(trim(req.body?.code), trim(req.body?.error)),
    );
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post("/suggest", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(
      PROMPTS.suggestImprovement(trim(req.body?.code)),
    );
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post("/generate", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(
      PROMPTS.generateCode(trim(req.body?.instruction)),
    );
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

router.post("/explain-selection", aiLimiter, async (req, res) => {
  try {
    const text = await askGemini(
      PROMPTS.explainSelection(
        trim(req.body?.selection),
        trim(req.body?.context),
      ),
    );
    res.json({ result: text });
  } catch (err) {
    handleAiError(err, res);
  }
});

function handleAiError(err, res) {
  if (err.code === "AI_NOT_CONFIGURED") {
    return res.status(503).json({ error: err.message });
  }
  return res.status(502).json({ error: err.message || "AI request failed." });
}

module.exports = router;
