require("dotenv").config();

const express = require("express");
const cors = require("cors");

const runRoutes = require("./routes/run");
const aiRoutes = require("./routes/ai");
const healthRoutes = require("./routes/health");

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "6mb" }));

app.use("/api", healthRoutes);
app.use("/api", runRoutes);
app.use("/api/ai", aiRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: "Internal server error." });
});

// Only start a real listening server when run locally (node server.js).
// On Vercel, api/index.js imports `app` directly and Vercel handles the server part.
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`PyTerminal backend listening on port ${PORT}`);
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  });
}

module.exports = app;