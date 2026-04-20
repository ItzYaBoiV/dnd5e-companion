import { useEffect, useRef, memo, useState, useCallback } from "react";
import {
  renderDungeonToCanvas,
  type EntityPalette,
  type RenderCell,
  type RenderTileOpts,
  type TilePalette,
} from "@/lib/dungeonTileRenderer";
import type { BattleToken, SceneLight } from "@/lib/playerMapBroadcast";
import { useBattleTokenImages } from "@/lib/useBattleTokenImages";
import { useMapEntityTokenImages } from "@/lib/useMapEntityTokenImages";

export type DungeonMapCanvasProps = {
  grid: RenderCell[][];
  cellPx: number;
  palette: TilePalette;
  entities: EntityPalette;
  fogCells?: Set<string> | null;
  showEnts?: boolean;
  playerSanitize?: boolean;
  hideDecoKeys?: Set<string>;
  highlightRoom?: { x: number; y: number; w: number; h: number } | null;
  /** Doors with these grid keys `"x,y"` render open; omitted = all doors drawn open (legacy). */
  doorOpen?: Set<string> | null;
  doorStates?: Record<string, string> | null;
  animPhase?: number;
  lighting?: { gx: number; gy: number; radiusCells: number; intensity?: number } | null;
  sceneLights?: SceneLight[] | null;
  forgeDmHints?: NonNullable<RenderTileOpts["forgeDmHints"]>;
  dungeonLighting?: RenderTileOpts["dungeonLighting"];
  graveyardAmbience?: RenderTileOpts["graveyardAmbience"];
  aoPass?: boolean;
  depthPass?: boolean;
  vignettePass?: boolean;
  depthFog?: boolean;
  tileDetailStyle?: RenderTileOpts["tileDetailStyle"];
  battleTokens?: BattleToken[] | null;
  /** When the `grid` prop is a cropped window, pass the top-left of that window in full-map coords. */
  worldOffset?: { x: number; y: number };
  className?: string;
  style?: React.CSSProperties;
  onCellClick?: (x: number, y: number, cell: RenderCell) => void;
  onCellHover?: (
    x: number,
    y: number,
    cell: RenderCell | null,
    pointer?: { clientX: number; clientY: number },
  ) => void;
  /** Right-click on a player battle token (world grid coords). */
  onPlayerTokenContextMenu?: (payload: {
    tokenId: string;
    worldGx: number;
    worldGy: number;
    clientX: number;
    clientY: number;
  }) => void;
  /** Right-click on a monster battle token (combatant id). */
  onMonsterTokenContextMenu?: (payload: {
    tokenId: string;
    worldGx: number;
    worldGy: number;
    clientX: number;
    clientY: number;
  }) => void;
  /** Sight ring radius in grid cells (player tokens); avoids volumetric token lights. */
  playerSightRingCells?: number | null;
  tokenDragEnabled?: boolean;
  /** When true (e.g. laser mode), skip token hover + drag affordances. */
  suppressTokenInteraction?: boolean;
  /** Live move while dragging (world grid coords). */
  onTokenDragTo?: (tokenId: string | undefined, worldGx: number, worldGy: number) => void;
  onTokenDragEnd?: (payload: {
    tokenId: string | undefined;
    worldGx: number;
    worldGy: number;
    startWorldGx: number;
    startWorldGy: number;
    didDrag: boolean;
  }) => void;
  /** Tokens stacked on the hovered cell (local grid coords → world passed in payload). */
  onTokensAtCell?: (
    payload: {
      worldX: number;
      worldY: number;
      tokensHere: BattleToken[];
      clientX: number;
      clientY: number;
      cell: RenderCell;
    } | null,
  ) => void;
  /**
   * Click-drag on empty map to pan the scroll parent (`[data-dm-map-viewport]` ancestor).
   * Token drag wins when over a token.
   */
  mapPanEnabled?: boolean;
  /**
   * When provided with `onMapViewportPanChange`, pan updates the parent transform instead of scrolling.
   */
  mapViewportPan?: { x: number; y: number };
  onMapViewportPanChange?: (pan: { x: number; y: number }) => void;
  /** Right-click on a scripted map tile (loot / creature / trap / riddle marker). */
  onMapCellContextMenu?: (payload: {
    worldGx: number;
    worldGy: number;
    cell: RenderCell;
    clientX: number;
    clientY: number;
  }) => void;
};

