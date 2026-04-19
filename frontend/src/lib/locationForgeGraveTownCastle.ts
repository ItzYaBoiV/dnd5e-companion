/**
 * Post-layout enrichers for Graveyard, Town, and Castle Forge maps (DM-facing features).
 */

import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import { pickGoofyRiddle } from "@/lib/forgeRiddles";

type Rng = () => number;
function rI(a: number, b: number, r: Rng): number {
  return Math.floor(r() * (b - a + 1)) + a;
}
function pick<T>(arr: T[], r: Rng): T {
  return arr[Math.floor(r() * arr.length)]!;
}

const EPITHS = [
  "Beloved parent and terrible cook.",
  "Gone to the great loot table in the sky.",
  "Here lies patience — mostly.",
  "Paid their tab. Eventually.",
  "Crit failed vs. time.",
];
const FIRST = [
  "Aldric",
  "Marta",
  "Silas",
  "Brunhilde",
  "Cedric",
  "Ysolde",
  "Tom",
  "Edda",
];
const LAST = ["Blackwood", "Stone", "Rook", "Hollow", "Fair", "Grim", "Vance", "Marrow"];

const TOWN_HOOKS = [
  "Worried — a shipment is three days late.",
  "Friendly, but watches the door like a hawk.",
  "Whispers about strange lights in the old mill.",
  "Owes money to the wrong people.",
  "Knows every rumor on Market Lane.",
];
const STREET_NAMES = ["Mill Road", "King's Way", "Market Lane", "Temple Row", "Riverside Walk", "Coppergate"];
const HERALD = [
  { color: "Crimson", charge: "a white tower" },
  { color: "Azure", charge: "a golden lion" },
  { color: "Sable", charge: "three silver stars" },
  { color: "Vert", charge: "a stag couchant" },
  { color: "Or", charge: "a black raven" },
  { color: "Argent", charge: "a red rose" },
  { color: "Purpure", charge: "a chained book" },
  { color: "Gules", charge: "a silver sword" },
];

export type ForgeEntity = Record<string, unknown> & {
  x: number;
  y: number;
  type: string;
  name?: string;
  mapGlyph?: string;
  roomId?: number | null;
};

export type ForgeRoom = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type?: string;
  label?: string;
  buildingArchetype?: string;
  castleArchetype?: string;
  interiorFogGate?: boolean;
  dmNotes?: string;
  containsSummary?: string;
};

export type ForgeDmHints = {
  bossRoom?: { x: number; y: number; w: number; h: number };
  corridorLabels?: { x: number; y: number; text: string }[];
  throneCx?: number;
  throneCy?: number;
  /** Graveyard iron gate + enter arrow */
  graveyardGate?: { gx: number; gy: number; label?: string };
  consecratedCells?: { x: number; y: number; k: "consecrated" | "desecrated" }[];
  /** Town street labels (DM) */
  streetLabels?: { x: number; y: number; text: string; rot?: number }[];
  /** Dotted patrol polylines: sequences of grid points */
  patrolPaths?: { points: { x: number; y: number }[]; label?: string }[];
  /** Secret escape tunnel polyline (castle) */
  escapeTunnel?: { points: { x: number; y: number }[] };
  /** Chase mode: road cells with length in ft */
  chaseSegments?: { x: number; y: number; ft: number }[];
  fortifiedDmNote?: string;
};

function isFloor(t: number | undefined): boolean {
  return (
    t === T.F ||
    t === T.PIT ||
    t === T.ROAD ||
    t === T.ALLEY ||
    t === T.C ||
    t === T.WA
  );
}

