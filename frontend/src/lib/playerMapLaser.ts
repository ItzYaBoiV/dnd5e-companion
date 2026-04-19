/**
 * DM “laser pointer” synced to /dungeons/player via localStorage + BroadcastChannel.
 * Kept separate from the main map payload so it can update at ~30fps without re-stringifying the dungeon.
 */

export type LaserPointerPayload = {
  gx: number;
  gy: number;
  ts: number;
};

const LASER_STORAGE_KEY = "dnd5e-player-map-laser";
const LASER_CHANNEL = "dnd5e-player-laser";

export function broadcastLaserPointer(pos: { gx: number; gy: number } | null): void {
  try {
    if (pos === null) {
      localStorage.removeItem(LASER_STORAGE_KEY);
    } else {
      const payload: LaserPointerPayload = { gx: pos.gx, gy: pos.gy, ts: Date.now() };
      localStorage.setItem(LASER_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    /* quota / private mode */
  }
  try {
    const bc = new BroadcastChannel(LASER_CHANNEL);
    bc.postMessage(pos === null ? ({ type: "clear" } as const) : ({ type: "point", gx: pos.gx, gy: pos.gy, ts: Date.now() } as const));
    bc.close();
  } catch {
    /* */
  }
}

export function readLaserPointerFromStorage(): LaserPointerPayload | null {
  try {
    const raw = localStorage.getItem(LASER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<LaserPointerPayload>;
    if (typeof o.gx !== "number" || typeof o.gy !== "number") return null;
    return {
      gx: o.gx,
      gy: o.gy,
      ts: typeof o.ts === "number" ? o.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

export const PLAYER_LASER_CHANNEL = LASER_CHANNEL;
