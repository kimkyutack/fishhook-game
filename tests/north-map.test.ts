import { describe, expect, it } from "vitest";
import {
  MAP,
  TRAILS,
  distance,
  lineClear,
  move,
  walkable,
  walkingRoute,
} from "../src/config/map";

import { RouteSteering } from "../src/client/game/navigation";
import { MovementPrediction } from "../src/client/game/prediction";

const point = (x: number, y: number) => ({ x: x * 4, y: y * 4 });

describe("northern trail and pier connections", () => {
  it("keeps the visible west-bank bends and the northeast forest fork walkable", () => {
    for (const q of [
      point(111, 385),
      point(118, 352),
      point(128, 309),
      point(177, 230),
      point(1055, 140),
      point(1054, 128),
      point(1042, 117),
    ])
      expect(walkable(q), `visible path ${q.x / 4},${q.y / 4}`).toBe(true);
    // Changing the land corridors must not open shortcuts across the water.
    for (const q of [point(500, 250), point(300, 330), point(1050, 250)])
      expect(walkable(q)).toBe(false);
  });

  it("walks every authored trail segment in both directions without sticking", () => {
    for (const trail of TRAILS) {
      for (const points of [trail.points, [...trail.points].reverse()]) {
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i];
          expect(lineClear(a, b), `${trail.id} segment ${i}`).toBe(true);
          // Match repeated gameplay-sized movement packets instead of teleporting.
          let q = { ...a };
          for (let step = 0; step < 1000 && distance(q, b) > 0.01; step++) {
            const d = distance(q, b),
              amount = Math.min(d, 22);
            q = move(q, ((b.x - q.x) / d) * amount, ((b.y - q.y) / d) * amount);
          }
          expect(distance(q, b), `${trail.id} traversal ${i}`).toBeLessThan(
            0.01,
          );
        }
      }
    }
  });

  it("routes to and back from each upper branch and pier using only walkable steps", () => {
    for (const id of [
      "west-bank",
      "north-trail",
      "north-bridge",
      "north-shore",
      "north-east-trail",
      "north-pier",
      "river-pier",
      "upper-pier",
    ]) {
      const destination = TRAILS.find((t) => t.id === id)!.points.at(-1)!;
      for (const [start, end] of [
        [MAP.spawn, destination],
        [destination, MAP.spawn],
      ]) {
        const route = walkingRoute(start, end);
        expect(route.length, id).toBeGreaterThan(0);
        let q = start;
        for (const next of route) {
          expect(lineClear(q, next), id).toBe(true);
          q = move(q, next.x - q.x, next.y - q.y);
          expect(distance(q, next), id).toBeLessThan(0.01);
        }
        expect(distance(q, end), id).toBeLessThan(0.01);
      }
    }
  });

  it("bypasses the kiosk corner while retaining its solid footprint", () => {
    const a = point(603, 427),
      corner = point(631, 435),
      b = point(643, 462);
    expect(walkable(point(600, 470))).toBe(false);
    expect(lineClear(a, b)).toBe(false);
    expect(lineClear(a, corner)).toBe(true);
    expect(lineClear(corner, b)).toBe(true);
    const route = walkingRoute(a, b);
    expect(route.length).toBeGreaterThan(1);
    expect(
      route.reduce(
        (length, q, i) => length + distance(i ? route[i - 1] : a, q),
        0,
      ),
    ).toBeLessThan(400);
  });
  it("follows pointer-route angles through the forest fork instead of cutting a 45-degree corner", () => {
    const goal = point(1042, 117);
    const prediction = new MovementPrediction({ x: 3247.8, y: 817.69 });
    const route = walkingRoute(prediction.position, goal);
    const steering = new RouteSteering();
    let sequence = 0,
      commands = 0,
      frames = 0;
    for (; frames < 2000 && route.length; frames++) {
      while (route.length && distance(prediction.position, route[0]) < 16)
        route.shift();
      if (!route.length) break;
      const { dx, dy } = steering.toward(prediction.position, route[0]);
      prediction.advance(dx, dy, 1000 / 60, () => {
        commands++;
        return ++sequence;
      });
      expect(walkable(prediction.position)).toBe(true);
    }
    // Previously this stopped at (4116.9, 537.65), 86 units short of the goal.
    expect(distance(prediction.position, goal)).toBeLessThan(16);
    expect(frames).toBeLessThan(1000);
    expect(commands / (frames / 60)).toBeLessThan(25);
  });
});