/** Fill map-edge void with walls so the town reads as palisaded / curtain-walled. */
function applyFortifiedTownPerimeter(grid: number[][], W: number, H: number, rng: Rng): void {
  for (let x = 0; x < W; x++) {
    if (grid[0]?.[x] === T.V) grid[0][x] = T.W;
    if (grid[H - 1]?.[x] === T.V) grid[H - 1][x] = T.W;
  }
  for (let y = 0; y < H; y++) {
    if (grid[y]?.[0] === T.V) grid[y][0] = T.W;
    if (grid[y]?.[W - 1] === T.V) grid[y][W - 1] = T.W;
  }
  const sx = Math.floor(W / 2);
  if (grid[H - 1]?.[sx] === T.ROAD) {
    grid[H - 1][sx] = T.GATE;
    if (sx + 1 < W && grid[H - 1][sx + 1] === T.ROAD) grid[H - 1][sx + 1] = T.GATE;
  }
  const px = Math.min(W - 2, Math.max(2, Math.floor(W / 2) + rI(-2, 2, rng)));
  if (grid[0]?.[px] === T.W && isFloor(grid[1]?.[px])) grid[0][px] = T.GATE;
}

export function enrichGraveyardFeatures(args: {
  grid: number[][];
  rooms: ForgeRoom[];
  entities: ForgeEntity[];
  decoOverlay: Array<Record<string, unknown>>;
  riddles: Array<Record<string, unknown>>;
  rng: Rng;
  W: number;
  H: number;
  usedCells: Set<string>;
}): ForgeDmHints {
  const { grid, rooms, entities, riddles, rng, W, H, usedCells } = args;
  const hints: ForgeDmHints = {};

  for (const rm of rooms) {
    rm.interiorFogGate = true;
  }

  // South gate → iron GATE tiles
  const gcx = Math.floor(W / 2);
  for (const gx of [gcx, gcx + 1]) {
    if (gx >= 0 && gx < W && H > 1) {
      const y = H - 1;
      if (grid[y]?.[gx] === T.D || grid[y]?.[gx] === T.W) grid[y][gx] = T.GATE;
    }
  }
  hints.graveyardGate = { gx: gcx, gy: H - 1, label: "→ ENTER" };

  // Central mass grave pit
  const pw = rI(3, 5, rng);
  const ph = rI(3, 5, rng);
  const px = Math.floor(W / 2 - pw / 2);
  const py = Math.floor(H / 2 - ph / 2);
  for (let y = py; y < py + ph; y++) {
    for (let x = px; x < px + pw; x++) {
      if (y > 0 && y < H - 1 && x > 0 && x < W - 1 && grid[y]?.[x] === T.F) {
        grid[y][x] = T.PIT;
      }
    }
  }

  // Headstones (impassable HEADSTONE tiles)
  const targetHs = rI(8, 20, rng);
  let placed = 0;
  for (let tries = 0; tries < 4000 && placed < targetHs; tries++) {
    const x = rI(1, W - 2, rng);
    const y = rI(1, H - 2, rng);
    if (grid[y]?.[x] !== T.F) continue;
    if (rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) continue;
    if (usedCells.has(`${x},${y}`)) continue;
    const y0 = 1300 + rng() * 700;
    const name = `${pick(FIRST, rng)} ${pick(LAST, rng)}`;
    grid[y][x] = T.HEADSTONE;
    usedCells.add(`${x},${y}`);
    entities.push({
      type: "headstone",
      x,
      y,
      name: "Headstone",
      mapGlyph: "✝",
      inscription: `Here lies ${name}, ${Math.floor(y0)}. ${pick(EPITHS, rng)}`,
      coverNote: "Half cover (+2 AC) if hiding behind the stone.",
      roomId: null,
    });
    placed++;
  }

  // Undead spawn suggestions (ghosted on DM map)
  const und = rng() < 0.5 ? "Zombie" : "Skeleton";
  const pitCell = { x: px + Math.floor(pw / 2), y: py + Math.floor(ph / 2) };
  entities.push({
    type: "spawn_suggestion",
    x: pitCell.x,
    y: pitCell.y,
    name: `${und} (pit)`,
    mapGlyph: "◔",
    ghosted: true,
    note: "Suggested undead encounter — remove if unused.",
    roomId: null,
  });
  const big = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (big) {
    const ix = rI(big.x + 1, big.x + big.w - 2, rng);
    const iy = rI(big.y + 1, big.y + big.h - 2, rng);
    if (isFloor(grid[iy]?.[ix])) {
      entities.push({
        type: "spawn_suggestion",
        x: ix,
        y: iy,
        name: `${und} (mausoleum)`,
        mapGlyph: "◔",
        ghosted: true,
        roomId: big.id,
      });
    }
  }
  const edge = { x: rI(2, 4, rng), y: rI(2, H - 3, rng) };
  if (isFloor(grid[edge.y]?.[edge.x])) {
    entities.push({
      type: "spawn_suggestion",
      x: edge.x,
      y: edge.y,
      name: `${und} (yard)`,
      mapGlyph: "◔",
      ghosted: true,
      roomId: null,
    });
  }

  // Mausoleum crypt stairs (50% if ≥4×4)
  for (const rm of rooms) {
    if (rm.w < 4 || rm.h < 4) continue;
    if (rng() >= 0.5) continue;
    let sx = 0,
      sy = 0,
      ok = false;
    for (let t = 0; t < 40; t++) {
      sx = rI(rm.x + 1, rm.x + rm.w - 2, rng);
      sy = rI(rm.y + 1, rm.y + rm.h - 2, rng);
      if (grid[sy]?.[sx] === T.F) {
        ok = true;
        break;
      }
    }
    if (ok) {
      grid[sy][sx] = T.SD;
      rm.dmNotes = (rm.dmNotes ? rm.dmNotes + " " : "") + "Stairs to a burial crypt — link a second dungeon map.";
    }
  }

  // Consecrated / desecrated markers (2 cells)
  hints.consecratedCells = [];
  for (let i = 0; i < 2; i++) {
    const x = rI(2, W - 3, rng);
    const y = rI(2, H - 3, rng);
    if (grid[y]?.[x] !== T.F) continue;
    hints.consecratedCells.push({
      x,
      y,
      k: rng() < 0.5 ? "consecrated" : "desecrated",
    });
  }

  // Riddle on largest mausoleum
  const largest = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (largest) {
    const rr = pickGoofyRiddle(rng);
    let dx = largest.x + Math.floor(largest.w / 2);
    let dy = largest.y;
    for (let t = 0; t < 8; t++) {
      if (grid[dy]?.[dx] === T.D || grid[dy]?.[dx] === T.GATE) break;
      dy++;
      if (dy > largest.y + largest.h) dy = largest.y;
    }
    const riddleRow = {
      id: riddles.length + 1,
      roomId: largest.id,
      prompt: rr.prompt,
      answer: rr.answer,
      solved: false,
      rewardName: "Loot tier +1 if marked solved (DM)",
      epitaphHook: true,
    };
    riddles.push(riddleRow);
    entities.push({
      type: "riddle",
      riddleId: riddleRow.id,
      prompt: rr.prompt,
      answer: rr.answer,
      x: dx,
      y: dy,
      roomId: largest.id,
      name: "Epitaph riddle",
      doorInscription: "Answer the riddle to open the vault.",
    });
  }

  // Structure notes for print
  for (const rm of rooms) {
    const undC = rng() < 0.55 ? "1–2 skeletons" : "1 zombie";
    const loot = rng() < 0.4 ? "silver locket" : "copper urn";
    rm.containsSummary = `${undC}, ${loot}`;
    let hasSd = false;
    outer: for (let yy = rm.y; yy < rm.y + rm.h; yy++) {
      for (let xx = rm.x; xx < rm.x + rm.w; xx++) {
        if (grid[yy]?.[xx] === T.SD) {
          hasSd = true;
          break outer;
        }
      }
    }
    if (hasSd) {
      rm.dmNotes = (rm.dmNotes ? rm.dmNotes + " " : "") + "Secret staircase to crypt below.";
    } else if (rng() < 0.35) {
      rm.dmNotes = (rm.dmNotes ? rm.dmNotes + " " : "") + "Locked iron door (DC 14).";
    }
  }

  return hints;
}

