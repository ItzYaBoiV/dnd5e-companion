import { useEffect, useRef, useState } from "react";
import { buildRenderGrid } from "@/lib/dungeonForgeRenderGrid";
import {
  computeVisibleCellsForPlayer,
  expandFogWithPlayerTokenVision,
  isOpenFloorLocation,
  maxFogHopsForLocationType,
} from "@/lib/dungeonForgeFog";
import { DEFAULT_PLAYER_VISION_FOG_CELLS, PLAYER_SIGHT_RING_CELLS } from "@/lib/playerMapVision";
import { renderDungeonToCanvas } from "@/lib/dungeonTileRenderer";
import { ENTITY_PALETTE, forgePaletteForDungeon } from "@/lib/dungeonTilePalettes";
import type { PlayerMapBroadcast } from "@/lib/playerMapBroadcast";
import {
  PLAYER_LASER_CHANNEL,
  readLaserPointerFromStorage,
  type LaserPointerPayload,
} from "@/lib/playerMapLaser";
import { useBattleTokenImages } from "@/lib/useBattleTokenImages";

function gridDims(dg: NonNullable<PlayerMapBroadcast["dungeonData"]>): { gw: number; gh: number } {
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
  const [mapState, setMapState] = useState<PlayerMapBroadcast | null>(null);
  const [animPhase, setAnimPhase] = useState(0);
  const mapStateRef = useRef<PlayerMapBroadcast | null>(null);
  mapStateRef.current = mapState;
  const { images: tokenImages, version: tokenImagesVersion } = useBattleTokenImages(mapState?.battleTokens);

  const [laser, setLaser] = useState<LaserPointerPayload | null>(() => readLaserPointerFromStorage());
  const [viewWindow, setViewWindow] = useState<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    bw: number;
    bh: number;
  } | null>(null);

  useEffect(() => {
    const pullLaser = () => setLaser(readLaserPointerFromStorage());
    const id = window.setInterval(pullLaser, 200);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(PLAYER_LASER_CHANNEL);
      bc.onmessage = (ev) => {
        const d = ev.data as { type?: string; gx?: number; gy?: number; ts?: number };
        if (d?.type === "clear") setLaser(null);
        else if (d?.type === "point" && typeof d.gx === "number" && typeof d.gy === "number") {
          setLaser({ gx: d.gx, gy: d.gy, ts: typeof d.ts === "number" ? d.ts : Date.now() });
        }
      };
    } catch {
      /* ignore */
    }
    return () => {
      window.clearInterval(id);
      bc?.close();
    };
  }, []);

  useEffect(() => {
    if (!laser) return;
    const t = window.setInterval(() => {
      setLaser((cur) => (cur && Date.now() - cur.ts > 8000 ? null : cur));
    }, 1000);
    return () => window.clearInterval(t);
  }, [laser]);

  useEffect(() => {
    const id = window.setInterval(() => setAnimPhase((p) => (p + 0.04) % 1), 120);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const pull = () => {
      try {
        const raw = localStorage.getItem("dnd5e-player-map-state");
        if (!raw) return;
        setMapState(JSON.parse(raw) as PlayerMapBroadcast);
      } catch {
        /* ignore */
      }
    };
    pull();
    const interval = window.setInterval(pull, 800);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("dnd5e-player-map");
      bc.onmessage = (ev) => setMapState(ev.data as PlayerMapBroadcast);
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
    if (!c || !raw?.grid || !raw.rooms?.length) {
      setViewWindow(null);
      return;
    }

    const dg = {
      ...raw,
      entities: raw.entities ?? [],
      decoOverlay: raw.decoOverlay ?? [],
      width: raw.width ?? raw.grid[0]?.length ?? 1,
      height: raw.height ?? raw.grid.length ?? 1,
    };

    const { gw, gh } = gridDims(dg);
    if (gw < 1 || gh < 1) {
      setViewWindow(null);
      return;
    }

    const revealed = new Set(mapState?.revealed ?? []);
    const doorOpen =
      mapState?.doorOpen === undefined || mapState.doorOpen === null ? null : new Set(mapState.doorOpen);
    const locType = dg.locationType ?? "dungeon";
    const fogCells = computeVisibleCellsForPlayer(revealed, dg, doorOpen, null, {
      openFloor: isOpenFloorLocation(locType),
      maxFogHops: maxFogHopsForLocationType(locType),
      locationType: locType,
    });
    expandFogWithPlayerTokenVision(
      fogCells,
      dg.grid as number[][],
      mapState?.battleTokens ?? [],
      DEFAULT_PLAYER_VISION_FOG_CELLS,
      locType,
    );

    const palette = forgePaletteForDungeon(dg);
    const rg = buildRenderGrid(dg, { showThemes: false });

    const vc = mapState?.viewCrop;
    let minX = 0;
    let minY = 0;
    let maxX = gw - 1;
    let maxY = gh - 1;
    const pad = 2;

    if (
      vc &&
      Number.isFinite(vc.minX) &&
      Number.isFinite(vc.minY) &&
      Number.isFinite(vc.maxX) &&
      Number.isFinite(vc.maxY) &&
      vc.maxX >= vc.minX &&
      vc.maxY >= vc.minY
    ) {
      minX = Math.max(0, Math.floor(vc.minX));
      minY = Math.max(0, Math.floor(vc.minY));
      maxX = Math.min(gw - 1, Math.floor(vc.maxX));
      maxY = Math.min(gh - 1, Math.floor(vc.maxY));
    } else {
      const bbox = cellKeysBBox(fogCells, gw, gh);
      const useFull = bbox === null || fogCells.size === 0;
      if (bbox && !useFull) {
        minX = Math.max(0, bbox.minX - pad);
        minY = Math.max(0, bbox.minY - pad);
        maxX = Math.min(gw - 1, bbox.maxX + pad);
        maxY = Math.min(gh - 1, bbox.maxY + pad);
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    setViewWindow({ minX, minY, maxX, maxY, bw, bh });

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

    const battleTok = (mapState?.battleTokens ?? [])
      .map((t) => ({
        ...t,
        gx: t.gx - minX,
        gy: t.gy - minY,
      }))
      .filter((t) => t.gx >= 0 && t.gy >= 0 && t.gx < bw && t.gy < bh);

    const sceneLights = (mapState?.sceneLights ?? [])
      .filter((L) => L.kind !== "token")
      .map((L) => ({
      ...L,
      gx: L.gx - minX,
      gy: L.gy - minY,
    }));

    renderDungeonToCanvas(c, sub, {
      palette,
      entities: ENTITY_PALETTE,
      cellPx,
      dpr,
      fogCells: fogAdj,
      doorOpen,
      animPhase,
      showEnts: false,
      playerSanitize: true,
      inkSaver: false,
      battleTokens: battleTok.length ? battleTok : null,
      tokenImages,
      sceneLights: sceneLights.length ? sceneLights : null,
      playerSightRingCells: PLAYER_SIGHT_RING_CELLS,
    });
  }, [mapState, animPhase, tokenImagesVersion]);

  const laserVisible =
    laser &&
    viewWindow &&
    laser.gx >= viewWindow.minX &&
    laser.gx <= viewWindow.maxX &&
    laser.gy >= viewWindow.minY &&
    laser.gy <= viewWindow.maxY;

  const laserLeftPct =
    laserVisible && viewWindow ? ((laser!.gx - viewWindow.minX + 0.5) / viewWindow.bw) * 100 : 0;
  const laserTopPct =
    laserVisible && viewWindow ? ((laser!.gy - viewWindow.minY + 0.5) / viewWindow.bh) * 100 : 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className="relative inline-block max-h-[100dvh] max-w-[100dvw]">
        <canvas
          ref={canvasRef}
          className="max-h-[100dvh] max-w-[100dvw]"
          style={{ imageRendering: "pixelated" }}
          aria-label="Player dungeon map"
        />
        {laserVisible && (
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-pulse"
            style={{
              left: `${laserLeftPct}%`,
              top: `${laserTopPct}%`,
              boxShadow:
                "0 0 10px 3px rgba(255,60,60,0.95), 0 0 24px 6px rgba(255,100,80,0.55)",
              background: "rgba(255,70,70,0.98)",
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
