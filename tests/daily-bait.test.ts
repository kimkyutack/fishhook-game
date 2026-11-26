import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GameWorldDO } from "../src/server/world";
import { Store } from "../src/server/store";
import { SPOTS } from "../src/config/map";
import {
  dailyBaitPeriod,
  DAILY_BAIT_PERIOD_MS as DAY,
} from "../src/shared/daily-bait";

const origin = "https://game.test";
async function account(s: DurableObjectStub<GameWorldDO>, name = "매일미끼") {
  const response = await s.fetch(`${origin}/api/register`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ name, gender: "male" }),
  });
  const body = (await response.json()) as {
    player: { id: string; baits: { worm: number } };
  };
  expect(response.status).toBe(200);
  return {
    id: body.player.id,
    baits: body.player.baits,
    cookie: response.headers.get("Set-Cookie")!.split(";")[0],
  };
}

describe("daily worm supply at 09:00 Korea time", () => {
  it("crosses the period exactly at 09:00 KST, independent of runtime timezone", () => {
    const at = Date.parse("2026-11-26T09:00:00+09:00");
    expect(dailyBaitPeriod(at - 1) + 1).toBe(dailyBaitPeriod(at));
    expect(dailyBaitPeriod(at + DAY - 1)).toBe(dailyBaitPeriod(at));
  });
  it("preserves starter bait and schedules the first grant for the next 09:00", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s);
    expect(a.baits.worm).toBe(20);
    await runInDurableObject(s, async (o, ctx) => {
      const row = o.db.one<{ last_period: number }>(
        "SELECT last_period FROM daily_bait_grants WHERE player_id=?",
        a.id,
      )!;
      expect(row.last_period).toBe(dailyBaitPeriod(Date.now()));
      expect(await ctx.storage.getAlarm()).toBe((row.last_period + 1) * DAY);
    });
  });
  it("adds 20 only at the boundary and cannot double grant after retry or reinitialization", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s);
    await runInDurableObject(s, (o, ctx) => {
      const next = (dailyBaitPeriod(Date.now()) + 1) * DAY;
      expect(o.db.grantDailyBait(next - 1)).toBe(0);
      expect(o.db.grantDailyBait(next)).toBe(1);
      expect(o.db.grantDailyBait(next)).toBe(0);
      const reopened = new Store(ctx.storage);
      reopened.init();
      expect(reopened.grantDailyBait(next + 1)).toBe(0);
      expect(reopened.private(a.id, next).baits.worm).toBe(40);
    });
  });
  it("accumulates offline days for every account without crediting premium bait", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s, "누적하나"),
      b = await account(s, "누적둘");
    await runInDurableObject(s, (o) => {
      const after = (dailyBaitPeriod(Date.now()) + 3) * DAY;
      o.db.exec(
        "UPDATE player_baits SET quantity=7 WHERE player_id=? AND bait='mix'",
        a.id,
      );
      expect(o.db.grantDailyBait(after)).toBe(2);
      expect(o.db.private(a.id, after).baits.worm).toBe(80);
      expect(o.db.private(b.id, after).baits.worm).toBe(80);
      expect(o.db.private(a.id, after).baits.mix).toBe(7);
      expect(o.db.private(a.id, after).coins).toBe(100);
      expect(o.db.grantDailyBait(after + 1000)).toBe(0);
    });
  });
  it("starts legacy accounts at activation rather than awarding their entire account history", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s);
    await runInDurableObject(s, (o) => {
      o.db.exec("DELETE FROM daily_bait_grants WHERE player_id=?", a.id);
      o.db.exec("UPDATE players SET created_at=0 WHERE id=?", a.id);
      o.db.init();
      expect(o.db.grantDailyBait(Date.now())).toBe(0);
      expect(o.db.private(a.id, Date.now()).baits.worm).toBe(20);
    });
  });
  it("pushes the new quantity to online players from the daily alarm and reschedules", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s);
    const response = await s.fetch(`${origin}/ws`, {
      headers: { Origin: origin, Cookie: a.cookie, Upgrade: "websocket" },
    });
    const socket = response.webSocket!;
    socket.accept();
    const supplied = new Promise<any>((resolve) =>
      socket.addEventListener("message", (e) => {
        const m = JSON.parse(String(e.data));
        if (m.type === "snapshot" && m.self.baits.worm === 40) resolve(m);
      }),
    );
    await runInDurableObject(s, async (o, ctx) => {
      const period = dailyBaitPeriod(Date.now());
      o.db.exec(
        "UPDATE daily_bait_grants SET last_period=? WHERE player_id=?",
        period - 1,
        a.id,
      );
      await o.alarm();
      expect(await ctx.storage.getAlarm()).toBe((period + 1) * DAY);
      await o.alarm();
      expect(o.db.private(a.id, Date.now()).baits.worm).toBe(40);
    });
    expect((await supplied).self.baits.worm).toBe(40);
    socket.close();
  });
  it("keeps the earlier fishing completion alarm instead of replacing it with tomorrow's grant", async () => {
    const s = env.GAME_WORLD.getByName(crypto.randomUUID());
    const a = await account(s);
    await runInDurableObject(s, async (o, ctx) => {
      const now = Date.now(),
        spot = SPOTS[0];
      o.setPlayer({
        ...o.current(a.id),
        x: spot.x,
        y: spot.y,
        direction: spot.direction,
        motion: "idle",
        stateAt: now - 5000,
      });
      expect(
        o.execute(a.id, { type: "cast", commandId: crypto.randomUUID() }, now)
          .ok,
      ).toBe(true);
      const due = o.db.active(a.id)!.due_at;
      await o.schedule();
      expect(await ctx.storage.getAlarm()).toBe(
        Math.min(due, (dailyBaitPeriod(now) + 1) * DAY),
      );
    });
  });
});