const ARCH = [
  "tavern",
  "blacksmith",
  "temple",
  "stall",
  "inn",
  "guard_post",
  "residence",
  "market",
  "town_hall",
  "stable",
  "apothecary",
  "library",
] as const;

const ARCH_GLYPH: Record<string, string> = {
  tavern: "🍺",
  blacksmith: "⚒",
  temple: "†",
  stall: "▭",
  inn: "⌂",
  guard_post: "⚑",
  residence: "⌂",
  market: "¤",
  town_hall: "⌂",
  stable: "♘",
  apothecary: "⚗",
  library: "📖",
};

export function assignTownBuildingArchetypes(rooms: ForgeRoom[], rng: Rng): void {
  const sorted = [...rooms].sort((a, b) => {
    const area = (r: ForgeRoom) => r.w * r.h;
    return area(b) - area(a);
  });
  const center = sorted[0];
  for (const rm of rooms) {
    const area = rm.w * rm.h;
    const cx = rm.cx;
    const cy = rm.cy;
    const distCenter = center ? Math.abs(cx - center.cx) + Math.abs(cy - center.cy) : 0;
    let arch = "residence";
    if (area >= 40 && distCenter < 8) arch = rng() < 0.55 ? "tavern" : "inn";
    else if (area >= 30 && distCenter < 10) arch = rng() < 0.4 ? "temple" : "market";
    else if (area >= 22 && distCenter > 12) arch = rng() < 0.45 ? "blacksmith" : "stable";
    else if (area < 18) arch = rng() < 0.35 ? "stall" : "guard_post";
    else arch = pick([...ARCH], rng);
    rm.buildingArchetype = arch;
    rm.label = `${arch.replace(/_/g, " ")} · ${rm.label ?? rm.type ?? ""}`.trim();
  }
}

