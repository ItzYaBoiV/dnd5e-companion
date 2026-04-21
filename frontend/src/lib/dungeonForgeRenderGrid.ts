import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import type { RenderCell } from "@/lib/dungeonTileRenderer";

export function trapGlyph(name: string | undefined): string {
  const s = String(name || "").toLowerCase();
  if (/pit|hole|shaft/.test(s)) return "⌄";
  if (/dart|needle|bolt/.test(s)) return "➷";
  if (/blade|swing|scythe/.test(s)) return "†";
  if (/fire|flame|jet|burn/.test(s)) return "※";
  if (/ceiling|collapse|rock/.test(s)) return "△";
  if (/acid|pool|slime/.test(s)) return "≋";
  if (/lightning|rune|shock|spark/.test(s)) return "⚡";
  if (/spike/.test(s)) return "▼";
  return "^";
}

export function itemGlyph(name: string | undefined): string {
  const s = String(name || "").toLowerCase();
  if (/key|ring|lock/.test(s)) return "⚿";
  if (/potion|vial|flask/.test(s)) return "⚗";
  if (/scroll|map|letter/.test(s)) return "¶";
  if (/coin|gold|gem|chest/.test(s)) return "◆";
  if (/weapon|sword|axe|bow/.test(s)) return "†";
  if (/armor|shield|mail/.test(s)) return "⛨";
  return "!";
}

export function monsterGlyph(name: string | undefined): string {
  const s = String(name || "M").toLowerCase();
  if (/spider|rat|scorpion/.test(s)) return "8";
  if (/bat|bird|raven|crow/.test(s)) return "v";
  if (/dragon|drake|wyrm|hydra/.test(s)) return "D";
  if (/zombie|skeleton|ghoul|wraith|ghost|specter|banshee/.test(s)) return "Z";
  if (/slime|ooze|jelly|mold/.test(s)) return "%";
  if (/goblin|kobold|orc|gnoll|hobgoblin|bugbear/.test(s)) return "g";
  if (/ogre|troll|giant|golem|minotaur|mummy/.test(s)) return "&";
  if (/wolf|bear|boar|serpent|frog/.test(s)) return "*";
  return String(name || "M")[0] || "M";
}

const THEME_GLYPH: Record<string, string> = {
  entrance: "⚑",
  guard: "🛡",
  treasure: "💰",
  trap: "⚠",
  rest: "🛏",
  boss: "👑",
  lore: "🕯",
  puzzle: "🧩",
  SANCTUM: "◇",
  VESTRY: "⚙",
  BELL_TOWER: "🔔",
  PRAYER_CELL: "⚞",
  /** Sewer waste rooms — poison cloud (DM theme glyph). */
  WASTE_CHAMBER: "☠",
  THIEVES_DEN: "⚔",
};

/** Use when `width`/`height` metadata can lag behind the real `grid` (e.g. after layout fixes). */
export function effectiveDungeonGridDims(dg: {
  grid?: number[][];
  width?: number;
  height?: number;
}): { w: number; h: number } {
  const grid = dg.grid;
  if (!grid?.length) {
    return { w: typeof dg.width === "number" ? dg.width : 1, h: typeof dg.height === "number" ? dg.height : 1 };
  }
  const gh = grid.length;
  const gw = grid.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
  return {
    w: Math.max(typeof dg.width === "number" ? dg.width : 0, gw),
    h: Math.max(typeof dg.height === "number" ? dg.height : 0, gh),
  };
}

type ForgeGridDungeon = {
  grid: number[][];
  rooms?: Array<{ id: number; x: number; y: number; w: number; h: number; cx: number; cy: number; theme?: string }>;
  entities?: Array<{ x: number; y: number; type: string; name?: string; roomId?: number; [k: string]: unknown }>;
  decoOverlay?: Array<{ x: number; y: number; ch: string; fg?: string; name?: string; roomId?: number; [k: string]: unknown }>;
  width: number;
  height: number;
  /** When set, town maps skip per-building ID tiles (they read as ugly boxes on the canvas). */
  locationType?: string;
  glyphs?: Record<string, string>;
  /** Stream arrows, slippery hints, etc. from forgeLocationUpgrades */
  forgeRenderOverlay?: {
    streamFlow?: Record<string, "n" | "s" | "e" | "w">;
    slippery?: string[];
    lurkZones?: string[];
    sewerMainCells?: string[];
    caveSymbolCells?: string[];
  } | null;
};

