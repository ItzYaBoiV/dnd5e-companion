import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { DungeonMapCanvasProps } from "@/components/dungeon-forge/DungeonMapCanvas";
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import type { RenderCell } from "@/lib/dungeonTileRenderer";
import { collectTorchFixtureLights } from "@/lib/dungeonLightOcclusion";
import type { SceneLight } from "@/lib/playerMapBroadcast";

export type DungeonForge3DProps = Omit<DungeonMapCanvasProps, "cellPx"> & {
  tileW?: number;
  tileH?: number;
  wallH?: number;
};

const KIND_HEX: Record<string, string> = {
  torch: "#ff9040",
  lantern: "#ffe0a0",
  magic: "#a060ff",
  fire: "#ff4400",
  cold: "#80c0ff",
  necrotic: "#40ff80",
  divine: "#ffffc0",
  fey: "#40ffcc",
  lava: "#ff2200",
  wisp: "#c0ffff",
  room: "#ffe0a0",
  token: "#ffffff",
};

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Sprite) {
      const mat = o.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      return;
    }
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

function cellVisible(gx: number, gy: number, fogCells: Set<string> | null | undefined): boolean {
  if (!fogCells) return true;
  return fogCells.has(`${gx},${gy}`);
}

const ENTITY_MARKER_TYPES = new Set(["monster", "item", "trap", "riddle"]);

function makeEntityMarkerSprite(label: string, hex: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({ color: hex });
    return new THREE.Sprite(mat);
  }
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#0a0810";
  ctx.font = "bold 32px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 32, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map, depthTest: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.55, 0.55, 1);
  return s;
}

const MAX_FLOOR_GLYPHS = 420;

function makeFloorGlyphSprite(ch: string, fgHex: string): THREE.Sprite {
  const text = Array.from(ch)[0] ?? "?";
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({ color: fgHex });
    return new THREE.Sprite(mat);
  }
  ctx.clearRect(0, 0, 72, 72);
  ctx.fillStyle = fgHex.startsWith("#") ? fgHex : "#e8e0d5";
  ctx.font = "bold 40px 'Segoe UI Symbol',system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 36, 38);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.92,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.42, 0.42, 1);
  s.renderOrder = 5;
  return s;
}

function shouldDrawFloorGlyph(cell: RenderCell, playerSanitize: boolean): boolean {
  if (playerSanitize && (cell.eType === "label" || cell.eType === "dm_marker")) return false;
  if (cell.eType === "deco" || cell.eType === "theme") return true;
  if (cell.eType === "label") return true;
  const tile = cell.tile;
  if (tile === T.SU || tile === T.SD || tile === T.SECRET_DOOR || tile === T.PIT || tile === T.HEADSTONE)
    return true;
  return false;
}

