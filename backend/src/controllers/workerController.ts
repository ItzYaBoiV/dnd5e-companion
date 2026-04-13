import { Request, Response } from "express";
import * as svc from "../services/workerService";

// GET /api/workers — list all workers + live health status
export const listWorkers = async (_req: Request, res: Response) => {
  const health = await svc.getWorkerHealth();
  const anyOnline = health.some((w) => w.online);
  res.json({ ok: anyOnline, workers: health });
};

// POST /api/workers/register — called by worker install scripts
// Body: { ip: "192.168.5.10", model: "llama3.1:8b", hostname?: "gaming-pc" }
export const registerWorker = async (req: Request, res: Response) => {
  const { ip, model, hostname } = req.body as { ip: string; model: string; hostname?: string };

  if (!ip || !model) {
    res.status(400).json({ error: "ip and model are required" });
    return;
  }

  // Basic IP format check
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    res.status(400).json({ error: "Invalid IP address format" });
    return;
  }

  await svc.registerWorker(ip, model, hostname);
  const label = hostname ? `${hostname} (${ip})` : ip;
  res.json({ ok: true, message: `Worker ${label} (${model}) registered and LiteLLM restarted` });
};

// DELETE /api/workers/:ip — remove a worker
export const removeWorker = async (req: Request<{ ip: string }>, res: Response) => {
  await svc.removeWorker(req.params.ip);
  res.json({ ok: true, message: `Worker ${req.params.ip} removed` });
};

// POST /api/workers/reconcile — poll Ollama on known IPs and refresh LiteLLM config (same as background job)
export const reconcileWorkers = async (_req: Request, res: Response) => {
  const result = await svc.reconcileWorkersFromOllama();
  res.json(result);
};