export function buildRenderGrid(dg: ForgeGridDungeon, forgeCfg: { showThemes?: boolean; playerView?: boolean }): RenderCell[][] {
  const showThemes = !!forgeCfg?.showThemes;
  const playerView = !!forgeCfg?.playerView;
  const fo = dg.forgeRenderOverlay;
  const grid = dg.grid;
  const rooms = dg.rooms ?? [];
  const entities = dg.entities ?? [];
  const decoOverlay = dg.decoOverlay ?? [];
  const rawG = dg.glyphs ?? {};
  if (!grid || !Array.isArray(grid) || grid.length === 0) {
    throw new Error("buildRenderGrid: missing grid");
  }
  /** Actual tile array size (grid can be wider/taller than stored width/height after edits). */
  const gridH = grid.length;
  const gridW = grid.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
  if (gridW === 0) {
    throw new Error("buildRenderGrid: empty grid rows");
  }
  const Wmeta = typeof dg.width === "number" ? dg.width : gridW;
  const Hmeta = typeof dg.height === "number" ? dg.height : gridH;
  const W = Math.max(Wmeta, gridW);
  const H = Math.max(Hmeta, gridH);
  const G = {
    floor: ".",
    wall: "#",
    door: "+",
    corr: ".",
    voidCh: " ",
    water: "~",
    bridge: "=",
    lava: "≈",
    pillar: "O",
    road: ":",
    stairsU: "<",
    stairsD: ">",
    ...rawG,
  };
  const eMap: Record<string, (typeof entities)[0]> = {};
  entities.forEach((e) => {
    eMap[`${e.x},${e.y}`] = e;
  });
  const dMap: Record<string, (typeof decoOverlay)[0]> = {};
  decoOverlay.forEach((d) => {
    dMap[`${d.x},${d.y}`] = d;
  });
  const labelMap: Record<string, (typeof rooms)[0]> = {};
  const skipRoomCenterLabels = dg.locationType === "town";
  if (!skipRoomCenterLabels) {
    rooms.forEach((r) => {
      labelMap[`${r.cx},${r.cy}`] = r;
    });
  }
  const themeMap: Record<string, string> = {};
  if (showThemes) {
    for (const r of rooms) {
      if (!r.theme) continue;
      const gx = Math.min(r.x + r.w - 1, r.x + 1);
      const gy = Math.min(r.y + r.h - 1, r.y + 1);
      themeMap[`${gx},${gy}`] = r.theme;
    }
  }
  const out: RenderCell[][] = [];
  for (let y = 0; y < H; y++) {
    const row: RenderCell[] = [];
    for (let x = 0; x < W; x++) {
      const k = `${x},${y}`;
      const ent = eMap[k];
      const decoRaw = dMap[k];
      const deco =
        decoRaw && playerView && (decoRaw as { playerHide?: boolean }).playerHide ? undefined : decoRaw;
      const label = labelMap[k];
      const gridRow = grid[y];
      const tile =
        gridRow != null && x < gridRow.length && typeof gridRow[x] === "number" ? gridRow[x]! : T.V;
      let ch: string;
      let eType: string | null = null;
      let fg: string | null = null;
      let eName: string | null = null;
      let extra: unknown = null;
      if (ent) {
        if (ent.type === "dm_marker") {
          ch = typeof (ent as { glyph?: string }).glyph === "string" ? String((ent as { glyph?: string }).glyph) : "\u{1F441}";
          eType = "dm_marker";
          extra = ent;
        } else {
          const mg =
            typeof (ent as { mapGlyph?: string }).mapGlyph === "string"
              ? String((ent as { mapGlyph?: string }).mapGlyph)
              : "";
          if (mg) {
            ch = mg.slice(0, 2);
            eType = String(ent.type ?? "marker");
          } else {
            ch =
              ent.type === "monster"
                ? monsterGlyph(ent.name)
                : ent.type === "trap"
                  ? trapGlyph(ent.name)
                  : ent.type === "item"
                    ? itemGlyph(ent.name)
                    : ent.type === "riddle"
                      ? "?"
                      : "?";
            eType = ent.type;
          }
          extra = ent;
        }
      } else if (deco && String(deco.ch ?? "").trim() !== "") {
        ch = deco.ch;
        fg = deco.fg ?? null;
        eType = "deco";
        eName = deco.name ?? null;
        extra = deco;
      } else if (label) {
        ch = String(label.id);
        eType = "label";
      } else if (showThemes && themeMap[k] && (tile === T.F || tile === T.C || tile === T.ROAD || tile === T.BRIDGE)) {
        ch = THEME_GLYPH[themeMap[k]] || G.floor;
        eType = "theme";
      } else {
        switch (tile) {
          case T.V:
            ch = G.voidCh;
            break;
          case T.F:
            ch = G.floor;
            break;
          case T.W:
            ch = G.wall;
            break;
          case T.D:
            ch = G.door;
            break;
          case T.C:
            ch = G.corr;
            break;
          case T.SU:
            ch = G.stairsU;
            break;
          case T.SD:
            ch = G.stairsD;
            break;
          case T.WA: {
            const flow = fo?.streamFlow?.[k];
            if (flow === "e") ch = "≈→";
            else if (flow === "w") ch = "←≈";
            else if (flow === "s") ch = "≈↓";
            else if (flow === "n") ch = "↑≈";
            else ch = G.water;
            break;
          }
          case T.P:
            ch = G.pillar;
            break;
          case T.ROAD:
            ch = G.road;
            break;
          case T.BRIDGE:
            ch = G.bridge;
            break;
          case T.LAVA:
            ch = G.lava;
            break;
          case T.SECRET_DOOR:
            ch = "?";
            break;
          case T.PIT:
            ch = "▽";
            break;
          case T.GATE:
            ch = "Ⅱ";
            break;
          case T.DRAWBRIDGE:
            ch = "=";
            break;
          case T.HEADSTONE:
            ch = "✝";
            break;
          case T.ARROW_SLIT:
            ch = "|";
            break;
          case T.MURDER_HOLE:
            ch = "⬡";
            break;
          case T.CELL_BARS:
            ch = "▒";
            break;
          case T.ALLEY:
            ch = ":";
            break;
          default:
            ch = G.voidCh;
        }
      }
      row.push({ ch, tile, eType, fg, eName, extra });
    }
    out.push(row);
  }
  return out;
}
