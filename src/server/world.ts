import { fishingAim } from "../shared/fishing";
import { ChatSchema } from "../shared/chat-schema";
import type { ChatMessage } from "../shared/chat";
import { DurableObject } from "cloudflare:workers";
import { Store, type PlayerRow } from "./store";
import { BALANCE, BAITS, RODS } from "../config/balance";
import {
  MAP,
  distance,
  move,
  walkable,
  vectors,
  type Direction,
} from "../config/map";
import { normalizeName, drawFish } from "../shared/rules";
import { fishById } from "../shared/catalog";
import {
  CommandSchema,
  MoveSchema,
  type Command,
  type PublicPlayer,
  type Event,
} from "../shared/protocol";
import { targetFor, motionBusy } from "../shared/interaction";
import { movementFacing, cardinalDirection } from "../shared/movement";
import { KNOCKDOWN_MS, GET_UP_MS, KICK_ANIMATION_MS } from "../shared/kick";
import { dailyBaitPeriod, DAILY_BAIT_PERIOD_MS } from "../shared/daily-bait";
import { COSTUME_PRICE } from "../shared/costumes";
interface Attachment {
  id: string;
  hash: string;
  player: PublicPlayer;
  lastMove: number;
  moveCredit?: number;
  window: number;
  count: number;
}
type Result = { ok: boolean; error?: string; type?: string };
function fail(s: string): never {
  throw Error(s);
}
async function hash(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bytes), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function cookie(value: string, secure: boolean) {
  return `waterside_session=${value}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Path=/; Max-Age=${BALANCE.sessionMs / 1000}`;
}
export class GameWorldDO extends DurableObject<Env> {
  db: Store;
  dirty = new Map<string, PublicPlayer>();
  flushTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new Store(ctx.storage);
    ctx.blockConcurrencyWhile(async () => {
      this.db.init();
      if ((await ctx.storage.getAlarm()) === null) await this.schedule();
    });
  }
  sockets() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1);
  }
  attachment(ws: WebSocket) {
    return ws.deserializeAttachment() as Attachment;
  }
  socketFor(id: string) {
    return this.sockets().find((s) => this.attachment(s).id === id);
  }
  normalize(p: PublicPlayer) {
    const age = Date.now() - p.stateAt;
    if (
      (p.motion === "sit_down" && age > 430) ||
      (p.motion === "reel_in" && age > 750)
    )
      return { ...p, motion: "seated_idle" as const };
    if (
      (p.motion === "kick" && age >= KICK_ANIMATION_MS) ||
      (p.motion === "startled" && age >= KNOCKDOWN_MS) ||
      (p.motion === "fallen" && age >= KNOCKDOWN_MS + GET_UP_MS)
    )
      return { ...p, motion: "idle" as const };
    if (p.motion === "run" && age > 1050)
      return { ...p, motion: "idle" as const };
    return p;
  }
  current(id: string) {
    const ws = this.socketFor(id);
    return this.normalize(
      ws ? this.attachment(ws).player : this.db.public(id, false),
    );
  }
  players() {
    const list = new Map<string, PublicPlayer>();
    for (const ws of this.sockets()) {
      const a = this.attachment(ws);
      list.set(a.id, a.player);
    }
    for (const c of this.db.sql
      .exec("SELECT player_id FROM active_casts WHERE status='ACTIVE'")
      .toArray()) {
      const id = String(c.player_id);
      if (!list.has(id)) list.set(id, this.db.public(id));
    }
    return [...list.values()].map((p) => this.normalize(p));
  }
  setPlayer(p: PublicPlayer, save = true) {
    this.dirty.delete(p.id);
    if (save) this.db.savePosition(p);
    const ws = this.socketFor(p.id);
    if (ws) {
      const a = this.attachment(ws);
      a.player = p;
      ws.serializeAttachment(a);
    }
    return p;
  }
  broadcast(data: unknown) {
    const text = JSON.stringify(data);
    for (const ws of this.sockets()) {
      try {
        ws.send(text);
      } catch {
        /* close callback cleans membership */
      }
    }
  }
  snapshot(ws: WebSocket) {
    const a = this.attachment(ws);
    try {
      ws.send(
        JSON.stringify({
          type: "snapshot",
          serverNow: Date.now(),
          self: this.db.private(a.id, Date.now()),
          players: this.players(),
          ranking: this.db.ranking(),
          feed: this.db.feed(),
        }),
      );
    } catch {
      /* disconnected */
    }
  }
  snapshots() {
    for (const ws of this.sockets()) this.snapshot(ws);
  }
  settle(now = Date.now()) {
    const dailyGrants = this.db.grantDailyBait(now);
    const events = this.db.complete(now);
    for (const e of events) {
      const p = this.current(e.playerId);
      p.motion = "reel_in";
      p.stateAt = e.at;
      p.best = this.db.public(e.playerId).best;
      delete p.castStartedAt;
      this.setPlayer(p, false);
      this.broadcast({ ...e, playerName: p.name });
    }
    return events.length + dailyGrants;
  }
  async schedule() {
    // synchronous SQL decision followed by the storage promise, with no intervening await
    const castDue = this.db.one<{ due: number | null }>(
      "SELECT MIN(due_at) AS due FROM active_casts WHERE status='ACTIVE'",
    )?.due;
    const daily = this.db.one<{ period: number | null }>(
      "SELECT MIN(last_period) AS period FROM daily_bait_grants",
    )?.period;
    const next = Math.min(
      castDue ?? Infinity,
      daily == null ? Infinity : (daily + 1) * DAILY_BAIT_PERIOD_MS,
    );
    if (Number.isFinite(next))
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    this.settle();
    await this.schedule();
    this.snapshots();
  }
  async session(request: Request) {
    const value = request.headers
      .get("Cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("waterside_session="))
      ?.slice(18);
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
    const h = await hash(value);
    const s = this.db.one<{ player_id: string; expires_at: number }>(
      "SELECT * FROM sessions WHERE token_hash=?",
      h,
    );
    return s && s.expires_at > Date.now()
      ? { id: s.player_id, hash: h, value }
      : null;
  }
  async fetch(request: Request) {
    try {
      const url = new URL(request.url);
      const now = Date.now();
      const origin = request.headers.get("Origin");
      if (
        (origin && origin !== url.origin) ||
        ((request.method === "POST" || url.pathname === "/ws") && !origin)
      )
        return Response.json(
          { error: "같은 주소에서 접속해 주세요." },
          { status: 403 },
        );
      if (this.settle(now)) {
        await this.schedule();
        this.snapshots();
      }
      if (url.pathname === "/api/name") {
        const { key } = normalizeName(url.searchParams.get("name") ?? "");
        return Response.json(
          {
            available: !this.db.one(
              "SELECT id FROM players WHERE name_key=?",
              key,
            ),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (url.pathname === "/api/register" && request.method === "POST") {
        const body = await this.body(request);
        if (
          typeof body.name !== "string" ||
          !["male", "female"].includes(String(body.gender))
        )
          fail("이름과 캐릭터를 선택해 주세요.");
        const normalized = normalizeName(body.name as string),
          secret = token(),
          h = await hash(secret),
          id = crypto.randomUUID();
        const existing = await this.session(request);
        if (existing)
          return Response.json(
            { error: "이미 로그인되어 있습니다." },
            { status: 409 },
          );
        this.db.tx(() => {
          const ip = request.headers.get("CF-Connecting-IP") ?? "local";
          const key = `register:${ip}`,
            limit = this.db.one<{ window: number; count: number }>(
              "SELECT * FROM request_limits WHERE key=?",
              key,
            );
          if (limit && now - limit.window < 3600_000 && limit.count >= 100)
            fail("잠시 후 다시 시도해 주세요.");
          this.db.exec(
            "INSERT INTO request_limits VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN ?-window>=3600000 THEN 1 ELSE count+1 END,window=CASE WHEN ?-window>=3600000 THEN ? ELSE window END",
            key,
            now,
            now,
            now,
            now,
          );
          if (
            this.db.one(
              "SELECT id FROM players WHERE name_key=?",
              normalized.key,
            )
          )
            fail("이미 사용 중인 이름입니다.");
          const candidate = {
            x: MAP.spawn.x + ((parseInt(id.slice(0, 2), 16) % 4) - 1.5) * 38,
            y:
              MAP.spawn.y +
              (Math.floor(parseInt(id.slice(0, 2), 16) / 4) % 4) * 20 -
              30,
          };
          const spawn = walkable(candidate) ? candidate : MAP.spawn;
          this.db.exec(
            "INSERT INTO players(id,name,name_key,gender,coins,rod,bait,x,y,direction,motion,state_at,created_at) VALUES(?,?,?,?,?,1,'worm',?,?,'down','idle',?,?)",
            id,
            normalized.name,
            normalized.key,
            String(body.gender),
            BALANCE.starterCoins,
            spawn.x,
            spawn.y,
            now,
            now,
          );
          this.db.exec(
            "INSERT INTO sessions VALUES(?,?,?)",
            h,
            id,
            now + BALANCE.sessionMs,
          );
          this.db.exec("INSERT INTO player_rods VALUES(?,1)", id);
          for (const b of BAITS)
            this.db.exec(
              "INSERT INTO player_baits VALUES(?,?,?)",
              id,
              b.id,
              b.id === "worm" ? BALANCE.starterBait : 0,
            );
          this.db.exec("INSERT INTO sabotage_state VALUES(?,3,NULL)", id);
          this.db.exec(
            "INSERT INTO daily_bait_grants VALUES(?,?)",
            id,
            dailyBaitPeriod(now),
          );
        });
        await this.schedule();
        return Response.json(
          { player: this.db.private(id, now) },
          {
            headers: {
              "Set-Cookie": cookie(secret, url.protocol === "https:"),
              "Cache-Control": "no-store",
            },
          },
        );
      }
      const auth = await this.session(request);
      if (!auth)
        return Response.json(
          { error: "다시 입장해 주세요." },
          { status: 401, headers: { "Cache-Control": "no-store" } },
        );
      if (url.pathname === "/api/session") {
        this.db.exec(
          "UPDATE sessions SET expires_at=? WHERE token_hash=?",
          now + BALANCE.sessionMs,
          auth.hash,
        );
        this.db.prune(now);
        return Response.json(
          { player: this.db.private(auth.id, now) },
          {
            headers: {
              "Set-Cookie": cookie(auth.value, url.protocol === "https:"),
              "Cache-Control": "no-store",
            },
          },
        );
      }
      if (url.pathname === "/ws") {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return new Response("WebSocket required", { status: 426 });
        const old = this.socketFor(auth.id);
        if (!old && this.sockets().length >= BALANCE.maxPlayers)
          return Response.json(
            { error: "월드가 가득 찼습니다. 잠시 후 다시 접속해 주세요." },
            { status: 503 },
          );
        let p = old
          ? this.attachment(old).player
          : this.db.public(auth.id, true);
        if (!walkable(p)) {
          p = { ...this.db.public(auth.id, true), ...MAP.spawn };
          this.db.savePosition(p);
        }
        if (old) {
          this.db.savePosition(p);
          old.close(4001, "다른 창에서 접속했습니다.");
        }
        p = { ...p, online: true };
        if (
          !this.db.active(auth.id) &&
          !old &&
          !["fallen", "startled"].includes(p.motion)
        ) {
          p.motion = "idle";
          p.stateAt = now;
        }
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({
          id: auth.id,
          hash: auth.hash,
          player: p,
          lastMove: now - 100,
          window: now,
          count: 0,
        } satisfies Attachment);
        this.snapshot(pair[1]);
        this.broadcast({
          type: "players",
          players: this.players(),
          serverNow: now,
        });
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      return Response.json({ error: "없는 경로입니다." }, { status: 404 });
    } catch (e) {
      return Response.json(
        {
          error: e instanceof Error ? e.message : "요청을 처리하지 못했습니다.",
        },
        { status: 400 },
      );
    }
  }
  async body(request: Request): Promise<Record<string, unknown>> {
    if (Number(request.headers.get("Content-Length")) > 8192)
      fail("요청이 너무 큽니다.");
    const text = await request.text();
    if (text.length > 8192) fail("요청이 너무 큽니다.");
    return JSON.parse(text);
  }
  valid(ws: WebSocket) {
    const a = this.attachment(ws);
    const row = this.db.one<{ expires_at: number }>(
      "SELECT expires_at FROM sessions WHERE token_hash=? AND player_id=?",
      a.hash,
      a.id,
    );
    if (!row || row.expires_at <= Date.now()) {
      ws.close(4003, "세션이 만료되었습니다.");
      return false;
    }
    return this.socketFor(a.id) === ws;
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.valid(ws)) return;
    try {
      if (typeof message !== "string" || message.length > 8192)
        fail("잘못된 메시지입니다.");
      const now = Date.now(),
        a = this.attachment(ws);
      if (now - a.window >= 1000) {
        a.window = now;
        a.count = 0;
      }
      if (++a.count > 35) {
        ws.serializeAttachment(a);
        fail("입력이 너무 빠릅니다.");
      }
      ws.serializeAttachment(a);
      const raw = JSON.parse(message);
      if (raw.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", serverNow: now }));
        return;
      }
      if (raw.type === "chat") {
        try {
          this.onChat(ws, raw, now);
        } catch (e) {
          ws.send(
            JSON.stringify({
              type: "chat-error",
              error:
                e instanceof Error ? e.message : "채팅을 보낼 수 없습니다.",
            }),
          );
        }
        return;
      }
      const settled = this.settle(now);
      if (raw.type === "move") {
        this.onMove(ws, MoveSchema.parse(raw), now);
        if (settled) {
          await this.schedule();
          this.snapshots();
        }
        return;
      }
      const cmd = CommandSchema.parse(raw);
      const result = this.execute(a.id, cmd, now);
      await this.schedule();
      ws.send(
        JSON.stringify({ ...result, type: "ack", commandId: cmd.commandId }),
      );
      this.snapshots();
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: "error",
          error: e instanceof Error ? e.message : "요청 오류",
        }),
      );
    }
  }
  onChat(ws: WebSocket, raw: unknown, now: number) {
    const parsed = ChatSchema.safeParse(raw);
    if (!parsed.success) fail("채팅은 1~100자로 입력해 주세요.");
    const a = this.attachment(ws),
      key = `chat:${a.id}`;
    const prior = this.db.one<{ window: number }>(
      "SELECT window FROM request_limits WHERE key=?",
      key,
    );
    if (prior && now - prior.window < 1200) fail("잠시 뒤에 다시 보내 주세요.");
    this.db.exec(
      "INSERT INTO request_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=1",
      key,
      now,
    );
    const message: ChatMessage = {
      type: "chat",
      id: crypto.randomUUID(),
      playerId: a.id,
      name: a.player.name,
      text: parsed.data!.text,
      at: now,
    };
    this.broadcast(message);
  }
  onMove(
    ws: WebSocket,
    m: {
      seq: number;
      dx: number;
      dy: number;
      direction: Direction;
      dtMs?: number;
    },
    now: number,
  ) {
    const a = this.attachment(ws);
    if (m.seq <= a.player.seq) return;
    if (!walkable(a.player))
      a.player = { ...this.db.public(a.id, true), seq: a.player.seq };
    const available = Math.min(
      250,
      (a.moveCredit ?? 150) + Math.max(0, now - a.lastMove),
    );
    const elapsed =
      m.dtMs === undefined
        ? Math.min(150, Math.max(0, now - a.lastMove))
        : Math.min(m.dtMs, available);
    a.moveCredit = available - elapsed;
    a.lastMove = now;
    a.player.seq = m.seq;
    if (motionBusy(a.player, now)) {
      ws.serializeAttachment(a);
      return;
    }
    const active = this.db.active(a.id);
    // A delayed key-release packet must not hide a still-active cast.
    if (!m.dx && !m.dy && active) {
      ws.serializeAttachment(a);
      return;
    }
    const cancelled =
      !!active && !!(m.dx || m.dy) && this.cancelForMovement(a.id, now);
    const norm = Math.max(1, Math.hypot(m.dx, m.dy)),
      speed = (BALANCE.speed * elapsed) / 1000;
    const next = move(a.player, (m.dx / norm) * speed, (m.dy / norm) * speed);
    const moved = Math.hypot(next.x - a.player.x, next.y - a.player.y) > 0.001;
    const facing = movementFacing(
      moved ? next.x - a.player.x : m.dx,
      moved ? next.y - a.player.y : m.dy,
      a.player.facing ?? a.player.direction,
    );
    a.player = {
      ...a.player,
      ...next,
      direction: cardinalDirection(m.dx, m.dy, m.direction),
      facing,
      motion: m.dx || m.dy ? "walk" : "idle",
      stateAt: now,
    };
    delete a.player.castStartedAt;
    delete a.player.castWater;
    ws.serializeAttachment(a);
    if (cancelled) this.snapshot(ws);
    if (!m.dx && !m.dy) this.db.savePosition(a.player);
    this.dirty.set(a.id, a.player);
    if (!this.flushTimer)
      this.flushTimer = setTimeout(() => {
        this.broadcast({
          type: "delta",
          players: [...this.dirty.values()],
          serverNow: Date.now(),
        });
        this.dirty.clear();
        this.flushTimer = null;
      }, 50);
    if (m.dx || m.dy) this.ctx.waitUntil(this.schedule());
  }
  cancelForMovement(id: string, now: number) {
    const cancelled = this.db.tx(() => {
      const cast = this.db.active(id);
      if (!cast) return false;
      this.db.exec(
        "UPDATE active_casts SET status='CANCELLED_BY_MOVEMENT' WHERE id=? AND status='ACTIVE'",
        cast.id,
      );
      this.db.exec(
        "UPDATE player_baits SET quantity=quantity+1 WHERE player_id=? AND bait=?",
        id,
        cast.bait,
      );
      return true;
    });
    if (cancelled) {
      const p = this.current(id);
      p.motion = "idle";
      p.stateAt = now;
      delete p.castStartedAt;
      this.setPlayer(p);
    }
    return cancelled;
  }
  execute(id: string, cmd: Command, now: number): Result {
    const prior = this.db.one<{ result: string }>(
      "SELECT result FROM processed_commands WHERE player_id=? AND command_id=?",
      id,
      cmd.commandId,
    );
    if (prior) return JSON.parse(prior.result);
    const events: Event[] = [];
    let updates: PublicPlayer[] = [];
    const result = this.db.tx(() => {
      let res: Result;
      try {
        // nested transaction rolls back failed domain operation
        res = this.db.tx(() => {
          const p = this.db.player(id),
            me = this.current(id);
          const active = this.db.active(id);
          const animationBusy = motionBusy(me, now);
          if (animationBusy) fail("동작이 끝난 뒤 다시 눌러 주세요.");
          const shop = () => {
            if (distance(me, MAP.shop) > BALANCE.interaction)
              fail("상점 앞으로 이동해 주세요.");
          };
          const availableChair = () => {
            if (!walkable(me) || distance(me, MAP.shop) < 50)
              fail("의자를 놓을 수 없습니다.");
            if (
              this.players().some(
                (other) =>
                  other.id !== id &&
                  (other.castStartedAt !== undefined ||
                    ["seated_idle", "sit_down", "reel_in", "startled"].includes(
                      other.motion,
                    )) &&
                  distance(me, other) < 48,
              )
            )
              fail("다른 의자와 너무 가깝습니다.");
          };
          if (cmd.type === "cast") {
            if (active) fail("이미 낚시 중입니다.");
            availableChair();
            const spot = fishingAim(me, me.facing ?? me.direction);
            if (!spot) fail("물가에서 물을 바라보고 낚시해 주세요.");
            const bait = this.db.one<{ quantity: number }>(
              "SELECT quantity FROM player_baits WHERE player_id=? AND bait=?",
              id,
              p.bait,
            );
            if (!bait?.quantity) fail("장착한 미끼가 없습니다.");
            const draw = drawFish(p.rod, p.bait, spot.habitat);
            this.db.exec(
              "UPDATE player_baits SET quantity=quantity-1 WHERE player_id=? AND bait=? AND quantity>0",
              id,
              p.bait,
            );
            this.db.exec(
              "INSERT INTO active_casts(id,player_id,fish_id,rod,bait,started_at,due_at,status,x,y,direction,water_x,water_y,facing) VALUES(?,?,?,?,?,?,?,'ACTIVE',?,?,?,?,?,?)",
              crypto.randomUUID(),
              id,
              draw.fish.id,
              p.rod,
              p.bait,
              now,
              now + draw.duration,
              me.x,
              me.y,
              spot.direction,
              spot.water.x,
              spot.water.y,
              spot.facing,
            );
            updates.push({
              ...me,
              motion: "cast",
              direction: spot.direction,
              facing: spot.facing,
              castWater: spot.water,
              stateAt: now,
              castStartedAt: now,
            });
          } else if (cmd.type === "cancel") {
            this.db.exec(
              "UPDATE active_casts SET status='CANCELLED' WHERE player_id=? AND status='ACTIVE'",
              id,
            );
            const q = { ...me, motion: "idle" as const, stateAt: now };
            delete q.castStartedAt;
            delete q.castWater;
            updates.push(q);
          } else if (cmd.type === "sit") {
            if (active) {
              this.db.exec(
                "UPDATE active_casts SET status='CANCELLED' WHERE player_id=? AND status='ACTIVE'",
                id,
              );
            } else availableChair();
            const q = {
              ...me,
              motion:
                me.motion === "seated_idle" || active
                  ? ("idle" as const)
                  : ("sit_down" as const),
              stateAt: now,
            };
            delete q.castStartedAt;
            delete q.castWater;
            updates.push(q);
          } else if (cmd.type === "kick" || cmd.type === "sabotage") {
            if (active) fail("낚시 중에는 발차기할 수 없습니다.");
            const target = targetFor(me, this.players(), now);
            if (cmd.target && (!target || target.id !== cmd.target))
              fail("정면에 발차기할 상대가 없습니다.");
            if (!target) {
              updates.push({ ...me, motion: "kick", stateAt: now });
            } else {
              const cast = this.db.active(target.id);
              if (cast && cast.due_at <= now) fail("이미 끝난 낚시입니다.");
              if (cast)
                this.db.exec(
                  "UPDATE active_casts SET status='CANCELLED_BY_SABOTAGE' WHERE id=? AND status='ACTIVE'",
                  cast.id,
                );
              const d = distance(me, target);
              const v = vectors[me.direction];
              const to = move(
                me,
                (d > 0 ? (me.x - target.x) / d : -v.x) * 96,
                (d > 0 ? (me.y - target.y) / d : -v.y) * 96,
              );
              const victim = {
                ...target,
                motion: cast ? ("startled" as const) : ("fallen" as const),
                stateAt: now,
                protectedUntil: 0,
              };
              delete victim.castStartedAt;
              delete victim.castWater;
              updates.push(victim, {
                ...me,
                ...to,
                direction: (
                  {
                    up: "down",
                    down: "up",
                    left: "right",
                    right: "left",
                  } as const
                )[me.direction],
                motion: "run",
                stateAt: now,
              });
              events.push({
                type: "sabotaged",
                attacker: id,
                target: target.id,
                at: now,
                from: { x: me.x, y: me.y },
                to,
              });
            }
          } else if (cmd.type === "buyCostume") {
            shop();
            if (
              this.db.one(
                "SELECT 1 FROM player_costumes WHERE player_id=? AND costume=?",
                id,
                cmd.costume,
              )
            )
              fail("이미 보유한 외형입니다.");
            if (p.coins < COSTUME_PRICE) fail("코인이 부족합니다.");
            this.db.exec(
              "UPDATE players SET coins=coins-? WHERE id=?",
              COSTUME_PRICE,
              id,
            );
            this.db.exec(
              "INSERT INTO player_costumes VALUES(?,?,?)",
              id,
              cmd.costume,
              now,
            );
          } else if (cmd.type === "equipCostume") {
            if (active) fail("낚시를 마친 뒤 외형을 바꿔 주세요.");
            if (
              cmd.costume !== "default" &&
              !this.db.one(
                "SELECT 1 FROM player_costumes WHERE player_id=? AND costume=?",
                id,
                cmd.costume,
              )
            )
              fail("보유하지 않은 외형입니다.");
            this.db.exec(
              "UPDATE players SET costume=? WHERE id=?",
              cmd.costume,
              id,
            );
            updates.push({ ...me, costume: cmd.costume });
          } else if (cmd.type === "buyRod") {
            shop();
            const rod = RODS[cmd.rod - 1];
            if (
              this.db.one(
                "SELECT rod FROM player_rods WHERE player_id=? AND rod=?",
                id,
                cmd.rod,
              )
            )
              fail("이미 보유한 낚싯대입니다.");
            if (
              cmd.rod === 3 &&
              !this.db.one(
                "SELECT rod FROM player_rods WHERE player_id=? AND rod=2",
                id,
              )
            )
              fail("숙련 낚싯대가 필요합니다.");
            if (p.coins < rod.price) fail("코인이 부족합니다.");
            this.db.exec(
              "UPDATE players SET coins=coins-? WHERE id=?",
              rod.price,
              id,
            );
            this.db.exec("INSERT INTO player_rods VALUES(?,?)", id, cmd.rod);
          } else if (cmd.type === "buyBait") {
            shop();
            const bait = BAITS.find((b) => b.id === cmd.bait)!;
            if (
              !this.db.one(
                "SELECT rod FROM player_rods WHERE player_id=? AND rod=?",
                id,
                bait.requires,
              )
            )
              fail("상위 낚싯대가 필요합니다.");
            const cost = bait.price * cmd.quantity;
            if (p.coins < cost) fail("코인이 부족합니다.");
            this.db.exec(
              "UPDATE players SET coins=coins-? WHERE id=?",
              cost,
              id,
            );
            this.db.exec(
              "UPDATE player_baits SET quantity=quantity+? WHERE player_id=? AND bait=?",
              cmd.quantity,
              id,
              cmd.bait,
            );
          } else if (cmd.type === "equip") {
            if (active) fail("낚시를 마친 뒤 장착해 주세요.");
            if (cmd.rod) {
              if (
                !this.db.one(
                  "SELECT rod FROM player_rods WHERE player_id=? AND rod=?",
                  id,
                  cmd.rod,
                )
              )
                fail("보유하지 않은 낚싯대입니다.");
              this.db.exec("UPDATE players SET rod=? WHERE id=?", cmd.rod, id);
              updates.push({ ...me, rod: cmd.rod });
            }
            if (cmd.bait) {
              if (
                !this.db.one<{ quantity: number }>(
                  "SELECT quantity FROM player_baits WHERE player_id=? AND bait=? AND quantity>0",
                  id,
                  cmd.bait,
                )
              )
                fail("보유한 미끼가 없습니다.");
              this.db.exec(
                "UPDATE players SET bait=? WHERE id=?",
                cmd.bait,
                id,
              );
            }
          } else if (cmd.type === "sell") {
            shop();
            const ids = [...new Set(cmd.ids)];
            if (!ids.length) fail("판매할 물고기를 선택해 주세요.");
            let total = 0;
            for (const inv of ids) {
              const row = this.db.one<{ fish_id: string; locked: number }>(
                "SELECT fish_id,locked FROM fish_inventory WHERE id=? AND player_id=? AND sold=0",
                inv,
                id,
              );
              if (!row || row.locked) fail("판매할 수 없는 물고기입니다.");
              total += fishById(row.fish_id).sellPrice;
            }
            for (const inv of ids)
              this.db.exec("UPDATE fish_inventory SET sold=1 WHERE id=?", inv);
            this.db.exec(
              "UPDATE players SET coins=coins+? WHERE id=?",
              total,
              id,
            );
          } else if (cmd.type === "sellAll") {
            shop();
            const rows = this.db.all<{ fish_id: string; n: number }>(
              "SELECT fish_id,COUNT(*) AS n FROM fish_inventory WHERE player_id=? AND sold=0 AND locked=0 GROUP BY fish_id",
              id,
            );
            const total = rows.reduce(
              (v, r) => v + fishById(r.fish_id).sellPrice * r.n,
              0,
            );
            if (!total) fail("판매할 물고기가 없습니다.");
            this.db.exec(
              "UPDATE fish_inventory SET sold=1 WHERE player_id=? AND sold=0 AND locked=0",
              id,
            );
            this.db.exec(
              "UPDATE players SET coins=coins+? WHERE id=?",
              total,
              id,
            );
          } else if (cmd.type === "lock") {
            if (
              !this.db.one(
                "SELECT id FROM fish_inventory WHERE id=? AND player_id=? AND sold=0",
                cmd.id,
                id,
              )
            )
              fail("보유 물고기가 아닙니다.");
            this.db.exec(
              "UPDATE fish_inventory SET locked=? WHERE id=?",
              Number(cmd.locked),
              cmd.id,
            );
          } else if (cmd.type === "refill") {
            shop();
            const b = this.db.one<{ n: number }>(
              "SELECT SUM(quantity) AS n FROM player_baits WHERE player_id=?",
              id,
            )!.n;
            const fish = this.db.one<{ n: number }>(
              "SELECT COUNT(*) AS n FROM fish_inventory WHERE player_id=? AND sold=0",
              id,
            )!.n;
            if (b > 0 || fish > 0 || p.coins >= 3)
              fail("미끼·물고기가 없고 코인이 3 미만일 때 보충됩니다.");
            this.db.exec(
              "UPDATE player_baits SET quantity=3 WHERE player_id=? AND bait='worm'",
              id,
            );
          } else if (cmd.type === "share") {
            if (now - p.share_at < BALANCE.shareCooldown)
              fail("자랑하기는 10초마다 가능합니다.");
            const caught = this.db.one<{ fish_id: string }>(
              "SELECT fish_id FROM catches WHERE sequence=? AND player_id=?",
              cmd.catchId,
              id,
            );
            if (!caught) fail("내 포획 기록이 아닙니다.");
            this.db.addFeed(id, caught.fish_id, now);
            this.db.exec("UPDATE players SET share_at=? WHERE id=?", now, id);
          }
          for (const update of updates) this.db.savePosition(update);
          return { ok: true, type: cmd.type };
        });
      } catch (e) {
        updates = [];
        events.length = 0;
        res = {
          ok: false,
          error: e instanceof Error ? e.message : "행동 실패",
        };
      }
      this.db.exec(
        "INSERT INTO processed_commands VALUES(?,?,?,?)",
        id,
        cmd.commandId,
        JSON.stringify(res),
        now,
      );
      return res;
    });
    for (const update of updates) this.setPlayer(update, false);
    for (const event of events) this.broadcast(event);
    return result;
  }
  async webSocketClose(ws: WebSocket, code: number) {
    const a = this.attachment(ws);
    if (!a) return;
    const current = this.socketFor(a.id);
    if (current && current !== ws) return;
    this.dirty.delete(a.id);
    this.db.savePosition(a.player);
    try {
      if (code !== 1006) ws.close(code === 1005 ? 1000 : code);
    } catch {}
    this.broadcast({
      type: "players",
      players: this.players()
        .filter((p) => p.id !== a.id || !!this.db.active(a.id))
        .map((p) => (p.id === a.id ? { ...p, online: false } : p)),
      serverNow: Date.now(),
    });
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws, 1006);
  }
}
