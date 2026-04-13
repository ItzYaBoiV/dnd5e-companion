import type { Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";

/** Cloudflare (and some proxies) drop idle responses ~100s; comment pings keep the socket active. */
const SSE_KEEPALIVE_MS = 5_000;

export function acceptsSseLongRunning(req: Request): boolean {
  return (req.get("Accept") || "").toLowerCase().includes("text/event-stream");
}

/**
 * JSON response by default; if client sends Accept: text/event-stream, stream SSE comment pings
 * while `work()` runs, then one `data: <json>` line (same body shape as normal JSON success).
 */
export async function sendLongRunningResult<T>(
  req: Request,
  res: Response,
  options: { successStatus: number },
  work: () => Promise<T>
): Promise<void> {
  if (!acceptsSseLongRunning(req)) {
    const result = await work();
    res.status(options.successStatus).json(result);
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  const resAny = res as Response & { flushHeaders?: () => void };
  if (typeof resAny.flushHeaders === "function") resAny.flushHeaders();

  const ping = (): void => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      /* client disconnected */
    }
  };
  const iv = setInterval(ping, SSE_KEEPALIVE_MS);
  ping();

  try {
    const result = await work();
    clearInterval(iv);
    res.write(`data: ${JSON.stringify(result)}\n\n`);
    res.end();
  } catch (err) {
    clearInterval(iv);
    if (err instanceof AppError) {
      res.write(
        `data: ${JSON.stringify({ error: err.message, code: err.code, status: err.statusCode })}\n\n`
      );
    } else {
      console.error("[sendLongRunningResult]", err);
      res.write(
        `data: ${JSON.stringify({
          error: "An unexpected server error occurred",
          code: "INTERNAL_ERROR",
          status: 500,
        })}\n\n`
      );
    }
    res.end();
  }
}
