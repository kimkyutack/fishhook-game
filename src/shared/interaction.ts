import { MAP, distance, fishingSpot, lineClear, vectors } from "../config/map";
import type { PublicPlayer } from "./protocol";
import {
  KNOCKDOWN_MS,
  GET_UP_MS,
  KICK_RANGE,
  KICK_MIN_DOT,
  KICK_ANIMATION_MS,
} from "./kick";
export function motionBusy(p: PublicPlayer, now: number) {
  const duration =
    p.motion === "kick"
      ? KICK_ANIMATION_MS
      : p.motion === "run"
        ? 1050
        : p.motion === "startled" || p.motion === "fallen"
          ? KNOCKDOWN_MS
          : p.motion === "sit_down"
            ? 430
            : p.motion === "reel_in"
              ? 750
              : 0;
  return now - p.stateAt < duration;
}
export function targetFor(
  me: PublicPlayer,
  players: PublicPlayer[],
  now: number,
) {
  const facing = me.facing ?? me.direction;
  const v = facing.includes("-")
    ? {
        x: facing.endsWith("left") ? -Math.SQRT1_2 : Math.SQRT1_2,
        y: facing.startsWith("up") ? -Math.SQRT1_2 : Math.SQRT1_2,
      }
    : vectors[facing as keyof typeof vectors];
  return players
    .filter(
      (p) =>
        p.id !== me.id &&
        !(
          (p.motion === "fallen" &&
            now - p.stateAt < KNOCKDOWN_MS + GET_UP_MS) ||
          (p.motion === "startled" && now - p.stateAt < KNOCKDOWN_MS)
        ) &&
        distance(me, p) <= KICK_RANGE &&
        (distance(me, p) < 1 ||
          ((p.x - me.x) * v.x + (p.y - me.y) * v.y) / distance(me, p) >=
            KICK_MIN_DOT) &&
        lineClear(me, p),
    )
    .sort(
      (a, b) => distance(me, a) - distance(me, b) || a.id.localeCompare(b.id),
    )[0];
}
export function actionFor(
  me: PublicPlayer | undefined,
  players: PublicPlayer[],
  now: number,
) {
  if (!me) return { label: "연결 중", type: "none" };
  if (me.castStartedAt !== undefined) return { label: "낚시 중", type: "none" };
  if (motionBusy(me, now))
    return {
      label:
        me.motion === "run" || me.motion === "kick" ? "달아나는 중" : "동작 중",
      type: "none",
    };
  if (distance(me, MAP.shop) <= 96) return { label: "상점", type: "shop" };
  const t = targetFor(me, players, now);
  if (t) return { label: "발차기", type: "kick", target: t.id };
  if (fishingSpot(me)) return { label: "낚시", type: "cast" };
  return {
    label: me.motion === "seated_idle" ? "일어서기" : "앉기",
    type: "sit",
  };
}
