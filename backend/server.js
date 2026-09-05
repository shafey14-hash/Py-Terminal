require("dotenv").config();

const express = require("express");
const cors = require("cors");

const runRoutes = require("./routes/run");
const aiRoutes = require("./routes/ai");
const healthRoutes = require("./routes/health");

const app = express();
const PORT = process.env.PORT || 4000;

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser tools (no origin header) and configured origins only.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "6mb" })); // slightly above project size limit to allow JSON overhead

app.use("/api", healthRoutes);
app.use("/api", runRoutes);
app.use("/api/ai", aiRoutes);

// Never leak stack traces / internals to the client.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`PyTerminal backend listening on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
