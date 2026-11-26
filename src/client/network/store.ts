import type { ChatMessage } from "../../shared/chat";
import { fishById } from "../../shared/catalog";
import type {
  Snapshot,
  PublicPlayer,
  PrivatePlayer,
  Rank,
  Feed,
  Command,
  Event,
} from "../../shared/protocol";
export interface CatchNotice {
  catchId: number;
  playerName: string;
  fishId: string;
  at: number;
}
export interface ClientState {
  catchNotices: CatchNotice[];
  chat: ChatMessage[];
  chatError: string | null;
  status:
    | "loading"
    | "login"
    | "connecting"
    | "online"
    | "reconnecting"
    | "replaced"
    | "expired";
  self: PrivatePlayer | null;
  players: PublicPlayer[];
  ranking: Rank[];
  feed: Feed[];
  offset: number;
  error: string | null;
  event: Event | null;
}
type CommandInput = Command extends infer T
  ? T extends Command
    ? Omit<T, "commandId">
    : never
  : never;
let state: ClientState = {
  catchNotices: [],
  chat: [],
  chatError: null,
  status: "loading",
  self: null,
  players: [],
  ranking: [],
  feed: [],
  offset: 0,
  error: null,
  event: null,
};
const listeners = new Set<() => void>();
export const gameStore = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  set(p: Partial<ClientState>) {
    state = { ...state, ...p };
    listeners.forEach((f) => f());
  },
};
export class Connection {
  ws: WebSocket | null = null;
  stopped = false;
  attempt = 0;
  retry: ReturnType<typeof setTimeout> | null = null;
  refresh: ReturnType<typeof setInterval> | null = null;
  pending = new Map<string, Command>();
  seq = 0;
  async boot() {
    try {
      const r = await fetch("/api/session", { credentials: "same-origin" });
      if (r.status === 401) {
        gameStore.set({ status: "login" });
        return;
      }
      if (!r.ok) throw Error("서버에 연결하지 못했습니다.");
      const { player } = (await r.json()) as { player: PrivatePlayer };
      gameStore.set({ self: player });
      this.connect();
      this.refresh = setInterval(() => this.renew(), 10 * 60_000);
    } catch (e) {
      gameStore.set({ status: "login", error: String(e) });
    }
  }
  async register(name: string, gender: "male" | "female") {
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender }),
    });
    const data = (await r.json()) as { player: PrivatePlayer; error?: string };
    if (!r.ok) throw Error(data.error);
    gameStore.set({ self: data.player });
    this.connect();
    this.refresh = setInterval(() => this.renew(), 10 * 60_000);
  }
  async renew() {
    try {
      const r = await fetch("/api/session");
      if (r.status === 401) {
        this.stopped = true;
        this.ws?.close();
        gameStore.set({
          status: "expired",
          error: "세션이 만료되었습니다. 새로고침해 주세요.",
        });
      }
    } catch {
      /* reconnect handles network failure */
    }
  }
  connect() {
    if (this.stopped) return;
    gameStore.set({ status: this.attempt ? "reconnecting" : "connecting" });
    const ws = (this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    ));
    ws.onopen = () => {
      this.attempt = 0;
      gameStore.set({ status: "online", error: null });
      for (const cmd of this.pending.values()) ws.send(JSON.stringify(cmd));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.serverNow) gameStore.set({ offset: m.serverNow - Date.now() });
      if (m.type === "snapshot") {
        const s = m as Snapshot;
        gameStore.set({
          self: s.self,
          players: s.players,
          ranking: s.ranking,
          feed: s.feed,
          status: "online",
        });
        const own = s.players.find((p) => p.id === s.self.id);
        if (own) this.seq = Math.max(this.seq, own.seq);
      } else if (m.type === "chat") {
        const old = gameStore.get().chat;
        if (!old.some((c) => c.id === m.id))
          gameStore.set({
            chat: [...old, m as ChatMessage].slice(-40),
            chatError: null,
          });
      } else if (m.type === "chat-error") gameStore.set({ chatError: m.error });
      else if (m.type === "players") gameStore.set({ players: m.players });
      else if (m.type === "delta") {
        const map = new Map(gameStore.get().players.map((p) => [p.id, p]));
        for (const p of m.players) map.set(p.id, p);
        gameStore.set({ players: [...map.values()] });
      } else if (m.type === "ack") {
        this.pending.delete(m.commandId);
        if (!m.ok) gameStore.set({ error: m.error });
      } else if (m.type === "error")
        gameStore.set({
          error: "입력을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      else if (m.type === "caught" || m.type === "sabotaged") {
        const current = gameStore.get();
        const rare = m.type === "caught" && fishById(m.fishId).star >= 4;
        const notices =
          rare && !current.catchNotices.some((n) => n.catchId === m.catchId)
            ? [
                ...current.catchNotices,
                {
                  catchId: m.catchId,
                  fishId: m.fishId,
                  at: m.at,
                  playerName:
                    m.playerName ??
                    current.players.find((p) => p.id === m.playerId)?.name ??
                    "낚시꾼",
                },
              ].slice(-30)
            : current.catchNotices;
        gameStore.set({ event: m, catchNotices: notices });
      }
    };
    ws.onclose = (e) => {
      if (this.stopped) return;
      if (e.code === 4001 || e.code === 4003) {
        this.stopped = true;
        this.pending.clear();
        gameStore.set({
          status: e.code === 4001 ? "replaced" : "expired",
          error: e.reason,
        });
        return;
      }
      gameStore.set({ status: "reconnecting" });
      this.retry = setTimeout(
        () => this.connect(),
        Math.min(15000, 700 * 2 ** this.attempt++) + Math.random() * 300,
      );
    };
    ws.onerror = () => {
      gameStore.set({ error: "접속이 지연되거나 월드가 가득 찼습니다." });
    };
  }
  command(command: CommandInput) {
    if (
      this.ws?.readyState !== WebSocket.OPEN ||
      gameStore.get().status !== "online"
    )
      return;
    const cmd = { ...command, commandId: crypto.randomUUID() } as Command;
    this.pending.set(cmd.commandId, cmd);
    this.ws.send(JSON.stringify(cmd));
  }
  move(
    dx: number,
    dy: number,
    direction: PublicPlayer["direction"],
    dtMs?: number,
  ) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(
        JSON.stringify({
          type: "move",
          seq: ++this.seq,
          dx,
          dy,
          direction,
          dtMs,
        }),
      );
    return this.ws?.readyState === WebSocket.OPEN ? this.seq : 0;
  }
  sendChat(text: string) {
    if (
      this.ws?.readyState !== WebSocket.OPEN ||
      gameStore.get().status !== "online"
    )
      return false;
    gameStore.set({ chatError: null });
    this.ws.send(JSON.stringify({ type: "chat", text }));
    return true;
  }
  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.refresh) clearInterval(this.refresh);
    this.ws?.close();
  }
}
export const connection = new Connection();
export const serverTime = () => Date.now() + gameStore.get().offset;
