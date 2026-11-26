import type { Direction } from "../config/map";

export type Facing =
  Direction | "up-left" | "up-right" | "down-left" | "down-right";
const sign = (v: number) => (Math.abs(v) < 0.001 ? 0 : Math.sign(v));

// Facing is derived from the actual displacement, independent of key order/repeat.
export function movementFacing(
  dx: number,
  dy: number,
  previous: Facing,
): Facing {
  const x = sign(dx),
    y = sign(dy);
  if (x && y) return `${y < 0 ? "up" : "down"}-${x < 0 ? "left" : "right"}`;
  if (x) return x < 0 ? "left" : "right";
  if (y) return y < 0 ? "up" : "down";
  return previous;
}

// Equipment and interactions retain their four-direction contract.
export function cardinalDirection(
  dx: number,
  dy: number,
  previous: Direction,
): Direction {
  if (sign(dy)) return dy < 0 ? "up" : "down";
  if (sign(dx)) return dx < 0 ? "left" : "right";
  return previous;
}

// Direction used by four-direction action sprites must follow the visible facing.
export function actionDirection(facing: Facing): Direction {
  if (facing.startsWith("up")) return "up";
  if (facing.startsWith("down")) return "down";
  return facing === "left" ? "left" : "right";
}
