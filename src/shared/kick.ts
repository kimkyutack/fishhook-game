export const KICK_RANGE = 180;
export const KICK_ANIMATION_MS = 500;
// A forgiving 150-degree forward arc, including the actual diagonal facing.
export const KICK_MIN_DOT = Math.cos((75 * Math.PI) / 180);
// Both authority and renderer use server timestamps; reconnects cannot reset recovery.
export const KNOCKDOWN_MS = 1500;
export const GET_UP_MS = 350;
export const FALL_DIRECTIONS = [
  "down",
  "up",
  "left",
  "right",
  "down-left",
  "down-right",
  "up-left",
  "up-right",
] as const;

export function fallFrame(age: number) {
  if (age < 120) return 0;
  if (age < 280) return 1;
  if (age < KNOCKDOWN_MS) return 2;
  if (age < KNOCKDOWN_MS + 100) return 3;
  if (age < KNOCKDOWN_MS + 250) return 4;
  return 5;
}
