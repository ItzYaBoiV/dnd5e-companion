import { prisma } from "../config/database";
import { ValidationError } from "../middleware/errorHandler";

type Subscriber = (state: unknown) => void;

class DisplayBus {
  private subs = new Map<string, Set<Subscriber>>();
  subscribe(tvId: string, cb: Subscriber): () => void {
    let set = this.subs.get(tvId);
    if (!set) {
      set = new Set();
      this.subs.set(tvId, set);
    }
    set.add(cb);
    return () => {
      const s = this.subs.get(tvId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) this.subs.delete(tvId);
    };
  }
  publish(tvId: string, state: unknown) {
    const set = this.subs.get(tvId);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(state);
      } catch {
        /* one bad subscriber must not kill the rest */
      }
    }
  }
}

export const displayBus = new DisplayBus();

// TV ids must be short, printable, and URL-safe. This lets us accept "1" or
// "basement" but reject garbage.
const TV_ID_RE = /^[a-zA-Z0-9_-]{1,32}$/;

export function assertTvId(tvId: string): void {
  if (!TV_ID_RE.test(tvId)) {
    throw new ValidationError("Invalid tvId");
  }
}

export async function listDisplays() {
  const rows = await prisma.playerDisplay.findMany({
    select: { tvId: true, label: true, updatedAt: true },
    orderBy: { tvId: "asc" },
  });
  return rows;
}

export async function renameDisplay(tvId: string, label: string) {
  assertTvId(tvId);
  return prisma.playerDisplay.upsert({
    where: { tvId },
    update: { label },
    create: { tvId, label, mapState: null },
    select: { tvId: true, label: true, updatedAt: true },
  });
}

export async function setDisplayMapState(tvId: string, state: unknown) {
  assertTvId(tvId);
  const json = JSON.stringify(state ?? null);
  const row = await prisma.playerDisplay.upsert({
    where: { tvId },
    update: { mapState: json },
    create: { tvId, label: "", mapState: json },
    select: { tvId: true, label: true, updatedAt: true },
  });
  displayBus.publish(tvId, state);
  return row;
}

export async function getDisplayMapState(tvId: string) {
  assertTvId(tvId);
  const row = await prisma.playerDisplay.findUnique({
    where: { tvId },
    select: { mapState: true },
  });
  if (!row) return null;
  if (!row.mapState) return null;
  try {
    return JSON.parse(row.mapState) as unknown;
  } catch {
    return null;
  }
}
