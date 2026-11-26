import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GameWorldDO } from "../src/server/world";
import { SPOTS, walkable, distance } from "../src/config/map";
import {
  fishingAim,
  facingVector,
  FACINGS,
  FISHING_ENDS,
} from "../src/shared/fishing";
import { movementFacing, actionDirection } from "../src/shared/movement";
import { KeyboardSteering } from "../src/client/game/navigation";
import { locomotionPose, FISHING_ACTIONS } from "../src/client/game/animations";
const origin = "https://game.test";
async function register(
  s: DurableObjectStub<GameWorldDO>,
  name: string,
  gender = "male",
) {
  const r = await s.fetch(origin + "/api/register", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name, gender }),
  });
  const data = (await r.json()) as { player: { id: string } };
  const cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  const ws = (
    await s.fetch(origin + "/ws", {
      headers: { Origin: origin, Cookie: cookie, Upgrade: "websocket" },
    })
  ).webSocket!;
  ws.accept();
  return { id: data.player.id, ws, cookie };
}
describe("eight-direction fishing and retained facing", () => {
  it("keeps a released diagonal chord and supports deliberate axial continuation", () => {
    const input = new KeyboardSteering(),
      keys = new Set(["ArrowLeft", "ArrowDown"]);
    expect(input.input(keys, 100)).toEqual({ dx: -1, dy: 1 });
    let facing = movementFacing(-1, 1, "down");
    keys.delete("ArrowLeft");
    input.released(true, 100);
    const paused = input.input(keys, 120);
    facing = movementFacing(paused.dx, paused.dy, facing);
    expect(facing).toBe("down-left");
    keys.delete("ArrowDown");
    const stopped = input.input(keys, 130);
    expect(movementFacing(stopped.dx, stopped.dy, facing)).toBe("down-left");
    keys.add("ArrowDown");
    expect(input.input(keys, 160)).toEqual({ dx: 0, dy: 1 });
  });
  it("keeps all eight directions for idle and every fishing action", () => {
    for (const facing of FACINGS)
      for (const motion of ["idle", ...FISHING_ACTIONS] as const) {
        const p = locomotionPose(actionDirection(facing), motion, facing);
        expect(p.animationDirection).toBe(
          facing.includes("-")
            ? facing.startsWith("up")
              ? "up_right"
              : "down_right"
            : facing,
        );
        expect(p.flipX).toBe(facing.includes("-") && facing.endsWith("left"));
      }
  });
  it("provides real water casts for all eight facings and never turns a cast to the nearest spot normal", () => {
    for (const facing of FACINGS) {
      const q = [...SPOTS, ...FISHING_ENDS].find((q) => fishingAim(q, facing))!;
      expect(q).toBeTruthy();
      const aim = fishingAim(q, facing)!;
      expect(aim.facing).toBe(facing);
      expect(walkable(aim.water)).toBe(false);
      expect(distance(q, aim.water)).toBeCloseTo(170, 5);
      const v = facingVector(facing);
      expect((aim.water.x - q.x) / 170).toBeCloseTo(v.x, 7);
      expect((aim.water.y - q.y) / 170).toBeCloseTo(v.y, 7);
    }
  });
  it("rejects looking along land without spending bait or rotating the character", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID()),
      p = await register(s, "시선거절검증");
    await runInDurableObject(s, (o) => {
      const q = SPOTS.find(
        (q) => fishingAim(q, "up") && !fishingAim(q, "left"),
      )!;
      expect(q).toBeTruthy();
      o.setPlayer({
        ...o.current(p.id),
        ...q,
        direction: "left",
        facing: "left",
        motion: "idle",
        stateAt: 0,
      });
      const result = o.execute(
        p.id,
        { type: "cast", commandId: crypto.randomUUID() },
        Date.now(),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("물을 바라보고");
      expect(o.current(p.id).facing).toBe("left");
      expect(o.db.private(p.id, Date.now()).baits.worm).toBe(20);
      expect(o.db.active(p.id)).toBeUndefined();
    });
    p.ws.close();
  });
  it("persists and shares all eight cast facings and water positions, including offline reconnection", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID()),
      p = await register(s, "남자팔방낚시"),
      peer = await register(s, "여자팔방낚시", "female");
    await runInDurableObject(s, (o) => {
      for (const facing of FACINGS) {
        const q = [...SPOTS, ...FISHING_ENDS].find((q) =>
            fishingAim(q, facing),
          )!,
          now = Date.now();
        o.setPlayer({
          ...o.current(p.id),
          ...q,
          direction: actionDirection(facing),
          facing,
          motion: "idle",
          stateAt: now - 5000,
        });
        expect(
          o.execute(p.id, { type: "cast", commandId: crypto.randomUUID() }, now)
            .ok,
        ).toBe(true);
        const cast = o.db.active(p.id)!,
          publicPlayer = o.db.public(p.id, false),
          shared = o.players().find((v) => v.id === p.id)!;
        expect(cast.facing).toBe(facing);
        expect(publicPlayer.facing).toBe(facing);
        expect(shared.facing).toBe(facing);
        expect(publicPlayer.castWater).toEqual({
          x: cast.water_x,
          y: cast.water_y,
        });
        expect(shared.castWater).toEqual(publicPlayer.castWater);
        expect(
          o.execute(
            p.id,
            { type: "cancel", commandId: crypto.randomUUID() },
            now + 100,
          ).ok,
        ).toBe(true);
      }
      expect(o.db.private(p.id, Date.now()).baits.worm).toBe(12);
      const facing = "up-left" as const,
        q = [...SPOTS, ...FISHING_ENDS].find((q) => fishingAim(q, facing))!;
      o.setPlayer({
        ...o.current(p.id),
        ...q,
        direction: "up",
        facing,
        motion: "idle",
        stateAt: 0,
      });
      expect(
        o.execute(
          p.id,
          { type: "cast", commandId: crypto.randomUUID() },
          Date.now(),
        ).ok,
      ).toBe(true);
    });
    await runInDurableObject(s, (o) =>
      o.webSocketClose(o.socketFor(p.id)!, 1000),
    );
    const next = (
      await s.fetch(origin + "/ws", {
        headers: { Origin: origin, Cookie: p.cookie, Upgrade: "websocket" },
      })
    ).webSocket!;
    next.accept();
    const restored = await runInDurableObject(s, (o) => o.current(p.id));
    expect(restored.facing).toBe("up-left");
    expect(restored.castWater).toBeTruthy();
    expect(restored.castStartedAt).toBeDefined();
    next.close();
    peer.ws.close();
    p.ws.close();
  });
});