/** Lightweight Three.js dungeon preview (DM-only). */
export default function DungeonForge3D({
  grid,
  palette,
  fogCells,
  sceneLights,
  doorOpen,
  dungeonLighting,
  mapOutdoorTime,
  playerSanitize = false,
  showEnts = true,
  className,
  style,
}: DungeonForge3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const yawRef = useRef(0.55);
  const distRef = useRef(18);
  const panXRef = useRef(0);
  const panZRef = useRef(0);
  const dragRef = useRef<{ mode: "orbit" | "pan"; px: number; py: number } | null>(null);
  const lastMapSizeRef = useRef({ cols: 0, rows: 0 });

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const tooBig = cols * rows > 4096;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || grid.length === 0 || cols === 0 || tooBig) return;

    if (lastMapSizeRef.current.cols !== cols || lastMapSizeRef.current.rows !== rows) {
      panXRef.current = 0;
      panZRef.current = 0;
      yawRef.current = 0.55;
      distRef.current = Math.min(40, Math.max(10, (cols + rows) * 0.2));
      lastMapSizeRef.current = { cols, rows };
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x121018);
    let density =
      dungeonLighting === "dark" ? 0.022 : dungeonLighting === "dim" ? 0.016 : 0.009;
    if (mapOutdoorTime === "day") density *= 0.28;
    else if (mapOutdoorTime === "dusk") density *= 0.48;
    scene.fog = new THREE.FogExp2(0x121018, density);

    const cx = (cols - 1) / 2;
    const cz = (rows - 1) / 2;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, Math.max(80, cols + rows + 40));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;

    const ambientMul =
      mapOutdoorTime === "day" ? 1.75 : mapOutdoorTime === "dusk" ? 1.45 : mapOutdoorTime === "night" ? 1.05 : 1.2;
    const litMul = dungeonLighting === "dark" ? 0.55 : dungeonLighting === "dim" ? 0.78 : 1;
    const ambient = new THREE.AmbientLight(0xffffff, 0.72 * ambientMul * litMul);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xc8dcff, 0x1a1510, 0.55 * litMul);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e8, 0.45 * litMul);
    sun.position.set(0.35, 1.2, 0.2);
    scene.add(sun);

    const group = new THREE.Group();
    group.position.set(-cx, 0, -cz);

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!cellVisible(gx, gy, fogCells ?? null)) continue;
        const cell = grid[gy]![gx]! as RenderCell;
        const t = cell.tile;
        const px = gx;
        const pz = gy;

        if (t === T.V) continue;

        if (t === T.F || t === T.C || t === T.ROAD || t === T.BRIDGE || t === T.ALLEY) {
          const mat = new THREE.MeshStandardMaterial({
            color: t === T.C ? palette.corridorBg : t === T.ROAD ? palette.roadBg : palette.floorBg,
            roughness: 0.88,
            metalness: 0,
            emissive: new THREE.Color(0x222028),
            emissiveIntensity: 0.06,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.01, pz);
          group.add(mesh);
        } else if (t === T.P) {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.wallBg,
            roughness: 0.88,
            metalness: 0.02,
          });
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.65, 8), mat);
          mesh.position.set(px, 0.82, pz);
          group.add(mesh);
        } else if (t === T.W || t === T.HEADSTONE) {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.wallBg,
            roughness: 0.88,
            metalness: 0.02,
            emissive: new THREE.Color(0x151820),
            emissiveIntensity: 0.08,
          });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.35, 0.92), mat);
          mesh.position.set(px, 0.67, pz);
          group.add(mesh);
        } else if (t === T.D || t === T.GATE || t === T.DRAWBRIDGE || t === T.SECRET_DOOR) {
          const open = !doorOpen || doorOpen.size === 0 || doorOpen.has(`${gx},${gy}`);
          const mat = new THREE.MeshStandardMaterial({
            color: palette.doorBg,
            roughness: 0.75,
            metalness: 0.05,
            transparent: true,
            opacity: open ? 0.55 : 1,
          });
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.05, 0.12), mat);
          mesh.position.set(px, 0.52, pz);
          group.add(mesh);
        } else if (t === T.WA) {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.waterBg,
            roughness: 0.35,
            metalness: 0.1,
            transparent: true,
            opacity: 0.88,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.88), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.02, pz);
          group.add(mesh);
        } else if (t === T.LAVA) {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.lavaBg ?? "#c04020",
            emissive: new THREE.Color(palette.lavaGlow ?? "#ff4400"),
            emissiveIntensity: 0.35,
            roughness: 0.55,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.02, pz);
          group.add(mesh);
        } else {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.floorBg,
            roughness: 0.88,
            metalness: 0,
            emissive: new THREE.Color(0x222028),
            emissiveIntensity: 0.05,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.01, pz);
          group.add(mesh);
        }
      }
    }

    const markerMeta: Record<string, { label: string; hex: string }> = {
      monster: { label: "M", hex: "#c04050" },
      item: { label: "I", hex: "#d4af37" },
      trap: { label: "T", hex: "#c87820" },
      riddle: { label: "?", hex: "#8060c0" },
    };
    let glyphs = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!cellVisible(gx, gy, fogCells ?? null)) continue;
        const cell = grid[gy]![gx]! as RenderCell;
        const et = cell.eType;
        if (!showEnts || !et || !ENTITY_MARKER_TYPES.has(et)) continue;
        if (et === "monster" && playerSanitize) continue;
        const meta = markerMeta[et];
        if (!meta) continue;
        const spr = makeEntityMarkerSprite(meta.label, meta.hex);
        spr.position.set(gx, 1.12, gy);
        group.add(spr);
      }
    }

    outerGlyphs: for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (glyphs >= MAX_FLOOR_GLYPHS) break outerGlyphs;
        if (!cellVisible(gx, gy, fogCells ?? null)) continue;
        const cell = grid[gy]![gx]! as RenderCell;
        if (!shouldDrawFloorGlyph(cell, playerSanitize)) continue;
        const ch = String(cell.ch ?? "").trim();
        if (!ch) continue;
        const fg = cell.fg && cell.fg.startsWith("#") ? cell.fg : "#e8dfd0";
        const spr = makeFloorGlyphSprite(ch, fg);
        spr.position.set(gx, 0.62, gy);
        group.add(spr);
        glyphs++;
      }
    }

    scene.add(group);

    const merged: SceneLight[] = [...(sceneLights ?? [])];
    merged.push(...collectTorchFixtureLights(grid, cols, rows));
    const cap = Math.min(merged.length, 42);
    for (let i = 0; i < cap; i++) {
      const L = merged[i]!;
      const hex = L.color ?? (L.kind ? KIND_HEX[L.kind] : undefined) ?? "#ff9040";
      const col = new THREE.Color(hex.startsWith("#") ? hex : `#${hex}`);
      const baseInt = L.intensity ?? 0.38;
      const dist = Math.max(16, (L.radiusCells ?? 5.5) * 2.6);
      const light = new THREE.PointLight(
        col,
        Math.min(45, 6 + baseInt * 28),
        dist,
        1.15,
      );
      light.position.set(L.gx, 2.0, L.gy);
      scene.add(light);
    }

    host.innerHTML = "";
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";

    const applySize = () => {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || 240;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(host);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      distRef.current = Math.max(6, Math.min(48, distRef.current + e.deltaY * 0.04));
    };
    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      let mode: "orbit" | "pan" | null = null;
      if (e.button === 0) mode = "orbit";
      else if (e.button === 2) mode = "pan";
      if (!mode) return;
      dragRef.current = { mode, px: e.clientX, py: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      e.stopPropagation();
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (d.mode === "orbit") {
        yawRef.current += dx * 0.006;
        distRef.current += dy * 0.04;
        distRef.current = Math.max(6, Math.min(48, distRef.current));
      } else {
        const scale = 0.045 * (distRef.current / 18);
        panXRef.current -= dx * scale;
        panZRef.current -= dy * scale;
      }
      d.px = e.clientX;
      d.py = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      e.stopPropagation();
      if (dragRef.current) {
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = null;
      }
    };

    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("contextmenu", onContextMenu);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    let raf = 0;
    const tick = () => {
      const yaw = yawRef.current;
      const dist = distRef.current;
      const px = panXRef.current;
      const pz = panZRef.current;
      // Map meshes are centered at world origin; orbit and pan that point (not map corner).
      camera.position.set(px + Math.sin(yaw) * dist, rows * 0.55, pz + Math.cos(yaw) * dist);
      camera.lookAt(px, 0, pz);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("contextmenu", onContextMenu);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      disposeObject3D(scene);
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [
    grid,
    palette,
    fogCells,
    sceneLights,
    doorOpen,
    dungeonLighting,
    mapOutdoorTime,
    cols,
    rows,
    tooBig,
    playerSanitize,
    showEnts,
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 240,
        ...style,
      }}
      aria-label="Three.js dungeon preview. Left drag: orbit. Right drag: pan. Wheel: zoom."
    >
      {tooBig && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            textAlign: "center",
            fontSize: 13,
            color: "#b0a090",
            background: "rgba(10,8,16,0.92)",
            zIndex: 2,
          }}
        >
          3D preview is disabled for very large maps (over 4096 cells). Use Flat, Depth, or Iso view instead.
        </div>
      )}
    </div>
  );
}
