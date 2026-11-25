import type { Motion } from "../../shared/protocol";
export const ROD_ANCHORS = {
  up: { grip: { x: 0.5, y: 0.8 }, tip: { x: 0.5, y: 0.05 } },
  down: { grip: { x: 0.5, y: 0.1 }, tip: { x: 0.5, y: 0.9 } },
  left: { grip: { x: 0.8, y: 0.5 }, tip: { x: 0.05, y: 0.5 } },
  right: { grip: { x: 0.1, y: 0.5 }, tip: { x: 0.9, y: 0.5 } },
} as const;
export const ROD_STATES = ["normal", "bent", "kicked", "recover"] as const;
export const MOTIONS: Record<
  Motion,
  { start: number; count: number; fps: number; loop: boolean }
> = {
  idle: { start: 0, count: 2, fps: 2, loop: true },
  walk: { start: 2, count: 6, fps: 9, loop: true },
  sit_down: { start: 8, count: 3, fps: 7, loop: false },
  seated_idle: { start: 11, count: 1, fps: 1, loop: true },
  cast: { start: 12, count: 5, fps: 8, loop: false },
  fishing_wait: { start: 17, count: 2, fps: 2, loop: true },
  reel_in: { start: 19, count: 5, fps: 7, loop: false },
  kick: { start: 24, count: 6, fps: 12, loop: false },
  run: { start: 30, count: 6, fps: 12, loop: true },
  startled: { start: 36, count: 3, fps: 5, loop: false },
};
export const DIRECTIONS = ["down", "up", "left", "right"] as const;
export function visibleMotion(m: Motion, since: number): Motion {
  if (m === "cast") {
    if (since < 360) return "sit_down";
    if (since > 985) return "fishing_wait";
    return "cast";
  }
  if (m === "sit_down" && since > 430) return "seated_idle";
  if ((m === "reel_in" && since > 750) || (m === "startled" && since > 650))
    return "seated_idle";
  if (m === "run") {
    if (since < 450) return "kick";
    if (since > 1050) return "idle";
  }
  return m;
}
// Fixed 192 px frame canvas. Equipment anchors are normalized to the original untrimmed canvas.
export const ROOT = { x: 0.5, y: 0.875 };
export function grip(direction: string, motion: Motion, frame: number) {
  const directionX =
    direction === "left"
      ? -20
      : direction === "right"
        ? 20
        : direction === "up"
          ? -14
          : 15;
  const cast = motion === "cast" ? Math.sin((frame / 4) * Math.PI) * 12 : 0;
  return { x: directionX, y: direction === "up" ? -38 : -29 - cast };
}
