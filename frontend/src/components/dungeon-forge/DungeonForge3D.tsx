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

/** Parse palette hex/CSS the same way canvas fills do; avoids tone-map hue shifts on bad strings. */
function paletteColor(hex: string | undefined, fallback: string): THREE.Color {
  const c = new THREE.Color();
  const s = typeof hex === "string" && hex.trim() ? hex.trim() : fallback;
  try {
    c.set(s);
  } catch {
    c.set(fallback);
  }
  return c;
}

/** Reused so thousands of instances do not allocate per cell. */
const INST_DUMMY = new THREE.Object3D();

type Xz = { x: number; z: number };

function pushXz(map: Map<string, Xz[]>, key: string, x: number, z: number): void {
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  arr.push({ x, z });
}

function addInstancedRotatedPlanes(
  group: THREE.Group,
  buckets: Map<string, Xz[]>,
  y: number,
  fallbackHex: string,
): void {
  for (const [hex, list] of buckets) {
    if (!list.length) continue;
    const geom = new THREE.PlaneGeometry(0.92, 0.92);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: paletteColor(hex, fallbackHex) });
    const mesh = new THREE.InstancedMesh(geom, mat, list.length);
    mesh.frustumCulled = false;
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      INST_DUMMY.position.set(p.x, y, p.z);
      INST_DUMMY.rotation.set(0, 0, 0);
      INST_DUMMY.scale.set(1, 1, 1);
      INST_DUMMY.updateMatrix();
      mesh.setMatrixAt(i, INST_DUMMY.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}

