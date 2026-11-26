import {
  SPOTS,
  TRAILS,
  distance,
  walkable,
  type Point,
  type Direction,
} from "../config/map";
import { actionDirection, type Facing } from "./movement";
import type { Habitat } from "./catalog";

export const FACINGS = [
  "down",
  "down-left",
  "left",
  "up-left",
  "up",
  "up-right",
  "right",
  "down-right",
] as const;
export function facingVector(facing: Facing): Point {
  const x = facing.includes("left") ? -1 : facing.includes("right") ? 1 : 0;
  const y = facing.includes("up") ? -1 : facing.includes("down") ? 1 : 0;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length };
}

// Exposed tips of the authored decks. Their outward sides are water, not land.
const deckEnds: { trail: string; direction: Direction; habitat: Habitat }[] = [
  { trail: "main-pier", direction: "right", habitat: "lake" },
  { trail: "upper-pier", direction: "right", habitat: "lake" },
  { trail: "shop-pier", direction: "right", habitat: "lake" },
  { trail: "north-shore", direction: "right", habitat: "lake" },
  { trail: "north-pier", direction: "down", habitat: "lake" },
  { trail: "river-pier", direction: "right", habitat: "river" },
  { trail: "pond-west-pier", direction: "right", habitat: "pond" },
  { trail: "pond-south-pier", direction: "left", habitat: "pond" },
];
export const FISHING_ENDS = deckEnds.map((end) => ({
  ...TRAILS.find((t) => t.id === end.trail)!.points.at(-1)!,
  direction: end.direction,
  habitat: end.habitat,
}));

export function fishingAim(q: Point, facing: Facing) {
  if (!walkable(q)) return undefined;
  const v = facingVector(facing);
  const edge = [...SPOTS, ...FISHING_ENDS]
    .filter((s) => {
      const outward = facingVector(s.direction);
      return distance(s, q) <= 64 && v.x * outward.x + v.y * outward.y >= 0.5;
    })
    .sort((a, b) => distance(a, q) - distance(b, q))[0];
  if (!edge) return undefined;
  // All three samples must lie beyond the walkable deck/shore in the chosen direction.
  if (
    [120, 145, 170].some((reach) =>
      walkable({ x: q.x + v.x * reach, y: q.y + v.y * reach }),
    )
  )
    return undefined;
  return {
    ...q,
    facing,
    direction: actionDirection(facing),
    habitat: edge.habitat,
    water: { x: q.x + v.x * 170, y: q.y + v.y * 170 },
  };
}
