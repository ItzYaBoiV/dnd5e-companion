import type { Request, Response } from "express";
import * as svc from "../services/displayService";

export const listDisplays = async (_req: Request, res: Response) => {
  res.json(await svc.listDisplays());
};

export const renameDisplay = async (req: Request<{ tvId: string }>, res: Response) => {
  const { label } = req.body as { label?: string };
  res.json(await svc.renameDisplay(req.params.tvId, label ?? ""));
};

export const setDisplayMap = async (req: Request<{ tvId: string }>, res: Response) => {
  const row = await svc.setDisplayMapState(req.params.tvId, req.body);
  res.status(201).json(row);
};

export const getDisplayMap = async (req: Request<{ tvId: string }>, res: Response) => {
  res.json(await svc.getDisplayMapState(req.params.tvId));
};

export const streamDisplayMap = async (req: Request<{ tvId: string }>, res: Response) => {
  const tvId = req.params.tvId;
  svc.assertTvId(tvId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const snap = await svc.getDisplayMapState(tvId);
    res.write(`event: snapshot\ndata: ${JSON.stringify(snap)}\n\n`);
  } catch {
    res.write(`event: snapshot\ndata: null\n\n`);
  }

  const hb = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);

  const unsubscribe = svc.displayBus.subscribe(tvId, (state) => {
    try {
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    } catch {
      /* ignore */
    }
  });

  req.on("close", () => {
    clearInterval(hb);
    unsubscribe();
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
};
