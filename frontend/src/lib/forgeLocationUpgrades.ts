/**
 * Post-process for Cave / Swamp / Temple / Sewer maps — thematic entities, DM metadata, render hints.
 * Called from DungeonForgeImpl.generateMap after geometry + applyLocationSpecialFeatures.
 */
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

type Rng = () => number;
type Room = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type?: string;
  label?: string;
  theme?: string;
  [k: string]: unknown;
};

export type ForgeLocationMeta = {
  caveVariant?: "natural" | "goblin" | "kobold" | "dragon";
  caveBioluminescent?: boolean;
  caveDeityEcho?: string;
  templeDeity?: string;
  templeCondition?: "active" | "abandoned" | "desecrated";
  templeMonsterHint?: string;
  sewerFlow?: "north" | "south" | "east" | "west";
  sewerDistrictName?: string;
  swampFeverNote?: string;
  swampInsectsNote?: string;
  smellZoneNote?: string;
  willOWisp?: { x: number; y: number }[];
  blackMarketOpen?: boolean;
  dmPanels?: string[];
};

export type ForgeRenderOverlayJson = {
  streamFlow?: Record<string, "n" | "s" | "e" | "w">;
  slippery?: string[];
  lurkZones?: string[];
  sewerMainCells?: string[];
  caveSymbolCells?: string[];
};

function pick<T>(a: T[], rng: Rng): T {
  return a[Math.floor(rng() * a.length)]!;
}

function rI(a: number, b: number, rng: Rng): number {
  return Math.floor(rng() * (b - a + 1)) + a;
}

function entranceRoom(rooms: Room[], H: number): Room | null {
  if (!rooms.length) return null;
  return rooms.reduce((best, r) => {
    const d = Math.abs(r.cx - 0) + Math.abs(r.cy - H / 2);
    const bd = Math.abs(best.cx - 0) + Math.abs(best.cy - H / 2);
    return d < bd ? r : best;
  }, rooms[0]!);
}

const DEITIES = ["Sun", "Moon", "War", "Death", "Nature", "Knowledge", "Trickery", "Life"] as const;
const DEITY_DAMAGE: Record<string, string> = {
  Sun: "radiant",
  Moon: "radiant",
  War: "fire",
  Death: "cold",
  Nature: "lightning",
  Knowledge: "psychic",
  Trickery: "poison",
  Life: "necrotic",
};

const DEITY_MONSTER: Record<string, string> = {
  Sun: "celestials, priests",
  Moon: "lycanthropes, fey",
  War: "cultists, veterans",
  Death: "undead, specters",
  Nature: "beasts, plant creatures",
  Knowledge: "constructs, mages",
  Trickery: "doppelgangers, imps",
  Life: "angels, clerics",
};