export function enrichTownFeatures(args: {
  grid: number[][];
  rooms: ForgeRoom[];
  entities: ForgeEntity[];
  decoOverlay: Array<Record<string, unknown>>;
  rng: Rng;
  W: number;
  H: number;
  usedCells: Set<string>;
  cfg: { townMarketDay?: boolean; townFortified?: boolean; townChaseMode?: boolean };
}): ForgeDmHints {
  const { grid, rooms, entities, rng, W, H, usedCells, cfg } = args;
  const hints: ForgeDmHints = {};

  assignTownBuildingArchetypes(rooms, rng);

  if (cfg.townFortified) {
    applyFortifiedTownPerimeter(grid, W, H, rng);
    hints.fortifiedDmNote =
      "Stone/wood curtain on the map margin (edge void → walls). South road gates marked; north postern where possible.";
  }

  // Central well / fountain at largest road intersection (rough: scan for ROAD cross)
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (grid[y]?.[x] !== T.ROAD) continue;
      const arms =
        (grid[y - 1]?.[x] === T.ROAD ? 1 : 0) +
        (grid[y + 1]?.[x] === T.ROAD ? 1 : 0) +
        (grid[y]?.[x - 1] === T.ROAD ? 1 : 0) +
        (grid[y]?.[x + 1] === T.ROAD ? 1 : 0);
      if (arms >= 3) {
        const sc = arms * 10 - Math.abs(x - W / 2) - Math.abs(y - H / 2);
        if (!best || sc > best.score) best = { x, y, score: sc };
      }
    }
  }
  if (best && isFloor(grid[best.y]?.[best.x])) {
    entities.push({
      type: "landmark",
      x: best.x,
      y: best.y,
      name: "Town well",
      mapGlyph: "◎",
      flavor: "The well is 20 ft deep. A bucket hangs from a rope.",
      roomId: null,
    });
  }

  // NPCs @ buildings
  const tavern = rooms.find((r) => r.buildingArchetype === "tavern" || r.buildingArchetype === "inn");
  const smith = rooms.find((r) => r.buildingArchetype === "blacksmith");
  const npcs: ForgeEntity[] = [];
  if (tavern) {
    const nx = rI(tavern.x + 1, tavern.x + tavern.w - 2, rng);
    const ny = rI(tavern.y + 1, tavern.y + tavern.h - 2, rng);
    if (isFloor(grid[ny]?.[nx])) {
      npcs.push({
        type: "npc",
        x: nx,
        y: ny,
        name: `${pick(FIRST, rng)} the innkeeper`,
        mapGlyph: "@",
        hook: pick(TOWN_HOOKS, rng),
        roomId: tavern.id,
      });
    }
  }
  if (smith) {
    const nx = rI(smith.x + 1, smith.x + smith.w - 2, rng);
    const ny = rI(smith.y + 1, smith.y + smith.h - 2, rng);
    if (isFloor(grid[ny]?.[nx])) {
      npcs.push({
        type: "npc",
        x: nx,
        y: ny,
        name: `${pick(FIRST, rng)} the smith`,
        mapGlyph: "@",
        hook: pick(TOWN_HOOKS, rng),
        roomId: smith.id,
      });
    }
  }
  for (const n of npcs) {
    usedCells.add(`${n.x},${n.y}`);
    entities.push(n);
  }

  // Notice board near tavern block
  if (tavern) {
    let bx = tavern.x + tavern.w;
    let by = tavern.cy;
    bx = Math.min(W - 2, bx + 1);
    if (grid[by]?.[bx] === T.ROAD || grid[by]?.[bx] === T.F) {
      entities.push({
        type: "notice_board",
        x: bx,
        y: by,
        name: "Notice board",
        mapGlyph: "▤",
        quests: [
          "50 gp bounty: wolf terrorizing northern farms.",
          "Missing: Aldric the Merchant — last seen south road.",
          "Wanted: 5 bundles moonmoss — 10 gp each (alchemist).",
        ],
        roomId: null,
      });
    }
  }

  // Patrol paths on main roads
  const patrols: { points: { x: number; y: number }[]; label?: string }[] = [];
  for (let p = 0; p < 3; p++) {
    const y = rI(4, H - 5, rng);
    let x0 = 2;
    const pts: { x: number; y: number }[] = [];
    while (x0 < W - 2) {
      if (grid[y]?.[x0] === T.ROAD) pts.push({ x: x0, y });
      x0 += rI(3, 7, rng);
    }
    if (pts.length >= 2) patrols.push({ points: pts, label: "Guards every ~10 min" });
  }
  hints.patrolPaths = patrols;

  // Street name overlays (3–5)
  hints.streetLabels = [];
  const nNames = rI(3, 5, rng);
  for (let i = 0; i < nNames; i++) {
    hints.streetLabels.push({
      x: rI(Math.floor(W / 4), Math.floor((3 * W) / 4), rng),
      y: rI(Math.floor(H / 4), Math.floor((3 * H) / 4), rng),
      text: pick(STREET_NAMES, rng),
      rot: rng() < 0.5 ? 0 : -Math.PI / 2,
    });
  }

  // Narrow alleys: darken 1-tile ROAD spurs between blocks
  for (let y = 3; y < H - 3; y += 5) {
    for (let x = 3; x < W - 3; x += 9) {
      if (rng() > 0.55) continue;
      if (grid[y]?.[x] === T.F && grid[y]?.[x + 1] === T.ROAD) {
        grid[y][x] = T.ALLEY;
      }
    }
  }

  // Market day stalls
  if (cfg.townMarketDay) {
    for (let i = 0; i < rI(8, 12, rng); i++) {
      const x = rI(2, W - 3, rng);
      const y = rI(2, H - 3, rng);
      if (grid[y]?.[x] !== T.ROAD) continue;
      entities.push({
        type: "stall",
        x,
        y,
        name: "Market stall",
        mapGlyph: "▭",
        note: "DC 10 Perception to spot a pickpocket in crowds.",
        roomId: null,
      });
    }
    for (let i = 0; i < rI(4, 6, rng); i++) {
      const x = rI(2, W - 3, rng);
      const y = rI(2, H - 3, rng);
      if (grid[y]?.[x] !== T.ROAD) continue;
      entities.push({
        type: "npc",
        x,
        y,
        name: "Townsfolk",
        mapGlyph: "@",
        hook: "Background crowd.",
        roomId: null,
      });
    }
  }

  // Chase mode: label some road spans with ft (5 ft / tile)
  if (cfg.townChaseMode) {
    const seg: { x: number; y: number; ft: number }[] = [];
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (grid[y]?.[x] === T.ROAD && (x + y) % 9 === 0) {
          seg.push({ x, y, ft: 5 * rI(4, 14, rng) });
        }
      }
    }
    hints.chaseSegments = seg.slice(0, 40);
  }

  return hints;
}

