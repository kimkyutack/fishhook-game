import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Phaser from "phaser";
import { WorldScene } from "../game/WorldScene";
import { connection, gameStore, serverTime } from "../network/store";
import { actionFor } from "../../shared/interaction";
import { recharge } from "../../shared/rules";
import { BAITS } from "../../config/balance";
import { fishById } from "../../shared/catalog";
import { FishImage, Icon, Stars } from "./Art";
import { Inventory } from "./Inventory";
export function Game() {
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.get),
    host = useRef<HTMLDivElement>(null),
    scene = useRef<WorldScene | null>(null);
  const [modal, setModal] = useState<"bag" | "shop" | null>(null),
    [rankOpen, setRankOpen] = useState(true),
    [profile, setProfile] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [, tick] = useState(0);
  const self = state.self!,
    me = state.players.find((p) => p.id === self.id),
    now = serverTime(),
    action = actionFor(me, state.players, now),
    charges = recharge(self.charges, self.nextRechargeAt, now);
  const actions = useRef({
    primary: () => {},
    inventory: () => {},
    profile: (id: string) => {
      void id;
    },
  });
  actions.current = {
    primary() {
      if (modal) return;
      if (action.type === "shop") setModal("shop");
      else if (action.type === "cast") connection.command({ type: "cast" });
      else if (action.type === "sabotage")
        connection.command({ type: "sabotage", target: action.target! });
      else if (action.type === "sit") connection.command({ type: "sit" });
    },
    inventory: () => setModal((v) => (v ? null : "bag")),
    profile: setProfile,
  };
  useEffect(() => {
    if (!host.current) return;
    const s = (scene.current = new WorldScene());
    s.primary = () => actions.current.primary();
    s.inventory = () => actions.current.inventory();
    s.profile = (id) => actions.current.profile(id);
    s.onReady = () => setLoaded(true);
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: host.current.clientWidth,
      height: host.current.clientHeight,
      backgroundColor: "#91b870",
      scene: s,
      render: { antialias: true, pixelArt: false },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
    });
    return () => {
      g.destroy(true);
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    if (scene.current) {
      scene.current.blocked = !!modal || !!profile || state.status !== "online";
      if (modal || profile) {
        scene.current.keys.clear();
        connection.move(0, 0, scene.current.direction);
      }
    }
  }, [modal, profile, state.status]);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal || profile) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setModal(null);
          setProfile(null);
        }
      }
      if (
        modal &&
        e.key.toLowerCase() === "i" &&
        !/INPUT|SELECT/.test((e.target as HTMLElement).tagName)
      ) {
        e.stopImmediatePropagation();
        setModal(null);
      }
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [modal, profile]);
  useEffect(() => {
    if (!state.error) return;
    const id = setTimeout(() => gameStore.set({ error: null }), 5500);
    return () => clearTimeout(id);
  }, [state.error]);
  const other = state.players.find((p) => p.id === profile),
    best =
      state.ranking.find((r) => r.id === profile) ??
      (other?.best ? { ...other.best, name: other.name } : undefined);
  return (
    <main className="game-shell">
      <div className="world" ref={host} />
      <div className="game-brand">
        물가마을<span>{state.players.filter((p) => p.online).length}명</span>
      </div>
      <header className="hud panel">
        <strong>{self.name}</strong>
        <span>
          <Icon id="coin" />
          {self.coins.toLocaleString()}
        </span>
        <span>
          <Icon id={`rod_${self.rod}`} />
          {self.rod}단계
        </span>
        <span>
          <Icon id={self.bait} />
          {self.baits[self.bait]}
        </span>
        <span className="charges" aria-label={`방해 ${charges.charges}회`}>
          {[0, 1, 2].map((i) => (
            <img
              key={i}
              className={i >= charges.charges ? "spent" : ""}
              src={`/assets/equipment/charge.png`}
              alt=""
            />
          ))}
        </span>
        {charges.next && (
          <small>{Math.ceil((charges.next - now) / 60000)}분</small>
        )}
      </header>
      <aside className={`ranking panel ${rankOpen ? "" : "collapsed"}`}>
        <button
          className="rank-heading"
          onClick={() => setRankOpen(!rankOpen)}
          aria-expanded={rankOpen}
        >
          <Icon id="star" />
          순위<span>{rankOpen ? "−" : "+"}</span>
        </button>
        {rankOpen && (
          <>
            <ol>
              {state.ranking.map((r, i) => (
                <li key={r.id} className={r.id === self.id ? "mine" : ""}>
                  <button onClick={() => setProfile(r.id)}>
                    <b>{i + 1}</b>
                    <div>
                      <strong>{r.name}</strong>
                      <Stars star={r.star} />
                      <small>{fishById(r.fishId).name}</small>
                    </div>
                    <FishImage id={r.fishId} />
                  </button>
                </li>
              ))}
            </ol>
            {!state.ranking.length && (
              <p className="rank-empty">첫 포획을 기다려요.</p>
            )}
            <div className="my-rank">
              내 순위 <strong>{self.rank ? `${self.rank}위` : "미기록"}</strong>
            </div>
          </>
        )}
      </aside>
      <aside className="feed" aria-label="최근 포획">
        {state.feed.slice(0, 4).map((f) => (
          <div className="feed-item panel" key={f.id}>
            <FishImage id={f.fishId} />
            <div>
              <strong>{f.name}</strong>
              <span>{fishById(f.fishId).name}</span>
              <Stars star={fishById(f.fishId).star} />
            </div>
          </div>
        ))}
      </aside>
      <div className="bottom-controls">
        <button
          className="chair-button"
          title="앉기 / 일어서기 (C)"
          disabled={state.status !== "online"}
          onClick={() => connection.command({ type: "sit" })}
        >
          <Icon id="chair_down" size={34} />
          <kbd>C</kbd>
        </button>
        <button
          className="action primary"
          disabled={
            action.type === "none" ||
            !!modal ||
            state.status !== "online" ||
            (action.type === "cast" && !self.baits[self.bait]) ||
            (action.type === "sabotage" && !charges.charges)
          }
          onClick={() => actions.current.primary()}
        >
          <Icon
            id={
              action.type === "sabotage"
                ? "charge"
                : action.type === "shop"
                  ? "shop"
                  : `rod_${self.rod}`
            }
            size={38}
          />
          {action.type === "cast" && !self.baits[self.bait]
            ? "미끼 부족"
            : action.label}
          <kbd>Space</kbd>
        </button>
      </div>
      <button className="bag-button" onClick={() => setModal("bag")}>
        <Icon id="bag" size={42} />
        가방 <kbd>I</kbd>
      </button>
      <div className="key-guide">방향키 이동</div>
      {!loaded && (
        <div className="loading-screen panel">마을을 준비하고 있어요…</div>
      )}
      {state.status !== "online" && (
        <div className="connection-state panel" role="status">
          {state.status === "replaced"
            ? "다른 창에서 접속했습니다."
            : state.status === "expired"
              ? "세션이 만료되었습니다."
              : state.status === "reconnecting"
                ? "다시 연결 중…"
                : "월드에 접속 중…"}
        </div>
      )}
      {state.error && (
        <div className="toast panel" role="alert">
          {state.error}
        </div>
      )}
      {modal && (
        <Inventory
          self={self}
          me={me}
          shop={modal === "shop"}
          onClose={() => setModal(null)}
        />
      )}
      {profile && (
        <div className="modal-backdrop" onPointerDown={() => setProfile(null)}>
          <div
            className="profile panel"
            role="dialog"
            aria-label="플레이어 기록"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="close-profile"
              onClick={() => setProfile(null)}
              aria-label="닫기"
            >
              <Icon id="close" />
            </button>
            <h2>{best?.name ?? other?.name ?? "낚시꾼"}</h2>
            {best ? (
              <>
                <FishImage id={best.fishId} />
                <Stars star={best.star} />
                <h3>{fishById(best.fishId).name}</h3>
              </>
            ) : (
              <p>아직 최고 기록이 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
