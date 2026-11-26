import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GameWorldDO } from "../src/server/world";
import type { Command, PublicPlayer } from "../src/shared/protocol";
import { MAP, SPOTS, lineClear } from "../src/config/map";
import {
  KICK_RANGE,
  KICK_ANIMATION_MS,
  FALL_DIRECTIONS,
  fallFrame,
  KNOCKDOWN_MS,
  GET_UP_MS,
} from "../src/shared/kick";
import { motionBusy, targetFor } from "../src/shared/interaction";
import { visibleMotion } from "../src/client/game/animations";
const origin = "https://game.test";
const spot = SPOTS.find((s) => s.habitat === "lake" && s.direction === "down")!;
async function player(
  s: DurableObjectStub<GameWorldDO>,
  name: string,
  gender = "male",
) {
  const response = await s.fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name, gender }),
  });
  const body = (await response.json()) as { player: { id: string } };
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  const connected = await s.fetch(`${origin}/ws`, {
    headers: { Origin: origin, Cookie: cookie, Upgrade: "websocket" },
  });
  connected.webSocket!.accept();
  return { id: body.player.id, cookie, socket: connected.webSocket! };
}
describe("unlimited kicks and knockdown authority", () => {
  it("hits standing and seated targets in all eight directions with no charges or old protection", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const attacker = await player(s, "발차기검증");
    const victim = await player(s, "넘어짐검증", "female");
    await runInDurableObject(s, (o) => {
      const now = Date.now();
      o.db.exec(
        "UPDATE sabotage_state SET charges=0,next_recharge_at=? WHERE player_id=?",
        now + 3600000,
        attacker.id,
      );
      for (const [i, facing] of FALL_DIRECTIONS.entries()) {
        const at = now + i * 3000;
        const a = {
          ...o.current(attacker.id),
          x: spot.x + 68,
          y: spot.y,
          direction: "left" as const,
          facing: "left" as const,
          motion: "idle" as const,
          stateAt: at - 5000,
        };
        const v: PublicPlayer = {
          ...o.current(victim.id),
          x: spot.x,
          y: spot.y,
          direction: "down",
          facing,
          motion: i % 2 ? "seated_idle" : "idle",
          stateAt: at - 5000,
          protectedUntil: at + 60000,
        };
        o.setPlayer(a);
        o.setPlayer(v);
        const result = o.execute(
          attacker.id,
          { type: "kick", target: victim.id, commandId: crypto.randomUUID() },
          at,
        );
        expect(result.ok).toBe(true);
        const hit = o.attachment(o.socketFor(victim.id)!).player;
        expect(hit.motion).toBe("fallen");
        expect(hit.facing).toBe(facing);
        expect(hit.castStartedAt).toBeUndefined();
        // SQLite carries the facing and recovery clock through a fresh connection.
        expect(o.db.public(victim.id).facing).toBe(facing);
        expect(o.db.public(victim.id).stateAt).toBe(at);
        expect(targetFor(a, [hit], at + 1000)).toBeUndefined();
        expect(targetFor(a, [hit], at + KNOCKDOWN_MS + GET_UP_MS)?.id).toBe(
          victim.id,
        );
      }
      expect(
        o.db.one<{ charges: number }>(
          "SELECT charges FROM sabotage_state WHERE player_id=?",
          attacker.id,
        )!.charges,
      ).toBe(0);
    });
    attacker.socket.close();
    victim.socket.close();
  });
  it("blocks movement and every command for exactly 1500ms, then permits getting up or moving", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "행동잠금검증");
    await runInDurableObject(s, (o) => {
      const at = Date.now();
      const ws = o.socketFor(a.id)!;
      const fallen: PublicPlayer = {
        ...o.current(a.id),
        x: spot.x,
        y: spot.y,
        motion: "fallen",
        stateAt: at,
        facing: "up-left",
      };
      o.setPlayer(fallen);
      const commands: Omit<Command, "commandId">[] = [
        { type: "sit" },
        { type: "cast" },
        { type: "cancel" },
        { type: "refill" },
        { type: "sellAll" },
      ];
      for (const c of commands)
        expect(
          o.execute(
            a.id,
            { ...c, commandId: crypto.randomUUID() } as Command,
            at + 1499,
          ).ok,
        ).toBe(false);
      expect(
        o.execute(
          a.id,
          { type: "equip", rod: 1, commandId: crypto.randomUUID() },
          at + 1499,
        ).ok,
      ).toBe(false);
      expect(
        o.execute(
          a.id,
          {
            type: "kick",
            target: crypto.randomUUID(),
            commandId: crypto.randomUUID(),
          },
          at + 1499,
        ).ok,
      ).toBe(false);
      o.onMove(
        ws,
        { seq: 1, dx: 1, dy: 0, direction: "right", dtMs: 100 },
        at + 1499,
      );
      expect(o.attachment(ws).player.x).toBe(fallen.x);
      expect(motionBusy(fallen, at + 1500)).toBe(false);
      o.onMove(
        ws,
        { seq: 2, dx: 1, dy: 0, direction: "right", dtMs: 100 },
        at + 1500,
      );
      expect(o.attachment(ws).player.x).toBeGreaterThan(fallen.x);
      expect(o.attachment(ws).player.motion).toBe("walk");
      o.setPlayer(fallen);
      expect(
        o.execute(
          a.id,
          { type: "sit", commandId: crypto.randomUUID() },
          at + 1500,
        ).ok,
      ).toBe(true);
      expect(visibleMotion("fallen", 1499)).toBe("fallen");
      expect(fallFrame(1499)).toBe(2);
      expect(fallFrame(1500)).toBe(3);
      expect(fallFrame(1700)).toBe(4);
      expect(visibleMotion("fallen", 1850)).toBe("idle");
    });
    a.socket.close();
  });
  it("a reconnect does not remove knockdown or restart fishing", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "재접속넘어짐");
    await runInDurableObject(s, async (o) => {
      o.setPlayer({
        ...o.current(a.id),
        motion: "fallen",
        facing: "down-left",
        stateAt: Date.now(),
      });
      await o.webSocketClose(o.socketFor(a.id)!, 1000);
      expect(o.socketFor(a.id)).toBeUndefined();
    });
    const next = await s.fetch(`${origin}/ws`, {
      headers: { Origin: origin, Cookie: a.cookie, Upgrade: "websocket" },
    });
    next.webSocket!.accept();
    const p = await runInDurableObject(s, (o) => o.current(a.id));
    expect(p.motion).toBe("fallen");
    expect(p.facing).toBe("down-left");
    expect(p.castStartedAt).toBeUndefined();
    expect(motionBusy(p, p.stateAt + 1499)).toBe(true);
    next.webSocket!.close();
  });
});

