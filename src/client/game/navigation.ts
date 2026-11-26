import type { Point } from "../../config/map";

// Pointer routes may run at any angle, unlike the eight keyboard directions.
// Round only the selected heading, preserving sub-degree route angles.
export function routeInput(position: Point, next: Point) {
  const dx = next.x - position.x,
    dy = next.y - position.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return { dx: 0, dy: 0 };
  return {
    dx: Math.round((dx / length) * 1000) / 1000,
    dy: Math.round((dy / length) * 1000) / 1000,
  };
}

export class RouteSteering {
  private target: Point | undefined;
  private input = { dx: 0, dy: 0 };
  reset() {
    this.target = undefined;
  }
  toward(position: Point, next: Point) {
    // One stable heading per leg keeps the existing movement packet batching.
    if (next !== this.target) {
      this.target = next;
      this.input = routeInput(position, next);
    }
    return this.input;
  }
}

// A diagonal chord is normally released as two separate DOM events.
// Pause briefly between releases instead of inserting an unintended axial step.
export class KeyboardSteering {
  private releaseUntil = 0;
  released(wasDiagonal: boolean, now: number) {
    if (wasDiagonal) this.releaseUntil = now + 50;
  }
  input(keys: Set<string>, now: number) {
    const dx = Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft"));
    const dy = Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp"));
    if (now < this.releaseUntil && !(dx && dy)) return { dx: 0, dy: 0 };
    return { dx, dy };
  }
  reset() {
    this.releaseUntil = 0;
  }
}
