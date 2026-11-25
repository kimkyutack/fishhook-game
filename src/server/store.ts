import type { BaitId } from "../config/balance";
import { BALANCE } from "../config/balance";
import { fishById } from "../shared/catalog";
import type { Direction } from "../config/map";
import type {
  Motion,
  PublicPlayer,
  PrivatePlayer,
  Rank,
  Feed,
} from "../shared/protocol";
import { recharge } from "../shared/rules";
export interface PlayerRow {
  id: string;
  name: string;
  name_key: string;
  gender: "male" | "female";
  coins: number;
  rod: number;
  bait: BaitId;
  x: number;
  y: number;
  direction: Direction;
  motion: Motion;
  state_at: number;
  protected_until: number;
  share_at: number;
  created_at: number;
}
export interface CastRow {
  id: string;
  player_id: string;
  fish_id: string;
  rod: number;
  bait: BaitId;
  started_at: number;
  due_at: number;
  status: string;
  x: number;
  y: number;
  direction: Direction;
  water_x: number;
  water_y: number;
  cast_order: number;
}
export class Store {
  constructor(public storage: DurableObjectStorage) {
    this.sql = storage.sql;
  }
  sql: SqlStorage;
  all<T extends Record<string, SqlStorageValue>>(
    q: string,
    ...p: SqlStorageValue[]
  ) {
    return this.sql.exec<T>(q, ...p).toArray();
  }
  one<T>(q: string, ...p: SqlStorageValue[]): T | undefined {
    return this.sql.exec(q, ...p).toArray()[0] as T | undefined;
  }
  exec(q: string, ...p: SqlStorageValue[]) {
    this.sql.exec(q, ...p);
  }
  tx<T>(f: () => T) {
    return this.storage.transactionSync(f);
  }
  init() {
    this.sql.exec(`
 CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);
 INSERT OR IGNORE INTO schema_migrations VALUES(1);
 CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,gender TEXT NOT NULL,coins INTEGER NOT NULL CHECK(coins>=0),rod INTEGER NOT NULL,bait TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,direction TEXT NOT NULL,motion TEXT NOT NULL,state_at INTEGER NOT NULL,protected_until INTEGER NOT NULL DEFAULT 0,share_at INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,player_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS session_player ON sessions(player_id);
 CREATE TABLE IF NOT EXISTS player_rods(player_id TEXT NOT NULL,rod INTEGER NOT NULL,PRIMARY KEY(player_id,rod));
 CREATE TABLE IF NOT EXISTS player_baits(player_id TEXT NOT NULL,bait TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),PRIMARY KEY(player_id,bait));
 CREATE TABLE IF NOT EXISTS sabotage_state(player_id TEXT PRIMARY KEY,charges INTEGER NOT NULL CHECK(charges BETWEEN 0 AND 3),next_recharge_at INTEGER);
 CREATE TABLE IF NOT EXISTS active_casts(cast_order INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,player_id TEXT NOT NULL,fish_id TEXT NOT NULL,rod INTEGER NOT NULL,bait TEXT NOT NULL,started_at INTEGER NOT NULL,due_at INTEGER NOT NULL,status TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,direction TEXT NOT NULL,water_x REAL NOT NULL,water_y REAL NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_cast ON active_casts(player_id) WHERE status='ACTIVE';
 CREATE INDEX IF NOT EXISTS cast_due ON active_casts(status,due_at,cast_order);
 CREATE TABLE IF NOT EXISTS catches(sequence INTEGER PRIMARY KEY AUTOINCREMENT,cast_id TEXT NOT NULL UNIQUE,player_id TEXT NOT NULL,fish_id TEXT NOT NULL,star INTEGER NOT NULL,caught_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS fish_inventory(id TEXT PRIMARY KEY,player_id TEXT NOT NULL,fish_id TEXT NOT NULL,catch_id INTEGER NOT NULL UNIQUE,locked INTEGER NOT NULL DEFAULT 0,sold INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS inventory_player ON fish_inventory(player_id,sold);
 CREATE TABLE IF NOT EXISTS player_bestiary(player_id TEXT NOT NULL,fish_id TEXT NOT NULL,first_catch INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(player_id,fish_id));
 CREATE TABLE IF NOT EXISTS best_records(player_id TEXT PRIMARY KEY,fish_id TEXT NOT NULL,star INTEGER NOT NULL,caught_at INTEGER NOT NULL,sequence INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS processed_commands(player_id TEXT NOT NULL,command_id TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(player_id,command_id));
 CREATE TABLE IF NOT EXISTS recent_feed(id INTEGER PRIMARY KEY AUTOINCREMENT,player_id TEXT NOT NULL,fish_id TEXT NOT NULL,at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS request_limits(key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
 `);
  }
  player(id: string) {
    return this.one<PlayerRow>("SELECT * FROM players WHERE id=?", id)!;
  }
  active(id: string) {
    return this.one<CastRow>(
      "SELECT * FROM active_casts WHERE player_id=? AND status='ACTIVE'",
      id,
    );
  }
  savePosition(p: PublicPlayer) {
    this.exec(
      "UPDATE players SET x=?,y=?,direction=?,motion=?,state_at=? WHERE id=?",
      p.x,
      p.y,
      p.direction,
      p.motion,
      p.stateAt,
      p.id,
    );
  }
  public(id: string, online = false): PublicPlayer {
    const p = this.player(id),
      c = this.active(id),
      best = this.one<{ fishId: string; star: number }>(
        "SELECT fish_id AS fishId,star FROM best_records WHERE player_id=?",
        id,
      );
    return {
      id: p.id,
      name: p.name,
      gender: p.gender,
      x: c?.x ?? p.x,
      y: c?.y ?? p.y,
      direction: c?.direction ?? p.direction,
      motion: c ? "fishing_wait" : p.motion,
      stateAt: c?.started_at ?? p.state_at,
      ...(c ? { castStartedAt: c.started_at } : {}),
      protectedUntil: p.protected_until,
      rod: p.rod,
      online,
      seq: 0,
      ...(best ? { best } : {}),
    };
  }
  charges(id: string, now: number) {
    const s = this.one<{ charges: number; next_recharge_at: number | null }>(
      "SELECT * FROM sabotage_state WHERE player_id=?",
      id,
    )!;
    const r = recharge(s.charges, s.next_recharge_at, now);
    this.exec(
      "UPDATE sabotage_state SET charges=?,next_recharge_at=? WHERE player_id=?",
      r.charges,
      r.next,
      id,
    );
    return r;
  }
  private(id: string, now: number): PrivatePlayer {
    const p = this.player(id),
      s = this.charges(id, now);
    const totals = this.all<{ fish_id: string; locked: number; n: number }>(
      "SELECT fish_id,locked,COUNT(*) AS n FROM fish_inventory WHERE player_id=? AND sold=0 GROUP BY fish_id,locked",
      id,
    ).reduce(
      (a, r) => ({
        count: a.count + r.n,
        unlockedCount: a.unlockedCount + (r.locked ? 0 : r.n),
        unlockedValue:
          a.unlockedValue +
          (r.locked ? 0 : r.n * fishById(r.fish_id).sellPrice),
      }),
      { count: 0, unlockedCount: 0, unlockedValue: 0 },
    );
    return {
      id: p.id,
      name: p.name,
      gender: p.gender,
      coins: p.coins,
      rod: p.rod,
      bait: p.bait,
      rods: this.all<{ rod: number }>(
        "SELECT rod FROM player_rods WHERE player_id=?",
        id,
      ).map((r) => r.rod),
      baits: Object.fromEntries(
        this.all<{ bait: string; quantity: number }>(
          "SELECT bait,quantity FROM player_baits WHERE player_id=?",
          id,
        ).map((r) => [r.bait, r.quantity]),
      ) as Record<BaitId, number>,
      charges: s.charges,
      nextRechargeAt: s.next,
      inventoryTotals: totals,
      inventory: this.all<{
        id: string;
        fishId: string;
        catchId: number;
        locked: number;
      }>(
        "SELECT id,fish_id AS fishId,catch_id AS catchId,locked FROM fish_inventory WHERE player_id=? AND sold=0 ORDER BY catch_id DESC LIMIT 500",
        id,
      ),
      bestiary: this.all<{ fishId: string; count: number; catchId: number }>(
        "SELECT fish_id AS fishId,count,first_catch AS catchId FROM player_bestiary WHERE player_id=?",
        id,
      ),
      rank:
        this.one<{ rank: number }>(
          "SELECT rank FROM (SELECT player_id,ROW_NUMBER() OVER(ORDER BY star DESC,caught_at,sequence) AS rank FROM best_records) WHERE player_id=?",
          id,
        )?.rank ?? null,
    };
  }
  ranking(): Rank[] {
    return this.all<{
      id: string;
      name: string;
      fishId: string;
      star: number;
      caughtAt: number;
      sequence: number;
    }>(
      "SELECT p.id,p.name,b.fish_id AS fishId,b.star,b.caught_at AS caughtAt,b.sequence FROM best_records b JOIN players p ON p.id=b.player_id ORDER BY b.star DESC,b.caught_at,b.sequence LIMIT 20",
    );
  }
  feed(): Feed[] {
    return this.all<{
      id: number;
      playerId: string;
      name: string;
      fishId: string;
      at: number;
    }>(
      "SELECT f.id,f.player_id AS playerId,p.name,f.fish_id AS fishId,f.at FROM recent_feed f JOIN players p ON p.id=f.player_id ORDER BY f.id DESC LIMIT 20",
    );
  }
  addFeed(id: string, fishId: string, now: number) {
    this.exec(
      "INSERT INTO recent_feed(player_id,fish_id,at) VALUES(?,?,?)",
      id,
      fishId,
      now,
    );
    this.exec(
      "DELETE FROM recent_feed WHERE id NOT IN (SELECT id FROM recent_feed ORDER BY id DESC LIMIT 20)",
    );
  }
  complete(now: number) {
    return this.tx(() => {
      const due = this.sql
        .exec(
          "SELECT * FROM active_casts WHERE status='ACTIVE' AND due_at<=? ORDER BY due_at,cast_order",
          now,
        )
        .toArray() as unknown as CastRow[];
      const events = [];
      for (const c of due) {
        const f = fishById(c.fish_id);
        this.exec(
          "UPDATE active_casts SET status='COMPLETED' WHERE id=? AND status='ACTIVE'",
          c.id,
        );
        this.exec(
          "INSERT INTO catches(cast_id,player_id,fish_id,star,caught_at) VALUES(?,?,?,?,?)",
          c.id,
          c.player_id,
          f.id,
          f.star,
          c.due_at,
        );
        const sequence = this.one<{ sequence: number }>(
          "SELECT sequence FROM catches WHERE cast_id=?",
          c.id,
        )!.sequence;
        this.exec(
          "INSERT INTO fish_inventory(id,player_id,fish_id,catch_id) VALUES(?,?,?,?)",
          crypto.randomUUID(),
          c.player_id,
          f.id,
          sequence,
        );
        this.exec(
          "INSERT INTO player_bestiary VALUES(?,?,?,1) ON CONFLICT(player_id,fish_id) DO UPDATE SET count=count+1",
          c.player_id,
          f.id,
          sequence,
        );
        this.exec(
          "INSERT INTO best_records VALUES(?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET fish_id=excluded.fish_id,star=excluded.star,caught_at=excluded.caught_at,sequence=excluded.sequence WHERE excluded.star>best_records.star",
          c.player_id,
          f.id,
          f.star,
          c.due_at,
          sequence,
        );
        this.exec(
          "UPDATE players SET motion='seated_idle',state_at=? WHERE id=?",
          c.due_at,
          c.player_id,
        );
        this.addFeed(c.player_id, f.id, c.due_at);
        events.push({
          type: "caught" as const,
          playerId: c.player_id,
          fishId: f.id,
          catchId: sequence,
          at: c.due_at,
        });
      }
      return events;
    });
  }
  prune(now: number) {
    this.exec("DELETE FROM sessions WHERE expires_at<?", now);
    this.exec(
      "DELETE FROM processed_commands WHERE created_at<?",
      now - BALANCE.sessionMs,
    );
    this.exec("DELETE FROM request_limits WHERE window<?", now - 86400_000);
  }
}
