import { useState } from "react";
import { BAITS, RODS } from "../../config/balance";
import { FISH, HABITAT_NAMES, fishById } from "../../shared/catalog";
import { probabilities } from "../../shared/rules";
import { fishingSpot } from "../../config/map";
import type { PrivatePlayer, PublicPlayer } from "../../shared/protocol";
import { connection } from "../network/store";
import { FishImage, Icon, Stars, asset, characterPortrait } from "./Art";
import { COSTUMES } from "../../shared/costumes";
import "./Inventory.css";
export function Inventory({
  self,
  me,
  shop = false,
  onClose,
}: {
  self: PrivatePlayer;
  me?: PublicPlayer;
  shop?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(shop ? "낚싯대" : "물고기"),
    [quantity, setQuantity] = useState(10),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [activeId, setActiveId] = useState<string | null>(null),
    [filter, setFilter] = useState(0),
    [bookPage, setBookPage] = useState(0),
    [details, setDetails] = useState(false);
  const tabs = shop
    ? ["낚싯대", "미끼", "외형", "판매"]
    : ["물고기", "낚싯대", "미끼", "외형", "도감", "설정"];
  const tabIcons: Record<string, string> = {
    물고기: "fish_001",
    낚싯대: "rod_1",
    미끼: "worm",
    도감: "book",
    설정: "settings",
    판매: "coin",
  };
  const inv = self.inventory,
    chosen = inv.find((f) => f.id === activeId) ?? inv[0],
    busy = me?.castStartedAt !== undefined;
  const sellList = inv.filter((f) => selected.has(f.id) && !f.locked),
    total = sellList.reduce((v, f) => v + fishById(f.fishId).sellPrice, 0);
  const habitat = fishingSpot(me ?? { x: 0, y: 0 })?.habitat ?? "lake";
  const odds = probabilities(self.rod, self.bait, habitat);
  const equip = (bait: typeof self.bait) =>
    connection.command({ type: "equip", bait });
  const lock = (id: string, locked: boolean) =>
    connection.command({ type: "lock", id, locked });
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <section
        className={`pocket-dialog ${shop ? "pocket-shop" : "pocket-bag"}`}
        data-view={tab}
        role="dialog"
        aria-modal="true"
        aria-label={shop ? "상점" : "가방"}
      >
        <header className="modal-header">
          <h2>
            <img
              className="modal-emblem"
              src={asset("redesign", shop ? "pocket-store" : "pocket-icon-bag")}
              alt=""
            />
            {shop ? "상점" : "가방"}
          </h2>
          <span className="balance">
            <Icon id="coin" size={36} />
            {self.coins.toLocaleString()}
          </span>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <Icon id="close" size={36} />
          </button>
        </header>
        <nav
          className="pocket-categories"
          aria-label={shop ? "상점 분류" : "가방 분류"}
        >
          {tabs.map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              <img
                className="icon"
                src={
                  t === "외형"
                    ? characterPortrait(self.gender, "duck")
                    : asset(
                        "redesign",
                        t === "물고기"
                          ? "pocket-fish-icon"
                          : t === "판매"
                            ? "pocket-coins"
                            : t === "미끼"
                              ? "pocket-worm"
                              : t === "설정"
                                ? "pocket-settings"
                                : `pocket-icon-${tabIcons[t]}`,
                      )
                }
                alt=""
              />
              <span>{t}</span>
            </button>
          ))}
        </nav>
        <div className={`modal-content tab-${tab}`}>
          {tab === "외형" && (
            <div className="costume-grid">
              {COSTUMES.filter((c) =>
                shop ? c.id !== "default" : self.costumes.includes(c.id),
              ).map((c) => {
                const owned = self.costumes.includes(c.id),
                  equipped = self.costume === c.id;
                return (
                  <article
                    className={`costume-card ${equipped ? "pocket-equipped" : ""}`}
                    key={c.id}
                  >
                    <img
                      className="costume-preview"
                      src={characterPortrait(self.gender, c.id)}
                      alt={`${c.name} ${self.gender === "male" ? "남자" : "여자"} 외형`}
                    />
                    <h3>{c.name}</h3>
                    <div className="costume-price">
                      {!owned && (
                        <>
                          <Icon id="coin" />
                          {c.price.toLocaleString()}
                        </>
                      )}
                    </div>
                    <button
                      className="primary"
                      disabled={
                        equipped ||
                        (owned ? busy : !shop || self.coins < c.price)
                      }
                      onClick={() =>
                        owned
                          ? connection.command({
                              type: "equipCostume",
                              costume: c.id,
                            })
                          : c.id !== "default" &&
                            connection.command({
                              type: "buyCostume",
                              costume: c.id,
                            })
                      }
                    >
                      {equipped
                        ? "장착 중"
                        : owned
                          ? "장착"
                          : shop
                            ? "구매"
                            : "미보유"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
          {tab === "낚싯대" && (
            <div className="gear-grid">
              {RODS.map((r) => {
                const owned = self.rods.includes(r.id),
                  equipped = self.rod === r.id,
                  requires = r.id === 3 && !self.rods.includes(2);
                return (
                  <article
                    className={`gear ${equipped ? "pocket-equipped" : ""}`}
                    key={r.id}
                  >
                    <Icon id={`rod_${r.id}`} size={230} />
                    <h3>{r.name}</h3>
                    <p className="gear-cap">
                      <Icon id="star" size={24} />
                      1~{r.maxStar}성
                    </p>
                    <div className="gear-purchase">
                      {shop && !owned && (
                        <span className="price">
                          <Icon id="coin" />
                          {r.price.toLocaleString()} 코인
                        </span>
                      )}
                      <button
                        className={owned && equipped ? "" : "primary"}
                        disabled={
                          owned
                            ? equipped || busy
                            : !shop || requires || self.coins < r.price
                        }
                        onClick={() =>
                          owned
                            ? connection.command({ type: "equip", rod: r.id })
                            : connection.command({ type: "buyRod", rod: r.id })
                        }
                      >
                        {owned
                          ? equipped
                            ? "장착 중"
                            : "장착"
                          : !shop
                            ? "미보유"
                            : requires
                              ? "숙련 낚싯대 필요"
                              : "구매"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {tab === "미끼" && (
            <>
              <p
                className="daily-bait-notice"
                style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 10px" }}
              >
                매일 오전 9시(한국시간)에 지렁이 20개가 추가돼요. 접속하지 않은
                날도 누적됩니다.
              </p>
              {shop && (
                <div className="quantity">
                  <span>구매 수량</span>
                  <button
                    aria-label="수량 줄이기"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    aria-label="구매 수량"
                    min={1}
                    max={1000}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(
                        Math.max(
                          1,
                          Math.min(
                            1000,
                            Math.floor(Number(e.target.value) || 1),
                          ),
                        ),
                      )
                    }
                  />
                  <button
                    aria-label="수량 늘리기"
                    onClick={() => setQuantity(Math.min(1000, quantity + 1))}
                  >
                    +
                  </button>
                  <button onClick={() => setQuantity(10)}>10개</button>
                </div>
              )}
              <div className={shop ? "bait-shop-list" : "bait-grid"}>
                {BAITS.map((b) => (
                  <article
                    className={`bait ${self.bait === b.id ? "pocket-equipped" : ""}`}
                    key={b.id}
                  >
                    <Icon id={b.id} size={shop ? 110 : 170} />
                    <div className="bait-description">
                      <h3>{b.name}</h3>
                      <p>
                        {shop ? (
                          <>
                            <Icon id="coin" size={25} />
                            {b.price} 코인
                          </>
                        ) : (
                          <>수량 {self.baits[b.id]}</>
                        )}
                      </p>
                    </div>
                    <div className="bait-actions">
                      {shop ? (
                        <>
                          {self.rods.includes(b.requires) ? (
                            <>
                              <span className="price">
                                {(b.price * quantity).toLocaleString()} 코인
                              </span>
                              <button
                                className="primary"
                                disabled={self.coins < b.price * quantity}
                                onClick={() =>
                                  connection.command({
                                    type: "buyBait",
                                    bait: b.id,
                                    quantity,
                                  })
                                }
                              >
                                구매
                              </button>
                            </>
                          ) : (
                            <span className="bait-requirement">
                              <Icon id="lock" />
                              {b.requires === 2 ? "숙련" : "명인"} 낚싯대 필요
                            </span>
                          )}
                        </>
                      ) : (
                        <button
                          className={self.bait === b.id ? "" : "primary"}
                          disabled={
                            busy || self.bait === b.id || !self.baits[b.id]
                          }
                          onClick={() => equip(b.id)}
                        >
                          {self.bait === b.id
                            ? "장착 중"
                            : self.baits[b.id]
                              ? "장착"
                              : "미보유"}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!shop ? (
                <section className="probability-summary">
                  <div>
                    <Icon id={`rod_${self.rod}`} size={45} />
                    <span>
                      {RODS[self.rod - 1].name} · 1~{RODS[self.rod - 1].maxStar}
                      성
                    </span>
                  </div>
                  <div className="probability-values">
                    <header>
                      <span>현재 낚시터 확률</span>
                      <button onClick={() => setDetails(!details)}>
                        {details ? "상세 닫기" : "확률 상세"}
                      </button>
                    </header>
                    <div>
                      {odds.map((v, i) => (
                        <span className={!v ? "unavailable" : ""} key={i}>
                          <Stars star={i + 1} />
                          <span>
                            {i + 1}성 {(v * 100).toFixed(1)}%
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {details && (
                    <p>
                      {HABITAT_NAMES[habitat]} ·{" "}
                      {BAITS.find((b) => b.id === self.bait)?.name}
                    </p>
                  )}
                </section>
              ) : self.coins < 3 &&
                self.inventoryTotals.count === 0 &&
                Object.values(self.baits).every((n) => n === 0) ? (
                <button
                  className="quiet refill"
                  onClick={() => connection.command({ type: "refill" })}
                >
                  미끼 무료 보충
                </button>
              ) : null}
            </>
          )}
          {(tab === "물고기" || tab === "판매") && (
            <>
              <div
                className={`collection-toolbar ${shop ? "" : "inventory-count"}`}
              >
                <span>
                  보유 {self.inventoryTotals.count}마리
                  {self.inventoryTotals.count > 500
                    ? " · 최근 500마리 표시"
                    : ""}
                </span>
                {shop && (
                  <button
                    className="sell-all"
                    disabled={!self.inventoryTotals.unlockedCount}
                    onClick={() => connection.command({ type: "sellAll" })}
                  >
                    잠금 제외 모두 판매
                  </button>
                )}
              </div>
              {!inv.length ? (
                <div className="empty">
                  <Icon id="bobber" size={90} />
                  <p>물가에서 첫 물고기를 만나 보세요.</p>
                </div>
              ) : (
                <div className={`fish-collection ${shop ? "" : "has-detail"}`}>
                  <div className="fish-tray">
                    <div className="fish-grid">
                      {inv.map((item) => {
                        const f = fishById(item.fishId);
                        return (
                          <article
                            className={`fish-card ${!shop && chosen?.id === item.id ? "chosen" : ""} ${item.locked ? "locked" : ""}`}
                            key={item.id}
                          >
                            {shop && (
                              <input
                                type="checkbox"
                                aria-label={`${f.name} 판매 선택`}
                                disabled={!!item.locked}
                                checked={selected.has(item.id)}
                                onChange={() =>
                                  setSelected((old) => {
                                    const n = new Set(old);
                                    n.has(item.id)
                                      ? n.delete(item.id)
                                      : n.add(item.id);
                                    return n;
                                  })
                                }
                              />
                            )}
                            {!!item.locked && (
                              <span className="fish-lock">
                                <Icon id="lock" size={25} />
                              </span>
                            )}
                            <button
                              className="fish-select"
                              aria-label={`${f.name} 선택`}
                              onClick={() => setActiveId(item.id)}
                            >
                              <FishImage id={f.id} />
                            </button>
                            <Stars star={f.star} />
                            <h3
                              className={f.name.length > 6 ? "long-name" : ""}
                            >
                              {f.name}
                            </h3>
                            <p className="price">
                              <Icon id="coin" size={24} />
                              {f.sellPrice.toLocaleString()}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                  {!shop && chosen && (
                    <aside className="fish-detail" aria-label="선택한 물고기">
                      <FishImage id={chosen.fishId} />
                      <h3>{fishById(chosen.fishId).name}</h3>
                      <Stars star={fishById(chosen.fishId).star} />
                      <p className="price">
                        <Icon id="coin" />
                        {fishById(chosen.fishId).sellPrice.toLocaleString()}
                      </p>
                    </aside>
                  )}
                </div>
              )}
            </>
          )}
          {tab === "도감" && (
            <>
              <div className="collection-toolbar">
                <strong>발견 {self.bestiary.length} / 50종</strong>
                <progress
                  max={50}
                  value={self.bestiary.length}
                  aria-label="물고기 도감 수집"
                />
                <select
                  aria-label="별 등급 필터"
                  value={filter}
                  onChange={(e) => {
                    setFilter(Number(e.target.value));
                    setBookPage(0);
                  }}
                >
                  <option value={0}>전체</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}성
                    </option>
                  ))}
                </select>
              </div>
              <div className="fish-grid bestiary-grid">
                {FISH.filter((f) => !filter || f.star === filter)
                  .slice(bookPage * 10, bookPage * 10 + 10)
                  .map((f) => {
                    const entry = self.bestiary.find((e) => e.fishId === f.id);
                    return (
                      <article className="fish-card" key={f.id}>
                        <FishImage id={f.id} hidden={!entry} />
                        <Stars star={f.star} />
                        <h3 className={f.name.length > 6 ? "long-name" : ""}>
                          {entry ? f.name : "???"}
                        </h3>
                        <p>
                          {HABITAT_NAMES[f.habitat]} ·{" "}
                          {entry ? `${entry.count}회` : "0회"}
                        </p>
                        {entry && (
                          <button
                            className="collection-share"
                            onClick={() =>
                              connection.command({
                                type: "share",
                                catchId: entry.catchId,
                              })
                            }
                          >
                            자랑
                          </button>
                        )}
                      </article>
                    );
                  })}
              </div>
              <nav className="book-pages" aria-label="도감 페이지">
                <button
                  aria-label="도감 이전 페이지"
                  disabled={bookPage === 0}
                  onClick={() => setBookPage(bookPage - 1)}
                >
                  ‹
                </button>
                <span>
                  {bookPage + 1} / {filter ? 1 : 5}
                </span>
                <button
                  aria-label="도감 다음 페이지"
                  disabled={bookPage >= (filter ? 0 : 4)}
                  onClick={() => setBookPage(bookPage + 1)}
                >
                  ›
                </button>
              </nav>
            </>
          )}
          {tab === "설정" && (
            <div className="settings">
              <section>
                <h3>계정</h3>
                <div className="account-summary">
                  <img
                    src={characterPortrait(self.gender, self.costume)}
                    alt=""
                  />
                  <div>
                    <strong>{self.name}</strong>
                    <span>자동 로그인</span>
                  </div>
                  <p>
                    이 브라우저의 서버 세션으로 접속 중입니다.
                    <br />
                    쿠키가 삭제되면 같은 이름으로 복구할 수 없습니다.
                  </p>
                </div>
              </section>
              <section>
                <h3>조작</h3>
                <div className="keyboard-guide">
                  {[
                    ["방향키", "이동"],
                    ["Space", "발차기"],
                    ["F", "낚시 / 상점"],
                    ["C", "앉기"],
                    ["I", "가방"],
                    ["Esc", "닫기 / 낚시 취소"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <div className="key-visual">
                        {key === "방향키" ? (
                          <span className="arrow-keys">
                            {["↑", "←", "↓", "→"].map((k) => (
                              <kbd key={k}>{k}</kbd>
                            ))}
                          </span>
                        ) : (
                          <>
                            {key === "C" && <Icon id="chair_down" size={68} />}
                            {key === "I" && <Icon id="bag" size={64} />}
                            {key === "Esc" && <Icon id="bobber" size={50} />}
                            <kbd>{key}</kbd>
                          </>
                        )}
                      </div>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
        {tab === "물고기" && chosen && (
          <footer className="inventory-footer">
            <span>선택 1마리</span>
            <button
              className="primary"
              onClick={() => lock(chosen.id, !chosen.locked)}
            >
              <img
                className="icon"
                src={asset("redesign", "pocket-lock")}
                alt=""
              />
              {chosen.locked ? "잠금 해제" : "보관 잠금"}
            </button>
            <button
              className="primary coral"
              onClick={() =>
                connection.command({ type: "share", catchId: chosen.catchId })
              }
            >
              <img
                className="icon"
                src={asset("redesign", "pocket-speaker")}
                alt=""
              />
              자랑
            </button>
          </footer>
        )}
        {tab === "판매" && (
          <footer className="inventory-footer sell-footer">
            <span>
              선택 {sellList.length}마리 · {total.toLocaleString()} 코인
            </span>
            <button
              className="primary"
              disabled={!sellList.length}
              onClick={() => {
                for (let i = 0; i < sellList.length; i += 150)
                  connection.command({
                    type: "sell",
                    ids: sellList.slice(i, i + 150).map((f) => f.id),
                  });
                setSelected(new Set());
              }}
            >
              선택 판매
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
