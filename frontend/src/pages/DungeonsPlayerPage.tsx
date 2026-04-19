import { useEffect, useRef, useState } from "react";
import { buildRenderGrid } from "@/lib/dungeonForgeRenderGrid";
import { computeVisibleCellsForPlayer, isOpenFloorLocation } from "@/lib/dungeonForgeFog";
import { renderDungeonToCanvas } from "@/lib/dungeonTileRenderer";
import { DEFAULT_PALETTE, ENTITY_PALETTE, LOCATION_PALETTE } from "@/lib/dungeonTilePalettes";
import type { PlayerMapBroadcast } from "@/lib/playerMapBroadcast";
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
    const doorOpen =
      mapState?.doorOpen === undefined || mapState.doorOpen === null ? null : new Set(mapState.doorOpen);
    const locType = dg.locationType ?? "dungeon";
    const fogCells = computeVisibleCellsForPlayer(revealed, dg, doorOpen, null, {
      openFloor: isOpenFloorLocation(locType),
    });

    const loc = dg.locationType ?? "dungeon";
    const palette = LOCATION_PALETTE[loc] ?? DEFAULT_PALETTE;
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

    const sceneLights = (mapState?.sceneLights ?? []).map((L) => ({
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
    });
  }, [mapState, animPhase, tokenImagesVersion]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <canvas ref={canvasRef} className="max-h-[100dvh] max-w-[100dvw]" style={{ imageRendering: "pixelated" }} aria-label="Player dungeon map" />
    </div>
  );
}
