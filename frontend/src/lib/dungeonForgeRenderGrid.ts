import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import type { RenderCell } from "@/lib/dungeonTileRenderer";

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
};

type ForgeGridDungeon = {
  grid: number[][];
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx: number; cy: number; theme?: string }>;
  entities: Array<{ x: number; y: number; type: string; name?: string; roomId?: number; [k: string]: unknown }>;
  decoOverlay: Array<{ x: number; y: number; ch: string; fg?: string; name?: string; roomId?: number; [k: string]: unknown }>;
  width: number;
  height: number;
  glyphs?: Record<string, string>;
};

export function buildRenderGrid(dg: ForgeGridDungeon, forgeCfg: { showThemes?: boolean }): RenderCell[][] {
  const showThemes = !!forgeCfg?.showThemes;
  const { grid, rooms, entities, decoOverlay, width: W, height: H, glyphs: rawG = {} } = dg;
  const G = {
    floor: ".",
    wall: "#",
    door: "+",
    corr: ".",
    voidCh: " ",
    water: "~",
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
  rooms.forEach((r) => {
    labelMap[`${r.cx},${r.cy}`] = r;
  });
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
      const deco = dMap[k];
      const label = labelMap[k];
      const tile = grid[y][x];
      let ch: string;
      let eType: string | null = null;
      let fg: string | null = null;
      let eName: string | null = null;
      let extra: unknown = null;
      if (ent) {
        ch = ent.type === "monster" ? monsterGlyph(ent.name) : ent.type === "trap" ? "^" : "!";
        eType = ent.type;
        extra = ent;
      } else if (deco) {
        ch = deco.ch;
        fg = deco.fg ?? null;
        eType = "deco";
        eName = deco.name ?? null;
        extra = deco;
      } else if (label) {
        ch = String(label.id);
        eType = "label";
      } else if (showThemes && themeMap[k] && (tile === T.F || tile === T.C || tile === T.ROAD)) {
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
          case T.WA:
            ch = G.water;
            break;
          case T.P:
            ch = G.pillar;
            break;
          case T.ROAD:
            ch = G.road;
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
