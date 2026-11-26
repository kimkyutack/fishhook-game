import { move, type Point } from "../../config/map";
import { BALANCE } from "../../config/balance";
type Step = { dx: number; dy: number; ms: number; seq: number };
export class MovementPrediction {
  position: Point;
  pending: Step[] = [];
  ack = -1;
  tail: Step = { dx: 0, dy: 0, ms: 0, seq: 0 };
  constructor(point: Point) {
    this.position = { ...point };
  }
  reset(point: Point) {
    this.position = { ...point };
    this.pending = [];
    this.ack = -1;
    this.tail = { dx: 0, dy: 0, ms: 0, seq: 0 };
  }
  integrate(point: Point, s: Step) {
    const n = Math.max(1, Math.hypot(s.dx, s.dy));
    return move(
      point,
      ((s.dx / n) * BALANCE.speed * s.ms) / 1000,
      ((s.dy / n) * BALANCE.speed * s.ms) / 1000,
    );
  }
  flush(send: (dx: number, dy: number, ms: number) => number) {
    if (this.tail.ms) {
      const seq = send(this.tail.dx, this.tail.dy, this.tail.ms);
      if (seq) this.pending.push({ ...this.tail, seq });
      this.tail = { ...this.tail, ms: 0 };
    }
  }
  advance(
    dx: number,
    dy: number,
    ms: number,
    send: (dx: number, dy: number, ms: number) => number,
  ) {
    if (dx !== this.tail.dx || dy !== this.tail.dy) {
      this.flush(send);
      if (!dx && !dy) send(0, 0, 0);
      this.tail = { dx, dy, ms: 0, seq: 0 };
    }
    if (dx || dy) {
      const step = { dx, dy, ms: Math.min(50, Math.max(0, ms)), seq: 0 };
      this.position = this.integrate(this.position, step);
      this.tail.ms += step.ms;
      if (this.tail.ms >= 50) this.flush(send);
    }
    return this.position;
  }
  reconcile(point: Point, ack: number) {
    if (ack < this.ack) return this.position;
    this.ack = ack;
    this.pending = this.pending.filter((s) => s.seq > ack);
    let next = { ...point };
    for (const s of this.pending) next = this.integrate(next, s);
    if (this.tail.ms) next = this.integrate(next, this.tail);
    this.position = next;
    return next;
  }
}