export function enrichCastleFeatures(args: {
  grid: number[][];
  rooms: ForgeRoom[];
  entities: ForgeEntity[];
  decoOverlay: Array<Record<string, unknown>>;
  rng: Rng;
  W: number;
  H: number;
  usedCells: Set<string>;
}): ForgeDmHints {
  const { grid, rooms, entities, decoOverlay, rng, W, H } = args;
  const hints: ForgeDmHints = {};

  const byArea = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h);
  const keep = byArea[0];
  const throne = rooms.find((r) => /throne|keep/i.test(String(r.label ?? r.type ?? ""))) ?? byArea[0];

  for (const rm of rooms) {
    const lab = String(rm.label ?? rm.type ?? "").toLowerCase();
    if (/tower/i.test(lab)) rm.castleArchetype = "Guard Tower";
    else if (rm.id === keep?.id) rm.castleArchetype = rng() < 0.5 ? "Great Hall" : "Throne Room";
    else if (/barrack/i.test(lab)) rm.castleArchetype = "Barracks";
    else if (/chapel/i.test(lab)) rm.castleArchetype = "Chapel";
    else if (/vault|dungeon|oubliette|cell/i.test(lab)) rm.castleArchetype = "Dungeon / Oubliette";
    else if (/gate/i.test(lab)) rm.castleArchetype = "Gatehouse";
    else rm.castleArchetype = "Chamber";
  }

  // South drawbridge tiles (replace door row center)
  const wall = 3;
  const gy = H - wall;
  const gx0 = Math.floor(W / 2) - 1;
  for (const dx of [0, 1]) {
    const gx = gx0 + dx;
    if (grid[gy]?.[gx] === T.D) grid[gy][gx] = T.DRAWBRIDGE;
  }

  // Murder holes in gatehouse corridor
  const gh = rooms.find((r) => /gate/i.test(String(r.label ?? r.type ?? "")));
  if (gh) {
    let n = 0;
    for (let y = gh.y; y < gh.y + gh.h && n < 4; y++) {
      for (let x = gh.x; x < gh.x + gh.w && n < 4; x++) {
        if (grid[y]?.[x] === T.C || grid[y]?.[x] === T.F) {
          if (rng() < 0.35) {
            decoOverlay.push({
              x,
              y,
              ch: "⬡",
              fg: "#a80",
              name: "Murder hole",
              decoKey: "murder_hole_marker",
              roomId: gh.id,
            });
            n++;
          }
        }
      }
    }
  }

  // Arrow slits on outer walls (every 4 tiles)
  for (let x = 2; x < W - 2; x += 4) {
    for (const y of [1, H - 2]) {
      if (grid[y]?.[x] === T.W && rng() < 0.4) {
        grid[y][x] = T.ARROW_SLIT;
      }
    }
  }
  for (let y = 2; y < H - 2; y += 4) {
    for (const x of [1, W - 2]) {
      if (grid[y]?.[x] === T.W && rng() < 0.35) {
        grid[y][x] = T.ARROW_SLIT;
      }
    }
  }

  // Battlements markers along inner courtyard edge (walkable roof fighting position — DM adjudicates height)
  const innerY = wall + 1;
  for (let x = wall + 2; x < W - wall - 2; x += 5) {
    if (grid[innerY]?.[x] === T.F) {
      decoOverlay.push({
        x,
        y: innerY,
        ch: "⌢",
        fg: "#aab",
        name: "Battlement",
        decoKey: "battlement_cren",
        roomId: null,
      });
    }
  }

  // Courtyard well
  if (keep) {
    const wx = keep.cx;
    const wy = keep.cy + rI(-2, 2, rng);
    if (isFloor(grid[wy]?.[wx])) {
      entities.push({
        type: "landmark",
        x: wx,
        y: wy,
        name: "Courtyard well",
        mapGlyph: "◎",
        flavor: "Critical during siege — if poisoned, castle may hold only 1d4 days.",
        roomId: keep.id,
      });
    }
  }

  // Banner on highest tower (corner room)
  const tower = [...rooms].sort((a, b) => a.y - b.y)[0];
  if (tower) {
    const hx = rI(tower.x + 1, tower.x + tower.w - 2, rng);
    const hy = tower.y + 1;
    const hd = pick(HERALD, rng);
    const house = `${pick(["Blackmere", "Ashford", "Stormhold", "Ironfell"], rng)}`;
    entities.push({
      type: "banner",
      x: hx,
      y: hy,
      name: `Banner of House ${house}`,
      mapGlyph: "⚑",
      heraldry: `${hd.color} with ${hd.charge}`,
      roomId: tower.id,
    });
  }

  // Siege engines
  for (let i = 0; i < 2; i++) {
    const x = rI(4, W - 5, rng);
    const y = rI(4, H - 5, rng);
    if (!isFloor(grid[y]?.[x])) continue;
    const ballista = i === 0;
    entities.push({
      type: "siege",
      x,
      y,
      name: ballista ? "Ballista" : "Catapult",
      mapGlyph: ballista ? "╬" : "▣",
      stats: ballista
        ? "Range 120/480 ft · 3d10 piercing · reload 1 action"
        : "Range 300/1200 ft · 8d10 bludgeoning · reload 2 actions",
      roomId: null,
    });
  }

  // Dungeon stair + oubliette flavor
  const dun = rooms.find((r) => /dungeon|oubliette|vault/i.test(String(r.label ?? r.type ?? "")));
  if (dun) {
    let sx = dun.cx,
      sy = dun.cy;
    if (grid[sy]?.[sx] === T.F) grid[sy][sx] = T.SD;
    entities.push({
      type: "landmark",
      x: sx,
      y: sy,
      name: "Castle dungeon stair",
      mapGlyph: ">",
      flavor: "Links to a castle dungeon map — cells, prisoners, optional torture room (mature toggle off-screen).",
      roomId: dun.id,
    });
    for (let i = 0; i < 3; i++) {
      const cx = rI(dun.x + 1, dun.x + dun.w - 2, rng);
      const cy = rI(dun.y + 1, dun.y + dun.h - 2, rng);
      if (grid[cy]?.[cx] === T.F && rng() < 0.5) {
        grid[cy][cx] = T.CELL_BARS;
      }
    }
  }

  // Secret passage from throne room
  if (throne) {
    let tx = throne.x + 1;
    let ty = throne.y + Math.floor(throne.h / 2);
    if (grid[ty]?.[tx] !== T.W) {
      tx = throne.x + Math.floor(throne.w / 2);
      ty = throne.y + 1;
    }
    if (grid[ty]?.[tx] === T.W) grid[ty][tx] = T.SECRET_DOOR;
    hints.escapeTunnel = {
      points: [
        { x: tx, y: ty },
        { x: 2, y: Math.floor(H / 2) },
        { x: 1, y: Math.floor(H / 2) },
      ],
    };
    entities.push({
      type: "landmark",
      x: tx,
      y: ty,
      name: "Secret escape",
      mapGlyph: "?",
      flavor: "DC 20 Investigation to find without a map. Tunnel exits beyond the walls.",
      roomId: throne.id,
    });
  }

  // Keep second-floor note + stairs
  if (keep) {
    let sx = rI(keep.x + 1, keep.x + keep.w - 2, rng);
    let sy = rI(keep.y + 1, keep.y + keep.h - 2, rng);
    if (grid[sy]?.[sx] === T.F) grid[sy][sx] = T.SU;
    keep.dmNotes =
      (keep.dmNotes ? keep.dmNotes + " " : "") +
      "Upper floor: bedchamber + study — use interior mini-map (DM).";
  }

  // Portcullis entity at gatehouse
  if (gh) {
    const px = gh.cx;
    const py = gh.y + gh.h - 1;
    entities.push({
      type: "portcullis",
      x: px,
      y: py,
      name: "Portcullis",
      mapGlyph: "╫",
      note: "Lower/Raise — blocks passage when down.",
      roomId: gh.id,
    });
  }

  return hints;
}

export function archGlyphForRoom(r: ForgeRoom): string | undefined {
  const a = r.buildingArchetype;
  if (!a) return undefined;
  return ARCH_GLYPH[a] ?? "⌂";
}
