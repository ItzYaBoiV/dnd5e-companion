import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { buildLightMap, collectTorchFixtureLights } from "@/lib/dungeonLightOcclusion";
import { renderIsometricToCanvas } from "@/lib/isometricTileRenderer";
import { renderDungeonToCanvas } from "@/lib/dungeonTileRenderer";
import { ENTITY_PALETTE } from "@/lib/dungeonTilePalettes";
import { buildPlayerTvMapFrame } from "@/lib/playerTvMapFrame";
import type { PlayerMapBroadcast } from "@/lib/playerMapBroadcast";
import {
  PLAYER_LASER_CHANNEL,
  readLaserPointerFromStorage,
  type LaserPointerPayload,
} from "@/lib/playerMapLaser";
import { useBattleTokenImages } from "@/lib/useBattleTokenImages";

const DungeonForge3D = lazy(() => import("@/components/dungeon-forge/DungeonForge3D"));

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
    const params = new URLSearchParams(window.location.search);
    const tvId = params.get("tv");

    let es: EventSource | null = null;
    let pollTimer: number | null = null;
    let closed = false;

    const applyRaw = (raw: unknown) => {
      if (closed || !raw) return;
      setMapState(raw as PlayerMapBroadcast);
    };

    const loadFromServer = async () => {
      if (!tvId) return false;
      try {
        const res = await fetch(`/api/tv/${encodeURIComponent(tvId)}/player-map`);
        if (!res.ok) return false;
        applyRaw(await res.json());
        return true;
      } catch {
        return false;
      }
    };

    const openStream = () => {
      if (!tvId) return;
      if (typeof window.EventSource !== "function") {
        pollTimer = window.setInterval(() => {
          void loadFromServer();
        }, 2000);
        return;
      }
      try {
        es = new EventSource(`/api/tv/${encodeURIComponent(tvId)}/player-map/stream`);
        es.addEventListener("snapshot", (ev) => {
          try {
            applyRaw(JSON.parse((ev as MessageEvent).data));
          } catch {
            /* ignore */
          }
        });
        es.addEventListener("state", (ev) => {
          try {
            applyRaw(JSON.parse((ev as MessageEvent).data));
          } catch {
            /* ignore */
          }
        });
        es.onerror = () => {
          if (pollTimer == null) {
            pollTimer = window.setInterval(() => {
              void loadFromServer();
            }, 4000);
          }
        };
      } catch {
        pollTimer = window.setInterval(() => {
          void loadFromServer();
        }, 2000);
      }
    };

    const pullLocal = () => {
      try {
        const raw = localStorage.getItem("dnd5e-player-map-state");
        if (!raw) return;
        applyRaw(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("dnd5e-player-map");
      bc.onmessage = (ev) => applyRaw(ev.data);
    } catch {
      /* ignore */
    }

    if (tvId) {
      void loadFromServer().then(() => openStream());
    } else {
      pullLocal();
      pollTimer = window.setInterval(pullLocal, 800);
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
      closed = true;
      if (pollTimer != null) window.clearInterval(pollTimer);
      if (es) {
        try {
          es.close();
        } catch {
          /* ignore */
        }
      }
      if (bc) {
        try {
          bc.close();
        } catch {
          /* ignore */
        }
      }
      window.removeEventListener("resize", onResize);
      try {
        visualViewport?.removeEventListener("resize", onResize);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const tvFrame = useMemo(() => buildPlayerTvMapFrame(mapState), [mapState]);

  useEffect(() => {
    setViewWindow(tvFrame?.viewWindow ?? null);
  }, [tvFrame]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!tvFrame || tvFrame.viewMode === "3d") return;
    if (!c) return;

    const { sub, fogAdj, doorOpen, sceneLights, palette, viewWindow } = tvFrame;
    const { bw, bh } = viewWindow;
    const vm = tvFrame.viewMode;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;

    /** Fill viewport width (widescreen TVs); vertical overflow is centered + clipped — letterbars match `fogColor`. */
    const cellPx = Math.max(2, Math.floor(w / Math.max(1, bw)));

    c.width = Math.ceil(bw * cellPx * dpr);
    c.height = Math.ceil(bh * cellPx * dpr);
    c.style.width = `${bw * cellPx}px`;
    c.style.height = `${bh * cellPx}px`;

    const minX = tvFrame.viewWindow.minX;
    const minY = tvFrame.viewWindow.minY;

    const battleTok = (mapState?.battleTokens ?? [])
      .map((t) => ({
        ...t,
        gx: t.gx - minX,
        gy: t.gy - minY,
      }))
      .filter((t) => t.gx >= 0 && t.gy >= 0 && t.gx < bw && t.gy < bh);

    if (vm === "iso") {
      const merged = [...sceneLights, ...collectTorchFixtureLights(sub, bw, bh)];
      const lightMap =
        merged.length > 0
          ? buildLightMap(sub, bw, bh, merged, doorOpen, null, animPhase)
          : null;
      renderIsometricToCanvas(c, {
        grid: sub,
        palette,
        entities: ENTITY_PALETTE,
        tileW: Math.max(16, cellPx * 2),
        tileH: Math.max(8, cellPx),
        wallH: Math.max(12, cellPx * 2),
        animPhase,
        showEnts: false,
        fogCells: fogAdj,
        lightMap,
        cols: bw,
        rows: bh,
      });
    } else {
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
        playerSightRingCells: null,
        depthPass: vm === "depth",
        vignettePass: vm === "depth",
        depthFog: vm === "depth",
        fogUnexploredColor: mapState?.fogColor,
        fogAmbientAnim: true,
        fogFrontierHighlight: true,
      });
    }
  }, [tvFrame, animPhase, tokenImagesVersion, mapState?.battleTokens, mapState?.fogColor]);

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

  const tvParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tv") : null;

  const showTv3d = tvFrame?.viewMode === "3d" && tvFrame.sub.length > 0;

  const fogBackdrop = mapState?.fogColor ?? "#1f1a15";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: fogBackdrop }}
    >
      <div className="relative inline-block max-h-[100dvh] max-w-[100dvw] overflow-hidden">
        {showTv3d ? (
          <Suspense
            fallback={
              <div className="flex h-[100dvh] w-[100dvw] items-center justify-center bg-black text-sm text-zinc-400">
                Loading 3D…
              </div>
            }
          >
            <div className="h-[100dvh] w-[100dvw] max-h-[100dvh] max-w-[100dvw]">
              <DungeonForge3D
                grid={tvFrame!.sub}
                palette={tvFrame!.palette}
                entities={ENTITY_PALETTE}
                fogCells={tvFrame!.fogAdj}
                doorOpen={tvFrame!.doorOpen}
                sceneLights={tvFrame!.sceneLights.length ? tvFrame!.sceneLights : null}
                animPhase={animPhase}
                dungeonLighting={tvFrame!.dungeonLighting}
                mapOutdoorTime={tvFrame!.mapOutdoorTime}
                playerSanitize
                showEnts={false}
              />
            </div>
          </Suspense>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-h-[100dvh] max-w-[100dvw]"
            style={{ imageRendering: "pixelated" }}
            aria-label="Player dungeon map"
          />
        )}
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
      {!mapState?.dungeonData && (
        <div className="absolute text-center font-mono text-neutral-500">
          <div className="mb-2 text-2xl text-neutral-300">
            TV {tvParam ?? "(local)"}
          </div>
          <div className="text-sm">Waiting for the DM to push a map…</div>
        </div>
      )}
    </div>
  );
}
