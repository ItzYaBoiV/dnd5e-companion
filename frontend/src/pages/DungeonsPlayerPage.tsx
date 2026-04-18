import { useEffect, useRef, useState } from "react";
import { buildRenderGrid } from "@/lib/dungeonForgeRenderGrid";
import { computeVisibleCellsForPlayer } from "@/lib/dungeonForgeFog";
import { renderDungeonToCanvas } from "@/lib/dungeonTileRenderer";
import { DEFAULT_PALETTE, ENTITY_PALETTE, LOCATION_PALETTE } from "@/lib/dungeonTilePalettes";

type PlayerDungeonData = {
  grid: number[][];
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx: number; cy: number; [k: string]: unknown }>;
  width?: number;
  height?: number;
  mapName?: string;
  entities?: Array<{ x: number; y: number; type: string; [k: string]: unknown }>;
  decoOverlay?: Array<{ x: number; y: number; ch: string; [k: string]: unknown }>;
  locationType?: string;
  floor?: number;
  glyphs?: Record<string, string>;
};

type PlayerState = {
  dungeonData?: PlayerDungeonData;
  revealedCells?: string[];
  revealed?: number[];
  doorOpen?: string[];
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

/** Bounding box of cell keys, clamped to grid; empty if no valid keys. */
function cellKeysBBox(
  keys: Iterable<string>,
  gw: number,
  gh: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const parts = k.split(",");
    if (parts.length !== 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    if (fx < 0 || fy < 0 || fx >= gw || fy >= gh) continue;
    minX = Math.min(minX, fx);
    minY = Math.min(minY, fy);
    maxX = Math.max(maxX, fx);
    maxY = Math.max(maxY, fy);
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
    const raw = mapState?.dungeonData;
    if (!c || !raw?.grid || !raw.rooms?.length) return;

    const dg = {
      ...raw,
      entities: raw.entities ?? [],
      decoOverlay: raw.decoOverlay ?? [],
      width: raw.width ?? raw.grid[0]?.length ?? 1,
      height: raw.height ?? raw.grid.length ?? 1,
    };

    const { gw, gh } = gridDims(dg);
    if (gw < 1 || gh < 1) return;

    const revealed = new Set(mapState?.revealed ?? []);
    const doorOpen = new Set(mapState?.doorOpen ?? []);
    const fogCells = computeVisibleCellsForPlayer(revealed, dg, doorOpen);

    const loc = dg.locationType ?? "dungeon";
    const palette = LOCATION_PALETTE[loc] ?? DEFAULT_PALETTE;
    const rg = buildRenderGrid(dg, { showThemes: false });

    const bbox = cellKeysBBox(fogCells, gw, gh);
    const useFull = bbox === null || fogCells.size === 0;
    let minX = 0;
    let minY = 0;
    let maxX = gw - 1;
    let maxY = gh - 1;
    const pad = 2;
    if (bbox && !useFull) {
      minX = Math.max(0, bbox.minX - pad);
      minY = Math.max(0, bbox.minY - pad);
      maxX = Math.min(gw - 1, bbox.maxX + pad);
      maxY = Math.min(gh - 1, bbox.maxY + pad);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    const sub: typeof rg = [];
    for (let y = minY; y <= maxY; y++) {
      const row = [];
      for (let x = minX; x <= maxX; x++) {
        row.push(rg[y]![x]!);
      }
      sub.push(row);
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;

    const cellPx = Math.max(
      2,
      Math.min(Math.floor(w / Math.max(1, bw)), Math.floor(h / Math.max(1, bh))),
    );

    c.width = Math.ceil(bw * cellPx * dpr);
    c.height = Math.ceil(bh * cellPx * dpr);
    c.style.width = `${bw * cellPx}px`;
    c.style.height = `${bh * cellPx}px`;

    const fogAdj = new Set<string>();
    for (const k of fogCells) {
      const parts = k.split(",");
      if (parts.length !== 2) continue;
      const gx = Number(parts[0]);
      const gy = Number(parts[1]);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
      fogAdj.add(`${gx - minX},${gy - minY}`);
    }

    renderDungeonToCanvas(c, sub, {
      palette,
      entities: ENTITY_PALETTE,
      cellPx,
      dpr,
      fogCells: fogAdj,
      doorOpen,
      showEnts: false,
      playerSanitize: true,
      inkSaver: false,
    });
  }, [mapState]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <canvas ref={canvasRef} className="max-h-[100dvh] max-w-[100dvw]" style={{ imageRendering: "pixelated" }} aria-label="Player dungeon map" />
    </div>
  );
}
