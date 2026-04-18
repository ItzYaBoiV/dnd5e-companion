import { useEffect, useRef, useState } from "react";

type PlayerState = {
  dungeonData?: { grid: number[][]; rooms: unknown[]; width?: number; height?: number; mapName?: string; entities?: unknown[] };
  revealedCells?: string[];
  revealed?: number[];
  fogColor?: string;
};

function gridDims(dg: NonNullable<PlayerState["dungeonData"]>): { gw: number; gh: number } {
  const gh = Array.isArray(dg.grid) ? dg.grid.length : 0;
  const gw = gh > 0 && Array.isArray(dg.grid[0]) ? dg.grid[0]!.length : 0;
  return {
    gw: gw > 0 ? gw : Math.max(1, Number(dg.width) || 1),
    gh: gh > 0 ? gh : Math.max(1, Number(dg.height) || 1),
  };
}

function parseCellKey(k: string): [number, number] | null {
  const parts = k.split(",");
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.floor(x), Math.floor(y)];
}

/** Bounding box of revealed keys, clamped to grid; empty if no valid keys. */
function revealedBBox(
  keys: string[],
  gw: number,
  gh: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const p = parseCellKey(k);
    if (!p) continue;
    const [x, y] = p;
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export default function DungeonsPlayerPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mapState, setMapState] = useState<PlayerState | null>(null);
  const mapStateRef = useRef<PlayerState | null>(null);
  mapStateRef.current = mapState;

  useEffect(() => {
    const pull = () => {
      try {
        const raw = localStorage.getItem("dnd5e-player-map-state");
        if (!raw) return;
        setMapState(JSON.parse(raw) as PlayerState);
      } catch {
        /* ignore */
      }
    };
    pull();
    const interval = window.setInterval(pull, 800);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("dnd5e-player-map");
      bc.onmessage = (ev) => setMapState(ev.data as PlayerState);
    } catch {
      /* ignore */
    }
    const onResize = () => {
      const st = mapStateRef.current;
      if (st) setMapState({ ...st });
    };
    window.addEventListener("resize", onResize);
    try {
      visualViewport?.addEventListener("resize", onResize);
    } catch {
      /* ignore */
    }
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", onResize);
      try {
        visualViewport?.removeEventListener("resize", onResize);
      } catch {
        /* ignore */
      }
      if (bc) bc.close();
    };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const dg = mapState?.dungeonData;
    if (!c || !dg?.grid) return;

    const { gw, gh } = gridDims(dg);
    if (gw < 1 || gh < 1) return;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;

    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const revealed = new Set(mapState?.revealedCells ?? []);
    const fog = mapState?.fogColor ?? "#000";

    const pad = 2;
    const bbox = revealedBBox([...revealed], gw, gh);
    const useFull = bbox === null || revealed.size === 0;
    let minX = 0;
    let minY = 0;
    let maxX = gw - 1;
    let maxY = gh - 1;
    if (bbox && !useFull) {
      minX = Math.max(0, bbox.minX - pad);
      minY = Math.max(0, bbox.minY - pad);
      maxX = Math.min(gw - 1, bbox.maxX + pad);
      maxY = Math.min(gh - 1, bbox.maxY + pad);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const cell = Math.max(2, Math.min(Math.floor(w / Math.max(1, bw)), Math.floor(h / Math.max(1, bh))));
    const mapW = bw * cell;
    const mapH = bh * cell;
    const ox = Math.floor((w - mapW) / 2);
    const oy = Math.floor((h - mapH) / 2);

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const key = `${gx},${gy}`;
        const px = ox + (gx - minX) * cell;
        const py = oy + (gy - minY) * cell;
        if (!revealed.has(key)) {
          ctx.fillStyle = fog;
          ctx.fillRect(px, py, cell, cell);
          continue;
        }
        const t = dg.grid[gy]?.[gx];
        ctx.fillStyle = t === 2 ? "#666" : t === 1 ? "#222" : t === 3 ? "#e7c84f" : "#999";
        ctx.fillRect(px, py, cell, cell);
        if (t === 3) {
          ctx.strokeStyle = "#ffd84d";
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1, py + 1, Math.max(1, cell - 2), Math.max(1, cell - 2));
        }
      }
    }
  }, [mapState]);

  return <canvas ref={canvasRef} className="fixed inset-0 bg-black" aria-label="Player dungeon map" />;
}
