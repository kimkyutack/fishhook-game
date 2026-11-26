import { useState } from "react";
import type { PublicPlayer } from "../../shared/protocol";
import { MAP } from "../../config/map";
import { mapPosition, mapViewport, type MapView } from "../game/minimap";
import { asset } from "./Art";
import type { Facing } from "../../shared/movement";
const headingNames: Record<Facing, string> = {
  up: "상단",
  down: "하단",
  left: "좌측",
  right: "우측",
  "up-left": "좌상단",
  "up-right": "우상단",
  "down-left": "좌하단",
  "down-right": "우하단",
};
export function MiniMap({
  players,
  selfId,
  view,
}: {
  players: PublicPlayer[];
  selfId: string;
  view: MapView | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`minimap panel ${collapsed ? "is-collapsed" : ""}`}
      aria-label="미니맵"
    >
      <button
        className="minimap-toggle"
        aria-label={collapsed ? "미니맵 펼치기" : "미니맵 접기"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        미니맵
      </button>
      {!collapsed && (
        <div className="minimap-map">
          <img
            className="minimap-terrain"
            src={`${import.meta.env.VITE_ASSET_BASE || "/assets"}/redesign/fishing-ground.webp`}
            alt="낚시터 전체 지도"
            draggable={false}
          />
          {view && (
            <span
              className="minimap-viewport"
              style={mapViewport(view)}
              aria-label="현재 화면 영역"
            />
          )}
          <img
            className="minimap-shop"
            src={asset("equipment", "shop")}
            style={mapPosition(MAP.shop.x, MAP.shop.y)}
            alt="상점 위치"
            title="상점"
          />
          {players
            .filter((p) => p.online || p.castStartedAt !== undefined)
            .map((p) => {
              const mine = p.id === selfId,
                position =
                  mine && view ? { x: view.playerX, y: view.playerY } : p;
              return (
                <span
                  key={p.id}
                  role="img"
                  aria-label={`${mine ? "내 위치" : "플레이어 위치"}, ${p.name}, ${headingNames[p.facing ?? p.direction]}`}
                  title={`${p.name}${mine ? " (나)" : ""} · ${headingNames[p.facing ?? p.direction]}`}
                  data-facing={p.facing ?? p.direction}
                  className={`minimap-player ${mine ? "is-me" : ""} ${p.online ? "" : "is-offline"}`}
                  style={mapPosition(position.x, position.y)}
                >
                  <img
                    src={asset("characters", `${p.gender}_portrait`)}
                    alt=""
                  />
                  {p.castStartedAt !== undefined && (
                    <img
                      className="minimap-fishing"
                      src={asset("equipment", "bobber")}
                      alt="낚시 중"
                    />
                  )}
                </span>
              );
            })}
        </div>
      )}
    </aside>
  );
}
