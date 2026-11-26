import type { Habitat } from "../shared/catalog";
export type Direction = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
const p = (x: number, y: number): Point => ({ x: x * 4, y: y * 4 });
// Coordinates follow the approved 1536×1024 environment, at four world units per art pixel.
export const TRAILS = [
  {
    id: "shore",
    radius: 25,
    points: [
      [605, 214],
      [648, 250],
      [612, 285],
      [576, 315],
      [558, 351],
      [566, 387],
      [603, 427],
      [631, 435],
      [643, 462],
      [669, 495],
      [653, 525],
      [640, 552],
      [609, 568],
      [551, 584],
      [493, 617],
      [489, 641],
      [549, 672],
      [609, 713],
      [654, 765],
      [706, 802],
      [775, 823],
      [838, 818],
    ],
  },
  {
    id: "west-bank",
    radius: 21,
    points: [
      [90, 437],
      [108, 405],
      [120, 374],
      [128, 340],
      [128, 309],
      [139, 279],
      [154, 250],
      [177, 230],
      [207, 208],
      [260, 176],
      [304, 145],
      [360, 160],
      [420, 178],
    ],
  },
  {
    id: "north-trail",
    radius: 18,
    points: [
      [304, 145],
      [338, 109],
      [330, 74],
    ],
  },
  {
    id: "west-bridge",
    radius: 25,
    points: [
      [90, 437],
      [145, 425],
      [210, 426],
      [280, 445],
      [345, 474],
      [395, 495],
      [443, 537],
      [479, 579],
      [493, 617],
    ],
  },
  {
    id: "north-bridge",
    radius: 19,
    points: [
      [420, 178],
      [464, 165],
      [510, 171],
      [553, 189],
      [600, 213],
      [605, 214],
    ],
  },
  {
    id: "pond-loop",
    radius: 22,
    points: [
      [489, 641],
      [404, 652],
      [314, 668],
      [255, 695],
      [227, 736],
      [198, 765],
      [143, 810],
      [151, 852],
      [220, 900],
      [320, 935],
      [430, 942],
      [530, 924],
      [595, 903],
      [636, 873],
      [678, 843],
      [706, 802],
    ],
  },
  {
    id: "north-shore",
    radius: 20,
    points: [
      [648, 250],
      [730, 218],
      [815, 203],
      [930, 177],
      [1010, 154],
      [1105, 156],
      [1130, 175],
      [1180, 190],
      [1230, 189],
    ],
  },
  {
    id: "north-east-trail",
    radius: 16,
    points: [
      [1058, 153],
      [1055, 140],
      [1054, 128],
      [1042, 117],
    ],
  },
  {
    id: "north-pier",
    radius: 14,
    points: [
      [973, 186],
      [995, 210],
      [978, 227],
    ],
  },
  {
    id: "river-pier",
    radius: 14,
    points: [
      [154, 250],
      [180, 258],
      [207, 269],
      [267, 278],
    ],
  },
  {
    id: "upper-pier",
    radius: 18,
    points: [
      [576, 315],
      [610, 315],
      [670, 326],
      [740, 342],
      [800, 337],
      [860, 326],
      [913, 314],
    ],
  },
  {
    id: "shop-pier",
    radius: 18,
    points: [
      [669, 495],
      [714, 507],
      [770, 503],
    ],
  },
  {
    id: "curved-pier",
    radius: 16,
    points: [
      [640, 552],
      [610, 574],
      [605, 593],
      [615, 626],
      [647, 647],
      [686, 647],
    ],
  },
  {
    id: "main-pier",
    radius: 22,
    points: [
      [810, 807],
      [855, 779],
      [902, 752],
      [951, 733],
      [1030, 708],
      [1100, 691],
      [1185, 673],
      [1250, 674],
    ],
  },
  {
    id: "pond-west-pier",
    radius: 15,
    points: [
      [227, 736],
      [251, 761],
      [295, 779],
    ],
  },
  {
    id: "pond-south-pier",
    radius: 16,
    points: [
      [595, 903],
      [570, 878],
      [528, 861],
      [480, 856],
    ],
  },
].map((t) => ({
  ...t,
  radius: t.radius * 4,
  points: t.points.map(([x, y]) => p(x, y)),
}));
export const MAP = {
  version: 2,
  width: 6144,
  height: 4096,
  spawn: p(1100, 705),
  shop: p(638, 544),
  waters: [
    { x: 800, y: 2800, w: 1500, h: 1000, habitat: "pond" },
    { x: 600, y: 700, w: 1500, h: 600, habitat: "river" },
    { x: 2900, y: 1100, w: 2900, h: 2300, habitat: "lake" },
  ] as { x: number; y: number; w: number; h: number; habitat: Habitat }[],
  bridge: { x: 360, y: 1600, w: 1300, h: 500 },
  obstacles: [
    { x: 475 * 4, y: 435 * 4, w: 150 * 4, h: 116 * 4, kind: "stall" },
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
export function segmentDistance(q: Point, a: Point, b: Point) {
  const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = d
    ? Math.max(
        0,
        Math.min(
          1,
          ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / d,
        ),
      )
    : 0;
  return distance(q, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
export function walkable(q: Point) {
  if (q.x < 40 || q.y < 40 || q.x > MAP.width - 40 || q.y > MAP.height - 40)
    return false;
  if (
    MAP.obstacles.some(
      (r) => q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h,
    )
  )
    return false;
  return TRAILS.some((t) =>
    t.points.some(
      (a, i) => i > 0 && segmentDistance(q, t.points[i - 1], a) <= t.radius,
    ),
  );
}
export function move(q: Point, dx: number, dy: number) {
  const next = { ...q },
    steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  for (let i = 0; i < steps; i++) {
    if (walkable({ x: next.x + dx / steps, y: next.y })) next.x += dx / steps;
    if (walkable({ x: next.x, y: next.y + dy / steps })) next.y += dy / steps;
  }
  return next;
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
// Pointer navigation follows the same authored shore/bridge network as authoritative movement.
// The client sends ordinary movement inputs; the server still confirms every step.
export function walkingRoute(start: Point, end: Point): Point[] {
  if (!walkable(start) || !walkable(end)) return [];
  if (lineClear(start, end)) return [end];
  const nodes = [start, end, ...TRAILS.flatMap((t) => t.points)];
  const edges: { to: number; cost: number }[][] = nodes.map(() => []);
  for (let a = 0; a < nodes.length; a++)
    for (let b = a + 1; b < nodes.length; b++) {
      const cost = distance(nodes[a], nodes[b]);
      if (cost > 650 || !lineClear(nodes[a], nodes[b])) continue;
      edges[a].push({ to: b, cost });
      edges[b].push({ to: a, cost });
    }
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  costs[0] = 0;
  for (let n = 0; n < nodes.length; n++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!visited.has(i) && (current === -1 || costs[i] < costs[current]))
        current = i;
    if (current === -1 || !Number.isFinite(costs[current])) return [];
    if (current === 1) {
      const route: Point[] = [];
      while (current !== 0) {
        route.unshift(nodes[current]);
        current = previous[current];
      }
      return route;
    }
    visited.add(current);
    for (const e of edges[current])
      if (costs[current] + e.cost < costs[e.to]) {
        costs[e.to] = costs[current] + e.cost;
        previous[e.to] = current;
      }
  }
  return [];
}
export type FishingSpot = Point & {
  direction: Direction;
  habitat: Habitat;
  water: Point;
};
const spots: FishingSpot[] = [];
function bank(
  a: number[],
  b: number[],
  direction: Direction,
  habitat: Habitat,
) {
  const start = p(a[0], a[1]),
    end = p(b[0], b[1]),
    n = Math.max(1, Math.floor(distance(start, end) / 104)),
    v = vectors[direction];
  for (let i = 0; i <= n; i++) {
    const q = {
      x: start.x + ((end.x - start.x) * i) / n,
      y: start.y + ((end.y - start.y) * i) / n,
    };
    if (walkable(q))
      spots.push({
        ...q,
        direction,
        habitat,
        water: { x: q.x + v.x * 170, y: q.y + v.y * 170 },
      });
  }
}
// Seats are on actual wooden decks/shore; water targets point away from railings into water.
bank([980, 729], [1230, 690], "down", "lake");
bank([680, 333], [900, 326], "down", "lake");
bank([710, 325], [900, 310], "up", "lake");
bank([1030, 692], [1230, 660], "up", "lake");
bank([710, 511], [768, 509], "down", "lake");
bank([642, 650], [682, 650], "down", "lake");
bank([1145, 196], [1225, 196], "down", "lake");
bank([245, 772], [295, 784], "down", "pond");
bank([486, 850], [550, 855], "up", "pond");
bank([202, 274], [268, 282], "down", "river");
bank([978, 220], [990, 220], "left", "lake");
export const SPOTS = spots;
export function fishingSpot(q: Point) {
  return SPOTS.filter((s) => distance(s, q) <= 64).sort(
    (a, b) => distance(a, q) - distance(b, q),
  )[0];
}