describe("dedicated kick and forgiving range", () => {
  it("selects a target at 180 units, rejects one beyond it or behind, and uses diagonal facing", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "범위검증");
    const b = await player(s, "범위대상");
    await runInDurableObject(s, (o) => {
      const now = Date.now();
      const me: PublicPlayer = {
        ...o.current(a.id),
        ...MAP.spawn,
        direction: "left",
        facing: "left",
        motion: "idle",
        stateAt: now - 5000,
      };
      const other = {
        ...o.current(b.id),
        ...MAP.spawn,
        x: MAP.spawn.x - KICK_RANGE,
        motion: "idle" as const,
      };
      expect(lineClear(me, other)).toBe(true);
      expect(targetFor(me, [other], now)?.id).toBe(b.id);
      expect(
        targetFor(me, [{ ...other, x: other.x - 1 }], now),
      ).toBeUndefined();
      expect(targetFor(me, [{ ...other, x: me.x + 150 }], now)).toBeUndefined();
      // The diagonal actor looks down-left even though equipment faces down.
      expect(
        targetFor(
          { ...me, direction: "down", facing: "down-left" },
          [other],
          now,
        )?.id,
      ).toBe(b.id);
      expect(
        targetFor(me, [{ ...other, x: me.x + 20, y: me.y - 150 }], now),
      ).toBeUndefined();
    });
    a.socket.close();
    b.socket.close();
  });
  it("the server chooses the nearest target beyond the old 96-unit limit", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "자동타격");
    const b = await player(s, "넓은타격");
    await runInDurableObject(s, (o) => {
      const now = Date.now();
      o.setPlayer({
        ...o.current(a.id),
        ...MAP.spawn,
        direction: "left",
        facing: "left",
        motion: "idle",
        stateAt: now - 5000,
      });
      o.setPlayer({
        ...o.current(b.id),
        ...MAP.spawn,
        x: MAP.spawn.x - 160,
        motion: "idle",
        stateAt: now - 5000,
      });
      expect(
        o.execute(a.id, { type: "kick", commandId: crypto.randomUUID() }, now)
          .ok,
      ).toBe(true);
      expect(o.current(b.id).motion).toBe("fallen");
      expect(o.current(a.id).motion).toBe("run");
    });
    a.socket.close();
    b.socket.close();
  });
  it("kicks empty space without sitting, casting or changing inventory, then returns to idle", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "허공발차기");
    await runInDurableObject(s, (o) => {
      const now = Date.now(),
        before = o.db.private(a.id, now);
      o.setPlayer({
        ...o.current(a.id),
        ...MAP.spawn,
        motion: "idle",
        stateAt: now - 5000,
      });
      expect(
        o.execute(a.id, { type: "kick", commandId: crypto.randomUUID() }, now)
          .ok,
      ).toBe(true);
      expect(o.current(a.id).motion).toBe("kick");
      expect(o.db.active(a.id)).toBeUndefined();
      expect(o.db.private(a.id, now).baits).toEqual(before.baits);
      expect(o.db.private(a.id, now).coins).toBe(before.coins);
      expect(visibleMotion("kick", KICK_ANIMATION_MS - 1)).toBe("kick");
      expect(visibleMotion("kick", KICK_ANIMATION_MS)).toBe("idle");
      expect(
        o.normalize({ ...o.current(a.id), stateAt: now - KICK_ANIMATION_MS })
          .motion,
      ).toBe("idle");
    });
    a.socket.close();
  });
  it("can kick overlapping players without non-finite retreat coordinates", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await player(s, "겹친공격");
    const b = await player(s, "겹친상대");
    await runInDurableObject(s, (o) => {
      const now = Date.now();
      for (const id of [a.id, b.id])
        o.setPlayer({
          ...o.current(id),
          ...MAP.spawn,
          motion: "idle",
          stateAt: now - 5000,
        });
      expect(
        o.execute(a.id, { type: "kick", commandId: crypto.randomUUID() }, now)
          .ok,
      ).toBe(true);
      expect(o.current(b.id).motion).toBe("fallen");
      expect(Number.isFinite(o.current(a.id).x)).toBe(true);
      expect(Number.isFinite(o.current(a.id).y)).toBe(true);
    });
    a.socket.close();
    b.socket.close();
  });
});

it("acknowledges keyboard kicks as ack so reconnect does not keep resending them", async () => {
  const s = env.GAME_WORLD.getByName(crypto.randomUUID());
  const a = await player(s, "발차기응답");
  const commandId = crypto.randomUUID();
  const response = new Promise<any>((resolve) =>
    a.socket.addEventListener("message", (e) => {
      const data = JSON.parse(String(e.data));
      if (data.commandId === commandId) resolve(data);
    }),
  );
  a.socket.send(JSON.stringify({ type: "kick", commandId }));
  expect(await response).toEqual({ type: "ack", commandId, ok: true });
  a.socket.close();
});