function DungeonMapCanvasInner({
  grid,
  cellPx,
  palette,
  entities,
  fogCells,
  showEnts = true,
  playerSanitize = false,
  hideDecoKeys,
  highlightRoom,
  doorOpen,
  doorStates,
  animPhase,
  lighting,
  sceneLights,
  forgeDmHints,
  dungeonLighting,
  graveyardAmbience,
  aoPass,
  depthPass,
  vignettePass,
  depthFog,
  tileDetailStyle,
  battleTokens,
  worldOffset,
  className,
  style,
  onCellClick,
  onCellHover,
  playerSightRingCells,
  tokenDragEnabled,
  suppressTokenInteraction,
  onTokenDragTo,
  onTokenDragEnd,
  onTokensAtCell,
  mapPanEnabled,
  onPlayerTokenContextMenu,
  onMonsterTokenContextMenu,
  mapViewportPan,
  onMapViewportPanChange,
  onMapCellContextMenu,
}: DungeonMapCanvasProps) {
  const ox = worldOffset?.x ?? 0;
  const oy = worldOffset?.y ?? 0;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    id: string | undefined;
    startWx: number;
    startWy: number;
    lastWx: number;
    lastWy: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [isDraggingToken, setIsDraggingToken] = useState(false);
  const mapPanRef = useRef<
    | { kind: "scroll"; sl: number; st: number; x: number; y: number }
    | { kind: "delta"; panX: number; panY: number; sx: number; sy: number }
    | null
  >(null);
  const [isPanningMap, setIsPanningMap] = useState(false);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const { images: tokenImages, version: tokenImagesVersion } = useBattleTokenImages(battleTokens);
  const { images: entityTokenImages, version: entityTokenImagesVersion } = useMapEntityTokenImages(grid);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || grid.length === 0) return;
    renderDungeonToCanvas(canvas, grid, {
      palette,
      entities,
      cellPx,
      dpr,
      fogCells: fogCells ?? null,
      showEnts,
      playerSanitize,
      hideDecoKeys,
      highlightRoom: highlightRoom ?? null,
      doorOpen: doorOpen ?? null,
      doorStates: doorStates ?? null,
      animPhase,
      lighting: lighting ?? null,
      sceneLights: sceneLights ?? null,
      battleTokens: battleTokens ?? null,
      tokenImages,
      entityTokenImages,
      inkSaver: false,
      playerSightRingCells: playerSightRingCells ?? null,
      forgeDmHints: forgeDmHints ?? null,
      dungeonLighting,
      graveyardAmbience,
      aoPass: !!aoPass,
      depthPass: !!depthPass,
      vignettePass: !!vignettePass,
      depthFog: !!depthFog,
      tileDetailStyle: tileDetailStyle ?? null,
    });
  }, [
    grid,
    cellPx,
    palette,
    entities,
    dpr,
    fogCells,
    showEnts,
    playerSanitize,
    hideDecoKeys,
    highlightRoom,
    doorOpen,
    doorStates,
    animPhase,
    lighting,
    sceneLights,
    forgeDmHints,
    dungeonLighting,
    graveyardAmbience,
    aoPass,
    depthPass,
    vignettePass,
    depthFog,
    tileDetailStyle,
    battleTokens,
    tokenImagesVersion,
    entityTokenImagesVersion,
    playerSightRingCells,
  ]);

  function tokensAtLocal(lx: number, ly: number): BattleToken[] {
    const list = battleTokens ?? [];
    return list.filter((t) => Math.floor(t.gx) === lx && Math.floor(t.gy) === ly);
  }

  function pickTopTokenAtLocal(lx: number, ly: number): BattleToken | null {
    const stack = tokensAtLocal(lx, ly);
    return stack.length ? stack[stack.length - 1]! : null;
  }

  function cellFromEvent(e: React.MouseEvent): { x: number; y: number; cell: RenderCell } | null {
    const canvas = canvasRef.current;
    if (!canvas || grid.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const cols = grid[0].length;
    const rows = grid.length;
    const ix = e.clientX - rect.left;
    const iy = e.clientY - rect.top;
    const gx = Math.min(cols - 1, Math.max(0, Math.floor((ix / rect.width) * cols)));
    const gy = Math.min(rows - 1, Math.max(0, Math.floor((iy / rect.height) * rows)));
    const cell = grid[gy]?.[gx];
    if (!cell) return null;
    return { x: gx + ox, y: gy + oy, cell };
  }

  const endTokenDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    const moved = didDragRef.current;
    dragRef.current = null;
    setIsDraggingToken(false);
    didDragRef.current = false;
    if (moved) suppressClickRef.current = true;
    if (!moved || !onTokenDragEnd) return;
    onTokenDragEnd({
      tokenId: d.id,
      worldGx: d.lastWx,
      worldGy: d.lastWy,
      startWorldGx: d.startWx,
      startWorldGy: d.startWy,
      didDrag: true,
    });
  }, [onTokenDragEnd]);

  useEffect(() => {
    if (!isDraggingToken) return;
    const end = () => endTokenDrag();
    window.addEventListener("mouseup", end);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("blur", end);
    };
  }, [isDraggingToken, endTokenDrag]);

  useEffect(() => {
    if (!isPanningMap) return;
    const onMove = (ev: MouseEvent) => {
      const p = mapPanRef.current;
      const canvas = canvasRef.current;
      if (!p || !canvas) return;
      if (p.kind === "delta" && onMapViewportPanChange) {
        onMapViewportPanChange({
          x: p.panX + (ev.clientX - p.sx),
          y: p.panY + (ev.clientY - p.sy),
        });
        return;
      }
      if (p.kind === "scroll") {
        const sp = canvas.closest("[data-dm-map-viewport]") as HTMLElement | null;
        if (!sp) return;
        sp.scrollLeft = p.sl - (ev.clientX - p.x);
        sp.scrollTop = p.st - (ev.clientY - p.y);
      }
    };
    const onUp = (ev: Event) => {
      const p = mapPanRef.current;
      mapPanRef.current = null;
      setIsPanningMap(false);
      if (p && ev instanceof MouseEvent) {
        const sx = p.kind === "scroll" ? p.x : p.sx;
        const sy = p.kind === "scroll" ? p.y : p.sy;
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (dx * dx + dy * dy > 25) suppressClickRef.current = true;
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [isPanningMap, onMapViewportPanChange]);

  const hoverCursor =
    tokenDragEnabled &&
    !suppressTokenInteraction &&
    !isDraggingToken &&
    onCellClick
      ? "pointer"
      : onCellClick
        ? "pointer"
        : "default";

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        imageRendering: "pixelated",
        cursor: isPanningMap || isDraggingToken ? "grabbing" : mapPanEnabled && !suppressTokenInteraction ? "grab" : hoverCursor,
        ...style,
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const r = cellFromEvent(e);
        if (!r) return;
        const lx = r.x - ox;
        const ly = r.y - oy;
        const wantTokenDrag = !!(tokenDragEnabled && !suppressTokenInteraction);
        const top = wantTokenDrag ? pickTopTokenAtLocal(lx, ly) : null;
        if (top) {
          didDragRef.current = false;
          dragRef.current = {
            id: top.id,
            startWx: r.x,
            startWy: r.y,
            lastWx: r.x,
            lastWy: r.y,
          };
          setIsDraggingToken(true);
          return;
        }
        if (mapPanEnabled && !suppressTokenInteraction) {
          if (onMapViewportPanChange && mapViewportPan) {
            mapPanRef.current = {
              kind: "delta",
              panX: mapViewportPan.x,
              panY: mapViewportPan.y,
              sx: e.clientX,
              sy: e.clientY,
            };
            setIsPanningMap(true);
            e.preventDefault();
          } else {
            const canvas = canvasRef.current;
            const sp = canvas?.closest("[data-dm-map-viewport]") as HTMLElement | null;
            if (sp) {
              mapPanRef.current = {
                kind: "scroll",
                sl: sp.scrollLeft,
                st: sp.scrollTop,
                x: e.clientX,
                y: e.clientY,
              };
              setIsPanningMap(true);
              e.preventDefault();
            }
          }
        }
      }}
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        const r = cellFromEvent(e);
        if (r) onCellClick?.(r.x, r.y, r.cell);
      }}
      onContextMenu={(e) => {
        if (suppressTokenInteraction) return;
        const r = cellFromEvent(e);
        if (!r) return;
        const lx = r.x - ox;
        const ly = r.y - oy;
        const top = pickTopTokenAtLocal(lx, ly);
        if (top?.kind === "player" && top.id && onPlayerTokenContextMenu) {
          e.preventDefault();
          onPlayerTokenContextMenu({
            tokenId: top.id,
            worldGx: r.x,
            worldGy: r.y,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        }
        if (top?.kind === "monster" && top.id && onMonsterTokenContextMenu) {
          e.preventDefault();
          onMonsterTokenContextMenu({
            tokenId: top.id,
            worldGx: r.x,
            worldGy: r.y,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        }
        const et = r.cell.eType;
        if (
          onMapCellContextMenu &&
          et &&
          (et === "monster" || et === "item" || et === "trap" || et === "riddle")
        ) {
          e.preventDefault();
          onMapCellContextMenu({
            worldGx: r.x,
            worldGy: r.y,
            cell: r.cell,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }
      }}
      onMouseMove={(e) => {
        if (isPanningMap) return;
        const r = cellFromEvent(e);
        const hx = r ? r.x : -1;
        const hy = r ? r.y : -1;
        onCellHover?.(hx, hy, r?.cell ?? null, { clientX: e.clientX, clientY: e.clientY });

        if (isDraggingToken && dragRef.current && r && onTokenDragTo) {
          const d = dragRef.current;
          if (r.x !== d.lastWx || r.y !== d.lastWy) {
            didDragRef.current = true;
            d.lastWx = r.x;
            d.lastWy = r.y;
            onTokenDragTo(d.id, r.x, r.y);
          }
        }

        if (!suppressTokenInteraction && onTokensAtCell && r) {
          const lx = r.x - ox;
          const ly = r.y - oy;
          onTokensAtCell({
            worldX: r.x,
            worldY: r.y,
            tokensHere: tokensAtLocal(lx, ly),
            clientX: e.clientX,
            clientY: e.clientY,
            cell: r.cell,
          });
        } else if (!suppressTokenInteraction) {
          onTokensAtCell?.(null);
        }
      }}
      onMouseLeave={() => {
        if (isPanningMap) return;
        onCellHover?.(-1, -1, null);
        if (!suppressTokenInteraction) onTokensAtCell?.(null);
        if (isDraggingToken) endTokenDrag();
      }}
    />
  );
}

export const DungeonMapCanvas = memo(DungeonMapCanvasInner);
