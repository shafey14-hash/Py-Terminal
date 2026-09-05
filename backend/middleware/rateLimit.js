const rateLimit = require("express-rate-limit");

// Generous but real limits - tune via env if needed.
const runLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RUN_RATE_LIMIT_PER_MIN || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many run requests. Please wait a moment and try again.",
  },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MIN || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many AI requests. Please wait a moment and try again.",
  },
});

module.exports = { runLimiter, aiLimiter };