export function applyForgeLocationUpgrades(deps: {
  grid: number[][];
  rooms: Room[];
  entities: Array<Record<string, unknown>>;
  decoOverlay: Array<Record<string, unknown>>;
  W: number;
  H: number;
  locationType: string;
  rng: Rng;
  cfg: Record<string, unknown>;
}): { meta: ForgeLocationMeta; renderOverlay: ForgeRenderOverlayJson } {
  const { grid, rooms, entities, decoOverlay, W, H, locationType, rng, cfg } = deps;
  const meta: ForgeLocationMeta = { dmPanels: [] };
  const slippery = new Set<string>();
  const lurkZones = new Set<string>();
  const sewerMainCells = new Set<string>();
  const caveSymbolCells = new Set<string>();
  let streamFlowOut: Record<string, "n" | "s" | "e" | "w"> | undefined = undefined;

  const pushDeco = (o: Record<string, unknown>) => {
    decoOverlay.push(o);
  };
  const pushEnt = (o: Record<string, unknown>) => {
    entities.push(o);
  };

  if (locationType === "cave" || locationType === "volcanic_lair" || locationType === "fey_forest") {
    const isVolc = locationType === "volcanic_lair";
    const isFey = locationType === "fey_forest";
    const validCv = ["natural", "goblin", "kobold", "dragon"] as const;
    const cvRaw = cfg.caveVariant as string | undefined;
    meta.caveVariant = !isFey
      ? cvRaw && (validCv as readonly string[]).includes(cvRaw)
        ? (cvRaw as ForgeLocationMeta["caveVariant"])
        : pick(["natural", "natural", "goblin", "kobold", "dragon"], rng)
      : "natural";

    const bioMode = cfg.caveBioluminescentMode as string | undefined;
    if (bioMode === "on") meta.caveBioluminescent = true;
    else if (bioMode === "off") meta.caveBioluminescent = false;
    else if (typeof cfg.caveBioluminescent === "boolean") meta.caveBioluminescent = cfg.caveBioluminescent;
    else meta.caveBioluminescent = rng() < 0.35;

    for (const rm of rooms) {
      if (rm.w >= 3 && rm.h >= 3 && rm.w * rm.h >= 9) {
        const n = rI(2, 8, rng);
        for (let i = 0; i < n; i++) {
          const ceiling = rng() < 0.5;
          const px = rI(rm.x + 1, rm.x + rm.w - 2, rng);
          const py = rI(rm.y + 1, rm.y + rm.h - 2, rng);
          if (grid[py]?.[px] !== T.F) continue;
          if (ceiling) {
            pushDeco({
              x: px,
              y: py,
              ch: "▽",
              fg: "#7a6a58",
              name: "Stalactite",
              roomId: rm.id,
              decoKey: "stalactite_ceiling",
              dmHint:
                "Difficult terrain to move through under drip line. Half cover from the rock column’s facing side.",
            });
          } else {
            grid[py][px] = T.P;
            pushDeco({
              x: px,
              y: py,
              ch: "▲",
              fg: "#6a5a48",
              name: "Stalagmite",
              roomId: rm.id,
              decoKey: "stalagmite_floor",
              dmHint: "Impassable pillar of stone. Half cover from opposite side.",
            });
          }
        }
      }
      if (rng() < 0.3) {
        rm.echoing = true;
        const base = String(rm.label || rm.type || "Cavern");
        rm.label = `${base} · ECHOES`;
      }
    }

    if (rng() < 0.3 && !isVolc && !isFey) {
      const streamFlow: Record<string, "n" | "s" | "e" | "w"> = {};
      const src = pick(rooms, rng);
      const edge = rng() < 0.5 ? "e" : "s";
      let x = src.cx,
        y = src.cy;
      while (x >= 1 && x < W - 1 && y >= 1 && y < H - 1 && grid[y][x] !== T.F && grid[y][x] !== T.C) {
        if (edge === "e") x++;
        else y++;
        if (x >= W - 2 || y >= H - 2) break;
      }
      const steps = rI(12, 28, rng);
      for (let s = 0; s < steps; s++) {
        if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) break;
        grid[y][x] = T.WA;
        streamFlow[`${x},${y}`] = edge === "e" ? "e" : "s";
        if (edge === "e") x++;
        else y++;
      }
      streamFlowOut = streamFlow;
      meta.dmPanels!.push(
        "Underground stream: DC 10 Athletics to cross without falling prone. Flow follows arrows (≈).",
      );
    }

    const mushN = rI(1, 3, rng);
    for (let m = 0; m < mushN; m++) {
      const rm = pick(rooms, rng);
      const px = rI(rm.x + 1, rm.x + rm.w - 2, rng);
      const py = rI(rm.y + 1, rm.y + rm.h - 2, rng);
      if (grid[py]?.[px] !== T.F) continue;
      const kind = pick(["edible", "poisonous", "glowing"], rng);
      const hints: Record<string, string> = {
        edible: "Edible: 1d4 HP once per serving if eaten.",
        poisonous: "Poisonous: DC 12 CON or 1d6 poison + poisoned 1 hour.",
        glowing: "Glowing: sheds 10 ft dim light.",
      };
      pushDeco({
        x: px,
        y: py,
        ch: "🍄",
        fg: kind === "glowing" ? "#9fd" : "#a85",
        name: "Mushroom cluster",
        roomId: rm.id,
        decoKey: "mushroom_cluster",
        mushroomKind: kind,
        dmHint: hints[kind],
      });
    }

    if (meta.caveBioluminescent) {
      meta.dmPanels!.push(
        "Bioluminescent: walls near glowing mushrooms shed dim light; moss every few corridor tiles (5 ft dim).",
      );
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (grid[y][x] !== T.C || (x + y) % 7 !== 0) continue;
          pushDeco({
            x,
            y,
            ch: "·",
            fg: "#4a9a8a",
            name: "Glowing moss",
            roomId: null,
            decoKey: "glowing_moss",
            dmHint: "5 ft dim light.",
          });
        }
      }
    }

    if (!isVolc && rooms.length) {
      const largest = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0]!;
      if (rng() < 0.3 && largest.w >= 8 && largest.h >= 8) {
        for (let y = largest.y + 2; y < largest.y + largest.h - 2; y++) {
          for (let x = largest.x + 2; x < largest.x + largest.w - 2; x++) {
            grid[y][x] = T.WA;
          }
        }
        meta.dmPanels!.push(
          "Underground lake: water ~40 ft deep. DC 12 Athletics if falling in or risk drowning. Something moves below…",
        );
      }
    }

    const corrs: { x: number; y: number }[] = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] === T.C) corrs.push({ x, y });
      }
    }
    const blocks = rI(1, 2, rng);
    const sh = [...corrs].sort(() => rng() - 0.5);
    for (let b = 0; b < Math.min(blocks, sh.length); b++) {
      const p = sh[b]!;
      const w = rI(1, 3, rng);
      for (let i = 0; i < w; i++) {
        const xx = p.x + i;
        if (xx >= W - 1) break;
        if (grid[p.y][xx] === T.C) {
          grid[p.y][xx] = T.F;
          pushDeco({
            x: xx,
            y: p.y,
            ch: "░░",
            fg: "#555",
            name: "Cave-in rubble",
            roomId: null,
            decoKey: "rubble_block",
            dmHint: "Blocked: 1 hour to clear, or DC 15 Athletics to squeeze (disadvantage on attacks 1 round after).",
          });
        }
      }
    }

    const ent0 = entranceRoom(rooms, H);
    if (ent0) {
      const rx = rI(ent0.x + 1, ent0.x + ent0.w - 2, rng);
      const ry = rI(ent0.y + 1, ent0.y + ent0.h - 2, rng);
      pushDeco({
        x: rx,
        y: ry,
        ch: "⌁",
        fg: "#a88",
        name: "Rope descent",
        roomId: ent0.id,
        decoKey: "rope_descent",
        dmHint: "DC 10 Athletics climb. Difficult terrain on the ramp — party descends into the cave.",
      });
    }

    if (!isFey && meta.caveVariant === "goblin") {
      meta.dmPanels!.push("Goblin lair: crude tables, cookpot, bone piles in large chambers.");
      for (const rm of rooms) {
        if (rm.w < 9 || rm.h < 7) continue;
        pushDeco({
          x: rm.x + 2,
          y: rm.y + 2,
          ch: "⊏",
          fg: "#8a6",
          name: "Crude table",
          roomId: rm.id,
          decoKey: "goblin_table",
        });
        pushDeco({
          x: rm.x + 5,
          y: rm.y + 2,
          ch: "{~}",
          fg: "#666",
          name: "Cooking pot",
          roomId: rm.id,
          decoKey: "cookpot",
        });
      }
    } else if (!isFey && meta.caveVariant === "kobold") {
      meta.dmPanels!.push("Kobold warren: cramped passages; mine cart on track; extra tripwires possible.");
      if (corrs.length) {
        const c = corrs[Math.floor(rng() * corrs.length)]!;
        pushDeco({
          x: c.x,
          y: c.y,
          ch: "⊡",
          fg: "#a86",
          name: "Mine cart",
          roomId: null,
          decoKey: "mine_cart",
          dmHint: "On a short track — can be shoved for cover or noise (DM).",
        });
      }
    } else if (!isFey && meta.caveVariant === "dragon") {
      const deep = [...rooms].sort((a, b) => b.cy - a.cy)[0];
      if (deep) {
        pushDeco({
          x: deep.cx,
          y: deep.cy,
          ch: "◆",
          fg: "#fc0",
          name: "Dragon hoard",
          roomId: deep.id,
          decoKey: "hoard_pile",
          dmHint: "Treasure pile — scale loot to party level × 3.",
        });
      }
    }

    if (isVolc) {
      for (let k = 0; k < rI(3, 5, rng); k++) {
        const px = rI(2, W - 3, rng);
        const py = rI(2, H - 3, rng);
        if (grid[py][px] !== T.F) continue;
        pushDeco({
          x: px,
          y: py,
          ch: "♨",
          fg: "#e82",
          name: "Gas vent",
          roomId: null,
          decoKey: "gas_vent",
          dmHint: "Start turn adjacent: DC 13 CON or 1d6 poison.",
        });
      }
    }
  }

  if (locationType === "swamp") {
    meta.swampFeverNote =
      "Swamp Fever: after 1 hour in the swamp each PC rolls DC 11 CON or contracts disease (DMG). Track failures here.";
    meta.swampInsectsNote =
      "Swamp insects: DC +2 for Concentration saves outdoors in this swamp (DM reminder).";
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== T.F) continue;
        const adjW = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(
          ([dy, dx]) => grid[y + dy]?.[x + dx] === T.WA,
        );
        if (adjW && rng() < 0.06) {
          pushDeco({
            x,
            y,
            ch: "✖",
            fg: "#4a3a2a",
            name: "Quicksand",
            roomId: null,
            decoKey: "quicksand",
            playerHide: true,
            dmHint: "Looks like firm ground. DC 12 STR on entry or restrained; repeat each turn to escape.",
          });
        }
      }
    }

    let maxW = 0;
    let waterOrigin: { x: number; y: number } | null = null;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== T.WA) continue;
        let sz = 0;
        const seen = new Set<string>();
        const q: { x: number; y: number }[] = [{ x, y }];
        while (q.length) {
          const p = q.pop()!;
          const k = `${p.x},${p.y}`;
          if (seen.has(k)) continue;
          seen.add(k);
          sz++;
          for (const [dy, dx] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nx = p.x + dx,
              ny = p.y + dy;
            if (grid[ny]?.[nx] === T.WA) q.push({ x: nx, y: ny });
          }
        }
        if (sz > maxW) {
          maxW = sz;
          waterOrigin = { x, y };
        }
      }
    }
    if (maxW >= 9 && waterOrigin) {
      for (let i = 0; i < rI(3, 5, rng); i++) {
        const ox = rI(-2, 2, rng);
        const oy = rI(-2, 2, rng);
        const px = waterOrigin.x + ox,
          py = waterOrigin.y + oy;
        if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
        if (grid[py][px] !== T.WA) continue;
        lurkZones.add(`${px},${py}`);
        pushDeco({
          x: px,
          y: py,
          ch: "~",
          fg: "#622",
          name: "Lurk zone",
          roomId: null,
          decoKey: "lurk_hint",
          playerHide: true,
          dmHint: "1d4 crocodiles possible. DC 15 Perception to spot before attack.",
        });
      }
      let ruinsPlaced = 0;
      const ruinTarget = rI(3, 5, rng);
      for (let t = 0; t < 80 && ruinsPlaced < ruinTarget; t++) {
        const ox = rI(-6, 6, rng);
        const oy = rI(-6, 6, rng);
        const px = waterOrigin.x + ox;
        const py = waterOrigin.y + oy;
        if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
        if (grid[py][px] !== T.WA) continue;
        pushDeco({
          x: px,
          y: py,
          ch: "▟",
          fg: "#2a3038",
          name: "Sunken ruin",
          roomId: null,
          decoKey: "water_ruin",
          dmHint:
            "Crumbling top of a sunken tower. DC 14 Athletics to dive and explore (treat as dungeon entrance).",
        });
        ruinsPlaced++;
      }
    }

    const islands = [...rooms].sort((a, b) => a.cy - b.cy);
    const deep = islands[islands.length - 1];
    if (deep) {
      pushDeco({
        x: deep.cx,
        y: deep.cy,
        ch: "⌂",
        fg: "#6a4",
        name: "Hag hut",
        roomId: deep.id,
        decoKey: "hag_hut",
        dmHint: "4×4 interior — cauldron & shelf. Cauldron: green potion bubbles; witch loot table.",
      });
    }
    const hunt = pick(rooms.filter((r) => r.w * r.h > 20), rng);
    if (hunt) {
      pushDeco({
        x: hunt.cx,
        y: hunt.cy,
        ch: "▣",
        fg: "#5a4",
        name: "Hunting blind",
        roomId: hunt.id,
        decoKey: "hunting_blind",
        dmHint: "Half cover inside. Bedroll, week of rations, crude swamp map.",
      });
    }

    const wisps: { x: number; y: number }[] = [];
    for (let w = 0; w < rI(1, 2, rng); w++) {
      const px = rI(2, W - 3, rng);
      const py = rI(2, H - 3, rng);
      if (grid[py][px] === T.WA) {
        wisps.push({ x: px, y: py });
        pushDeco({
          x: px,
          y: py,
          ch: "✧",
          fg: "#cf8",
          name: "Will-o'-wisp",
          roomId: null,
          decoKey: "will_o_wisp",
          dmHint: "Moves 1d4/round (random). 10 ft dim. Leads travelers astray; cannot be caught.",
        });
      }
    }
    meta.willOWisp = wisps;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== T.F) continue;
        if (
          [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dy, dx]) => grid[y + dy]?.[x + dx] === T.WA)
        ) {
          slippery.add(`${x},${y}`);
        }
      }
    }

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== T.BRIDGE || rng() > 0.35) continue;
        pushDeco({
          x,
          y,
          ch: "=",
          fg: "#864",
          name: "Log bridge",
          roomId: null,
          decoKey: "log_bridge",
          dmHint: "AC 15, HP 10. If destroyed, DC 12 Athletics to improvise crossing.",
        });
      }
    }
    meta.dmPanels!.push(meta.swampFeverNote!, meta.swampInsectsNote!);
  }

  if (locationType === "temple") {
    const deityRaw = cfg.templeDeity as string | undefined;
    const deity =
      deityRaw && deityRaw !== "auto" && (DEITIES as readonly string[]).includes(deityRaw)
        ? deityRaw
        : pick([...DEITIES], rng);
    meta.templeDeity = deity;
    const tcRaw = cfg.templeCondition as string | undefined;
    const tcPick = ["active", "abandoned", "desecrated"] as const;
    meta.templeCondition =
      tcRaw && tcRaw !== "auto" && (tcPick as readonly string[]).includes(tcRaw)
        ? (tcRaw as ForgeLocationMeta["templeCondition"])
        : pick(["active", "abandoned", "desecrated"], rng);
    meta.templeMonsterHint = DEITY_MONSTER[deity] ?? "varied";
    meta.dmPanels!.push(`Temple of ${deity}: ${DEITY_MONSTER[deity]}.`);
    if (meta.templeCondition === "abandoned") {
      meta.dmPanels!.push(
        "Abandoned temple: cracked stone, dead candles, dust — describe freely (DM).",
      );
    } else if (meta.templeCondition === "desecrated") {
      meta.dmPanels!.push(
        "Desecrated: demonic graffiti and stains; fiends, undead, or cultists fit well.",
      );
    }
    const sorted = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h);
    const sanctum = sorted[0];
    const nave = sorted[1];
    if (sanctum) {
      sanctum.theme = "SANCTUM";
      pushDeco({
        x: sanctum.cx,
        y: sanctum.cy,
        ch: "╬",
        fg: "#cc8",
        name: "Altar",
        roomId: sanctum.id,
        decoKey: "temple_altar",
        dmHint: `Altar to ${deity}. Profaning may trigger divine wrath.`,
      });
      pushDeco({
        x: sanctum.cx - 2,
        y: sanctum.cy,
        ch: "🕯",
        fg: "#fe8",
        name: "Candelabra",
        roomId: sanctum.id,
        decoKey: "candelabra",
        dmHint: "10 ft bright / 20 ft dim each.",
      });
      pushDeco({
        x: sanctum.cx + 2,
        y: sanctum.cy,
        ch: "🕯",
        fg: "#fe8",
        name: "Candelabra",
        roomId: sanctum.id,
        decoKey: "candelabra",
      });
    }
    if (nave && nave.w >= 10) {
      for (let row = 0; row < rI(4, 8, rng); row++) {
        const py = nave.y + 3 + row;
        const px0 = nave.x + 3;
        for (let k = 0; k < 3; k++) {
          pushDeco({
            x: px0 + k * 3,
            y: py,
            ch: "⊐",
            fg: "#864",
            name: "Pew",
            roomId: nave.id,
            decoKey: "pew",
            dmHint: "Half cover kneeling; overturn (bonus action) → difficult terrain.",
          });
        }
      }
      const symCx = nave.cx,
        symCy = nave.cy;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const gx = symCx + dx,
            gy = symCy + dy;
          if (grid[gy]?.[gx] === T.F) caveSymbolCells.add(`${gx},${gy}`);
        }
      }
      meta.dmPanels!.push("Nave floor: faint deity symbol — prayer in center may grant Inspiration (DM).");
    }

    const ent = entranceRoom(rooms, H);
    if (ent) {
      pushDeco({
        x: ent.cx,
        y: ent.y + 1,
        ch: "◯",
        fg: "#48c",
        name: "Holy font",
        roomId: ent.id,
        decoKey: "holy_font",
        dmHint:
          meta.templeCondition === "desecrated"
            ? "Polluted — CON save or poisoned if drunk."
            : "1 vial holy water per PC (dawn). Undead within 5 ft: 1d6 radiant.",
      });
    }

    if (sanctum) {
      const approachRm = sorted.find(
        (r) => r.id !== sanctum.id && Math.abs(r.cx - sanctum.cx) + Math.abs(r.cy - sanctum.cy) < 20,
      );
      if (approachRm) {
        for (let i = 0; i < rI(2, 3, rng); i++) {
          const px = rI(approachRm.x + 1, approachRm.x + approachRm.w - 2, rng);
          const py = rI(approachRm.y + 1, approachRm.y + approachRm.h - 2, rng);
          if (grid[py][px] !== T.F && grid[py][px] !== T.C) continue;
          pushDeco({
            x: px,
            y: py,
            ch: "ᚱ",
            fg: "#c84",
            name: "Glyph of warding",
            roomId: approachRm.id,
            decoKey: "glyph_floor",
            playerHide: true,
            dmHint: `Non-worshipper steps: DC 13 DEX or 5d8 ${DEITY_DAMAGE[deity] ?? "force"}.`,
          });
        }
      }
    }

    const vestry = sorted.find((r) => sanctum && r.id !== sanctum.id && Math.abs(r.cx - sanctum.cx) <= 8);
    if (vestry) {
      vestry.theme = "VESTRY";
      pushDeco({
        x: vestry.cx,
        y: vestry.cy,
        ch: "█",
        fg: "#864",
        name: "Wardrobe",
        roomId: vestry.id,
        decoKey: "vestry_robes",
        dmHint: "Ceremonial robes — disguise potential.",
      });
      pushEnt({
        type: "item",
        name: `Spell scroll (${deity})`,
        x: vestry.cx + 1,
        y: vestry.cy,
        roomId: vestry.id,
        r: "uncommon",
      });
      pushEnt({
        type: "item",
        name: "Vestry coffer (2d6 gp, incense, holy water ×2)",
        x: vestry.cx - 1,
        y: vestry.cy,
        roomId: vestry.id,
        r: "common",
      });
    }

    if (sanctum && sorted.length >= 3) {
      const bellRm = sorted[sorted.length - 1]!;
      if (bellRm.id !== sanctum.id) {
        bellRm.theme = "BELL_TOWER";
        const bx = Math.min(bellRm.x + bellRm.w - 2, bellRm.cx + 1);
        const by = Math.min(bellRm.y + bellRm.h - 2, bellRm.cy);
        pushDeco({
          x: bx,
          y: by,
          ch: "<",
          fg: "#a86",
          name: "Bell stair",
          roomId: bellRm.id,
          decoKey: "bell_stairs",
          dmHint: "Narrow stair to bell platform.",
        });
        pushDeco({
          x: bx,
          y: Math.max(bellRm.y + 1, by - 1),
          ch: "🕭",
          fg: "#ca8",
          name: "Bell",
          roomId: bellRm.id,
          decoKey: "temple_bell",
          dmHint: "DC 12 STR to ring; heard up to 300 ft (about a quarter mile).",
        });
        meta.dmPanels!.push(
          "Bell tower: ringing alerts a wide area — use sparingly or attract everything nearby.",
        );
      }
    }

    const prayerRm = [...sorted]
      .filter((r) => r.id !== sanctum?.id && r.w * r.h <= 15)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0];
    if (prayerRm) {
      prayerRm.theme = "PRAYER_CELL";
      pushDeco({
        x: prayerRm.cx,
        y: prayerRm.cy,
        ch: "⚞",
        fg: "#868",
        name: "Prayer screen",
        roomId: prayerRm.id,
        decoKey: "prayer_cell",
        dmHint:
          "Tiny curtained nook — occupant (monk, cultist, or prisoner) may attack, bargain, or ignore.",
      });
    }
  }

  if (locationType === "sewer") {
    meta.sewerDistrictName = pick(["Dockside", "Scholars' Quarter", "Oldwall", "Lowbridge", "Nettle"], rng);
    meta.sewerFlow = pick(["south", "south", "east"], rng);
    meta.dmPanels!.push(
      `Main channel flows toward ${meta.sewerFlow} (outfall). Side channels are 1 tile; waist-deep = difficult terrain (S/M).`,
    );
    meta.smellZoneNote =
      "Within 5 tiles of open sewage: smell-based Perception at disadvantage (Keen Smell immune).";
    meta.dmPanels!.push(meta.smellZoneNote);

    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        if (grid[y][x] === T.WA && Math.abs(x - Math.floor(W / 2)) <= 1) {
          sewerMainCells.add(`${x},${y}`);
        }
      }
    }

    for (let i = 0; i < rI(2, 3, rng); i++) {
      const px = rI(3, W - 4, rng);
      const py = rng() < 0.5 ? 2 : H - 3;
      pushDeco({
        x: px,
        y: py,
        ch: "◎",
        fg: "#888",
        name: "Manhole",
        roomId: null,
        decoKey: "manhole",
        dmHint: `Iron rungs to ${meta.sewerDistrictName}. DC 10 STR to lift cover from below.`,
      });
    }

    pushDeco({
      x: Math.floor(W / 2),
      y: H - 2,
      ch: "▭",
      fg: "#6a8",
      name: "Outfall grate",
      roomId: null,
      decoKey: "outfall",
      dmHint:
        "Opens to river 100 ft below. 10d6 fall or DC 14 Athletics to catch rope. DC 14 STR to break grate; DC 16 quiet.",
    });

    for (let i = 0; i < rI(1, 2, rng); i++) {
      const px = rI(3, W - 4, rng);
      const py = rI(3, H - 4, rng);
      if (grid[py][px] !== T.WA) continue;
      pushDeco({
        x: px,
        y: py,
        ch: "⚏",
        fg: "#6a8",
        name: "Sluice gate",
        roomId: null,
        decoKey: "sluice_gate",
        dmHint: "DM toggle open/closed — closed floods downstream over rounds.",
      });
    }

    const smallRooms = [...rooms].filter((r) => r.w * r.h <= 48);
    for (const rm of smallRooms.slice(0, rI(1, 2, rng))) {
      rm.theme = "WASTE_CHAMBER";
      meta.dmPanels!.push(`Room ${rm.id}: poison cloud — DC 12 CON on entry or 1d4 poison + poisoned until fresh air.`);
    }

    for (const rm of rooms) {
      if (String(rm.label || "").includes("Junction") || rm.type === "Junction") {
        pushEnt({
          type: "monster",
          name: "Swarm of Rats",
          count: 1,
          cr: 0.25,
          x: rm.cx,
          y: rm.cy,
          roomId: rm.id,
          dmHint: "Does not attack until party lingers 2+ rounds. DC 8 Animal Handling to drive off.",
        });
      }
    }

    const away = [...rooms].sort((a, b) => b.cx - a.cx)[0];
    if (away) {
      away.theme = "THIEVES_DEN";
      pushDeco({
        x: away.cx,
        y: away.cy,
        ch: "⊞",
        fg: "#a74",
        name: "Table",
        roomId: away.id,
        decoKey: "thieves_table",
      });
      pushDeco({
        x: away.cx + 1,
        y: away.cy,
        ch: "WANTED",
        fg: "#c88",
        name: "Poster",
        roomId: away.id,
        decoKey: "wanted_poster",
        dmHint: "City guard bounty — plot hook.",
      });
      for (let b = 0; b < rI(2, 4, rng); b++) {
        pushEnt({
          type: "monster",
          name: "Bandit",
          count: 1,
          cr: 0.5,
          x: away.x + 2 + b,
          y: away.y + 2,
          roomId: away.id,
        });
      }
    }

    if (rng() < 0.2 && away) {
      meta.blackMarketOpen = rng() < 0.5;
      meta.dmPanels!.push(
        "Black market annex: illegal goods +50% PHB price. Toggle open / abandoned / hostile.",
      );
      for (let s = 0; s < rI(4, 6, rng); s++) {
        pushDeco({
          x: away.cx + (s % 3) - 1,
          y: away.cy + Math.floor(s / 3),
          ch: "¤",
          fg: "#ca0",
          name: "Merchant stall",
          roomId: away.id,
          decoKey: "black_market_stall",
        });
      }
    }

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (grid[y][x] !== T.F) continue;
        if (
          [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dy, dx]) => grid[y + dy]?.[x + dx] === T.WA)
        ) {
          slippery.add(`${x},${y}`);
        }
      }
    }

    const slipList = [...slippery];
    slipList.sort(() => rng() - 0.5);
    for (const k of slipList.slice(0, 14)) {
      const [x, y] = k.split(",").map(Number);
      pushDeco({
        x,
        y,
        ch: "∿",
        fg: "#3a4a3a",
        name: "Slippery",
        roomId: null,
        decoKey: "slippery_edge",
        playerHide: true,
        dmHint: "DC 12 DEX or prone entering from dry tile.",
      });
    }
  }

  const renderOverlay: ForgeRenderOverlayJson = {
    streamFlow: streamFlowOut,
    slippery: slippery.size ? [...slippery] : undefined,
    lurkZones: lurkZones.size ? [...lurkZones] : undefined,
    sewerMainCells: sewerMainCells.size ? [...sewerMainCells] : undefined,
    caveSymbolCells: caveSymbolCells.size ? [...caveSymbolCells] : undefined,
  };
  return { meta, renderOverlay };
}
