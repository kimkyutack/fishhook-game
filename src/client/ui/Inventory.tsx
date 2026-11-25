import { useState } from "react";
import { BAITS, RODS } from "../../config/balance";
import { FISH, HABITAT_NAMES, fishById } from "../../shared/catalog";
import { probabilities } from "../../shared/rules";
import { fishingSpot } from "../../config/map";
import type { PrivatePlayer, PublicPlayer } from "../../shared/protocol";
import { connection } from "../network/store";
import { FishImage, Icon, Stars } from "./Art";
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
    [details, setDetails] = useState(false),
    [filter, setFilter] = useState(0);
  const inv = self.inventory;
  const sellList = inv.filter((f) => selected.has(f.id) && !f.locked),
    total = sellList.reduce((s, f) => s + fishById(f.fishId).sellPrice, 0);
  const busy = me?.castStartedAt !== undefined;
  const tabs = shop
    ? ["낚싯대", "미끼", "판매"]
    : ["물고기", "낚싯대", "미끼", "도감", "설정"];
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-label={shop ? "상점" : "가방"}
      >
        <header>
          <h2>
            <Icon id={shop ? "shop" : "bag"} />
            {shop ? "상점" : "가방"}
          </h2>
          <span className="balance">
            <Icon id="coin" />
            {self.coins.toLocaleString()}
          </span>
          <button className="icon-button" aria-label="닫기" onClick={onClose}>
            <Icon id="close" />
          </button>
        </header>
        <nav>
          {tabs.map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="modal-content">
          {tab === "낚싯대" && (
            <div className="gear-grid">
              {RODS.map((r) => (
                <article className="gear" key={r.id}>
                  <Icon id={`rod_${r.id}`} size={110} />
                  <h3>{r.name}</h3>
                  <p>1~{r.maxStar}성</p>
                  {self.rods.includes(r.id) ? (
                    <button
                      disabled={self.rod === r.id || busy}
                      onClick={() =>
                        connection.command({ type: "equip", rod: r.id })
                      }
                    >
                      {self.rod === r.id ? "장착 중" : "장착"}
                    </button>
                  ) : (
                    <button
                      disabled={
                        !shop ||
                        self.coins < r.price ||
                        (r.id === 3 && !self.rods.includes(2))
                      }
                      onClick={() =>
                        connection.command({ type: "buyRod", rod: r.id })
                      }
                    >
                      {r.price.toLocaleString()} 코인
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "미끼" && (
            <>
              <div className="quantity">
                <span>구매 수량</span>
                {[1, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuantity(n)}
                    aria-pressed={quantity === n}
                  >
                    {n}개
                  </button>
                ))}
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
                        Math.min(1000, Math.floor(Number(e.target.value) || 1)),
                      ),
                    )
                  }
                />
                <button onClick={() => setDetails(!details)}>
                  확률 {details ? "닫기" : "보기"}
                </button>
              </div>
              <div className="bait-grid">
                {BAITS.map((b) => (
                  <article className="bait" key={b.id}>
                    <Icon id={b.id} size={66} />
                    <div>
                      <h3>{b.name}</h3>
                      <p>
                        {self.baits[b.id]}개 · {b.price} 코인
                      </p>
                      {details && (
                        <p className="probabilities">
                          {
                            HABITAT_NAMES[
                              fishingSpot(me ?? { x: 0, y: 0 })?.habitat ??
                                "pond"
                            ]
                          }{" "}
                          ·{" "}
                          {probabilities(
                            self.rod,
                            b.id,
                            fishingSpot(me ?? { x: 0, y: 0 })?.habitat ??
                              "pond",
                          )
                            .map(
                              (p, i) => `${i + 1}성 ${(p * 100).toFixed(1)}%`,
                            )
                            .join(" / ")}
                        </p>
                      )}
                    </div>
                    <div className="bait-actions">
                      <button
                        disabled={
                          busy || self.bait === b.id || !self.baits[b.id]
                        }
                        onClick={() =>
                          connection.command({ type: "equip", bait: b.id })
                        }
                      >
                        {self.bait === b.id ? "장착 중" : "장착"}
                      </button>
                      {shop && (
                        <button
                          disabled={
                            self.coins < b.price * quantity ||
                            !self.rods.includes(b.requires)
                          }
                          onClick={() =>
                            connection.command({
                              type: "buyBait",
                              bait: b.id,
                              quantity,
                            })
                          }
                        >
                          {quantity}개 구매
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {shop && (
                <button
                  className="quiet"
                  onClick={() => connection.command({ type: "refill" })}
                >
                  미끼 무료 보충
                </button>
              )}
            </>
          )}
          {(tab === "물고기" || tab === "판매") && (
            <>
              <div className="collection-toolbar">
                <span>
                  보유 {self.inventoryTotals.count}마리
                  {self.inventoryTotals.count > 500
                    ? " · 최근 500마리 표시"
                    : ""}
                </span>
                {shop && (
                  <>
                    <button
                      disabled={!self.inventoryTotals.unlockedCount}
                      onClick={() => connection.command({ type: "sellAll" })}
                    >
                      잠금 제외 전체 판매 ({self.inventoryTotals.unlockedCount}
                      마리 ·{" "}
                      {self.inventoryTotals.unlockedValue.toLocaleString()}{" "}
                      코인)
                    </button>
                    <button onClick={() => setSelected(new Set())}>
                      선택 해제
                    </button>
                  </>
                )}
              </div>
              {inv.length === 0 ? (
                <div className="empty">
                  <Icon id="bobber" size={70} />
                  <p>물가에서 첫 물고기를 만나 보세요.</p>
                </div>
              ) : (
                <div className="fish-grid">
                  {inv.map((item) => {
                    const f = fishById(item.fishId);
                    return (
                      <article
                        className={`fish-card ${selected.has(item.id) ? "chosen" : ""}`}
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
                                const next = new Set(old);
                                next.has(item.id)
                                  ? next.delete(item.id)
                                  : next.add(item.id);
                                return next;
                              })
                            }
                          />
                        )}
                        <FishImage id={f.id} />
                        <h3>{f.name}</h3>
                        <Stars star={f.star} />
                        <p>{f.sellPrice} 코인</p>
                        <div className="card-actions">
                          <button
                            aria-label={item.locked ? "잠금 해제" : "보관 잠금"}
                            onClick={() =>
                              connection.command({
                                type: "lock",
                                id: item.id,
                                locked: !item.locked,
                              })
                            }
                          >
                            <Icon id="lock" size={18} />
                            {item.locked ? "잠금" : "보관"}
                          </button>
                          <button
                            onClick={() =>
                              connection.command({
                                type: "share",
                                catchId: item.catchId,
                              })
                            }
                          >
                            자랑
                          </button>
                          {shop && (
                            <button
                              disabled={!!item.locked}
                              onClick={() =>
                                connection.command({
                                  type: "sell",
                                  ids: [item.id],
                                })
                              }
                            >
                              판매
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {shop && (
                <footer className="sell-footer">
                  <span>
                    {sellList.length}마리 · {total.toLocaleString()} 코인
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
            </>
          )}
          {tab === "도감" && (
            <>
              <div className="collection-toolbar">
                <span>{self.bestiary.length} / 50종</span>
                <select
                  aria-label="별 등급 필터"
                  value={filter}
                  onChange={(e) => setFilter(Number(e.target.value))}
                >
                  <option value={0}>전체</option>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <option key={s} value={s}>
                      {s}성
                    </option>
                  ))}
                </select>
              </div>
              <div className="fish-grid">
                {FISH.filter((f) => !filter || f.star === filter).map((f) => {
                  const entry = self.bestiary.find((e) => e.fishId === f.id);
                  return (
                    <article className="fish-card" key={f.id}>
                      <FishImage id={f.id} hidden={!entry} />
                      <h3>{entry ? f.name : "???"}</h3>
                      <Stars star={f.star} />
                      <p>
                        {HABITAT_NAMES[f.habitat]}
                        {entry ? ` · ${entry.count}회` : ""}
                      </p>
                      {entry && (
                        <button
                          onClick={() =>
                            connection.command({
                              type: "share",
                              catchId: entry.catchId,
                            })
                          }
                        >
                          자랑하기
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {tab === "설정" && (
            <div className="settings">
              <h3>계정 안내</h3>
              <p>
                이 브라우저의 서버 세션으로 자동 로그인합니다. 쿠키가 삭제되거나
                만료되면 이름만으로 복구할 수 없습니다. 다른 기기에서도 같은
                이름으로 로그인할 수 없습니다.
              </p>
              <p>
                방향키 이동 · Space 행동 · C 의자 · I 가방 · Esc 닫기/낚시 취소
              </p>
              <a href="?debug=1">충돌·물가 판정 보기</a>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
