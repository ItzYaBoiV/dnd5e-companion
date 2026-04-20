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

/** Lightweight Three.js dungeon preview (DM-only). */
export default function DungeonForge3D({
  grid,
  palette,
  fogCells,
  sceneLights,
  doorOpen,
  dungeonLighting,
  className,
  style,
}: DungeonForge3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const yawRef = useRef(0.55);
  const distRef = useRef(18);
  const dragRef = useRef<{ active: boolean; px: number; py: number } | null>(null);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const tooBig = cols * rows > 4096;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || grid.length === 0 || cols === 0 || tooBig) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0810);
    const density =
      dungeonLighting === "dark" ? 0.055 : dungeonLighting === "dim" ? 0.035 : 0.018;
    scene.fog = new THREE.FogExp2(0x0a0810, density);

    const cx = (cols - 1) / 2;
    const cz = (rows - 1) / 2;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, Math.max(80, cols + rows + 40));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const ambient = new THREE.AmbientLight(0xffffff, 0.32);
    scene.add(ambient);

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
            roughness: 0.92,
            metalness: 0,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.01, pz);
          group.add(mesh);
        } else if (t === T.W || t === T.P || t === T.HEADSTONE) {
          const mat = new THREE.MeshStandardMaterial({
            color: palette.wallBg,
            roughness: 0.88,
            metalness: 0.02,
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
            roughness: 0.9,
            metalness: 0,
          });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(px, 0.01, pz);
          group.add(mesh);
        }
      }
    }

    scene.add(group);

    const merged: SceneLight[] = [...(sceneLights ?? [])];
    merged.push(...collectTorchFixtureLights(grid, cols, rows));
    const cap = Math.min(merged.length, 18);
    for (let i = 0; i < cap; i++) {
      const L = merged[i]!;
      const hex = L.color ?? (L.kind ? KIND_HEX[L.kind] : undefined) ?? "#ff9040";
      const col = new THREE.Color(hex.startsWith("#") ? hex : `#${hex}`);
      const light = new THREE.PointLight(col, Math.min(2.2, 0.5 + (L.intensity ?? 0.6)), L.radiusCells * 1.2, 1.8);
      light.position.set(L.gx, 1.1, L.gy);
      scene.add(light);
    }

    host.innerHTML = "";
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

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
      distRef.current = Math.max(6, Math.min(48, distRef.current + e.deltaY * 0.04));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragRef.current = { active: true, px: e.clientX, py: e.clientY };
      host.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      yawRef.current += (e.clientX - d.px) * 0.006;
      distRef.current += (e.clientY - d.py) * 0.04;
      distRef.current = Math.max(6, Math.min(48, distRef.current));
      d.px = e.clientX;
      d.py = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (dragRef.current?.active) {
        try {
          host.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        dragRef.current = null;
      }
    };

    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    let raf = 0;
    const tick = () => {
      const yaw = yawRef.current;
      const dist = distRef.current;
      camera.position.set(cx + Math.sin(yaw) * dist, rows * 0.55, cz + Math.cos(yaw) * dist);
      camera.lookAt(cx, 0, cz);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      disposeObject3D(scene);
      renderer.dispose();
      if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [grid, palette, fogCells, sceneLights, doorOpen, dungeonLighting, cols, rows, tooBig]);

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
      aria-label="Three.js dungeon preview"
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
