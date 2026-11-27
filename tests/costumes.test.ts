import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GameWorldDO } from "../src/server/world";
import {
  CommandSchema,
  type Command,
  type PrivatePlayer,
} from "../src/shared/protocol";
import { MAP, SPOTS } from "../src/config/map";
import { COSTUME_PRICE, costumePortrait } from "../src/shared/costumes";

async function account(gender: "male" | "female" = "male", coins = 10000) {
  const world = env.GAME_WORLD.getByName(crypto.randomUUID());
  const response = await world.fetch("https://game.test/api/register", {
    method: "POST",
    headers: {
      Origin: "https://game.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `외형${crypto.randomUUID().slice(0, 6)}`,
      gender,
    }),
  });
  const { player } = (await response.json()) as { player: PrivatePlayer };
  const id = player.id;
  await runInDurableObject(world, (o) =>
    o.db.exec(
      "UPDATE players SET coins=?,x=?,y=? WHERE id=?",
      coins,
      MAP.shop.x,
      MAP.shop.y,
      id,
    ),
  );
  const send = (cmd: Command) =>
    runInDurableObject(world, (o) => o.execute(id, cmd, Date.now()));
  const state = () =>
    runInDurableObject(world, (o) => o.db.private(id, Date.now()));
  return { world, id, send, state, player };
}
const buy = (costume: "duck" | "office" | "santa"): Command => ({
  type: "buyCostume",
  costume,
  commandId: crypto.randomUUID(),
});
const equip = (costume: "default" | "duck" | "office" | "santa"): Command => ({
  type: "equipCostume",
  costume,
  commandId: crypto.randomUUID(),
});

describe("server-owned costumes", () => {
  it("migrates existing accounts without changing their balance, identity or equipment", async () => {
    const a = await account("female", 4321);
    await runInDurableObject(a.world, (o) => {
      o.db.exec("DROP TABLE player_costumes");
      o.db.exec("ALTER TABLE players DROP COLUMN costume");
      o.db.exec("DELETE FROM schema_migrations WHERE version=5");
      o.db.init();
    });
    expect(await a.state()).toMatchObject({
      id: a.id,
      name: a.player.name,
      gender: "female",
      coins: 4321,
      rods: [1],
      costume: "default",
      costumes: ["default"],
    });
  });
  it.each(["male", "female"] as const)(
    "charges exactly 3000 for all %s costumes, keeps ownership and permits return to default",
    async (gender) => {
      const a = await account(gender);
      expect(a.player.costume).toBe("default");
      expect(a.player.costumes).toEqual(["default"]);
      for (const costume of ["duck", "office", "santa"] as const) {
        const command = buy(costume);
        expect((await a.send(command)).ok).toBe(true);
        expect((await a.send(command)).ok).toBe(true); // retry cannot debit twice
        expect((await a.send(equip(costume))).ok).toBe(true);
        const self = await a.state();
        expect(self.costumes).toContain(costume);
        expect(self.costume).toBe(costume);
        expect(costumePortrait(self.gender, self.costume)).toBe(
          `costumes/${gender}_${costume}_portrait.png`,
        );
      }
      expect((await a.state()).coins).toBe(10000 - COSTUME_PRICE * 3);
      await runInDurableObject(a.world, (o) => o.db.init());
      expect((await a.state()).costume).toBe("santa");
      expect((await a.state()).costumes).toHaveLength(4);
      expect((await a.send(equip("default"))).ok).toBe(true);
      expect((await a.state()).costume).toBe("default");
    },
  );
  it("rejects unowned equip, insufficient funds, duplicate ownership and purchases away from shop without losing money", async () => {
    const a = await account("male", 3000);
    expect((await a.send(equip("santa"))).ok).toBe(false);
    expect((await a.send(buy("duck"))).ok).toBe(true);
    expect((await a.send(buy("duck"))).ok).toBe(false);
    expect((await a.send(buy("office"))).ok).toBe(false);
    expect((await a.state()).coins).toBe(0);
    expect((await a.state()).costumes).toEqual(["default", "duck"]);
    await runInDurableObject(a.world, (o) =>
      o.db.exec(
        "UPDATE players SET coins=9000,x=?,y=? WHERE id=?",
        MAP.spawn.x,
        MAP.spawn.y,
        a.id,
      ),
    );
    expect((await a.send(buy("santa"))).ok).toBe(false);
    expect((await a.state()).coins).toBe(9000);
  });
  it("ignores forged price and gender; rejects unknown and gender-qualified asset IDs", async () => {
    const a = await account();
    const command = CommandSchema.parse({
      ...buy("office"),
      price: 1,
      gender: "female",
    });
    expect((await a.send(command)).ok).toBe(true);
    expect(await a.state()).toMatchObject({ coins: 7000, gender: "male" });
    for (const costume of ["female_duck", "free", "default"])
      expect(CommandSchema.safeParse({ ...buy("duck"), costume }).success).toBe(
        false,
      );
  });
  it("keeps active fishing intact when an equip attempt is rejected", async () => {
    const a = await account();
    await a.send(buy("duck"));
    await runInDurableObject(a.world, (o) => {
      const spot = SPOTS[0];
      o.db.exec(
        "INSERT INTO active_casts(id,player_id,fish_id,rod,bait,started_at,due_at,status,x,y,direction,water_x,water_y) VALUES(?,?,?,1,'worm',?,?,'ACTIVE',?,?,?,?,?)",
        crypto.randomUUID(),
        a.id,
        "fish_001",
        Date.now(),
        Date.now() + 60000,
        spot.x,
        spot.y,
        spot.direction,
        spot.water.x,
        spot.water.y,
      );
    });
    expect((await a.send(equip("duck"))).ok).toBe(false);
    expect((await a.state()).costume).toBe("default");
    expect(
      await runInDurableObject(a.world, (o) => o.db.active(a.id)?.status),
    ).toBe("ACTIVE");
  });
});
