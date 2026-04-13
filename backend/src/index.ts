import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { router } from "./routes/index";
import { errorHandler } from "./middleware/errorHandler";
import { scheduleWorkerReconcileLoop } from "./services/workerService";
import { appendLogFile, createAccessLogStream, ensureLogDir } from "./util/fileLogger";
const app = express();
const PORT = process.env.PORT ?? 3001;

ensureLogDir();
const accessStream = createAccessLogStream();

// ── Security & parsing middleware ──────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "1mb" }));

if (accessStream) {
  app.use(morgan("combined", { stream: accessStream }));
}
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));

// ── Health check (bypasses API prefix for load balancers) ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── All API routes ─────────────────────────────────────────
app.use("/api", router);

// ── Global error handler (must be last) ───────────────────
app.use(errorHandler);

const server = app.listen(PORT, () => {
  const msg = `D&D 5e API listening on port ${PORT}`;
  console.log(msg);
  appendLogFile("app.log", `START ${msg}`);
  scheduleWorkerReconcileLoop();
});

// Disable Node’s default request/socket limits so a slow LiteLLM/Ollama response is not cut off here.
server.requestTimeout = 0;
server.headersTimeout = 120_000;
server.timeout = 0;

export default app;
