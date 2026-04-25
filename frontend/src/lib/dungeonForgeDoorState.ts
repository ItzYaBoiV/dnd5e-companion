/**
 * Central door open/close checks for fog, lights, and player-hidden rooms.
 * `doorOpen: null` = legacy “treat as all open” for passability.
 */
export function isDoorPassableInFog(
  key: string,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  if (doorStates && Object.prototype.hasOwnProperty.call(doorStates, key)) {
    return doorStates[key] === "open";
  }
  if (doorOpen == null) return true;
  return doorOpen.has(key);
}
