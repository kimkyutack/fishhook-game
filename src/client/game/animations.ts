import type { Motion } from "../../shared/protocol";
import type { Direction } from "../../config/map";
import type { Facing } from "../../shared/movement";
import { KNOCKDOWN_MS, GET_UP_MS, KICK_ANIMATION_MS } from "../../shared/kick";
export function locomotionPose(
  direction: Direction,
  motion: Motion,
  facing: Facing = direction,
) {
  if (motion !== "walk" && motion !== "idle" && !FISHING_ACTIONS.includes(motion))
    return { animationDirection: direction, flipX: false };
  if (!facing.includes("-"))
    return { animationDirection: facing, flipX: false };
  const vertical = facing.startsWith("up") ? "up" : "down";
  return {
    animationDirection: `${vertical}_right`,
    flipX: facing.endsWith("left"),
  };
}
export const FISHING_ACTIONS: Motion[] = ["sit_down", "seated_idle", "cast", "fishing_wait", "reel_in", "startled"];
export const DIAGONAL_FISHING = {
  idle: { start: 0, count: 1, fps: 1, loop: true },
  sit_down: { start: 1, count: 2, fps: 6, loop: false },
  seated_idle: { start: 3, count: 1, fps: 1, loop: true },
  cast: { start: 4, count: 5, fps: 8, loop: false },
  fishing_wait: { start: 9, count: 2, fps: 2, loop: true },
  reel_in: { start: 11, count: 5, fps: 7, loop: false },
  startled: { start: 16, count: 3, fps: 5, loop: false },
} as const;
export const ROD_ANCHORS = {
  up: { grip: { x: 0.5, y: 0.8 }, tip: { x: 0.5, y: 0.05 } },
  down: { grip: { x: 0.5, y: 0.1 }, tip: { x: 0.5, y: 0.9 } },
  left: { grip: { x: 0.8, y: 0.5 }, tip: { x: 0.05, y: 0.5 } },
  right: { grip: { x: 0.1, y: 0.5 }, tip: { x: 0.9, y: 0.5 } },
} as const;
export const ROD_STATES = ["normal", "bent", "kicked", "recover"] as const;
export const MOTIONS: Record<
  Exclude<Motion, "fallen">,
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
  if (m === "kick" && since >= KICK_ANIMATION_MS) return "idle";
  if (m === "cast") {
    if (since < 360) return "sit_down";
    if (since > 985) return "fishing_wait";
    return "cast";
  }
  if (m === "sit_down" && since > 430) return "seated_idle";
  if (m === "startled" && since > 650) return "idle";
  if (m === "fallen" && since >= KNOCKDOWN_MS + GET_UP_MS) return "idle";
  if (m === "reel_in" && since > 750) return "seated_idle";
  if (m === "run") {
    if (since < 450) return "kick";
    if (since > 1050) return "idle";
  }
  return m;
}
// Fixed 192 px registered frame canvas; equipment anchors use the same canvas in every pose.
export const ROOT = { x: 0.5, y: 0.9375 };
export function grip(direction: string, motion: Motion, frame: number) {
  if (direction.includes("-")) return {
    x: direction.endsWith("left") ? -18 : 18,
    y: direction.startsWith("up") ? -38 : -29,
  };
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
