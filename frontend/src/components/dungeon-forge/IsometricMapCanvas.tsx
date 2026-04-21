import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { DungeonMapCanvasProps } from "@/components/dungeon-forge/DungeonMapCanvas";
import { buildLightMap, collectTorchFixtureLights } from "@/lib/dungeonLightOcclusion";
import {
  defaultIsoCameraPan,
  getIsometricMapSpan,
  isoWorldToGrid,
  renderIsometricToCanvas,
} from "@/lib/isometricTileRenderer";

export type IsometricMapCanvasProps = Omit<DungeonMapCanvasProps, "cellPx"> & {
  tileW?: number;
  tileH?: number;
  wallH?: number;
  /** When true (default), map fills the container and uses pan/zoom + minimap. */
  isoCameraEnabled?: boolean;
  showMinimap?: boolean;
};

export type IsometricMapCanvasHandle = {
  resetCamera: () => void;
};

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.0;

const IsometricMapCanvasInner = forwardRef<IsometricMapCanvasHandle, IsometricMapCanvasProps>(
  function IsometricMapCanvasInner(
    {
      grid,
      palette,
      entities,
      fogCells,
      showEnts = true,
      doorOpen,
      doorStates,
      animPhase,
      sceneLights,
      mapOutdoorTime,
      className,
      style,
      tileW = 64,
      tileH = 32,
      wallH = 30,
      onCellClick,
      isoCameraEnabled = true,
      showMinimap = true,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [viewport, setViewport] = useState({ w: 0, h: 0 });
    const [cam, setCam] = useState({ zoom: 1, panX: 0, panY: 0 });
    const structKeyRef = useRef("");
    const dragRef = useRef({ active: false, px: 0, py: 0, moved: false });

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        const r = el.getBoundingClientRect();
        setViewport({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
      });
      ro.observe(el);
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.max(0, Math.floor(r.width)), h: Math.max(0, Math.floor(r.height)) });
      return () => ro.disconnect();
    }, []);

    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;

    const centerCamera = useCallback(
      (zoom: number) => {
        if (viewport.w < 32 || viewport.h < 32 || cols === 0) return;
        const { spanW, spanH } = getIsometricMapSpan(cols, rows, tileW, tileH, wallH);
        const { panX, panY } = defaultIsoCameraPan(viewport.w, viewport.h, spanW, spanH, zoom);
        setCam({ zoom, panX, panY });
      },
      [cols, rows, tileW, tileH, wallH, viewport.w, viewport.h],
    );

    useEffect(() => {
      const key = `${cols}x${rows}-${tileW}-${tileH}-${wallH}-${viewport.w}x${viewport.h}`;
      if (!isoCameraEnabled || viewport.w < 32 || viewport.h < 32 || cols === 0) return;
      if (structKeyRef.current === key) return;
      structKeyRef.current = key;
      centerCamera(1);
    }, [cols, rows, tileW, tileH, wallH, viewport.w, viewport.h, isoCameraEnabled, centerCamera]);

    useImperativeHandle(
      ref,
      () => ({
        resetCamera: () => centerCamera(1),
      }),
      [centerCamera],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || grid.length === 0) return;
      const merged = [...(sceneLights ?? [])];
      merged.push(...collectTorchFixtureLights(grid, cols, rows));
      const lightMap =
        merged.length > 0
          ? buildLightMap(grid, cols, rows, merged, doorOpen ?? null, doorStates ?? null, animPhase ?? 0)
          : null;

      const useVp = isoCameraEnabled && viewport.w >= 32 && viewport.h >= 32;

      renderIsometricToCanvas(canvas, {
        grid,
        palette,
        entities,
        tileW,
        tileH,
        wallH,
        animPhase,
        showEnts,
        fogCells: fogCells ?? null,
        lightMap,
        cols,
        rows,
        viewportCss: useVp ? { w: viewport.w, h: viewport.h } : null,
        cameraZoom: useVp ? cam.zoom : 1,
        cameraPanX: useVp ? cam.panX : 0,
        cameraPanY: useVp ? cam.panY : 0,
        showMinimap: useVp && showMinimap,
        mapOutdoorTime,
      });
    }, [
      grid,
      palette,
      entities,
      fogCells,
      showEnts,
      doorOpen,
      doorStates,
      animPhase,
      sceneLights,
      mapOutdoorTime,
      tileW,
      tileH,
      wallH,
      cols,
      rows,
      isoCameraEnabled,
      viewport.w,
      viewport.h,
      cam.zoom,
      cam.panX,
      cam.panY,
      showMinimap,
    ]);

    const onWheel = useCallback(
      (e: React.WheelEvent<HTMLCanvasElement>) => {
        if (!isoCameraEnabled || viewport.w < 32) return;
        e.preventDefault();
        e.stopPropagation();
        const canvas = canvasRef.current;
        if (!canvas || cols === 0) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setCam((prev) => {
          const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom + e.deltaY * -0.001));
          const wx = (mx - prev.panX) / prev.zoom;
          const wy = (my - prev.panY) / prev.zoom;
          return {
            zoom: nextZoom,
            panX: mx - wx * nextZoom,
            panY: my - wy * nextZoom,
          };
        });
      },
      [cols, isoCameraEnabled, viewport.w],
    );

    const endDrag = useCallback(() => {
      dragRef.current = { active: false, px: 0, py: 0, moved: false };
    }, []);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { active: true, px: e.clientX, py: e.clientY, moved: false };
    }, []);

    const onPointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.stopPropagation();
        if (e.buttons === 0 && dragRef.current.active) {
          endDrag();
          return;
        }
        if (!dragRef.current.active || !isoCameraEnabled || viewport.w < 32) return;
        const dx = e.clientX - dragRef.current.px;
        const dy = e.clientY - dragRef.current.py;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragRef.current.moved = true;
        dragRef.current.px = e.clientX;
        dragRef.current.py = e.clientY;
        setCam((c) => ({ ...c, panX: c.panX + dx, panY: c.panY + dy }));
      },
      [isoCameraEnabled, viewport.w, endDrag],
    );

    const onPointerUp = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.stopPropagation();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        const wasDrag = dragRef.current.moved;
        dragRef.current.active = false;
        if (wasDrag || !onCellClick || !isoCameraEnabled || viewport.w < 32 || cols === 0) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const vw = viewport.w;
        if (showMinimap && mx >= vw - 120 - 8 && my >= 8 && my <= 8 + 80 && mx <= vw) return;
        const wx = (mx - cam.panX) / cam.zoom;
        const wy = (my - cam.panY) / cam.zoom;
        const { gx, gy } = isoWorldToGrid(wx, wy, cols, rows, tileW, tileH, wallH);
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return;
        const cell = grid[gy]![gx]!;
        onCellClick(gx, gy, cell);
      },
      [onCellClick, isoCameraEnabled, viewport.w, cols, rows, tileW, tileH, wallH, grid, cam, showMinimap],
    );

    const onLostPointerCapture = useCallback(() => {
      endDrag();
    }, [endDrag]);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!isoCameraEnabled || viewport.w < 32) return;
        let dz = 0;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = 32;
        if (e.key === "ArrowRight") dx = -32;
        if (e.key === "ArrowUp") dy = 32;
        if (e.key === "ArrowDown") dy = -32;
        if (e.key === "+" || e.key === "=") dz = 0.1;
        if (e.key === "-" || e.key === "_") dz = -0.1;
        if (dx === 0 && dy === 0 && dz === 0) return;
        e.preventDefault();
        if (dx !== 0 || dy !== 0) {
          setCam((c) => ({ ...c, panX: c.panX + dx, panY: c.panY + dy }));
        }
        if (dz !== 0) {
          setCam((prev) => {
            const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom + dz));
            const mx = viewport.w / 2;
            const my = viewport.h / 2;
            const wx = (mx - prev.panX) / prev.zoom;
            const wy = (my - prev.panY) / prev.zoom;
            return {
              zoom: nextZoom,
              panX: mx - wx * nextZoom,
              panY: my - wy * nextZoom,
            };
          });
        }
      },
      [isoCameraEnabled, viewport.w, viewport.h],
    );

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ position: "relative", width: "100%", height: "100%", minHeight: 240, outline: "none", ...style }}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <canvas
          ref={canvasRef}
          data-iso-canvas
          aria-label="Isometric dungeon map"
          style={{ display: "block", maxWidth: "100%", cursor: isoCameraEnabled ? "grab" : undefined }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onLostPointerCapture}
        />
      </div>
    );
  },
);

IsometricMapCanvasInner.displayName = "IsometricMapCanvas";

export const IsometricMapCanvas = memo(IsometricMapCanvasInner);
