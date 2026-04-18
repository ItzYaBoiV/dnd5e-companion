import { prisma } from "../config/database";
import { AppError, NotFoundError } from "../middleware/errorHandler";
import { generate } from "./aiService";
import { generateProceduralRooms } from "./proceduralDungeonLayout";
import { parseCr } from "./monsterService";

// ── Shared system prompt ──────────────────────────────────────────
const SYSTEM = `You are an expert Dungeons & Dragons 5th Edition Dungeon Master
creating family-friendly adventures for children aged 6-12.
Content is always age-appropriate, exciting but not graphic or frightening.
Respond with ONLY valid JSON — no markdown, no explanation, no code fences.`;

function extractJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct !== null) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const inner = tryParse(cleaned.slice(start, end + 1));
    if (inner !== null) return inner;
  }
  const hint = cleaned.replace(/\s+/g, " ").slice(0, 220);
  throw new AppError(
    502,
    `The model did not return valid JSON (needed for dungeons/stories). Try again, or use a model that follows instructions more tightly. ` +
      (hint ? `Preview: ${hint}` : ""),
    "AI_INVALID_JSON"
  );
}

function monsterPoolForLevels(levelMin: number, levelMax: number): string[] {
  if (levelMax <= 2)  return ["rat","wolf","goblin","skeleton","zombie","kobold","bandit","cultist"];
  if (levelMax <= 4)  return ["goblin","orc","skeleton","zombie","hobgoblin","gnoll","ghoul","harpy","ogre","bugbear"];
  if (levelMax <= 6)  return ["hobgoblin","gnoll","ghoul","harpy","ogre","bugbear","werewolf","basilisk","hell-hound","knight"];
  if (levelMax <= 10) return ["werewolf","basilisk","hell-hound","knight","banshee","chuul","green-hag","troll","wyvern","vampire-spawn"];
  return ["vampire","wyvern","stone-golem","fire-giant","marilith","mind-flayer","night-hag"];
}

