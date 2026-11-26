import { describe, it, expect } from "vitest";
import { FISH } from "../src/shared/catalog";
import {
  normalizeName,
  probabilities,
  drawFish,
  recharge,
} from "../src/shared/rules";
import { BAITS, BALANCE } from "../src/config/balance";
import {
  MAP,
  SPOTS,
  TRAILS,
  walkable,
  move,
  lineClear,
  walkingRoute,
} from "../src/config/map";
describe("catalog and authoritative rules", () => {
  it("has 50 fixed distinct species in exact requested order", () => {
    expect(FISH).toHaveLength(50);
    expect(new Set(FISH.map((f) => f.id)).size).toBe(50);
    for (let s = 1; s <= 5; s++)
      expect(FISH.filter((f) => f.star === s)).toHaveLength(10);
    expect(FISH[40].name).toBe("연화왕잉어");
    for (const habitat of ["pond", "river", "lake"])
      for (let s = 1; s <= 5; s++)
        expect(FISH.some((f) => f.star === s && f.habitat === habitat)).toBe(
          true,
        );
  });
  it("normalizes NFKC names, rejects spaces and hidden/control characters", () => {
    expect(normalizeName(" Ａｂ_한글 ")).toEqual({
      name: "Ab_한글",
      key: "ab_한글",
    });
    for (const name of ["a", "a b", "ab\u200b", "abc\nfoo", "😀😀"])
      expect(() => normalizeName(name)).toThrow();
  });
  it("normalizes every valid rod/bait/habitat combination and forbidden stars are exactly zero", () => {
    for (const rod of [1, 2, 3])
      for (const bait of BAITS)
        for (const h of ["pond", "river", "lake"] as const) {
          const p = probabilities(rod, bait.id, h);
          expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
          if (rod === 1) expect(p.slice(3)).toEqual([0, 0]);
          if (rod === 2) expect(p[4]).toBe(0);
        }
    expect(probabilities(1, "worm", "pond")[0]).toBeCloseTo(60 / 97, 12);
  });
  it("draws only permitted fish including at probability boundaries", () => {
    for (let i = 0; i < 10000; i++) {
      const rod = (i % 3) + 1,
        d = drawFish(rod, "special", "lake");
      expect(d.fish.star).toBeLessThanOrEqual(rod + 2);
      expect(d.duration).toBeGreaterThanOrEqual(
        BALANCE.duration[d.fish.star][0],
      );
    }
  });
  it("recharges hourly offline, keeps original next recharge and stops at max", () => {
    const h = BALANCE.rechargeMs;
    expect(recharge(1, h, h - 1)).toEqual({ charges: 1, next: h });
    expect(recharge(1, h, h)).toEqual({ charges: 2, next: h * 2 });
    expect(recharge(0, h, h * 20)).toEqual({ charges: 3, next: null });
    expect(recharge(3, h, h * 20)).toEqual({ charges: 3, next: null });
  });
  it("collides with water, obstacles and preserves passable bridge and reachable shore points", () => {
    expect(MAP.width * MAP.height).toBe(6144 * 4096);
    expect(walkable({ x: 4400, y: 2200 })).toBe(false);
    expect(walkable({ x: 2150, y: 1900 })).toBe(false);
    for (const name of ["west-bridge", "north-bridge"]) {
      const trail = TRAILS.find((t) => t.id === name)!;
      for (const direction of [trail.points, [...trail.points].reverse()]) {
        let q = direction[0];
        for (const next of direction.slice(1)) {
          expect(lineClear(q, next)).toBe(true);
          const result = move(q, next.x - q.x, next.y - q.y);
          expect(result.x).toBeCloseTo(next.x, 6);
          expect(result.y).toBeCloseTo(next.y, 6);
          q = result;
        }
      }
    }
    expect(SPOTS.length).toBeGreaterThan(40);
    for (const p of SPOTS) expect(walkable(p)).toBe(true);
    for (const habitat of ["pond", "river", "lake"])
      expect(SPOTS.some((s) => s.habitat === habitat)).toBe(true);
    expect(walkable(MAP.shop)).toBe(true);
    expect(walkable(MAP.spawn)).toBe(true);
  });
  it("routes from the spawn to the shop and each habitat without crossing water", () => {
    for (const goal of [
      MAP.shop,
      ...["pond", "river", "lake"].map((h) =>
        SPOTS.find((s) => s.habitat === h)!,
      ),
    ]) {
      const route = walkingRoute(MAP.spawn, goal);
      expect(route.length).toBeGreaterThan(0);
      let previous = MAP.spawn;
      for (const step of route) {
        expect(lineClear(previous, step)).toBe(true);
        previous = step;
      }
      expect(previous).toEqual(goal);
    }
    expect(walkingRoute(MAP.spawn, { x: 4400, y: 2200 })).toEqual([]);
  });
});
