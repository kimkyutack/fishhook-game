import {
  env,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import type { GameWorldDO } from "../src/server/world";
import type { Command, PublicPlayer } from "../src/shared/protocol";
import { MAP, SPOTS } from "../src/config/map";
import { Store } from "../src/server/store";
const TEST_SPOT = SPOTS.find(
  (s) => s.habitat === "lake" && s.direction === "down",
)!;
import { BALANCE } from "../src/config/balance";
const origin = "https://game.test";
function stub() {
  return env.GAME_WORLD.getByName(crypto.randomUUID());
}
async function register(
  s: DurableObjectStub<GameWorldDO>,
  name = "테스터",
  gender = "male",
) {
  const response = await s.fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name, gender }),
  });
  const body = (await response.json()) as {
    player: { id: string; coins: number; baits: { worm: number } };
    error?: string;
  };
  return {
    response,
    body,
    cookie: response.headers.get("Set-Cookie")?.split(";")[0] ?? "",
  };
}
async function command(
  s: DurableObjectStub<GameWorldDO>,
  id: string,
  c: Command,
) {
  return runInDurableObject(s, (o) => o.execute(id, c, Date.now()));
}
async function place(
  s: DurableObjectStub<GameWorldDO>,
  id: string,
  x: number,
  y: number,
  direction = TEST_SPOT.direction,
) {
  await runInDurableObject(s, (o) => {
    o.db.exec(
      "UPDATE players SET x=?,y=?,direction=?,facing=?,motion='idle',state_at=0 WHERE id=?",
      x,
      y,
      direction,
      direction,
      id,
    );
  });
}
async function seed(
  s: DurableObjectStub<GameWorldDO>,
  id: string,
  fishId: string,
  due: number,
  status = "ACTIVE",
) {
  return runInDurableObject(s, (o) => {
    const castId = crypto.randomUUID();
    o.db.exec(
      "INSERT INTO active_casts(id,player_id,fish_id,rod,bait,started_at,due_at,status,x,y,direction,water_x,water_y) VALUES(?,?,?,3,'worm',?,?,?,?,?,?,?,?)",
      castId,
      id,
      fishId,
      Date.now() - 5000,
      due,
      status,
      TEST_SPOT.x,
      TEST_SPOT.y,
      TEST_SPOT.direction,
      TEST_SPOT.water.x,
      TEST_SPOT.water.y,
    );
    return castId;
  });
}
describe("SQLite Durable Object integration", () => {
  it("migrates the enlarged map once without changing pending rewards, sessions or balances", async () => {
    const s = stub(),
      a = await register(s, "맵이전검증");
    const id = a.body.player.id,
      due = Date.now() + 30000;
    const castId = await seed(s, id, "fish_001", due);
    await runInDurableObject(s, (o, state) => {
      o.db.exec("DELETE FROM schema_migrations WHERE version=2");
      o.db.exec("UPDATE players SET x=100,y=100,coins=777 WHERE id=?", id);
      const before = o.db.active(id)!;
      const db = new Store(state.storage);
      db.init();
      const after = db.active(id)!;
      expect(after.id).toBe(castId);
      expect(after.fish_id).toBe(before.fish_id);
      expect(after.due_at).toBe(due);
      expect(after.cast_order).toBe(before.cast_order);
      expect(after.status).toBe("ACTIVE");
      expect(SPOTS.some((p) => p.x === after.x && p.y === after.y)).toBe(true);
      expect(db.player(id).coins).toBe(777);
      expect(db.player(id).x).toBe(MAP.spawn.x);
      db.exec("UPDATE players SET x=? WHERE id=?", MAP.spawn.x + 10, id);
      db.init();
      expect(db.player(id).x).toBe(MAP.spawn.x + 10);
    });
    const session = await s.fetch(`${origin}/api/session`, {
      headers: { Cookie: a.cookie },
    });
    expect(session.status).toBe(200);
    expect(
      ((await session.json()) as { player: { id: string } }).player.id,
    ).toBe(id);
  });
  it("atomically creates only one normalized name, never logs in by name", async () => {
    const s = stub();
    const [a, b] = await Promise.all([
      register(s, "SameName"),
      register(s, "ｓａｍｅｎａｍｅ"),
    ]);
    expect([a.response.status, b.response.status].sort()).toEqual([200, 400]);
    const r = await s.fetch(`${origin}/api/session`, {
      headers: { Cookie: "waterside_session=SameName" },
    });
    expect(r.status).toBe(401);
  });
  it("issues HttpOnly Secure server sessions, restores exactly one starter grant", async () => {
    const s = stub(),
      a = await register(s);
    expect(a.response.headers.get("Set-Cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax",
    );
    for (let i = 0; i < 2; i++) {
      const r = await s.fetch(`${origin}/api/session`, {
        headers: { Cookie: a.cookie },
      });
      expect(r.status).toBe(200);
      const data = (await r.json()) as {
        player: { coins: number; baits: { worm: number } };
      };
      expect(data.player.coins).toBe(100);
      expect(data.player.baits.worm).toBe(20);
      expect(r.headers.get("Set-Cookie")).toContain("Max-Age=2592000");
    }
  });
  it("rejects foreign Origin, missing auth and oversized requests", async () => {
    const s = stub();
    expect(
      (
        await s.fetch(`${origin}/api/register`, {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect((await s.fetch(`${origin}/api/session`)).status).toBe(401);
    expect(
      (
        await s.fetch(`${origin}/api/register`, {
          method: "POST",
          headers: { Origin: origin },
          body: "x".repeat(9000),
        })
      ).status,
    ).toBe(400);
  });
  it("persists one secret cast and consumes bait once for replayed command", async () => {
    const s = stub(),
      a = await register(s);
    const id = a.body.player.id;
    await place(s, id, TEST_SPOT.x, TEST_SPOT.y);
    const cmd: Command = { type: "cast", commandId: crypto.randomUUID() };
    expect((await command(s, id, cmd)).ok).toBe(true);
    expect((await command(s, id, cmd)).ok).toBe(true);
    const result = await runInDurableObject(s, (o) => ({
      self: o.db.private(id, Date.now()),
      public: o.db.public(id),
      cast: o.db.active(id),
    }));
    expect(result.self.baits.worm).toBe(19);
    expect(result.cast).toBeDefined();
    expect(JSON.stringify(result.public)).not.toContain("fish_id");
    expect(JSON.stringify(result.public)).not.toContain("due_at");
    expect(
      (await command(s, id, { type: "cast", commandId: crypto.randomUUID() }))
        .ok,
    ).toBe(false);
  });
  it("movement refunds exactly the cast bait once and cancelled fish never settle", async () => {
    const s = stub(),
      a = await register(s),
      id = a.body.player.id;
    await place(s, id, TEST_SPOT.x, TEST_SPOT.y);
    await command(s, id, { type: "cast", commandId: crypto.randomUUID() });
    const result = await runInDurableObject(s, (o) => {
      // Even if the equipped bait changes, refund the bait consumed by this cast.
      o.db.exec("UPDATE players SET bait='special' WHERE id=?", id);
      const first = o.cancelForMovement(id, Date.now());
      const repeated = o.cancelForMovement(id, Date.now());
      o.db.exec(
        "UPDATE active_casts SET due_at=? WHERE player_id=?",
        Date.now() - 1,
        id,
      );
      o.settle();
      return {
        first,
        repeated,
        self: o.db.private(id, Date.now()),
        cast: o.db.one<{ status: string }>(
          "SELECT status FROM active_casts WHERE player_id=?",
          id,
        ),
      };
    });
    expect(result.first).toBe(true);
    expect(result.repeated).toBe(false);
    expect(result.self.baits.worm).toBe(20);
    expect(result.self.baits.special).toBe(0);
    expect(result.self.inventory).toHaveLength(0);
    expect(result.self.rank).toBeNull();
    expect(result.cast?.status).toBe("CANCELLED_BY_MOVEMENT");
  });
  it("real socket movement sends the bait refund immediately, key release leaves a cast intact", async () => {
    const s = stub(),
      a = await register(s),
      id = a.body.player.id;
    await place(s, id, TEST_SPOT.x, TEST_SPOT.y);
    const response = await s.fetch(`${origin}/ws`, {
      headers: { Origin: origin, Cookie: a.cookie, Upgrade: "websocket" },
    });
    const client = response.webSocket!;
    client.accept();
    const updated = new Promise<{
      self: { baits: { worm: number } };
      players: PublicPlayer[];
    }>((resolve) => {
      client.addEventListener("message", (event) => {
        const value = JSON.parse(String(event.data));
        if (
          value.type === "snapshot" &&
          value.self.baits.worm === 20 &&
          value.players.some(
            (p: PublicPlayer) => p.id === id && p.motion === "walk",
          )
        )
          resolve(value);
      });
    });
    const state = await runInDurableObject(s, (o) => {
      const now = Date.now(),
        ws = o.socketFor(id)!;
      o.execute(id, { type: "cast", commandId: crypto.randomUUID() }, now);
      o.onMove(ws, { seq: 1, dx: 0, dy: 0, direction: "left" }, now + 50);
      const stillCasting = o.attachment(ws).player.castStartedAt !== undefined;
      o.onMove(ws, { seq: 2, dx: 1, dy: 0, direction: "right" }, now + 150);
      o.onMove(ws, { seq: 3, dx: 1, dy: 0, direction: "right" }, now + 250);
      return {
        stillCasting,
        player: o.attachment(ws).player,
        bait: o.db.private(id, now).baits.worm,
      };
    });
    const snapshot = await updated;
    expect(state.stillCasting).toBe(true);
    expect(state.player.castStartedAt).toBeUndefined();
    expect(state.player.x).toBeGreaterThan(TEST_SPOT.x);
    expect(state.bait).toBe(20);
    expect(snapshot.self.baits.worm).toBe(20);
    client.close();
  });
  it("movement after completion cannot refund a bait or revoke the fish", async () => {
    const s = stub(),
      a = await register(s),
      id = a.body.player.id;
    await place(s, id, TEST_SPOT.x, TEST_SPOT.y);
    await command(s, id, { type: "cast", commandId: crypto.randomUUID() });
    const result = await runInDurableObject(s, (o) => {
      o.db.exec(
        "UPDATE active_casts SET due_at=? WHERE player_id=?",
        Date.now() - 1,
        id,
      );
      o.settle();
      return {
        refunded: o.cancelForMovement(id, Date.now()),
        self: o.db.private(id, Date.now()),
      };
    });
    expect(result.refunded).toBe(false);
    expect(result.self.baits.worm).toBe(19);
    expect(result.self.inventory).toHaveLength(1);
  });
  it("finishes offline and repeated alarms never grant twice", async () => {
    const s = stub(),
      a = await register(s);
    const id = a.body.player.id;
    await seed(s, id, "fish_001", Date.now() - 100);
    await runInDurableObject(s, async (o, ctx) => {
      await ctx.storage.setAlarm(Date.now() + 1000);
    });
    expect(await runDurableObjectAlarm(s)).toBe(true);
    await runInDurableObject(s, (o) => o.settle());
    const r = await runInDurableObject(s, (o) => o.db.private(id, Date.now()));
    expect(r.inventory).toHaveLength(1);
    expect(r.bestiary[0].count).toBe(1);
    expect(r.rank).toBe(1);
  });
  it("ranks by scheduled finish time and creation order, keeps record after sale and later same-star catch", async () => {
    const s = stub(),
      a = await register(s, "먼저"),
      b = await register(s, "나중", "female");
    const first = a.body.player.id,
      second = b.body.player.id,
      now = Date.now();
    await seed(s, second, "fish_041", now - 100);
    await seed(s, first, "fish_042", now - 500);
    await runInDurableObject(s, (o) => o.settle(now));
    const initial = await runInDurableObject(s, (o) => o.db.ranking());
    expect(initial.map((r) => r.id)).toEqual([first, second]);
    expect(initial[1].gender).toBe("female");
    await place(s, first, MAP.shop.x, MAP.shop.y);
    const inv = await runInDurableObject(
      s,
      (o) => o.db.private(first, now).inventory,
    );
    expect(
      (
        await command(s, first, {
          type: "sell",
          ids: [inv[0].id],
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(true);
    await seed(s, first, "fish_043", now - 1);
    await runInDurableObject(s, (o) => o.settle(now));
    const rank = await runInDurableObject(s, (o) => o.db.ranking());
    expect(rank[0]).toEqual(initial[0]);
    expect(
      (await runInDurableObject(s, (o) => o.db.private(first, now))).bestiary,
    ).toHaveLength(2);
  });
  it("prevents double sale, locked sales, negative purchases and out of range shop use", async () => {
    const s = stub(),
      a = await register(s);
    const id = a.body.player.id,
      now = Date.now();
    expect(
      (
        await command(s, id, {
          type: "buyBait",
          bait: "worm",
          quantity: 1,
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);
    await place(s, id, MAP.shop.x, MAP.shop.y);
    expect(
      (
        await command(s, id, {
          type: "buyBait",
          bait: "worm",
          quantity: 1000,
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);
    await seed(s, id, "fish_001", now - 1);
    await runInDurableObject(s, (o) => o.settle());
    const inv = (
      await runInDurableObject(s, (o) => o.db.private(id, Date.now()))
    ).inventory[0];
    await command(s, id, {
      type: "lock",
      id: inv.id,
      locked: true,
      commandId: crypto.randomUUID(),
    });
    expect(
      (
        await command(s, id, {
          type: "sell",
          ids: [inv.id],
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);
    await command(s, id, {
      type: "lock",
      id: inv.id,
      locked: false,
      commandId: crypto.randomUUID(),
    });
    const results = await Promise.all([
      command(s, id, {
        type: "sell",
        ids: [inv.id],
        commandId: crypto.randomUUID(),
      }),
      command(s, id, {
        type: "sell",
        ids: [inv.id],
        commandId: crypto.randomUUID(),
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(
      (await runInDurableObject(s, (o) => o.db.private(id, Date.now()))).coins,
    ).toBe(120);
  });
  it("one sabotage wins immediately, no refund, no fish after alarm; offline victim stays targetable", async () => {
    const s = stub(),
      a = await register(s, "대상"),
      b = await register(s, "발차기"),
      c = await register(s, "방해꾼");
    const victim = a.body.player.id,
      bid = b.body.player.id,
      cid = c.body.player.id;
    await place(s, victim, TEST_SPOT.x, TEST_SPOT.y, TEST_SPOT.direction);
    await command(s, victim, { type: "cast", commandId: crypto.randomUUID() });
    await runInDurableObject(s, (o) =>
      o.db.exec(
        "UPDATE active_casts SET started_at=? WHERE player_id=?",
        Date.now() - 2000,
        victim,
      ),
    );
    await place(s, bid, TEST_SPOT.x + 68, TEST_SPOT.y, "left");
    await place(s, cid, TEST_SPOT.x + 58, TEST_SPOT.y + 20, "left");
    const r = await Promise.all([
      command(s, bid, {
        type: "sabotage",
        target: victim,
        commandId: crypto.randomUUID(),
      }),
      command(s, cid, {
        type: "sabotage",
        target: victim,
        commandId: crypto.randomUUID(),
      }),
    ]);
    expect(r.filter((v) => v.ok)).toHaveLength(1);
    const check = await runInDurableObject(s, (o) => {
      o.db.exec(
        "UPDATE active_casts SET due_at=? WHERE player_id=?",
        Date.now() - 100,
        victim,
      );
      o.settle();
      return {
        v: o.db.private(victim, Date.now()),
        b: o.db.private(bid, Date.now()),
        c: o.db.private(cid, Date.now()),
        cast: o.db.one<{ status: string }>(
          "SELECT status FROM active_casts WHERE player_id=?",
          victim,
        ),
      };
    });
    expect(check.cast?.status).toBe("CANCELLED_BY_SABOTAGE");
    expect(check.v.baits.worm).toBe(19);
    expect(check.v.inventory).toHaveLength(0);
    expect(check.b.charges + check.c.charges).toBe(6);
    expect(check.v.rank).toBeNull();
    const standing = await runInDurableObject(s, (o) => {
      const p = o.current(victim);
      return o.normalize({
        ...p,
        motion: "startled",
        stateAt: Date.now() - 1600,
      });
    });
    expect(standing.motion).toBe("idle");
    expect(standing.castStartedAt).toBeUndefined();
  });
  it("late sabotage settles due fish first and consumes no charge", async () => {
    const s = stub(),
      a = await register(s, "잡는이"),
      b = await register(s, "늦은이");
    await place(s, b.body.player.id, TEST_SPOT.x + 58, TEST_SPOT.y, "left");
    await seed(s, a.body.player.id, "fish_001", Date.now() - 5);
    await runInDurableObject(s, (o) => o.settle());
    const result = await command(s, b.body.player.id, {
      type: "sabotage",
      target: a.body.player.id,
      commandId: crypto.randomUUID(),
    });
    expect(result.ok).toBe(false);
    expect(
      (
        await runInDurableObject(s, (o) =>
          o.db.private(b.body.player.id, Date.now()),
        )
      ).charges,
    ).toBe(3);
    expect(
      (
        await runInDurableObject(s, (o) =>
          o.db.private(a.body.player.id, Date.now()),
        )
      ).inventory,
    ).toHaveLength(1);
  });
  it("free refill is atomic and cannot be repeated while bait remains", async () => {
    const s = stub(),
      a = await register(s);
    const id = a.body.player.id;
    await place(s, id, MAP.shop.x, MAP.shop.y);
    await runInDurableObject(s, (o) => {
      o.db.exec("UPDATE players SET coins=0 WHERE id=?", id);
      o.db.exec("UPDATE player_baits SET quantity=0 WHERE player_id=?", id);
    });
    const r = await Promise.all([
      command(s, id, { type: "refill", commandId: crypto.randomUUID() }),
      command(s, id, { type: "refill", commandId: crypto.randomUUID() }),
    ]);
    expect(r.filter((v) => v.ok)).toHaveLength(1);
    expect(
      (await runInDurableObject(s, (o) => o.db.private(id, Date.now()))).baits
        .worm,
    ).toBe(3);
  });
  it("saves hibernatable socket attachment, shares true peers and replaces duplicate connection", async () => {
    const s = stub(),
      a = await register(s, "소켓남"),
      b = await register(s, "소켓녀", "female");
    const wa = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: a.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    wa.accept();
    const wb = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: b.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    wb.accept();
    const connected = await runInDurableObject(s, (o, ctx) => ({
      n: ctx.getWebSockets().length,
      players: o.players(),
    }));
    expect(connected.n).toBe(2);
    expect(connected.players.map((p) => p.name)).toContain("소켓녀");
    const wc = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: a.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    wc.accept();
    expect(
      await runInDurableObject(
        s,
        (o) =>
          o.socketFor(a.body.player.id)?.deserializeAttachment().hash.length,
      ),
    ).toBe(64);
    wa.close();
    wb.close();
    wc.close();
  });
  it("derives diagonal facing on the server and shares it with peers and hibernation attachments", async () => {
    const s = stub(),
      a = await register(s, "대각남"),
      b = await register(s, "대각녀", "female");
    await place(s, a.body.player.id, MAP.shop.x, MAP.shop.y);
    const wa = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: a.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    wa.accept();
    const wb = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: b.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    wb.accept();
    const shared = new Promise<PublicPlayer>((resolve) =>
      wb.addEventListener("message", (event) => {
        const msg = JSON.parse(String(event.data));
        const p = msg.players?.find(
          (p: PublicPlayer) =>
            p.id === a.body.player.id && p.facing === "down-left",
        );
        if (p) resolve(p);
      }),
    );
    const result = await runInDurableObject(s, (o) => {
      const ws = o.socketFor(a.body.player.id)!,
        attachment = o.attachment(ws),
        now = Date.now();
      attachment.lastMove = now - 100;
      ws.serializeAttachment(attachment);
      o.onMove(ws, { seq: 1, dx: -1, dy: 1, direction: "right" }, now);
      const moving = o.attachment(ws).player;
      expect(moving.x).toBeLessThan(MAP.shop.x);
      expect(moving.y).toBeGreaterThan(MAP.shop.y);
      expect(moving.facing).toBe("down-left");
      expect(moving.direction).toBe("down");
      o.onMove(ws, { seq: 2, dx: 0, dy: 0, direction: "down" }, now + 100);
      return o.attachment(ws).player;
    });
    expect(result.facing).toBe("down-left");
    expect(result.motion).toBe("idle");
    expect((await shared).facing).toBe("down-left");
    wa.close();
    wb.close();
  });
});

describe("recovery and protocol edges", () => {
  it("unlimited kicks leave legacy charge and recharge data untouched", async () => {
    const s = stub(),
      a = await register(s, "충전자"),
      b = await register(s, "대상자");
    const id = a.body.player.id,
      target = b.body.player.id,
      now = Date.now();
    await place(s, id, TEST_SPOT.x + 68, TEST_SPOT.y, "left");
    await seed(s, target, "fish_001", now + 10000);
    await runInDurableObject(s, (o) => {
      o.db.exec(
        "UPDATE sabotage_state SET charges=2,next_recharge_at=? WHERE player_id=?",
        now + 100000,
        id,
      );
    });
    expect(
      (
        await command(s, id, {
          type: "sabotage",
          target,
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(true);
    const after = await runInDurableObject(s, (o) => o.db.private(id, now));
    expect(after.charges).toBe(2);
    expect(after.nextRechargeAt).toBe(now + 100000);
    expect(
      (
        await runInDurableObject(s, (o) =>
          o.db.private(id, now + 100000 + 3600000),
        )
      ).charges,
    ).toBe(3);
  });
  it("an offline cast reserves the chair until cancellation", async () => {
    const s = stub(),
      a = await register(s, "예약자"),
      b = await register(s, "앉는이");
    await place(s, a.body.player.id, TEST_SPOT.x, TEST_SPOT.y);
    await place(s, b.body.player.id, TEST_SPOT.x, TEST_SPOT.y + 20);
    expect(
      (
        await command(s, a.body.player.id, {
          type: "cast",
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await command(s, b.body.player.id, {
          type: "sit",
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);
    await command(s, a.body.player.id, {
      type: "cancel",
      commandId: crypto.randomUUID(),
    });
    expect(
      (
        await command(s, b.body.player.id, {
          type: "sit",
          commandId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(true);
  });
  it("rejects later commands on an already open socket after session expiry", async () => {
    const s = stub(),
      a = await register(s, "만료자");
    const ws = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: a.cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    ws.accept();
    await runInDurableObject(s, (o) =>
      o.db.exec(
        "UPDATE sessions SET expires_at=0 WHERE player_id=?",
        a.body.player.id,
      ),
    );
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener("close", (e) => resolve(e.code)),
    );
    ws.send(JSON.stringify({ type: "sit", commandId: crypto.randomUUID() }));
    expect(await closed).toBe(4003);
    expect(
      (await runInDurableObject(s, (o) => o.db.player(a.body.player.id)))
        .motion,
    ).toBe("idle");
  });
});

it("sells all unlocked inventory atomically beyond the visible bag page and preserves locked fish", async () => {
  const s = stub(),
    a = await register(s, "대량판매");
  const id = a.body.player.id;
  await place(s, id, MAP.shop.x, MAP.shop.y);
  await runInDurableObject(s, (o) =>
    o.db.tx(() => {
      for (let i = 0; i < 501; i++)
        o.db.exec(
          "INSERT INTO fish_inventory(id,player_id,fish_id,catch_id,locked,sold) VALUES(?,?,?,?,?,0)",
          crypto.randomUUID(),
          id,
          "fish_001",
          i + 1,
          i === 0 ? 1 : 0,
        );
    }),
  );
  const before = await runInDurableObject(s, (o) =>
    o.db.private(id, Date.now()),
  );
  expect(before.inventory).toHaveLength(500);
  expect(before.inventoryTotals).toEqual({
    count: 501,
    unlockedCount: 500,
    unlockedValue: 10000,
  });
  const cmd: Command = { type: "sellAll", commandId: crypto.randomUUID() };
  expect((await command(s, id, cmd)).ok).toBe(true);
  expect((await command(s, id, cmd)).ok).toBe(true);
  const after = await runInDurableObject(s, (o) =>
    o.db.private(id, Date.now()),
  );
  expect(after.coins).toBe(10100);
  expect(after.inventory).toHaveLength(1);
  expect(after.inventory[0].locked).toBe(1);
});

it.each(["fish_031", "fish_041"])(
  "broadcasts confirmed rare catch %s with its player name to both sockets once",
  async (fishId) => {
    const s = stub(),
      a = await register(s, "희귀포획"),
      b = await register(s, "관찰자");
    const connect = async (cookie: string) => {
      const ws = (
        await s.fetch(`${origin}/ws`, {
          headers: { Cookie: cookie, Origin: origin, Upgrade: "websocket" },
        })
      ).webSocket!;
      ws.accept();
      return ws;
    };
    const wa = await connect(a.cookie),
      wb = await connect(b.cookie);
    const caught = (ws: WebSocket) =>
      new Promise<any>((resolve) =>
        ws.addEventListener("message", (e) => {
          const m = JSON.parse(String(e.data));
          if (m.type === "caught") resolve(m);
        }),
      );
    const pa = caught(wa),
      pb = caught(wb);
    await seed(s, a.body.player.id, fishId, Date.now() - 100);
    await runInDurableObject(s, (o) => o.settle());
    const [ea, eb] = await Promise.all([pa, pb]);
    expect(ea).toEqual(eb);
    expect(ea.playerName).toBe("희귀포획");
    expect(ea.fishId).toBe(fishId);
    await runInDurableObject(s, (o) => o.settle());
    expect(
      (
        await runInDurableObject(s, (o) =>
          o.db.private(a.body.player.id, Date.now()),
        )
      ).inventory,
    ).toHaveLength(1);
    wa.close();
    wb.close();
  },
);
it("uses elapsed input time despite packet bunching while bounding forged movement time", async () => {
  const s = stub(),
    a = await register(s, "입력시간");
  const client = (
    await s.fetch(`${origin}/ws`, {
      headers: { Cookie: a.cookie, Origin: origin, Upgrade: "websocket" },
    })
  ).webSocket!;
  client.accept();
  const result = await runInDurableObject(s, (o, ctx) => {
    const ws = ctx.getWebSockets()[0],
      now = Date.now();
    const start = o.attachment(ws).player;
    o.onMove(ws, { seq: 1, dx: -1, dy: 0, direction: "left", dtMs: 50 }, now);
    o.onMove(
      ws,
      { seq: 2, dx: -1, dy: 0, direction: "left", dtMs: 50 },
      now + 1,
    );
    const after = o.attachment(ws).player;
    for (let seq = 3; seq < 50; seq++)
      o.onMove(
        ws,
        { seq, dx: -1, dy: 0, direction: "left", dtMs: 150 },
        now + 2,
      );
    return { start, after, final: o.attachment(ws).player };
  });
  expect(result.start.x - result.after.x).toBeCloseTo(22, 1);
  expect(result.start.x - result.final.x).toBeLessThanOrEqual(55.5);
  client.close();
});

it("shares chat with canonical identity, enforces cooldown after reconnect and never changes inventory", async () => {
  const s = stub(),
    a = await register(s, "채팅남"),
    b = await register(s, "채팅여", "female");
  const connect = async (cookie: string) => {
    const ws = (
      await s.fetch(`${origin}/ws`, {
        headers: { Cookie: cookie, Origin: origin, Upgrade: "websocket" },
      })
    ).webSocket!;
    ws.accept();
    return ws;
  };
  const wa = await connect(a.cookie),
    wb = await connect(b.cookie);
  const receive = (ws: WebSocket, type: string) =>
    new Promise<any>((resolve) =>
      ws.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === type) resolve(m);
      }),
    );
  const pa = receive(wa, "chat"),
    pb = receive(wb, "chat");
  wa.send(JSON.stringify({ type: "chat", text: "  안녕하세요!  " }));
  const [ma, mb] = await Promise.all([pa, pb]);
  expect(ma).toEqual(mb);
  expect(ma.playerId).toBe(a.body.player.id);
  expect(ma.name).toBe("채팅남");
  expect(ma.text).toBe("안녕하세요!");
  expect(ma.id).toBeTruthy();
  const error = receive(wa, "chat-error");
  wa.send(JSON.stringify({ type: "chat", text: "너무 빠른 메시지" }));
  expect((await error).error).toContain("잠시");
  const later = await connect(a.cookie);
  const cooldown = await runInDurableObject(s, (o) => {
    const ws = o.socketFor(a.body.player.id)!;
    try {
      o.onChat(ws, { type: "chat", text: "재접속 우회" }, ma.at + 500);
      return false;
    } catch {
      return true;
    }
  });
  expect(cooldown).toBe(true);
  const p = await runInDurableObject(s, (o) =>
    o.db.private(a.body.player.id, Date.now()),
  );
  expect(p.coins).toBe(100);
  expect(p.baits.worm).toBe(20);
  expect(p.inventory).toHaveLength(0);
  wa.close();
  wb.close();
  later.close();
});