// ── Dungeons ──────────────────────────────────────────────────────
export async function listDungeons() {
  return prisma.dungeon.findMany({
    select: { id: true, name: true, theme: true, difficulty: true, levelMin: true, levelMax: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDungeon(id: string) {
  const d = await prisma.dungeon.findUnique({ where: { id }, include: { rooms: true } });
  if (!d) throw new NotFoundError("Dungeon");
  return d;
}

export async function deleteDungeon(id: string) {
  const d = await prisma.dungeon.findUnique({ where: { id }, select: { id: true } });
  if (!d) throw new NotFoundError("Dungeon");
  await prisma.dungeon.delete({ where: { id } });
}

/** Grid layout + template text — no LLM; same room model as AI dungeons for the canvas map. */
export async function createProceduralDungeon(opts: {
  theme: string;
  difficulty: string;
  levelMin: number;
  levelMax: number;
  roomCount: number;
  mapSeed?: number | string | null;
}) {
  const poolSlugs = monsterPoolForLevels(opts.levelMin, opts.levelMax);
  const rows = await prisma.monster.findMany({
    where: { slug: { in: poolSlugs } },
    select: { slug: true, challengeRating: true },
  });
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const monsterPool = poolSlugs.map((slug) => ({
    slug,
    cr: parseCr(bySlug.get(slug)?.challengeRating ?? "0"),
  }));
  const gen = generateProceduralRooms({
    theme: opts.theme,
    roomCount: opts.roomCount,
    difficulty: opts.difficulty,
    levelMin: opts.levelMin,
    levelMax: opts.levelMax,
    monsterPool,
    mapSeed: opts.mapSeed,
  });

  return prisma.dungeon.create({
    data: {
      name: gen.name,
      description: gen.description,
      theme: opts.theme,
      difficulty: opts.difficulty,
      levelMin: opts.levelMin,
      levelMax: opts.levelMax,
      story: gen.story,
      npcs: gen.npcs,
      aiGenerated: false,
      mapSeed: gen.mapSeed,
      rooms: {
        create: gen.rooms.map((r) => ({
          layoutId: String(r.id ?? "").replace(/[^\w-]/g, "_").slice(0, 64),
          name: r.name,
          playerLabel: String(r.playerLabel ?? "").slice(0, 200),
          playerDescription: String(r.playerDescription ?? "").slice(0, 4000),
          description: String(r.description ?? "").slice(0, 4000),
          dmSecrets: String(r.dmSecrets ?? "").slice(0, 8000),
          type: r.type,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          exits: r.exits,
          monsters: r.monsters ?? [],
          traps: r.traps ?? undefined,
          treasures: r.treasures ?? undefined,
          features: r.features ?? undefined,
          notes: r.notes ?? "",
        })),
      },
    },
    include: { rooms: true },
  });
}

/** Persist a Dungeon Forge floor into the library (minimal room rows for canvas / list). */
export async function saveForgeMapToLibrary(body: {
  seed: number;
  locationType: string;
  levelMin: number;
  levelMax: number;
  mapName: string;
  rooms: Array<{
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    type?: string;
    label?: string;
  }>;
  width?: number;
  height?: number;
}) {
  const name = body.mapName?.trim() || `Forge ${body.locationType}`;
  const seed = Number.isFinite(body.seed) ? Math.trunc(body.seed) >>> 0 : 0;
  return prisma.dungeon.create({
    data: {
      name: name.slice(0, 200),
      description: `Saved from Map forge (${body.locationType}, seed ${seed}).`,
      theme: body.locationType.slice(0, 120),
      difficulty: "medium",
      levelMin: Math.max(1, Math.min(20, body.levelMin)),
      levelMax: Math.max(1, Math.min(20, body.levelMax)),
      story:
        "This layout was exported from Dungeon Forge. Open rooms below for positions; use the seed in Map forge to regenerate the same map.",
      npcs: [],
      aiGenerated: false,
      mapSeed: seed,
      rooms: {
        create: body.rooms.map((r) => ({
          layoutId: `forge_${r.id}`,
          name: String(r.label || r.type || `Room ${r.id}`).slice(0, 200),
          playerLabel: "",
          playerDescription: "",
          description: `Forge room ${r.id} (${r.w}×${r.h} cells)${r.type ? ` — ${r.type}` : ""}.`,
          dmSecrets: "",
          x: r.x,
          y: r.y,
          width: Math.max(1, r.w),
          height: Math.max(1, r.h),
          type: "chamber",
          exits: {},
          monsters: [],
          traps: undefined,
          treasures: undefined,
          features: undefined,
          notes: "",
        })),
      },
    },
    include: { rooms: true },
  });
}

export async function createAiDungeon(opts: {
  theme: string; difficulty: string; levelMin: number;
  levelMax: number; roomCount: number; ageRating: string;
  jobId?: string;
}) {
  const pool = monsterPoolForLevels(opts.levelMin, opts.levelMax);
  // Cap rooms for latency (large JSON + slow local LLMs hit proxy timeouts).
  const roomCount = Math.min(Math.max(opts.roomCount, 4), 10);
  const minCorridors = Math.max(2, Math.floor(roomCount / 3));
  const logCtx = opts.jobId ? `jobId=${opts.jobId}` : undefined;
  const prompt = `Create a D&D 5e dungeon with exactly ${roomCount} rooms (connected, playable).
Theme: ${opts.theme} | Difficulty: ${opts.difficulty} | Levels: ${opts.levelMin}-${opts.levelMax} | Age: ${opts.ageRating}
Available monsters (slugs only): ${pool.join(", ")}

=== MAP GEOMETRY (mandatory — boring vertical stacks are invalid) ===
- x,y = top-left corner of each room in grid cells; width,height in cells (integers ≥1).
- You MUST include at least ${minCorridors} separate rooms with type "corridor": narrow strips (width 1 OR height 1, length 2–6) that LINK larger chambers. Do not make every room a big box.
- FORBIDDEN: placing every chamber in one vertical column with the same x (no "tower of rooms"). Spread east/west: use L-shapes, branches, loops, side rooms.
- First room = type "entrance" at one edge of the footprint; path should read like a small floorplan (hallways + rooms), not disconnected boxes.
- EXITS must match geometry: if room A exits north to room B (string id must equal B's "id" field), then B must lie NORTH of A and their rectangles must share a horizontal overlap of at least 1 cell (same rule for south/east/west with vertical overlap for east/west). If you cannot align, insert a corridor room between them so the chain is believable.
- Each non-corridor chamber should touch a corridor or another room via a matching exit pair (reciprocal south/north or west/east when possible).

The app draws a TOP-DOWN parchment map from your rectangles — think module map, not a list.

PLAYER vs DM (required for every room):
- "playerDescription": 1-2 short sentences ONLY what PCs perceive (sights/sounds/smell). NO trap mechanics, NO exact treasure, NO monster stat hints, NO DCs.
- "description": fuller DM-facing scene (tactics, where creatures stand, clues).
- "dmSecrets": one string with bullet-style lines for the DM only: hidden traps (name + DC + damage/effect), secret doors, true treasure totals, skill checks to notice things. Players never see this field in the app.

Also include structured "traps" when applicable: {"name":"...","description":"...","dc":13,"damage":"2d6 piercing"} or null.
Include "treasures" for DM tracking: {"gold":10,"items":["healing potion"]} — players still only see playerDescription in player mode.

IMPORTANT — keep output compact so generation finishes in reasonable time:
- Each "description" + "playerDescription": brief.
- "notes" may be "" or one short line.
- No markdown, no commentary outside the JSON.

Return ONLY this JSON:
{
  "name": "dungeon name",
  "description": "2-3 sentence DM overview",
  "story": "3-4 sentence narrative hook — why are heroes here?",
  "npcs": [{"name":"...","role":"villain|ally|quest-giver","description":"..."}],
  "rooms": [{
    "id": "room_1",
    "name": "Room Name",
    "type": "entrance|corridor|chamber|boss|treasure|trap",
    "x": 0, "y": 0, "width": 4, "height": 4,
    "playerDescription": "What the party sees/hears — no spoilers",
    "description": "DM scene detail",
    "dmSecrets": "- Trap: …\\n- Hidden: …",
    "exits": {"north": "room_2", "south": null, "east": null, "west": null},
    "monsters": [{"monsterSlug": "goblin", "count": 2, "notes": "hiding behind crates"}],
    "treasures": {"gold": 10, "items": ["rope"]},
    "traps": null,
    "notes": ""
  }]
}`;

  const raw = await generate(prompt, { system: SYSTEM, maxTokens: 4096, logContext: logCtx });
  const generated = extractJson<any>(raw);

  return prisma.dungeon.create({
    data: {
      name:        generated.name,
      description: generated.description,
      theme:       opts.theme,
      difficulty:  opts.difficulty,
      levelMin:    opts.levelMin,
      levelMax:    opts.levelMax,
      story:       generated.story,
      npcs:        generated.npcs ?? [],
      aiGenerated: true,
      rooms: {
        create: (generated.rooms ?? []).map((r: any) => ({
          layoutId:    String(r.id ?? "").replace(/[^\w-]/g, "_").slice(0, 64),
          name:        r.name,
          playerDescription: String(r.playerDescription ?? "").slice(0, 4000),
          description: String(r.description ?? "").slice(0, 4000),
          dmSecrets:
            typeof r.dmSecrets === "string"
              ? r.dmSecrets.slice(0, 8000)
              : r.dmSecrets != null
                ? JSON.stringify(r.dmSecrets).slice(0, 8000)
                : "",
          type:        r.type,
          x:           r.x ?? 0,
          y:           r.y ?? 0,
          width:       r.width ?? 4,
          height:      r.height ?? 4,
          exits:       r.exits ?? { north: null, south: null, east: null, west: null },
          monsters:    r.monsters ?? [],
          traps:       r.traps   ?? undefined,
          treasures:   r.treasures ?? undefined,
          notes:       r.notes ?? "",
        })),
      },
    },
    include: { rooms: true },
  });
}

// ── Stories ───────────────────────────────────────────────────────
export async function listStories() {
  return prisma.story.findMany({
    select: { id: true, title: true, theme: true, levelMin: true, levelMax: true, ageRating: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStory(id: string) {
  const s = await prisma.story.findUnique({ where: { id } });
  if (!s) throw new NotFoundError("Story");
  return s;
}

export async function deleteStory(id: string) {
  const s = await prisma.story.findUnique({ where: { id }, select: { id: true } });
  if (!s) throw new NotFoundError("Story");
  await prisma.story.delete({ where: { id } });
}

export async function createAiStory(opts: {
  theme: string; levelMin: number; levelMax: number; ageRating: string; partySize: number;
  jobId?: string;
}) {
  const logCtx = opts.jobId ? `jobId=${opts.jobId}` : undefined;
  const prompt = `Create a rich D&D 5e adventure story for children (age-appropriate, vivid, playable at the table).
Theme: ${opts.theme} | Levels: ${opts.levelMin}-${opts.levelMax} | Age band: ${opts.ageRating} | Party: ${opts.partySize} heroes

Depth requirements (plain prose inside each string — no markdown):
- "hook": 5–8 sentences. Include a concrete scene (sounds, weather, who speaks first), clear stakes, and why the party cares now.
- "plot": 10–14 sentences. Include at least one complication, one ally or red herring, travel or investigation beats, and clear obstacles before the finale.
- "climax": 5–8 sentences. Describe the decisive confrontation or reveal, what success/failure looks like, and the emotional payoff.
- Each NPC: "personality" = 2–3 sentences (motives, quirks, how they speak). "description" = 3–5 sentences (look, where they are found, what they want from the party).
- Each location: "description" = 4–6 sentences (sensory detail, hazards or secrets, how it supports play).

Return ONLY this JSON:
{
  "title": "Adventure title",
  "hook": "…",
  "plot": "…",
  "climax": "…",
  "npcs": [{"name":"...","role":"villain|ally|quest-giver|neutral","personality":"…","description":"…"}],
  "locations": [{"name":"...","type":"dungeon|city|forest|cave|ruins|village","description":"…"}]
}`;

  const raw = await generate(prompt, { system: SYSTEM, maxTokens: 4096, logContext: logCtx });
  const generated = extractJson<any>(raw);

  return prisma.story.create({
    data: {
      title:       generated.title,
      hook:        generated.hook,
      plot:        generated.plot,
      climax:      generated.climax,
      npcs:        generated.npcs        ?? [],
      locations:   generated.locations   ?? [],
      levelMin:    opts.levelMin,
      levelMax:    opts.levelMax,
      theme:       opts.theme,
      ageRating:   opts.ageRating,
      dungeonIds:  [],
      aiGenerated: true,
    },
  });
}

// ── Encounters ────────────────────────────────────────────────────
export async function generateAiEncounter(opts: {
  levelMin: number; levelMax: number; partySize: number; difficulty: string; setting: string;
}) {
  const pool   = monsterPoolForLevels(opts.levelMin, opts.levelMax);
  const prompt = `Create a D&D 5e ${opts.difficulty} combat encounter.
Party: ${opts.partySize} heroes, levels ${opts.levelMin}-${opts.levelMax}
Setting: ${opts.setting}
Available monsters: ${pool.slice(0, 15).join(", ")}

Return ONLY this JSON:
{
  "name": "Encounter name",
  "description": "Scene-setting description",
  "monsters": [{"monsterSlug": "goblin", "count": 3, "tactic": "flanking from both sides"}],
  "terrain": "Battlefield features affecting combat",
  "objective": "What heroes must do to win",
  "reward": "What heroes gain"
}`;

  const raw = await generate(prompt, { system: SYSTEM, maxTokens: 2000 });
  return extractJson<any>(raw);
}

// ── NPCs ──────────────────────────────────────────────────────────
export async function generateAiNpc(opts: { role: string; setting: string; ageRating: string }) {
  const prompt = `Create a memorable, game-ready D&D 5e NPC (vivid, specific, easy to roleplay).
Role: ${opts.role} | Setting: ${opts.setting} | Age rating: ${opts.ageRating}

Return ONLY this JSON:
{
  "name": "NPC full name",
  "race": "race name",
  "occupation": "what they do",
  "personality": "3 personality traits",
  "appearance": "distinctive physical features",
  "secret": "a secret or motivation adding depth",
  "hook": "how heroes might interact with them",
  "voiceHint": "how to roleplay their voice or mannerisms"
}

Use full sentences for personality, appearance, secret, hook, and voiceHint (2–4 sentences each where it helps).`;

  const raw = await generate(prompt, { system: SYSTEM, maxTokens: 1200 });
  return extractJson<any>(raw);
}
