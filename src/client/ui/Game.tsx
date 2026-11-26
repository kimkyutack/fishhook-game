import { fishingAim, FISHING_ENDS } from "../../shared/fishing";
import { distance } from "../../config/map";
import { Chat } from "./Chat";
import { CatchAnnouncement } from "./CatchAnnouncement";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Phaser from "phaser";
import { WorldScene } from "../game/WorldScene";
import { connection, gameStore, serverTime } from "../network/store";
import { actionFor, motionBusy } from "../../shared/interaction";
import { BAITS } from "../../config/balance";
import { fishById, HABITAT_NAMES } from "../../shared/catalog";
import { FishImage, Icon, Stars, asset } from "./Art";
import { fishingSpot } from "../../config/map";
import { Inventory } from "./Inventory";
import { MiniMap } from "./MiniMap";
import type { MapView } from "../game/minimap";
export function Game() {
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.get),
    host = useRef<HTMLDivElement>(null),
    scene = useRef<WorldScene | null>(null);
  const [modal, setModal] = useState<"bag" | "shop" | null>(null),
    [rankOpen, setRankOpen] = useState(true),
    [profile, setProfile] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [chatFocused, setChatFocused] = useState(false),
    [mapView, setMapView] = useState<MapView | null>(null),
    [, tick] = useState(0);
  const chatFocus = useCallback((value: boolean) => setChatFocused(value), []);
  const self = state.self!,
    me = state.players.find((p) => p.id === self.id),
    now = serverTime(),
    action = actionFor(me, state.players, now),
    canAct = !me || !motionBusy(me, now);
  const actions = useRef({
    kick: () => {},
    fishing: () => {},
    inventory: () => {},
    profile: (id: string) => {
      void id;
    },
  });
  actions.current = {
    fishing() {
      if (modal || profile || !canAct || state.status !== "online") return;
      if (action.type === "shop") setModal("shop");
      else if (
        me &&
        me.castStartedAt === undefined &&
        self.baits[self.bait] > 0
      ) {
        const position = scene.current?.prediction ?? me;
        const facing = scene.current?.facing ?? me.facing ?? me.direction;
        if (!fishingAim(position, facing)) {
          gameStore.set({ error: "물가에서 물을 바라보고 낚시해 주세요." });
          return;
        }
        scene.current?.flushMovement();
        connection.command({ type: "cast" });
      }
    },
    kick() {
      if (
        modal ||
        profile ||
        chatFocused ||
        !me ||
        !canAct ||
        me.castStartedAt !== undefined ||
        state.status !== "online"
      )
        return;
      connection.command({ type: "kick" });
    },
    inventory: () => setModal((v) => (v ? null : "bag")),
    profile: (id) => {
      if (!modal && !profile && !chatFocused) setProfile(id);
    },
  };
  useEffect(() => {
    if (!host.current) return;
    const s = (scene.current = new WorldScene());
    s.kick = () => actions.current.kick();
    s.fishing = () => actions.current.fishing();
    s.inventory = () => actions.current.inventory();
    s.profile = (id) => actions.current.profile(id);
    s.onReady = () => setLoaded(true);
    s.onMapView = setMapView;
    const g = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: host.current.clientWidth,
      height: host.current.clientHeight,
      backgroundColor: "#368bd2",
      scene: s,
      render: { antialias: true, pixelArt: false },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      audio: { noAudio: true },
    });
    return () => {
      s.detach();
      g.destroy(true);
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    if (scene.current) {
      scene.current.blocked =
        !!modal || !!profile || chatFocused || state.status !== "online";
      if (scene.current.input)
        scene.current.input.enabled = !scene.current.blocked;
      if (modal || profile || chatFocused) {
        scene.current.keys.clear();
        connection.move(0, 0, scene.current.direction);
      }
    }
  }, [modal, profile, chatFocused, state.status]);
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
        e.code === "KeyI" &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
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
  const profileRank =
    profile === self.id
      ? self.rank
      : state.ranking.findIndex((r) => r.id === profile) + 1 || undefined;
  const spot = me ? fishingSpot(me) : undefined;
  const fishing = me?.castStartedAt !== undefined;
  const habitat = spot ? HABITAT_NAMES[spot.habitat] : "낚시터";
  return (
    <main className="game-shell">
      <div className="world" ref={host} />
      <button
        className="player-badge panel"
        aria-label="내 기록"
        onClick={() => setProfile(self.id)}
      >
        <img src={asset("characters", `${self.gender}_portrait`)} alt="" />
        <span>
          <strong>{self.name}</strong>
          {me?.best && <Stars star={me.best.star} />}
        </span>
      </button>
      <header className="hud" aria-label="보유 재화">
        <span className="hud-currency panel">
          <Icon id="coin" size={44} />
          <strong>{self.coins.toLocaleString()}</strong>
        </span>
        <span
          className="hud-currency panel"
          aria-label={`미끼 ${self.baits[self.bait]}개`}
        >
          <Icon id={self.bait} size={44} />
          <strong>{self.baits[self.bait]}</strong>
        </span>
        <button
          className="hud-bag"
          aria-label="가방 열기"
          onClick={() => setModal("bag")}
        >
          <Icon id="bag" size={46} />
        </button>
      </header>
      <div className="right-rail">
        <aside className={`ranking panel ${rankOpen ? "" : "collapsed"}`}>
          <button
            className="rank-heading"
            onClick={() => setRankOpen(!rankOpen)}
            aria-expanded={rankOpen}
          >
            <Icon id="rod_1" size={30} />
            순위
          </button>
          {rankOpen && (
            <>
              <ol>
                {state.ranking.slice(0, 5).map((r, i) => (
                  <li key={r.id} className={r.id === self.id ? "mine" : ""}>
                    <button
                      className="rank-player"
                      onClick={() => setProfile(r.id)}
                      aria-label={`${i + 1}위 ${r.name} 기록`}
                    >
                      {i < 3 ? (
                        <Icon
                          id={`crown_${["gold", "silver", "bronze"][i]}`}
                          size={32}
                        />
                      ) : (
                        <b>{i + 1}</b>
                      )}
                      <img
                        className="rank-avatar"
                        src={asset("characters", `${r.gender}_portrait`)}
                        alt=""
                      />
                      <span>
                        <strong>{r.name}</strong>
                        <Stars star={r.star} />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {!state.ranking.length && (
                <p className="rank-empty">첫 포획을 기다려요.</p>
              )}
              <div className="my-rank">
                <span>내 순위</span>
                <strong>{self.rank ? `${self.rank}위` : "미기록"}</strong>
              </div>
            </>
          )}
        </aside>
        <aside className="feed" aria-label="최근 포획">
          {state.feed.slice(0, 3).map((f) => (
            <button
              className="feed-item panel"
              key={f.id}
              onClick={() => setProfile(f.playerId)}
            >
              <FishImage id={f.fishId} />
              <span>
                <strong>{f.name}</strong>
                <span>{fishById(f.fishId).name}</span>
                <Stars star={fishById(f.fishId).star} />
              </span>
            </button>
          ))}
        </aside>
      </div>
      <Chat
        messages={state.chat}
        error={state.chatError}
        disabled={!!modal || !!profile || state.status !== "online"}
        onFocusChange={chatFocus}
      />
      <CatchAnnouncement notices={state.catchNotices} />
      <div className="bottom-controls quick-slots" aria-label="단축키 퀵슬롯">
        <button
          className="chair-button primary"
          aria-label={`${me?.motion === "seated_idle" ? "일어서기" : "앉기"} C`}
          title="앉기 / 일어서기 (C)"
          disabled={state.status !== "online" || !canAct || !!modal}
          onClick={() => connection.command({ type: "sit" })}
        >
          <img
            className="skill-icon"
            src={asset("redesign", "quick-chair_down")}
            alt=""
          />
          <span className="skill-label">
            {me?.motion === "seated_idle" ? "일어서기" : "앉기"}
          </span>
          <kbd>C</kbd>
        </button>
        <button
          className="action primary"
          aria-label={`${action.type === "shop" ? "상점" : fishing ? "낚시 중" : "낚시"} F`}
          title={action.type === "shop" ? "상점 (F)" : "낚시 (F)"}
          disabled={
            state.status !== "online" ||
            !canAct ||
            !!modal ||
            fishing ||
            (action.type !== "shop" &&
              ((!spot &&
                !FISHING_ENDS.some((p) => me && distance(p, me) <= 64)) ||
                !self.baits[self.bait]))
          }
          onClick={() => actions.current.fishing()}
        >
          <img
            className="skill-icon"
            src={asset(
              "redesign",
              action.type === "shop" ? "quick-shop" : `quick-rod_${self.rod}`,
            )}
            alt=""
          />
          <span className="skill-label">
            {action.type === "shop" ? "상점" : fishing ? "낚시 중" : "낚시"}
          </span>
          <kbd>F</kbd>
        </button>
        <button
          className="sabotage-button primary"
          aria-label="발차기 (Space)"
          aria-keyshortcuts="Space"
          title="발차기 (Space) · 횟수 제한 없음"
          disabled={fishing || !canAct || !!modal || state.status !== "online"}
          onClick={() => actions.current.kick()}
        >
          <img
            className="skill-icon"
            src={asset("redesign", "quick-charge")}
            alt=""
          />
          <span className="skill-label">발차기</span>
          <kbd>Space</kbd>
        </button>
        <button
          className="bag-button primary"
          aria-label="가방 I"
          title="가방 (I)"
          onClick={() => setModal("bag")}
        >
          <img
            className="skill-icon"
            src={asset("redesign", "quick-bag")}
            alt=""
          />
          <span className="skill-label">가방</span>
          <kbd>I</kbd>
        </button>
      </div>
      <div className="location-badge panel" role="status">
        <Icon id="target" size={25} />
        <span>
          {habitat} · 접속 {state.players.filter((p) => p.online).length}명
        </span>
      </div>
      {!loaded && (
        <div className="loading-screen panel">낚시터를 준비하고 있어요…</div>
      )}
      <MiniMap players={state.players} selfId={self.id} view={mapView} />
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
          <section
            className="profile panel"
            role="dialog"
            aria-modal="true"
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
            <header>
              <img
                src={asset(
                  "characters",
                  `${other?.gender ?? (best && "gender" in best ? best.gender : self.gender)}_portrait`,
                )}
                alt=""
              />
              <span>
                <h2>{best?.name ?? other?.name ?? "낚시꾼"}</h2>
                {best && <Stars star={best.star} />}
              </span>
            </header>
            <h3 className="profile-record">최고 기록</h3>
            {best ? (
              <>
                <FishImage id={best.fishId} />
                <Stars star={best.star} />
                <h3>{fishById(best.fishId).name}</h3>
                <p
                  className={`profile-rank ${profileRank && profileRank <= 3 ? "has-medal" : ""}`}
                >
                  {profileRank && profileRank <= 3 && (
                    <img
                      src={asset(
                        "redesign",
                        `medal_${["gold", "silver", "bronze"][profileRank - 1]}`,
                      )}
                      alt=""
                    />
                  )}
                  <span>{profileRank ? `${profileRank}위` : "20위 밖"}</span>
                </p>
              </>
            ) : (
              <p className="empty">아직 최고 기록이 없습니다.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
