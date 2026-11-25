import { MAP, distance, fishingSpot, lineClear, vectors } from "../config/map";
import type { PublicPlayer } from "./protocol";
export function motionBusy(p: PublicPlayer, now: number) {
  const duration =
    p.motion === "run" || p.motion === "kick"
      ? 1050
      : p.motion === "startled"
        ? 650
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
  const v = vectors[me.direction];
  return players
    .filter(
      (p) =>
        p.id !== me.id &&
        p.castStartedAt !== undefined &&
        now - p.castStartedAt >= 1000 &&
        p.protectedUntil <= now &&
        distance(me, p) <= 96 &&
        distance(me, p) > 1 &&
        ((p.x - me.x) * v.x + (p.y - me.y) * v.y) / distance(me, p) > 0.45 &&
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
  if (t) return { label: "방해", type: "sabotage", target: t.id };
  if (fishingSpot(me)) return { label: "낚시", type: "cast" };
  return {
    label: me.motion === "seated_idle" ? "일어서기" : "앉기",
    type: "sit",
  };
}
