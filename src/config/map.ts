import type { Habitat } from "../shared/catalog";
export type Direction = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
export const MAP = {
  width: 3072,
  height: 2048,
  spawn: { x: 1450, y: 1050 },
  shop: { x: 1536, y: 850 },
  waters: [
    { x: 280, y: 640, w: 650, h: 650, habitat: "pond" },
    { x: 280, y: 220, w: 2470, h: 240, habitat: "river" },
    { x: 2510, y: 220, w: 240, h: 1000, habitat: "river" },
    { x: 1810, y: 1390, w: 1040, h: 520, habitat: "lake" },
  ] as { x: number; y: number; w: number; h: number; habitat: Habitat }[],
  bridge: { x: 1410, y: 210, w: 210, h: 260 },
  obstacles: [
    { x: 1446, y: 660, w: 180, h: 120, kind: "stall" },
    ...[
      { x: 180, y: 490 },
      { x: 1120, y: 610 },
      { x: 1110, y: 1350 },
      { x: 1700, y: 1650 },
      { x: 2300, y: 710 },
      { x: 2890, y: 1330 },
    ].map((p) => ({ ...p, w: 68, h: 48, kind: "tree" })),
    ...[
      { x: 1030, y: 1160 },
      { x: 2340, y: 1240 },
      { x: 1700, y: 560 },
    ].map((p) => ({ ...p, w: 70, h: 48, kind: "rock" })),
  ],
};
export const vectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const inside = (
  p: Point,
  r: { x: number; y: number; w: number; h: number },
  pad = 0,
) =>
  p.x > r.x - pad &&
  p.x < r.x + r.w + pad &&
  p.y > r.y - pad &&
  p.y < r.y + r.h + pad;
export function walkable(p: Point) {
  if (p.x < 70 || p.y < 70 || p.x > MAP.width - 70 || p.y > MAP.height - 70)
    return false;
  if (MAP.obstacles.some((r) => inside(p, r, 14))) return false;
  if (inside(p, MAP.bridge, -6)) return true;
  return !MAP.waters.some((r) => inside(p, r, 14));
}
export function move(p: Point, dx: number, dy: number) {
  let q = { ...p };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  for (let i = 0; i < steps; i++) {
    if (walkable({ x: q.x + dx / steps, y: q.y })) q.x += dx / steps;
    if (walkable({ x: q.x, y: q.y + dy / steps })) q.y += dy / steps;
  }
  return q;
}
export function lineClear(a: Point, b: Point) {
  const n = Math.ceil(distance(a, b) / 8);
  for (let i = 1; i < n; i++)
    if (
      !walkable({
        x: a.x + ((b.x - a.x) * i) / n,
        y: a.y + ((b.y - a.y) * i) / n,
      })
    )
      return false;
  return true;
}
export const SPOTS = MAP.waters.flatMap((r, ri) => {
  const spots: {
    x: number;
    y: number;
    direction: Direction;
    habitat: Habitat;
    water: Point;
  }[] = [];
  for (let x = r.x + 32; x < r.x + r.w - 20; x += 40) {
    spots.push(
      {
        x,
        y: r.y - 32,
        direction: "down",
        habitat: r.habitat,
        water: { x, y: r.y + 45 },
      },
      {
        x,
        y: r.y + r.h + 32,
        direction: "up",
        habitat: r.habitat,
        water: { x, y: r.y + r.h - 45 },
      },
    );
  }
  for (let y = r.y + 32; y < r.y + r.h - 20; y += 40) {
    spots.push(
      {
        x: r.x - 32,
        y,
        direction: "right",
        habitat: r.habitat,
        water: { x: r.x + 45, y },
      },
      {
        x: r.x + r.w + 32,
        y,
        direction: "left",
        habitat: r.habitat,
        water: { x: r.x + r.w - 45, y },
      },
    );
  }
  return spots.filter(
    (p) => walkable(p) && !(ri === 0 && p.x < 330 && p.y < 700),
  );
});
export function fishingSpot(p: Point) {
  return SPOTS.filter((s) => distance(s, p) <= 64).sort(
    (a, b) => distance(a, p) - distance(b, p),
  )[0];
}