function addInstancedCylinders8(
  group: THREE.Group,
  list: Xz[],
  colorHex: string,
  fallbackHex: string,
): void {
  if (!list.length) return;
  const geom = new THREE.CylinderGeometry(0.28, 0.32, 1.65, 8);
  const mat = new THREE.MeshLambertMaterial({ color: paletteColor(colorHex, fallbackHex) });
  const mesh = new THREE.InstancedMesh(geom, mat, list.length);
  mesh.frustumCulled = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    INST_DUMMY.position.set(p.x, 0.82, p.z);
    INST_DUMMY.updateMatrix();
    mesh.setMatrixAt(i, INST_DUMMY.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function addInstancedBoxes(
  group: THREE.Group,
  list: Xz[],
  opts: {
    y: number;
    sx: number;
    sy: number;
    sz: number;
    colorHex: string;
    fallbackHex: string;
    transparent?: boolean;
    opacity?: number;
  },
): void {
  if (!list.length) return;
  const geom = new THREE.BoxGeometry(opts.sx, opts.sy, opts.sz);
  const mat = new THREE.MeshLambertMaterial({
    color: paletteColor(opts.colorHex, opts.fallbackHex),
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.transparent ? false : true,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, list.length);
  mesh.frustumCulled = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    INST_DUMMY.position.set(p.x, opts.y, p.z);
    INST_DUMMY.updateMatrix();
    mesh.setMatrixAt(i, INST_DUMMY.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function addInstancedLavaPlanes(
  group: THREE.Group,
  list: Xz[],
  lavaBg: string,
  lavaGlow: string,
): void {
  if (!list.length) return;
  const geom = new THREE.PlaneGeometry(0.92, 0.92);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({
    color: paletteColor(lavaBg, "#c04020"),
    emissive: paletteColor(lavaGlow, "#ff4400"),
    emissiveIntensity: 0.45,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, list.length);
  mesh.frustumCulled = false;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    INST_DUMMY.position.set(p.x, 0.02, p.z);
    INST_DUMMY.updateMatrix();
    mesh.setMatrixAt(i, INST_DUMMY.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function makeEntityMarkerSprite(label: string, hex: string, opacity = 1): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const mat = new THREE.SpriteMaterial({ color: hex, transparent: opacity < 1, opacity });
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
  ctx.font = "bold 30px 'Segoe UI Symbol',system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 32, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map,
    depthTest: true,
    depthWrite: false,
    transparent: opacity < 1,
    opacity,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.55, 0.55, 1);
  return s;
}

/** Cap glyphs in 3D — each unique ch/fg pair still shares one GPU texture via cache. */
const MAX_FLOOR_GLYPHS = 420;
/** Forward renderer cost scales badly with many point lights; 2D canvas uses a different path. */
const MAX_3D_POINT_LIGHTS = 26;

/** Same entity / map-marker categories as `drawOverlays` in `dungeonTileRenderer` (flat / depth). */
const ENTITY_BILLBOARD_TYPES = new Set([
  "monster",
  "item",
  "trap",
  "riddle",
  "dm_marker",
  "spawn_suggestion",
  "npc",
  "headstone",
  "landmark",
  "notice_board",
  "stall",
  "siege",
  "banner",
  "portcullis",
]);

const BILLBOARD_META: Record<string, { label: string; hex: string; opacity?: number }> = {
  monster: { label: "M", hex: "#c04050" },
  item: { label: "I", hex: "#d4af37" },
  trap: { label: "T", hex: "#c87820" },
  riddle: { label: "?", hex: "#8060c0" },
  dm_marker: { label: "\u{1F441}", hex: "#5a9c4a" },
  spawn_suggestion: { label: "\u25D4", hex: "#7a70a8", opacity: 0.55 },
  npc: { label: "\u265F", hex: "#6a8cba" },
  headstone: { label: "\u271D", hex: "#8a8a92" },
  landmark: { label: "\u2606", hex: "#c4a86a" },
  notice_board: { label: "\u25A3", hex: "#a08060" },
  stall: { label: "\u20B0", hex: "#c89860" },
  siege: { label: "\u2694", hex: "#b06050" },
  banner: { label: "\u2691", hex: "#c04050" },
  portcullis: { label: "\u2261", hex: "#888878" },
};

function billboardSpecForCell(cell: RenderCell): { label: string; hex: string; opacity?: number } | null {
  const et = cell.eType;
  if (!et || !ENTITY_BILLBOARD_TYPES.has(et)) return null;
  const ch0 = String(cell.ch ?? "").trim();
  const two = Array.from(ch0).slice(0, 2).join("") || "?";

  if (et === "monster" || et === "item" || et === "trap" || et === "riddle") {
    return { label: ch0.length ? Array.from(ch0)[0]! : BILLBOARD_META[et]!.label, hex: BILLBOARD_META[et]!.hex };
  }
  if (et === "dm_marker") {
    const label = ch0.length > 0 && ch0.length <= 2 ? ch0 : BILLBOARD_META.dm_marker.label;
    return { label, hex: BILLBOARD_META.dm_marker.hex };
  }
  if (et === "spawn_suggestion") {
    const b = BILLBOARD_META.spawn_suggestion;
    const label = Array.from(ch0)[0] ?? b.label;
    return { ...b, label };
  }
  const fixed = BILLBOARD_META[et];
  if (fixed) return { label: ch0.length ? Array.from(ch0)[0]! : fixed.label, hex: fixed.hex, opacity: fixed.opacity };
  return { label: two, hex: "#a898b8" };
}

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
  if (cell.eType && ENTITY_BILLBOARD_TYPES.has(cell.eType)) return false;
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
      dungeonLighting === "dark" ? 0.009 : dungeonLighting === "dim" ? 0.007 : 0.0055;
    if (mapOutdoorTime === "day") density *= 0.28;
    else if (mapOutdoorTime === "dusk") density *= 0.48;
    scene.fog = new THREE.FogExp2(0x121018, density);

    const cx = (cols - 1) / 2;
    const cz = (rows - 1) / 2;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, Math.max(80, cols + rows + 40));
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
      stencil: false,
      depth: true,
    });
    renderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* Match 2D canvas albedo: ACESFilmic shifts wall/floor hues vs flat / depth. */
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;

    const ambientMul =
      mapOutdoorTime === "day" ? 1.75 : mapOutdoorTime === "dusk" ? 1.45 : mapOutdoorTime === "night" ? 1.05 : 1.2;
    const litMul = dungeonLighting === "dark" ? 0.95 : dungeonLighting === "dim" ? 1.02 : 1.08;
    const ambient = new THREE.AmbientLight(0xffffff, 0.95 * ambientMul * litMul);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xc8dcff, 0x1a1510, 0.72 * litMul);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff5e8, 0.52 * litMul);
    sun.position.set(0.35, 1.2, 0.2);
    scene.add(sun);

    const group = new THREE.Group();
    group.position.set(-cx, 0, -cz);

    const floorBuckets = new Map<string, Xz[]>();
    const pillars: Xz[] = [];
    const walls: Xz[] = [];
    const doorsOpen: Xz[] = [];
    const doorsShut: Xz[] = [];
    const water: Xz[] = [];
    const lava: Xz[] = [];

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!cellVisible(gx, gy, fogCells ?? null)) continue;
        const cell = grid[gy]![gx]! as RenderCell;
        const t = cell.tile;
        const px = gx;
        const pz = gy;

        if (t === T.V) continue;

        if (t === T.F || t === T.C || t === T.ROAD || t === T.BRIDGE || t === T.ALLEY) {
          const hexRaw =
            t === T.C
              ? palette.corridorBg
              : t === T.ROAD
                ? palette.roadBg
                : t === T.BRIDGE
                  ? palette.bridgeBg ?? palette.corridorBg
                  : palette.floorBg;
          const bucketKey =
            typeof hexRaw === "string" && hexRaw.trim() ? hexRaw.trim() : `tile-${t}`;
          pushXz(floorBuckets, bucketKey, px, pz);
        } else if (t === T.P) {
          pillars.push({ x: px, z: pz });
        } else if (t === T.W || t === T.HEADSTONE) {
          walls.push({ x: px, z: pz });
        } else if (t === T.D || t === T.GATE || t === T.DRAWBRIDGE || t === T.SECRET_DOOR) {
          const open = !doorOpen || doorOpen.size === 0 || doorOpen.has(`${gx},${gy}`);
          (open ? doorsOpen : doorsShut).push({ x: px, z: pz });
        } else if (t === T.WA) {
          water.push({ x: px, z: pz });
        } else if (t === T.LAVA) {
          lava.push({ x: px, z: pz });
        } else {
          pushXz(floorBuckets, String(palette.floorBg), px, pz);
        }
      }
    }

    addInstancedRotatedPlanes(group, floorBuckets, 0.01, "#2a2820");
    addInstancedCylinders8(group, pillars, palette.pillarBg ?? palette.wallBg, "#3a4034");
    addInstancedBoxes(group, walls, {
      y: 0.67,
      sx: 0.92,
      sy: 1.35,
      sz: 0.92,
      colorHex: palette.wallBg,
      fallbackHex: "#3a3830",
    });
    addInstancedBoxes(group, doorsOpen, {
      y: 0.52,
      sx: 0.75,
      sy: 1.05,
      sz: 0.12,
      colorHex: palette.doorBg,
      fallbackHex: "#2a2418",
      transparent: true,
      opacity: 0.55,
    });
    addInstancedBoxes(group, doorsShut, {
      y: 0.52,
      sx: 0.75,
      sy: 1.05,
      sz: 0.12,
      colorHex: palette.doorBg,
      fallbackHex: "#2a2418",
    });
    if (water.length) {
      const geom = new THREE.PlaneGeometry(0.88, 0.88);
      geom.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({
        color: paletteColor(palette.waterBg, "#0d2a4a"),
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      });
      const wm = new THREE.InstancedMesh(geom, mat, water.length);
      wm.frustumCulled = false;
      for (let i = 0; i < water.length; i++) {
        const p = water[i]!;
        INST_DUMMY.position.set(p.x, 0.02, p.z);
        INST_DUMMY.updateMatrix();
        wm.setMatrixAt(i, INST_DUMMY.matrix);
      }
      wm.instanceMatrix.needsUpdate = true;
      group.add(wm);
    }
    addInstancedLavaPlanes(group, lava, palette.lavaBg ?? "#c04020", palette.lavaGlow ?? "#ff4400");

    let glyphs = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!cellVisible(gx, gy, fogCells ?? null)) continue;
        const cell = grid[gy]![gx]! as RenderCell;
        if (!showEnts) continue;
        const et = cell.eType;
        if (et === "monster" && playerSanitize) continue;
        if (playerSanitize && et === "dm_marker") continue;
        const spec = billboardSpecForCell(cell);
        if (!spec) continue;
        const spr = makeEntityMarkerSprite(spec.label, spec.hex, spec.opacity ?? 1);
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
    merged.sort((a, b) => (b.intensity ?? 0.35) - (a.intensity ?? 0.35));
    const cap = Math.min(merged.length, MAX_3D_POINT_LIGHTS);
    for (let i = 0; i < cap; i++) {
      const L = merged[i]!;
      const hex = L.color ?? (L.kind ? KIND_HEX[L.kind] : undefined) ?? "#ff9040";
      const col = paletteColor(hex.startsWith("#") ? hex : `#${hex}`, "#ff9040");
      const baseInt = L.intensity ?? 0.38;
      const dist = Math.max(20, (L.radiusCells ?? 5.5) * 3.05);
      const light = new THREE.PointLight(
        col,
        Math.min(58, 8 + baseInt * 36),
        dist,
        1.08,
      );
      const ox = L.offsetX ?? 0;
      const oy = L.offsetY ?? 0;
      light.position.set(L.gx + ox, 2.05, L.gy + oy);
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
      if (document.hidden) {
        raf = 0;
        return;
      }
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
    const startLoop = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    startLoop();

    return () => {
      document.removeEventListener("visibilitychange", onVis);
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
          3D preview is disabled for very large maps (over 4096 cells). Use Depth or Iso view instead.
        </div>
      )}
    </div>
  );
}
